import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DocumentStore} from '../documents/DocumentStore.js';
import {parseDocumentCommand,isDocumentFollowup} from '../core/DocumentCommands.js';
import {AgentCore} from '../core/AgentCore.js';
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-library-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,store:new DocumentStore(dir)};}
const attachment=(name,text)=>({name,data:Buffer.from(text).toString('base64')});
test('library commands are explicit, keep filenames and do not hijack generic PDF conversation',()=>{
  assert.equal(parseDocumentCommand('查看文件庫第2頁').page,2);
  assert.equal(parseDocumentCommand('使用文件：「My notes.md」').reference,'「My notes.md」');
  assert.equal(parseDocumentCommand('詢問文件 notes.md：這份文件的日期？').question,'這份文件的日期？');
  assert.equal(parseDocumentCommand('我想做搜尋文件的功能'),null);
  assert.equal(isDocumentFollowup('PDF 是什麼？'),false);
  assert.equal(isDocumentFollowup('這份文件的日期？'),true);
});
test('catalog and FTS find old files, preserve aliases, and reject ambiguous identical filenames',async t=>{
  const {store}=await setup(t);
  const first=await store.ingest(attachment('report.md','專案寶石碼 SAPPHIRE-927，預算九萬元。'));
  await store.ingest(attachment('renamed.md','專案寶石碼 SAPPHIRE-927，預算九萬元。'));
  await store.ingest(attachment('report.md','不同版本，代碼 RUBY-128。'));
  assert.equal((await store.library.list()).total,2);
  assert.equal((await store.library.resolve('renamed.md')).id,first.id);
  await assert.rejects(store.library.resolve('report.md'),/多份/);
  assert.equal((await store.library.resolve(first.id.slice(0,12))).id,first.id);
  const results=await store.library.search('寶石碼 SAPPHIRE-927');
  assert.equal(results.items[0].id,first.id);assert.ok(results.items[0].text.includes('SAPPHIRE-927'));
  assert.deepEqual((await store.library.search('" OR DELETE FROM documents;')).items,[]);
});
test('selection survives fresh store and clearing does not resurrect old selection',async t=>{
  const {store,dir}=await setup(t),doc=await store.ingest(attachment('saved.txt','old document'));
  assert.equal(await store.library.current(),undefined);
  await store.library.select(doc.id);
  const next=new DocumentStore(dir);assert.equal(await next.library.current(),doc.id);
  await next.library.select(null);assert.equal(await new DocumentStore(dir).library.current(),null);
});
test('legacy metadata migrates lazily and missing or corrupt files do not leave misleading index hits',async t=>{
  const {store,dir}=await setup(t),doc=await store.ingest(attachment('legacy.txt','unique-archive-token'));
  await fs.rm(path.join(dir,'document-library.sqlite'));
  const next=new DocumentStore(dir);assert.equal((await next.library.search('unique-archive-token')).items.length,1);
  await fs.writeFile(path.join(next.dir,doc.id+'.json'),'broken');
  const result=await next.library.search('unique-archive-token');assert.equal(result.items.length,0);assert.equal(result.warnings.length,1);
  assert.equal((await fs.readFile(path.join(next.dir,doc.id),'utf8')),'unique-archive-token');
});
test('pagination reaches older documents with no model and includes a stable ID',async t=>{
  const {store}=await setup(t);
  for(let i=0;i<10;i++)await store.ingest(attachment(`file-${i}.txt`,`text-${i}`));
  const first=await store.library.list(),second=await store.library.list(2);
  assert.equal(first.items.length,8);assert.equal(second.items.length,2);assert.equal(first.total,10);
  assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,10);
});
test('Idle catalog commands avoid wake; fresh empty working memory can still answer selected document',async t=>{
  const {store}=await setup(t),doc=await store.ingest(attachment('archive.txt','Old archive code is 427.'));
  const saved=[];let wakes=0;
  const memory={working:{list(){return saved},add(role,content,topic,extra){saved.push({role,content,extra:JSON.stringify(extra||{})})}},pins:{extract(){},all(){return[]}},async flush(){return[]},retriever:{async search(){return[]}},entities:{search(){return[]}}};
  const agent=new AgentCore({documents:store,memory,config:{personality:'test'},bus:{publish(){}},companion:{boredom:{respond(){}}},full:{async chat(messages,options){assert.equal(options.tools,undefined);assert.ok(messages.some(m=>m.content.includes('Old archive code is 427.')));return {message:{content:'427'}};}}});
  agent.states.state='IDLE';agent.companion.cancel=async()=>{};agent.browser={async close(){}};
  agent.wake=async()=>{wakes++;};agent.detectTopic=async()=> 'documents';agent.history=async()=>[{role:'user',content:'question'}];
  assert.match((await agent.chat('查看文件庫')).content,/archive.txt/);
  await agent.chat('使用文件 '+doc.id.slice(0,12));assert.equal(wakes,0);
  saved.length=0;
  assert.equal((await agent.chat('這份文件的代碼？')).content,'427');assert.equal(wakes,1);
  await agent.chat('結束文件閱讀');
  await assert.rejects(agent.chat('這份文件的代碼？'),/沒有選用/);assert.equal(wakes,1);
  await assert.rejects(agent.chat('詢問文件 missing.txt：日期？'),/找不到/);assert.equal(wakes,1);
});
