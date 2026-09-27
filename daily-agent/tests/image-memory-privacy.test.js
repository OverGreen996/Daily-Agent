import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryPalace} from '../memory/MemoryPalace.js';
import {forgetImageGeneration} from '../memory/ForgetImageGeneration.js';
import {AgentCore} from '../core/AgentCore.js';
test('generation cleanup removes derived indexes but preserves normal turns in mixed books',async()=>{
 const m=new MemoryPalace(':memory:',{embed:async texts=>texts.map(()=>[1,0])});
 try{
 const good=m.working.add('user','我喜歡喝茶','日常');
 const bad=m.working.add('user','畫一個藍色方塊','日常');
 m.db.prepare('UPDATE messages SET extra=? WHERE id=?').run('{"generation":true}',bad);
 await m.archive(m.working.list());
 const r=forgetImageGeneration(m);assert.equal(r.messages,1);assert.equal(r.books,1);
 assert.equal(m.working.list()[0].id,good);
 for(const table of ['cards','card_fts','metadata_index'])assert.equal(m.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
 assert.equal(m.working.add('user','private','x',{generation:true}),null);
 assert.equal(m.working.add('user','private','x',{image_mode:false}),null);
 }finally{m.close();}
});
test('image controls and generation never persist prompts, results or source attachments into memory',async()=>{
 const m=new MemoryPalace(':memory:',{embed:async texts=>texts.map(()=>[1,0])});const saved=[],events=[];
 const a=new AgentCore({config:{dataDir:'must-not-write-here'},memory:m,bus:{publish:(...e)=>events.push(e)},companion:{boredom:{respond(){}}},
 full:{chat:async()=>({message:{content:JSON.stringify({prompt:'blue cube',width:1024,height:1024,steps:25,cfg:5})}})},
 lifecycle:{save_runtime_state:async value=>saved.push(value),unload_model:async()=>{},load_model:async()=>{},get_active_model:()=>({gpu_owner:'IMAGE_GENERATOR'}),restore_runtime_state:async()=>{}},
 imageRuntime:{setProfile(){},generate:async spec=>({file:'cube.png',spec,bytes:Buffer.from('image')})}});
 a.wake=async()=>{};a.detectTopic=async()=>{throw Error('generation must not inspect or update conversation topics');};
 try{
 m.working.add('user','一般聊天要保留');
 await a.chat('動漫模式');
 await a.generateImage('畫一個藍色方塊','blue cube',{},null,'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
 await a.chat('結束生圖');
 assert.equal(m.working.list().length,1);assert.equal(saved.length,1);assert.equal(saved[0],undefined);
 assert.ok(events.filter(e=>['message','generated_image'].includes(e[0])).every(e=>e[2]?.transient));
 }finally{m.close();}
});
