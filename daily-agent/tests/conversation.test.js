import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalWeatherQuestion } from '../core/WeatherIntent.js';
import { parseConversationControl } from '../core/ConversationControls.js';
test('simple weather conversation uses current environment only',()=>{
  for(const text of ['今天天氣怎麼樣？','會下雨嗎？','露米，現在幾度？','要不要帶傘','露米請幫我查一下今天天氣']) assert.equal(isLocalWeatherQuestion(text),true,text);
  for(const text of ['明天東京會下雨嗎？','分析天氣預測的原理','台北天氣','比較下周台北和東京天氣','今天有什麼 AI 新聞？']) assert.equal(isLocalWeatherQuestion(text),false,text);
});
test('conversation controls are explicit and preserve unrelated requests',()=>{
  assert.deepEqual(parseConversationControl('請關閉天氣提醒'),{action:'setting',key:'weatherEnabled',value:false,label:'天氣提醒'});
  assert.equal(parseConversationControl('天氣更新間隔改成十五分鐘').value,900000);
  assert.equal(parseConversationControl('進入待機').action,'idle');
  assert.equal(parseConversationControl('說明如何關閉天氣提醒'),null);
  assert.equal(parseConversationControl('關閉所有程式'),null);
});
