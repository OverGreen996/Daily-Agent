export function withSearchSources(content, sources) {
  if (!sources.length) return content;
  // Native bubbles render plain text. Leave fenced code untouched.
  content=content.split(/(```[\s\S]*?```)/g).map((part,i)=>i%2 ? part : part.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^\s*\*\s+/gm,'• ')).join('');
  const missing=[...new Map(sources.map(s=>[s.url,s])).values()]
    .filter(s=>/^https?:\/\//.test(s.url) && !content.includes(s.url)).slice(0,6);
  return content+(missing.length ? '\n\n來源：\n'+missing.map(s=>`${s.title || s.url}\n${s.url}`).join('\n\n') : '');
}
