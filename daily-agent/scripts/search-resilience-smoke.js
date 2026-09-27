import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BrowserAgent} from '../browser/BrowserAgent.js';
const output=path.resolve('test-output/search-resilience-'+Date.now());fs.mkdirSync(output,{recursive:true});
const browser=new BrowserAgent(),report={};
try {
  let calls=0;const uncached=browser.searchUncached.bind(browser);
  browser.searchUncached=(...args)=>{calls++;return uncached(...args);};
  const general=await browser.search('Archicad software site:graphisoft.com',{limit:1});
  assert.ok(general.results.some(r=>new URL(r.url).hostname.endsWith('graphisoft.com')&&/BIM/.test(r.body)));
  const second=await browser.search('Archicad software site:graphisoft.com',{limit:1});
  assert.equal(second.cache_hit,true);assert.equal(calls,1);
  report.general=general;report.cacheHit=true;
  report.news=await browser.search('今天 AI 新聞',{limit:3});
  assert.ok(report.news.results.length);assert.ok(report.news.results.every(r=>r.date&&r.url&&r.coverage));
  for(const r of report.news.results)if(r.coverage==='headline-only')assert.equal(r.body,r.title);
  report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1;}
finally{
  await browser.close();report.headless=browser.launchOptions.headless;report.closed=browser.closed;
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,passed:report.passed,error:report.error,cacheHit:report.cacheHit,headless:report.headless,closed:report.closed,news:report.news?.results.map(r=>({title:r.title,date:r.date,coverage:r.coverage}))}));
}
