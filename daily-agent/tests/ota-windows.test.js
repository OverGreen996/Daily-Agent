import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('Windows OTA reads UTF-8 JSON bytes regardless of binary response type and BOM', {skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-ota-feed-'));
  try{
    fs.copyFileSync(new URL('../deploy/Update-DailyAgent.ps1',import.meta.url),path.join(dir,'Update.ps1'));
    fs.writeFileSync(path.join(dir,'current.json'),JSON.stringify({current:'test.1'}));
    fs.writeFileSync(path.join(dir,'run.ps1'),`function Invoke-WebRequest { [pscustomobject]@{RawContentStream=[IO.MemoryStream]::new([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'feed.json')))} }; & (Join-Path $PSScriptRoot 'Update.ps1')`);
    for(const bom of ['', '\uFEFF']) {
      fs.writeFileSync(path.join(dir,'feed.json'),bom+JSON.stringify({schema:1,note:'中文',windows:{version:'test.1',sha256:'a'.repeat(64),size:20,url:'https://github.com/test/package.zip'}}));
      const r=spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'run.ps1')],{encoding:'utf8'});
      assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Already up to date/);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
