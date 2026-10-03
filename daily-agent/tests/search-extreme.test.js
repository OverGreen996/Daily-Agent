import test from 'node:test';
import assert from 'node:assert/strict';
import {planQueries,freshnessRange,preferredLanguage} from '../browser/SearchPlanner.js';
import {crossCheckFacts} from '../browser/SearchFacts.js';
import {titleSimilarity} from '../browser/SearchQuality.js';
import {FastPageReader} from '../browser/FastPageReader.js';
import {SearXNGProvider} from '../browser/SearXNGProvider.js';

test('query planner creates bounded targeted variants',()=>{
  const p=planQueries('RTX 5090 台灣 價格');
  assert.equal(p.intent,'price'); assert.ok(p.queries.length>=2&&p.queries.length<=3);
  assert.ok(p.queries.some(q=>/PChome|momo|原價屋/.test(q)));
  assert.equal(freshnessRange('今天 AI 新聞'),'day');
  assert.equal(preferredLanguage('台灣價格'),'zh-TW');
});

test('title similarity rejects unrelated Chinese news and accepts same story',()=>{
  const a='川普擬任命國家情報總監克雷頓擔任 AI 沙皇';
  assert.ok(titleSimilarity(a,'美媒：川普擬任命國家情報總監克雷頓擔任 AI 沙皇')>0.6);
  assert.ok(titleSimilarity(a,'名人書房 楊植麟讀無窮的開始 以解題思維找到創新')<0.4);
});

test('fact cross-check reports price consensus and conflicts',()=>{
  const r=crossCheckFacts('RTX 5090 台灣價格',[
    {url:'https://a.example/x',title:'RTX 5090 NT$ 99,900',body:''},
    {url:'https://b.example/x',title:'RTX 5090 台幣 99,900',body:''},
    {url:'https://c.example/x',title:'RTX 5090 NT$ 139,900',body:''},
  ]);
  assert.equal(r.price.consensus,99900); assert.equal(r.price.conflict,true);
});

test('fast reader extracts static HTML without browser and keeps source metadata',async()=>{
  const html='<html><head><title>Official Page</title><meta name="description" content="desc"></head><body><main><h1>Title</h1><p>'+('Useful content '.repeat(40))+'</p></main><script>bad()</script></body></html>';
  const fetcher=async()=>({ok:true,status:200,headers:new Headers({'content-type':'text/html'}),text:async()=>html});
  const reader=new FastPageReader({fetcher,timeout:1000});
  // Public IP avoids depending on live DNS; fetch itself is mocked.
  const page=await reader.open('https://93.184.216.34/test');
  assert.equal(page.title,'Official Page'); assert.equal(page.reader,'http-fast');
  assert.match(page.body,/Useful content/); assert.doesNotMatch(page.body,/bad\(\)/);
});

test('multi-query fusion adds targeted variants and merges independent sources',async()=>{
  const calls=[];
  const p=new SearXNGProvider({endpoint:'http://127.0.0.1:8888',fetcher:async url=>{
    calls.push(url.searchParams.get('q'));
    const q=url.searchParams.get('q');
    const rows=q.includes('PChome')
      ? [{title:'RTX 5090',url:'https://24h.pchome.com.tw/store/a',content:'NT$ 99,900',score:1,engines:['google cse']}]
      : [{title:'RTX 5090 official',url:'https://www.nvidia.com/zh-tw/geforce/rtx/',content:'GeForce RTX 5090',score:1,engines:['bing']}];
    return {ok:true,json:async()=>({results:rows,unresponsive_engines:[]})};
  }});
  const r=await p.search('RTX 5090 台灣 價格',{limit:5});
  assert.ok(calls.length>=2); assert.ok(r.search_queries.length>=2);
  assert.ok(r.results.some(x=>x.url.includes('pchome')));
  assert.ok(r.results.some(x=>x.url.includes('nvidia')));
});

test('engine health suspends repeatedly failing engines',async()=>{
  let n=0;
  const p=new SearXNGProvider({endpoint:'http://127.0.0.1:8888',fetcher:async()=>({ok:true,json:async()=>({results:[{title:'ok',url:'https://example.org',content:'x',engines:['bing']}],unresponsive_engines:n++<2?[['google cse','timeout']]:[]})})});
  await p.rawSearch('one','test'); await p.rawSearch('two','test');
  assert.ok((p.healthSnapshot()['google cse']?.suspended_until||0)>Date.now());
  assert.doesNotMatch(p.selectEngines('test'),/google cse/);
});


test('price freshness keeps evergreen retailer pages and legal planner targets Taiwan authorities',()=>{
  assert.equal(freshnessRange('RTX 5090 台灣現在價格'),null);
  const p=planQueries('台灣 建築物室內裝修管理辦法 官方');
  assert.equal(p.intent,'legal');
  assert.ok(p.queries.some(q=>q.includes('site:law.moj.gov.tw')));
  assert.ok(p.queries.some(q=>q.includes('site:glrs.moi.gov.tw')));
});

test('price facts bind the requested GPU model and ignore mixed 5080 or restricted child products',()=>{
  const r=crossCheckFacts('RTX 5090 台灣價格',[
    {
      url:'https://www.coolpc.com.tw/gpu',reliability:'primary',
      title:'RTX 5090/5080',
      body:'NVIDIA GeForce RTX 5090/5080 上市\nGeForce RTX 5090 定價 $71990 元起，GeForce RTX 5080 定價 $35990 元起\nMSI RTX5090 GAMING TRIO $83990\n需搭主機板'
    },
    {
      url:'https://www.autobuy.tw/3c/cate_17491',reliability:'primary',
      title:'RTX5090 - AUTOBUY購物中心',body:'RTX 5090 顯示卡',
      products:[
        {name:'【限整機】AORUS RTX 5090 32G 顯示卡',price:179990,currency:'TWD'},
        {name:'ASUS TUF RTX 5090 32G 顯示卡',price:159990,currency:'TWD'},
        {name:'ASUS RTX 5080 16G 顯示卡',price:35990,currency:'TWD'},
        {name:'AORUS RTX 5090 AI BOX 外接式顯示卡',price:179890,currency:'TWD'}
      ]
    }
  ]);
  const values=r.price.candidates.map(x=>x.value);
  assert.ok(values.includes(71990));
  assert.ok(values.includes(83990));
  assert.ok(values.includes(159990));
  assert.equal(values.includes(35990),false);
  assert.equal(values.includes(179890),false);
  assert.equal(r.price.verified,true);
  assert.equal(r.price.standalone_verified,true);
});

test('fast reader extracts JSON-LD Product price records',async()=>{
  const json=JSON.stringify({
    '@type':'ItemList',
    itemListElement:[
      {'@type':'Product',name:'MSI RTX 5090 32G',offers:{price:'165990',priceCurrency:'TWD'}},
      {'@type':'Product',name:'ASUS RTX 5080 16G',offers:{price:'35990',priceCurrency:'TWD'}}
    ]
  });
  const html='<html><head><title>GPU Shop</title><script type="application/ld+json">'+json+'</script></head><body><main>'+('GPU product listing '.repeat(40))+'</main></body></html>';
  const fetcher=async()=>({ok:true,status:200,headers:new Headers({'content-type':'text/html'}),text:async()=>html});
  const page=await new FastPageReader({fetcher,timeout:1000}).open('https://93.184.216.34/gpu');
  assert.equal(page.products.length,2);
  assert.equal(page.products[0].price,165990);
  assert.match(page.body,/MSI RTX 5090 32G/);
  assert.match(page.body,/TWD 165990/);
});
