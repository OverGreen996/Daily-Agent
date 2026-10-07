import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createAgent} from '../core/createAgent.js';
import {resolveRuntimeConfig, readOptionalSettings} from '../core/RuntimeConfig.js';
import {moduleCatalog} from '../modules/catalog.js';
import {ModuleHost} from '../modules/ModuleHost.js';
import {bindAgentModules, moduleServices} from '../modules/Bindings.js';
import {fallbackBrowser, fallbackEnvironment} from '../modules/Fallbacks.js';
import {withUnderstanding} from './helpers/Understanding.js';
import {AgentCore} from '../core/AgentCore.js';

const disabled = Object.fromEntries(moduleCatalog.map(m => [m.id, false]));
function directory(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-independent-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  return dir;
}
test('programmatic data override derives a fresh search store without inheriting the default store',()=>{
  const defaults={dataDir:'original-data',searchDataDir:'original-data/search'};
  const first=resolveRuntimeConfig(defaults,{dataDir:'another-data'});
  assert.equal(first.searchDataDir,path.resolve('another-data/search'));
  assert.equal(defaults.searchDataDir,'original-data/search');
  const explicit=resolveRuntimeConfig(defaults,{dataDir:'another-data',searchDataDir:'daily-custom'});
  assert.equal(explicit.searchDataDir,path.resolve('daily-custom'));
});
test('corrupt optional settings preserve originals and warn without exposing their contents',t=>{
  const dir=directory(t),file=path.join(dir,'modules.json'),warnings=[];
  const original='{"private":"do-not-log", broken';fs.writeFileSync(file,original);
  assert.deepEqual(readOptionalSettings(file,{publish:(type,data)=>warnings.push(data)}),{});
  assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(warnings.length,1);
  assert.doesNotMatch(JSON.stringify(warnings),/do-not-log/);
  fs.writeFileSync(file,'\uFEFF{"enabled":{"images":false}}');
  assert.equal(readOptionalSettings(file,{publish(){}}).enabled.images,false);
});
test('invalid plugin registrations cannot block basic chat or disturb existing memory',async t=>{
  const dir=directory(t);
  fs.writeFileSync(path.join(dir,'modules.json'),JSON.stringify({enabled:disabled,plugins:[
    {id:'search',entry:'wrong.js',enabled:true},{id:'INVALID',entry:'wrong.js',enabled:true},{id:'valid',entry:'missing.js',enabled:true}]}));
  fs.writeFileSync(path.join(dir,'environment-settings.json'),'broken');
  const agent=await createAgent({dataDir:dir,modelUrl:'http://127.0.0.1:1'});
  try {
    agent.wake=async()=>{};agent.full.chat=withUnderstanding(async()=>({message:{content:'你好，聊天正常。'}}));
    agent.memory.pins.save('獨立安裝要保留的記憶');
    assert.equal((await agent.chat('你好')).content,'你好，聊天正常。');
    assert.equal(agent.modules.records.get('valid').state,'failed');
    assert.equal(agent.config.searchDataDir,path.join(dir,'search'));
    const stop=await agent.stop();assert.equal(stop.stopped,true);assert.ok(stop.warnings.some(w=>w.step==='unload-FULL_LLM'));
    assert.strictEqual(agent.stop(),agent.stopTask);
  } finally {await agent.stop();}
  const reopened=await createAgent({dataDir:dir,modelUrl:'http://127.0.0.1:1'});
  try {assert.ok(reopened.memory.pins.all().some(p=>p.text==='獨立安裝要保留的記憶'));}
  finally {await reopened.stop();}
});
test('no optional modules or third-party packages are needed to open, save memory and stop offline',t=>{
  const dir=directory(t),hook=path.join(dir,'no-packages.mjs');
  fs.writeFileSync(hook,`import {registerHooks} from 'node:module';registerHooks({resolve(specifier,context,next){
    if(!['node:','file:','.','/'].some(prefix=>specifier.startsWith(prefix)))throw Object.assign(Error('optional dependency unavailable'),{code:'ERR_MODULE_NOT_FOUND'});
    return next(specifier,context);
  }});`);
  const code=`import assert from 'node:assert/strict';import {createAgent} from './core/createAgent.js';
    const a=await createAgent({dataDir:${JSON.stringify(path.join(dir,'data'))},modules:${JSON.stringify(disabled)},modelUrl:'http://127.0.0.1:1'});
    assert.equal(a.config.tokenizer.fallback,true);assert.equal(a.modules.order.length,0);
    a.start();const status=await a.status();assert.ok(status.modelError);assert.equal(status.search.configured,false);
    a.memory.working.add('user','離線儲存正常');const stopped=await a.stop();assert.equal(stopped.stopped,true);assert.ok(stopped.warnings.length);
    console.log('offline-core-pass');`;
  const run=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,'--input-type=module','-e',code],{cwd:path.resolve('.'),encoding:'utf8',windowsHide:true,timeout:12000});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/offline-core-pass/);
  assert.ok(fs.existsSync(path.join(dir,'data','palace.sqlite')));
});
test('failed optional attach removes its runtime and rebinds core and companion to safe interfaces',async t=>{
  const dir=directory(t),disposed=[],warnings=[];
  const host=new ModuleHost({config:{},bus:{publish:(type,data)=>warnings.push(data)},settingsFile:path.join(dir,'modules.json')});
  const fallbacks={environment:fallbackEnvironment(),browser:fallbackBrowser()};
  const failedBrowser={close(){throw Error('disposed search used');}},env={...fallbacks.environment,perception:{start(){throw Error('disposed environment used');},close(){},snapshot(){return{};}}};
  const companion={...moduleServices(host,fallbacks).companion,lookup:{}};
  await host.load([
    {id:'search',create:()=>({browser:failedBrowser,models:{SEARCH_MODEL:{}},attach(){throw Error('search attach');},dispose(){disposed.push('search');}})},
    {id:'environment',create:()=>({...env,models:{VISION_MODEL:{}},attach(){throw Error('env attach');},dispose(){disposed.push('environment');}})},
    {id:'companion',create:()=>({companion})},
    {id:'dependent',requires:['search'],create:()=>({dispose(){disposed.push('dependent');}})},
  ],{});
  const agent={config:{perception:true,lightLookup:true},memory:{},broker:{},...moduleServices(host,fallbacks)};
  await host.attach(agent);bindAgentModules(agent,host,fallbacks);
  assert.equal(agent.browser,fallbacks.browser);assert.equal(agent.perception,fallbacks.environment.perception);
  assert.equal(agent.companion.lookup.browser,fallbacks.browser);assert.equal(agent.config.perception,false);
  assert.deepEqual(host.modelDefinitions(),{});assert.equal(host.enabled('dependent'),false);
  await host.dispose();assert.deepEqual(disposed.sort(),['dependent','environment','search']);
});

