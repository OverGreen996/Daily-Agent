import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createAgent} from '../core/createAgent.js';
import {LightPerception} from '../idle/LightPerception.js';
const dir=path.resolve('test-output/companion-memory-'+Date.now());fs.mkdirSync(dir,{recursive:true});
const initial=await(await fetch('http://127.0.0.1:11435/api/ps')).json();assert.equal(initial.models.length,0,'Only run while production models are unloaded');
const agent=createAgent({dataDir:path.join(dir,'data'),perception:false,lightLookup:false,weatherEnabled:false,memoryCompanion:true});
const report={started:new Date().toISOString()};let fullLoads=0;
agent.full.load=async()=>{fullLoads++;throw Error('Full GPU model must not load');};
const load=agent.idleRuntime.load.bind(agent.idleRuntime);
agent.idleRuntime.load=async()=>{await load();const s=await agent.idleRuntime.status();report.idleModel={name:s.name,size:s.size,size_vram:s.size_vram};assert.equal(s.size_vram,0);};
try{
  agent.memory.pins.save('決定先完成 ZBrush 的青色小龍模型。','decision');
  const item=agent.companion.memoryCompanion.select({process:'ZBrush'});
  report.text=await agent.companion.speak('memory_followup',{process:'ZBrush',title:'model',idleMs:0,since:Date.now()},null,item);
  assert.ok(report.text?.includes('青色小龍'));assert.equal(fullLoads,0);report.after=(await(await fetch('http://127.0.0.1:11435/api/ps')).json()).models;assert.equal(report.after.length,0);
  // User requested screen observation. Run one real capture/OCR; never persist image or OCR text.
  const p=new LightPerception();
  const {captureWindow}=await import('../idle/LightPerception.js');
  const captured=await captureWindow();
  p.capture=async()=>captured;
  const result=await p.observe({process:captured.process,title:'live foreground',idleMs:0},{periodic:true});
  report.screen={width:result.width,height:result.height,category:result.category,characters:result.text.length,rawPersisted:false};
  assert.equal(result.width,640);assert.equal(result.height,360);report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{await agent.stop();fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));console.log('Report: '+path.join(dir,'report.json'));}
