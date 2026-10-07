import test from 'node:test';
import assert from 'node:assert/strict';
import {searchResultsPayload,searchContext,withSearchSources} from '../core/SearchReply.js';
import fs from 'node:fs';
import {conversationControl} from '../core/ConversationControls.js';

test('reply contract ignores retired fields and preserves current reader output',()=>{
 const input={provider:'Tavily',provider_id:'tavily',results:[{title:'官網',url:'https://example.org/page',body:'已讀正文',coverage:'page',read_url:'https://example.org/final',read_failed:true,score:999,version_check:{status:'verified'}}],facts:{steam:{secret:'retired'}},quality:{confidence:'HIGH'},game_updates:[{url:'https://example.org/old'}],supporting_sources:[{url:'https://example.org/old'}],game:{subject_check:{existence_verified:true}},score_semantics:'retired',validation_policy:'retired'};
 const text=searchResultsPayload(input,'問題'),output=JSON.parse(text);
 assert.equal(output.results[0].read_url,'https://example.org/final');assert.equal(output.results[0].read_failed,true);assert.equal(output.results[0].coverage,'page');
 assert.doesNotMatch(text,/retired|HIGH|facts|game_updates|supporting_sources|subject_check|version_check|validation_policy|score_semantics|"score"/);
 assert.doesNotMatch(searchContext(input,'問題'),/HIGH|subject_check|compatibility_verified|version_check|retired/);
});
test('result budget yields complete JSON and rejects unsafe or duplicate source URLs',()=>{
 const input={results:[{url:'javascript:alert(1)',body:'bad'},{url:'https://user:password@example.org/',body:'bad'},...Array.from({length:5},(_,i)=>({title:'標題'.repeat(300),url:'https://example.org/'+i,body:'正文"\\\n'.repeat(1000),coverage:'page'})),{url:'https://example.org/0',body:'duplicate'}]};
 for(const limit of [1000,7500,11000]){
  const text=searchResultsPayload(input,'問題'.repeat(500),limit),output=JSON.parse(text);assert.ok(text.length<=limit);
  assert.ok(output.results.length<=3);assert.equal(new Set(output.results.map(r=>r.url)).size,output.results.length);
  assert.ok(output.results.every(r=>r.url.startsWith('https://example.org/')&&r.body_truncated));
 }
});
test('headline fallback works for products, not just news; unsafe citations are never appended',()=>{
 const text=withSearchSources('自行補的功能說明',[{title:'產品規格',url:'https://example.org/spec',coverage:'headline-only',date:null},{title:'bad',url:'data:text/html,bad',coverage:'page'}]);
 assert.match(text,/找到以下來源/);assert.match(text,/日期待核實/);assert.doesNotMatch(text,/新聞標題|自行補的|data:/);
 assert.equal(withSearchSources('原答覆',[{url:'javascript:alert(1)'}]),'原答覆');
});
test('current conversation runtime has no retired formatter calls or schema dependencies',()=>{
 for(const relative of ['../core/SearchReply.js','../core/AgentCore.js','../features/search/Conversation.js']){
  const content=fs.readFileSync(new URL(relative,import.meta.url),'utf8');
  assert.doesNotMatch(content,/verifiedSteamPriceReply|searchEvidencePayload|needsCurrentSearch|game_updates|supporting_sources|subject_check|version_check|body_is_passages|score_semantics|validation_policy|source_selection|XNG|SearXNG/);
 }
});
test('search status describes rotation and estimated API costs without claiming a free engine',async()=>{
 const agent={states:{touch(){},state:'IDLE'},companion:{boredom:{respond(){}}},exclusive:fn=>fn(),memory:{working:{add(){}}},bus:{publish(){}},
  async status(){return {search:{configured:true,providers:[{name:'Exa',reason:'key_budget',reservedUsage:9,cap:9,unit:'USD'},{name:'Tavily',reason:'ready',reservedUsage:1,cap:900,unit:'credits'}]}};}};
 const {content}=await conversationControl(agent,'查看搜尋狀態',{action:'search_status'});
 assert.match(content,/API 輪替/);assert.match(content,/Exa：金鑰額度用盡/);assert.match(content,/Tavily：可用/);assert.match(content,/可能計費/);assert.doesNotMatch(content,/不使用付費|RSS|XNG/);
 agent.status=async()=>({search:{provider:'disabled',configured:false}});
 assert.match((await conversationControl(agent,'查看搜尋狀態',{action:'search_status'})).content,/尚未啟用/);
});
