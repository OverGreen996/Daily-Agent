import {isStoreSaleQuery,storeSaleSubject} from './QueryText.js';

const HOST='https://store.steampowered.com';
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const idOf=n=>Number.isSafeInteger(Number(n))&&Number(n)>0&&Number(n)<1e10?Number(n):null;
const titleKey=s=>clean(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
export function steamLinks(text){
 const rows=[],seen=new Set();
 for(const m of String(text||'').matchAll(/https?:\/\/store\.steampowered\.com\/(app|widget|sub|bundle)\/(\d+)/gi)){
  const type=m[1].toLowerCase()==='widget'?'app':m[1].toLowerCase(),id=idOf(m[2]),key=type+':'+id;
  if(id&&!seen.has(key)){seen.add(key);rows.push({type,id,url:`${HOST}/${type}/${id}/`});}
  if(rows.length>=40)break;
 }
 return rows;
}
export function steamRequest(query){
 const q=String(query),year=q.match(/\b(20\d{2})\b/)?.[1];
 const enabled=/\bsteam\b|store\.steampowered\.com/i.test(q)&&(/價格|售價|多少錢|\bprice\b/i.test(q)||isStoreSaleQuery(q));
 if(!enabled)return null;
 const foreign=/日本|美國|美国|英國|英国|中國|中国|香港|澳門|歐洲|欧洲|加拿大|澳洲|韓國|韩国|\b(?:USD|JPY|HKD|CNY|EUR|CAD|AUD|KRW|Japan|USA)\b|\b(?:US|UK)\s+(?:store|region|price)\b|[?&]cc=(?!tw(?:[&\s]|$))[a-z]{2}/i.test(q);
 const budget=q.match(/(?:預算|预算|上限|under|below)\s*(?:NT\s*\$|TWD|台幣)?\s*(\d{1,6})/i)?.[1]||q.match(/(?:NT\s*\$|TWD)?\s*(\d{1,6})\s*(?:元)?\s*(?:以內|以下|內|以内|以下)/i)?.[1];
 // A conversational tail is a validation request, not part of the game title.
 // Keep all regional/budget/DLC constraints from q; only isolate the lookup term.
 // ASCII commas inside titles (e.g. Warhammer 40,000) must survive.
 const head=q.split(/[，。；？\n]|[,;]\s*(?=(?:please\b|also\b|and also\b|並|請|另外|同時))/i)[0];
 const subject=/\bsteam\b|store\.steampowered\.com/i.test(head)&&(/價格|售價|多少錢|\bprice\b/i.test(head)||isStoreSaleQuery(head))?head:q;
 const term=storeSaleSubject(subject).replace(/site:\S+|https?:\/\/\S+|\bsteam\b|台灣|臺灣|台幣|TWD|NT\s*\$|價格|售價|多少錢|\bprice\b|\b20\d{2}\b/gi,' ')
  .replace(/(?:預算|预算|上限|under|below)\s*\d+|\d+\s*(?:元)?\s*(?:以內|以下|內|以内)|合作|多人|單人|單機|中文|繁中|繁體中文|動作|解謎|回合制|\b(?:RPG|DLC|expansion|co-?op|multiplayer)\b|資料片|擴充包|扩充包/gi,' ').replace(/\s+/g,' ').trim();
 return {region:'TW',currency:'TWD',unsupported_region:foreign,historical:!!year&&Number(year)<new Date().getFullYear(),
  budget:budget?Number(budget):null,cooperative:/合作|co-?op/i.test(q),include_dlc:/DLC|expansion|資料片|擴充|扩充|sunbreak|自由幻局/i.test(q),
  price_only:/價格|售價|多少錢|\bprice\b/i.test(q)&&!/推薦|值得|值得買|worth|recommend|best/i.test(q),
  packages:/組合包|组合包|bundle|deluxe|豪華|豪华|完整版|ultimate/i.test(q),term:term.replace(/組合包|组合包|bundle|deluxe|豪華|豪华|完整版|ultimate/gi,' ').trim()};
}
export function steamPrice(p,{free=false}={}){
 if(!p)return free?{verified:true,currency:'TWD',initial_minor:0,final_minor:0,initial:0,final:0,discount_percent:0,formatted:'免費',on_sale:false}:null;
 const {currency,initial,final,discount_percent:discount}=p;
 if(currency!=='TWD'||!Number.isSafeInteger(initial)||!Number.isSafeInteger(final)||final<0||initial<final||!Number.isInteger(discount)||discount<0||discount>100)return null;
 // Steam rounds some discounts to a whole Taiwan dollar. Allow that rounding,
 // not an arbitrary percent/price disagreement or a foreign currency conversion.
 if(initial>0&&Math.abs(final-Math.round(initial*(100-discount)/100))>100)return null;
 if(initial===0&&discount!==0)return null;
 return {verified:true,currency,initial_minor:initial,final_minor:final,initial:initial/100,final:final/100,discount_percent:discount,
  formatted:'NT$ '+(final/100).toLocaleString('en-US',{maximumFractionDigits:2}),on_sale:discount>0&&final<initial};
}
export class SteamStore {
 constructor({fetcher=fetch,now=()=>Date.now()}={}){Object.assign(this,{fetcher,now});this.cache=new Map();this.cooldown=0;this.controllers=new Set();this.requests=0;}
 cancel(){for(const c of this.controllers)c.abort();}
 status(){return {enabled:true,paid:false,region:'TW',cache_entries:this.cache.size,requests:this.requests,cooldown_until:this.cooldown};}
 async json(path,params,job){
  if(job.signal.aborted)throw new DOMException('Steam lookup cancelled','AbortError');
  const u=new URL(path,HOST);u.search=new URLSearchParams({...params,cc:'tw',l:'tchinese'});
  const key=u.href,cached=this.cache.get(key);
  if(cached?.expires>this.now())return structuredClone(cached.value);
  if(this.cooldown>this.now())throw Error('Steam source cooling down');
  if(job.requests>=job.maxRequests)throw Error('Steam request budget exhausted');
  job.requests++;
  this.requests++;
  const r=await this.fetcher(u.href,{redirect:'error',headers:{accept:'application/json'},signal:job.signal});
  if([429,403].includes(r.status))this.cooldown=this.now()+90000;
  if(!r.ok)throw Error('Steam HTTP '+r.status);
  let text='';
  if(r.body?.getReader){const reader=r.body.getReader();let bytes=0;const chunks=[];
   try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1e6)throw Error('Steam response too large');chunks.push(value);}text=new TextDecoder().decode(Buffer.concat(chunks));}
   catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  }else {text=await r.text();if(Buffer.byteLength(text)>1e6)throw Error('Steam response too large');}
  const data=JSON.parse(text),value={data,url:u.href,checked_at:new Date(this.now()).toISOString()};
  const failure=Object.values(data||{}).some(v=>v?.success===false);
  if(!failure){this.cache.set(key,{value,expires:this.now()+120000});while(this.cache.size>192)this.cache.delete(this.cache.keys().next().value);}
  return structuredClone(value);
 }
 async enrich(raw,query,{mode='normal',signal}={}){
  const request=steamRequest(query);if(!request)return null;
  const empty={provider:'Steam public storefront',paid:false,region:'TW',currency:'TWD',status:'unavailable',products:[],constraints:request,
   historical_low_verified:false,recommendation_verified:false,limitations:[]};
  if(request.unsupported_region)return {...empty,status:'unsupported-region',limitations:['僅自動核對台灣區，不能把台灣報價當成其他地區價格。']};
  if(request.historical)return {...empty,status:'historical-request',limitations:['即時商店價格不能核實過去特賣的售價。']};
  const controller=new AbortController();this.controllers.add(controller);
  const job={signal:AbortSignal.any([controller.signal,AbortSignal.timeout(mode==='deep'?6500:mode==='fast'?2500:4500),...(signal?[signal]:[])]),requests:0,maxRequests:mode==='deep'?26:mode==='fast'?6:20};
  const candidates=new Map(),unverified=[],errors=[],products=[];let featured=[];
  const add=(link,source)=>{if(!link.id)return;if(link.type!=='app'){unverified.push({...link,discovered_from:source,status:'membership-and-price-not-verified'});return;}if(!candidates.has(link.id))candidates.set(link.id,{id:link.id,sources:[]});const item=candidates.get(link.id);if(!item.sources.includes(source))item.sources.push(source);};
  for(const r of raw.results||[])for(const link of [...steamLinks(r.url+' '+(r.body||r.content||'')),...(r.steam_links||[])])add(link,r.url);
  const direct=steamLinks(query),targeted=!!request.term||direct.length>0;
  for(const link of direct)add(link,'user-query');
  const attempt=async fn=>{try{return await fn();}catch(e){errors.push(String(e.message).slice(0,100));return null;}};
  try{
   if(request.term){
    const found=await attempt(()=>this.json('/api/storesearch/',{term:request.term},job));
    candidates.clear();for(const link of direct)add(link,'user-query');
    const foundItems=(found?.data?.items||[]).slice(0,10),exact=request.price_only?foundItems.filter(i=>typeof i.name==='string'&&titleKey(i.name)===titleKey(request.term)):[];
    for(const item of exact.length?exact:foundItems)add({type:['sub','bundle'].includes(item.type)?item.type:'app',id:idOf(item.id)},found.url);
   }else if(!direct.length){
    const found=await attempt(()=>this.json('/api/featuredcategories',{},job));
    featured=(found?.data?.specials?.items||[]).filter(x=>x.type===0&&x.currency==='TWD'&&x.discounted);
    for(const item of featured)add({type:'app',id:idOf(item.id)},found.url);
   }else {candidates.clear();for(const link of direct)add(link,'user-query');}
   const cap=mode==='deep'?12:mode==='fast'?3:8,selected=[...candidates.values()].slice(0,cap);let next=0;
   // Two lightweight HTTP requests at a time; no browser, model or credentials.
   await Promise.all([0,1].map(async()=>{while(next<selected.length&&!job.signal.aborted){const c=selected[next++];
    const response=await attempt(()=>this.json('/api/appdetails',{appids:c.id},job)),data=response?.data?.[c.id]?.data;
    if(!response?.data?.[c.id]?.success||!data||Number(data.steam_appid)!==c.id||typeof data.name!=='string'){errors.push('App '+c.id+' was not verified');continue;}
    const price=steamPrice(data.price_overview,{free:data.is_free===true}),type=data.type;
    if(/\bdemo\b|試玩版|體驗版/i.test(data.name)&&!/\bdemo\b|試玩|體驗版/i.test(query))continue;
    if(!['game','dlc'].includes(type)||(!request.include_dlc&&type==='dlc'&&!direct.some(x=>x.type==='app'&&x.id===c.id))||data.release_date?.coming_soon||!price){continue;}
    const co_op=(data.categories||[]).some(x=>[9,38,39].includes(x.id));
    if(request.cooperative&&!co_op||request.budget!==null&&price.final>request.budget)continue;
    if(!targeted&&!price.on_sale)continue;
    const f=featured.find(x=>x.id===c.id),expiry=Number(f?.discount_expiration)*1000,expiration=f&&f.final_price===price.final_minor&&f.original_price===price.initial_minor&&Number.isFinite(expiry)&&expiry>this.now()&&expiry<this.now()+366*86400000?new Date(expiry).toISOString():null;
    products.push({app_id:c.id,name:clean(data.name).slice(0,300),product_type:type,price:{...price,checked_at:response.checked_at,source_url:response.url},url:`${HOST}/app/${c.id}/?cc=tw&l=tchinese`,
     description:clean(data.short_description).slice(0,450),genres:(data.genres||[]).map(x=>clean(x.description).slice(0,100)).slice(0,8),cooperative:co_op,cooperative_scope:'Steam category; campaign and mode availability not verified',
     requires_base_game:type==='dlc'?{app_id:idOf(data.fullgame?.appid),name:clean(data.fullgame?.name)||null}:null,
     dlc_included:type==='game'?'not-assumed':'requires-base-game',discount_ends_at:expiration,expiration_verified:!!expiration,
     discovered_from:c.sources.slice(0,3),purchase_options:[],_packages:(data.package_groups||[]).flatMap(g=>g.subs||[]).map(x=>idOf(x.packageid)).filter(Boolean).slice(0,3)});
   }}));
   // Review summaries are separate from official price verification. They are
   // community opinions, not proof that a game suits a particular user.
   for(const p of products.slice(0,mode==='deep'?8:mode==='fast'?0:6)){
    const reviews=await attempt(()=>this.json('/appreviews/'+p.app_id,{json:'1',language:'all',purchase_type:'all',num_per_page:'0',filter:'all'},job)),s=reviews?.data?.query_summary;
    if(reviews?.data?.success===1&&Number.isSafeInteger(s?.total_reviews)&&s.total_reviews>=0&&Number.isSafeInteger(s.total_positive)&&s.total_positive>=0&&s.total_positive<=s.total_reviews)
     p.reviews={total:s.total_reviews,positive:s.total_positive,positive_ratio:s.total_reviews?s.total_positive/s.total_reviews:null,label:clean(s.review_score_desc),source_type:'community',source_url:reviews.url,checked_at:reviews.checked_at};
   }
   products.sort((a,b)=>this.rank(b)-this.rank(a));
   const packageTarget=products.find(p=>request.packages||request.include_dlc&&p.product_type==='dlc');
   if(packageTarget&&mode!=='fast')for(const id of packageTarget._packages){
    const response=await attempt(()=>this.json('/api/packagedetails',{packageids:id},job)),d=response?.data?.[id]?.data,price=steamPrice(d?.price);
    if(!response?.data?.[id]?.success||!price||!Array.isArray(d.apps)||!d.apps.length||!d.apps.every(a=>idOf(a.id)&&typeof a.name==='string'))continue;
    packageTarget.purchase_options.push({package_id:id,product_type:'package',name:clean(d.name).slice(0,300),url:`${HOST}/sub/${id}/?cc=tw`,price:{...price,source_url:response.url,checked_at:response.checked_at},
     included_apps:d.apps.slice(0,8).map(a=>({app_id:idOf(a.id),name:clean(a.name).slice(0,150)})),contents_truncated:d.apps.length>8,membership_verified:true,
     includes_base_game:d.apps.some(a=>Number(a.id)===(packageTarget.requires_base_game?.app_id||packageTarget.app_id))});
   }
   if(!request.cooperative&&(request.packages||direct.some(x=>x.type==='sub')))for(const link of unverified.filter(x=>x.type==='sub').slice(0,3)){
    const response=await attempt(()=>this.json('/api/packagedetails',{packageids:link.id},job)),d=response?.data?.[link.id]?.data,price=steamPrice(d?.price);
    if(!response?.data?.[link.id]?.success||!price||!Array.isArray(d.apps)||!d.apps.length||!d.apps.every(a=>idOf(a.id)&&typeof a.name==='string')||request.budget!==null&&price.final>request.budget)continue;
    products.push({package_id:link.id,app_id:null,name:clean(d.name).slice(0,300),product_type:'package',url:`${HOST}/sub/${link.id}/?cc=tw`,
     price:{...price,source_url:response.url,checked_at:response.checked_at},included_apps:d.apps.slice(0,8).map(a=>({app_id:idOf(a.id),name:clean(a.name).slice(0,150)})),contents_truncated:d.apps.length>8,membership_verified:true,
     cooperative:null,description:'以官方package內容為準；不是單獨本體或個人化bundle報價。',genres:[],purchase_options:[],discovered_from:[link.discovered_from]});
    link.status='verified-package';
   }
   for(const p of products)delete p._packages;
   return {...empty,status:products.length?(errors.length?'partial':'verified'):'no-verified-offers',products,unverified_links:unverified.slice(0,6),
    checked_at:new Date(this.now()).toISOString(),requests:job.requests,errors:[...new Set(errors)].slice(0,4),
    limitations:['官方即時售價已按商品ID核對；不是歷史最低價驗證。','主商品、DLC與package分開列示；個人化Steam bundle與未列明的內容不假設已包含。',...(request.term?[]:['此清單為本次取得的候選，並非所有Steam特價遊戲。'])]};
  }finally{this.controllers.delete(controller);}
 }
 rank(p){const s=p.reviews,quality=s?((s.positive+20)/(s.total+40))*.55+Math.min(1,Math.log10(1+s.total)/5)*.15:.25;return quality+p.price.discount_percent/100*.15+1/(1+p.price.final/300)*.1;}
}
export function steamEvidence(store){
 return (store?.products||[]).map(p=>({title:p.name+' — Steam 台灣區即時價格',url:p.url,reliability:'primary',coverage:'structured-api',retrieved_at:p.price.checked_at,steam_app_id:p.app_id,steam_product:true,
  body:`${p.name}\n商品類型：${p.product_type}。台灣區官方主商品原價 NT$ ${p.price.initial.toLocaleString('en-US',{maximumFractionDigits:2})}，目前價格 ${p.price.formatted}，降價 ${p.price.discount_percent}%（付原價 ${100-p.price.discount_percent}%，${(100-p.price.discount_percent)/10} 折）；${p.price.on_sale?'目前有折扣':'目前沒有折扣'}。核對時間 ${p.price.checked_at}。\n${p.description}\n${p.genres.join('、')}；${p.cooperative?'官方標示合作；不推定整個劇情可合作':'未核實合作模式'}。\n${p.requires_base_game?'此為DLC，需另有本體 '+(p.requires_base_game.name||p.requires_base_game.app_id)+'；DLC 主商品價格不包含所需本體。':'不假設主商品價格包含所有DLC。'}\n${p.reviews?.total?'Steam使用者好評 '+(100*p.reviews.positive_ratio).toFixed(1)+'%，共 '+p.reviews.total+' 則；此為社群評價。':''}\n${p.included_apps?'官方package內容：'+p.included_apps.map(a=>a.name).join('、'):''}\n${p.purchase_options.map(o=>'購買選項（package，與主商品分開）：'+o.name+'：'+o.price.formatted+'，官方列明內容 '+o.included_apps.map(a=>a.name).join('、')+'；'+(o.includes_base_game?'包含本體':p.requires_base_game?.app_id?'不包含所需本體':'是否包含本體未核實')).join('\n')}\n價格來源：${p.price.source_url}`.slice(0,3500)}));
}
