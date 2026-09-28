const pad=n=>String(n).padStart(2,'0');
export function localDay(now=Date.now(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function shiftDay(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function dayKey(y,m,d){
  const key=`${y}-${pad(m)}-${pad(d)}`,parsed=new Date(key+'T12:00:00Z');
  if(y<1900||y>2199||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==key)throw Error('日期不存在，請提供完整年月日。');
  return key;
}
function numeral(s){if(/^\d+$/.test(s))return Number(s);const digits='零一二三四五六七八九';s=s.replace(/兩/g,'二').replace(/〇/g,'零');if(s.includes('十')){const [a,b]=s.split('十');return (a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0);}return Number([...s].map(c=>digits.indexOf(c)).join(''));}
export function normalizeDates(text){return String(text).normalize('NFKC').replace(/([零〇一二三四五六七八九十兩]+)(?=年|月|日|號|點|時|分)/g,(_,n)=>numeral(n));}
const datePattern=/(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|(?:\d{4}年)?\d{1,2}月\d{1,2}(?:日|號)?|\d{1,2}\/\d{1,2}|大後天|後天|明天|明日|今天|今日|昨天|昨日|(?:下下|下|本|這)?(?:星期|禮拜|週|周)[一二三四五六日天]|(?:(?:下個月|下月|本月|這個月)\s*)?\d{1,2}[日號])/g;
export function parseDay(text,{now=Date.now(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone}={}){
  const source=normalizeDates(text),matches=[...source.matchAll(datePattern)];
  if(!matches.length)return null;
  if(matches.length!==1)throw Error('一次請提供一個行程日期，多筆行程請分開說。');
  const match=matches[0],raw=match[0],today=localDay(now,timeZone),[year,month]=today.split('-').map(Number);
  let day,explicitYear=false,m;
  const relative={今天:0,今日:0,明天:1,明日:1,後天:2,大後天:3,昨天:-1,昨日:-1};
  if(raw in relative)day=shiftDay(today,relative[raw]);
  else if((m=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))){day=dayKey(+m[1],+m[2],+m[3]);explicitYear=true;}
  else if((m=raw.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})/))){day=dayKey(+(m[1]||year),+m[2],+m[3]);explicitYear=!!m[1];}
  else if((m=raw.match(/^(\d{1,2})\/(\d{1,2})$/)))day=dayKey(year,+m[1],+m[2]);
  else if((m=raw.match(/^(下下|下|本|這)?(?:星期|禮拜|週|周)([一二三四五六日天])$/))){
    const weekday=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7;
    const target='一二三四五六日'.indexOf(m[2].replace('天','日'));
    day=shiftDay(today,-weekday+target+(m[1]==='下'?7:m[1]==='下下'?14:0));
  }else if((m=raw.match(/^(下個月|下月|本月|這個月)?\s*(\d+)[日號]$/))){
    const next=/^下/.test(m[1]||'');const mo=month+(next?1:0);day=dayKey(year+(mo>12?1:0),mo>12?1:mo,+m[2]);
  }
  if(!day)throw Error('無法確認日期，請使用 YYYY-MM-DD。');
  return {day,raw,source,index:match.index,explicitYear,implicitPast:day<today&&!explicitYear&&!(raw in relative)&&!/^本|^這/.test(raw),rest:(source.slice(0,match.index)+' '+source.slice(match.index+raw.length)).trim()};
}
export function parseTime(text){
  const source=normalizeDates(text),pattern=/(?:(凌晨|早上|上午|中午|下午|傍晚|晚上|晚間)\s*)?(\d{1,2})(?::(\d{2})|[點時](?:(半|一刻|三刻)|(\d{1,2})(?:分)?)?)(?:整)?/g;
  const matches=[...source.matchAll(pattern)];
  if(matches.length>1)throw Error('目前一次記一個開始時間；請拆開行程，或只提供開始時間。');
  if(!matches.length){const p=source.match(/凌晨|早上|上午|中午|下午|傍晚|晚上|晚間/);return {time:null,period:p?.[0]||'',rest:p?source.replace(p[0],' '):source};}
  const m=matches[0];let h=+m[2],minute=+(m[3]||m[5]||0);if(m[4])minute={半:30,一刻:15,三刻:45}[m[4]];
  if(h>23||minute>59||(m[1]&&h>12))throw Error('時間不正確，請使用 24 小時格式，例如 15:00。');
  if(!m[1]&&h>=1&&h<=12&&m[3]===undefined)return {ambiguous:true,hour:h,raw:m[0],rest:source};
  if(/下午|傍晚|晚上|晚間/.test(m[1]||'')&&h<12)h+=12;
  if(/凌晨|早上|上午/.test(m[1]||'')&&h===12)h=0;
  if(m[1]==='中午'&&h<11)h+=12;
  return {time:`${pad(h)}:${pad(minute)}`,period:'',rest:(source.slice(0,m.index)+' '+source.slice(m.index+m[0].length)).trim()};
}
export function queryRange(text,options={}){
  const today=localDay(options.now,options.timeZone);let start,end,label;
  if(/下(?:週|周|星期|禮拜)|(?:這|本)(?:週|周|星期|禮拜)/.test(text)&&!parseDay(text,options)){
    const weekday=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7;
    start=shiftDay(today,-weekday+(/^.*下/.test(text)?7:0));end=shiftDay(start,6);label=text.includes('下')?'下週':'這週';
  }else if(/這個月|本月|下個月|下月/.test(text)&&!parseDay(text,options)){
    const d=new Date(today.slice(0,7)+'-01T12:00:00Z');if(/下/.test(text))d.setUTCMonth(d.getUTCMonth()+1);
    start=d.toISOString().slice(0,10);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);end=d.toISOString().slice(0,10);label=/下/.test(text)?'下個月':'這個月';
  }else {const date=parseDay(text,options);start=date?.day||today;end=date?.day||shiftDay(today,30);label=date?.raw||'未來 30 天';}
  return {start,end,label};
}
