import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ApiProvider,SearchError,monthPeriod,PROVIDERS} from '../search/Providers.js';
import {SearchRouter} from '../search/SearchRouter.js';
import {RotationStore,DEFAULT_SETTINGS,validateSettings} from '../search/RotationStore.js';
import {SearchCredentials} from '../search/CredentialStore.js';
import {searchTurnBudget} from '../core/SearchTurnBudget.js';
import {SharedFiles} from '../remote/SharedFiles.js';
import {BrowserAgent} from '../browser/BrowserAgent.js';
const time=Date.UTC(2026,9,5,1);
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});
const result=id=>({provider_id:id,provider:id,results:[{title:'Official',url:'https://example.org',body:'source'}],usage:{units:id==='exa'?0.007:id==='tavily'?1:2}});
class Secrets{constructor(keys={}){this.data=keys;}load(){return structuredClone(this.data);}save(data){this.data=structuredClone(data);}}
function fixture({dir=':memory:',credentials=new Secrets({exa:'fake-exa-key',tavily:'fake-tavily-key',firecrawl:'fake-firecrawl-key'}),now=()=>time,fail={},calls=[]}={}){
 const providers=Object.fromEntries(PROVIDERS.map(id=>[id,{
  async usage(){calls.push(id+' usage');return {...monthPeriod(now()),remaining:900};},
  async search(){calls.push(id);if(fail[id])throw fail[id];return result(id);}
 }]));
 const store=new RotationStore(dir,{now}),router=new SearchRouter({dir,credentials,store,providers,now});
 return {router,store,credentials,providers,calls};
}
test('fixed endpoints and low-cost request options normalize all three providers',async()=>{
 for(const id of PROVIDERS){let request;
  const data=id==='firecrawl'?{success:true,data:{web:[{title:'source',url:'https://example.org',description:'description'}]},creditsUsed:2}:
   {results:[{title:'source',url:'https://example.org',...(id==='tavily'?{content:'excerpt'}:{publishedDate:'2026-10-02'})},{url:'file:///secret'}],costDollars:{total:.007},usage:{credits:1}};
  const provider=new ApiProvider(id,{fetcher:async(url,init)=>{request={url,...init};return reply(data);},now:()=>time});
  const output=await provider.search('今天新聞','fake-key-value',{limit:3});
  assert.equal(request.method,'POST');assert.equal(request.redirect,'error');assert.equal(output.results.length,1);
  const body=JSON.parse(request.body);assert.equal(body.query,'今天新聞');
  if(id==='exa'){assert.equal(request.url,'https://api.exa.ai/search');assert.equal(body.type,'auto');assert.equal(body.contents,undefined);assert.equal(output.results[0].coverage,'headline-only');assert.equal(request.headers['x-api-key'],'fake-key-value');}
  if(id==='tavily'){assert.equal(body.search_depth,'basic');assert.equal(body.auto_parameters,false);assert.equal(body.include_raw_content,false);assert.equal(body.include_answer,false);assert.equal(body.include_usage,true);}
  if(id==='firecrawl'){assert.equal(request.url,'https://api.firecrawl.dev/v2/search');assert.equal(body.scrapeOptions,undefined);assert.deepEqual(body.sources,['web']);assert.equal(output.results[0].coverage,'search-excerpt');}
 }
});
test('usage APIs honor account AND key limits, reject paid paths, preserve Firecrawl billing cycle',async()=>{
 const tavily=new ApiProvider('tavily',{now:()=>time,fetcher:async()=>reply({key:{limit:1000,usage:950},account:{plan_limit:1000,plan_usage:100,paygo_limit:0}})});
 assert.equal((await tavily.usage('fake-key')).remaining,50);
 tavily.fetcher=async()=>reply({key:{limit:1000,usage:0},account:{plan_limit:15000,plan_usage:0,paygo_limit:0}});
 await assert.rejects(tavily.usage('fake-key'),{code:'paid_plan'});
 const start=Date.UTC(2026,8,15),end=Date.UTC(2026,9,15);
 const fire=new ApiProvider('firecrawl',{now:()=>time,fetcher:async()=>reply({success:true,data:{remainingCredits:100,planCredits:1000,billingPeriodStart:new Date(start).toISOString(),billingPeriodEnd:new Date(end).toISOString()}})});
 assert.deepEqual(await fire.usage('fake-key'),{start,end,remaining:100,unit:'credits'});
 assert.equal(await new ApiProvider('exa').usage('fake-key'),null);
});
test('auth, key-budget, quota, rate limit and server errors are distinct and never echo a key',async()=>{
 for(const [id,status,code] of [['exa',402,'key_budget'],['tavily',432,'quota'],['firecrawl',402,'quota'],['tavily',401,'auth'],['exa',403,'auth'],['firecrawl',500,'unavailable'],['exa',429,'rate_limit']]){
  const p=new ApiProvider(id,{fetcher:async()=>reply({error:'secret-key-string'},status,{'retry-after':'120'})});
  await assert.rejects(p.search('query','secret-key-string'),e=>{assert.equal(e.code,code);assert.ok(!e.message.includes('secret-key-string'));if(code==='rate_limit')assert.equal(e.retryMs,120000);return true;});
 }
});
test('deadline bounds a fetch or body that never settles; oversized JSON rejected',async()=>{
 for(const fetcher of [async()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){}}))]){
  const p=new ApiProvider('exa',{fetcher});const start=Date.now();await assert.rejects(p.search('query','fake-key',{timeoutMs:30}),{code:'timeout'});assert.ok(Date.now()-start<500);
 }
 const p=new ApiProvider('exa',{fetcher:async()=>reply({results:[]},200,{'content-length':'2000001'})});await assert.rejects(p.search('q','fake-key'),{code:'invalid'});
});
test('one provider at a time; repeated successful queries stay on primary and cache',async()=>{
 const {router,calls}=fixture();try{await router.search('alpha');await router.search('beta');const cached=await router.search('alpha');assert.deepEqual(calls,['exa','exa']);assert.equal(cached.cache_hit,true);}finally{await router.close();}
});
test('429 only cools down; next provider succeeds and priority returns after cooldown',async()=>{
 let now=time;const {router,calls,store,providers}=fixture({now:()=>now,fail:{exa:new SearchError('rate_limit',2000)}});
 try{assert.equal((await router.search('first')).provider_id,'tavily');assert.equal(store.get('exa').disabledUntil,time+2000);await router.search('second');assert.equal(calls.filter(c=>c==='exa').length,1);now+=2001;providers.exa.search=async()=>{calls.push('exa');return result('exa');};assert.equal((await router.search('third')).provider_id,'exa');}finally{await router.close();}
});
test('missing keys, both exhausted, all exhausted and disabled settings produce no extra calls',async()=>{
 const none=fixture({credentials:new Secrets()});try{await assert.rejects(none.router.search('test'),{code:'SEARCH_NOT_CONFIGURED'});assert.equal(none.calls.length,0);}finally{await none.router.close();}
 const f=fixture();try{const settings=f.store.settings();settings.providers.exa.cap=0;settings.providers.tavily.cap=0;f.store.saveSettings(settings);
  assert.equal((await f.router.search('test')).provider_id,'firecrawl');assert.ok(!f.calls.includes('exa')&&!f.calls.includes('tavily'));
  settings.providers.firecrawl.cap=0;f.store.saveSettings(settings);await assert.rejects(f.router.search('different'),{code:'SEARCH_UNAVAILABLE'});
  settings.enabled=false;f.store.saveSettings(settings);await assert.rejects(f.router.search('blocked'),{code:'SEARCH_NOT_CONFIGURED'});
 }finally{await f.router.close();}
});
test('quota and unknown Exa 402 persist across restart; 402 never automatically clears at month change',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-search-state-'));let now=time;
 const secrets=new Secrets({exa:'fake-exa-key'});
 const first=fixture({dir,credentials:secrets,now:()=>now,fail:{exa:new SearchError('key_budget')}});
 try{await assert.rejects(first.router.search('test'));assert.equal(first.store.get('exa').reason,'key_budget');}finally{await first.router.close();}
 const second=fixture({dir,credentials:secrets,now:()=>now});
 try{now=Date.UTC(2026,10,2);await assert.rejects(second.router.search('new month'));assert.equal(second.calls.length,0);
  await assert.rejects(second.router.resumeExa(false));await second.router.resumeExa(true);await second.router.search('verified budget');assert.equal(second.calls[0],'exa');
 }finally{await second.router.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('local usage cap survives restart; reset verifies official balance before enabling',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-search-month-'));let now=time;const credentials=new Secrets({tavily:'fake-tavily-key'});
 let f=fixture({dir,credentials,now:()=>now});const settings=f.store.settings();settings.providers.tavily.cap=1;f.store.saveSettings(settings);
 await f.router.search('first');await f.router.close();f=fixture({dir,credentials,now:()=>now});
 try{await assert.rejects(f.router.search('second'));assert.equal(f.store.get('tavily').used,1);assert.equal(f.calls.length,0);
  now=Date.UTC(2026,10,1);f.providers.tavily.usage=async()=>{f.calls.push('usage');return {...monthPeriod(now),remaining:0};};await assert.rejects(f.router.search('reset but still empty'));assert.ok(!f.calls.includes('tavily'));
  f.providers.tavily.usage=async()=>({...monthPeriod(now),remaining:900});await f.router.refreshUsage('tavily');await f.router.search('official confirmed');assert.equal(f.store.get('tavily').used,1);
 }finally{await f.router.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('official Firecrawl period does not reset on calendar month or merely changing a key',async()=>{
 let now=time;const f=fixture({now:()=>now,credentials:new Secrets({firecrawl:'fake-firecrawl-key'})});
 const start=Date.UTC(2026,8,20),end=Date.UTC(2026,10,20);f.providers.firecrawl.usage=async()=>({start,end,remaining:100});
 try{await f.router.search('first');now=Date.UTC(2026,10,1);await f.router.search('second');assert.equal(f.store.get('firecrawl').used,4);
  f.router.configure({settings:f.store.settings(),keys:{firecrawl:'different-fake-key'}});await f.router.search('third');assert.equal(f.store.get('firecrawl').used,6);
 }finally{await f.router.close();}
});
test('failed request remains reserved; actual usage larger than estimate reconciles upward',async()=>{
 const f=fixture({fail:{exa:new SearchError('unavailable')}});try{await f.router.search('first');assert.equal(f.store.get('exa').used,.007);
  f.providers.tavily.search=async()=>({...result('tavily'),usage:{units:2}});await f.router.search('second');assert.equal(f.store.get('tavily').used,3);
 }finally{await f.router.close();}
});
test('concurrent duplicate queries share a single paid request, even through two router instances',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-search-concurrent-'));
 const calls=[],a=fixture({dir,calls}),b=fixture({dir,calls});
 a.providers.exa.search=async()=>{calls.push('exa');await new Promise(r=>setTimeout(r,50));return result('exa');};
 try{const outputs=await Promise.all([a.router.search('same'),a.router.search('same'),b.router.search('same')]);assert.equal(calls.length,1);outputs[0].results[0].title='mutated';assert.notEqual(outputs[1].results[0].title,'mutated');assert.equal(a.store.get('exa').requests,1);}finally{await Promise.all([a.router.close(),b.router.close()]);fs.rmSync(dir,{recursive:true,force:true});}
});
test('atomic reservations prevent two instances from overspending the last allowed request',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-search-cap-'));const credentials=new Secrets({exa:'fake-exa-key'}),calls=[];
 const a=fixture({dir,credentials,calls}),b=fixture({dir,credentials,calls});const settings=a.store.settings();settings.providers.exa.cap=.007;a.store.saveSettings(settings);
 try{const results=await Promise.allSettled([a.router.search('A'),b.router.search('B')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(calls,['exa']);}finally{await Promise.all([a.router.close(),b.router.close()]);fs.rmSync(dir,{recursive:true,force:true});}
});
test('settings order and keys persist; auth cleared by new key; status never exposes keys',async()=>{
 const f=fixture({fail:{exa:new SearchError('auth')}});try{await f.router.search('first');const settings=f.store.settings();settings.order=['firecrawl','tavily','exa'];
  const status=f.router.configure({settings,keys:{exa:'another-fake-secret'}});assert.equal(f.store.get('exa').reason,null);assert.equal(f.store.get('exa').used,.007);assert.ok(!JSON.stringify(status).includes('another-fake-secret'));
  assert.equal((await f.router.search('second')).provider_id,'firecrawl');
  f.router.configure({settings,clearKeys:['firecrawl']});assert.equal(f.router.status().providers[0].hasKey,false);
  assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,order:['exa','exa','tavily']}));assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,providers:{...DEFAULT_SETTINGS.providers,exa:{enabled:true,cap:100}}}));
 }finally{await f.router.close();}
});
test('Qwen false cannot search; true allows only initial plus one supplement and a bounded turn',()=>{
 assert.throws(()=>searchTurnBudget({needs_search:false}).claim(),/Qwen/);
 let now=time;const budget=searchTurnBudget({needs_search:true},()=>now);budget.claim();budget.claim();assert.throws(()=>budget.claim(),/兩次/);
 const expired=searchTurnBudget({needs_search:true},()=>now);expired.claim();now+=60001;assert.throws(()=>expired.claim(),/時限/);
});
test('browser close for idle keeps rotation reusable; complete shutdown is idempotent',async()=>{
 const f=fixture(),browser=new BrowserAgent({searchService:f.router});
 try{await browser.search('before idle');await browser.close();assert.equal(f.router.status().configured,true);await browser.search('after waking');assert.deepEqual(f.calls,['exa','exa']);}
 finally{await f.router.close();await f.router.close();await browser.close();}
});
test('cancelling an in-flight search does not start another provider or disable the primary',async()=>{
 const f=fixture();let begun;const started=new Promise(r=>begun=r);
 f.providers.exa.search=async(_q,_k,{signal})=>{f.calls.push('exa');begun();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new SearchError('timeout')),{once:true}));};
 try{const request=f.router.search('cancel test');const rejected=assert.rejects(request,{name:'AbortError'});await started;await f.router.cancel();await rejected;assert.deepEqual(f.calls,['exa']);assert.equal(f.store.get('exa').reason,null);assert.equal(f.store.get('exa').used,.007);
  f.providers.exa.search=async()=>result('exa');assert.equal((await f.router.search('after cancelling')).provider_id,'exa');
 }finally{await f.router.close();}
});
test('Windows DPAPI round-trip contains no plaintext key and is never remotely shared',{skip:process.platform!=='win32'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-search-key-'));
 try{const s=new SearchCredentials(dir);s.save({exa:'not-a-real-secret-key'});assert.deepEqual(s.load(),{exa:'not-a-real-secret-key'});assert.ok(!fs.readFileSync(s.file,'utf8').includes('not-a-real-secret-key'));
  const shared=new SharedFiles(dir);await shared.add(dir);await assert.rejects(shared.allowed(s.file));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
