import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
export class SearchCredentials {
  constructor(dir){this.file=path.join(dir,'search-secrets.dpapi');}
  version(){try{const s=fs.statSync(this.file);return `${s.mtimeMs}:${s.ctimeMs}:${s.size}`;}catch(e){if(e.code==='ENOENT')return 'absent';throw e;}}
  transform(input,decode=false){
    if(process.platform!=='win32')throw Error('搜尋金鑰保存需要 Windows DPAPI。');
    const script="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$v=[Console]::In.ReadToEnd();"+
      (decode?"[Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))":
        "[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))");
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});
    if(result.status!==0)throw Error('目前 Windows 帳號無法保存或解密搜尋金鑰。');
    return result.stdout.trim();
  }
  load(){return fs.existsSync(this.file)?JSON.parse(this.transform(fs.readFileSync(this.file,'utf8'),true)):{};}
  save(value){const encrypted=this.transform(JSON.stringify(value));fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',encrypted);fs.renameSync(this.file+'.tmp',this.file);}
}
