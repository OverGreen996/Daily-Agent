import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../deploy/Uninstall-DailyAgent.ps1',import.meta.url));
test('uninstall keeps only opted-in memory, removes models and never follows external junctions',{skip:process.platform!=='win32'},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'daily-uninstall-'));
 const run=(root,keep)=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-InstallRoot',root,'-NonInteractive',...(keep?['-KeepMemory']:[])],{encoding:'utf8',windowsHide:true,timeout:60000});
 try{
  const outside=path.join(temp,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'safe.txt'),'must survive');
  for(const keep of [true,false]){
   const root=path.join(temp,keep?'keep':'remove');fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.mkdirSync(path.join(root,'runtime'));
   fs.writeFileSync(path.join(root,'.daily-install.json'),JSON.stringify({kind:'DailyAgentInstallation',root}));
   fs.writeFileSync(path.join(root,'data/palace.sqlite'),'memory');fs.writeFileSync(path.join(root,'data/palace.sqlite-wal'),'wal');fs.writeFileSync(path.join(root,'data/pocketdrop.dpapi'),'credential');
   fs.writeFileSync(path.join(root,'runtime/model.bin'),'model');fs.symlinkSync(outside,path.join(root,'external'),'junction');
   const result=run(root,keep);assert.equal(result.status,0,result.stderr);
   assert.equal(fs.readFileSync(path.join(outside,'safe.txt'),'utf8'),'must survive');
   if(keep){assert.deepEqual(fs.readdirSync(root),['data']);assert.deepEqual(fs.readdirSync(path.join(root,'data')).sort(),['palace.sqlite','palace.sqlite-wal']);assert.equal(fs.readFileSync(path.join(root,'data/palace.sqlite'),'utf8'),'memory');}
   else assert.equal(fs.existsSync(root),false);
  }
  const refusal=run(outside,false);assert.notEqual(refusal.status,0);assert.equal(fs.readFileSync(path.join(outside,'safe.txt'),'utf8'),'must survive');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('uninstall recognizes a recorded physical installation and rejects a mismatched marker',{skip:process.platform!=='win32'},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'daily-uninstall-physical-'));
 const run=root=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-InstallRoot',root,'-NonInteractive'],{encoding:'utf8',windowsHide:true,timeout:60000});
 try{
  const physical=path.join(temp,'physical');fs.mkdirSync(physical);
  fs.writeFileSync(path.join(physical,'.daily-install.json'),JSON.stringify({kind:'DailyAgentInstallation',root:path.join(temp,'logical'),physicalRoot:physical}));
  fs.writeFileSync(path.join(physical,'owned.txt'),'remove');
  const accepted=run(physical);assert.equal(accepted.status,0,accepted.stderr);assert.equal(fs.existsSync(physical),false);
  const wrong=path.join(temp,'wrong');fs.mkdirSync(wrong);
  fs.writeFileSync(path.join(wrong,'.daily-install.json'),JSON.stringify({kind:'DailyAgentInstallation',root:path.join(temp,'logical'),physicalRoot:path.join(temp,'other')}));
  fs.writeFileSync(path.join(wrong,'safe.txt'),'keep');
  assert.notEqual(run(wrong).status,0);assert.equal(fs.readFileSync(path.join(wrong,'safe.txt'),'utf8'),'keep');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
