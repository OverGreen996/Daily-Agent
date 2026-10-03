import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const source=fs.readFileSync(new URL('../../Setup-DailyAgent.ps1',import.meta.url),'utf8');
const start=source.indexOf("if (!(Test-Path (Join-Path $runtimeDir 'ollama\\ollama.exe')))");
const end=source.indexOf('Push-Location',start);
const download=source.slice(start,end);

for(const binary of [true,false])test(`setup reads ${binary?'binary':'text'} checksum metadata and reuses a fully verified download`,{skip:process.platform!=='win32'},()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'daily-download-test-'));
 const hash=createHash('sha256').update('verified archive fixture').digest('hex');
 fs.writeFileSync(path.join(runtime,'ollama-windows-amd64.zip'),'verified archive fixture');
 fs.copyFileSync(new URL('../../Daily-SetupState.ps1',import.meta.url),path.join(runtime,'Daily-SetupState.ps1'));
 const file=path.join(runtime,'probe.ps1');
 fs.writeFileSync(file,`\uFEFF$ErrorActionPreference='Stop'\n. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')\n$runtimeDir=$PSScriptRoot\nfunction Invoke-WebRequest { $text='${hash}  ./ollama-windows-amd64.zip'+[char]10; return @{Content=${binary?'[Text.Encoding]::UTF8.GetBytes($text)':'$text'}} }\nfunction curl.exe { throw 'A complete verified archive must not be resumed with HTTP Range' }\nfunction Expand-Archive { 'expanded' | Set-Content -LiteralPath (Join-Path $runtimeDir 'expanded.txt') }\n${download}\n`);
 try{const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(path.join(runtime,'expanded.txt'),'utf8').replace(/^\uFEFF/, '').trim(),'expanded');}
 finally{fs.rmSync(runtime,{recursive:true,force:true});}
});
