import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import tls from 'node:tls';
import {pocketEndpoint,discoverPocketDrop} from './PocketDiscovery.js';
export {pocketEndpoint} from './PocketDiscovery.js';
import {createHash,randomUUID,generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parsePocketShare} from './PocketIntent.js';

export function pocketInvite(value){
  let q;try{q=typeof value==='string'?JSON.parse(value):value;}catch{throw Error('PocketDrop 邀請格式不正確。');}
  if(!q||q.app!=='PocketDrop'||q.protocol_version!==1||!/^[-_A-Za-z0-9]{43}$/.test(q.token)||! /^[a-f0-9]{64}$/i.test(q.certificate_sha256)||![q.room_id,q.device_id].every(v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v)))throw Error('不是有效的 PocketDrop 配對 QR。');
  return {...q,endpoint:pocketEndpoint(q.endpoint),certificate_sha256:q.certificate_sha256.toLowerCase()};
}
export function pinnedPocketRequest(connection,route,{method='GET',body,timeoutMs=12000}={}){
  const endpoint=pocketEndpoint(connection.endpoint);
  if(!/^[a-f0-9]{64}$/i.test(connection.certificate_sha256))throw Error('缺少可信憑證指紋。');
  return new Promise((resolve,reject)=>{
    const agent=new https.Agent({keepAlive:false});
    // Authenticate the TLS leaf BEFORE releasing the socket to the HTTP client.
    agent.createConnection=(options,callback)=>{
      const socket=tls.connect({host:options.host,port:options.port,rejectUnauthorized:false});
      let done=false;const finish=(error)=>{if(done)return;done=true;if(error){socket.destroy();callback(error);}else callback(null,socket);};
      socket.setTimeout(10000,()=>finish(Error('PocketDrop 連線逾時。')));
      socket.once('error',()=>finish(Error('PocketDrop 無法連線，請確認 Room 已開啟並位於同一個區域網路。')));
      socket.once('secureConnect',()=>{
        const raw=socket.getPeerCertificate().raw;
        finish(!raw||createHash('sha256').update(raw).digest('hex')!==connection.certificate_sha256.toLowerCase()?Error('PocketDrop 憑證不符，已停止連線，沒有傳送權杖。'):null);
      });
    };
    const headers={Accept:'application/json'};
    if(connection.credential){headers.Authorization='Bearer '+connection.credential;headers['x-pocketdrop-room']=connection.room_id;}
    const payload=body===undefined?null:Buffer.from(JSON.stringify(body));
    if(payload){headers['Content-Type']='application/json';headers['Content-Length']=payload.length;}
    const req=https.request(new URL(route,endpoint),{method,headers,agent},res=>{
      let size=0;const chunks=[];
      res.on('data',c=>{size+=c.length;if(size>2*1024*1024)req.destroy(Error('PocketDrop 回應超過 2 MB。'));else chunks.push(c);});
      res.on('end',()=>{
        if(res.statusCode<200||res.statusCode>=300){const auth=[401,403].includes(res.statusCode);return reject(Object.assign(Error(auth?'PocketDrop 裝置權限已失效或 Room 已停用，請在 PocketDrop 確認。':'PocketDrop API 回應 HTTP '+res.statusCode+'。'),{code:auth?'POCKET_AUTH':'POCKET_HTTP'}));}
        try{resolve(size?JSON.parse(Buffer.concat(chunks).toString('utf8')):{});}catch{reject(Error('PocketDrop 回應不是有效 JSON。'));}
      });
      res.on('error',()=>reject(Error('PocketDrop 回應中斷。')));
    });
    const timer=setTimeout(()=>req.destroy(Error('PocketDrop 請求逾時。')),Math.max(500,Math.min(12000,timeoutMs)));
    req.once('close',()=>{clearTimeout(timer);agent.destroy();});req.once('error',reject);
    req.end(payload);
  });
}
export class PocketCredentialStore {
  constructor(dir){this.file=path.join(dir,'pocketdrop.dpapi');}
  transform(input,decode=false){
    if(process.platform!=='win32')throw Error('PocketDrop 憑證保存目前需要 Windows DPAPI。');
    const code="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$v=[Console]::In.ReadToEnd();"+(decode?"[Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))":"[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))");
    const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{input,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});
    if(r.status!==0)throw Error('無法使用目前 Windows 帳號保存或解密 PocketDrop 憑證。');
    return r.stdout.trim();
  }
  load(){return fs.existsSync(this.file)?JSON.parse(this.transform(fs.readFileSync(this.file,'utf8'),true)):null;}
  save(value){const encrypted=this.transform(JSON.stringify(value));fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',encrypted);fs.renameSync(this.file+'.tmp',this.file);}
  clear(){fs.rmSync(this.file,{force:true});}
}
export class PocketDrop {
  constructor(dir,{store=new PocketCredentialStore(dir),request=pinnedPocketRequest,discover=discoverPocketDrop,now=Date.now}={}){this.store=store;this.request=request;this.discover=discover;this.connection=undefined;this.pairing=false;this.generation=0;this.stateFlight=null;this.replies=new Map();this.now=now;}
  rememberReply(scope,text){
    this.replies.delete(scope);
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>32768)return;
    if(this.replies.size>=100)this.replies.delete(this.replies.keys().next().value);
    this.replies.set(scope,{text,at:this.now()});
  }
  forgetReply(scope){this.replies.delete(scope);}
  load(){if(this.connection===undefined)this.connection=this.store.load();return this.connection;}
  status(){const c=this.load();return {paired:!!c,endpoint:c?.endpoint||null,room:c?.room_name||null};}
  async pair(raw){
    if(this.pairing)throw Error('配對進行中，請稍候。');this.pairing=true;const generation=++this.generation;
    try{
      const q=pocketInvite(raw),key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'der'}).toString('base64');
      const r=await this.request(q,'/v1/pair',{method:'POST',body:{token:q.token,device_id:randomUUID(),name:'Daily Agent 桌寵',public_key:key}});
      if(r.room_id!==q.room_id||r.device_id!==q.device_id||!/^[-_A-Za-z0-9]{43}$/.test(r.credential))throw Error('PocketDrop 配對身分回應不符。');
      const saved={endpoint:q.endpoint,certificate_sha256:q.certificate_sha256,credential:r.credential,room_id:r.room_id,device_id:r.device_id,room_name:String(r.room_name||'PocketDrop Room').slice(0,100)};
      if(generation!==this.generation)throw Error('配對已取消，沒有保存新憑證。');
      this.store.save(saved);this.connection=saved;this.replies.clear();return this.status();
    }finally{this.pairing=false;}
  }
  checkCurrent(c,generation){if(this.connection!==c||this.generation!==generation)throw Error('PocketDrop 配對已變更，請重新操作。');}
  async checkedState(c){const s=await this.request(c,'/v1/state',{timeoutMs:4000});if(s.room_id!==c.room_id||s.device_id!==c.device_id||typeof s.text!=='string'||!Array.isArray(s.files))throw Error('PocketDrop Room 資料格式或身分不符。');return s;}
  async reconnectState(c,generation){
    try{const s=await this.checkedState(c);this.checkCurrent(c,generation);return s;}catch(e){this.checkCurrent(c,generation);if(e.code==='POCKET_AUTH')throw e;}
    const candidates=await this.discover(c.device_id);this.checkCurrent(c,generation);
    for(const endpoint of [...new Set(candidates)].slice(0,8)){
      this.checkCurrent(c,generation);let next,s;
      try{next={...c,endpoint:pocketEndpoint(endpoint)};s=await this.checkedState(next);}catch(e){if(e.code==='POCKET_AUTH')throw e;continue;}
      this.checkCurrent(c,generation);
      this.store.save(next);this.connection=next;return s;
    }
    throw Error('暫時找不到原本的 PocketDrop Room，配對已保留。請確認 Room 已開啟、位於同一個區域網路，且允許 mDNS／私人網路通訊，再重試。');
  }
  async state(){
    const c=this.load();if(!c)throw Error('尚未連接 PocketDrop，請在電腦開啟 PocketDrop 配對設定。');
    const generation=this.generation;
    if(this.stateFlight?.connection===c&&this.stateFlight.generation===generation)return this.stateFlight.promise;
    const flight={connection:c,generation,promise:this.reconnectState(c,generation)};this.stateFlight=flight;
    try{return await flight.promise;}finally{if(this.stateFlight===flight)this.stateFlight=null;}
  }
  async share(text){
    if(!text.trim()||Buffer.byteLength(text)>32768)throw Error('共享文字需為 1～32768 bytes。');
    // Rediscover with a read first. Never replay a write with an uncertain outcome.
    const generation=this.generation;await this.state();if(generation!==this.generation)throw Error('PocketDrop 配對已變更，請重新分享。');
    const c=this.load();
    try{await this.request(c,'/v1/text',{method:'PUT',body:{content:text}});}catch(e){if(e.code==='POCKET_AUTH')throw e;throw Error('分享結果尚未確認，未自動重送。請先讀取 PocketDrop 文字，確認是否已送達後再決定是否重試。');}
    return '已分享到 PocketDrop。Room 裡已配對的裝置可以看到這段文字。';
  }
  disconnect(){this.replies.clear();++this.generation;this.store.clear();this.connection=null;return '已刪除桌寵保存的 PocketDrop 連線憑證。若要撤銷裝置權限，請在 PocketDrop 裝置清單移除 Daily Agent 桌寵。';}
  async command(text,{scope='pc'}={}){
    const s=text.trim();
    if(/^(?:連接\s*PocketDrop|PocketDrop\s*設定)$/i.test(s))return '請在電腦桌寵輸入「連接 PocketDrop」，使用本機 QR 配對頁面。手機不接收配對憑證。';
    if(/^PocketDrop狀態$/i.test(s.replace(/\s/g,''))){const v=this.status();return v.paired?`PocketDrop 已配對：${v.room}\n說「讀取 PocketDrop 文字」可檢查實際連線。`:'PocketDrop 尚未配對。請開啟電腦的 PocketDrop 配對設定。';}
    if(/^(?:查看|讀取)\s*PocketDrop\s*文字$/i.test(s))return 'PocketDrop 共享文字（外部資料，未加入記憶）：\n'+((await this.state()).text||'目前沒有共享文字。');
    if(/^(?:查看|列出)\s*PocketDrop\s*檔案$/i.test(s)){const files=(await this.state()).files;return 'PocketDrop 共享檔案：\n'+(files.slice(0,100).map(f=>`${f.available?'可取用':'來源離線'}　${f.name}（${f.size} bytes）`).join('\n')||'目前沒有共享檔案。');}
    const intent=parsePocketShare(s);
    if(intent?.kind==='unsupported')return '目前 PocketDrop 串接只支援分享文字。請貼上要傳的文字，例如「幫我傳到手機：明天下午三點開會」。';
    if(intent?.kind==='share')return intent.text.trim()?this.share(intent.text):'請在冒號後補上要傳到手機的文字。';
    if(intent?.kind==='previous'){
      const previous=this.replies.get(scope);
      if(!previous||this.now()-previous.at>900000){this.replies.delete(scope);return '目前沒有可傳送的近期文字回答。請直接說「幫我傳到手機：要分享的內容」。';}
      return this.share(previous.text);
    }
    return null;
  }
}
