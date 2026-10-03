import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const helper=path.resolve('../Daily-SetupState.ps1');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function ps(code){return new Promise((resolve,reject)=>{
 const p=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true});
 let output='',errors='';p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>errors+=d);
 const timer=setTimeout(()=>{p.kill();reject(Error('PowerShell test timed out'));},30000);
 p.on('error',reject);p.on('exit',status=>{clearTimeout(timer);resolve({status,output:status?output+errors:output});});
});}
test('real downloader resumes, repairs corruption, reuses complete files and recovers rejected Range', {skip:process.platform!=='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'daily-recovery-')),body=Buffer.alloc(256*1024,37),hash=createHash('sha256').update(body).digest('hex');
 const requests=[];
 const server=http.createServer((req,res)=>{
  requests.push({url:req.url,range:req.headers.range});
  if(req.url==='/reject'&&req.headers.range){res.writeHead(416);res.end();return;}
  const offset=req.headers.range?Number(req.headers.range.match(/bytes=(\d+)-/)[1]):0;
  res.writeHead(offset?206:200,{'Content-Length':body.length-offset,...(offset?{'Content-Range':`bytes ${offset}-${body.length-1}/${body.length}`}:{})});res.end(body.subarray(offset));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const runtime=path.join(root,'.daily-runtime');fs.mkdirSync(runtime);
  for(const scenario of ['resume','complete','corrupt','reject']){
   const file=path.join(runtime,scenario+'.bin'),partial=file+'.part';
   fs.writeFileSync(partial,scenario==='complete'?body:scenario==='corrupt'?Buffer.alloc(body.length,19):body.subarray(0,8192));
   const before=requests.length,url=`http://127.0.0.1:${server.address().port}/${scenario}`;
   const result=await ps(`$ErrorActionPreference='Stop'; . ${quote(helper)}; Receive-DailyAsset ${quote(root)} ${quote(url)} ${quote(file)} ${quote(hash)} 'fixture' ${body.length}`);
   assert.equal(result.status,0,scenario+': '+result.output);assert.deepEqual(fs.readFileSync(file),body);assert.equal(fs.existsSync(partial),false);
   const calls=requests.slice(before);
   if(scenario==='complete')assert.equal(calls.length,0);
   if(scenario==='resume')assert.equal(calls[0].range,'bytes=8192-');
   if(scenario==='corrupt')assert.equal(calls[0].range,undefined);
   if(scenario==='reject'){assert.equal(calls[0].range,'bytes=8192-');assert.equal(calls.at(-1).range,undefined);}
   const reuse=await ps(`$ErrorActionPreference='Stop'; . ${quote(helper)}; Receive-DailyAsset ${quote(root)} ${quote(url)} ${quote(file)} ${quote(hash)} 'fixture' ${body.length}`);
   assert.equal(reuse.status,0,reuse.output);assert.equal(requests.length,before+calls.length);
  }
  const outsideDir=path.join(root,'outside');fs.mkdirSync(outsideDir);const outside=path.join(outsideDir,'sentinel.bin');fs.writeFileSync(outside,'untouched');
  const linkedDir=path.join(runtime,'linked');fs.symlinkSync(outsideDir,linkedDir,'junction');const linked=path.join(linkedDir,'sentinel.bin');
  const blocked=await ps(`$ErrorActionPreference='Stop'; . ${quote(helper)}; Receive-DailyAsset ${quote(root)} 'http://127.0.0.1:${server.address().port}/linked' ${quote(linked)} ${quote(hash)} 'fixture' ${body.length}`);
  assert.notEqual(blocked.status,0);assert.equal(fs.readFileSync(outside,'utf8'),'untouched');assert.equal(requests.some(r=>r.url==='/linked'),false);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
});
test('space estimate excludes installed resources and counts the shared image environment once',{skip:process.platform!=='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'daily-space-'));
 try{
  const r=await ps(`$ErrorActionPreference='Stop'; . ${quote(helper)}; $installed=@{core=$true;anime=$false;photo=$false;imageEngine=$false}; $a=Get-DailyInstallPlan ${quote(root)} @('core','anime','photo') $installed; $installed.imageEngine=$true; $b=Get-DailyInstallPlan ${quote(root)} @('core','anime','photo') $installed; @{fresh=$a.requiredGB;existingEngine=$b.requiredGB} | ConvertTo-Json -Compress`);
  assert.equal(r.status,0,r.output);assert.deepEqual(JSON.parse(r.output),{fresh:25,existingEngine:15});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('installation rejects unrelated folders and ancestor junctions but accepts retained memory',{skip:process.platform!=='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'daily-location-'));
 try{
  const source=fs.readFileSync(new URL('../deploy/Install-DailyAgent.ps1',import.meta.url),'utf8');
  // Execute the real preflight without copying a release or creating shortcuts.
  const guard=source.slice(source.indexOf('$destinationRoot='),source.indexOf('$release=Join-Path'));
  const unrelated=path.join(root,'unrelated');fs.mkdirSync(unrelated);fs.writeFileSync(path.join(unrelated,'keep.txt'),'untouched');
  const memory=path.join(root,'memory');fs.mkdirSync(path.join(memory,'data'),{recursive:true});fs.writeFileSync(path.join(memory,'data/palace.sqlite'),'memory');
  const linked=path.join(root,'link');fs.symlinkSync(unrelated,linked,'junction');
  for(const [destination,allowed] of [[unrelated,false],[memory,true],[path.join(linked,'deep/new'),false]]){
   const r=await ps(`$ErrorActionPreference='Stop'; $Destination=${quote(destination)}; ${guard}`);assert.equal(r.status===0,allowed,r.output);
  }
  assert.equal(fs.readFileSync(path.join(unrelated,'keep.txt'),'utf8'),'untouched');assert.equal(fs.readFileSync(path.join(memory,'data/palace.sqlite'),'utf8'),'memory');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
