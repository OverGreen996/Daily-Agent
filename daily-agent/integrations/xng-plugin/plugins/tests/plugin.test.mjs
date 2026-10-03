import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePackage,selected,installDirectory,rollback,validateFeed,configureSource} from '../PluginManager.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scratch=()=>fs.mkdtempSync(path.join(os.tmpdir(),'xng-updater-test-'));
function fixture(base,version='1',fails=false){
 const directory=path.join(base,'package-'+version);fs.mkdirSync(path.join(directory,'core/tests'),{recursive:true});
 const contents={'core/index.js':'export {};','core/Core.js':'export {};','core/server.js':'export {};','core/package.json':JSON.stringify({name:'xng-search-core',type:'module'}),'core/tests/acceptance.test.js':`import test from 'node:test';import assert from 'node:assert/strict';test('acceptance',()=>assert.equal(${fails},false));`};
 for(const [name,bytes] of Object.entries(contents))fs.writeFileSync(path.join(directory,name),bytes);
 const manifest={schema:1,id:'xng-search-core',api_schema_version:1,paid:false,version,files:Object.entries(contents).map(([name,bytes])=>({path:name,sha256:sha(bytes)}))};
 fs.writeFileSync(path.join(directory,'plugin.json'),JSON.stringify(manifest));return directory;
}
function isolated(fn){const root=scratch();try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
const install=(root,pkg)=>installDirectory(root,pkg,{node:process.execPath});
test('update passes real regression, switches atomically and preserves shared state',()=>isolated(root=>{
 fs.mkdirSync(path.join(root,'.runtime'));fs.writeFileSync(path.join(root,'.runtime','engine-state.json'),'keep');
 const first=fixture(root,'1'),second=fixture(root,'2');install(root,first);install(root,second);
 assert.equal(selected(root).version,'2');assert.equal(selected(root).previous,'1');
 assert.equal(fs.readFileSync(path.join(root,'.runtime','engine-state.json'),'utf8'),'keep');
 rollback(root);assert.equal(selected(root).version,'1');rollback(root);assert.equal(selected(root).version,'2');
 assert.equal(fs.existsSync(path.join(root,'.plugins','update.lock')),false);
}));
test('first plugin can roll back to retained original core',()=>isolated(root=>{
 const pkg=fixture(root);fs.cpSync(path.join(pkg,'core'),path.join(root,'core'),{recursive:true});install(root,pkg);
 rollback(root);assert.equal(selected(root).mode,'source');assert.equal(selected(root).previous,'1');
 rollback(root);assert.equal(selected(root).version,'1');
}));
test('failed regression preserves pointer byte for byte and cleans staging',()=>isolated(root=>{
 install(root,fixture(root,'1'));const pointer=path.join(root,'.plugins/current.json'),before=fs.readFileSync(pointer);
 assert.throws(()=>install(root,fixture(root,'2',true)),/回歸未通過/);
 assert.deepEqual(fs.readFileSync(pointer),before);assert.equal(fs.readdirSync(path.join(root,'.plugins/staging')).length,0);
}));
test('tampered download cannot change installed version',()=>isolated(root=>{
 install(root,fixture(root,'1'));const pkg=fixture(root,'2');fs.appendFileSync(path.join(pkg,'core/Core.js'),'tampered');
 assert.throws(()=>install(root,pkg),/校驗失敗/);assert.equal(selected(root).version,'1');
}));
test('unregistered executable is rejected',()=>isolated(root=>{
 const pkg=fixture(root);fs.writeFileSync(path.join(pkg,'core/extra.exe'),'bad');assert.throws(()=>validatePackage(pkg),/未登記/);
}));
test('path traversal in manifest is rejected before file access',()=>isolated(root=>{
 const pkg=fixture(root);const file=path.join(pkg,'plugin.json'),m=JSON.parse(fs.readFileSync(file));m.files[0].path='core/../../escape.js';fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>validatePackage(pkg),/不安全/);
}));
test('installed immutable version cannot be replaced by different bytes',()=>isolated(root=>{
 const pkg=fixture(root);install(root,pkg);fs.appendFileSync(path.join(pkg,'core/index.js'),'//changed');
 const file=path.join(pkg,'plugin.json'),m=JSON.parse(fs.readFileSync(file));m.files.find(x=>x.path==='core/index.js').sha256=sha(fs.readFileSync(path.join(pkg,'core/index.js')));fs.writeFileSync(file,JSON.stringify(m));
 assert.throws(()=>install(root,pkg),/同版本/);assert.equal(selected(root).version,'1');
}));
test('concurrent update lock does not disturb pointer',()=>isolated(root=>{
 install(root,fixture(root));fs.writeFileSync(path.join(root,'.plugins/update.lock'),'another process');
 assert.throws(()=>rollback(root),/另一個/);assert.equal(selected(root).version,'1');
}));
test('corrupt rollback target keeps current selection',()=>isolated(root=>{
 install(root,fixture(root,'1'));install(root,fixture(root,'2'));fs.appendFileSync(path.join(root,'.plugins/versions/1/core/Core.js'),'bad');
 assert.throws(()=>rollback(root),/校驗/);assert.equal(selected(root).version,'2');
}));
const feed={schema:1,id:'xng-search-core',version:'2026.10.03-2058',api_schema_version:1,paid:false,size:10,sha256:'a'.repeat(64),url:'https://github.com/OverGreen996/Daily-Agent/releases/download/xng-core-1/XNG.zip'};
test('feed accepts public compatible free package',()=>assert.equal(validateFeed({...feed}).version,feed.version));
test('configured Cloudflare source accepts its own package but rejects another host',()=>isolated(root=>{
 const source='https://xng-plugins.example.workers.dev/xng-update.json';configureSource(root,source);
 assert.equal(validateFeed({...feed,url:'https://xng-plugins.example.workers.dev/releases/core.zip'},source).paid,false);
 assert.throws(()=>validateFeed({...feed,url:'https://other.workers.dev/releases/core.zip'},source));
 assert.throws(()=>configureSource(root,'http://example.test/xng-update.json'));
 assert.throws(()=>configureSource(root,'https://example.test/xng-update.json?token=secret'));
}));
for(const [name,changes] of Object.entries({host:{url:'https://evil.example/XNG.zip'},paid:{paid:true},schema:{api_schema_version:2},size:{size:30_000_001},path:{version:'../escape'},query:{url:feed.url+'?token=bad'}}))test('feed rejects '+name,()=>assert.throws(()=>validateFeed({...feed,...changes})));
test('ZIP extraction rejects traversal and case collisions without extracting any file',()=>isolated(root=>{
 const extract=fileURLToPath(new URL('../Extract-Plugin.ps1',import.meta.url));
 for(const entries of [['core/safe.js','../escaped.js'],['core/File.js','core/file.js']]){
  const zip=path.join(root,'bad.zip'),out=path.join(root,'out');fs.mkdirSync(out,{recursive:true});
  const script=path.join(root,'zip.ps1');fs.writeFileSync(script,`Add-Type -AssemblyName System.IO.Compression.FileSystem\n$zip=[IO.Compression.ZipFile]::Open('${zip.replaceAll("'","''")}','Create')\ntry{${entries.map(e=>`$null=$zip.CreateEntry('${e}')`).join(';')}}finally{$zip.Dispose()}`);
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true});
  assert.throws(()=>execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',extract,'-Archive',zip,'-Destination',out],{windowsHide:true,stdio:'pipe'}));
  assert.equal(fs.readdirSync(out).length,0);assert.equal(fs.existsSync(path.join(root,'escaped.js')),false);fs.unlinkSync(zip);
 }
}));
