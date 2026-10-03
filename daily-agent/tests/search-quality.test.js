import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSearchQuality, engineRoute, rankSearchResults } from '../browser/SearchQuality.js';

test('engine routing avoids blocked default engines', () => {
  assert.equal(engineRoute('RTX 5090 台灣 價格'), 'google cse,yahoo,yep,bing');
  assert.equal(engineRoute('Remnant 2 wiki.gg 攻略'), 'google cse,yahoo,yep,bing');
  assert.equal(engineRoute('ZBrush latest version official'), 'google cse,yahoo,yep,bing');
  assert.equal(engineRoute('今天 AI 新聞'), 'google cse,yahoo,yep,bing');
});

test('explicit game wiki outranks a higher raw-score forum result', () => {
  const rows = [
    { title:'巴哈攻略', url:'https://forum.gamer.com.tw/a', score:5 },
    { title:'Ritualist Scythe', url:'https://remnant2.wiki.gg/wiki/Ritualist_Scythe', score:1 },
    { title:'Fextra', url:'https://remnant2.wiki.fextralife.com/Ritualist_Scythe', score:3 },
  ];
  const ranked = rankSearchResults(rows, 'Remnant 2 Ritualist Scythe wiki.gg', { limit:3 });
  assert.equal(new URL(ranked[0].url).hostname, 'remnant2.wiki.gg');
  assert.equal(ranked[0].reliability, 'primary');
});

test('Taiwan price routing prefers direct retailers over articles and aggregators', () => {
  const rows = [
    { title:'RTX 5090 新聞', url:'https://example.com/article', score:4 },
    { title:'RTX 5090', url:'https://24h.pchome.com.tw/store/DRADTN', score:1 },
    { title:'比價', url:'https://feebee.com.tw/s/rtx5090', score:2 },
  ];
  const ranked = rankSearchResults(rows, 'RTX 5090 台灣 價格', { limit:3 });
  assert.equal(new URL(ranked[0].url).hostname, '24h.pchome.com.tw');
});

test('official and government sources beat generic high-score pages', () => {
  const z = rankSearchResults([
    {title:'Blog',url:'https://example.com/zbrush',score:6},
    {title:'ZBrush',url:'https://www.maxon.net/en/zbrush',score:1},
  ], 'ZBrush latest version official');
  assert.equal(new URL(z[0].url).hostname, 'www.maxon.net');
  const gov = rankSearchResults([
    {title:'Blog',url:'https://example.com/interior',score:5},
    {title:'建築物室內裝修許可 - 國土署',url:'https://www.nlma.gov.tw/ch/singlewindow/contact/14',content:'室內裝修許可申請流程',score:0.5},
  ], '台灣 室內裝修 許可 官方');
  assert.equal(new URL(gov[0].url).hostname, 'www.nlma.gov.tw');
});

test('ranking diversifies duplicate hosts and quality reports full primary evidence', () => {
  const rows = Array.from({length:5},(_,i)=>({title:'A'+i,url:'https://same.example.com/'+i,score:5-i}))
    .concat([{title:'B',url:'https://other.example.org/b',score:0.1}]);
  const ranked = rankSearchResults(rows, 'test', { limit:5 });
  assert.equal(ranked.filter(r=>new URL(r.url).hostname==='same.example.com').length, 2);
  const q = assessSearchQuality([{
    title:'國土署',url:'https://www.nlma.gov.tw/a',coverage:'page',reliability:'primary'
  }], '台灣 室內裝修 許可 官方', { fullText:true });
  assert.equal(q.confidence, 'HIGH');
  assert.equal(q.full_pages, 1);
});
