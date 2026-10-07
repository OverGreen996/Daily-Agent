import test from 'node:test';
import assert from 'node:assert/strict';
import {searchResultsPayload} from '../core/SearchReply.js';
import {AgentCore} from '../core/AgentCore.js';
import {withUnderstanding} from './helpers/Understanding.js';
const source={title:'Iceborne 台灣商店',url:'https://store.steampowered.com/app/1118010/',coverage:'page',body:'Iceborne DLC：TWD 178，原價 TWD 1190，降價 85%。需先擁有 Monster Hunter: World 本體。核價時間 2026-10-05T09:00:00Z。'};
test('current API price text preserves currency, units and DLC requirements for the answering model',()=>{
 const payload=JSON.parse(searchResultsPayload({results:[source]},'Iceborne 台灣售價'));
 assert.equal(payload.results[0].body,source.body);assert.equal(payload.results[0].coverage,'page');
});
test('Agent passes price results to Qwen; retired Steam facts cannot bypass the answering model',async()=>{
 const saved=[],calls=[];let answers=0;
 const memory={working:{list:()=>saved,add(role,content,topic,extra){saved.push({role,content,extra:JSON.stringify(extra||{})});}},flush:async()=>[],pins:{extract(){},all:()=>[]},retriever:{search:async()=>[]},entities:{search:()=>[]}};
 const result={results:[source],facts:{steam:{status:'verified',currency:'TWD',constraints:{price_only:true},products:[{name:'LEGACY_WRONG_PRODUCT',price:{verified:true,currency:'TWD',final:999,final_minor:99900,initial:1000,initial_minor:100000,discount_percent:1}}]}}};
 const agent=new AgentCore({memory,config:{personality:'test'},bus:{publish(){}},companion:{boredom:{respond(){}}},full:{chat:withUnderstanding(async messages=>{
  answers++;const context=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
  assert.match(context,/TWD 178/);assert.match(context,/需先擁有/);assert.doesNotMatch(context,/LEGACY_WRONG_PRODUCT|final_minor/);
  return {message:{content:'台灣商店顯示 TWD 178，降價 85%；這是 DLC，需先擁有本體。'}};
 },{needsSearch:true})},broker:{schemas:[],async execute(call){calls.push(call);return result;}}});
 agent.wake=async()=>{};agent.detectTopic=async()=>'price';agent.history=async()=>[{role:'user',content:'Steam Iceborne 現在台灣價格'}];
 const response=await agent.chat('Steam Iceborne 現在台灣價格');assert.equal(calls[0].tool,'web_search');assert.equal(calls[0].args.query,'Steam Iceborne 現在台灣價格');assert.equal(answers,1);assert.match(response.content,/降價 85%/);assert.match(response.content,/需先擁有本體/);assert.equal(response.sources.length,1);
});
