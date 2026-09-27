import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {MemoryPalace} from '../memory/MemoryPalace.js';
import {palaceBook,palaceView} from '../memory/PalaceView.js';
import {CalendarWatch,parseCalendar} from '../idle/CalendarWatch.js';
import {LightPerception} from '../idle/LightPerception.js';
import {NotificationWatch} from '../idle/NotificationWatch.js';
import {PhoneBridge} from '../environment/PhoneBridge.js';
import {LocationProvider} from '../environment/LocationProvider.js';
import {DocumentStore} from '../documents/DocumentStore.js';
import {parseDocumentCommand} from '../core/DocumentCommands.js';
import {parseConversationControl} from '../core/ConversationControls.js';
import {loadNativeTokenizer} from '../models/NativeTokenizer.js';
import {eventFact,groundEventText} from '../idle/EventNarration.js';
import {SpeakDecisionEngine} from '../idle/SpeakDecisionEngine.js';
import {companionEvent} from '../core/CompanionEvents.js';
const embed={model:'test',embed:async texts=>texts.map(t=>/建築|architecture/i.test(t)?[1,0]:[0,1])};
const temporary=async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-complete-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;};
test('contradictory pins require explicit resolution and keep prior version',()=>{
  const m=new MemoryPalace(':memory:',embed);try{const old=m.pins.save('請叫我小林');const conflict=m.pins.save('請叫我小陳');assert.equal(conflict.conflict,true);assert.equal(m.pins.all().length,1);m.pins.conflicts.resolve(conflict.id.slice(0,8),true,m.pins);assert.equal(m.pins.all()[0].text,'請叫我小陳');assert.equal(JSON.parse(m.db.prepare('SELECT pin FROM pin_history').get().pin).id,old.id);assert.equal(m.pins.conflicts.list().length,0);}finally{m.close();}
});
test('bookshelf pages retain complete raw text through successive bounded slices',async()=>{
  const m=new MemoryPalace(':memory:',embed);try{m.working.add('user','原始內容。'.repeat(2000),'old');m.working.add('user','新主題','new');await m.flush({force:true});const view=palaceView(m),id=view.books[0].book_id;let offset=0,all='';do{const b=palaceBook(m,id,offset);assert.ok(b.raw.length<=6000);assert.ok(b.cards.length);all+=b.raw;offset=b.next;}while(offset!==null);assert.ok(all.includes('原始內容。'.repeat(2000)));}finally{m.close();}
});
test('calendar recurrence exceptions, opt-in, restart and delivery acknowledgment',async t=>{
  const dir=await temporary(t),now=Date.parse('2026-09-27T02:45:00Z');
  const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meeting\r\nDTSTART:20260927T030000Z\r\nDTEND:20260927T040000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20260928T030000Z\r\nSUMMARY:測試會議\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const parsed=await parseCalendar(ics,now);assert.equal(parsed.length,2);const c=new CalendarWatch(dir);await c.import('test.ics',ics,now);assert.equal(await c.poll(now),null);c.enable(true);const e=await c.poll(now);assert.equal(e.type,'CALENDAR_EVENT');assert.ok(await c.poll(now+1000),'unsent event retained');c.ack(e,now);assert.equal(await new CalendarWatch(dir).poll(now+2000),null);await assert.rejects(async()=>parseCalendar(ics.replace('FREQ=DAILY','FREQ=SECONDLY'),now));
});
test('low-frequency perception respects title and per-process cooldown even for explicit requests',async()=>{
  let now=900000,captures=0;const p=new LightPerception({now:()=>now,capture:async()=>{captures++;return {image:Buffer.from('fake').toString('base64'),process:'Editor'};},ocr:{recognize:async()=>({text:'const hello = true'})}});
  assert.equal((await p.observe({process:'Editor',title:'file.js'})).skipped,true);assert.equal((await p.observe({process:'Editor',title:'file.js'},{force:true})).category,'coding');assert.equal((await p.observe({process:'Editor'},{force:true})).skipped,true);now+=600000;await p.observe({process:'Editor'},{force:true});assert.equal(captures,2);
});
test('semantic document retrieval works across wording and reuses persistent vectors',async t=>{
  const dir=await temporary(t);let calls=0;const embedding={...embed,embed:async texts=>{calls+=texts.length;return embed.embed(texts);}};const s=new DocumentStore(dir,{embedding});
  const d=await s.ingest({name:'Architecture.txt',data:Buffer.from('Architecture uses spatial design.').toString('base64')});await s.ingest({name:'Cooking.txt',data:Buffer.from('Cooking requires warm water.').toString('base64')});
  assert.equal((await s.library.semanticSearch('建築')).items[0].id,d.id);const before=calls;await new DocumentStore(dir,{embedding}).library.semanticSearch('建築');assert.equal(calls-before,1);assert.equal(parseDocumentCommand('比較文件 a.txt、b.txt：差異').action,'compare');
});
test('notification adapter deduplicates metadata without reading message contents',()=>{const n=new NotificationWatch();const e=n.receive({id:'1',app:'Calendar',body:'secret'});assert.ok(!JSON.stringify(e).includes('secret'));assert.equal(n.receive({id:'1',app:'Calendar'}),null);assert.throws(()=>n.receive({id:'abc',app:'x'}));});
test('native tokenizer matches known Qwen vocabulary and verifies assets',()=>{const tokenizer=loadNativeTokenizer(path.resolve('../.daily-runtime/tokenizer'));assert.equal(tokenizer.count('Hello world'),2);assert.equal(tokenizer.count('<|im_start|>'),1);assert.ok(tokenizer.count('這是一段繁體中文。')>1);});
test('phone HTTPS pairing validates origin, single use, auth, GPS precision and revocation',async t=>{
  const location=new LocationProvider({windows:async()=>null,ip:async()=>null});let invalidations=0;const phone=new PhoneBridge(location,{port:0,host:'127.0.0.1',onLocation:()=>invalidations++});t.after(()=>phone.close());const pairing=await phone.start();
  const request=(route,data,headers={})=>new Promise((resolve,reject)=>{const req=https.request({host:'127.0.0.1',port:phone.actualPort,path:route,method:'POST',rejectUnauthorized:false,headers:{'Content-Type':'application/json',...headers}},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(raw)}));});req.on('error',reject);req.end(JSON.stringify(data));});
  assert.equal((await request('/pair',{code:pairing.code},{Origin:'https://evil.example'})).status,403);assert.equal((await request('/location',{latitude:25,longitude:121})).status,401);const paired=await request('/pair',{code:pairing.code});assert.equal(paired.status,200);assert.equal((await request('/pair',{code:pairing.code})).status,403);const auth={Authorization:'Bearer '+paired.data.token};assert.equal((await request('/location',{latitude:25.12345,longitude:121.54321},auth)).status,200);assert.equal((await location.current('CITY')).latitude,25.1);assert.equal(invalidations,1);assert.ok(!JSON.stringify(phone.status()).includes('25.12345'));assert.equal((await request('/revoke',{},auth)).status,200);assert.equal(location.phone,null);
});
test('new command routing remains explicit',()=>{assert.equal(parseConversationControl('開啟手機配對').action,'phone_pair');assert.equal(parseConversationControl('查看行事曆').action,'calendar_list');assert.equal(parseConversationControl('請解釋行事曆格式'),null);});
test('habit sequences accumulate independent observations and track title changes',()=>{
  const m=new MemoryPalace(':memory:',embed);try{const h=m.habits;let at=1000000;for(let i=0;i<5;i++){h.observeSequence({process:'Photoshop.exe',title:'empty'},at);h.observeSequence({process:'Photoshop.exe',title:'character_sprite.png'},at+1000);h.observeSequence({process:'PixelTool.exe',title:'sprite'},at+2000);if(i===0)assert.equal(h.confirmed().length,0);at+=360000;}const row=h.confirmed().find(r=>r.key==='possible_character_asset_workflow');assert.equal(row.evidence_count,5);assert.ok(row.confidence>=0.4);}finally{m.close();}
});
test('work events cannot invent weather, timing or explanatory meta replies',()=>{const event=companionEvent('LONG_WORK_SESSION');for(const text of ['預報顯示你工作了 2 分鐘。','這是一個問句，似乎是因為工作很久。','太長'.repeat(50)])assert.equal(groundEventText(text,event),eventFact(event));});
test('separate calendar appointments keep global cooldown without 45-minute topic suppression',async()=>{
  const d=new SpeakDecisionEngine(embed),now=10000000,a=companionEvent('CALENDAR_EVENT',{id:'a'},95,now),b=companionEvent('CALENDAR_EVENT',{id:'b'},95,now);
  assert.equal(await d.accept('10:00 有設計會議。',a.type,now,a),true);d.markEvent(a);
  const params={activity:{since:now,idleMs:0},awayMs:0,boredom:0,event:b};assert.equal(d.decide({...params,now:now+60000}).should_speak,false);assert.equal(d.decide({...params,now:now+100000}).should_speak,true);assert.equal(await d.accept('10:30 有專案會議。',b.type,now+100000,b),true);
});
