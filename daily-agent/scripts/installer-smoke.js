import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const stage=path.resolve(process.argv[2]||'dist/0.2.1-candidate'),destination=path.resolve('test-output/install-cycle-'+Date.now()),manifestPath=path.join(stage,'release-manifest.json');
const original=fs.readFileSync(manifestPath,'utf8'),manifest=JSON.parse(original.replace(/^\uFEFF/,''));
const run=(script,args=[])=>execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args],{windowsHide:true,encoding:'utf8'});
const install=()=>run(path.join(stage,'Install-DailyAgent.ps1'),['-Destination',destination,'-NoShortcut']);
try{
  install();const dataFile=path.join(destination,'data','preserved.txt');fs.writeFileSync(dataFile,'user memory MUST remain');const before=createHash('sha256').update(fs.readFileSync(dataFile)).digest('hex');
  const first=manifest.version;install();assert.equal(createHash('sha256').update(fs.readFileSync(dataFile)).digest('hex'),before);
  fs.writeFileSync(path.join(destination,'releases',first,'daily-agent','.env.local'),'DAILY_SEARCH_PROVIDER=disabled\n');manifest.version+='-update-test';fs.writeFileSync(manifestPath,JSON.stringify(manifest));install();assert.equal(JSON.parse(fs.readFileSync(path.join(destination,'current.json'),'utf8').replace(/^\uFEFF/,'' )).previous,first);
  assert.equal(fs.readFileSync(path.join(destination,'releases',manifest.version,'daily-agent','.env.local'),'utf8'),'DAILY_SEARCH_PROVIDER=disabled\n');
  const release=run(path.join(destination,'Launch-DailyAgent.ps1'),['-Rollback','-NoLaunch']).trim();assert.ok(release.endsWith(first));assert.equal(createHash('sha256').update(fs.readFileSync(dataFile)).digest('hex'),before);
  const bad=manifest.files[0];const saved=bad.sha256;bad.sha256='0'.repeat(64);manifest.version+='-bad';fs.writeFileSync(manifestPath,JSON.stringify(manifest));assert.throws(install);bad.sha256=saved;
  const report={passed:true,destination,install:true,reinstallContinues:true,update:true,rollback:true,dataPreserved:true,tamperedPackageRejected:true};fs.writeFileSync(path.join(destination,'report.json'),JSON.stringify(report,null,2));console.log(report);
}finally{fs.writeFileSync(manifestPath,original);}
