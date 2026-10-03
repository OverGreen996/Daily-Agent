import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {status} from '../plugins/PluginManager.mjs';
import {rulesStatus} from '../plugins/RulesManager.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
test('Windows PowerShell creates forward-slash ZIP paths for Cloudflare assets',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xng-portable-zip-'));
 try{
  const source=path.join(root,'site');fs.mkdirSync(path.join(source,'releases'),{recursive:true});
  fs.writeFileSync(path.join(source,'releases/XNG-Core-1.zip'),'asset');
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  const helper=path.resolve(here,'../../../scripts/Write-PortableZip.ps1');
  const zip=path.join(root,'site.zip');
  const script=`$ErrorActionPreference='Stop'; . ${quote(helper)}; Write-PortableZip ${quote(source)} ${quote(zip)}; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip=[IO.Compression.ZipFile]::OpenRead(${quote(zip)});try{$zip.Entries.FullName}finally{$zip.Dispose()}`;
  const actual=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,encoding:'utf8'}).trim();
  assert.equal(actual,'releases/XNG-Core-1.zip');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('setup only accepts local HTTP SearXNG root endpoints',()=>{
 const source=fs.readFileSync(path.join(here,'Setup.Common.ps1'),'utf8').replace(/^\uFEFF/,'');
 const script=`${source}\nforeach($url in @('https://example.com','http://127.0.0.1:8080/search','http://u:p@localhost:8080','http://localhost:8080/?token=x')){try{$null=Get-LocalEndpoint $url;throw 'ACCEPTED'}catch{if($_.Exception.Message -eq 'ACCEPTED'){exit 2}}};if((Get-LocalEndpoint 'http://127.0.0.1:8080') -ne 'http://127.0.0.1:8080'){exit 3}`;
 execFileSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});
});
test('managers read custom API port and reject a different backend',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xng-setup-status-'));
 let endpoint='http://127.0.0.1:8080';
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'XNG AI Search Hub',endpoint,plugin:{version:'1',mode:'source'},rules:{version:'1'}}));});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  fs.mkdirSync(path.join(root,'.runtime'));
  fs.writeFileSync(path.join(root,'.runtime/connection.json'),JSON.stringify({port:server.address().port,searxng_url:endpoint}));
  assert.equal((await status(root)).running.version,'1');assert.equal((await rulesStatus(root)).running.version,'1');
  endpoint='http://127.0.0.1:9999';
  assert.equal((await status(root)).running,null);assert.equal((await rulesStatus(root)).running,null);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});
