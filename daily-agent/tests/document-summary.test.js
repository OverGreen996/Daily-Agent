import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DocumentSummarizer,documentParts,isDocumentSummaryRequest,sourceEvidence} from '../documents/DocumentSummarizer.js';
import {tokens} from '../memory/MemoryPalace.js';
import {AgentCore} from '../core/AgentCore.js';
const document=(count=15)=>({id:'fixture',name:'long.pdf',format:'pdf',pages:Array.from({length:count},(_,i)=>({number:i+1,source:'text',text:`PAGE-${i+1} `+'保留這一段的文字與換行🙂。\n'.repeat(220)+` END-${i+1}`}))});
async function dir(t){const value=await fs.mkdtemp(path.join(os.tmpdir(),'daily-summary-'));t.after(()=>fs.rm(value,{recursive:true,force:true}));return value;}
test('whole-document summary intent excludes page requests and explicit refusal',()=>{
  assert.ok(isDocumentSummaryRequest('幫我摘要這份文件'));
  assert.ok(isDocumentSummaryRequest('整理全文'));
  assert.equal(isDocumentSummaryRequest('摘要第 3 頁'),false);
  assert.equal(isDocumentSummaryRequest('不用摘要，找文件日期'),false);
});
test('bounded source plan covers every character including final pages and Unicode without overlap',()=>{
  const doc=document(),parts=documentParts(doc);
  assert.ok(parts.length>1);assert.ok(parts.every(p=>tokens(JSON.stringify(p))<=4000));
  for(const page of doc.pages){
    const fragments=parts.flat().filter(p=>p.page===page.number);let offset=0;
    for(const f of fragments){assert.equal(f.start,offset);offset=f.end;assert.equal(f.text.includes('\uFFFD'),false);}
    assert.equal(fragments.map(f=>f.text).join(''),page.text);assert.equal(offset,page.text.length);
  }
});
test('short document uses all text without map calls and discloses unreadable OCR pages',async t=>{
  const s=new DocumentSummarizer({chat(){throw Error('No map required')}},await dir(t));
  const result=await s.summarize({name:'short.pdf',pages:[{number:1,text:'Fact',source:'ocr'},{number:2,text:'',source:'unreadable'}]});
  assert.equal(result.method,'full-text');assert.equal(result.partial,true);assert.deepEqual(result.unreadable_pages,[2]);assert.deepEqual(result.ocr_pages,[1]);
});
test('long summary reads every part, hierarchically reduces bounded notes and reuses cache',async t=>{
  const doc=document(),calls=[],cacheDir=await dir(t);
  const runtime={model:'test',async chat(messages,options){
    assert.equal(options.tools,undefined);assert.ok(tokens(JSON.stringify(messages))<6000);
    const data=JSON.parse(messages[1].content);calls.push(data);
    return {message:{content:data[0].page ? `Page ${data[0].page}. `+'段落事實。'.repeat(130) : '整合各段重要事實，保留引用。'}};
  }};
  const result=await new DocumentSummarizer(runtime,cacheDir).summarize(doc);
  assert.equal(result.coverage,'all-extracted-text');assert.equal(result.partial,false);assert.ok(tokens(JSON.stringify(result.selected))<=4200);
  const allRead=calls.filter(c=>c[0].page).flat();
  for(const page of doc.pages)assert.equal(allRead.filter(f=>f.page===page.number).map(f=>f.text).join(''),page.text);
  assert.ok(calls.some(c=>!c[0].page));const count=calls.length;
  await new DocumentSummarizer(runtime,cacheDir).summarize(doc);assert.equal(calls.length,count);
  runtime.model='changed';await new DocumentSummarizer(runtime,cacheDir).summarize(doc);assert.ok(calls.length>count);
});
test('interruption checkpoints completed parts and retry starts at the failed part',async t=>{
  const cache=await dir(t),doc=document(3);let calls=0;
  const runtime={model:'test',async chat(){calls++;if(calls===2)throw Error('disconnected');return {message:{content:'段落摘要'}};}};
  const summarizer=new DocumentSummarizer(runtime,cache);
  await assert.rejects(summarizer.summarize(doc),/disconnected/);
  const checkpoint=JSON.parse(await fs.readFile(path.join(cache,(await fs.readdir(cache))[0]),'utf8'));
  assert.equal(checkpoint.notes.length,1);
  await summarizer.summarize(doc);assert.equal(calls,documentParts(doc).length+1);
});
test('truncated summary and stop signal cannot claim successful full coverage',async t=>{
  const s=new DocumentSummarizer({async chat(){return {message:{content:'Incomplete'},done_reason:'length'}}},await dir(t));
  await assert.rejects(s.summarize(document(3)),/未完整/);
  await assert.rejects(s.summarize(document(3),{isCancelled:()=>true}),/中止/);
});
test('context fitting cannot silently truncate protected document summaries',()=>{
  const agent=Object.create(AgentCore.prototype),source={role:'system',content:'完整文件摘要'.repeat(800)};
  const messages=[{role:'system',content:'rules'},{role:'user',content:'current'},source];
  const original=source.content;
  assert.throws(()=>agent.fitContext(messages,100,[source]),/Context/);assert.equal(source.content,original);
});
test('numeric field evidence keeps exact source lines and page offsets within a small budget',()=>{
  const doc=document(12);
  doc.pages[0].text='START milestone code: START-214. Owner: Alice.\n'+doc.pages[0].text;
  doc.pages[6].text='MIDDLE milestone code: MID-582. Review date: 2026-12-19.\n'+doc.pages[6].text;
  doc.pages[11].text='FINAL approval code: END-936. Approved budget: 91200 dollars.\n'+doc.pages[11].text;
  const evidence=sourceEvidence(doc);
  assert.ok(tokens(JSON.stringify(evidence))<=1200);
  for(const text of ['START-214','MID-582','END-936'])assert.ok(evidence.some(e=>e.text.includes(text)));
  for(const e of evidence)assert.equal(e.text,doc.pages[e.page-1].text.slice(e.start,e.end));
});
