import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';

test('SearXNG setup keeps separate env lines with zero, one or many existing settings', {skip:process.platform !== 'win32'}, () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-search-setup-'));
  try {
    fs.mkdirSync(path.join(dir,'daily-agent'));
    const script=path.join(dir,'Start-SearXNG.ps1');
    fs.copyFileSync(new URL('../../Start-SearXNG.ps1',import.meta.url),script);
    const envFile=path.join(dir,'daily-agent','.env.local');
    for(const existing of ['', 'KEEP=one\n', 'KEEP=one\nSECOND=two\n', 'DAILY_SEARXNG_URL=http://oldDAILY_SEARCH_PROVIDER=searxng\n']) {
      fs.writeFileSync(envFile,existing);
      for(let run=0;run<2;run++) {
        const result=spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-Command',
          `function Invoke-RestMethod { return @{results=@(@{title='Test'})} }; & '${script.replaceAll("'","''")}' -Endpoint 'http://localhost:8888'`],{encoding:'utf8'});
        assert.equal(result.status,0,result.stderr);
        const values=parseEnv(fs.readFileSync(envFile,'utf8'));
        assert.equal(values.DAILY_SEARXNG_URL,'http://localhost:8888');
        assert.equal(values.DAILY_SEARCH_PROVIDER,'searxng');
        if(existing.includes('KEEP='))assert.equal(values.KEEP,'one');
        if(existing.includes('SECOND='))assert.equal(values.SECOND,'two');
      }
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
