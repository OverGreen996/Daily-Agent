const extra=m=>typeof m.extra==='string'?JSON.parse(m.extra||'{}'):(m.extra||{});
export const imageMemory=m=>{
  const e=extra(m);
  return !!e.generation||Object.hasOwn(e,'image_mode')||/本地生圖|圖片生成|繪製.*圖片|AI 繪圖內容限制|(?:內容|色情).*生成|生成.*(?:內容|指令)/.test(m.topic||'');
};
// Remove source turns and all derived indexes, preserving unrelated turns in mixed books.
export function forgetImageGeneration(memory,{additionalIds=[]}={}){
  const db=memory.db,rows=db.prepare('SELECT * FROM messages ORDER BY rowid').all();
  const ids=new Set(additionalIds);for(const m of rows)if(imageMemory(m))ids.add(m.id);
  const removed=rows.filter(m=>ids.has(m.id));let books=0,cards=0;
  db.exec('PRAGMA secure_delete=ON; BEGIN IMMEDIATE');
  try{
    for(const b of db.prepare('SELECT * FROM books').all()){
      const raw=JSON.parse(b.raw_conversation);
      if(!raw.some(m=>ids.has(m.id)||imageMemory(m)))continue;
      const count=db.prepare('SELECT count(*) n FROM cards WHERE book_id=?').get(b.book_id).n;
      db.prepare('DELETE FROM card_fts WHERE card_id IN (SELECT card_id FROM cards WHERE book_id=?)').run(b.book_id);
      db.prepare('DELETE FROM metadata_index WHERE card_id IN (SELECT card_id FROM cards WHERE book_id=?)').run(b.book_id);
      db.prepare('DELETE FROM cards WHERE book_id=?').run(b.book_id);
      db.prepare('DELETE FROM books WHERE book_id=?').run(b.book_id);books++;cards+=count;
      for(const m of raw){if(ids.has(m.id)||imageMemory(m)){ids.add(m.id);continue;}
        db.prepare('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?,0)').run(m.id,m.time,m.role,m.content,m.topic,m.tokens,JSON.stringify(extra(m)));
        db.prepare('UPDATE messages SET archived=0 WHERE id=?').run(m.id);
      }
    }
    for(const id of ids)db.prepare('DELETE FROM messages WHERE id=?').run(id);
    // Only exact extracted source pins are removed; general application preferences survive.
    let pins=0;for(const m of removed)pins+=db.prepare('DELETE FROM pins WHERE text=?').run(m.content.slice(0,1600)).changes;
    db.exec('COMMIT');return {messages:removed.length,books,cards,pins};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
