import test from 'node:test';
import assert from 'node:assert/strict';
import {SearXNGProvider} from '../browser/SearXNGProvider.js';
import {withSearchSources} from '../core/SearchReply.js';
test('today news uses concise keywords, news category and day range; excludes stale and undated hits',async()=>{
  const now=new Date(2026,8,28,8);
  const p=new SearXNGProvider({endpoint:'http://localhost:8888',now:()=>now,fetcher:async url=>{
    assert.equal(url.searchParams.get('q'),'artificial intelligence');
    assert.equal(url.searchParams.get('categories'),null);
    assert.equal(url.searchParams.get('engines'),'google cse,yahoo,yep,bing');
    assert.equal(url.searchParams.get('time_range'),'day');
    return {ok:true,json:async()=>({results:[
      {url:'https://example.com/old',publishedDate:new Date(+now-7*86400000).toISOString()},
      {url:'https://example.com/unknown'},
      {url:'https://example.com/future',publishedDate:new Date(+now+86400000).toISOString()},
      {url:'https://example.com/today',title:'AI update',publishedDate:new Date(+now-3600000).toISOString()},
      {url:'https://example.com/yesterday',title:'AI update',publishedDate:new Date(+now-12*3600000).toISOString()},
    ]})};
  }});
  const r=await p.search('幫我搜尋今天的 AI 新聞，附上來源連結。');
  assert.deepEqual(r.results.map(r=>r.freshness),['today','last-24-hours-not-today']);
});
test('empty news results distinguish lack of verified dates from network failure',async()=>{
  const p=new SearXNGProvider({endpoint:'http://localhost:8888',fetcher:async()=>({ok:true,json:async()=>({results:[]})})});
  await assert.rejects(p.search('今天新聞'),/已連上 SearXNG/);
});
test('plain news replies always include missing source URLs once and preserve code',()=>{
  const sources=[{title:'News',url:'https://example.com/news'}];
  const text=withSearchSources('**新聞**\n* 內容\n```a**b**```',sources);
  assert.ok(text.startsWith('新聞\n• 內容'));
  assert.ok(text.includes('```a**b**```'));
  assert.ok(text.includes(sources[0].url));
  assert.equal(withSearchSources(text,sources),text);
});


test('undated local news uses dated RSS headlines',async()=>{
 const now=new Date('2026-09-28T06:00:00Z');let calls=0;
 const p=new SearXNGProvider({endpoint:'http://localhost:8888',now:()=>now,fetcher:async url=>{calls++;return url.hostname==='localhost'?{ok:true,json:async()=>({results:[{title:'台中消息',url:'https://example.com/local'}]})}:{ok:true,text:async()=>'<rss><channel><item><title>台中新聞</title><link>https://example.com/today</link><pubDate>Mon, 28 Sep 2026 05:00:00 GMT</pubDate><source>報社</source></item></channel></rss>'};}});
 const r=await p.search('今天台中頭條新聞');assert.ok(calls>=2);assert.ok(['headline-only','search-excerpt'].includes(r.results[0].coverage));assert.equal(r.results[0].freshness,'today');
});
test('RSS outage keeps safe undated links, cancellation stops fallback',async()=>{
 const p=new SearXNGProvider({endpoint:'http://localhost:8888',fetcher:async url=>{if(url.hostname!=='localhost')throw Error('offline');return {ok:true,json:async()=>({results:[{title:'地方新聞',url:'https://example.com/a'},{title:'bad',url:'javascript:bad'}]})};}});
 const r=await p.search('今天台中新聞');assert.equal(r.results.length,1);assert.equal(r.results[0].freshness,'unverified-date');p.controller.abort();await assert.rejects(p.newsFallback('新聞',3),{name:'AbortError'});
});

test('headline-only results ignore invented model details and format timestamp with zone',()=>{
 const reply=withSearchSources('今天清晨六點發布而且很受歡迎',[{title:'新聞原標題',url:'https://example.com/a',date:'2026-09-28T06:00:00Z',coverage:'headline-only'}]);assert.match(reply,/新聞原標題/);assert.match(reply,/尚未讀取全文/);assert.doesNotMatch(reply,/很受歡迎|清晨/);assert.ok(reply.includes(Intl.DateTimeFormat().resolvedOptions().timeZone));
});
