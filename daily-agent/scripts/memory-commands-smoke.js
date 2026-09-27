import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=path.resolve('test-output/memory-commands-'+Date.now()),dataDir=path.join(output,'data');
fs.mkdirSync(dataDir,{recursive:true});
fs.writeFileSync(path.join(dataDir,'environment-settings.json'),JSON.stringify({perception:false,lightLookup:false,weatherEnabled:false}));
const base='http://127.0.0.1:3215';let server,token,report={};
async function start(){
  token=null;
  server=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,DAILY_PORT:'3215',DAILY_DATA:dataDir},stdio:'ignore'});
  for(let i=0;i<60;i++){
    try{const r=await fetch(base);if(r.ok){token=(await r.text()).match(/name="daily-token" content="([a-f0-9]+)"/)[1];return;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }throw Error('test server startup failed');
}
async function api(route,data){
  const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;
}
const chat=text=>api('chat',{text});
async function stop(){
  if(!server)return;
  if(token)await api('shutdown',{}).catch(()=>server.kill());else server.kill();
  if(server.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{server.kill();resolve()},5000);server.once('exit',()=>{clearTimeout(timer);resolve()})});
  server=null;token=null;
}
try{
  await start();await api('idle',{});
  const added=await chat('記住偏好：測試時喜歡短回答'),id=added.content.match(/\[([a-f\d]{8})\]/)[1];
  assert.match((await chat(`修改記憶 ${id}：測試時喜歡詳細回答`)).content,/已更新/);
  assert.match((await chat('搜尋永久記憶：詳細回答')).content,new RegExp(id));
  const status=await api('status');assert.equal(status.state,'IDLE');assert.equal(status.models.length,0);
  const initial=status.pins.find(p=>p.text.includes('Working Context'));
  assert.ok(initial);await chat(`刪除記憶 ${initial.id}`);
  await stop();await start();
  const restored=await api('status');
  assert.ok(restored.pins.some(p=>p.id.startsWith(id)&&p.text==='測試時喜歡詳細回答'));
  assert.ok(!restored.pins.some(p=>p.id===initial.id));
  assert.match((await chat(`刪除記憶 ${id}`)).content,/原始聊天仍保留/);
  assert.ok(!(await api('status')).pins.some(p=>p.id.startsWith(id)));
  assert.ok((await api('history')).some(m=>m.content==='記住偏好：測試時喜歡短回答'));
  report={passed:true,idleWithoutModel:true,editSurvivesRestart:true,deletedDefaultNotReseeded:true,originalHistoryPreserved:true};
}catch(e){report={passed:false,error:e.stack};process.exitCode=1;}
finally{await stop();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report}));}
