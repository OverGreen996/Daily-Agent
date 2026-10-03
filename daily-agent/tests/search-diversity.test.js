import test from 'node:test';
import assert from 'node:assert/strict';
import {newsRelevant,compactQuery} from '../browser/QueryText.js';
import {planQueries} from '../browser/SearchPlanner.js';
import {rankSearchResults,sourceReliability,assessSearchQuality} from '../browser/SearchQuality.js';
import {gameEvidence} from '../browser/GameSearch.js';
import {SearXNGProvider} from '../browser/SearXNGProvider.js';

test('a region mention cannot substitute for the requested news subject',()=>{
 assert.equal(newsRelevant({title:'台灣最新軍事新聞'},'今天 台灣 地震 新聞'),false);
 assert.equal(newsRelevant({title:'花蓮地震 規模5.1'},'今天 台灣 地震 新聞'),true);
 assert.equal(newsRelevant({title:'美國國際經濟消息'},'今天 日本 國際 新聞'),false);
 assert.equal(newsRelevant({title:'台灣便利超商促銷'},'今天 AI 新聞'),false);
});
test('long queries are reduced locally while preserving technical constraints',()=>{
 const q='我想在自己的電腦使用 Docker 跑需要 NVIDIA 顯示卡的 Linux 容器，系統是 Windows 11，請查官方文件說明 WSL 2 GPU 設定與限制';
 const p=planQueries(q);assert.ok(p.queries[0].length<q.length);
 for(const token of ['Docker','NVIDIA','Linux','Windows 11','WSL 2','GPU'])assert.ok(p.queries[0].includes(token));
 assert.ok(p.queries.some(q=>q.includes('site:docs.nvidia.com')));
 assert.match(compactQuery('Godot 4.5 C# Android .NET JDK'),/4.5 C# Android .NET JDK/);
});
test('phone price expansion never injects a GPU product category',async()=>{
 const queries=[];
 const p=new SearXNGProvider({endpoint:'http://localhost:8888',fetcher:async url=>{
  queries.push(url.searchParams.get('q'));return {ok:true,json:async()=>({results:[{title:'iPhone 17 Pro 256GB',url:'https://24h.pchome.com.tw/prod/phone',content:'Apple iPhone 17 Pro 256GB'}]})};
 }});
 await p.search('台灣 iPhone 17 Pro 256GB 現在價格');
 assert.ok(queries.some(q=>q.includes('site:momoshop.com.tw')));assert.ok(queries.every(q=>!/GPU|顯示卡|site:coolpc/.test(q)));
});
test('known maintained wikis outrank anonymous wiki-shaped SEO domains',()=>{
 const r=rankSearchResults([
  {title:'Baldur Gate 3 honour mode legendary actions',url:'https://gamers.wiki/bg3-honour',score:3},
  {title:'Baldur Gate 3 honour mode legendary actions',url:'https://bg3.wiki/wiki/Honour_mode',score:1}
 ],'Baldur Gate 3 honour mode legendary actions PC');
 assert.ok(r[0].url.startsWith('https://bg3.wiki/'));
 assert.equal(sourceReliability('https://minecraft-guide.wiki/facts','Minecraft official guide'),'standard');
 assert.equal(sourceReliability('https://example.com/facts','site:example.com facts'),'standard');
 assert.equal(sourceReliability('https://www.blender.org/download/','Blender latest stable official'),'primary');
});
test('two unread trusted snippets cannot become HIGH confidence',()=>{
 assert.notEqual(assessSearchQuality([
  {url:'https://apnews.com/a',coverage:'search-excerpt',reliability:'trusted'},
  {url:'https://bbc.com/b',coverage:'search-excerpt',reliability:'trusted'}
 ],'facts').confidence,'HIGH');
});
test('a dated old wiki index is not current official patch evidence',()=>{
 const e=gameEvidence('Remnant 2 latest build',[],[{title:'Game updates',url:'https://remnant2.wiki.gg/wiki/Game_updates',coverage:'page',reliability:'primary',date:'2023-07-22'}]);
 assert.equal(e.update_status,'not-verified');assert.equal(e.compatibility_verified,false);
});
