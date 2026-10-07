import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {SearchRouter} from '../search/SearchRouter.js';

test('Daily search follows Daily data and ignores the retired shared environment variable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-config-isolation-'));
  try{
    const env={...process.env,DAILY_DATA:dir,SEARCH_SHARED_DATA_DIR:path.join(dir,'old-island-share'),DAILY_SEARCH_DATA_DIR:''};
    const read=()=>spawnSync(process.execPath,['--input-type=module','-e',"import {config} from './config.js';process.stdout.write(JSON.stringify({data:config.dataDir,search:config.searchDataDir}));"],{env,cwd:path.resolve('.'),encoding:'utf8',windowsHide:true});
    let result=read();assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{data:dir,search:path.join(dir,'search')});
    env.DAILY_SEARCH_DATA_DIR=path.join(dir,'daily-only');result=read();assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).search,env.DAILY_SEARCH_DATA_DIR);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('two application stores keep keys, budgets, cache, cooldown and locks separate',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'application-search-isolation-'));
  let a,b;const calls=[0,0],keys=[{exa:'fake-island-only'},{exa:'fake-daily-only'}];
  const create=(name,index)=>new SearchRouter({
    dir:path.join(dir,name),credentials:{load:()=>keys[index],save:value=>{keys[index]=value;}},
    providers:{exa:{search:async()=>{calls[index]++;return {provider_id:'exa',results:[{title:name,url:'https://example.org/'+name,body:'isolated evidence',coverage:'excerpt'}]};}}}
  });
  try{
    a=create('island',0);b=create('daily',1);
    await a.search('same question');await a.search('same question');await b.search('same question');assert.deepEqual(calls,[1,1]);
    const aUsed=a.store.get('exa').used;
    a.fail('exa',Object.assign(new Error('only island is unavailable'),{code:'unavailable'}));
    assert.equal(b.store.get('exa').reason,null);
    const settings=b.store.settings();settings.order=['firecrawl','tavily','exa'];b.configure({settings,keys:{exa:'fake-daily-new-key'}});
    assert.equal(a.keys().exa,'fake-island-only');assert.equal(b.keys().exa,'fake-daily-new-key');assert.equal(a.store.get('exa').used,aUsed);assert.deepEqual(a.store.settings().order,['exa','tavily','firecrawl']);
    const lease=a.store.lock('engine');assert.ok(lease);await b.search('another daily question');a.store.unlock('engine',lease);
    assert.equal(a.store.get('exa').requests,1);assert.equal(b.store.get('exa').requests,2);
  }finally{await a?.close();await b?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
