import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Check our own deployable files, never third-party dependencies or private data.
const excluded=new Set(['node_modules','.git','.agents','.codex-remote-attachments','.daily-runtime','data','runtime','vendor','dist','build','test-output','_backups','exports','output']);
const history=new Set(['CHANGELOG.md','VALIDATION-HISTORY.md','CHANGES-v0.2.1.md','COMPLETION-v0.2.1.md','AUDIT-2026-09-28.md','docs/驗證歷史-0.2.1.md','docs/驗證歷史-0.2.2-20261003.md','docs/舊版技術參考.md','android/VALIDATION.md']);
const guards=new Set(['deploy/Install-DailyAgent.ps1','deploy/Update-DailyAgent.ps1','deploy/Launch-DailyAgent.ps1','Install-DailyAgent.ps1','Update-DailyAgent.ps1','Launch-DailyAgent.ps1','scripts/audit-search-retirement.mjs']);
const retired=/(?:xng|searxng|SEARCH_SHARED_DATA_DIR|GeminiHub|(?:localhost|127\.0\.0\.1):888[89]\b)/i;
const obsoleteGuide=/Docker 網路搜尋|搜尋可能需要管理員授權|Docker 條款|三家 API 輪換尚未完成|DAILY_SEARCH_PROVIDER\s*=\s*searxng/i;
const retiredPath=/(?:^|\/)(?:xng-core|xng-plugin|Start-SearXNG\.ps1|Setup-LocalSearch\.ps1|searxng-compose\.yml|XngHubClient\.js|SharedCore\.js|QueryUnderstanding\.js)(?:\/|$)/i;

export function auditSearchRetirement(root){
  root=path.resolve(root);const result={root,scanned:0,violations:[],historical:[],guards:[],privateConfigs:[]};
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink())continue;
    const file=path.join(dir,entry.name),relative=path.relative(root,file).replaceAll('\\','/');
    if(retiredPath.test(relative)){result.violations.push({file:relative,reason:'retired-path'});continue;}
    if(entry.isDirectory()){if(!excluded.has(entry.name))walk(file);continue;}
    if(!entry.isFile())continue;
    if(relative==='sample.js')continue; // Framecraft's encoded sample image, not Daily code.
    const appRelative=relative.replace(/^(?:app\/)?daily-agent\//,'');
    if(entry.name==='.env.local'){
      // Report key names only; never include configuration values or secrets.
      const keys=fs.readFileSync(file,'utf8').split(/\r?\n/).map(line=>line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/)?.[1]).filter(Boolean);
      const stale=keys.filter(key=>/^(?:DAILY_(?:SEARXNG|XNG)_.*|SEARCH_SHARED_DATA_DIR)$/.test(key));
      if(stale.length)result.violations.push({file:relative,reason:'retired-env-keys',keys:stale});
      result.privateConfigs.push({file:relative,checked:true});continue;
    }
    if(!/\.(?:[cm]?js|ps1|cmd|cs|java|json|ya?ml|toml|md|txt|html|css|svg|example)$/.test(entry.name)&&!['.gitattributes','.gitignore'].includes(entry.name))continue;
    // Binary/media artifacts have separate inventory; don't match random encoded pixels.
    if(fs.statSync(file).size>2*1024*1024)continue;
    const content=fs.readFileSync(file,'utf8');result.scanned++;
    if(!retired.test(content)&&!obsoleteGuide.test(content))continue;
    if(/^tests\//.test(appRelative)){result.guards.push({file:relative,kind:'regression-test'});continue;}
    if(guards.has(appRelative)){result.guards.push({file:relative,kind:'retirement-guard'});continue;}
    if(history.has(appRelative)){result.historical.push({file:relative});continue;}
    // This describes the migration away from another app, not an active connection.
    if(appRelative==='deploy/搜尋API與輪替教學.md'&&!obsoleteGuide.test(content)&&!/(?:xng|searxng|(?:localhost|127\.0\.0\.1):888[89]\b)/i.test(content)){result.guards.push({file:relative,kind:'isolation-documentation'});continue;}
    result.violations.push({file:relative,reason:'retired-reference'});
  }};walk(root);return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=auditSearchRetirement(process.argv[2]||path.resolve(fileURLToPath(new URL('../..',import.meta.url))));
  console.log(JSON.stringify(result,null,2));if(result.violations.length)process.exitCode=1;
}
