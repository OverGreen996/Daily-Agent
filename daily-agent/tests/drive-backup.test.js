import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {MemoryPalace} from '../memory/MemoryPalace.js';
import {CredentialVault} from '../features/backup/CredentialVault.js';
import {GoogleDriveBackup,googleClient} from '../features/backup/GoogleDriveBackup.js';
import {createSnapshot,decodeSnapshot,encodeSnapshot} from '../features/backup/MemorySnapshot.js';
const client={client_id:'1234567890-desktop.apps.googleusercontent.com',client_secret:'desktop-test'};
const scope='https://www.googleapis.com/auth/drive.appdata';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'daily-drive-'));
const store=(value={})=>({load:()=>structuredClone(value),save:v=>{value=structuredClone(v);}});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function connected(dir,fetcher){return new GoogleDriveBackup({dataDir:dir,store:store({client,refresh_token:'test-refresh',email:'test@example.org'}),fetcher});}
test('consistent SQLite backup contains current WAL and personal data, excludes generation history, credentials and pending commands',()=>{
 const dir=temp(),memory=new MemoryPalace(path.join(dir,'palace.sqlite'),{embed:async()=>[]});
 try {
  memory.working.add('user','我的名字是測試者');
  // Simulate an older imported image turn. New image turns are already refused.
  memory.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,0)').run('legacy-image','2026-10-03','user','private image prompt','本地生圖',10,'{}');
  memory.personal.saveFacts([{key:'name',value:'測試者'}],'我叫測試者');
  memory.personal.setPending('pc',{command:'do not back up this pending action'});
  fs.writeFileSync(path.join(dir,'google-drive.dpapi'),'credential MUST not be uploaded');
  fs.writeFileSync(path.join(dir,'calendar.json'),'{"enabled":false,"events":[]}');
  const snapshot=createSnapshot(memory,dir),decoded=decodeSnapshot(snapshot.bytes);
  assert.deepEqual(Object.keys(decoded.files),['palace.sqlite','calendar.json']);
  const file=path.join(dir,'snapshot.sqlite');fs.writeFileSync(file,decoded.files['palace.sqlite']);
  const db=new DatabaseSync(file,{readOnly:true});
  try {
   assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,1);
   assert.equal(db.prepare("SELECT value FROM personal_profile WHERE key='name'").get().value,'測試者');
   assert.equal(db.prepare('SELECT count(*) n FROM personal_pending').get().n,0);
  } finally {db.close();}
  assert.equal(memory.db.prepare('SELECT count(*) n FROM messages').get().n,2);
  assert.equal(fs.readFileSync(path.join(dir,'google-drive.dpapi'),'utf8'),'credential MUST not be uploaded');
  assert.equal(fs.readdirSync(path.join(dir,'backup-work')).length,0);
 } finally {memory.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:5});}
});
test('archive decoder refuses tampering, unexpected paths and decompression beyond the bounded format',()=>{
 const sqlite=Buffer.concat([Buffer.from('SQLite format 3\0'),Buffer.from('fixture')]);
 const good=encodeSnapshot({'palace.sqlite':sqlite});assert.equal(decodeSnapshot(good.bytes).files['palace.sqlite'].length,sqlite.length);
 assert.throws(()=>decodeSnapshot(encodeSnapshot({'../secret':sqlite}).bytes),/清單/);
 const bad=Buffer.from(good.bytes);bad[Math.floor(bad.length/2)]^=16;assert.throws(()=>decodeSnapshot(bad));
});
test('Desktop client validation and status never expose tokens or secret',()=>{
 const dir=temp();try {
  assert.deepEqual(googleClient({installed:client}),client);assert.throws(()=>googleClient({web:client}),/Desktop/);
  const drive=connected(dir,async()=>{throw Error('status must not call network');});
  assert.equal(drive.status().auto,false);assert.equal(drive.status().connected,true);
  assert.doesNotMatch(JSON.stringify(drive.status()),/test-refresh|desktop-test/);drive.close();
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('OAuth loopback checks state and PKCE, persists encrypted-session inputs and consumes the callback once',async()=>{
 const dir=temp(),vault=store();let exchange;
 const drive=new GoogleDriveBackup({dataDir:dir,store:vault,fetcher:async(url,options)=>{
  if(url.endsWith('/token')){exchange=new URLSearchParams(options.body);return json({access_token:'access-test',refresh_token:'refresh-test',token_type:'Bearer',expires_in:3600,scope:'openid email '+scope});}
  if(url.includes('/userinfo'))return json({email:'test@example.org'});
  throw Error('unexpected request');
 }});
 try {
  drive.configure({installed:client});const {url}=await drive.login();const auth=new URL(url);
  assert.equal(auth.origin,'https://accounts.google.com');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  assert.equal(auth.searchParams.get('scope'),'openid email '+scope);
  await assert.rejects(drive.login(),/進行中/);
  const callback=new URL(auth.searchParams.get('redirect_uri'));assert.equal(callback.hostname,'127.0.0.1');
  callback.search=new URLSearchParams({state:'bad',code:'test-code'});assert.equal((await fetch(callback)).status,403);assert.equal(drive.status().login_pending,true);
  callback.search=new URLSearchParams({state:'é'.repeat(auth.searchParams.get('state').length),code:'test-code'});assert.equal((await fetch(callback)).status,403);
  callback.search=new URLSearchParams({state:auth.searchParams.get('state'),code:'test-code'});assert.equal((await fetch(callback)).status,200);
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'));
  assert.equal(exchange.get('redirect_uri'),auth.searchParams.get('redirect_uri'));assert.equal(drive.status().connected,true);
  assert.equal(vault.load().refresh_token,'refresh-test');assert.equal(drive.controllers.size,0);
 } finally {drive.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('denied backup scope is not treated as successful login',async()=>{
 const dir=temp(),drive=new GoogleDriveBackup({dataDir:dir,store:store({client}),fetcher:async()=>json({access_token:'x',refresh_token:'r',token_type:'Bearer',scope:'openid email'})});
 try {
  const {url}=await drive.login(),auth=new URL(url),callback=new URL(auth.searchParams.get('redirect_uri'));
  callback.search=new URLSearchParams({state:auth.searchParams.get('state'),code:'test-code'});
  assert.equal((await fetch(callback)).status,400);assert.equal(drive.status().connected,false);assert.match(drive.status().error,/備份權限/);
 } finally {drive.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('resumable upload stays in appDataFolder, uses a validated snapshot and can download the checked backup without replacing live memory',async()=>{
 const dir=temp(),memory=new MemoryPalace(path.join(dir,'palace.sqlite'),{embed:async()=>[]});let uploaded,metadata;
 const drive=connected(dir,async(url,options)=>{
  if(url.endsWith('/token'))return json({access_token:'a',token_type:'Bearer',expires_in:3600,scope});
  if(url.includes('uploadType=resumable')){metadata=JSON.parse(options.body);return new Response('',{status:200,headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'}});}
  if(options.method==='PUT'){uploaded=Buffer.from(options.body);return json({id:'backup-one',name:metadata.name});}
  if(url.includes('alt=media'))return new Response(uploaded);
  return json({parents:['appDataFolder'],size:String(uploaded.length),appProperties:metadata.appProperties});
 });
 try {
  memory.working.add('user','備份內容');const result=await drive.backup(()=>createSnapshot(memory,dir));
  assert.equal(result.id,'backup-one');assert.deepEqual(metadata.parents,['appDataFolder']);assert.equal(metadata.appProperties.kind,'DailyAgentMemory');
  assert.equal(drive.controllers.size,0);assert.ok(drive.status().last_backup_at);
  memory.working.add('user','備份後的新內容');const downloaded=await drive.download(result.id);await drive.download(result.id);
  assert.ok(fs.existsSync(downloaded.path));assert.equal(memory.working.list().length,2);
  assert.equal(decodeSnapshot(uploaded).manifest.kind,'DailyAgentMemory');
 } finally {drive.close();memory.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:5});}
});
test('upload never sends memory or credentials to a non-Google resumable location',async()=>{
 const dir=temp();let uploads=0;
 const drive=connected(dir,async(url,options)=>{
  if(url.endsWith('/token'))return json({access_token:'a',token_type:'Bearer',expires_in:3600,scope});
  if(options.method==='PUT')uploads++;
  return new Response('',{status:200,headers:{location:'https://evil.example/upload'}});
 });
 try {await assert.rejects(drive.backup(()=>({bytes:Buffer.from('private'),manifest:{created_at:new Date().toISOString()}})),/上傳位置/);assert.equal(uploads,0);}
 finally {drive.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('disconnect clears persistent refresh token, disables automatic backup and leaves cloud backups untouched',async()=>{
 const dir=temp(),drive=connected(dir,async()=>new Response('',{status:200}));
 try {drive.setAuto(true);const result=await drive.disconnect();assert.equal(result.revoked,true);assert.equal(drive.status().connected,false);assert.equal(drive.status().auto,false);assert.equal(drive.load().refresh_token,undefined);assert.equal(drive.controllers.size,0);}
 finally {drive.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Windows credential vault survives restart and never stores refresh token in plain text',{skip:process.platform!=='win32'},()=>{
 const dir=temp();try {
  const vault=new CredentialVault(dir);vault.save({client,refresh_token:'private-test-refresh'});
  assert.doesNotMatch(fs.readFileSync(vault.file,'utf8'),/private-test-refresh|desktop-test/);
  assert.equal(new CredentialVault(dir).load().refresh_token,'private-test-refresh');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
