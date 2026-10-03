import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
export class CredentialVault {
 constructor(dir){this.file=path.join(dir,'google-drive.dpapi');}
 transform(value,decode=false){
  if(process.platform!=='win32')throw Error('Google 登入憑證目前使用 Windows 帳號加密。');
  const code="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();"+
   (decode?"[Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))":
   "[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))");
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{input:value,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});
  if(result.status!==0)throw Error('無法使用目前 Windows 帳號保存或解密 Google 登入設定。');
  return result.stdout.trim();
 }
 load(){return fs.existsSync(this.file)?JSON.parse(this.transform(fs.readFileSync(this.file,'utf8'),true)):{};}
 save(value){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',this.transform(JSON.stringify(value)));fs.renameSync(this.file+'.tmp',this.file);}
}
