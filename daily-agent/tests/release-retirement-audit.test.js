import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {auditSearchRetirement} from '../scripts/audit-search-retirement.mjs';

test('release audit catches reintroduced runtime, hidden config and installation instructions without exposing keys',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-release-audit-'));
  try{
    fs.mkdirSync(path.join(dir,'daily-agent','deploy'),{recursive:true});
    fs.writeFileSync(path.join(dir,'daily-agent','.env.local'),'DAILY_XNG_HUB_URL=http://old-host:8889\nEXA_API_KEY=SECRET-NEVER-REPORT\n');
    fs.writeFileSync(path.join(dir,'daily-agent','deploy','使用教學.md'),'可補裝 Docker 網路搜尋');
    fs.writeFileSync(path.join(dir,'Start-SearXNG.ps1'),'throw "retired"');
    let report=auditSearchRetirement(dir);assert.equal(report.violations.length,3);assert.doesNotMatch(JSON.stringify(report),/SECRET-NEVER-REPORT|old-host/);
    fs.unlinkSync(path.join(dir,'Start-SearXNG.ps1'));
    fs.writeFileSync(path.join(dir,'daily-agent','.env.local'),'EXA_API_KEY=SECRET-NEVER-REPORT\n');
    fs.writeFileSync(path.join(dir,'daily-agent','deploy','使用教學.md'),'設定自己的搜尋 API');
    report=auditSearchRetirement(dir);assert.equal(report.violations.length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('current Daily source has no retired runtime or current installation guides',()=>{
  const report=auditSearchRetirement(path.resolve('..'));
  assert.deepEqual(report.violations,[],JSON.stringify(report.violations));
});

test('upgrading settings removes retired service keys while preserving unrelated credentials',{skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-env-migrate-'));
  try{
    const source=fs.readFileSync(new URL('../deploy/Install-DailyAgent.ps1',import.meta.url),'utf8');
    const helper=source.slice(source.indexOf('function Copy-DailyLocalSettings'),source.indexOf('$manifestPath='));
    fs.writeFileSync(path.join(dir,'before.env'),'DAILY_XNG_HUB_URL=http://old:8889\nDAILY_SEARXNG_URL=http://old:8888\nSEARCH_SHARED_DATA_DIR=old-share\nDAILY_SEARCH_PROVIDER="searxng"\nEXA_API_KEY=fixture-private\nDAILY_PORT=3210\n');
    fs.writeFileSync(path.join(dir,'migrate.ps1'),helper+"\nCopy-DailyLocalSettings (Join-Path $PSScriptRoot 'before.env') (Join-Path $PSScriptRoot 'after.env')");
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'migrate.ps1')],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(result.status,0,result.stderr);
    assert.equal(fs.readFileSync(path.join(dir,'after.env'),'utf8').replaceAll('\r',''),'EXA_API_KEY=fixture-private\nDAILY_PORT=3210\n');
    const unchanged='EXA_API_KEY=fixture-private\nDAILY_SEARCH_PROVIDER=disabled\n';
    fs.writeFileSync(path.join(dir,'before.env'),unchanged);
    const again=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'migrate.ps1')],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(again.status,0,again.stderr);assert.equal(fs.readFileSync(path.join(dir,'after.env'),'utf8'),unchanged);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('rollback rejects a retired integration before changing the active release',{skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-rollback-retired-'));
  try{
    fs.copyFileSync(new URL('../deploy/Launch-DailyAgent.ps1',import.meta.url),path.join(dir,'Launch-DailyAgent.ps1'));
    for(const version of ['current','old']){
      fs.mkdirSync(path.join(dir,'releases',version),{recursive:true});
      fs.writeFileSync(path.join(dir,'releases',version,'Open-DailyPet.ps1'),'throw "must not launch"');
    }
    const pointer=path.join(dir,'current.json');fs.writeFileSync(pointer,JSON.stringify({current:'current',previous:'old',dataFormat:1}));const before=fs.readFileSync(pointer,'utf8');
    fs.writeFileSync(path.join(dir,'releases','old','Start-SearXNG.ps1'),'throw "retired"');
    const run=()=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'Launch-DailyAgent.ps1'),'-Rollback','-NoLaunch'],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.notEqual(run().status,0);assert.equal(fs.readFileSync(pointer,'utf8'),before);
    fs.unlinkSync(path.join(dir,'releases','old','Start-SearXNG.ps1'));
    assert.equal(run().status,0);assert.equal(JSON.parse(fs.readFileSync(pointer,'utf8').replace(/^\uFEFF/,'')).current,'old');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
