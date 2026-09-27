import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserAgent,assertReadablePage} from '../browser/BrowserAgent.js';
import {LightSearchBrowser,SearXNGProvider} from '../browser/SearXNGProvider.js';
import {LightWebLookup,entityKey} from '../idle/LightWebLookup.js';
import {parseConversationControl} from '../core/ConversationControls.js';

test('validation pages and HTTP failures are not accepted as source text',()=>{
  assert.throws(()=>assertReadablePage({title:'Just a moment...',body:'Checking your browser'},200),/驗證/);
  assert.throws(()=>assertReadablePage({title:'error',body:'Bad request'},403),/403/);
  assert.throws(()=>assertReadablePage({title:'',body:''}),/文字/);
  assert.equal(assertReadablePage({title:'Archicad',body:'BIM software'}).title,'Archicad');
});
test('local search deduplicates, serializes different queries, caches defensively and expires',async()=>{
  const b=new BrowserAgent();let calls=0,active=0,max=0;
  b.searchUncached=async query=>{calls++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,10));active--;return {query,results:[{body:'verified'}]};};
  const [a,c]=await Promise.all([b.search('Alpha'),b.search('Alpha'),b.search('Beta')]);
  assert.equal(calls,2);assert.equal(max,1);a.results[0].body='changed';assert.equal(c.results[0].body,'verified');
  assert.equal((await b.search('Alpha')).cache_hit,true);
  for(const cached of b.cache.values())cached.expires=0;
  await b.search('Alpha');assert.equal(calls,3);await b.close();
});
test('closing browser cancels queued searches and prevents post-close cache writes',async()=>{
  const b=new BrowserAgent();let release,calls=0;
  b.searchUncached=async()=>{calls++;await new Promise(r=>release=r);return {results:[]};};
  const first=b.search('one'),second=b.search('two');
  const results=Promise.allSettled([first,second]);
  await new Promise(r=>setImmediate(r));await b.close();release();
  assert.ok((await results).every(r=>r.status==='rejected' && r.reason.name==='AbortError'));
  assert.equal(calls,1);assert.equal(b.cache.size,0);
});
test('official link discovery checks beyond the first hundred page links',async()=>{
  const b=new BrowserAgent();const visited=[];
  b.open=async url=>{visited.push(url);b.lastResponse={text:async()=>JSON.stringify({query:{search:[{title:'Archicad'}]}})};return {url,body:'BIM software'};};
  b.get_links=async({limit})=>{assert.ok(limit>100);return [{url:'https://graphisoft.com/archicad',text:'Official'}];};
  const r=await b.encyclopediaSearch('Archicad software site:graphisoft.com',1);
  assert.equal(r.results[0].url,'https://graphisoft.com/archicad');assert.equal(visited.length,3);await b.close();
});
test('Idle works without SearXNG, uses bounded public sources and always closes browser',async()=>{
  let calls=0,closed=0;
  const b=new LightSearchBrowser(new SearXNGProvider(),{
    async encyclopediaSearch(query,limit){calls++;assert.equal(limit,2);return {provider:'public',results:[{body:'read'}]};},
    async close(){closed++;}
  });
  assert.equal(b.status().configured,true);assert.equal(b.status().paid,false);
  assert.equal((await b.search('Archicad',{limit:2})).results.length,1);
  assert.equal(calls,1);assert.equal(closed,1);
});
test('SearXNG outage falls back, while cancellation never starts fallback',async()=>{
  let fallback=0,closed=0;
  const provider={endpoint:'http://127.0.0.1:8888',async search(){throw Error('unavailable')},cancel(){}};
  const b=new LightSearchBrowser(provider,{async encyclopediaSearch(){fallback++;return {provider:'public',results:[]}},async close(){closed++;}});
  await b.search('Blender');assert.equal(fallback,1);assert.equal(closed,1);
  provider.search=async()=>{throw new DOMException('cancelled','AbortError')};
  await assert.rejects(b.search('Blender'),/cancelled/);assert.equal(fallback,1);assert.equal(closed,2);
});
test('entity learns full source once, deduplicates simultaneous lookup and normalizes process extension',async()=>{
  const saved=new Map();let calls=0;
  const memory={entities:{get:key=>saved.get(key)},async learnEntity(entry){saved.set(entry.entity,entry)}};
  const browser={async search(){calls++;await new Promise(r=>setTimeout(r,10));return {results:[{title:'Archicad',url:'https://graphisoft.com/archicad',body:'BIM software for architectural design',coverage:'page'}]}},async close(){}};
  const lookup=new LightWebLookup(memory,browser);
  const [a,b]=await Promise.all([lookup.lookup('Archicad.exe',{force:true}),lookup.lookup('ARCHICAD',{force:true})]);
  assert.equal(calls,1);assert.equal(saved.size,1);assert.match(a.likely_activity,/BIM/);assert.equal(b.entity,'archicad');
  assert.equal((await lookup.lookup('Archicad.exe')).memory_hit,true);assert.equal(calls,1);
  assert.equal(entityKey('Archicad.EXE'),'archicad');
});
test('snippets and unrelated results never become entity knowledge; failed lookup backs off',async()=>{
  let calls=0,saves=0;
  const lookup=new LightWebLookup({entities:{get(){}},async learnEntity(){saves++;}},
    {async search(){calls++;return {results:[{url:'https://graphisoft.com/archicad',body:'BIM',coverage:'search-excerpt'}]}},async close(){}});
  assert.equal(await lookup.lookup('Archicad.exe'),null);assert.equal(await lookup.lookup('Archicad.exe'),null);
  assert.equal(calls,1);assert.equal(saves,0);
});
test('search status can be requested through conversation',()=>{
  assert.equal(parseConversationControl('查看搜尋狀態').action,'search_status');
  assert.equal(parseConversationControl('解釋搜尋狀態'),null);
});
