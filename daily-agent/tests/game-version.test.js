import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGameVersions,gameIdentityMatches} from '../browser/GameVersionCheck.js';
import {crossCheckFacts} from '../browser/SearchFacts.js';
const plan={title_hint:'Astral Caravan',requested_version:null};
const update={title:'Astral Caravan Patch 1.8',url:'https://example.com/update',body:'Version 1.8 fixes combat',coverage:'page',reliability:'primary',date:'2026-10-01'};
test('guide version is compared to a read official patch and page modification date',()=>{
 const r=checkGameVersions(plan,[{url:'https://wiki.gg/a',title:'Astral Caravan guide',body:'Patch 1.7',date:'2026-09-20'}],[update]);
 assert.equal(r.latest_observed_version,'1.8');assert.equal(r.guides[0].status,'older-than-observed-update');
 assert.equal(r.guides[0].predates_observed_update,true);assert.equal(r.mechanics_compatibility_verified,false);
});
test('new modification date alone never verifies gameplay version',()=>{
 const r=checkGameVersions(plan,[{url:'https://wiki.gg/a',body:'Steps and prerequisites',modified_at:new Date().toISOString()}],[update]);
 assert.equal(r.guides[0].status,'version-unknown');assert.equal(r.guides[0].requires_recheck,true);
 assert.equal(checkGameVersions(plan,[],[{...update,coverage:'search-excerpt'}]).latest_observed_version,null);
});
test('different games and beta patches cannot establish latest official version',()=>{
 assert.equal(gameIdentityMatches('Darkest Dungeon 2',{title:'Minecraft Dungeons II patch notes',url:'https://x.com'}),false);
 assert.equal(checkGameVersions(plan,[],[{...update,title:'Other game Patch 9.0',body:'Other game'}, {...update,title:'Astral Caravan beta Patch 9.0'}]).latest_observed_version,null);
});
test('explicit requested old version is retained instead of silently replaced with current patch',()=>{
 const r=checkGameVersions({...plan,requested_version:'1.7'},[{url:'https://x.com/a',body:'Version 1.8'}],[update]);
 assert.equal(r.requested_version,'1.7');assert.equal(r.guides[0].status,'requested-version-not-confirmed');
});
test('phone price check binds generation, Pro variant and capacity while rejecting cases and Pro Max',()=>{
 const products=[{name:'iPhone 17 Pro 256G',price:39900,currency:'TWD'},
  {name:'iPhone 17 Pro Max 256GB',price:44900,currency:'TWD'},
  {name:'iPhone 17 Pro 256GB 手機殼',price:490,currency:'TWD'},
  {name:'iPhone 17 Pro 512GB',price:46900,currency:'TWD'},
  {name:'iPhone 16 Pro 256GB',price:32900,currency:'TWD'}];
 const f=crossCheckFacts('台灣 iPhone 17 Pro 256GB 現在價格',[{url:'https://24h.pchome.com.tw/a',title:'iPhone 17 Pro 256G',products}]);
 assert.deepEqual(f.price.candidates.map(x=>x.value),[39900]);
});
