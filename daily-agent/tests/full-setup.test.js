import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const files=['Setup-DailyAgent.ps1','Setup-Kokoro.ps1','Setup-SpeechRecognition.ps1','Setup-Browser.ps1','Setup-ImageGeneration.ps1','Setup-MobileBridge.ps1','Setup-LocalSearch.ps1'];
test('full setup stays read-only in check mode and recovers a failed stage without deleting assets', {skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-full-setup-'));
  const script=path.join(dir,'Setup-All-DailyAgent.ps1');
  const run=(...args)=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Features','all',...args],{encoding:'utf8',timeout:60000,windowsHide:true});
  try{
    fs.copyFileSync(new URL('../../Setup-All-DailyAgent.ps1',import.meta.url),script);
    for(const file of files)fs.writeFileSync(path.join(dir,file),`Add-Content (Join-Path $PSScriptRoot 'calls.txt') '${file}'\nexit 0`);
    assert.equal(run('-CheckOnly').status,0);
    assert.equal(fs.existsSync(path.join(dir,'.daily-runtime')),false);
    assert.equal(fs.existsSync(path.join(dir,'calls.txt')),false);
    fs.writeFileSync(path.join(dir,files[1]),'throw "Simulated network interruption"');
    const failed=run('-NoLaunch');assert.notEqual(failed.status,0);
    const stateFile=path.join(dir,'.daily-runtime/full-setup.json');
    const read=()=>JSON.parse(fs.readFileSync(stateFile,'utf8').replace(/^\uFEFF/,''));
    assert.equal(read().status,'incomplete');
    assert.equal(read().steps[1].status,'failed');
    assert.equal(read().steps.at(-1).status,'complete','later independent stages must still run');
    fs.writeFileSync(path.join(dir,'.daily-runtime/model-sentinel'),'existing model');
    fs.writeFileSync(path.join(dir,files[1]),'exit 0');
    const success=run('-NoLaunch');assert.equal(success.status,0,success.stderr);
    assert.equal(read().status,'complete');
    assert.equal(fs.readFileSync(path.join(dir,'.daily-runtime/model-sentinel'),'utf8'),'existing model');
    // Completed journal does not cause a removed dependency to be silently skipped.
    fs.unlinkSync(path.join(dir,files[2]));assert.notEqual(run('-NoLaunch').status,0);
    assert.equal(read().status,'incomplete');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('selective setup runs only chosen downloads and retains selections for retries',{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-selected-'));
 const script=path.join(dir,'Setup-All-DailyAgent.ps1');
 const run=(...args)=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-NoLaunch',...args],{encoding:'utf8',timeout:60000,windowsHide:true});
 try{
  fs.copyFileSync(new URL('../../Setup-All-DailyAgent.ps1',import.meta.url),script);
  for(const file of files)fs.writeFileSync(path.join(dir,file),`Add-Content (Join-Path $PSScriptRoot 'calls.txt') ('${file} '+($args -join ' '))\nexit 0`);
  assert.equal(run().status,0);
  let calls=fs.readFileSync(path.join(dir,'calls.txt'),'utf8');assert.match(calls,/Setup-DailyAgent.ps1 -SkipVoice/);assert.equal(calls.trim().split('\n').length,1);
  fs.unlinkSync(path.join(dir,'calls.txt'));
  assert.equal(run('-Features','photo,tts').status,0);
  calls=fs.readFileSync(path.join(dir,'calls.txt'),'utf8');assert.match(calls,/Setup-ImageGeneration.ps1 -Profiles photo/);assert.match(calls,/Setup-Kokoro/);assert.doesNotMatch(calls,/Setup-LocalSearch|Setup-Browser|Setup-MobileBridge|Setup-SpeechRecognition/);
  const selection=JSON.parse(fs.readFileSync(path.join(dir,'.daily-runtime/setup-selection.json'),'utf8').replace(/^\uFEFF/,''));assert.deepEqual(selection.features,['core','photo','tts']);
  fs.unlinkSync(path.join(dir,'calls.txt'));assert.notEqual(run('-Features','invalid').status,0);assert.equal(fs.existsSync(path.join(dir,'calls.txt')),false);
  assert.equal(run('-Features','anime,photo').status,0);calls=fs.readFileSync(path.join(dir,'calls.txt'),'utf8');assert.match(calls,/-Profiles anime,photo/);assert.equal(calls.match(/Setup-ImageGeneration/g).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
