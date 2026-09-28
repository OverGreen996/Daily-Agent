export function withSearchSources(content, sources) {
  if (!sources.length) return content;
  if(sources.every(s=>s.coverage==='headline-only')){
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const date=new Intl.DateTimeFormat('zh-TW',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    return '找到以下新聞標題（僅取得標題，尚未讀取全文）：\n\n'+sources.slice(0,3).map((s,i)=>{
      const stamp=Date.parse(s.date);
      return `${i+1}. ${s.title}\n發布時間：${Number.isFinite(stamp)?date.format(stamp)+'（'+zone+'）':'日期待核實'}\n${s.url}`;
    }).join('\n\n');
  }
  // Native bubbles render plain text. Leave fenced code untouched.
  content=content.split(/(```[\s\S]*?```)/g).map((part,i)=>i%2 ? part : part.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^\s*\*\s+/gm,'• ')).join('');
  const missing=[...new Map(sources.map(s=>[s.url,s])).values()]
    .filter(s=>/^https?:\/\//.test(s.url) && !content.includes(s.url)).slice(0,6);
  return content+(missing.length ? '\n\n來源：\n'+missing.map(s=>`${s.title || s.url}\n${s.url}`).join('\n\n') : '');
}
