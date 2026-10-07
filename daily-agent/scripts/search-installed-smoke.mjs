// Actual installed server/UI, isolated user data, mocked upstream APIs. No real keys or models.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const installation='C:/Users/ppt07/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/DailyAgent';
const current=JSON.parse(fs.readFileSync(path.join(installation,'current.json'),'utf8').replace(/^\uFEFF/,'')).current;
const release=path.join(installation,'releases',current),app=path.join(release,'daily-agent');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-search-installed-'));
const out=path.resolve('test-output/search-rotation-20261005');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'environment-settings.json'),JSON.stringify({perception:false,lightLookup:false,memoryCompanion:false,weatherEnabled:false,screenVision:false}));
const hook=path.join(dir,'mock-apis.mjs');
fs.writeFileSync(hook,`const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{
 const value=String(url);if(value==='https://api.exa.ai/search')return Response.json({error:'redacted mock failure'},{status:402});
 if(value==='https://api.tavily.com/usage')return Response.json({key:{limit:1000,usage:0},account:{plan_limit:1000,plan_usage:0,paygo_limit:0}});
 if(value==='https://api.tavily.com/search')return Response.json({results:[{title:'模擬來源',url:'https://example.org/news',content:'隔離測試搜尋摘要'}],usage:{credits:1}});
 if(value==='https://api.firecrawl.dev/v2/team/credit-usage')return Response.json({success:true,data:{remainingCredits:1000,planCredits:1000,billingPeriodStart:new Date(Date.now()-86400000).toISOString(),billingPeriodEnd:new Date(Date.now()+86400000*29).toISOString()}});
 if(value==='https://api.firecrawl.dev/v2/search')return Response.json({success:true,data:{web:[{title:'模擬備援',url:'https://example.org/backup',description:'隔離測試'}]},creditsUsed:2});
 return original(url,init);
};`);
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const model=http.createServer((req,res)=>{req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({models:[],done:true}));});await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
const env={...process.env,DAILY_PORT:String(port),DAILY_DATA:dir,DAILY_SEARCH_DATA_DIR:path.join(dir,'search'),OLLAMA_HOST_URL:'http://127.0.0.1:'+model.address().port,EXA_API_KEY:'',TAVILY_API_KEY:'',FIRECRAWL_API_KEY:''};
let child,browser;
const base='http://127.0.0.1:'+port,pause=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){child=spawn(path.join(release,'vendor/node/node.exe'),['--import',pathToFileURL(hook).href,'server.js'],{cwd:app,windowsHide:true,env});
 child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Installed app exited');try{const r=await fetch(base+'/search-settings',{signal:AbortSignal.timeout(500)});if(r.ok)return (await r.text()).match(/name="daily-token" content="([a-f0-9]+)"/)[1];}catch{}await pause(100);}throw Error('Startup timeout');}
let token;
async function api(route,body){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'x-daily-token':token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {r,data:await r.json()};}
async function shutdown(){const result=await api('/api/shutdown',{});assert.equal(result.r.status,200);const running=child;await Promise.race([new Promise(r=>running.exitCode!==null?r():running.once('exit',r)),pause(5000)]);assert.equal(running.exitCode,0);}
try{
 token=await start();
 assert.equal((await fetch(base+'/api/modules/search/settings')).status,401);
 assert.equal((await fetch(base+'/api/modules/search/settings',{headers:{'x-daily-token':token,Origin:'https://example.org'}})).status,403);
 const initial=(await api('/api/modules/search/settings')).data;assert.equal(initial.configured,false);
 const missing=await api('/api/modules/search/query',{query:'test'});assert.equal(missing.r.status,500);
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1050,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/search-settings');await page.getByText('填入至少一家的金鑰，再儲存即可開始。').waitFor();
 await page.locator('#exa-key').fill('fake-exa-secret-only');await page.locator('#tavily-key').fill('fake-tavily-secret-only');await page.locator('#firecrawl-key').fill('fake-firecrawl-secret-only');
 await page.getByRole('button',{name:'儲存設定',exact:true}).click();await page.getByText('已儲存，立即生效。').waitFor();assert.equal(await page.locator('#exa-key').inputValue(),'');
 const result=await api('/api/modules/search/query',{query:'搜尋輪替隔離驗證'});assert.equal(result.r.status,200);assert.equal(result.data.provider_id,'tavily');assert.equal(result.data.attempts[0].reason,'key_budget');
 const status=(await api('/api/modules/search/settings')).data;assert.equal(status.providers[0].reason,'key_budget');assert.ok(!JSON.stringify(status).includes('fake-exa-secret-only'));
 assert.ok(!fs.readFileSync(path.join(dir,'search/search-secrets.dpapi'),'utf8').includes('fake-exa-secret-only'));
 await page.getByRole('button',{name:'重新讀取狀態'}).click();await page.getByText('已載入。儲存後立即生效，不需重啟。').waitFor();await page.screenshot({path:path.join(out,'search-settings-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'search-settings-mobile.png'),fullPage:true});
 const oldToken=token;await shutdown();token=await start();assert.notEqual(token,oldToken);
 const restored=(await api('/api/modules/search/settings')).data;assert.equal(restored.providers[0].reason,'key_budget');assert.equal(restored.providers[1].reservedUsage,1);
 assert.equal((await api('/api/modules/search/query',{query:'搜尋輪替隔離驗證'})).data.cache_hit,true);
 assert.equal(errors.length,0);await shutdown();
 const report={passed:true,current,installedServer:true,upstream:'mock',modelBackend:'mock',realKeysUsed:false,realUserDataTouched:false,csrfVerified:true,uiSaveVerified:true,dpapiVerified:true,restartPersistence:true,cacheAcrossRestart:true,desktopAndMobileUI:true,closed:true};
 fs.writeFileSync(path.join(out,'installed-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(child?.exitCode===null)child.kill();await browser?.close();model.closeAllConnections();await new Promise(r=>model.close(r));fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
