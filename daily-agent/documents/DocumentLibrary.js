import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {lexical,cosine} from '../memory/MemoryPalace.js';

const validId=id=>/^[a-f\d]{64}\.(txt|md|pdf)$/.test(id||'');
export class DocumentLibrary {
  constructor(dataDir,embedding){this.root=dataDir;this.dir=path.join(dataDir,'documents');this.file=path.join(dataDir,'document-library.sqlite');this.embedding=embedding;}
  async withDb(fn){
    await fs.mkdir(this.root,{recursive:true});const db=new DatabaseSync(this.file);
    try{
      db.exec(`PRAGMA busy_timeout=3000;
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,name TEXT,aliases TEXT,format TEXT,pages INTEGER,created_at TEXT,mtime REAL);
        CREATE TABLE IF NOT EXISTS passages(id INTEGER PRIMARY KEY,document_id TEXT,page INTEGER,start INTEGER,end INTEGER,text TEXT,source TEXT);
        CREATE INDEX IF NOT EXISTS passages_document ON passages(document_id);
        CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(name,text);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);`);
      db.exec('CREATE TABLE IF NOT EXISTS vectors(passage_id INTEGER PRIMARY KEY,model TEXT,vector TEXT)');
      return fn(db);
    }finally{db.close();}
  }
  async index(document){
    if(!validId(document.id))throw Error('文件 ID 無效。');
    const stat=await fs.stat(path.join(this.dir,document.id+'.json'));
    await this.withDb(db=>{
      db.exec('BEGIN');
      try{
        db.prepare('DELETE FROM vectors WHERE passage_id IN (SELECT id FROM passages WHERE document_id=?)').run(document.id);
        db.prepare('DELETE FROM document_fts WHERE rowid IN (SELECT id FROM passages WHERE document_id=?)').run(document.id);
        db.prepare('DELETE FROM passages WHERE document_id=?').run(document.id);
        const aliases=[...new Set([document.name,...(document.aliases||[])])];
        db.prepare('INSERT OR REPLACE INTO documents VALUES (?,?,?,?,?,?,?)').run(document.id,document.name,JSON.stringify(aliases),document.format,document.pages.length,document.created_at,stat.mtimeMs);
        for(const page of document.pages)for(let start=0;start<page.text.length;start+=650){
          const text=page.text.slice(start,start+700);
          const result=db.prepare('INSERT INTO passages(document_id,page,start,end,text,source) VALUES(?,?,?,?,?,?)').run(document.id,page.number,start,start+text.length,text,page.source||'text');
          db.prepare('INSERT INTO document_fts(rowid,name,text) VALUES(?,?,?)').run(result.lastInsertRowid,lexical(aliases.join(' ')),lexical(text));
        }
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
    });
  }
  async sync(){
    const files=await fs.readdir(this.dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
    const existing=await this.withDb(db=>new Map(db.prepare('SELECT id,mtime FROM documents').all().map(r=>[r.id,r.mtime])));
    const present=new Set(),warnings=[];
    for(const file of files){
      const id=file.replace(/\.json$/,'');if(file!==id+'.json'||!validId(id))continue;present.add(id);
      try{
        const stat=await fs.stat(path.join(this.dir,file));
        if(existing.get(id)===stat.mtimeMs)continue;
        const doc=JSON.parse(await fs.readFile(path.join(this.dir,file),'utf8'));
        if(doc.id!==id || !Array.isArray(doc.pages))throw Error('Invalid document metadata');
        await this.index(doc);
      }catch{warnings.push(id);}
    }
    // Remove stale index entries only. Never delete user files or source text.
    await this.withDb(db=>{
      for(const id of existing.keys())if(!present.has(id)||warnings.includes(id)){
        db.prepare('DELETE FROM document_fts WHERE rowid IN (SELECT id FROM passages WHERE document_id=?)').run(id);
        db.prepare('DELETE FROM passages WHERE document_id=?').run(id);
        db.prepare('DELETE FROM documents WHERE id=?').run(id);
      }
    });
    return warnings.map(id=>id.slice(0,12));
  }
  async list(page=1){
    const warnings=await this.sync();
    return this.withDb(db=>{
      const total=db.prepare('SELECT count(*) n FROM documents').get().n;
      return {total,page,warnings,items:db.prepare('SELECT * FROM documents ORDER BY created_at DESC,id LIMIT 8 OFFSET ?').all((page-1)*8)};
    });
  }
  async search(query){
    const warnings=await this.sync();
    const terms=[...new Set(lexical(query).split(' ').filter(Boolean))].slice(0,32);
    if(!terms.length)return {items:[],warnings};
    const match=terms.map(t=>'"'+t.replaceAll('"','""')+'"').join(' AND ');
    return this.withDb(db=>({warnings,items:db.prepare(`SELECT d.id,d.name,d.format,p.page,p.start,p.end,p.text,p.source,bm25(document_fts,4,1) rank
      FROM document_fts JOIN passages p ON p.id=document_fts.rowid JOIN documents d ON d.id=p.document_id
      WHERE document_fts MATCH ? ORDER BY rank,p.id LIMIT 8`).all(match)}));
  }
  async resolve(reference){
    await this.sync();const ref=reference.trim().replace(/^[「『"]|[」』"]$/g,'');
    if(!ref || ref.length>200)throw Error('請提供文件編號或完整檔名。');
    const rows=await this.withDb(db=>db.prepare('SELECT * FROM documents').all());
    const normalized=ref.normalize('NFKC').toLowerCase();
    let found=rows.filter(r=>JSON.parse(r.aliases).some(a=>a.normalize('NFKC').toLowerCase()===normalized));
    if(!found.length && /^[a-f\d]{8,64}(?:\.(?:txt|md|pdf))?$/i.test(ref))found=rows.filter(r=>r.id.startsWith(ref.toLowerCase()));
    if(found.length===0)throw Error('找不到這份文件。可先說「查看文件庫」或「搜尋文件：關鍵字」。');
    if(found.length>1)throw Error('有多份符合的文件，請使用編號：\n'+found.slice(0,8).map(r=>`[${r.id.slice(0,12)}] ${r.name}`).join('\n'));
    return found[0];
  }
  async semanticSearch(query,{onProgress=()=>{}}={}){
    if(!this.embedding)throw Error('文件語意模型尚未設定。');
    await this.sync();const model=this.embedding.model||'embedding';
    const missing=await this.withDb(db=>db.prepare('SELECT p.* FROM passages p LEFT JOIN vectors v ON p.id=v.passage_id AND v.model=? WHERE v.passage_id IS NULL LIMIT 201').all(model));
    for(let i=0;i<Math.min(200,missing.length);i+=8){
      onProgress({stage:'semantic',part:Math.min(i+8,200,missing.length),total:Math.min(200,missing.length)});
      const batch=missing.slice(i,Math.min(i+8,200)),vectors=await this.embedding.embed(batch.map(r=>r.text));
      if(vectors.length!==batch.length || vectors.some(v=>!Array.isArray(v)||!v.length||v.some(x=>!Number.isFinite(x))))throw Error('文件向量回傳格式錯誤。');
      await this.withDb(db=>{const insert=db.prepare('INSERT OR REPLACE INTO vectors VALUES(?,?,?)');batch.forEach((row,j)=>insert.run(row.id,model,JSON.stringify(vectors[j])));});
    }
    const [queryVector]=await this.embedding.embed([query]);
    const rows=await this.withDb(db=>db.prepare('SELECT d.id,d.name,d.format,p.page,p.start,p.end,p.text,p.source,v.vector FROM vectors v JOIN passages p ON p.id=v.passage_id JOIN documents d ON d.id=p.document_id WHERE v.model=?').all(model));
    const keywords=await this.search(query),lexRanks=new Map(keywords.items.map((r,i)=>[r.id+':'+r.page+':'+r.start,1/(30+i)]));
    const items=rows.map(({vector,...row})=>({...row,similarity:cosine(queryVector,JSON.parse(vector))})).filter(r=>r.similarity>=0.35).sort((a,b)=>b.similarity-a.similarity)
      .map((r,i)=>({...r,rank:1/(30+i)+(lexRanks.get(r.id+':'+r.page+':'+r.start)||0)})).sort((a,b)=>b.rank-a.rank).slice(0,6);
    return {items,warnings:keywords.warnings,indexIncomplete:missing.length>200};
  }
  async current(){return this.withDb(db=>{const row=db.prepare("SELECT value FROM settings WHERE key='current_document'").get();return row?row.value||null:undefined;});}
  async select(id){
    if(id!==null && !validId(id))throw Error('文件 ID 無效。');
    await this.withDb(db=>db.prepare("INSERT OR REPLACE INTO settings VALUES('current_document',?)").run(id||''));
  }
}
