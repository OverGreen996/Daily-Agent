// Read the actual installed app; test only isolated data. No packages, models or paid APIs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const installation=path.resolve(process.argv[2] || '');
if(!process.argv[2])throw Error('Usage: node scripts/independent-installed-smoke.mjs <installation-directory>');
const current=JSON.parse(fs.readFileSync(path.join(installation,'current.json'),'utf8').replace(/^\uFEFF/,'')).current;
if(!/^[a-zA-Z0-9._-]+$/.test(current))throw Error('Invalid installed version');
const release=path.join(installation,'releases',current),app=path.join(release,'daily-agent');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-offline-installed-'));
const out=path.resolve('test-output/independent-architecture-20261005');fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(app,'modules/catalog.json'),'utf8'));
fs.writeFileSync(path.join(dir,'modules.json'),JSON.stringify({enabled:Object.fromEntries(catalog.map(m=>[m.id,false]))}));
const hook=path.join(dir,'offline-hook.mjs');
fs.writeFileSync(hook,`import {registerHooks} from 'node:module';registerHooks({resolve(specifier,context,next){
 if(!['node:','file:','.','/'].some(prefix=>specifier.startsWith(prefix)))throw Object.assign(Error('optional package unavailable'),{code:'ERR_MODULE_NOT_FOUND'});
 return next(specifier,context);
}});
const original=globalThis.fetch;globalThis.fetch=(url,options)=>{
 const target=new URL(typeof url==='string'?url:url.url);
 if(target.hostname!=='127.0.0.1'||target.port!=='1')throw Error('External service disabled for this isolated test');
 return original(url,options);
};`);
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const base='http://127.0.0.1:'+port,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const child=spawn(path.join(release,'vendor/node/node.exe'),['--import',pathToFileURL(hook).href,'server.js'],{
 cwd:app,windowsHide:true,stdio:'ignore',env:{...process.env,DAILY_DATA:dir,DAILY_PORT:String(port),
 DAILY_SEARCH_DATA_DIR:path.join(dir,'search'),OLLAMA_HOST_URL:'http://127.0.0.1:1',EXA_API_KEY:'',TAVILY_API_KEY:'',FIRECRAWL_API_KEY:''},
});
try {
 let token;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Installed app exited before opening');
  try {const response=await fetch(base,{signal:AbortSignal.timeout(500)});if(response.ok){token=(await response.text()).match(/name="daily-token" content="([a-f0-9]+)"/)?.[1];if(token)break;}}catch{}
  await pause(100);
 }
 assert.ok(token,'App did not open');
 const headers={'x-daily-token':token,'Content-Type':'application/json'};
 const statusResponse=await fetch(base+'/api/status',{headers,signal:AbortSignal.timeout(5000)});
 assert.equal(statusResponse.status,200);const status=await statusResponse.json();
 assert.equal(status.tokenizer.fallback,true);assert.ok(status.modelError);assert.equal(status.search.configured,false);
 assert.ok(status.modules.every(m=>!m.enabled));
 assert.equal((await fetch(base+'/api/palace',{headers})).status,200);
 const shutdown=await fetch(base+'/api/shutdown',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(10000)});
 assert.equal(shutdown.status,200);const stopped=await shutdown.json();assert.equal(stopped.stopped,true);
 assert.ok(stopped.warnings.some(w=>w.step==='unload-FULL_LLM'));
 await Promise.race([new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve)),pause(5000)]);
 assert.equal(child.exitCode,0);
 const report={passed:true,current,installedApp:true,thirdPartyPackagesBlocked:true,optionalModulesDisabled:true,
  modelBackendAbsent:true,otherApplicationsNotRequired:true,externalNetworkBlocked:true,statusAndMemoryAccessible:true,
  modelUnloadReportedUnverified:true,closed:true,isolatedData:true};
 fs.writeFileSync(path.join(out,'installed-offline-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {
 if(child.exitCode===null)child.kill();
 if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir()))throw Error('Refusing cleanup outside test temp directory');
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
