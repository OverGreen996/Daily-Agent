import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentCore} from '../core/AgentCore.js';
import {emptySearchReply,searchContext} from '../core/SearchReply.js';
import {withUnderstanding} from './helpers/Understanding.js';

function agentFor(searchResult,chat){
 const calls=[],memory={pins:{extract(){},all(){return[];}},working:{list(){return[];},add(){}},async flush(){return[];},retriever:{async search(){return[];}},entities:{search(){return[];}}};
 const agent=new AgentCore({config:{personality:'test'},memory,companion:{boredom:{respond(){}}},bus:{publish(){}},
  broker:{schemas:[],async execute(call){calls.push(call);return typeof searchResult==='function'?searchResult(call):searchResult;}},full:{chat:withUnderstanding(chat,{needsSearch:true})}});
 agent.wake=async()=>{};agent.detectTopic=async()=> 'test';
 // The screenshot's previous false answer must not become evidence.
 agent.history=async()=>[{role:'assistant',content:'終末地不是官方名稱，可能輸入有誤。'},{role:'user',content:'統整一下終末地最近的表現'}];
 return {agent,calls};
}

test('recent performance searches before generation; empty retrieval cannot repeat a false existence claim',async()=>{
 let generations=0;
 const {agent,calls}=agentFor({results:[],notice:'本次未取得可用證據'},async()=>{generations++;return {message:{content:'終末地不存在。'}};});
 const result=await agent.chat('統整一下終末地最近的表現');
 assert.equal(calls[0].tool,'web_search');assert.equal(calls[0].args.query,'統整一下終末地最近的表現');assert.equal(generations,0);
 assert.match(result.content,/不代表.*不存在/);assert.match(result.content,/沒有取得可引用/);assert.deepEqual(result.sources,[]);
});

test('model cannot override Qwen decision and initiate a search for an ordinary chat',async()=>{
 let generations=0;
 const {agent,calls}=agentFor({results:[]},async()=>{});
 agent.full.chat=withUnderstanding(async messages=>{generations++;if(generations===1)return {message:{content:'',tool_calls:[{function:{name:'web_search',arguments:{query:'明日方舟 終末地'}}}]}};
 assert.ok(messages.some(m=>m.role==='tool'&&m.content.includes('Qwen')));return {message:{content:'請問想聊遊戲的哪一方面？'}};});
 const result=await agent.chat('明日方舟 終末地');
 assert.equal(generations,2);assert.equal(calls.length,0);assert.match(result.content,/哪一方面/);
});

test('a later empty search cannot discard sources already read this turn',async()=>{
 let generations=0;
 const source={title:'正式作品',url:'https://example.org/game',body:'Official game page',coverage:'page'};
 const {agent}=agentFor(call=>call.args.query==='再次搜尋'?{results:[]}:{results:[source]},async messages=>{
  generations++;
  if(generations===1)return {message:{content:'',tool_calls:[{function:{name:'web_search',arguments:{query:'再次搜尋'}}}]}};
  assert.ok(messages.some(m=>m.content?.includes('https://example.org/game')));
  return {message:{content:'已確認作品身分；近期營運數據尚未核實。'}};
 });
 const result=await agent.chat('統整一下終末地最近的表現');
 assert.equal(generations,2);assert.match(result.content,/已確認作品身分/);assert.equal(result.sources.length,1);
});

test('empty retrieval ignores retired update fields; current sources and unread requests remain usable',()=>{
 assert.equal(emptySearchReply(null),null);
 assert.match(emptySearchReply({results:[],game_updates:[{url:'https://example.org/update'}]}),/沒有取得可引用/);
 assert.equal(emptySearchReply({results:[]},[{url:'https://example.org/page'}]),null);
 assert.equal(emptySearchReply({results:[{title:'snippet'}]}),null);
 const prompt=searchContext({results:[]},'明日方舟 終末地');
 assert.match(prompt,/不能證明作品、物品或事件不存在/);assert.match(prompt,/前文你自己的回答不是外部證據/);
});
test('a tool loop cannot exceed initial plus one supplementary search',async()=>{
 let rounds=0;
 const {agent,calls}=agentFor({results:[{title:'source',url:'https://example.org/source',body:'excerpt'}]},async messages=>{
  rounds++;
  if(rounds<=2)return {message:{content:'',tool_calls:[{function:{name:'web_search',arguments:{query:'補查'+rounds}}}]}};
  assert.ok(messages.some(m=>m.role==='tool'&&m.content.includes('兩次搜尋上限')));return {message:{content:'已依取得的來源回答。'}};
 });
 await agent.chat('幫我查最近消息');assert.equal(calls.filter(c=>c.tool==='web_search').length,2);assert.equal(rounds,3);
});
