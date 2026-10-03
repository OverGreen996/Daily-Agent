// Installation orchestrator only. Search and update logic remain in the shared core/manager.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]);
const manager=await import(pathToFileURL(path.join(root,'plugins/PluginManager.mjs')));
const rules=await import(pathToFileURL(path.join(root,'plugins/RulesManager.mjs')));
manager.configureSource(root,'https://xng-plugins.kentyang1993.workers.dev/xng-update.json');
let choice=manager.selected(root);
if(!choice.version){
  const candidate=await manager.checkUpdate(root);
  await manager.downloadUpdate(root,candidate.version);
  // A fresh installation has no source checkout to roll back to.
  const pointerFile=path.join(root,'.plugins/current.json');
  const pointer=JSON.parse(fs.readFileSync(pointerFile,'utf8'));
  if(pointer.previous==='source'&&!fs.existsSync(path.join(root,'core/Core.js'))){
    pointer.previous=null;
    fs.writeFileSync(pointerFile+'.setup',JSON.stringify(pointer));
    fs.renameSync(pointerFile+'.setup',pointerFile);
  }
  choice=manager.selected(root);
}
// Re-running setup never silently updates an existing installation.
if(!rules.selectedRules(root).version){
  const candidate=await rules.checkRules(root);
  await rules.updateRules(root,candidate.version,candidate.sha256);
}
console.log(JSON.stringify({version:choice.version,rules:rules.selectedRules(root).version,core:choice.coreDirectory,policy:'manual'}));
