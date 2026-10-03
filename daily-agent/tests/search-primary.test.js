import test from 'node:test';
import assert from 'node:assert/strict';
import {FastPageReader} from '../browser/FastPageReader.js';
import {crossCheckFacts,gateQualityWithFacts} from '../browser/SearchFacts.js';
import {assessSearchQuality,rankSearchResults} from '../browser/SearchQuality.js';
import {planQueries,freshnessRange} from '../browser/SearchPlanner.js';
import {SearXNGProvider,LightSearchBrowser} from '../browser/SearXNGProvider.js';

const gpu='RTX 5090 台灣 現在價格';
const fixture=(url,title,body,extra={})=>({url,title,body,reliability:'primary',coverage:'page',...extra});
const localReader=html=>new FastPageReader({fetcher:async()=>({ok:true,status:200,headers:new Headers({'content-type':'text/html'}),text:async()=>html})});
test('evergreen multi-vendor GPU setup searches keep primary docs without a week filter',()=>{
 const q='Windows 11 WSL GPU Docker NVIDIA latest setup';
 assert.equal(freshnessRange(q),null);
 assert.ok(planQueries(q).queries.some(x=>x.includes('docs.docker.com')));
 assert.ok(planQueries(q).queries.some(x=>x.includes('docs.nvidia.com')));
});
test('Godot C# Android targets migration requirements instead of release notes',()=>{
 const queries=planQueries('Godot 4.5 C# Android export official docs').queries;
 assert.ok(queries.some(x=>x.includes('migration requirements')));
 assert.ok(queries.every(x=>!x.includes('release notes')));
});
test('official vendor substring does not establish source ownership',()=>{
 const rows=rankSearchResults([{url:'https://maxon-download-unofficial.example/zbrush',title:'ZBrush',score:100}], 'ZBrush official');
 assert.equal(rows[0].reliability,'standard');
});
test('HTML and markdown versions of one document are deduplicated',()=>{
 const rows=rankSearchResults([
  {url:'https://developers.cloudflare.com/workers-ai/platform/pricing/',title:'Cloudflare pricing'},
  {url:'https://developers.cloudflare.com/workers-ai/platform/pricing/index.md',title:'Cloudflare pricing'}
 ],'Cloudflare pricing');
 assert.equal(rows.length,1);
});
test('generic WSL containers cannot establish HIGH evidence for NVIDIA GPU Docker',()=>{
 const q=assessSearchQuality([fixture('https://learn.microsoft.com/wsl','WSL containers','WSL containers use wslc.exe')], 'Windows WSL GPU Docker NVIDIA latest setup',{fullText:true});
 assert.equal(q.confidence,'MEDIUM');assert.ok(q.evidence_gates.includes('missing-query-topics'));
});
test('two news subdomains from the same publisher do not establish independence',()=>{
 const q=assessSearchQuality([
  fixture('https://technews.tw/a','AI news','AI',{date:'2026-10-02T23:00:00Z',reliability:'trusted'}),
  fixture('https://finance.technews.tw/b','AI news','AI',{date:'2026-10-02T23:00:00Z',reliability:'trusted'})
 ],'今天 AI 新聞',{fullText:true});
 assert.equal(q.independent_domains,1);assert.equal(q.confidence,'MEDIUM');
});
test('unread primary excerpts cannot establish HIGH confidence',()=>{
 assert.equal(assessSearchQuality([fixture('https://www.maxon.net/zbrush','ZBrush','excerpt',{coverage:'search-excerpt'})],'ZBrush').confidence,'MEDIUM');
});
test('Fast Reader uses nested main content and retains article dates',async()=>{
 const html='<html><head><title>AI update</title><meta property="article:published_time" content="2026-10-03T01:00:00Z"><script type="application/ld+json">'+JSON.stringify({'@type':'Article',dateModified:'2026-10-03T02:00:00Z'})+'</script></head><body><div>NOISY NAVIGATION</div><main><div><div>'+('Actual evidence '.repeat(30))+'</div></div></main><div>UNRELATED FOOTER</div></body></html>';
 const p=await localReader(html).open('https://93.184.216.34/test');
 assert.doesNotMatch(p.body,/NOISY|FOOTER/);assert.match(p.body,/Actual evidence/);
 assert.equal(p.date,'2026-10-03T01:00:00Z');assert.equal(p.modified_at,'2026-10-03T02:00:00Z');
});
test('Fast Reader cancels oversized streaming HTML before reading the rest',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});
 const p=new FastPageReader({maxBytes:1500,fetcher:async()=>new Response(stream,{headers:{'content-type':'text/html'}})});
 await assert.rejects(p.open('https://93.184.216.34/test'),/page too large/);assert.equal(cancelled,true);
});
test('Fast Reader respects cancellation before any network read',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const p=new FastPageReader({fetcher:async()=>{calls++;}});
 await assert.rejects(p.open('https://93.184.216.34/test',{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
});
test('dated launch prices do not contaminate current Taiwan price evidence',()=>{
 const facts=crossCheckFacts(gpu,[
  fixture('https://coolpc.com.tw/launch','RTX 5090 上市','@2025/01/30\nRTX 5090 NT$ 71990'),
  fixture('https://autobuy.tw/product','RTX 5090','RTX 5090',{products:[{name:'RTX 5090 32G',price:159990,currency:'TWD'}]})
 ],{now:Date.parse('2026-10-03')});
 assert.equal(facts.price.observed_min,159990);assert.equal(facts.price.stale_sources.length,1);
 assert.equal(facts.price.verified,false);assert.equal(gateQualityWithFacts({confidence:'HIGH'},facts).confidence,'MEDIUM');
});
test('unavailable, bundled and foreign-currency offers do not establish a Taiwan standalone price',()=>{
 const facts=crossCheckFacts(gpu,[fixture('https://autobuy.tw/gpu','RTX 5090','RTX 5090',{products:[
  {name:'RTX 5090',price:100000,currency:'USD'},
  {name:'RTX 5090',price:89990,currency:'TWD',availability:'https://schema.org/OutOfStock'},
  {name:'【限整機】RTX 5090',price:99990,currency:'TWD'},
  {name:'RTX 5090',price:159990,currency:'TWD'}
 ]})]);
 assert.equal(facts.price.observed_min,159990);assert.equal(facts.price.candidates.some(x=>x.value===100000),false);
 assert.equal(gateQualityWithFacts({confidence:'HIGH'},facts).confidence,'MEDIUM');
});
test('product versions reject adjacent dependencies, IP addresses and unrelated SDK versions',()=>{
 const facts=crossCheckFacts('Godot latest version official',[
  fixture('https://godotengine.org/news','Godot 4.5.2','Godot 4.5.2 requires .NET 9.0 and JDK 17.0. Address 192.168.1.1')
 ]);
 assert.equal(facts.version.consensus,'4.5.2');assert.equal(facts.version.candidates.length,1);
});
test('vendor subdomains are one fact witness and conflicting versions are gated',()=>{
 const facts=crossCheckFacts('ZBrush latest version official',[
  fixture('https://maxon.net/a','ZBrush 2026.2.1',''),fixture('https://support.maxon.net/b','ZBrush 2026.2.1',''),
  fixture('https://maxon.net/old','ZBrush 2023.2','')
 ]);
 assert.equal(facts.version.candidates.find(x=>x.value==='2026.2.1').support,1);
 assert.equal(gateQualityWithFacts({confidence:'HIGH'},facts).confidence,'MEDIUM');
});
test('latest setup is not mistaken for a version lookup',()=>{
 assert.equal(crossCheckFacts('Windows 11 WSL GPU Docker NVIDIA latest setup',[fixture('https://microsoft.com/wsl','WSL 2.9.3','')]).version,undefined);
});
test('publisher RSS survives a Google RSS outage',async()=>{
 const now=new Date('2026-10-03T00:00:00Z');
 const p=new SearXNGProvider({endpoint:'http://localhost:8888',now:()=>now,fetcher:async url=>{
  if(url.hostname==='news.google.com')throw Error('outage');
  if(url.hostname==='localhost')return {ok:true,json:async()=>({results:[]})};
  return {ok:true,text:async()=>'<rss><channel><item><title>AI update</title><link>https://technews.tw/a</link><pubDate>Fri, 02 Oct 2026 23:00:00 GMT</pubDate></item></channel></rss>'};
 }});
 const result=await p.search('今天 AI 新聞');assert.match(result.provider,/Publisher RSS/);assert.ok(result.results.length>0);
});
test('news resolution rejects a near-match on the wrong publisher',async()=>{
 const p=new SearXNGProvider({endpoint:'http://localhost:8888',fetcher:async()=>({ok:true,json:async()=>({results:[{title:'AI model launched worldwide',url:'https://wrong.example/article'}]})})});
 p.controller=new AbortController();
 const item={title:'AI model launched worldwide',url:'https://news.google.com/rss/a',source_url:'https://technews.tw'};
 assert.equal((await p.resolveNewsArticle(item)).url,item.url);
});
test('full page retains RSS publication time if the reader cannot extract one',async()=>{
 const date='2026-10-02T23:00:00Z';
 const provider={endpoint:'local',controller:new AbortController(),async search(){return {results:[fixture('https://cna.com.tw/a','AI news','excerpt',{date})]};},cancel(){}};
 const browser={async open(){return {title:'AI news',body:'AI details',date:null,coverage:'page'};},async close(){}};
 const r=await new LightSearchBrowser(provider,browser).search('AI news');assert.equal(r.results[0].date,date);
});
test('Light Search serializes different queries and deduplicates identical requests',async()=>{
 let calls=0,active=0,max=0;
 const provider={endpoint:'local',async search(query){calls++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,10));active--;return {results:[fixture('https://maxon.net/a',query,query)]};},cancel(){}};
 const browser={async open(url){return {url,title:'Alpha Beta',body:'Alpha Beta evidence',coverage:'page'};},async close(){}};
 const b=new LightSearchBrowser(provider,browser);
 const rows=await Promise.all([b.search('Alpha'),b.search('Alpha'),b.search('Beta')]);
 assert.equal(calls,2);assert.equal(max,1);rows[0].results[0].body='mutated';assert.notEqual(rows[1].results[0].body,'mutated');
});
test('close during HTTP reading cancels results, queued work and cache writes',async()=>{
 let release,opened;const began=new Promise(r=>opened=r);let calls=0;
 const provider={endpoint:'local',async search(){calls++;return {results:[fixture('https://maxon.net/a','Alpha','Alpha')]};},cancel(){}};
 const browser={async close(){},async encyclopediaSearch(){throw Error('must not fallback');}};
 const b=new LightSearchBrowser(provider,browser,{fastReader:{async open(){opened();await new Promise(r=>release=r);return {body:'Alpha',coverage:'page'};}}});
 const task=b.search('Alpha'),queued=b.search('Beta');const checked=Promise.allSettled([task,queued]);
 await began;await b.close();release();const r=await checked;
 assert.ok(r.every(x=>x.status==='rejected'&&x.reason.name==='AbortError'));assert.equal(b.cache.size,0);assert.equal(calls,1);
});
