import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const defaultFeed='https://xng-plugins.kentyang1993.workers.dev/xng-update.json';
function feedSource(root){const file=path.join(store(root),'source.json');return fs.existsSync(file)?checkedFeedUrl(read(file).url):defaultFeed;}
function checkedFeedUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/xng-update.json'))throw Error('更新來源必須是 HTTPS 的 xng-update.json，不含密碼或 token');return u.href;}
export function configureSource(root,url){const checked=checkedFeedUrl(url);atomic(path.join(store(root),'source.json'),{url:checked});return {feed:checked,updatePolicy:'manual'};}
const versionPattern=/^[0-9][A-Za-z0-9._-]{0,63}$/;
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const store=root=>path.join(path.resolve(root),'.plugins');
function files(dir,prefix=''){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  if(e.isSymbolicLink())throw Error('插件不能包含符號連結');
  const name=prefix+e.name;
  return e.isDirectory()?files(path.join(dir,e.name),name+'/'):[name];
 }).sort();
}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}
function checkedVersion(version){if(!versionPattern.test(version))throw Error('插件版本格式錯誤');return version;}
export function validatePackage(directory){
 const manifest=read(path.join(directory,'plugin.json'));
 if(manifest.schema!==1||manifest.id!=='xng-search-core'||manifest.api_schema_version!==1||manifest.paid!==false||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>4000)throw Error('不相容的 XNG 插件格式');
 checkedVersion(manifest.version);let total=0;
 const actual=files(directory).filter(f=>f!=='plugin.json');
 const seen=new Set(),folded=new Set();
 for(const f of manifest.files){
  if(typeof f.path!=='string'||!f.path.startsWith('core/')||f.path.includes('\\')||f.path.split('/').some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f:]/.test(p)||/[ .]$/.test(p))||folded.has(f.path.toLowerCase())||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('插件檔案清單不安全');
  seen.add(f.path);folded.add(f.path.toLowerCase());const p=path.join(directory,f.path),stat=fs.lstatSync(p);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('插件檔案必須是一般檔案');
  total+=stat.size;if(total>100_000_000)throw Error('插件解壓大小超過限制');
  if(hash(fs.readFileSync(p))!==f.sha256)throw Error('插件校驗失敗：'+f.path);
 }
 if(actual.length!==seen.size||actual.some(f=>!seen.has(f)))throw Error('插件包含未登記的檔案');
 for(const required of ['core/index.js','core/Core.js','core/server.js','core/package.json'])if(!seen.has(required))throw Error('插件缺少核心入口');
 const pkg=read(path.join(directory,'core/package.json'));
 if(pkg.name!=='xng-search-core'||pkg.type!=='module')throw Error('不是 XNG 核心');
 return manifest;
}
export function selected(root){
 const file=path.join(store(root),'current.json');
 if(!fs.existsSync(file))return {version:null,previous:null,coreDirectory:path.join(path.resolve(root),'core'),mode:'source'};
 const state=read(file);
 if(state.current===null)return {version:null,previous:state.previous||null,coreDirectory:path.join(path.resolve(root),'core'),mode:'source'};
 checkedVersion(state.current);
 const directory=path.join(store(root),'versions',state.current);
 const manifest=validatePackage(directory);
 if(manifest.version!==state.current)throw Error('插件版本指標不相符');
 return {version:state.current,previous:state.previous||null,coreDirectory:path.join(directory,'core'),mode:'plugin'};
}
export async function status(root){
 const choice=selected(root);let running=null;
 try {const r=await fetch('http://127.0.0.1:8889/health',{signal:AbortSignal.timeout(2000)});if(r.ok){const data=await r.json();if(data.service==='XNG AI Search Hub')running=data.plugin||{version:null,mode:'legacy-source'};}}catch{}
 return {id:'xng-search-core',...choice,running,requiresRestart:Boolean(running&&(running.version!==choice.version||running.mode!==choice.mode)),feed:feedSource(root),updatePolicy:'manual'};
}
function lock(root,action){
 const directory=store(root);fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'update.lock');let fd;
 try{fd=fs.openSync(file,'wx');}catch(e){if(e.code==='EEXIST')throw Error('另一個 XNG 更新正在執行；請完成後再試。');throw e;}
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));return action();}
 finally{fs.closeSync(fd);fs.unlinkSync(file);}
}
export function installDirectory(root,directory,{node=path.join(root,'runtime/node/node.exe'),verify=true}={}){
 return lock(root,()=>{
  const incoming=validatePackage(directory);const current=selected(root);
  const staging=path.join(store(root),'staging',randomUUID());fs.mkdirSync(path.dirname(staging),{recursive:true});
  try{
   fs.cpSync(directory,staging,{recursive:true,dereference:false});validatePackage(staging);
   if(verify){
    const tests=fs.readdirSync(path.join(staging,'core/tests')).filter(f=>f.endsWith('.test.js')).map(f=>path.join(staging,'core/tests',f));
    if(!tests.length)throw Error('插件缺少回歸測試');
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const result=spawnSync(node,['--test',...tests],{env,cwd:path.join(staging,'core'),encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:10_000_000});
    fs.writeFileSync(path.join(store(root),'last-validation.log'),(result.stdout||'')+(result.stderr||''));
    if(result.error||result.status!==0)throw Error('XNG 回歸未通過，原版本保留。請查看 last-validation.log。');
   }
   const final=path.join(store(root),'versions',incoming.version);fs.mkdirSync(path.dirname(final),{recursive:true});
   if(fs.existsSync(final)){
    const saved=validatePackage(final);
    if(hash(JSON.stringify(saved))!==hash(JSON.stringify(incoming)))throw Error('同版本已有不同內容，拒絕覆蓋');
   }else fs.renameSync(staging,final);
   if(current.version!==incoming.version)atomic(path.join(store(root),'current.json'),{schema:1,current:incoming.version,previous:current.version||'source',updated_at:new Date().toISOString()});
   return {installed:true,version:incoming.version,previous:current.version===incoming.version?current.previous:current.version||'source',restartRequired:true};
  } finally{if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true,force:true});}
 });
}
export function rollback(root){
 return lock(root,()=>{
  const current=selected(root);if(!current.previous)throw Error('沒有可回復的插件版本');
  if(current.previous==='source'){
   for(const file of ['index.js','Core.js','server.js','package.json'])if(!fs.existsSync(path.join(root,'core',file)))throw Error('原始核心不完整，無法回復');
   atomic(path.join(store(root),'current.json'),{schema:1,current:null,previous:current.version,updated_at:new Date().toISOString()});
   return {version:'原始碼版本',restartRequired:true};
  }
  checkedVersion(current.previous);const previous=validatePackage(path.join(store(root),'versions',current.previous));
  atomic(path.join(store(root),'current.json'),{schema:1,current:previous.version,previous:current.version,updated_at:new Date().toISOString()});
  return {version:previous.version,restartRequired:true};
 });
}
function releaseUrl(value,source=defaultFeed){const u=new URL(value),s=new URL(checkedFeedUrl(source));const github=u.origin==='https://github.com'&&u.pathname.startsWith('/OverGreen996/Daily-Agent/releases/download/');const configured=s.origin!=='https://github.com'&&u.origin===s.origin&&u.pathname.startsWith('/releases/');if(u.protocol!=='https:'||u.username||u.password||(!github&&!configured)||u.hash||u.search)throw Error('套件必須來自維護者 GitHub 或你指定的更新站');return u.href;}
export function validateFeed(feed,source=defaultFeed){
 if(feed.schema!==1||feed.id!=='xng-search-core'||feed.api_schema_version!==1||feed.paid!==false||!Number.isSafeInteger(feed.size)||feed.size<=0||feed.size>30_000_000||!/^[a-f0-9]{64}$/.test(feed.sha256))throw Error('插件更新資訊無效');
 checkedVersion(feed.version);releaseUrl(feed.url,source);if(!feed.url.endsWith('.zip'))throw Error('插件更新必須是 ZIP');return feed;
}
export async function checkUpdate(root){
 const source=feedSource(root);const response=await fetch(source+'?check='+Date.now(),{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('無法取得 XNG 更新資訊（HTTP '+response.status+'）');
 const text=await response.text();if(text.length>32768)throw Error('更新資訊超過限制');
 const parsed=JSON.parse(text.replace(/^\uFEFF/,''));parsed.url=new URL(parsed.url,source).href;
 const feed=validateFeed(parsed,source),current=selected(root);
 return {...feed,currentVersion:current.version,available:feed.version!==current.version};
}
export async function downloadUpdate(root,expectedVersion){
 const feed=await checkUpdate(root);if(feed.version!==expectedVersion)throw Error('版本已變更，請重新檢查並確認');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'xng-plugin-download-'));const archive=path.join(temporary,'plugin.zip');
 try{
  const response=await fetch(feed.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('插件下載失敗：'+response.status);
  const chunks=[];let size=0;for await(const b of response.body){size+=b.length;if(size>feed.size)throw Error('插件下載大小不符');chunks.push(b);}
  const bytes=Buffer.concat(chunks);if(size!==feed.size||hash(bytes)!==feed.sha256)throw Error('插件下載校驗失敗，原版本保留');fs.writeFileSync(archive,bytes);
  return installArchive(root,archive,feed.version);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
export function installArchive(root,archive,expectedVersion){
 if(fs.statSync(archive).size>30_000_000)throw Error('插件 ZIP 超過大小限制');
 const destination=fs.mkdtempSync(path.join(os.tmpdir(),'xng-plugin-extract-'));
 try{
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'plugins/Extract-Plugin.ps1'),'-Archive',path.resolve(archive),'-Destination',destination],{windowsHide:true,timeout:60000});
  const manifest=validatePackage(destination);if(expectedVersion&&manifest.version!==expectedVersion)throw Error('插件版本與更新資訊不符');
  return installDirectory(root,destination);
 }finally{fs.rmSync(destination,{recursive:true,force:true});}
}
export function buildPackage(root,version,out){
 checkedVersion(version);const target=path.join(out,version);if(fs.existsSync(target))throw Error('版本已經打包');fs.mkdirSync(path.join(target,'core'),{recursive:true});
 const core=path.join(root,'core');
 for(const f of fs.readdirSync(core)){if(/^[A-Za-z._-]+\.js$/.test(f)||['package.json','package-lock.json','domain_overrides.json'].includes(f))fs.copyFileSync(path.join(core,f),path.join(target,'core',f));}
 for(const name of ['tests','node_modules'])fs.cpSync(path.join(core,name),path.join(target,'core',name),{recursive:true});
 const manifest={schema:1,id:'xng-search-core',version,api_schema_version:1,paid:false,created_at:new Date().toISOString(),files:files(target).map(f=>({path:f,sha256:hash(fs.readFileSync(path.join(target,f)))}))};
 fs.writeFileSync(path.join(target,'plugin.json'),JSON.stringify(manifest,null,2));validatePackage(target);
 return target;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,rootArg,...args]=process.argv.slice(2);const root=path.resolve(rootArg||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
 try{let result;
  if(command==='status')result=await status(root);
  else if(command==='check')result=await checkUpdate(root);
  else if(command==='update')result=await downloadUpdate(root,args[0]);
  else if(command==='install')result=installArchive(root,args[0]);
  else if(command==='rollback')result=rollback(root);
  else if(command==='build')result={directory:buildPackage(root,args[0],path.resolve(args[1]))};
  else if(command==='source')result=configureSource(root,args[0]);
  else throw Error('命令：status / check / update / install / rollback / build / source');
  console.log(JSON.stringify(result));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
