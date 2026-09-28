import {randomUUID} from 'node:crypto';
import {localDay,parseDay,parseTime,queryRange} from './ScheduleDates.js';

// All mutations are local, explicit commands. Model prose is never executed as a command.
export class AssistantOrganizer {
  constructor(personal){
    this.personal=personal;this.db=personal.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS assistant_items(id TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,day TEXT,time TEXT,status TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS assistant_settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS assistant_checks(id TEXT,day TEXT,PRIMARY KEY(id,day));
      CREATE TABLE IF NOT EXISTS assistant_notices(key TEXT PRIMARY KEY,text TEXT NOT NULL,created INTEGER NOT NULL);`);
  }
  options(){return {now:this.personal.now(),timeZone:this.personal.timeZone};}
  rows(kind){return this.db.prepare("SELECT * FROM assistant_items WHERE kind=? AND status='active' ORDER BY coalesce(day,'9999'),coalesce(time,'99'),updated").all(kind);}
  line(r){return `[${r.id.slice(0,8)}] ${r.day||''} ${r.time||''} ${r.title}${r.body?'：'+r.body:''}`.trim();}
  put(kind,title,{body='',day=null,time=null}={}){
    if(!title||title.length>200||body.length>4000)throw Error('請提供 1～200 字標題，筆記內容最多 4000 字。');
    const existing=this.rows(kind).find(r=>r.title===title&&r.body===body&&r.day===day&&r.time===time);
    if(existing)return '已經記錄過：\n'+this.line(existing);
    const id=randomUUID();this.db.prepare("INSERT INTO assistant_items VALUES(?,?,?,?,?,?,'active',?)").run(id,kind,title,body,day,time,this.personal.now());
    return '已保存：\n'+this.line({id,title,body,day,time});
  }
  pick(kind,key){const rows=this.rows(kind).filter(r=>r.id.startsWith(key)||r.title===key);if(rows.length!==1)throw Error(rows.length?'有同名項目，請用列表中的 8 位編號指定。':'找不到該項目，請先查看列表取得編號。');return rows[0];}
  dated(text){
    const date=parseDay(text,this.options()),time=parseTime(date?.rest||text);
    if(date?.implicitPast)throw Error('日期已過，請提供完整年月日。');
    if(time.ambiguous)throw Error('請加上上午／下午，或使用 24 小時時間，例如 15:00。尚未保存。');
    if(time.time&&!date)throw Error('有時間但沒有日期，請補上日期。');
    return {title:time.rest.replace(/^[\s：:]+/,'').trim(),day:date?.day||null,time:time.time};
  }
  brief(text,calendar){
    const range=queryRange(text,this.options()),today=localDay(this.personal.now(),this.personal.timeZone);
    const tasks=this.rows('task').filter(r=>!r.day||r.day<=range.end);
    return this.personal.query(text,calendar)+'\n\n待辦（含逾期及未定日期）\n'+(tasks.map(r=>(r.day&&r.day<today?'逾期 ':'')+this.line(r)).join('\n')||'沒有待辦。')+'\n\n每日習慣\n'+this.habits();
  }
  habits(){const today=localDay(this.personal.now(),this.personal.timeZone);return this.rows('habit').map(r=>this.line(r)+(this.db.prepare('SELECT 1 FROM assistant_checks WHERE id=? AND day=?').get(r.id,today)?' ✓ 今日完成':' □ 今日未完成')).join('\n')||'尚未設定習慣。';}
  poll(){
    if(this.db.prepare("SELECT value FROM assistant_settings WHERE key='reminders'").get()?.value==='off')return [];
    const now=this.personal.now(),day=localDay(now,this.personal.timeZone);
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:this.personal.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
    const rows=[...this.personal.list(day,day).map(r=>({...r,kind:'行程'})),...this.rows('task').filter(r=>r.day&&r.day<=day).map(r=>({...r,kind:'待辦'})),...this.rows('habit').map(r=>({...r,day,kind:'習慣'}))];
    const notices=[];
    for(const r of rows){
      if(!r.time||r.day+':'+r.time>day+':'+time)continue;
      if(r.kind==='習慣'&&this.db.prepare('SELECT 1 FROM assistant_checks WHERE id=? AND day=?').get(r.id,day))continue;
      const key=[r.id,r.day,r.time].join(':');
      const text=`${r.kind}到時提醒：${r.day} ${r.time} ${r.title}`;
      if(this.db.prepare('INSERT OR IGNORE INTO assistant_notices VALUES(?,?,?)').run(key,text,now).changes)notices.push(text);
    }
    return notices;
  }
  handle(text,{calendar,scope}={}){
    const s=text.trim().replace(/[。！]+$/,'');let m;
    if(/^(開啟|關閉)助理提醒$/.test(s)){this.db.prepare("INSERT INTO assistant_settings VALUES('reminders',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(s.startsWith('開啟')?'on':'off');return '已'+s+'。';}
    if(s==='查看已完成待辦')return this.db.prepare("SELECT * FROM assistant_items WHERE kind='task' AND status='completed' ORDER BY updated DESC LIMIT 100").all().map(r=>this.line(r)).join('\n')||'尚無已完成待辦。';
    if(/^(助理說明|助理功能|助理指令)$/.test(s))return '可直接告訴我姓名、工作、喜好，或「明天下午三點要開會」。\n今天摘要／明天摘要／出門摘要\n新增待辦 明天15:00 繳費；查看待辦；完成待辦 編號\n新增專案 網站；專案進度 網站：設計完成\n會議筆記 週會：討論內容；查看會議；搜尋筆記 關鍵字\n新增習慣 每天09:00 喝水；打卡 喝水；查看習慣\n修改待辦 編號：後天15:00 繳費\n刪除待辦／專案／會議／習慣 編號\n提醒我 明天15:00 出門；查看提醒\n到時提醒需要電腦後端運行；未定時間的項目只列入摘要。';
    if(/^(今天|明天|後天|出門)(的)?摘要$/.test(s))return this.brief(s==='出門摘要'?'今天':s,calendar);
    if((m=s.match(/^(?:新增待辦|待辦)[：:\s]+(.+)$/s)))return this.put('task',this.dated(m[1]).title,this.dated(m[1]));
    if(/^(查看待辦|我的待辦|未完成待辦|逾期待辦)$/.test(s)){let rows=this.rows('task');if(s==='逾期待辦')rows=rows.filter(r=>r.day&&r.day<localDay(this.personal.now(),this.personal.timeZone));return rows.map(r=>this.line(r)).join('\n')||'沒有符合的待辦。';}
    if((m=s.match(/^(新增專案)[：:\s]+(.+)$/)))return this.put('project',m[2]);
    if((m=s.match(/^專案進度\s+(.+?)[：:]\s*(.+)$/s))){const r=this.pick('project',m[1]);this.db.prepare('UPDATE assistant_items SET body=?,updated=? WHERE id=?').run(m[2],this.personal.now(),r.id);return '已更新專案進度：'+m[2];}
    if((m=s.match(/^會議筆記\s+(.+?)[：:]\s*(.+)$/s)))return this.put('meeting',m[1],{body:m[2],day:localDay(this.personal.now(),this.personal.timeZone)});
    if((m=s.match(/^新增習慣\s+每天\s*(.+)$/))){const t=parseTime(m[1]);if(t.ambiguous||!t.time)throw Error('請指定每日時間，例如「新增習慣 每天09:00 喝水」。');return this.put('habit',t.rest.trim(),{time:t.time});}
    if((m=s.match(/^打卡\s+(.+)$/))){const r=this.pick('habit',m[1]);this.db.prepare('INSERT OR IGNORE INTO assistant_checks VALUES(?,?)').run(r.id,localDay(this.personal.now(),this.personal.timeZone));return '今日已打卡：'+r.title;}
    if(s==='查看習慣')return this.habits();
    if((m=s.match(/^查看(專案|會議)$/)))return this.rows(m[1]==='專案'?'project':'meeting').map(r=>this.line(r)).join('\n')||'尚無記錄。';
    if((m=s.match(/^搜尋筆記\s+(.+)$/)))return this.rows('meeting').filter(r=>(r.title+r.body).includes(m[1])).map(r=>this.line(r)).join('\n')||'找不到符合的會議筆記。';
    if((m=s.match(/^(完成|刪除)(待辦|專案|會議|習慣)\s+(.+)$/))){const r=this.pick({待辦:'task',專案:'project',會議:'meeting',習慣:'habit'}[m[2]],m[3]);this.db.prepare('UPDATE assistant_items SET status=?,updated=? WHERE id=?').run(m[1]==='完成'?'completed':'deleted',this.personal.now(),r.id);return '已'+m[1]+'：'+r.title;}
    if((m=s.match(/^修改(待辦|會議|習慣)\s+(.+?)[：:]\s*(.+)$/s))){const kind={待辦:'task',會議:'meeting',習慣:'habit'}[m[1]],r=this.pick(kind,m[2]);let v=kind==='task'?this.dated(m[3]):kind==='meeting'?{...r,body:m[3]}:{...r,...parseTime(m[3]),title:parseTime(m[3]).rest.trim()};if(v.ambiguous||!v.title)throw Error('請提供完整內容與明確時間。');this.db.prepare('UPDATE assistant_items SET title=?,body=?,day=?,time=?,updated=? WHERE id=?').run(v.title,v.body||'',v.day||null,v.time||null,this.personal.now(),r.id);return '已修改：'+v.title;}
    if((m=s.match(/^(?:提醒我|出門提醒)\s*(.+)$/)))return this.personal.add(m[1],{scope});
    if(s==='查看提醒')return this.db.prepare('SELECT text FROM assistant_notices ORDER BY created DESC LIMIT 30').all().map(r=>r.text).join('\n')||'目前沒有到時提醒。';
    return null;
  }
}
