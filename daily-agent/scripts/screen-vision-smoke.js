import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createAgent} from '../core/createAgent.js';
import {companionEvent} from '../core/CompanionEvents.js';
const dir=path.resolve('test-output/screen-vision-'+Date.now());fs.mkdirSync(dir,{recursive:true});
const initial=await(await fetch('http://127.0.0.1:11435/api/ps')).json();assert.equal(initial.models.length,0,'Run only when production models are unloaded');
const agent=createAgent({dataDir:path.join(dir,'data'),perception:false,lightLookup:false,weatherEnabled:false});const report={started:new Date().toISOString()};
try{
 agent.memory.working.add('user','這是要保留的上下文。','smoke');const before=agent.memory.working.list();
 const started=Date.now();report.observation=await agent.companion.lightPerception.vision.observe({image:fs.readFileSync('test-output/vision-427.png').toString('base64')});
 report.durationMs=Date.now()-started;report.resources=agent.companion.lightPerception.vision.status();report.afterVision=(await(await fetch('http://127.0.0.1:11435/api/ps')).json()).models;
 assert.equal(report.afterVision.length,0);assert.deepEqual(agent.memory.working.list(),before);assert.ok(report.observation.summary.includes('427'));
 const originalLoad=agent.idleRuntime.load.bind(agent.idleRuntime);agent.idleRuntime.load=async()=>{await originalLoad();const s=await agent.idleRuntime.status();report.idleVram=s.size_vram;assert.equal(s.size_vram,0);};
 const originalChat=agent.idleRuntime.chat.bind(agent.idleRuntime);agent.idleRuntime.chat=async(...args)=>{const r=await originalChat(...args);report.candidate=JSON.parse(r.message.content);return r;};
 const event=companionEvent('SCREEN_ACTIVITY',{category:report.observation.category,summary:report.observation.summary},50);
 report.reply=await agent.companion.speak('SCREEN_ACTIVITY',{},event);assert.equal(report.reply,null,'An isolated number is not a conversation opportunity');
 report.conversation=await agent.companion.speak('SCREEN_ACTIVITY',{},companionEvent('SCREEN_ACTIVITY',{category:'browser',summary:'正在觀看一部影片，右側有推薦列表。'},50));assert.ok(report.conversation);assert.ok(!report.conversation.includes('畫面'));report.afterSpeech=(await(await fetch('http://127.0.0.1:11435/api/ps')).json()).models;assert.equal(report.afterSpeech.length,0);report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{await agent.stop();fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));console.log('Report: '+path.join(dir,'report.json'));}
