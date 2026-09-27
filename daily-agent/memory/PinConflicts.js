import {randomUUID} from 'node:crypto';
export function pinFact(text){
  const s=text.replace(/^記住(?:偏好|規則|決定)?[:：]?\s*/,'').trim();let m;
  if((m=s.match(/(?:請叫我|稱呼我)(.+)/)))return {key:'user_name',value:m[1].trim()};
  if(/回答|回覆/.test(s)){
    if(/簡短|簡潔|短一點/.test(s))return {key:'reply_length',value:'short'};
    if(/詳細|長一點|完整解釋/.test(s))return {key:'reply_length',value:'detailed'};
  }
  if((m=s.match(/^(.{1,60}?)\s*=\s*(.{1,200})$/)))return {key:m[1].toLowerCase().replace(/\s/g,''),value:m[2].trim()};
  if((m=s.match(/^我(不)?喜歡(.{1,100})$/)))return {key:'likes:'+m[2].replace(/[。！!]/g,''),value:m[1]?'no':'yes'};
  return null;
}
export class PinConflicts {
  constructor(db){this.db=db;db.exec('CREATE TABLE IF NOT EXISTS pin_conflicts(id TEXT PRIMARY KEY,text TEXT,type TEXT,existing TEXT,created_at TEXT); CREATE TABLE IF NOT EXISTS pin_history(id TEXT PRIMARY KEY,pin TEXT,reason TEXT,created_at TEXT)');}
  detect(text,type){
    const fact=pinFact(text);if(!fact)return null;
    const existing=this.db.prepare('SELECT * FROM pins').all().filter(p=>{const old=pinFact(p.text);return old?.key===fact.key&&old.value!==fact.value;});
    if(!existing.length)return null;
    let row=this.db.prepare('SELECT * FROM pin_conflicts WHERE text=?').get(text);
    if(!row){row={id:randomUUID(),text,type,existing:JSON.stringify(existing.map(p=>p.id)),created_at:new Date().toISOString()};this.db.prepare('INSERT INTO pin_conflicts VALUES(?,?,?,?,?)').run(row.id,row.text,row.type,row.existing,row.created_at);}
    return {...row,conflict:true};
  }
  list(){return this.db.prepare('SELECT * FROM pin_conflicts ORDER BY created_at DESC LIMIT 20').all();}
  resolve(id,useNew,pins){
    if(!/^[a-f\d-]{8,36}$/i.test(id))throw Error('請提供衝突編號。');
    const rows=this.db.prepare('SELECT * FROM pin_conflicts WHERE substr(id,1,?)=?').all(id.length,id.toLowerCase());
    if(rows.length!==1)throw Error('找不到唯一的衝突編號。');const row=rows[0];
    this.db.exec('BEGIN');
    try{
      if(useNew){
        for(const oldId of JSON.parse(row.existing)){
          const old=this.db.prepare('SELECT * FROM pins WHERE id=?').get(oldId);if(!old)continue;
          this.db.prepare('INSERT INTO pin_history VALUES(?,?,?,?)').run(randomUUID(),JSON.stringify(old),'user_resolved_conflict',new Date().toISOString());
          this.db.prepare('DELETE FROM pins WHERE id=?').run(oldId);
        }
        pins.save(row.text,row.type,1,{skipConflict:true});
      }
      this.db.prepare('DELETE FROM pin_conflicts WHERE id=?').run(row.id);this.db.exec('COMMIT');return row;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
}
