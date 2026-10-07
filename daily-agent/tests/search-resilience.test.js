import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReadablePage} from '../browser/BrowserAgent.js';
import {LightWebLookup,entityKey} from '../idle/LightWebLookup.js';
import {parseConversationControl} from '../core/ConversationControls.js';
test('validation pages and HTTP failures are not accepted as source text',()=>{
  assert.throws(()=>assertReadablePage({title:'Just a moment...',body:'Checking your browser'},200),/驗證/);
  assert.throws(()=>assertReadablePage({title:'error',body:'Bad request'},403),/403/);
  assert.throws(()=>assertReadablePage({title:'',body:''}),/文字/);
  assert.equal(assertReadablePage({title:'Archicad',body:'BIM software'}).title,'Archicad');
});

test('entity learns full source once, deduplicates simultaneous lookup and normalizes process extension',async()=>{
  const saved=new Map();let calls=0;
  const memory={entities:{get:key=>saved.get(key)},async learnEntity(entry){saved.set(entry.entity,entry)}};
  const browser={async search(){calls++;await new Promise(r=>setTimeout(r,10));return {results:[{title:'Archicad',url:'https://graphisoft.com/archicad',body:'BIM software for architectural design',coverage:'page'}]}},async close(){}};
  const lookup=new LightWebLookup(memory,browser);
  const [a,b]=await Promise.all([lookup.lookup('Archicad.exe',{force:true}),lookup.lookup('ARCHICAD',{force:true})]);
  assert.equal(calls,1);assert.equal(saved.size,1);assert.match(a.likely_activity,/BIM/);assert.equal(b.entity,'archicad');
  assert.equal((await lookup.lookup('Archicad.exe')).memory_hit,true);assert.equal(calls,1);
  assert.equal(entityKey('Archicad.EXE'),'archicad');
});

test('snippets and unrelated results never become entity knowledge; failed lookup backs off',async()=>{
  let calls=0,saves=0;
  const lookup=new LightWebLookup({entities:{get(){}},async learnEntity(){saves++;}},
    {async search(){calls++;return {results:[{url:'https://graphisoft.com/archicad',body:'BIM',coverage:'search-excerpt'}]}},async close(){}});
  assert.equal(await lookup.lookup('Archicad.exe'),null);assert.equal(await lookup.lookup('Archicad.exe'),null);
  assert.equal(calls,1);assert.equal(saves,0);
});

test('search status can be requested through conversation',()=>{
  assert.equal(parseConversationControl('查看搜尋狀態').action,'search_status');
  assert.equal(parseConversationControl('解釋搜尋狀態'),null);
});
