import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getRuntimeDirectory } from '../core/RuntimePaths.cjs';

test('Node and PowerShell use shared installed assets without junctions and reject a mismatched marker',()=>{
  const install=fs.mkdtempSync(path.join(os.tmpdir(),'daily-runtime-path-'));
  const root=path.join(install,'releases','test-version');
  const runtime=path.join(install,'runtime');
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(runtime);
  fs.writeFileSync(path.join(runtime,'model-sentinel'),'real shared asset');
  const marker=path.join(install,'.daily-install.json');
  fs.writeFileSync(marker,JSON.stringify({kind:'DailyAgentInstallation',root:install}));
  try {
    assert.equal(getRuntimeDirectory(root),runtime);
    assert.equal(fs.existsSync(path.join(root,'.daily-runtime')),false);
    if(process.platform==='win32'){
      const quote=s=>"'"+s.replaceAll("'","''")+"'";
      const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`. ${quote(path.resolve('../Daily-SetupState.ps1'))};$ErrorActionPreference='Stop';$r=Get-DailyRuntimePath ${quote(root)};Get-Content -LiteralPath (Join-Path $r 'model-sentinel')`],{windowsHide:true,encoding:'utf8'});
      assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'real shared asset');
    }
    fs.writeFileSync(marker,JSON.stringify({kind:'DailyAgentInstallation',root:path.dirname(install)}));
    assert.throws(()=>getRuntimeDirectory(root),/Invalid/);
  }finally{fs.rmSync(install,{recursive:true,force:true});}
});

test('packaged-host physical installation aliases work outside the logical path',()=>{
  const install=fs.mkdtempSync(path.join(os.tmpdir(),'daily-physical-path-'));
  const root=path.join(install,'releases','physical-test');
  fs.mkdirSync(root,{recursive:true});
  const marker=path.join(install,'.daily-install.json');
  try{
    fs.writeFileSync(marker,JSON.stringify({kind:'DailyAgentInstallation',root:path.join(install,'unavailable-logical-path'),physicalRoot:install}));
    assert.equal(getRuntimeDirectory(root),path.join(install,'runtime'));
    if(process.platform==='win32'){
      const quote=s=>"'"+s.replaceAll("'","''")+"'";
      const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`. ${quote(path.resolve('../Daily-SetupState.ps1'))};$ErrorActionPreference='Stop';Get-DailyRuntimePath ${quote(root)}`],{windowsHide:true,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),path.join(install,'runtime'));
    }
    fs.writeFileSync(marker,JSON.stringify({kind:'DailyAgentInstallation',root:path.dirname(install),physicalRoot:path.dirname(install)}));
    assert.throws(()=>getRuntimeDirectory(root),/Invalid/);
  }finally{fs.rmSync(install,{recursive:true,force:true});}
});
