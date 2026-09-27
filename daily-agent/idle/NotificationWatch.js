import {companionEvent} from '../core/CompanionEvents.js';
export class NotificationWatch{
  constructor(){this.seen=new Set();}
  receive({id,app},now=Date.now()){
    if(typeof id!=='string'||!/^\d{1,20}$/.test(id)||typeof app!=='string'||!app.trim()||app.length>120)throw Error('通知格式錯誤。');
    const key=id+':'+app;if(this.seen.has(key))return null;this.seen.add(key);if(this.seen.size>200)this.seen.delete(this.seen.values().next().value);
    const event=companionEvent('NEW_NOTIFICATION',{id:key,text:`「${app.replace(/[\r\n]/g,' ')}」有新通知。`},55,now);event.expires_at=now+300000;return event;
  }
}
