import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {androidUpdate} from '../remote/UpdateFeed.js';
import {RemoteGateway} from '../remote/RemoteGateway.js';
const metadata=()=>({schema:1,version:'0.1.0-preview.10',versionCode:10,size:123,sha256:'a'.repeat(64),signingCertificateSha256:'b'.repeat(64),minimumCompatibleVersionCode:10,url:'https://github.com/OverGreen996/Daily-Agent/releases/download/android-preview-10/DailyPet-Android.apk'});
test('APK download and update metadata work without an installed APK',async t=>{
 const meta=metadata(),gateway=new RemoteGateway({remote:{devices:{list:()=>[]}}},{port:0,apkDownload:meta});
 await gateway.start();t.after(()=>gateway.stop());const base='http://127.0.0.1:'+gateway.port;
 const feed=await (await fetch(base+'/v1/updates?versionCode=9')).json();assert.equal(feed.android.requires_reinstall,true);assert.equal(feed.android.url,meta.url);
 const download=await fetch(base+'/download/android.apk',{redirect:'manual'});assert.equal(download.status,302);assert.equal(download.headers.get('location'),meta.url);
 for(const url of ['http://github.com/a/b/releases/download/v1/DailyPet-Android.apk','https://evil.test/APK','https://user:secret@github.com/a/b/releases/download/v1/DailyPet-Android.apk'])await assert.rejects(androidUpdate(null,{download:{...meta,url}}),/Invalid GitHub/);
});
test('installer and reusable phone download link use the same independent GitHub release',async()=>{
 const meta=JSON.parse((await fs.readFile(new URL('../deploy/android-download.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const source=await fs.readFile(new URL('../deploy/DailyUi.cs',import.meta.url),'utf8');assert.equal(source.match(/public const string Url = "([^"]+)"/)[1],meta.url);
 assert.equal((await androidUpdate(null,{download:meta})).android.versionCode,10);
 const packager=await fs.readFile(new URL('../scripts/package.ps1',import.meta.url),'utf8');assert.doesNotMatch(packager,/Copy-Item[^\r\n]*android\\dist|foreach[^\r\n]*DailyPet-Android.*apk/);
});
