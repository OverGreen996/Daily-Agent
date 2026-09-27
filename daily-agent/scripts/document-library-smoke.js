import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=path.resolve('test-output/document-library-'+Date.now()),dataDir=path.join(output,'data');
fs.mkdirSync(dataDir,{recursive:true});
fs.writeFileSync(path.join(dataDir,'environment-settings.json'),JSON.stringify({perception:false,lightLookup:false,weatherEnabled:false}));
const base='http://127.0.0.1:3217';let server,token,report={},errors='';
async function start(){
  token=null;server=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,DAILY_PORT:'3217',DAILY_DATA:dataDir},stdio:'pipe'});
  server.stdout.resume();server.stderr.on('data',chunk=>errors+=chunk.toString());
  for(let i=0;i<60;i++){try{const r=await fetch(base);if(r.ok){token=(await r.text()).match(/name="daily-token" content="([a-f0-9]+)"/)[1];return;}}catch{}await new Promise(r=>setTimeout(r,100));}
  throw Error('test server startup failed');
}
async function api(route,data){
  const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;
}
const chat=text=>api('chat',{text});
async function stop(){
  if(!server)return;if(token)await api('shutdown',{}).catch(()=>server.kill());else server.kill();
  if(server.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{server.kill();resolve()},5000);server.once('exit',()=>{clearTimeout(timer);resolve()})});
  server=null;token=null;
}
try{
  await start();
  const original='Project code: VIOLET-731. Review date: 2027-02-14.',other='Project code: GOLD-912. Review date: 2027-05-21.';
  await api('chat',{text:'文件代碼是什麼？',document:{name:'budget.txt',data:Buffer.from(original).toString('base64')}});
  const first=JSON.parse((await api('history')).find(m=>m.role==='user').extra).document_id;
  await api('chat',{text:'文件代碼是什麼？',document:{name:'budget.txt',data:Buffer.from(other).toString('base64')}});
  await api('idle',{});
  assert.match((await chat('查看文件庫')).content,/共 2 份/);
  assert.match((await chat('搜尋文件：VIOLET-731')).content,new RegExp(first.slice(0,12)));
  assert.match((await chat('使用文件 budget.txt')).content,/多份/);
  await chat('使用文件 '+first.slice(0,12));
  const idle=await api('status');assert.equal(idle.state,'IDLE');assert.equal(idle.models.length,0);
  report.idleCatalogWithoutModel=true;
  await stop();
  // Isolated fixture: simulate old conversations having left Working Memory.
  // Keep every source message; real topic/Book flushing is covered by memory tests.
  const db=new DatabaseSync(path.join(dataDir,'palace.sqlite'));const rows=db.prepare('SELECT count(*) n FROM messages').get().n;
  db.exec('UPDATE messages SET archived=1');db.close();
  await start();assert.equal((await api('history')).length,0);
  assert.match((await chat('查看目前文件')).content,new RegExp(first.slice(0,12)));
  const answer=(await chat('這份文件的審查日期是哪一天？只回答日期。')).content;
  assert.match(answer,/2027/);assert.match(answer,/14/);assert.doesNotMatch(answer,/21/);
  const explicit=(await chat('詢問文件 '+first.slice(0,12)+'：代碼是什麼？')).content;
  assert.match(explicit,/VIOLET-731/);
  await api('idle',{});await chat('結束文件閱讀');await stop();await start();await api('idle',{});
  assert.match((await chat('查看目前文件')).content,/沒有選用/);
  assert.equal(fs.readFileSync(path.join(dataDir,'documents',first),'utf8'),original);
  const check=new DatabaseSync(path.join(dataDir,'palace.sqlite'));assert.equal(check.prepare('SELECT count(*) n FROM messages WHERE archived=1').get().n,rows);check.close();
  report={...report,passed:true,answer,explicit,selectedFileSurvivesRestartAndArchivedWorkingMemory:true,ambiguousNameNotAutoSelected:true,clearSurvivesRestart:true,rawDocumentAndMessagesPreserved:true};
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1;}
finally{
  await stop();report.modelsAfter=(await(await fetch('http://127.0.0.1:11435/api/ps')).json()).models;
  if(report.modelsAfter.length){report.passed=false;process.exitCode=1;}
  report.serverErrors=errors;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report}));
}
