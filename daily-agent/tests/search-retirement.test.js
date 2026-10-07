import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {create} from '../features/search/index.js';
import {BrowserAgent} from '../browser/BrowserAgent.js';

test('removed engine settings cannot create a local service or block the search module',async()=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('no network expected');};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-retired-search-'));
 const feature=create({config:{dataDir:dir,searchProvider:'searxng',searxngUrl:'http://127.0.0.1:8888',xngHubUrl:'http://127.0.0.1:8889'},memory:{},bus:{publish(){}}});
 try{
  assert.equal(feature.routes[0].handle().configured,false);
  await assert.rejects(feature.browser.search('今天新聞'),{code:'SEARCH_NOT_CONFIGURED'});
  await assert.rejects(feature.idleBrowser.search('idle'),{code:'SEARCH_NOT_CONFIGURED'});
  assert.equal(feature.browser.closed,true);assert.equal(requests,0);
 }finally{await feature.dispose();globalThis.fetch=original;fs.rmSync(dir,{recursive:true,force:true});}
});

test('standalone browser never falls back to an unconfigured search engine',async()=>{
 const browser=new BrowserAgent();browser.start=()=>{throw Error('browser must not launch');};
 try{await assert.rejects(browser.search('help'),{code:'SEARCH_NOT_CONFIGURED'});}
 finally{await browser.close();}
});

test('source and packaging contain no retired runtime or installers',()=>{
 const root=path.resolve('..');
 for(const file of ['Start-SearXNG.ps1','Setup-LocalSearch.ps1','daily-agent/xng-core','daily-agent/integrations/xng-plugin','daily-agent/browser/SharedCore.js','daily-agent/browser/XngHubClient.js'])assert.equal(fs.existsSync(path.join(root,file)),false,file);
 const packageScript=fs.readFileSync(path.join(root,'daily-agent/scripts/package.ps1'),'utf8');
 assert.doesNotMatch(packageScript,/xng-core|xng-plugin|Start-SearXNG|Setup-LocalSearch/);
 const manager=fs.readFileSync(path.join(root,'Open-DailyManager.ps1'),'utf8');
 assert.doesNotMatch(manager,/XNG|SearXNG/);
});

test('installer rejects an older package containing retired plugins before writing an installation',{skip:process.platform!=='win32'},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'daily-retired-install-'));
 try{
  const installer=path.join(temp,'Install-DailyAgent.ps1');
  fs.copyFileSync(new URL('../deploy/Install-DailyAgent.ps1',import.meta.url),installer);
  for(const file of ['daily-agent/xng-core/Core.js','daily-agent/integrations/xng-plugin/Start-XNG.ps1','Start-SearXNG.ps1','Setup-LocalSearch.ps1']){
   fs.writeFileSync(path.join(temp,'release-manifest.json'),JSON.stringify({version:'retired-test',dataFormat:1,files:[{path:file,sha256:'0'.repeat(64)}]}));
   const destination=path.join(temp,'installation');
   const run=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',installer,'-Destination',destination,'-NoShortcut'],{windowsHide:true,encoding:'utf8',timeout:10000});
   assert.notEqual(run.status,0);assert.equal(fs.existsSync(destination),false);
   assert.doesNotMatch(run.stderr,/Package checksum mismatch/);
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
