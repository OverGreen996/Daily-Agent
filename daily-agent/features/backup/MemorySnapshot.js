import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {forgetImageGeneration} from '../../memory/ForgetImageGeneration.js';
const magic=Buffer.from('DAILY-MEMORY-1\n');
export const MAX_BACKUP_BYTES=64*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function encodeSnapshot(files,created_at=new Date().toISOString()){
 const entries=Object.entries(files);
 const manifest={schema:1,kind:'DailyAgentMemory',created_at,files:entries.map(([name,data])=>({name,size:data.length,sha256:digest(data)}))};
 const header=Buffer.from(JSON.stringify(manifest));const size=Buffer.alloc(4);size.writeUInt32BE(header.length);
 const raw=Buffer.concat([magic,size,header,...entries.map(([,data])=>data)]);
 if(raw.length>MAX_BACKUP_BYTES)throw Error('記憶備份超過目前 64 MB 上限。');
 return {bytes:gzipSync(raw),manifest};
}
export function decodeSnapshot(bytes){
 if(bytes.length>MAX_BACKUP_BYTES+65536)throw Error('備份檔案太大。');
 const raw=gunzipSync(bytes,{maxOutputLength:MAX_BACKUP_BYTES});
 if(!raw.subarray(0,magic.length).equals(magic)||raw.length<magic.length+4)throw Error('不是 Daily Agent 記憶備份。');
 const size=raw.readUInt32BE(magic.length),start=magic.length+4;
 if(size>65536||size<2||start+size>raw.length)throw Error('備份標頭損壞。');
 const manifest=JSON.parse(raw.subarray(start,start+size));
 if(manifest.schema!==1||manifest.kind!=='DailyAgentMemory'||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>2)throw Error('不支援的備份格式。');
 let offset=start+size;const files={};
 for(const entry of manifest.files){
  if(!['palace.sqlite','calendar.json'].includes(entry.name)||Object.hasOwn(files,entry.name)||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>MAX_BACKUP_BYTES||offset+entry.size>raw.length)throw Error('備份檔案清單不正確。');
  const data=raw.subarray(offset,offset+entry.size);offset+=entry.size;
  if(digest(data)!==entry.sha256)throw Error('備份校驗失敗。');
  files[entry.name]=data;
 }
 if(offset!==raw.length||!files['palace.sqlite']?.subarray(0,16).equals(Buffer.from('SQLite format 3\0')))throw Error('記憶資料庫損壞。');
 if(files['calendar.json'])JSON.parse(files['calendar.json'].toString('utf8'));
 return {manifest,files};
}
export function createSnapshot(memory,dataDir){
 const base=path.resolve(dataDir,'backup-work');
 if(fs.existsSync(base)&&fs.lstatSync(base).isSymbolicLink())throw Error('備份暫存目錄不能是連結。');
 fs.mkdirSync(base,{recursive:true});
 const temp=path.join(base,randomUUID());fs.mkdirSync(temp);
 try {
  const file=path.join(temp,'palace.sqlite');
  // VACUUM INTO includes committed WAL content and gives a consistent snapshot.
  memory.db.exec("VACUUM INTO '"+file.replaceAll("'","''")+"'");
  if(fs.statSync(file).size>MAX_BACKUP_BYTES-65536)throw Error('記憶備份超過目前 64 MB 上限。');
  const copy=new DatabaseSync(file);
  try {
   copy.exec('PRAGMA journal_mode=DELETE');
   forgetImageGeneration({db:copy});
   if(copy.prepare("SELECT name FROM sqlite_master WHERE name='personal_pending'").get())copy.exec('DELETE FROM personal_pending');
   copy.exec('VACUUM');
   assertHealthyDatabase(copy);
  } finally {copy.close();}
  const files={'palace.sqlite':fs.readFileSync(file)};
  const calendar=path.join(dataDir,'calendar.json');
  if(fs.existsSync(calendar)){
   if(fs.lstatSync(calendar).isSymbolicLink())throw Error('行事曆資料不能是連結。');
   if(fs.statSync(calendar).size>1024*1024)throw Error('行事曆資料超過 1 MB 上限。');
   const bytes=fs.readFileSync(calendar);JSON.parse(bytes.toString('utf8'));files['calendar.json']=bytes;
  }
  return encodeSnapshot(files);
 } finally {
  if(!path.resolve(temp).startsWith(base+path.sep))throw Error('Invalid backup cleanup path');
  fs.rmSync(temp,{recursive:true,force:true});
 }
}
export function assertHealthyDatabase(db){
 if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('記憶資料庫完整性檢查失敗。');
 const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
 if(!['messages','books','cards','pins','entities','habits'].every(name=>names.has(name)))throw Error('不是可使用的記憶宮殿資料庫。');
}
