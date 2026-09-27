import {parentPort,workerData} from 'node:worker_threads';
import ical from 'node-ical';
try{
  const data=ical.sync.parseICS(workerData.text),events=[];
  const from=new Date(workerData.now-86400000),to=new Date(workerData.now+90*86400000);
  for(const e of Object.values(data)){
    if(e.type!=='VEVENT'||e.status==='CANCELLED'||!e.start)continue;
    if(e.rrule && /FREQ=(SECONDLY|MINUTELY|HOURLY)/.test(e.rrule.toString()))throw Error('不支援每小時以下的高頻行事曆。');
    const instances=e.rrule?ical.expandRecurringEvent(e,{from,to}):[{start:e.start,end:e.end}];
    for(const i of instances){
      const start=+new Date(i.start),end=+new Date(i.end||i.start);
      if(start<+from||start>+to)continue;
      events.push({id:String(e.uid||e.summary).slice(0,200)+'@'+start,title:String(i.summary||e.summary||'行程').slice(0,200),start,end,allDay:e.datetype==='date'});
      if(events.length>1000)throw Error('90 天內的行程超過 1000 筆，請縮小匯出範圍。');
    }
  }
  parentPort.postMessage({events});
}catch(e){parentPort.postMessage({error:e.message});}
