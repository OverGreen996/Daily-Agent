import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {companionEvent} from '../core/CompanionEvents.js';
export function parseCalendar(text,now=Date.now()){
  if(typeof text!=='string'||Buffer.byteLength(text)>500000||!text.includes('BEGIN:VCALENDAR'))throw Error('請提供 500 KB 以下的 .ics 行事曆。');
  return new Promise((resolve,reject)=>{
    const w=new Worker(new URL('./calendar-worker.js',import.meta.url),{workerData:{text,now},resourceLimits:{maxOldGenerationSizeMb:128}});
    const timer=setTimeout(()=>{w.terminate();reject(Error('行事曆解析逾時。'));},5000);
    w.once('message',r=>{clearTimeout(timer);w.terminate();r.error?reject(Error(r.error)):resolve(r.events);});
    w.once('error',e=>{clearTimeout(timer);reject(e);});
    w.once('exit',code=>{clearTimeout(timer);if(code)reject(Error('行事曆解析中止。'));});
  });
}
export class CalendarWatch{
  constructor(dir){this.file=path.join(dir,'calendar.json');this.state={enabled:false,sources:[],events:[],fired:[],refreshed:0};if(fs.existsSync(this.file))Object.assign(this.state,JSON.parse(fs.readFileSync(this.file,'utf8')));}
  save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.state));fs.renameSync(this.file+'.tmp',this.file);}
  async import(name,text,now=Date.now()){
    const events=await parseCalendar(text,now),sources=this.state.sources.filter(s=>s.name!==name);
    if(sources.length>=10)throw Error('最多保留 10 份行事曆，請先說「清除行事曆」。');
    sources.push({name,text});const oldIds=new Set(this.state.events.filter(e=>e.source!==name).map(e=>e.id));
    this.state.events=[...this.state.events.filter(e=>e.source!==name),...events.filter(e=>!oldIds.has(e.id)).map(e=>({...e,source:name}))];
    this.state.sources=sources;this.state.refreshed=now;this.save();return events.length;
  }
  enable(value){this.state.enabled=value;this.save();}
  clear(){this.state={enabled:false,sources:[],events:[],fired:[],refreshed:0};this.save();}
  upcoming(now=Date.now()){return this.state.events.filter(e=>e.end>=now && e.start<=now+7*86400000).sort((a,b)=>a.start-b.start).slice(0,20);}
  async poll(now=Date.now()){
    if(!this.state.enabled)return null;
    if(now-this.state.refreshed>86400000){for(const s of [...this.state.sources])await this.import(s.name,s.text,now);}
    const fired=new Set(this.state.fired.map(e=>e.id)),due=this.state.events.filter(e=>!e.allDay && !fired.has(e.id) && e.start>=now-60000 && e.start<=now+900000).sort((a,b)=>a.start-b.start).slice(0,1);
    if(!due.length)return null;
    return companionEvent('CALENDAR_EVENT',{id:due.map(e=>e.id).join('|'),ids:due.map(e=>e.id),text:due.map(e=>`${new Date(e.start).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})} 有「${e.title.slice(0,100)}」。`).join('\n')},95,now);
  }
  ack(event,now=Date.now()){if(event?.type!=='CALENDAR_EVENT')return;this.state.fired=this.state.fired.filter(e=>now-e.at<30*86400000);for(const id of event.data.ids)this.state.fired.push({id,at:now});this.save();}
}
