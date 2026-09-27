import test from 'node:test';
import assert from 'node:assert/strict';
import {hasScreenConversation,screenConversationText,screenConversationMessages} from '../idle/ScreenConversation.js';
import {IdleCompanion} from '../idle/IdleCompanion.js';
const event={type:'SCREEN_ACTIVITY',data:{category:'browser',summary:'YouTube 網頁顯示阿諾與親戚的影片，右侧有推薦影片列表。'}};
const candidate={should_speak:true,support:'影片',text:'你在看什麼呀？讓我也看看～'};
test('screen conversation preserves a social invitation without forcing titles or an observation report',()=>{
 assert.equal(screenConversationText(candidate,event),candidate.text);
 const messages=screenConversationMessages(event,'露米',[candidate.text]);
 assert.ok(messages[0].content.includes('不是畫面播報員'));assert.ok(messages[1].content.includes(candidate.text));
});
test('screen conversation stays silent for reports, ungrounded evidence, opt out, unknown and long replies',()=>{
 for(const change of [{text:'剛才的畫面看起來是 YouTube，需要幫忙可以叫我。'},{text:'右邊有推薦影片列表。'},{text:'阿諾與親戚的影片'},{support:'正在烤餅乾'},{should_speak:false},{text:'你在看第99集嗎？'},{text:'長'.repeat(46)}])assert.equal(screenConversationText({...candidate,...change},event),'');
 assert.equal(screenConversationText(candidate,{...event,data:{...event.data,category:'unknown'}}),'');
 assert.equal(hasScreenConversation({data:{category:'other',summary:'中央有數字427，背景為白色。'}}),false);
 assert.equal(hasScreenConversation({data:{category:'browser',summary:'瀏覽器首頁只有網址列與按鈕。'}}),false);
});
test('rejected screen generation unloads CPU and never publishes or saves a fallback report',async()=>{
 const calls=[];const c=new IdleCompanion({runtime:{load:async()=>calls.push('load'),unload:async()=>calls.push('unload'),chat:async()=>({message:{content:JSON.stringify({...candidate,text:'畫面顯示 YouTube 影片。'})}})},memory:{working:{list:()=>[],add:()=>calls.push('saved')},pins:{all:()=>[]},habits:{}},browser:{},embedding:{embed:async()=>{throw Error('Rejected speech must not enter history');}},config:{},bus:{publish:type=>{if(type==='pet_bubble')calls.push('bubble');}},perception:{snapshot:()=>({})},weather:{}});
 assert.equal(await c.speak('SCREEN_ACTIVITY',{},event),null);assert.deepEqual(calls,['load','unload']);
});
