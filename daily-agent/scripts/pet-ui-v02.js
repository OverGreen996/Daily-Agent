// Native component integration against a real, isolated server; no desktop input simulation.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('..'), output=path.resolve('test-output/native-conversation');
fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:3211';
const dataDir=path.join(output,'data-'+Date.now());
const child=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,DAILY_PORT:'3211',DAILY_DATA:dataDir},stdio:'pipe'});
let token, errors='', report={};
child.stderr.on('data',d=>errors+=d.toString()); child.stdout.resume();
async function api(route,data) {
  const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await r.json(); assert.ok(r.ok,JSON.stringify(result)); return result;
}
try {
  let html;
  for(let i=0;i<60;i++) { try { const r=await fetch(base); if(r.ok){html=await r.text();break} } catch{} await new Promise(r=>setTimeout(r,250)); }
  assert.ok(html,'Server did not start'); token=html.match(/name="daily-token" content="([a-f0-9]+)"/)[1];
  assert.doesNotMatch(html,/<(?:button|aside|header|menu)\b/i);
  await api('chat',{text:'進入待機'}); assert.equal((await api('status')).state,'IDLE');
  await api('chat',{text:'關閉天氣提醒'}); assert.equal((await api('status')).settings.weatherEnabled,false);
  await api('chat',{text:'天氣更新間隔改成十分鐘'}); assert.equal((await api('status')).settings.weatherRefreshMs,600000);
  const exe=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'daily-agent/desktop/Build-Pet.ps1'),'-SelfTest'],{windowsHide:true,encoding:'utf8'}).trim().split(/\r?\n/).at(-1);
  await new Promise((resolve,reject)=>{
    const pet=spawn(exe,[root,base,'--integration-test',output],{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{pet.kill();reject(Error('Native integration timed out'))},60000);
    pet.once('error',reject);pet.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native exit '+code))});
  });
  report=JSON.parse(fs.readFileSync(path.join(output,'native-integration.json'))); assert.equal(report.passed,true,report.error);
  report.status=await api('status'); assert.equal(report.status.models.length,0);
  const history=await api('history'); assert.ok(history.some(m=>m.content==='會下雨嗎？'),'Weather conversation was not saved'); report.historySaved=true;
  await new Promise((resolve,reject)=>{
    const pet=spawn(exe,[root,base,'--shutdown-test',output],{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{pet.kill();reject(Error('Shutdown menu timed out'))},30000);
    pet.once('error',reject);pet.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native shutdown exit '+code))});
  });
  report.shutdown=JSON.parse(fs.readFileSync(path.join(output,'native-shutdown-test.json')));
  assert.equal(report.shutdown.passed,true,report.shutdown.error);
  for(let i=0;i<30 && child.exitCode===null;i++) await new Promise(r=>setTimeout(r,100));
  assert.equal(child.exitCode,0,'Backend did not exit after menu shutdown');
  assert.ok(fs.existsSync(path.join(dataDir,'runtime-state.json')),'Missing saved runtime state');
  const models=await (await fetch('http://127.0.0.1:11435/api/ps')).json();
  assert.equal(models.models.length,0,'Models remain loaded after shutdown');
  report.shutdown.modelsUnloaded=true; report.shutdown.snapshotSaved=true;
  token=null;
} catch(e) { report.passed=false;report.error=e.stack;process.exitCode=1; }
finally {
  if(token) await api('shutdown',{}).catch(()=>child.kill()); else child.kill();
  if(child.exitCode===null) await new Promise(resolve=>{const t=setTimeout(()=>{child.kill();resolve()},10000);child.once('exit',()=>{clearTimeout(t);resolve()})});
  report.serverErrors=errors;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,weather:report.weather,historySaved:report.historySaved,shutdown:report.shutdown}));
}
