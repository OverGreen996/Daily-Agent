import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function androidUpdate(apkPath,{installedVersionCode=null,download=null}={}) {
  if(!apkPath&&!download)throw Error('APK unavailable');
  const meta=apkPath?JSON.parse((await fs.readFile(path.join(path.dirname(apkPath),'update.json'),'utf8')).replace(/^\uFEFF/,'')):download;
  if(meta.schema!==1 || !Number.isSafeInteger(meta.versionCode) || meta.versionCode<1 || !/^[a-f0-9]{64}$/.test(meta.sha256) || !Number.isSafeInteger(meta.size) || meta.size<1)throw Error('APK metadata mismatch');
  if(apkPath){const bytes=await fs.readFile(apkPath);if(meta.sha256!==createHash('sha256').update(bytes).digest('hex')||meta.size!==bytes.length)throw Error('APK metadata mismatch');}
  else {const u=new URL(meta.url);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.search||u.hash||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/[A-Za-z0-9_.-]+\/DailyPet-Android\.apk$/.test(u.pathname))throw Error('Invalid GitHub APK download');}
  const android={version:meta.version,versionCode:meta.versionCode,size:meta.size,sha256:meta.sha256,url:apkPath?'/download/android.apk':meta.url,requires_user_install:true};
  if(installedVersionCode!==null&&(!Number.isSafeInteger(installedVersionCode)||installedVersionCode<1))throw Error('Invalid installed version');
  if(meta.signingCertificateSha256!==undefined||meta.minimumCompatibleVersionCode!==undefined){
    if(!/^[a-f0-9]{64}$/.test(meta.signingCertificateSha256)||!Number.isSafeInteger(meta.minimumCompatibleVersionCode)||meta.minimumCompatibleVersionCode<1||meta.minimumCompatibleVersionCode>meta.versionCode)throw Error('APK signing metadata mismatch');
    Object.assign(android,{signingCertificateSha256:meta.signingCertificateSha256,minimumCompatibleVersionCode:meta.minimumCompatibleVersionCode,
      requires_reinstall:installedVersionCode===null?null:installedVersionCode<meta.minimumCompatibleVersionCode,
      migration:{beforeVersionCode:meta.minimumCompatibleVersionCode,action:'reinstall',message:'首次改用新簽章：舊版需移除後安裝並重新配對。電腦記憶宮殿保留；新版之後使用相同簽章更新。'}});
  }
  return {schema:1,android};
}
