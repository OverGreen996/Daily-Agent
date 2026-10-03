import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateRules,validateDomains,installRules,selectedRules,effectiveRules,rollbackRules,validateRulesFeed,updateRules} from '../RulesManager.mjs';
const roots=[];const root=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'xng-rules-test-'));roots.push(p);return p;};
test.after(()=>{for(const p of roots)fs.rmSync(p,{recursive:true,force:true});});
const rules=(v='2026.10.03-1')=>({schema:1,id:'xng-source-rules',version:v,api_schema_version:1,paid:false,domains:{'example.com':{authority:.6,source_type:'blog',penalty:.1}}});
const hash=b=>createHash('sha256').update(b).digest('hex');
test('data-only contract rejects unknown executable, paid and incompatible fields',()=>{
 for(const extra of [{paid:true},{schema:2},{api_schema_version:2},{script:'run()'},{endpoint:'https://example.com'},{version:'../escape'}])assert.throws(()=>validateRules({...rules(),...extra}));
 for(const entry of [{authority:Infinity},{authority:-.1},{authority:1.1},{penalty:'0.5'},{blocked:'false'},{source_type:'whatever'},{publisher:'false official'},{constructor:{}}])assert.throws(()=>validateDomains({'example.com':entry}));
 for(const d of ['localhost','127.0.0.1','EXAMPLE.COM','https://example.com','*.example.com','a..com','a.com/../'])assert.throws(()=>validateDomains({[d]:{}}));
});
test('shared rules and personal fields merge; longest domain wins and personal file remains intact',()=>{
 const p=root();installRules(p,rules(),{verify:false});const file=path.join(p,'config/domain_overrides.local.json');fs.writeFileSync(file,JSON.stringify({'example.com':{authority:.9},'docs.example.com':{source_type:'documentation'}}));const before=fs.readFileSync(file);
 const effective=effectiveRules(p,{'example.com':{penalty:.2},'another.com':{authority:.8}});
 assert.equal(effective.overrides['example.com'].authority,.9);assert.equal(effective.overrides['example.com'].penalty,.1);assert.equal(Object.keys(effective.overrides)[0],'docs.example.com');
 installRules(p,rules('2026.10.03-2'),{verify:false});assert.deepEqual(fs.readFileSync(file),before);assert.equal(selectedRules(p).previous,'2026.10.03-1');
});
test('same version different content, broken installed checksum and invalid personal config fail safely',()=>{
 const p=root();installRules(p,rules(),{verify:false});const pointer=path.join(p,'config/rules-current.json'),before=fs.readFileSync(pointer);
 const modified=rules();modified.domains['example.com'].authority=.7;assert.throws(()=>installRules(p,modified,{verify:false}));assert.deepEqual(fs.readFileSync(pointer),before);
 fs.writeFileSync(path.join(p,'config/domain_overrides.local.json'),'{}');installRules(p,rules(),{verify:false});
 fs.writeFileSync(path.join(p,'config/domain_overrides.local.json'),'[]');assert.throws(()=>installRules(p,rules('2026.10.03-2'),{verify:false}));assert.deepEqual(fs.readFileSync(pointer),before);
 fs.appendFileSync(path.join(p,'config/rules-versions/2026.10.03-1.json'),' ');assert.throws(()=>selectedRules(p));
});
test('rollback supports previous version and original built-in rules',()=>{
 const p=root();installRules(p,rules(),{verify:false});rollbackRules(p);assert.equal(selectedRules(p).version,null);rollbackRules(p);assert.equal(selectedRules(p).version,'2026.10.03-1');
 installRules(p,rules('2026.10.03-2'),{verify:false});rollbackRules(p);assert.equal(selectedRules(p).version,'2026.10.03-1');
});
test('update lock and failing full regression retain current version',()=>{
 const p=root();installRules(p,rules(),{verify:false});fs.writeFileSync(path.join(p,'config/rules-update.lock'),'held');assert.throws(()=>installRules(p,rules('2026.10.03-2'),{verify:false}));fs.unlinkSync(path.join(p,'config/rules-update.lock'));
 const core=path.join(p,'core');fs.mkdirSync(path.join(core,'tests'),{recursive:true});fs.writeFileSync(path.join(core,'tests/fail.test.js'),"throw Error('intentional regression failure');");
 assert.throws(()=>installRules(p,rules('2026.10.03-2'),{node:process.execPath}));assert.equal(selectedRules(p).version,'2026.10.03-1');assert.equal(fs.existsSync(path.join(p,'config/rules-update.lock')),false);
});
test('feed rejects foreign destinations, credentials, traversal and incompatible parameters',()=>{
 const base={schema:1,id:'xng-source-rules',api_schema_version:1,paid:false,version:'2026.10.03-1',size:100,sha256:'a'.repeat(64),url:'/releases/XNG-Rules-2026.10.03-1.json'};
 assert.match(validateRulesFeed(base).url,/workers\.dev/);
 for(const url of ['https://evil.example/releases/XNG-Rules-1.json','/releases/../XNG-Rules-1.json','/releases/XNG-Rules-1.json?token=abc','https://u:p@xng-plugins.kentyang1993.workers.dev/releases/XNG-Rules-1.json'])assert.throws(()=>validateRulesFeed({...base,url}));
 for(const extra of [{size:65537},{paid:true},{api_schema_version:2},{sha256:'x'.repeat(64)}])assert.throws(()=>validateRulesFeed({...base,...extra}));
});
test('confirmed download checks hash, size and exact version; rejects stale confirmation',async()=>{
 const p=root(),data=rules(),bytes=Buffer.from(JSON.stringify(data)),feed={schema:1,id:data.id,api_schema_version:1,paid:false,version:data.version,size:bytes.length,sha256:hash(bytes),url:'/releases/XNG-Rules-'+data.version+'.json'};
 const fetcher=async(url,options)=>{assert.equal(options.redirect,'error');return new Response(url.endsWith('xng-rules-update.json')?JSON.stringify(feed):bytes);};
 await updateRules(p,data.version,feed.sha256,{fetcher,verify:false});assert.equal(selectedRules(p).version,data.version);
 await assert.rejects(updateRules(p,data.version,'b'.repeat(64),{fetcher,verify:false}));
 await assert.rejects(updateRules(p,data.version,feed.sha256,{fetcher:async url=>new Response(url.endsWith('xng-rules-update.json')?JSON.stringify(feed):Buffer.alloc(bytes.length)),verify:false}));assert.equal(selectedRules(p).version,data.version);
});
