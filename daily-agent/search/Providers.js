// Fixed endpoints and explicit low-cost search options. Never return upstream error bodies.
export const PROVIDERS = ['exa', 'tavily', 'firecrawl'];
export const LABELS = {exa:'Exa Auto',tavily:'Tavily Basic',firecrawl:'Firecrawl Search'};
export const UNITS = {exa:0.007,tavily:1,firecrawl:2};
export class SearchError extends Error {
  constructor(code, retryMs=60000) {
    super({auth:'金鑰無效或權限不足',key_budget:'金鑰預算不足，請到供應商確認',quota:'搜尋額度不足',rate_limit:'暫時頻率限制',timeout:'搜尋服務逾時',unavailable:'搜尋服務暫時不可用',invalid:'搜尋回應格式不正確',paid_plan:'請使用免費方案並關閉自動付費'}[code] || '搜尋失敗');
    this.code=code;this.retryMs=retryMs;
  }
}
export function monthPeriod(now) {
  const d=new Date(now);
  return {start:Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),end:Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)};
}
export function normalizeResults(rows,limit,now) {
  const seen=new Set();
  return (Array.isArray(rows)?rows:[]).flatMap(r=>{
    try {
      const url=new URL(r.url);
      if(!['https:','http:'].includes(url.protocol)||url.username||url.password||seen.has(url.href))return [];
      seen.add(url.href);
      const body=String(r.content||r.description||r.text||r.summary||(Array.isArray(r.highlights)?r.highlights.join('\n'):'')).slice(0,12000);
      const date=String(r.publishedDate||r.published_date||'');
      return [{title:String(r.title||url.hostname).slice(0,500),url:url.href,source:url.hostname,
        body,coverage:body?'search-excerpt':'headline-only',date:date&&Number.isFinite(Date.parse(date))?date:null,retrieved_at:new Date(now).toISOString()}];
    }catch{return [];}
  }).slice(0,limit);
}
export class ApiProvider {
  constructor(id,{fetcher=fetch,now=Date.now}={}){if(!PROVIDERS.includes(id))throw Error('未知搜尋供應商');Object.assign(this,{id,fetcher,now});}
  async request(key,route,body,{timeoutMs=6000,signal}={}) {
    const base={exa:'https://api.exa.ai',tavily:'https://api.tavily.com',firecrawl:'https://api.firecrawl.dev'}[this.id];
    const controller=new AbortController();
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    let timer;
    // Deadline covers headers AND response body, including fetch implementations that ignore AbortSignal.
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort();reject(new SearchError('timeout'));},Math.max(1,timeoutMs));});
    try {
      return await Promise.race([timeout,(async()=>{
        let response;
        try{response=await this.fetcher(base+route,{method:body===undefined?'GET':'POST',redirect:'error',signal:controller.signal,
          headers:{'Content-Type':'application/json',...(this.id==='exa'?{'x-api-key':key}:{Authorization:'Bearer '+key})},
          ...(body===undefined?{}:{body:JSON.stringify(body)})});}
        catch{throw new SearchError(controller.signal.aborted?'timeout':'unavailable');}
        if(!response.ok){
          const status=response.status;
          if([401,403].includes(status))throw new SearchError('auth');
          if(status===402)throw new SearchError(this.id==='exa'?'key_budget':'quota');
          if(status===432)throw new SearchError('quota');
          if(status===429){const value=response.headers?.get('retry-after'),seconds=Number(value);
            const ms=value?(Number.isFinite(seconds)?seconds*1000:Date.parse(value)-this.now()):60000;
            throw new SearchError('rate_limit',Math.max(1000,Math.min(3600000,ms||60000)));}
          throw new SearchError('unavailable');
        }
        try{
          if(Number(response.headers?.get('content-length'))>2000000)throw Error('large');
          if(!response.body?.getReader)throw Error('missing body');
          const reader=response.body.getReader();let size=0;const chunks=[];
          try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
            if(size>2000000)throw Error('large');chunks.push(Buffer.from(value));}}
          finally{await reader.cancel().catch(()=>{});}
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }catch{throw new SearchError('invalid');}
      })()]);
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
  }
  async search(query,key,{limit=3,...options}={}) {
    const body=this.id==='exa'?{query,type:'auto',numResults:limit}:
      this.id==='tavily'?{query,search_depth:'basic',auto_parameters:false,max_results:limit,include_answer:false,include_raw_content:false,include_images:false,include_usage:true,
        topic:/新聞|news/i.test(query)?'news':'general',...(/今天|今日|today/i.test(query)?{time_range:'day'}:{})}:
        {query,limit,sources:['web'],country:'TW',timeout:Math.max(1000,Math.min(6000,options.timeoutMs||6000))};
    const data=await this.request(key,this.id==='firecrawl'?'/v2/search':'/search',body,options);
    if(this.id==='firecrawl'&&data.success!==true)throw new SearchError('invalid');
    const rows=this.id==='firecrawl'?data.data?.web:data.results;
    if(!Array.isArray(rows))throw new SearchError('invalid');
    const cost=this.id==='exa'?Number(data.costDollars?.total):this.id==='tavily'?Number(data.usage?.credits):Number(data.creditsUsed);
    return {query,provider:LABELS[this.id],provider_id:this.id,results:normalizeResults(rows,limit,this.now()),
      usage:{units:Number.isFinite(cost)&&cost>=0?cost:UNITS[this.id],estimated:!(Number.isFinite(cost)&&cost>=0),unit:this.id==='exa'?'USD':'credits'},
      notice:'搜尋摘要或標題不是完整正文；沒有搜尋結果不能證明作品或事件不存在。'};
  }
  async usage(key,options) {
    if(this.id==='exa')return null; // Ordinary Exa keys have no documented account-balance endpoint.
    const data=await this.request(key,this.id==='tavily'?'/usage':'/v2/team/credit-usage',undefined,options);
    if(this.id==='tavily'){
      const a=data.account,k=data.key;
      if(!a||!k||![a.plan_usage,a.plan_limit,k.usage,k.limit].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))throw new SearchError('invalid');
      // Do not spend a paid subscription or pay-as-you-go balance through the free-only path.
      if(a.plan_limit>1000||Number(a.paygo_limit)>0||Number(a.paygo_usage)>0)throw new SearchError('paid_plan');
      return {...monthPeriod(this.now()),remaining:Math.max(0,Math.min(a.plan_limit-a.plan_usage,k.limit-k.usage)),unit:'credits'};
    }
    const d=data.data,start=Date.parse(d?.billingPeriodStart),end=Date.parse(d?.billingPeriodEnd);
    if(data.success!==true||!d||![d.remainingCredits,d.planCredits].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||!Number.isFinite(start)||!(end>this.now())||start>this.now()||end<=start)throw new SearchError('invalid');
    if(d.planCredits>1000)throw new SearchError('paid_plan');
    return {start,end,remaining:d.remainingCredits,unit:'credits'};
  }
}
