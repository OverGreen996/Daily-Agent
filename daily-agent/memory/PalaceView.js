export function palaceView(memory,query='',page=1){
  const search=query.toLowerCase().slice(0,200),books=memory.books.all().filter(b=>!search||JSON.stringify(b).toLowerCase().includes(search));
  page=Math.max(1,Math.min(10000,Number(page)||1));
  return {organizer:memory.personal?.organizer?['task','project','meeting','habit'].flatMap(k=>memory.personal.organizer.rows(k)).filter(r=>!search||JSON.stringify(r).toLowerCase().includes(search)):[],total:books.length,page,books:books.slice((page-1)*12,page*12),pins:memory.pins.all().filter(p=>!search||p.text.toLowerCase().includes(search)).slice(0,40),conflicts:memory.pins.conflicts.list(),habits:memory.habits.confirmed(),profile:memory.personal?.profile().filter(p=>!search||JSON.stringify(p).toLowerCase().includes(search))||[],schedule:memory.personal?.list().filter(e=>!search||JSON.stringify(e).toLowerCase().includes(search))||[],timeZone:memory.personal?.timeZone};
}
export function palaceBook(memory,id,offset=0){
  const book=memory.books.get(id);if(!book)return null;
  const raw=book.raw_conversation.map(m=>`[${m.time||''}] ${m.role}\n${m.content}`).join('\n\n');
  offset=Math.max(0,Math.floor(Number(offset)||0));
  return {id,summary:book.summary,metadata:book.metadata,raw:raw.slice(offset,offset+6000),offset,next:offset+6000<raw.length?offset+6000:null,total:raw.length,cards:memory.db.prepare('SELECT card_id,text AS summary,metadata FROM cards WHERE book_id=? LIMIT 50').all(id)};
}
