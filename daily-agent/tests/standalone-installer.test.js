import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=fileURLToPath(new URL('../deploy/Installer.cs',import.meta.url));
const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const run=(exe,args)=>spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:60000});
test('standalone Setup embeds its payload, rejects corruption and ZIP traversal', {skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-single-setup-'));
  try{
    for(const scenario of ['valid','bad-hash','traversal']){
      const folder=path.join(dir,scenario);fs.mkdirSync(folder);const zip=path.join(folder,'fixture.zip'),hash=zip+'.sha256';
      const ps=path.join(folder,'fixture.ps1');
      fs.writeFileSync(ps,`Add-Type -AssemblyName System.IO.Compression\n$f=[IO.File]::Create('${zip.replaceAll("'","''")}')\n$z=[IO.Compression.ZipArchive]::new($f,[IO.Compression.ZipArchiveMode]::Create)\n$e=$z.CreateEntry('${scenario==='traversal'?'../escape.txt':'marker.txt'}')\n$w=[IO.StreamWriter]::new($e.Open())\n$w.Write('verified payload')\n$w.Dispose()\n$z.Dispose()\n$f.Dispose()`);
      const made=run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',ps]);assert.equal(made.status,0,made.stderr);
      fs.writeFileSync(hash,scenario==='bad-hash'?'0'.repeat(64):createHash('sha256').update(fs.readFileSync(zip)).digest('hex'));
      const exe=path.join(folder,'DailyAgent-Setup.exe');
      const built=run(compiler,['/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll','/resource:'+zip+',DailyAgent.Package','/resource:'+hash+',DailyAgent.Hash','/out:'+exe,source]);assert.equal(built.status,0,built.stdout+built.stderr);
      // Remove the external payload and checksum before launching the EXE.
      fs.unlinkSync(zip);fs.unlinkSync(hash);
      const out=path.join(folder,'out'),result=run(exe,['--extract-only',out]);
      assert.equal(result.status,scenario==='valid'?0:1,scenario);
      if(scenario==='valid')assert.equal(fs.readFileSync(path.join(out,'payload/marker.txt'),'utf8'),'verified payload');
      else assert.equal(fs.existsSync(path.join(out,'payload')),false);
      assert.equal(fs.existsSync(path.join(out,'escape.txt')),false);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
