// Deterministic local query reduction: keeps entities, versions and constraints;
// never invokes a model, adds credentials or consumes API quota.
export function isStoreSaleQuery(value){
 const q=String(value||'');
 return /\bsteam\b|store\.steampowered\.com|\bepic(?:\s*games)?\b|playstation|nintendo|eshop|遊戲特賣/i.test(q)
  && /特價|特賣|折扣|優惠|值得買|值得購買|必買|價格|售價|多少錢|\bprice\b|\bsales?\b|\bdeals?\b|discount|worth\s+(?:buying|getting)/i.test(q)
  && !/配裝|流派|任務|掉落|通關|打法|擊敗|頭目|\bboss\b|\bbuilds?\b|\bwalkthrough\b|\bquest\b/i.test(q);
}
export function storeSaleSubject(value){
 return String(value||'').replace(/幫我|請問|請|搜尋|查詢|這一次|這一波|這次|這波|本次|最近|最新|現在|目前|今天|有什麼|有哪些|什麼|值得購買|值得買|值得|必買|推薦|遊戲|不錯|可以|買|\b(?:what|which|this|current|latest|best|worth|buying|getting|games?|deals?|sales?|discounts?)\b/gi,' ')
  .replace(/特价|特價|特賣|折扣|優惠/g,' ').replace(/[，。？?]/g,' ').replace(/\s+/g,' ').trim();
}
export function usableStoreSaleEvidence(row,query){
 if(!isStoreSaleQuery(query))return true;
 const store=/^https?:\/\/store\.(?:steampowered|epicgames)\.com\//i.test(row.url||'');
 const year=String(query).match(/\b(20\d{2})\b/)?.[1],historical=year&&Number(year)<new Date().getFullYear();
 const stamp=Date.parse(row.modified_at||row.date||row.publishedDate);
 // Future publication dates and marketplace listings do not establish a
 // current first-party Steam offer. Keep them for explicit reseller research.
 if(Number.isFinite(stamp)&&stamp>Date.now()+86400000)return false;
 if(/\bsteam\b|store\.steampowered\.com/i.test(query)&&!/序號|代購|比價|比价|key\s*(?:shop|seller)|reseller/i.test(query)){
  try{const host=new URL(row.url).hostname.toLowerCase();if(['biggo.com.tw','feebee.com.tw','shopee.tw','shopee.com','g2a.com','eneba.com'].some(d=>host===d||host.endsWith('.'+d)))return false;}catch{return false;}
 }
 if(!store&&!historical&&Number.isFinite(stamp)&&Date.now()-stamp>30*86400000)return false;
 // Dynamic storefronts can return only navigation to an HTTP reader. Reading
 // that shell is not equivalent to reading the actual discounted products.
 if(store&&['page','article'].includes(row.coverage)&&/\/(?:sale\/|specials|search)/i.test(row.url)
  && !/(?:\d+\s*(?:%|％|元)|(?:NT\s*\$|TWD|USD|€|\$)\s*\d)/i.test(row.body||''))return false;
 return true;
}
export function searchSubject(value){
 const q=String(value||'').replace(/(?:^|[。；\n])\s*(?:回答|回覆|輸出|摘要)(?:以|請|限|最多|不超過)[^。；\n]*(?:[。；]|$)/g,' ').trim();
 // Separate answer-format and evidence-review instructions from the subject.
 // Original queries remain available for validation, regional and budget checks.
 const boundary=/(?:[，,。；;？?]\s*|\n\s*)(?=(?:請(?:只|優先|核對|核實|確認|不要)|並(?:確認|核對|核實)|優先|核對|核實|區分|列出|只採用|找(?:原始|官方)(?:條件|資料|來源)|不要|不把|別把|以\s*[a-z0-9.-]+\s*(?:下載|發布|文件)|(?:please\s+)?(?:use|verify|cross-check|distinguish)\b))/i;
 const at=q.search(boundary);if(at<0)return q;
 const head=q.slice(0,at).trim(),tail=q.slice(at);
 // Explicit versions, platforms and numerical constraints are still search terms.
 const constraints=tail.match(/(?:版本|version|patch|\bv)\s*[:：]?\s*\d+(?:\.\d+){1,3}|\b(?:PC|PS[45]|Xbox|Switch|Android|iOS|ARM64|x64)\b|(?:預算|上限|under|below)\s*(?:NT\s*\$|TWD)?\s*\d+\s*(?:元)?\s*(?:以下|以內)?|\d+\s*(?:元)?\s*(?:以下|以內)/gi)||[];
 const sites=[...tail.matchAll(/\bsite:([a-z0-9.-]+)|(?:優先|以)\s*([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map(m=>'site:'+(m[1]||m[2]));
 const preference=/(?:優先|只採用|只使用|只查|use).*(?:官方|政府|official|primary)|官方文件/i.test(tail)?['official']:[];
 return [head,...new Set([...constraints,...sites,...preference])].join(' ').trim()||q;
}
export function compactQuery(value){
 const text=searchSubject(value).replace(/site:\S+/gi,'$&')
  .replace(/我想在自己的電腦使用|我正在用|請查目前官方文件說明|請查官方文件說明|請幫我|幫我搜尋|我想知道|想匯出|以及與桌面匯出的差別/g,' ')
  .replace(/跑需要|需要哪一版|系統是|專案|說明|使用|目前|自己的電腦|請查|請問|想要/g,' ')
  .replace(/[，。；、？?]/g,' ').replace(/\s+/g,' ').trim();
 return /postgres|pgbouncer|docker|python|nodejs|kubernet(?:e)?s|sqlite|godot|blender/i.test(text)?text.replace(/\b(postgressql|conection|dependecies|documetation|kubernets)\b/gi,w=>({postgressql:'PostgreSQL',conection:'connection',dependecies:'dependencies',documetation:'documentation',kubernets:'Kubernetes'}[w.toLowerCase()])):text;
}
export function newsTopics(query){
 const words=String(query).split(/[，。；\n]/)[0].replace(/^(?:請)?(?:幫我|替我)?(?:搜尋|查詢|上網查|找一下|找|查)?\s*/,'').replace(/今天|今日|最新|新聞|頭條|快訊|有什麼|有哪些|的|\bnews\b|\blatest\b/gi,' ').match(/[\p{Script=Han}]{2,}|[A-Za-z0-9][A-Za-z0-9._-]{1,}/gu)||[];
 const broad=/^(台灣|臺灣|國際|世界|科技|財經|taiwan|world|international|technology)$/i;
 const specific=words.filter(w=>!broad.test(w));
 return specific.length?specific:words;
}
export function newsRelevant(result,query){
 const terms=newsTopics(query),hay=[result.title,result.body,result.content].join(' ').toLowerCase();
 return !terms.length||terms.every(t=>{
  if(/^[a-z0-9._-]{1,3}$/i.test(t))return new RegExp('(^|[^a-z0-9])'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i').test(hay);
  return hay.includes(t.toLowerCase());
 });
}
