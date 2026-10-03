import {isStoreSaleQuery} from './QueryText.js';
export function relevantPassages(body,query,max=2200){
 const text=String(body||'');if(text.length<=max)return text;
 const terms=[...new Set((String(query).toLowerCase().match(/[a-z0-9][a-z0-9.#-]{1,}|[\p{Script=Han}]{2,}/gu)||[]).filter(t=>!['latest','official','docs','wiki','wiki.gg','guide','攻略','最新','官方'].includes(t)))];
 const windows=[],sale=isStoreSaleQuery(query);
 const starts=new Set();for(let i=0;i<text.length;i+=500)starts.add(i);
 if(sale){
  let count=0;for(const m of text.matchAll(/\d+\s*(?:%|％|元)|(?:NT\s*\$|TWD|USD|€|\$)\s*\d/gi)){
   starts.add(Math.max(text.lastIndexOf('\n',m.index)+1,m.index-250,0));if(++count>=80)break;
  }
 }
 for(const i of starts){
  const chunk=text.slice(i,i+850),low=chunk.toLowerCase();
  let score=terms.filter(t=>low.includes(t)).length*10+(/requires?|prerequisite|how to|obtained|location|unlock|限制|前置|取得|需要|步驟|修正|nerf|buff/i.test(chunk)?4:0);
  if(sale){
   score+=Math.min(10,(chunk.match(/\d+\s*(?:%|％|元)|(?:NT\s*\$|TWD|USD|€|\$)\s*\d/gi)||[]).length)*8;
   score+=Math.min(5,(chunk.match(/《[^》]+》/g)||[]).length)*3;
   score-=Math.min(12,(chunk.match(/Sign in|Privacy Policy|Steam Subscriber Agreement|Change language|Discovery Queue|language|Wishlist|登入|語言|服務條款|最新消息|排行榜|手機遊戲|周邊|隱私|點數商店|探索佇列/gi)||[]).length)*8;
  }
  windows.push({start:i,end:Math.min(text.length,i+850),score});
 }
 const selected=sale?[]:[{start:0,end:Math.min(400,max)}];let used=sale?0:selected[0].end;
 for(const w of windows.sort((a,b)=>b.score-a.score||a.start-b.start)){
  if(used>=max-10)break;
  if(selected.some(s=>w.start<s.end&&w.end>s.start))continue;
  const end=Math.min(w.end,w.start+max-used-8);selected.push({...w,end});used+=end-w.start+8;
 }
 return selected.sort((a,b)=>a.start-b.start).map(w=>text.slice(w.start,w.end)).join('\n[…]\n').slice(0,max);
}
