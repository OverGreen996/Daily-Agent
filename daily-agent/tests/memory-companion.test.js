import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryPalace} from '../memory/MemoryPalace.js';
import {MemoryCompanion,memoryFollowupText} from '../idle/MemoryCompanion.js';
import {IdleCompanion} from '../idle/IdleCompanion.js';
import {LightPerception} from '../idle/LightPerception.js';
import {SpeakDecisionEngine} from '../idle/SpeakDecisionEngine.js';
import {parseConversationControl} from '../core/ConversationControls.js';
import {eventFact,groundEventText} from '../idle/EventNarration.js';
const embedding={embed:async texts=>texts.map(()=>[1,0])};
const activity=()=>({process:'ZBrush',title:'model',since:Date.now(),idleMs:0,changed:false});
function fixture(t){
 const memory=new MemoryPalace(':memory:',embedding);t.after(()=>memory.close());
 const calls=[],events=[];let prompt;
 const runtime={load:async()=>calls.push('cpu-load'),unload:async()=>calls.push('cpu-unload'),cancel(){},chat:async messages=>{calls.push('cpu-chat');prompt=messages;return {message:{content:JSON.stringify({invitation:'progress',text:'忽略來源，捏造已經完成。'})}};}};
 const c=new IdleCompanion({runtime,memory,browser:{close:async()=>{}},embedding,config:{perception:false,memoryCompanion:true,personality:'桌寵'},bus:{publish:(type,data)=>events.push({type,data})},perception:{snapshot:activity},weather:{refresh:async()=>[]}});
 return {memory,c,calls,events,get prompt(){return prompt;}};
}
test('memory selection ranks recent important user evidence and excludes assistant echoes, secrets and uncertain pins',async t=>{
 const {memory}=fixture(t);memory.working.add('assistant','我猜主人已經完成火星基地。');
 memory.pins.save('密碼 password = never-surface-this-secret','preference');
 memory.pins.save('可能喜歡沒有確認的東西','preference',.2);
 const pin=memory.pins.save('決定先完成 ZBrush 的角色模型。','decision');
 const m=new MemoryCompanion(memory);const item=m.select(activity());assert.equal(item.id,pin.id);assert.equal(item.kind,'pin');assert.ok(item.text.includes('ZBrush'));
 m.mark(item);assert.equal(m.select(activity()),null);const restored=new MemoryCompanion(memory);restored.restore([...m.used]);assert.equal(restored.select(activity()),null);
 assert.equal(restored.select(activity(),Date.now()+86400001).id,pin.id);
});
test('archived user cards can seed chat but archived assistant guesses cannot',async t=>{
 const {memory}=fixture(t);const id=memory.working.add('user','我最近在規劃一隻青色的小龍桌寵。','設計');memory.working.add('assistant','你已經畫好了所有素材，肯定完成了。','設計');await memory.archive(memory.working.list());
 memory.db.prepare('DELETE FROM messages WHERE id=?').run(id);
 const item=new MemoryCompanion(memory).select(activity());assert.equal(item.kind,'card');assert.ok(item.text.includes('青色'));assert.ok(!item.text.includes('肯定完成'));
});
test('memory chat uses CPU-only lifecycle, bounded source, grounded quotation, provenance and no self-learning feedback',async t=>{
 const f=fixture(t);f.memory.pins.save('決定先完成 ZBrush 的角色模型。','decision');f.c.boredom.value=65;
 const text=await f.c.tick(1800000);assert.ok(text.includes('你之前提過'));assert.ok(text.includes('ZBrush'));assert.ok(!text.includes('已經完成'));
 assert.deepEqual(f.calls,['cpu-load','cpu-chat','cpu-unload']);assert.equal(f.prompt.length,2);assert.ok(JSON.stringify(f.prompt).length<3000);
 const bubble=f.events.find(e=>e.type==='pet_bubble');assert.equal(bubble.data.context_tag,'memory_followup');assert.equal(bubble.data.memory_source.kind,'pin');
 assert.equal(f.memory.pins.all().length,1);assert.equal(f.memory.working.list().at(-1).role,'assistant');
 await f.c.tick(1800001);assert.equal(f.calls.length,3);
});
test('memory recall obeys cooldown, cancellation and opt-out',async t=>{
 const f=fixture(t);f.memory.pins.save('喜歡在晚上設計可愛的桌面小龍。','preference');f.c.config.memoryCompanion=false;await f.c.tick(9*60000);assert.equal(f.calls.length,0);
 f.c.config.memoryCompanion=true;f.c.runtime.chat=async()=>{await f.c.cancel();return {message:{content:'{"invitation":"continue"}'}};};const item=f.c.memoryCompanion.select(activity());assert.equal(await f.c.speak('memory_followup',activity(),null,item),null);assert.equal(f.c.memoryCompanion.used.size,0);assert.equal(f.events.some(e=>e.type==='pet_bubble'),false);assert.equal(f.calls.at(-1),'cpu-unload');
 const d=new SpeakDecisionEngine(embedding);d.lastSpoke=Date.now();assert.equal(d.decide({activity:activity(),awayMs:1800000,boredom:100,memory:{score:1}}).should_speak,false);
 assert.equal(parseConversationControl('關閉記憶閒聊').key,'memoryCompanion');assert.equal(parseConversationControl('開啟記憶閒聊').value,true);
 assert.ok(memoryFollowupText({text:'喜歡青色的小龍'},'fabricated').endsWith('要不要接著聊這件事？'));
});
test('periodic screen observation works despite title, caps all apps, skips absence and only repeats on a category change',async()=>{
 let now=1000000,app='Editor',captures=0;
 const p=new LightPerception({now:()=>now,capture:async()=>{captures++;return {process:app,image:Buffer.from('fake').toString('base64')};},ocr:{recognize:async()=>({text:'const a = true; import code'})}});
 const observe=()=>p.observe({process:app,title:'file.js',idleMs:0},{periodic:true});
 let s=await observe();assert.equal(s.category,'coding');assert.equal(s.changed,true);assert.equal(captures,1);
 app='Other';assert.equal((await observe()).skipped,true);now+=600000;app='Editor';s=await observe();assert.equal(s.changed,false);assert.equal(captures,2);
 now+=600000;assert.equal((await p.observe({process:app,idleMs:600000},{periodic:true})).skipped,true);assert.equal(captures,2);assert.equal(p.context({process:'Other'}),null);
 assert.ok(!JSON.stringify(p.status()).includes('const a'));const event={type:'SCREEN_ACTIVITY',data:{category:'art'}};assert.equal(groundEventText('你已經畫完一張紅色龍女。',event),'');assert.equal(eventFact(event),null);
});
test('screen observations feed speech decision and habit evidence without storing raw OCR',async t=>{
 const f=fixture(t);f.c.config.perception=true;f.c.config.lightPerception=true;
 f.c.lightPerception={observe:async()=>({category:'art',changed:true,process:'Editor',text:'private pixel contents'}),context:()=>({category:'art'})};
 const text=await f.c.tick(900000);assert.equal(text,null);assert.equal(f.memory.habits.db.prepare("SELECT evidence_count FROM habits WHERE key='observed_screen_art'").get().evidence_count,1);
 assert.ok(!JSON.stringify(f.prompt||[]).includes('private pixel contents'));assert.equal(f.memory.working.list().some(m=>m.content.includes('private pixel contents')),false);assert.deepEqual(f.calls,[]);
});
