import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const stage=path.resolve(process.argv[2]||'dist/0.2.2-xng-local-20261003-1');
const app=path.join(stage,'app'),cwd=path.join(app,'daily-agent');
const data=path.resolve('test-output/xng-package-'+Date.now());fs.mkdirSync(data,{recursive:true});
assert.ok(!fs.existsSync(path.join(app,'../XNG')));
const mock=http.createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end('{"models":[]}');});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const env={...process.env,DAILY_DATA:data,DAILY_PORT:String(port),OLLAMA_HOST_URL:`http://127.0.0.1:${mock.address().port}`,
 DAILY_XNG_HUB_URL:'http://127.0.0.1:8889',DAILY_SEARXNG_URL:'http://127.0.0.1:8888',DAILY_SEARCH_PROVIDER:'searxng'};
delete env.XNG_CORE_ROOT;
const child=spawn(path.join(app,'vendor/node/node.exe'),['server.js'],{cwd,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
try {
 let html;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error(output);
  try {const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok){html=await r.text();break;}} catch {}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(html,output);
 const token=html.match(/name="daily-token" content="([a-f0-9]+)"/)?.[1];assert.ok(token);
 const base=`http://127.0.0.1:${port}`;
 assert.equal((await fetch(base+'/api/modules/search')).status,401);
 const response=await fetch(base+'/api/modules/search',{headers:{'x-daily-token':token}});
 assert.equal(response.status,200);
 const status=await response.json();assert.equal(status.provider,'XNG AI Search Hub');assert.equal(status.paid,false);
 const shutdown=await fetch(base+'/api/shutdown',{method:'POST',headers:{'content-type':'application/json','x-daily-token':token},body:'{}'});
 assert.equal(shutdown.status,200);
 const report={passed:true,packagedNode:true,isolatedCore:true,searchModuleLoaded:true,authenticatedApi:true,shutdown:true};
 fs.writeFileSync(path.join(data,'report.json'),JSON.stringify(report,null,2));console.log(report);
} finally {
 if(child.exitCode===null)child.kill();
 await new Promise(resolve=>mock.close(resolve));
 fs.writeFileSync(path.join(data,'server.log'),output);
}
