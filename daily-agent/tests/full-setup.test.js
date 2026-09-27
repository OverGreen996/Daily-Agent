import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const files=['Setup-DailyAgent.ps1','Setup-SpeechRecognition.ps1','Setup-Browser.ps1','Setup-ImageGeneration.ps1','Setup-MobileBridge.ps1','Setup-LocalSearch.ps1'];
test('full setup stays read-only in check mode and recovers a failed stage without deleting assets', {skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-full-setup-'));
  const script=path.join(dir,'Setup-All-DailyAgent.ps1');
  const run=(...args)=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args],{encoding:'utf8',timeout:60000,windowsHide:true});
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
