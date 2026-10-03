import test from 'node:test';
import assert from 'node:assert/strict';
import {needsCurrentSearch,verifiedSteamPriceReply} from '../core/SearchReply.js';
import {AgentCore} from '../core/AgentCore.js';
const result=()=>({results:[{title:'Iceborne',url:'https://store.steampowered.com/app/1118010/'}],facts:{steam:{status:'verified',currency:'TWD',constraints:{price_only:true},products:[{name:'Monster Hunter World: Iceborne',url:'https://store.steampowered.com/app/1118010/',requires_base_game:{name:'Monster Hunter: World'},price:{verified:true,currency:'TWD',final:178,final_minor:17800,initial:1190,initial_minor:119000,discount_percent:85,checked_at:'2026-10-03T09:00:00Z'}}]}}});
test('current price and sale wording requires fresh search',()=>{
 for(const q of ['Steam Iceborne 現在台灣價格','Iceborne 目前售價','Firefox 當前版本'])assert.equal(needsCurrentSearch(q),true);
 assert.equal(needsCurrentSearch('記住我喜歡玩遊戲'),false);
});
test('verified Steam price preserves minor units, reduction percentage and DLC dependency',()=>{
 const reply=verifiedSteamPriceReply(result());assert.match(reply,/NT\$ 178/);assert.match(reply,/NT\$ 1,190/);assert.match(reply,/降價 85%/);assert.match(reply,/需先擁有本體/);assert.doesNotMatch(reply,/11,900|八五折/);
 for(const alter of [r=>r.facts.steam.status='no-verified-offers',r=>r.facts.steam.constraints.price_only=false,r=>r.facts.steam.products[0].price.final_minor=178]){const r=result();alter(r);assert.equal(verifiedSteamPriceReply(r),null);}
});
test('Agent requests current price before answering and uses verified evidence without model arithmetic',async()=>{
 const saved=[],calls=[];
 const memory={working:{list:()=>saved,add(role,content,topic,extra){saved.push({role,content,extra:JSON.stringify(extra||{})});}},flush:async()=>[],pins:{extract(){},all:()=>[]},retriever:{search:async()=>[]},entities:{search:()=>[]}};
 const agent=new AgentCore({memory,config:{personality:'test'},bus:{publish(){}},companion:{boredom:{respond(){}}},full:{async chat(){throw Error('Price already verified; model must not change it');}},broker:{schemas:[],async execute(call){calls.push(call);return result();}}});
 agent.wake=async()=>{};agent.detectTopic=async()=>'price';agent.history=async()=>[{role:'user',content:'Steam Iceborne 現在台灣價格'}];
 const response=await agent.chat('Steam Iceborne 現在台灣價格');assert.equal(calls[0].tool,'web_search');assert.equal(calls[0].args.query,'Steam Iceborne 現在台灣價格');assert.match(response.content,/降價 85%/);assert.equal(response.sources.length,1);
});
