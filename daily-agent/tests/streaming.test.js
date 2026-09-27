import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OllamaRuntime } from '../models/OllamaRuntime.js';
import { AgentCore } from '../core/AgentCore.js';
import { EventBus } from '../core/EventBus.js';

async function backend(t, handler) {
  const server=http.createServer(async(req,res)=>{
    let body=''; for await(const chunk of req) body+=chunk;
    await handler(JSON.parse(body),res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  return new OllamaRuntime(`http://127.0.0.1:${server.address().port}`,'test');
}
const line=(message,extra={})=>JSON.stringify({message,...extra})+'\n';

test('NDJSON streams before completion, preserves UTF-8 and tool calls, returns final metrics',async t=>{
  let release; const gate=new Promise(resolve=>release=resolve);
  t.after(()=>release());
  const runtime=await backend(t,async(body,res)=>{
    assert.equal(body.stream,true); assert.equal(body.think,false);
    res.writeHead(200,{'Content-Type':'application/x-ndjson'});
    const first=Buffer.from(line({content:'你好🙂',thinking:'not for display'}));
    for(let i=0;i<first.length;i++) res.write(first.subarray(i,i+1));
    await gate;
    res.end(line({content:'，繼續',tool_calls:[{function:{name:'system_info',arguments:{}}}]})+
      line({content:''},{done:true,prompt_eval_count:23,eval_count:9}).trimEnd());
  });
  const deltas=[];
  const result=await runtime.chat([], {onDelta:delta=>{deltas.push(delta);release();}});
  assert.deepEqual(deltas,['你好🙂','，繼續']);
  assert.equal(result.message.content,deltas.join(''));
  assert.equal(result.message.tool_calls[0].function.name,'system_info');
  assert.equal(result.eval_count,9); assert.equal(runtime.controller,null);
});

test('stream truncation and backend error reject partial answers',async t=>{
  for(const ending of ['',JSON.stringify({error:'test failure'})]) {
    const runtime=await backend(t,async(body,res)=>res.end(line({content:'partial'})+ending));
    const deltas=[];
    await assert.rejects(runtime.chat([],{onDelta:d=>deltas.push(d)}), /串流中斷|test failure/);
    assert.deepEqual(deltas,['partial']); assert.equal(runtime.controller,null);
  }
});

test('cancel interrupts an open stream and cleans up controller',async t=>{
  const runtime=await backend(t,async(body,res)=>{
    res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write(line({content:'partial'}));
  });
  await assert.rejects(runtime.chat([],{onDelta:()=>runtime.cancel()}),/abort/i);
  assert.equal(runtime.controller,null);
});

test('non-streaming callers preserve the existing runtime contract',async t=>{
  const runtime=await backend(t,async(body,res)=>{
    assert.equal(body.stream,false);res.end(JSON.stringify({message:{content:'complete'},done:true}));
  });
  assert.equal((await runtime.chat([])).message.content,'complete');
});

function agentFixture(fail=false) {
  const events=[],saved=[],calls=[];
  const bus={publish(type,data,options){events.push({type,...data,options});}};
  const memory={pins:{extract(){},all(){return[];}},working:{list(){return[];},add(role,content){saved.push({role,content});}},
    async flush(){return[];},retriever:{async search(){return[];}},entities:{search(){return[];}}};
  const full={async chat(messages,{onDelta}){
    assert.equal(saved.filter(m=>m.role==='assistant').length,0);
    if(fail){onDelta('未完成');throw Error('stream disconnected');}
    if(!calls.length){onDelta('我先查一下');return {message:{content:'我先查一下',tool_calls:[{function:{name:'system_info',arguments:{}}}]}};}
    onDelta('完整');onDelta('答案');return {message:{content:'完整答案'}};
  }};
  const agent=new AgentCore({config:{personality:'test'},full,bus,memory,companion:{boredom:{respond(){}}},
    broker:{schemas:[],async execute(call){calls.push(call);return {ok:true};}}});
  agent.wake=async()=>{};agent.detectTopic=async()=> 'test';agent.history=async()=>[{role:'user',content:'說個故事'}];
  return {agent,events,saved,calls};
}

test('agent resets tool round preview and saves one completed answer with matching stream id',async()=>{
  const {agent,events,saved,calls}=agentFixture();
  const result=await agent.chat('說個故事');
  assert.equal(calls.length,1);
  assert.deepEqual(saved.filter(m=>m.role==='assistant'),[{role:'assistant',content:'完整答案'}]);
  const progress=events.filter(e=>e.type.startsWith('reply_'));
  assert.deepEqual(progress.map(e=>e.type),['reply_start','reply_delta','reply_tool','reply_start','reply_delta','reply_delta']);
  assert.ok(progress.every(e=>e.stream_id===result.stream_id && e.options.transient));
  assert.equal(events.find(e=>e.type==='message').stream_id,result.stream_id);
});

test('agent interrupted stream does not commit partial content to memory',async()=>{
  const {agent,events,saved}=agentFixture(true);
  await assert.rejects(agent.chat('說個故事'),/disconnected/);
  assert.equal(saved.filter(m=>m.role==='assistant').length,0);
  assert.equal(events.filter(e=>e.type==='message').length,0);
  assert.equal(events.filter(e=>e.type==='reply_error').length,1);
});

test('transient stream fragments are delivered without writing per-token SSD logs',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-stream-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'events.jsonl'),bus=new EventBus(file),seen=[];
  bus.on('event',e=>seen.push(e.type));
  bus.publish('reply_delta',{delta:'hi'},{transient:true});
  assert.equal(fs.existsSync(file),false);
  bus.publish('message',{content:'hi'});
  assert.deepEqual(seen,['reply_delta','message']);
  assert.equal(fs.readFileSync(file,'utf8').trim().split('\n').length,1);
});
