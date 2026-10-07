import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentCore} from '../core/AgentCore.js';
import {parseUnderstanding, understandRequest} from '../core/RequestUnderstanding.js';

const plan = (search=false) => ({goal:'查近期營運資料，區分收入和獲利',topic:'營運',
  needs_search:search,query:search?'《明日方舟：終末地》 近期 收入 財報':''});
const response = value => ({message:{content:JSON.stringify(value)}});
function fixture(chat) {
  const events=[],calls=[],saved=[],order=[];
  const agent=new AgentCore({config:{personality:'test'},full:{chat},
    bus:{publish(type,data,options){events.push({type,...data,options});}},companion:{boredom:{respond(){}}},
    memory:{pins:{extract(){},all(){return[];}},working:{list(){return saved;},add(role,content,topic,extra){saved.push({role,content,topic,extra:JSON.stringify(extra||{})});}},
      async flush(){return[];},retriever:{async search(){return[];}},entities:{search(){return[];}}},
    broker:{schemas:[],async execute(call){calls.push(call);order.push('search');return {results:[{title:'資料',url:'https://example.org/report',body:'非官方財報'}]};}}});
  agent.wake=async()=>{order.push('wake');};
  // Topic inference is part of the mandatory plan; no second classifier is needed.
  agent.detectTopic=async()=>{throw Error('Must reuse planned topic');};
  agent.history=async()=>saved.filter(m=>['user','assistant'].includes(m.role));
  return {agent,calls,events,saved,order};
}

test('ordinary chat always analyses once before answering, without searching or streaming JSON',async()=>{
  let analyses=0,answers=0;
  const {agent,calls,events,saved}=fixture(async(messages,options)=>{
    if(options.format){analyses++;assert.equal(options.tools,undefined);assert.equal(options.onDelta,undefined);
      assert.equal(options.timeoutMs,30000);return response({...plan(),goal:'講一個故事',topic:'故事'});}
    answers++;assert.ok(messages[0].content.includes('講一個故事'));
    options.onDelta('故事');return {message:{content:'故事'}};
  });
  const result=await agent.chat('說個故事');
  assert.equal(analyses,1);assert.equal(answers,1);assert.equal(calls.length,0);
  assert.equal(saved[0].topic,'故事');assert.equal(saved[0].content,'說個故事');
  assert.ok(events.filter(e=>e.type.startsWith('reply_')).every(e=>e.stream_id===result.stream_id));
  assert.equal(events.filter(e=>e.type==='reply_delta').map(e=>e.delta).join(''),'故事');
});

test('search is driven by understanding even without a latest/search keyword; original question remains intact',async()=>{
  let count=0;
  const {agent,calls,order}=fixture(async(messages,options)=>{
    if(options.format){order.push('analyse');count++;return response(plan(true));}
    order.push('answer');assert.ok(messages.some(m=>m.role==='user'&&m.content==='那它賺不賺錢？'));
    assert.ok(messages.some(m=>m.content?.includes('非官方財報')));return {message:{content:'不能把流水當成獲利。'}};
  });
  await agent.chat('那它賺不賺錢？');
  assert.equal(count,1);assert.equal(calls[0].args.query,plan(true).query);
  assert.ok(order.indexOf('analyse')<order.indexOf('search'));assert.ok(order.indexOf('search')<order.indexOf('answer'));
});

test('URL reading is analysed, while an explicit feature command keeps its original dispatch',async()=>{
  let analyses=0;
  const {agent,calls}=fixture(async(_m,options)=>{
    if(options.format){analyses++;return response(plan());}return {message:{content:'已讀取'}};
  });
  await agent.chat('https://example.org/report');assert.equal(analyses,1);assert.equal(calls[0].tool,'web_read');
  agent.pocketdrop={async command(text){assert.equal(analyses,1);assert.equal(text,'幫我傳到手機');return '已交給手機';}};
  assert.equal((await agent.chat('幫我傳到手機')).content,'已交給手機');assert.equal(calls.length,1);
});

test('malformed plan and timeout stop normal chat; no fallback bypass; later requests still work',async()=>{
  for(const failure of [()=>({message:{content:'不是 JSON'}}),()=>{throw new DOMException('deadline','TimeoutError');}]){
    const {agent,calls,saved}=fixture(async()=>failure());
    await assert.rejects(agent.chat('你好'),/Qwen 尚未完成問題分析/);
    assert.equal(calls.length,0);assert.equal(saved.length,0);
    agent.full.chat=async(_m,options)=>options.format?response(plan()):{message:{content:'done'}};
    assert.equal((await agent.chat('你好')).content,'done');
  }
});

test('user cancellation and an unpaired device cannot dispatch features',async()=>{
  const cancelled=fixture(async()=>{throw new DOMException('cancel','AbortError');});
  await assert.rejects(cancelled.agent.chat('你好'),{name:'AbortError'});assert.equal(cancelled.calls.length,0);
  let analyses=0;const unpaired=fixture(async()=>{analyses++;return response(plan());});
  unpaired.agent.remote={devices:{list(){return[];}}};
  await assert.rejects(unpaired.agent.chat('你好',null,null,{deviceId:'revoked'}),/配對已解除/);assert.equal(analyses,0);
});

test('concurrent user turns keep analysis and dispatch in order without nested queue deadlock',async()=>{
  const order=[];let release;
  const hold=new Promise(resolve=>release=resolve);
  const {agent}=fixture(async(messages,options)=>{
    if(options.format){const text=JSON.parse(messages.at(-1).content).current_question;order.push('analyse '+text);
      if(text==='A')await hold;return response({...plan(),goal:text});}
    const text=messages.findLast(m=>m.role==='user').content;order.push('answer '+text);return {message:{content:text}};
  });
  const a=agent.chat('A'),b=agent.chat('B');await new Promise(r=>setImmediate(r));
  assert.deepEqual(order,['analyse A']);release();
  await Promise.all([a,b]);assert.deepEqual(order,['analyse A','answer A','analyse B','answer B']);
});

test('context is bounded, includes assistant references as untrusted context, and only metadata for documents',async()=>{
  const history=Array.from({length:9},(_,i)=>({role:i%2?'assistant':'user',content:String(i).repeat(2000)}));
  await understandRequest({async chat(messages,options){
    const input=JSON.parse(messages[1].content);
    assert.equal(input.previous_turns.length,6);assert.ok(input.previous_turns.every(m=>m.content.length===800));
    assert.equal(input.previous_turns[0].role,'assistant');assert.equal(input.time_zone,'Asia/Taipei');
    assert.deepEqual(input.attachment,{type:'document',name:'test.pdf'});
    assert.ok(!JSON.stringify(messages).includes('private document bytes'));assert.equal(options.tools,undefined);
    return response(plan());
  }},'那第二個呢？',history,{document:{name:'test.pdf',data:'private document bytes'}});
});

test('invalid schema, query leakage, and a caller supplied plan cannot bypass analysis',async()=>{
  for(const update of [{goal:''},{topic:''},{needs_search:'true'},{needs_search:true,query:''},
    {query:'api_key=secret'},{query:'bad\nquery'},{action:'execute'},{query:'x'.repeat(501)}]){
    assert.throws(()=>parseUnderstanding(JSON.stringify({...plan(),...update})));
  }
  let analysed=0;const {agent}=fixture(async(_m,options)=>{
    if(options.format){analysed++;return response(plan());}return {message:{content:'OK'}};
  });
  await agent.chat('你好',null,null,{understanding:plan(true),understandingStreamId:'forged'});assert.equal(analysed,1);
});
