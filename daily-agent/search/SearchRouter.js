import {createHash} from 'node:crypto';
import {ApiProvider,PROVIDERS,LABELS,UNITS,SearchError,monthPeriod} from './Providers.js';
import {SearchCredentials} from './CredentialStore.js';
import {RotationStore,validateSettings} from './RotationStore.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const permanent=new Set(['auth','key_budget','paid_plan']);
export class SearchRouter {
  constructor({dir,credentials=new SearchCredentials(dir),store=new RotationStore(dir),providers,reader=null,now=Date.now,bus,legacyKeys={}}){
    Object.assign(this,{credentials,store,reader,now,bus,legacyKeys});
    this.providers=providers||Object.fromEntries(PROVIDERS.map(id=>[id,new ApiProvider(id,{now})]));
    this.pending=new Map();this.controllers=new Set();this.closed=false;this.active=0;this.generation=0;
  }
  keys(){
    // DPAPI decryption is relatively slow; invalidate the cache when another process saves keys.
    const version=this.credentials.file?this.credentials.version?.():null;
    if(!this.cachedKeys||!this.credentials.file||version!==this.keyVersion){this.cachedKeys={...this.legacyKeys,...this.credentials.load()};this.keyVersion=version;}
    return {...this.cachedKeys};
  }
  status(){
    const settings=this.store.settings(),keys=this.keys();
    const providers=settings.order.map(id=>{const s=this.store.get(id),p=settings.providers[id];
      const reason=!settings.enabled||!p.enabled?'disabled':!keys[id]?'missing_key':s.reason&&!permanent.has(s.reason)&&s.disabledUntil&&s.disabledUntil<=this.now()?'retry_ready':s.reason;
      return {id,name:LABELS[id],enabled:p.enabled,hasKey:!!keys[id],cap:p.cap,unit:id==='exa'?'USD':'credits',
        reservedUsage:s.used,requests:s.requests,reason:reason||'ready',disabledUntil:s.disabledUntil||null,
        periodStart:s.start,periodEnd:s.end,officialRemaining:s.official?.remaining??null,officialCheckedAt:s.official?.checkedAt??null,
        accounting:'本機保守估算（失敗請求也保留）；官方餘額為查詢快照，不含其他程式之後的用量。'};});
    return {provider:'rotation',configured:settings.enabled&&providers.some(p=>p.enabled&&p.hasKey),settings,providers,
      state:!settings.enabled?'disabled':providers.some(p=>p.enabled&&p.hasKey)?'configured':'not_configured'};
  }
  configure(data){
    if(!data||typeof data!=='object'||(data.clearKeys!==undefined&&(!Array.isArray(data.clearKeys)||data.clearKeys.some(id=>!PROVIDERS.includes(id))))||
      (data.keys!==undefined&&(!data.keys||typeof data.keys!=='object'||Array.isArray(data.keys)||Object.keys(data.keys).some(id=>!PROVIDERS.includes(id)))))throw Error('搜尋設定格式不正確。');
    if(this.active||this.pending.size)throw Error('搜尋或用量查詢中，請稍後再儲存。');
    const owner=this.store.lock('engine');if(!owner)throw Error('另一個搜尋用戶正在使用設定，請稍後再儲存。');
    try{
      const settings=validateSettings(data.settings),keys=this.keys();
      for(const id of PROVIDERS){const value=data.keys?.[id];
        if(value!==undefined&&typeof value!=='string')throw Error('金鑰格式不正確。');
        if(data.clearKeys?.includes(id))keys[id]='';
        if(value?.trim()){if(!/^[\x21-\x7e]{10,512}$/.test(value.trim()))throw Error('金鑰需為 10–512 個非空白英文字元。');keys[id]=value.trim();}}
      this.credentials.save(keys);this.cachedKeys=null;this.store.saveSettings(settings);
      // A key change clears auth failures, never resets accounted usage or exhaustion.
      for(const id of PROVIDERS){const s=this.store.get(id),fingerprint=hash(keys[id]||'');
        if(s.keyFingerprint!==fingerprint){s.keyFingerprint=fingerprint;s.official=null;if(['auth','key_budget','paid_plan'].includes(s.reason)){s.reason=null;s.disabledUntil=0;}this.store.put(id,s);}}
      this.store.db.exec('DELETE FROM cache');return this.status();
    }finally{this.store.unlock('engine',owner);}
  }
  async locked(work,deadline){
    let owner;
    while(!this.closed&&Date.now()<deadline){owner=this.store.lock('engine');if(owner)break;await sleep(25);}
    if(!owner)throw new SearchError('timeout');
    this.active++;
    try{return await work();}finally{this.active--;this.store.unlock('engine',owner);}
  }
  async refresh(id,key,deadline,{manual=false}={}){
    let s=this.store.get(id);
    if(this.closed)throw new SearchError('timeout');
    if(id==='exa'){
      if(this.now()>=s.end&&!permanent.has(s.reason))s={...s,...monthPeriod(this.now()),used:0,requests:0,reason:null,disabledUntil:0,official:null};
      this.store.put(id,s);return s;
    }
    if(!manual&&s.official&&this.now()<s.end&&this.now()-s.official.checkedAt<60000)return s;
    const controller=new AbortController();this.controllers.add(controller);
    let official;
    try{official=await this.providers[id].usage(key,{timeoutMs:Math.max(1,Math.min(4000,deadline-Date.now())),signal:controller.signal});}
    finally{this.controllers.delete(controller);}
    if(!official||!Number.isFinite(official.remaining)||!Number.isFinite(official.start)||!(official.end>this.now()))throw new SearchError('invalid');
    const newPeriod=s.periodVerified&&this.now()>=s.end&&official.start>=s.end;
    if(newPeriod)s={...s,used:0,requests:0,reason:null,disabledUntil:0};
    // Different keys/accounts or an initial billing-cycle discovery never erase local usage.
    s.start=official.start;s.end=official.end;s.periodVerified=true;
    // A refresh cannot erase in-process charges made after a snapshot; engine lease serializes all calls.
    s.official={remaining:Math.max(0,official.remaining),checkedAt:this.now()};
    if(['auth','paid_plan','quota'].includes(s.reason)&&official.remaining>=UNITS[id]){s.reason=null;s.disabledUntil=0;}
    this.store.put(id,s);return s;
  }
  fail(id,error){
    const s=this.store.get(id),code=error instanceof SearchError?error.code:'unavailable';
    s.reason=code;
    s.disabledUntil=permanent.has(code)?null:code==='quota'?Math.max(s.end,this.now()+60000):this.now()+(code==='rate_limit'?error.retryMs:this.store.settings().cooldownMs);
    this.store.put(id,s);
  }
  async refreshUsage(id){
    if(!PROVIDERS.includes(id))throw Error('未知搜尋供應商。');
    const deadline=Date.now()+10000;
    return this.locked(async()=>{
      const key=this.keys()[id];if(!key)throw Error('請先填入金鑰。');
      if(id==='exa')return {supported:false,message:'Exa 一般金鑰沒有官方餘額接口。請在 Exa 後台檢查金鑰預算；本機不會解除 402 停用狀態。',status:this.status()};
      try{await this.refresh(id,key,deadline,{manual:true});return {supported:true,status:this.status()};}
      catch(e){this.fail(id,e);throw new SearchError(e instanceof SearchError?e.code:'unavailable');}
    },deadline);
  }
  async resumeExa(confirmed){
    if(confirmed!==true)throw Error('請先確認 Exa 後台的金鑰預算與自動付費設定。');
    return this.locked(async()=>{const s=this.store.get('exa');
      if(s.reason==='key_budget'){s.reason=null;s.disabledUntil=0;this.store.put('exa',s);}
      return this.status(); // Never erases usage, raises the cap or issues a paid probe.
    },Date.now()+10000);
  }
  async search(query,{limit=3,signal}={}){
    if(typeof query!=='string'||!query.trim()||query.length>500||!Number.isInteger(limit)||limit<1||limit>10)throw Error('搜尋字串需為 1–500 字元；結果數為 1–10。');
    signal?.throwIfAborted();if(this.closed)throw Error('搜尋服務已停止。');query=query.trim();
    const status=this.status();if(!status.configured)throw Object.assign(Error('搜尋尚未設定，請開啟「搜尋 API 與輪替」填入至少一組金鑰。'),{code:'SEARCH_NOT_CONFIGURED'});
    const key=hash(JSON.stringify([query.normalize('NFKC').toLowerCase(),limit]));
    if(this.pending.has(key))return structuredClone(await this.pending.get(key));
    const deadline=Date.now()+status.settings.timeoutMs,generation=this.generation;
    const task=this.locked(async()=>{
      const cached=this.store.cached(key);if(cached)return {...cached,query,cache_hit:true};
      const settings=this.store.settings(),keys=this.keys(),attempts=[];
      for(const id of settings.order){
        signal?.throwIfAborted();if(this.closed||generation!==this.generation||Date.now()>=deadline)break;
        if(!settings.enabled||!settings.providers[id].enabled||!keys[id])continue;
        let s=this.store.get(id);
        if(permanent.has(s.reason)||(s.disabledUntil&&s.disabledUntil>this.now()))continue;
        try{
          const fingerprint=hash(keys[id]);
          if(s.keyFingerprint!==fingerprint){s.keyFingerprint=fingerprint;s.official=null;this.store.put(id,s);}
          s=await this.refresh(id,keys[id],deadline);
          signal?.throwIfAborted();if(this.closed||generation!==this.generation||Date.now()>=deadline)break;
          if(s.used+UNITS[id]>settings.providers[id].cap+1e-9||s.official?.remaining<UNITS[id]){
            s.reason='quota';s.disabledUntil=s.end;this.store.put(id,s);continue;
          }
          this.store.reserve(id,settings.providers[id].cap);
          const controller=new AbortController();this.controllers.add(controller);
          let result;
          try{result=await this.providers[id].search(query,keys[id],{limit,signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal,timeoutMs:Math.max(1,Math.min(6000,deadline-Date.now()))});}
          finally{this.controllers.delete(controller);}
          if(this.closed||generation!==this.generation)throw new DOMException('搜尋已取消','AbortError');
          this.store.account(id,result.usage?.units||UNITS[id]);s=this.store.get(id);s.reason=null;s.disabledUntil=0;this.store.put(id,s);
          if(this.reader&&result.results?.length&&Date.now()<deadline){
            const readController=new AbortController();this.controllers.add(readController);
            try{result.results=await Promise.all(result.results.map(async row=>{
              try{const page=await this.reader.read(row.url,{signal:signal?AbortSignal.any([signal,readController.signal]):readController.signal,timeoutMs:Math.min(4000,deadline-Date.now())});
                return {...row,body:page.body,coverage:page.coverage,retrieved_at:page.retrieved_at,read_url:page.url};}
              catch{return {...row,read_failed:true};}
            }));}finally{this.controllers.delete(readController);}
          }
          signal?.throwIfAborted();result={...result,attempts,cache_hit:false};
          const ttl=/新聞|news/i.test(query)?60000:/最新|今天|今日|價格|latest|today|price/i.test(query)?120000:900000;
          this.store.cache(key,result,ttl);this.bus?.publish('search',{provider:LABELS[id]});return result;
        }catch(error){if(signal?.aborted)throw signal.reason;if(this.closed||generation!==this.generation)throw new DOMException('搜尋已取消','AbortError');this.fail(id,error);attempts.push({provider:id,reason:error instanceof SearchError?error.code:'unavailable'});}
      }
      throw Object.assign(Error('三家搜尋目前皆未就緒、冷卻中或額度不足。請在搜尋設定查看狀態；聊天仍可使用。'),{code:'SEARCH_UNAVAILABLE'});
    },deadline);
    this.pending.set(key,task);
    try{return structuredClone(await task);}finally{this.pending.delete(key);}
  }
  async cancel(){this.generation++;for(const c of this.controllers)c.abort();await Promise.allSettled([...this.pending.values()]);}
  async close(){
    if(this.closing)return this.closing;
    this.closed=true;this.generation++;for(const c of this.controllers)c.abort();
    this.closing=(async()=>{await Promise.allSettled([...this.pending.values()]);while(this.active)await sleep(10);this.store.close();})();
    return this.closing;
  }
}
