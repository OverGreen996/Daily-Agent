// Data-only, manually installed source ranking rules. Never executes downloaded code.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {selected} from './PluginManager.mjs';
export const rulesFeed='https://xng-plugins.kentyang1993.workers.dev/xng-rules-update.json';
const digest=b=>createHash('sha256').update(b).digest('hex');
const version=v=>{if(typeof v!=='string'||!/^\d[A-Za-z0-9._-]{0,63}$/.test(v))throw Error('來源規則版本無效');return v;};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const config=root=>path.join(path.resolve(root),'config');
const read=file=>{if(fs.statSync(file).size>65536)throw Error('來源規則檔案過大');return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));};
const types=new Set(['official','documentation','academic','news','technical_media','community','forum','social','blog','aggregator','unknown']);
export function validateDomains(domains){
 if(!object(domains)||Object.keys(domains).length>256)throw Error('來源規則必須是最多256個網域');
 for(const [domain,rule] of Object.entries(domains)){
  if(domain.length>253||! /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)||['__proto__','constructor','prototype'].includes(domain))throw Error('來源網域無效');
  if(!object(rule)||Object.keys(rule).some(k=>!['source_type','authority','penalty','blocked'].includes(k)))throw Error('來源規則包含未允許的欄位');
  if('source_type' in rule&&!types.has(rule.source_type))throw Error('來源分類無效');
  for(const field of ['authority','penalty'])if(field in rule&&(!Number.isFinite(rule[field])||rule[field]<0||rule[field]>1))throw Error('来源分數必須介於0與1');
  if('blocked' in rule&&typeof rule.blocked!=='boolean')throw Error('blocked 必須是布林值');
 }
 return domains;
}
export function validateRules(value){
 if(!object(value)||Object.keys(value).some(k=>!['schema','id','version','api_schema_version','paid','domains'].includes(k))||value.schema!==1||value.id!=='xng-source-rules'||value.api_schema_version!==1||value.paid!==false)throw Error('不相容的來源規則');
 version(value.version);validateDomains(value.domains);return value;
}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}
export function selectedRules(root){
 const pointer=path.join(config(root),'rules-current.json');
 if(!fs.existsSync(pointer))return {version:null,previous:null,domains:{}};
 const state=read(pointer);if(state.schema!==1)throw Error('來源規則指標無效');
 if(state.current===null)return {version:null,previous:state.previous??null,domains:{}};
 version(state.current);if(!/^[a-f0-9]{64}$/.test(state.sha256))throw Error('來源規則指標缺少校驗');
 const file=path.join(config(root),'rules-versions',state.current+'.json');
 if(digest(fs.readFileSync(file))!==state.sha256)throw Error('已安裝的來源規則校驗失敗');
 const data=validateRules(read(file));if(data.version!==state.current)throw Error('來源規則版本與指標不符');
 return {...data,previous:state.previous??null};
}
export function effectiveRules(root,defaults={}){
 const choice=selectedRules(root),localFile=path.join(config(root),'domain_overrides.local.json');
 const local=fs.existsSync(localFile)?validateDomains(read(localFile)):{};
 const merged={};for(const layer of [defaults,choice.domains,local])for(const [d,v] of Object.entries(layer))merged[d]={...(merged[d]??{}),...v};
 // The existing ranking API uses first-match overrides: subdomains must precede parents.
 return {overrides:Object.fromEntries(Object.entries(merged).sort(([a],[b])=>b.length-a.length||a.localeCompare(b))),
  status:{version:choice.version,update_policy:'manual',domain_count:Object.keys(choice.domains).length,local_domain_count:Object.keys(local).length,scope:'final-evidence-ranking'}};
}
function locked(root,action){
 fs.mkdirSync(config(root),{recursive:true});const file=path.join(config(root),'rules-update.lock');let fd;
 try{fd=fs.openSync(file,'wx');}catch(e){if(e.code==='EEXIST')throw Error('另一個來源規則更新尚未完成');throw e;}
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));return action();}finally{fs.closeSync(fd);fs.unlinkSync(file);}
}
export function installRules(root,data,{verify=true,node=path.join(root,'runtime/node/node.exe')}={}){
 validateRules(data);
 return locked(root,()=>{
  const old=selectedRules(root),bytes=Buffer.from(JSON.stringify(data,null,2));if(bytes.length>65536)throw Error('來源規則過大');
  const destination=path.join(config(root),'rules-versions',data.version+'.json');
  if(fs.existsSync(destination)&&digest(fs.readFileSync(destination))!==digest(bytes))throw Error('同版規則已有不同內容，拒絕覆蓋');
  // Validate the merged local configuration as well, before touching the pointer.
  const local=path.join(config(root),'domain_overrides.local.json');if(fs.existsSync(local))validateDomains(read(local));
  if(verify){
   const core=selected(root).coreDirectory,tests=fs.readdirSync(path.join(core,'tests')).filter(f=>f.endsWith('.test.js')).map(f=>path.join(core,'tests',f));
   if(!tests.length)throw Error('核心缺少回歸測試');
   const env={...process.env};delete env.NODE_TEST_CONTEXT;
   const result=spawnSync(node,['--test',...tests],{cwd:core,env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:10000000});
   fs.writeFileSync(path.join(config(root),'rules-validation.log'),(result.stdout??'')+(result.stderr??''));
   if(result.error||result.status!==0)throw Error('來源規則安裝前核心回歸失敗，原規則保留');
   // Check that this actual core understands blocking, classification and authority.
   const probe=`import {sourceType,evidenceScores,buildEvidencePack} from './Evidence.js';const o=${JSON.stringify(data.domains)};for(const [d,v] of Object.entries(o)){const r={url:'https://'+d+'/check',title:'XNG source rules validation',body:'XNG source rules validation content',coverage:'page'};if(v.source_type&&sourceType(r,{[d]:v})!==v.source_type)throw Error('classification');if(v.authority!==undefined&&Math.abs(evidenceScores(r,'XNG',{[d]:v}).authority-v.authority)>.001)throw Error('authority');if(v.blocked&&buildEvidencePack({results:[r]},'XNG',{overrides:{[d]:v}}).pack.evidence.length)throw Error('blocked');}`;
   const canary=spawnSync(node,['--input-type=module','-e',probe],{cwd:core,env,encoding:'utf8',windowsHide:true,timeout:15000});
   if(canary.error||canary.status!==0)throw Error('規則與目前核心的行為不相容，原規則保留');
  }
  if(!fs.existsSync(destination))atomic(destination,data);
  if(old.version!==data.version)atomic(path.join(config(root),'rules-current.json'),{schema:1,current:data.version,previous:old.version,sha256:digest(fs.readFileSync(destination))});
  return {version:data.version,restartRequired:true,domain_count:Object.keys(data.domains).length};
 });
}
export function rollbackRules(root){return locked(root,()=>{
 const old=selectedRules(root);if(!old.version&&!old.previous)throw Error('沒有可回復的規則');
 let sha256=null;if(old.previous){version(old.previous);const file=path.join(config(root),'rules-versions',old.previous+'.json');const data=validateRules(read(file));if(data.version!==old.previous)throw Error('回復規則版本不符');sha256=digest(fs.readFileSync(file));}
 atomic(path.join(config(root),'rules-current.json'),{schema:1,current:old.previous,previous:old.version,sha256});return {version:old.previous,restartRequired:true};
});}
async function bounded(response,max){if(!response.ok)throw Error('來源規則下載失敗 HTTP '+response.status);const chunks=[];let n=0;for await(const b of response.body){n+=b.length;if(n>max)throw Error('來源規則下載超過限制');chunks.push(b);}return Buffer.concat(chunks);}
export function validateRulesFeed(feed){
 if(!object(feed)||feed.schema!==1||feed.id!=='xng-source-rules'||feed.api_schema_version!==1||feed.paid!==false||!Number.isSafeInteger(feed.size)||feed.size<1||feed.size>65536||!/^[a-f0-9]{64}$/.test(feed.sha256))throw Error('來源規則更新索引無效');version(feed.version);
 const u=new URL(feed.url,rulesFeed);if(u.origin!==new URL(rulesFeed).origin||u.username||u.password||u.search||u.hash||!/^\/releases\/XNG-Rules-\d[A-Za-z0-9._-]{0,63}\.json$/.test(u.pathname))throw Error('來源規則必須來自指定公開下載站');return {...feed,url:u.href};
}
export async function checkRules(root,{fetcher=fetch}={}){
 const bytes=await bounded(await fetcher(rulesFeed,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)}),16384);
 const feed=validateRulesFeed(JSON.parse(bytes.toString('utf8'))),current=selectedRules(root);
 return {...feed,currentVersion:current.version,available:feed.version!==current.version};
}
export async function updateRules(root,expectedVersion,expectedHash,{fetcher=fetch,...options}={}){
 const feed=await checkRules(root,{fetcher});if(feed.version!==expectedVersion||feed.sha256!==expectedHash)throw Error('規則版本或校驗已變更，請重新檢查並確認');
 const bytes=await bounded(await fetcher(feed.url,{redirect:'error',signal:AbortSignal.timeout(15000)}),feed.size);
 if(bytes.length!==feed.size||digest(bytes)!==feed.sha256)throw Error('來源規則 SHA256／大小校驗失敗，原規則保留');
 const data=validateRules(JSON.parse(bytes.toString('utf8')));if(data.version!==feed.version)throw Error('規則內容版本與索引不符');return installRules(root,data,options);
}
export async function rulesStatus(root){let running=null,port=8889,endpoint=null;
 try{const c=JSON.parse(fs.readFileSync(path.join(root,'.runtime/connection.json'),'utf8'));if(Number.isInteger(c.port)&&c.port>=1024&&c.port<=65535){port=c.port;endpoint=c.searxng_url;}}catch{}
 try{const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(2000)});if(r.ok){const data=await r.json();if(data.service==='XNG AI Search Hub'&&(!endpoint||data.endpoint===endpoint))running=data.rules??null;}}catch{}
 const choice=selectedRules(root);return {version:choice.version,previous:choice.previous,running,requiresRestart:!!running&&running.version!==choice.version,feed:rulesFeed,updatePolicy:'manual'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,root,...args]=process.argv.slice(2);try{let result;
 if(action==='status')result=await rulesStatus(root);else if(action==='check')result=await checkRules(root);else if(action==='update')result=await updateRules(root,args[0],args[1]);else if(action==='rollback')result=rollbackRules(root);else if(action==='install')result=installRules(root,validateRules(read(args[0])));else throw Error('命令：status / check / update / install / rollback');
 console.log(JSON.stringify(result));}catch(e){console.error(e.message);process.exitCode=1;}
}