test('shutdown is shared, drains work before disposal and closes memory despite optional failures',async()=>{
  const calls=[];
  const agent=new AgentCore({config:{},bus:{publish(){}},full:{cancel(){}},idleRuntime:{cancel(){}},
    companion:{async cancel(){calls.push('cancel');}},browser:{async close(){}},perception:{close(){}},
    memory:{checkpoint(){calls.push('checkpoint');},close(){calls.push('close');}},
    lifecycle:{models:{FULL_LLM:{},EXTRA_MODEL:{}},async save_runtime_state(){calls.push('save');},
      async unload_model(role){calls.push(role);if(role==='FULL_LLM')throw Error('backend offline');}}});
  agent.modules={async dispose(){calls.push('dispose');throw Error('optional cleanup failed');}};
  agent.queue=Promise.resolve().then(()=>calls.push('drained'));
  const first=agent.stop();assert.strictEqual(agent.stop(),first);
  const result=await first;
  assert.equal(result.warnings.length,2);assert.ok(calls.indexOf('drained')<calls.indexOf('dispose'));
  assert.deepEqual(calls.slice(-3),['EXTRA_MODEL','checkpoint','close']);
  await assert.rejects(agent.exclusive(async()=>{}),/正在關閉/);
});

test('shutdown requested during a search prevents starting another answering inference',async t=>{
  const dir=directory(t),agent=await createAgent({dataDir:dir,modelUrl:'http://127.0.0.1:1',modules:disabled});
  let answers=0;
  try {
    // Test only conversation control flow; no provider, model or resource is started.
    agent.modules=null;agent.wake=async()=>{};
    agent.full.chat=withUnderstanding(async()=>{answers++;return {message:{content:'must not answer'}};},{needsSearch:true});
    agent.broker.execute=async()=>{agent.stopping=true;return {results:[{title:'測試',url:'https://example.org/',body:'摘要'}]};};
    await assert.rejects(agent.chat('幫我查資料'),{name:'AbortError'});assert.equal(answers,0);
    assert.ok(!agent.memory.working.list().some(m=>m.role==='assistant'));
  } finally {await agent.stop();}
});
