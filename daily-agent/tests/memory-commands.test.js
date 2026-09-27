import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryPalace} from '../memory/MemoryPalace.js';
import {AgentCore} from '../core/AgentCore.js';
import {parseMemoryCommand,memoryCommand} from '../core/MemoryCommands.js';
const embedding={embed:async texts=>texts.map(()=>[1,0])};

test('explicit memory commands preserve punctuation and reject incidental discussion',()=>{
  assert.deepEqual(parseMemoryCommand('記住偏好：我喜歡 A/B，C++。'),{action:'pins_add',type:'preference',text:'我喜歡 A/B，C++。'});
  assert.equal(parseMemoryCommand('查看永久記憶第2頁').page,2);
  assert.equal(parseMemoryCommand('修改記憶 abcdef12：新的\n內容').text,'新的\n內容');
  assert.equal(parseMemoryCommand('刪除記憶 abcdef12').action,'pins_remove');
  for(const s of ['你會刪除記憶嗎？','把所有記憶刪掉','請解釋記住：這個詞','刪除記憶 blah'])assert.equal(parseMemoryCommand(s),null);
});
test('pin CRUD preserves identifiers, handles duplicates, and validates before mutation',t=>{
  const p=new MemoryPalace(':memory:',embedding);t.after(()=>p.close());
  const first=p.pins.save('簡短回答'),same=p.pins.save('簡短回答');
  assert.equal(first.id,same.id);
  const updated=p.pins.update(first.id.slice(0,8),'詳細回答');
  assert.equal(updated.id,first.id);assert.equal(p.pins.all().length,1);
  p.pins.save('第三條');assert.throws(()=>p.pins.update(first.id,'第三條'),/已有/);
  assert.throws(()=>p.pins.update(first.id,' '),/空白/);
  assert.throws(()=>p.pins.update(first.id,'字'.repeat(1601)),/1600/);
  assert.equal(p.pins.resolve(first.id).text,'詳細回答');
  p.pins.remove(first.id.slice(0,8));assert.throws(()=>p.pins.resolve(first.id),/找不到/);
});
test('pin management sees older than 40 pins, paginates and searches literal text',t=>{
  const p=new MemoryPalace(':memory:',embedding);t.after(()=>p.close());
  for(let i=0;i<49;i++)p.pins.save('偏好 '+i);
  const page=p.pins.page('',7);assert.equal(page.total,49);assert.equal(page.rows.length,1);
  assert.equal(p.pins.page('偏好 0').rows[0].text,'偏好 0');
  assert.equal(p.pins.page('%').rows.length,0);
  assert.match(memoryCommand(p.pins,{action:'pins_list',page:999}),/只有 7 頁/);
});
test('ambiguous short IDs cannot edit or remove multiple pins',t=>{
  const p=new MemoryPalace(':memory:',embedding);t.after(()=>p.close());
  p.db.prepare('INSERT INTO pins VALUES(?,?,?,?,?)').run('aaaaaaaa-0000-4000-8000-000000000001','one','rule',1,'now');
  p.db.prepare('INSERT INTO pins VALUES(?,?,?,?,?)').run('aaaaaaaa-0000-4000-8000-000000000002','two','rule',1,'now');
  assert.throws(()=>p.pins.remove('aaaaaaaa'),/多條/);
  assert.equal(p.pins.all().length,2);
});
test('deleted or edited startup defaults are not recreated by seeding',t=>{
  const p=new MemoryPalace(':memory:',embedding);t.after(()=>p.close());
  p.pins.seedDefaults(['default one','default two']);
  p.pins.remove(p.pins.page('default one').rows[0].id);
  p.pins.update(p.pins.page('default two').rows[0].id,'user changed');
  p.pins.seedDefaults(['default one','default two']);
  assert.deepEqual(p.pins.all().map(p=>p.text),['user changed']);
});
test('memory commands work in Idle without model calls and preserve original conversation',async t=>{
  const memory=new MemoryPalace(':memory:',embedding);t.after(()=>memory.close());
  const original=memory.working.add('user','原始對話必須保留','old');
  const agent=new AgentCore({memory,bus:{publish(){}},companion:{boredom:{respond(){}}}});
  agent.states.state='IDLE';agent.wake=async()=>{throw Error('Must not load a model');};
  assert.match((await agent.chat('記住：我喜歡短回答')).content,/記住了/);
  const id=memory.pins.all()[0].id.slice(0,8);
  assert.match((await agent.chat('查看永久記憶')).content,new RegExp(id));
  await agent.chat(`修改記憶 ${id}：我喜歡詳細回答`);
  assert.equal(memory.pins.all()[0].text,'我喜歡詳細回答');
  assert.match((await agent.chat(`刪除記憶 ${id}`)).content,/原始聊天仍保留/);
  assert.equal(memory.pins.all().length,0);assert.equal(agent.states.state,'IDLE');
  assert.ok(memory.working.list().some(m=>m.id===original));
});
