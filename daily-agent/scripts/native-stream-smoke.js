import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('..'),output=path.resolve('test-output/native-stream-'+Date.now());
fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:3214',dataDir=path.join(output,'data');
fs.mkdirSync(dataDir,{recursive:true});
fs.writeFileSync(path.join(dataDir,'environment-settings.json'),JSON.stringify({perception:false,lightLookup:false,weatherEnabled:false}));
const server=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,DAILY_PORT:'3214',DAILY_DATA:dataDir},stdio:'pipe'});
let token,report={},errors='';server.stdout.resume();server.stderr.on('data',data=>errors+=data.toString());
async function api(route,data){
  const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;
}
try{
  for(let i=0;i<60;i++){try{const r=await fetch(base);if(r.ok){token=(await r.text()).match(/name="daily-token" content="([a-f0-9]+)"/)[1];break}}catch{}await new Promise(r=>setTimeout(r,250))}
  assert.ok(token,'Server startup failed');await api('idle',{});
  const exe=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'daily-agent/desktop/Build-Pet.ps1')],{windowsHide:true,encoding:'utf8'}).trim().split(/\r?\n/).at(-1);
  await new Promise((resolve,reject)=>{
    const pet=spawn(exe,[root,base,'--stream-test',output],{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{pet.kill();reject(Error('Native stream timed out'))},300000);
    pet.once('error',reject);pet.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native exit '+code))});
  });
  report=JSON.parse(fs.readFileSync(path.join(output,'native-stream-test.json')));assert.equal(report.passed,true,report.error);
  const replies=(await api('history')).filter(m=>m.role==='assistant');
  assert.equal(replies.length,1);assert.equal(replies[0].content,report.answer);
  report.memorySavedOnce=true;
  const logs=fs.readFileSync(path.join(dataDir,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(logs.some(e=>e.type==='reply_delta'),false);
  report.noTokenDiskWrites=true;
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1}
finally{
  if(token)await api('shutdown',{}).catch(()=>server.kill());else server.kill();
  if(server.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{server.kill();resolve()},10000);server.once('exit',()=>{clearTimeout(timer);resolve()})});
  report.modelsAfter=(await(await fetch('http://127.0.0.1:11435/api/ps')).json()).models;
  if(report.modelsAfter.length){report.passed=false;process.exitCode=1}
  report.serverErrors=errors;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,...report}));
}
