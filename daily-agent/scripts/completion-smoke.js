import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createAgent} from '../core/createAgent.js';
import {companionEvent} from '../core/CompanionEvents.js';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const output=path.resolve('test-output/completion-'+Date.now());fs.mkdirSync(output,{recursive:true});
const agent=createAgent({dataDir:path.join(output,'data'),perception:false,lightLookup:false,weatherEnabled:false});let report={output};
const gpu=()=>Number(execFileSync('nvidia-smi',['--query-gpu=memory.used','--format=csv,noheader,nounits'],{windowsHide:true,encoding:'utf8'}).trim());
const ram=()=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/measure-resources.ps1'),'-AgentProcessId',String(process.pid)],{windowsHide:true,encoding:'utf8'}));
try{
  report.baselineGpuMiB=gpu();report.tokenizer=agent.config.tokenizer;assert.ok(!report.tokenizer.fallback);
  const a=await agent.documents.ingest({name:'建築A.txt',data:Buffer.from('Architecture project A. Construction budget: TWD 180000. Deadline: 2027-02-14. Owner: ALPHA.').toString('base64')});
  await agent.documents.ingest({name:'建築B.txt',data:Buffer.from('Architecture project B. Construction budget: TWD 260000. Deadline: 2027-03-21. Owner: BETA.').toString('base64')});
  await agent.documents.ingest({name:'Cooking.txt',data:Buffer.from('Pancake recipe: milk, flour and water. Heat a skillet.').toString('base64')});
  const hits=await agent.documents.library.semanticSearch('哪份資料提到建設工程所需的經費？');report.semanticHits=hits.items.map(x=>({name:x.name,similarity:x.similarity}));assert.ok(hits.items.length && hits.items[0].name!=='Cooking.txt');console.log('semantic passed');
  report.comparison=(await agent.chat('比較文件 建築A.txt、建築B.txt：列出兩份文件各自的預算與截止日期，不需計算差額。')).content;
  assert.match(report.comparison,/180[,.]?000/);assert.match(report.comparison,/260[,.]?000/);assert.match(report.comparison,/2027/);assert.match(report.comparison,/14/);assert.match(report.comparison,/21/);
  report.active=await agent.full.status();report.activeGpuMiB=gpu();assert.ok(report.active.size_vram>0);assert.equal(report.active.context_length,16384);console.log('comparison and GPU active passed');
  await agent.enterIdle();assert.equal(agent.states.state,'IDLE');assert.equal(await agent.full.status(),null);report.unloadedGpuMiB=gpu();
  const originalLoad=agent.idleRuntime.load.bind(agent.idleRuntime);agent.idleRuntime.load=async()=>{const s=await originalLoad();report.idleModel=s;report.idleLoadedRam=ram();assert.equal(s.size_vram,0);return s;};
  const event=companionEvent('LONG_WORK_SESSION',{id:'test'},90);const decision=agent.companion.decision.decide({activity:{process:'ZBrush',since:Date.now()-3600000,idleMs:0},awayMs:3600000,boredom:70,event});assert.equal(decision.should_speak,true);
  report.idleSpeech=await agent.companion.speak(decision.context_tag,{process:'ZBrush',title:'hand.ZTL',idleMs:0,since:Date.now()-3600000},event);assert.ok(report.idleSpeech);assert.doesNotMatch(report.idleSpeech,/預報|\d/);assert.equal(await agent.idleRuntime.status(),null);report.idleRam=ram();report.idleGpuMiB=gpu();console.log('CPU speech and unload passed');
  report.wake=(await agent.chat('你剛才說的那句關心是什麼？請引用原文。')).content;assert.ok(report.wake.includes(report.idleSpeech));assert.equal(agent.states.state,'ACTIVE');
  const events=fs.readFileSync(path.join(output,'data/events.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));report.promptTokens=events.filter(e=>e.type==='inference').map(e=>e.prompt_tokens);assert.ok(report.promptTokens.every(n=>n<16384));
  report.passed=true;
}catch(e){report.error=e.stack;report.passed=false;process.exitCode=1;}
finally{await agent.stop();report.modelsAfter=(await agent.full.request('/api/ps')).models;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,passed:report.passed,error:report.error}));}
