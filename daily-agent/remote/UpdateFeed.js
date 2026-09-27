import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function androidUpdate(apkPath) {
  if(!apkPath)throw Error('APK unavailable');
  const meta=JSON.parse((await fs.readFile(path.join(path.dirname(apkPath),'update.json'),'utf8')).replace(/^\uFEFF/,''));
  const bytes=await fs.readFile(apkPath);
  if(meta.schema!==1 || !Number.isSafeInteger(meta.versionCode) || meta.versionCode<1 || meta.sha256!==createHash('sha256').update(bytes).digest('hex') || meta.size!==bytes.length)throw Error('APK metadata mismatch');
  return {schema:1,android:{version:meta.version,versionCode:meta.versionCode,size:bytes.length,sha256:meta.sha256,url:'/download/android.apk',requires_user_install:true}};
}
