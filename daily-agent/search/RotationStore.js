import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PROVIDERS,UNITS,monthPeriod} from './Providers.js';
export const DEFAULT_SETTINGS={enabled:true,order:[...PROVIDERS],timeoutMs:20000,cooldownMs:60000,
  providers:{exa:{enabled:true,cap:9},tavily:{enabled:true,cap:900},firecrawl:{enabled:true,cap:900}}};
export function validateSettings(input){
  const result=structuredClone(input);
  if(typeof result.enabled!=='boolean'||!Array.isArray(result.order)||result.order.length!==3||new Set(result.order).size!==3||result.order.some(id=>!PROVIDERS.includes(id)))throw Error('順位必須包含三家供應商，且不可重複。');
  if(!Number.isInteger(result.timeoutMs)||result.timeoutMs<3000||result.timeoutMs>30000||!Number.isInteger(result.cooldownMs)||result.cooldownMs<1000||result.cooldownMs>3600000)throw Error('逾時須為 3–30 秒；冷卻須為 1–3600 秒。');
  for(const id of PROVIDERS){const p=result.providers?.[id];if(!p||typeof p.enabled!=='boolean'||!Number.isFinite(p.cap)||p.cap<0||p.cap>(id==='exa'?9:900))throw Error('本機用量上限超出免費模式允許範圍。');}
  return {enabled:result.enabled,order:result.order,timeoutMs:result.timeoutMs,cooldownMs:result.cooldownMs,
    providers:Object.fromEntries(PROVIDERS.map(id=>[id,{enabled:result.providers[id].enabled,cap:result.providers[id].cap}]))};
}
export class RotationStore {
  constructor(dir,{now=Date.now}={}){
    if(dir!==':memory:')fs.mkdirSync(dir,{recursive:true});
    this.now=now;this.db=new DatabaseSync(dir===':memory:'?dir:path.join(dir,'search-state.sqlite'));
    this.db.exec(`PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS providers(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(id TEXT PRIMARY KEY,value TEXT NOT NULL,expires REAL NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify(DEFAULT_SETTINGS));
  }
  settings(){return JSON.parse(this.db.prepare('SELECT value FROM settings WHERE id=1').get().value);}
  saveSettings(value){this.db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(validateSettings(value)));}
  get(id){const row=this.db.prepare('SELECT value FROM providers WHERE id=?').get(id);
    return row?JSON.parse(row.value):{...monthPeriod(this.now()),used:0,requests:0,reason:null,disabledUntil:0,official:null};}
  put(id,value){this.db.prepare('INSERT INTO providers VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(value));return value;}
  reserve(id,cap){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const s=this.get(id),units=UNITS[id];
      if(s.used+units>cap+1e-9||(s.official&&s.official.remaining<units))throw Error('CAP');
      s.used+=units;s.requests++;if(s.official)s.official.remaining=Math.max(0,s.official.remaining-units);
      this.put(id,s);this.db.exec('COMMIT');return s;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  account(id,units){ // Keep uncertain requests reserved; reconcile only upward for conservative accounting.
    const extra=Math.max(0,units-UNITS[id]);if(!extra)return;
    this.db.exec('BEGIN IMMEDIATE');try{const s=this.get(id);s.used+=extra;if(s.official)s.official.remaining=Math.max(0,s.official.remaining-extra);this.put(id,s);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  lock(id,ttl=35000){const owner=randomUUID();
    this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM locks WHERE expires<=?').run(this.now());
      const changed=this.db.prepare('INSERT OR IGNORE INTO locks VALUES(?,?,?)').run(id,owner,this.now()+ttl).changes;
      this.db.exec('COMMIT');return changed?owner:null;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  unlock(id,owner){this.db.prepare('DELETE FROM locks WHERE id=? AND owner=?').run(id,owner);}
  cached(id){const row=this.db.prepare('SELECT * FROM cache WHERE id=? AND expires>?').get(id,this.now());return row?JSON.parse(row.value):null;}
  cache(id,value,ttl){this.db.prepare('DELETE FROM cache WHERE expires<=?').run(this.now());
    this.db.prepare('INSERT INTO cache VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,expires=excluded.expires').run(id,JSON.stringify({...value,query:undefined}),this.now()+ttl);
    this.db.exec('DELETE FROM cache WHERE id NOT IN (SELECT id FROM cache ORDER BY expires DESC LIMIT 100)');}
  close(){this.db.close();}
}
