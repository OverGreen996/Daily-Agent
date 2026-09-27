import test from 'node:test';
import assert from 'node:assert/strict';
import {SearXNGProvider} from '../browser/SearXNGProvider.js';
import {withSearchSources} from '../core/SearchReply.js';
test('today news uses concise keywords, news category and day range; excludes stale and undated hits',async()=>{
  const now=new Date(2026,8,28,8);
  const p=new SearXNGProvider({endpoint:'http://localhost:8888',now:()=>now,fetcher:async url=>{
    assert.equal(url.searchParams.get('q'),'artificial intelligence');
    assert.equal(url.searchParams.get('categories'),'news');
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

