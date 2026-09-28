import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePocketShare as parse} from '../remote/PocketIntent.js';
import {PocketDrop} from '../remote/PocketDrop.js';
import {AgentCore} from '../core/AgentCore.js';

test('natural phone share aliases and explicit payload boundaries',()=>{
  for(const text of ['幫我傳到手機','傳到手機','請幫我丟到手機','麻煩你送到我的手機','幫我分享到手機','可以幫我傳到手機嗎？','把這段文字傳到手機','幫我把剛剛的回答傳到手機','傳到手機 這段'])assert.deepEqual(parse(text),{kind:'previous'},text);
  for(const text of ['幫我傳到手機：明天有空嗎？','可以幫我傳到手機：明天有空嗎？','分享到 PocketDrop：明天有空嗎？'])assert.deepEqual(parse(text),{kind:'share',text:'明天有空嗎？'});
  assert.deepEqual(parse('幫我把「不要遲到」傳到手機'),{kind:'share',text:'不要遲到'});
  assert.deepEqual(parse('幫我傳到手機：'),{kind:'share',text:''});
  for(const text of ['不要幫我傳到手機','如果我說幫我傳到手機會怎樣','「幫我傳到手機」','傳到手機的方法','傳到手機 怎麼用','教我把內容傳到手機'])assert.equal(parse(text),null,text);
  for(const text of ['把這張圖片傳到手機','傳到手機 這張圖片','把檔案傳到手機'])assert.deepEqual(parse(text),{kind:'unsupported'},text);
});

test('previous reply is scoped, expires, stays transient and clears on disconnect',async()=>{
  let now=0;const p=new PocketDrop('',{store:{load:()=>null,clear(){}},now:()=>now});const sent=[];p.share=async text=>{sent.push(text);return 'ok';};
  p.rememberReply('phone-a','回答 A');p.rememberReply('phone-b','回答 B');
  assert.match(await p.command('幫我傳到手機'),/沒有可傳送/);
  await p.command('幫我傳到手機',{scope:'phone-a'});assert.deepEqual(sent,['回答 A']);
  assert.match(await p.command('幫我傳到手機：',{scope:'phone-a'}),/補上/);assert.equal(sent.length,1);
  now=900001;assert.match(await p.command('幫我傳到手機',{scope:'phone-b'}),/沒有可傳送/);
  p.rememberReply('pc','新回答');p.disconnect();assert.equal(p.replies.size,0);
  assert.equal(new PocketDrop('',{store:{load:()=>null}}).replies.size,0);
});

test('Agent captures only normal replies and keeps Pocket acknowledgements out',async()=>{
  const p=new PocketDrop('',{store:{load:()=>null}});let response={content:'一般回答'};
  const agent={pocketdrop:p,chatInternal:async()=>response};
  const chat=(text='你好',image=null,document=null)=>AgentCore.prototype.chat.call(agent,text,image,document,{deviceId:'mobile'});
  await chat();assert.equal(p.replies.get('mobile').text,'一般回答');
  response={content:'已傳送',pocketdrop:true};await chat('幫我傳到手機');assert.equal(p.replies.get('mobile').text,'一般回答');
  for(const excluded of [{content:'圖',image:'x'},{content:'生成',generation:{}},{content:'模式',image_mode:false},{content:'私密',no_memory:true}]){p.rememberReply('mobile','舊');response=excluded;await chat();assert.equal(p.replies.has('mobile'),false);}
  response={content:'文件'};await chat('讀取',null,{name:'x'});assert.equal(p.replies.has('mobile'),false);
});
