import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('..'), output=path.resolve('test-output/native-vision-'+Date.now());
fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:3213',dataDir=path.join(output,'data');
const server=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,DAILY_PORT:'3213',DAILY_DATA:dataDir},stdio:'pipe'});
let token,report={},errors='';server.stdout.resume();server.stderr.on('data',data=>errors+=data.toString());
async function api(route,data){
  const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;
}
try{
  for(let i=0;i<60;i++){try{const r=await fetch(base);if(r.ok){token=(await r.text()).match(/name="daily-token" content="([a-f0-9]+)"/)[1];break}}catch{}await new Promise(r=>setTimeout(r,250))}
  assert.ok(token,'Server startup failed');
  await api('settings',{perception:false,lightLookup:false,weatherEnabled:false});
  await api('idle',{});
  const exe=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'daily-agent/desktop/Build-Pet.ps1')],{windowsHide:true,encoding:'utf8'}).trim().split(/\r?\n/).at(-1);
  await new Promise((resolve,reject)=>{
    const pet=spawn(exe,[root,base,'--vision-test',output,path.resolve('test-output/vision-427.png')],{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{pet.kill();reject(Error('Native vision timed out'))},300000);
    pet.once('error',reject);pet.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native exit '+code))});
  });
  report=JSON.parse(fs.readFileSync(path.join(output,'native-vision-test.json')));assert.equal(report.passed,true,report.error);
  const history=await api('history');
  report.savedImage=history.some(m=>m.role==='user' && JSON.parse(m.extra||'{}').has_image);
  assert.equal(report.savedImage,true);
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1}
finally{
  if(token)await api('shutdown',{}).catch(()=>server.kill());else server.kill();
  if(server.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{server.kill();resolve()},10000);server.once('exit',()=>{clearTimeout(timer);resolve()})});
  report.modelsAfter=(await(await fetch('http://127.0.0.1:11435/api/ps')).json()).models;
  if(report.modelsAfter.length){report.passed=false;process.exitCode=1}
  report.serverErrors=errors;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,...report}));
}
