import { createHash } from 'node:crypto';
const DAY=86400000;
const clean=text=>String(text||'').replace(/[\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim();
const key=text=>createHash('sha256').update(clean(text).toLowerCase()).digest('hex').slice(0,24);
const sensitive=text=>/密碼|配對碼|驗證碼|password|api[_ -]?key|bearer\s|token\s*[:=]|-----BEGIN|不要.*(?:主動提|再提)|忘記這|刪除記憶/i.test(text);
export const memoryInvitations={continue:'要不要接著聊這件事？',progress:'後來有什麼進展嗎？',ideas:'現在有什麼新想法嗎？',plan:'需要我幫你整理下一步嗎？'};
export function memoryFollowupText(item,invitation){
  const excerpt=clean(item.text).slice(0,72);
  return `你之前提過「${excerpt.replace(/[。.!！?？]+$/u,'')}${clean(item.text).length>72?'…':''}」，${memoryInvitations[invitation]||memoryInvitations.continue}`;
}
export class MemoryCompanion {
  constructor(memory){this.memory=memory;this.used=new Map();this.cached=[];this.refreshed=-Infinity;}
  restore(entries=[]){this.used=new Map(entries.filter(e=>Array.isArray(e)&&typeof e[0]==='string'&&Number.isFinite(e[1])).slice(-100));}
  select(activity={},now=Date.now()){
    const db=this.memory.db;if(!db)return null;
    if(now-this.refreshed>=60000){
      const candidates=[];
      const add=(kind,id,text,time,importance,confidence=1)=>{
        text=clean(text);if(text.length<8||sensitive(text)||confidence<.75)return;
        candidates.push({kind,id,text:text.slice(0,240),time,importance,confidence,key:key(text)});
      };
      for(const p of db.prepare("SELECT id,text,type,created_at,confidence FROM pins WHERE type IN ('preference','decision','project','idea','question') ORDER BY created_at DESC LIMIT 32").all())
        add('pin',p.id,p.text,p.created_at,p.type==='decision'?.95:.8,p.confidence);
      for(const m of db.prepare("SELECT id,content,time FROM messages WHERE role='user' AND topic!='對話操作' AND time>=? ORDER BY time DESC,rowid DESC LIMIT 24").all(new Date(now-7*DAY).toISOString()))
        add('message',m.id,m.content,m.time,.65);
      // Only cards backed by an actual user turn; generated pet chatter is never evidence.
      for(const c of db.prepare(`SELECT c.card_id,coalesce(json_extract(b.raw_conversation,'$['||c.start_position||'].time'),c.created_at) AS created_at,c.metadata,
        substr(json_extract(b.raw_conversation,'$['||c.start_position||'].content'),coalesce(json_extract(c.metadata,'$.char_start'),0)+1,600) AS excerpt
        FROM cards c JOIN books b ON b.book_id=c.book_id
        WHERE json_extract(b.raw_conversation,'$['||c.start_position||'].role')='user'
        ORDER BY coalesce(json_extract(c.metadata,'$.importance'),0.5) DESC,c.created_at DESC LIMIT 32`).all()){
        const meta=JSON.parse(c.metadata||'{}');add('card',c.card_id,c.excerpt,c.created_at,Number(meta.importance)||.6,Number(meta.confidence)||0);
      }
      this.cached=candidates;this.refreshed=now;
    }
    const terms=String(activity.process||'').toLowerCase().replace(/\.exe$/,'').match(/[a-z0-9_-]{3,}/g)||[];
    return this.cached.filter(c=>now-(this.used.get(c.key)??-Infinity)>=DAY).map(c=>{
      const age=Math.max(0,now-Date.parse(c.time));
      const related=terms.some(t=>c.text.toLowerCase().includes(t));
      return {...c,score:.6*c.importance+.3*Math.exp(-age/(7*DAY))+(related?.1:0)};
    }).sort((a,b)=>b.score-a.score)[0]||null;
  }
  mark(item,now=Date.now()){this.used.set(item.key,now);while(this.used.size>100)this.used.delete(this.used.keys().next().value);}
}
