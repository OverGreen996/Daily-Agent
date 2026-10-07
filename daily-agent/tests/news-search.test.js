import test from 'node:test';
import assert from 'node:assert/strict';
import {withSearchSources} from '../core/SearchReply.js';
test('plain news replies always include missing source URLs once and preserve code',()=>{
  const sources=[{title:'News',url:'https://example.com/news'}];
  const text=withSearchSources('**新聞**\n* 內容\n```a**b**```',sources);
  assert.ok(text.startsWith('新聞\n• 內容'));
  assert.ok(text.includes('```a**b**```'));
  assert.ok(text.includes(sources[0].url));
  assert.equal(withSearchSources(text,sources),text);
});



test('headline-only results ignore invented model details and format timestamp with zone',()=>{
 const reply=withSearchSources('今天清晨六點發布而且很受歡迎',[{title:'新聞原標題',url:'https://example.com/a',date:'2026-09-28T06:00:00Z',coverage:'headline-only'}]);assert.match(reply,/新聞原標題/);assert.match(reply,/尚未讀取全文/);assert.doesNotMatch(reply,/很受歡迎|清晨/);assert.ok(reply.includes('Asia/Taipei'));
});
