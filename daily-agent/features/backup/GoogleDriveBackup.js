import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {CredentialVault} from './CredentialVault.js';
import {createSnapshot,decodeSnapshot,MAX_BACKUP_BYTES} from './MemorySnapshot.js';
const driveScope='https://www.googleapis.com/auth/drive.appdata';
const tokenUrl='https://oauth2.googleapis.com/token';
const release=Symbol('release response');
const fileId=id=>{if(typeof id!=='string'||!/^[-_A-Za-z0-9]{1,200}$/.test(id))throw Error('備份編號不正確。');return id;};
export function googleClient(input){
 const value=input?.installed||input;
 if(!value||typeof value.client_id!=='string'||!/^[-_.A-Za-z0-9]{10,250}\.apps\.googleusercontent\.com$/.test(value.client_id)||typeof (value.client_secret||'')!=='string'||(value.client_secret||'').length>500)throw Error('請匯入 Google Desktop app 用戶端 JSON。');
 return {client_id:value.client_id,client_secret:value.client_secret||''};
}
async function readBytes(response,limit){
 let size=0;const chunks=[];
 try {if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Google 回應超過大小限制。');chunks.push(chunk);}return Buffer.concat(chunks);}
 finally {response[release]?.();}
}
export class GoogleDriveBackup {
 constructor({dataDir,clientId='',clientSecret='',store=new CredentialVault(dataDir),fetcher=fetch,now=Date.now}={}){
  Object.assign(this,{dataDir,store,fetcher,now});this.defaultClient=clientId?googleClient({client_id:clientId,client_secret:clientSecret}):null;
  this.controllers=new Set();this.generation=0;this.busy=false;this.closed=false;this.error=null;this.account=null;this.access=null;this.flow=null;
  this.stateFile=path.join(dataDir,'drive-backup.json');this.state={auto:false,last_backup_at:null};
  if(fs.existsSync(this.stateFile))Object.assign(this.state,JSON.parse(fs.readFileSync(this.stateFile,'utf8')));
 }
 load(){return this.account??=this.store.load();}
 client(){return this.load().client||this.defaultClient;}
 saveState(){fs.writeFileSync(this.stateFile+'.tmp',JSON.stringify(this.state,null,2));fs.renameSync(this.stateFile+'.tmp',this.stateFile);}
 status(){const account=this.load();return {configured:!!this.client(),connected:!!account.refresh_token,email:account.email||null,auto:this.state.auto===true,last_backup_at:this.state.last_backup_at,busy:this.busy,login_pending:!!this.flow,error:this.error,storage:'appDataFolder'};}
 configure(input){
  if(this.closed||this.busy||this.flow||this.load().refresh_token)throw Error('請先結束作業並解除 Google 登入，再更換用戶端。');
  this.account={client:googleClient(input)};this.store.save(this.account);return this.status();
 }
 setAuto(enabled){if(typeof enabled!=='boolean')throw Error('自動備份設定不正確。');this.state.auto=enabled;this.saveState();return this.status();}
 async request(url,options={},timeout=30000){
  if(this.closed)throw Error('Google 備份模組已停止。');
  const controller=new AbortController();this.controllers.add(controller);
  try {const response=await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)])});response[release]=()=>this.controllers.delete(controller);return response;}
  catch(e){this.controllers.delete(controller);throw e;}
 }
 async json(url,options={}){
  const response=await this.request(url,options);
  const bytes=await readBytes(response,128*1024);
  if(!response.ok){if(response.status===401)this.access=null;throw Error('Google API 回應 HTTP '+response.status+'；請確認授權與 Drive API，必要時重新登入。');}
  return JSON.parse(bytes.toString('utf8'));
 }
 async token(fields){
  const client=this.client();if(!client)throw Error('尚未設定 Google OAuth 用戶端，請先看申請教學。');
  const response=await this.json(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...client,...fields})});
  if(typeof response.access_token!=='string'||!response.access_token||response.token_type?.toLowerCase()!=='bearer')throw Error('Google 沒有提供可用的登入權杖。');
  if(response.scope&&!response.scope.split(' ').includes(driveScope))throw Error('未同意 Drive 備份權限，請重新登入並授權。');
  return response;
 }
 async bearer(){
  const account=this.load();if(!account.refresh_token)throw Error('請先登入 Google。');
  if(this.access&&this.access.expires>this.now()+60000)return this.access.value;
  const generation=this.generation,response=await this.token({grant_type:'refresh_token',refresh_token:account.refresh_token});
  if(generation!==this.generation||this.closed)throw Error('Google 登入已解除。');
  this.access={value:response.access_token,expires:this.now()+Math.min(3600,Number(response.expires_in)||3600)*1000};return this.access.value;
 }
 cancelLogin(){if(this.flow){clearTimeout(this.flow.timer);this.flow.server.close();this.flow=null;}}
 async login(){
  if(this.busy||this.closed||this.flow)throw Error('登入或備份進行中，請稍候。');
  const client=this.client();if(!client)throw Error('尚未設定 Google OAuth 用戶端，請先看申請教學。');
  const generation=++this.generation,state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const flow={state,verifier,server:null,timer:null,used:false,generation};this.error=null;
  const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
   const finish=(code,message)=>{res.writeHead(code,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'"});res.end(message);};
   let url;try {url=new URL(req.url,'http://127.0.0.1');} catch {return finish(400,'登入回呼格式不正確。');}
   const got=url.searchParams.get('state')||'';
   if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${server.address()?.port}`||url.pathname!=='/oauth/callback')return finish(404,'找不到登入回呼。');
   if(!/^[-_A-Za-z0-9]+$/.test(got)||got.length!==state.length||!timingSafeEqual(Buffer.from(got),Buffer.from(state)))return finish(403,'登入驗證失敗，請從 Daily Agent 重新登入。');
   if(flow.used)return finish(409,'這次登入回呼已處理。');flow.used=true;
   try {
    if(url.searchParams.has('error'))throw Error('Google 登入未完成或已取消。');
    const code=url.searchParams.get('code');if(!code||code.length>2048)throw Error('Google 沒有提供授權碼。');
    const token=await this.token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:flow.redirect});
    if(generation!==this.generation||this.closed)throw Error('這次登入已取消。');
    if(!token.refresh_token)throw Error('Google 沒有提供持續備份授權，請重新登入。');
    const profile=await this.json('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token.access_token}});
    if(generation!==this.generation||this.closed)throw Error('這次登入已取消。');
    this.account={client,refresh_token:token.refresh_token,email:typeof profile.email==='string'?profile.email.slice(0,250):null};
    this.store.save(this.account);this.access={value:token.access_token,expires:this.now()+Math.min(3600,Number(token.expires_in)||3600)*1000};
    finish(200,'Google 登入完成。請回 Daily Agent 記憶宮殿按「立即備份」。');
   } catch(e){this.error=e.message;finish(400,'登入未完成。請回 Daily Agent 查看原因並重試。');}
   finally {if(this.flow===flow)this.cancelLogin();}
  });
  server.maxConnections=4;flow.server=server;
  this.flow=flow;
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
  catch(e){this.cancelLogin();throw e;}
  if(this.closed||generation!==this.generation){server.close();throw Error('這次登入已取消。');}
  flow.redirect=`http://127.0.0.1:${server.address().port}/oauth/callback`;
  flow.timer=setTimeout(()=>{if(this.flow===flow){this.error='登入逾時，請重新登入 Google。';this.cancelLogin();}},180000);flow.timer.unref();this.flow=flow;
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:client.client_id,redirect_uri:flow.redirect,response_type:'code',scope:'openid email '+driveScope,state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'});
  return {url:url.href};
 }
 async exclusive(work){
  if(this.busy||this.flow||this.closed)throw Error('登入或備份作業進行中，請稍候。');
  this.busy=true;this.error=null;
  try {return await work();} catch(e){this.error=e.message;throw e;} finally {this.busy=false;}
 }
 async backup(snapshot){return this.exclusive(async()=>{
  const generation=this.generation,token=await this.bearer();
  const {bytes,manifest}=await snapshot();
  if(this.closed||generation!==this.generation)throw Error('備份已取消。');
  const sha=createHash('sha256').update(bytes).digest('hex');
  const start=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,createdTime,size',{
   method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json','x-upload-content-type':'application/gzip','x-upload-content-length':String(bytes.length)},
   body:JSON.stringify({name:'DailyAgent-memory-'+manifest.created_at.replace(/[:.]/g,'-')+'.dpm.gz',parents:['appDataFolder'],appProperties:{kind:'DailyAgentMemory',schema:'1',sha256:sha}})});
  const uploadLocation=start.headers.get('location');await readBytes(start,65536);
  if(!start.ok)throw Error('無法開始 Drive 備份，HTTP '+start.status+'。');
  const location=new URL(uploadLocation||'');
  if(location.protocol!=='https:'||location.hostname!=='www.googleapis.com'||!location.pathname.startsWith('/upload/drive/')||location.username||location.password)throw Error('Google 備份上傳位置不正確。');
  if(this.closed||generation!==this.generation)throw Error('備份已取消。');
  const response=await this.request(location.href,{method:'PUT',headers:{Authorization:'Bearer '+token,'content-type':'application/gzip','content-length':String(bytes.length)},body:bytes},90000);
  const uploaded=await readBytes(response,65536);
  if(!response.ok)throw Error('Drive 備份未完成，HTTP '+response.status+'。');
  const result=JSON.parse(uploaded.toString('utf8'));fileId(result.id);
  if(generation!==this.generation||this.closed)throw Error('Google 登入已解除，本次上傳結果需重新查看。');
  this.state.last_backup_at=manifest.created_at;this.saveState();return {id:result.id,name:result.name,created_at:manifest.created_at,size:bytes.length};
 });}
 async list(){return this.exclusive(async()=>{
  const token=await this.bearer(),url=new URL('https://www.googleapis.com/drive/v3/files');
  url.search=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='kind' and value='DailyAgentMemory' }",fields:'files(id,name,createdTime,size)',pageSize:'30',orderBy:'createdTime desc'});
  const result=await this.json(url.href,{headers:{Authorization:'Bearer '+token}});
  return {files:(result.files||[]).map(f=>({id:fileId(f.id),name:f.name,created_at:f.createdTime,size:Number(f.size)}))};
 });}
 async download(id){return this.exclusive(async()=>{
  id=fileId(id);const generation=this.generation,token=await this.bearer(),base='https://www.googleapis.com/drive/v3/files/'+id;
  const metadata=await this.json(base+'?fields=id,name,parents,size,appProperties',{headers:{Authorization:'Bearer '+token}});
  if(!metadata.parents?.includes('appDataFolder')||metadata.appProperties?.kind!=='DailyAgentMemory'||Number(metadata.size)>MAX_BACKUP_BYTES+65536)throw Error('不是這個程式的有效記憶備份。');
  const response=await this.request(base+'?alt=media',{headers:{Authorization:'Bearer '+token}},90000);
  const bytes=await readBytes(response,MAX_BACKUP_BYTES+65536);
  if(!response.ok)throw Error('無法下載備份，HTTP '+response.status+'。');
  if(createHash('sha256').update(bytes).digest('hex')!==metadata.appProperties.sha256)throw Error('Drive 備份校驗失敗。');
  const {manifest}=decodeSnapshot(bytes);const dir=path.resolve(this.dataDir,'memory-backups');
  if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('備份資料夾不能是連結。');
  fs.mkdirSync(dir,{recursive:true});const name=id+'.dpm.gz',file=path.join(dir,name);
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('備份檔案不能是連結。');
  if(this.closed||generation!==this.generation)throw Error('下載已取消。');
  if(fs.existsSync(file)){if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==metadata.appProperties.sha256)throw Error('同名本機檔案不同，請先移走再下載。');}
  else fs.writeFileSync(file,bytes,{flag:'wx'});
  return {name,path:file,created_at:manifest.created_at,message:'已下載並核對備份；目前的記憶沒有被覆寫。'};
 });}
 async disconnect(){
  ++this.generation;this.cancelLogin();for(const c of this.controllers)c.abort();
  const account=this.load(),refresh=account.refresh_token;this.account={client:account.client};this.store.save(this.account);this.access=null;
  this.state.auto=false;this.saveState();let revoked=false;
  if(refresh){try {const response=await this.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:refresh})});await readBytes(response,65536);revoked=response.ok;} catch {}}
  return {disconnected:true,revoked,message:!refresh||revoked?'已解除 Google 登入。':'本機登入已移除；無法連線撤銷遠端授權，可至 Google 帳號的第三方應用程式頁面解除。'};
 }
 close(){this.closed=true;++this.generation;this.cancelLogin();for(const c of this.controllers)c.abort();}
}
export {createSnapshot};
