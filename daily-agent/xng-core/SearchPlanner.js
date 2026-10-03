import {PRODUCT_SITES, routedQueries,gameSources} from './SourceRegistry.js';
import {compactQuery,isStoreSaleQuery,storeSaleSubject} from './QueryText.js';
import {isGameQuery,gamePlan} from './GameSearch.js';
const PRICE=/價格|售價|價錢|多少錢|比價|\bprice\b|\bbuy\b/i;
const NEWS=/新聞|最新消息|最新動態|頭條|快訊|\bnews\b/i;
const LEGAL=/法規|法律|條例|管理辦法|施行細則|法令|法規資料庫|\blaw\b|\bregulation\b/i;
const OFFICIAL=/官方|官網|official|版本|release|下載|download/i;
const GAME=/攻略|wiki\.gg|fextralife|remnant|boss|武器|裝備|配裝|遊戲|game/i;
const TECH=/github|stack\s*overflow|api|sdk|程式|版本|release|zbrush|godot|blender|windows|microsoft|software/i;
const TAIWAN=/台灣|臺灣|台北|臺北|台中|臺中|高雄|新北|桃園|pchome|momo|原價屋|autobuy/i;

function clean(q){ return String(q||'').replace(/\s+/g,' ').trim(); }
function knownSite(q){ return PRODUCT_SITES.find(([re])=>re.test(q))?.[1]||''; }
function pushUnique(out,q){ q=clean(q); if(q && !out.some(x=>x.toLowerCase()===q.toLowerCase())) out.push(q); }

export function inferIntent(query){
  const q=clean(query);
  if(isStoreSaleQuery(q)) return 'store-sale';
  if(PRICE.test(q)) return 'price';
  if(NEWS.test(q)) return 'news';
  if(isGameQuery(q)) return 'game';
  if(LEGAL.test(q)) return 'legal';
  if(OFFICIAL.test(q)) return 'official';
  if(TECH.test(q)) return 'tech';
  if(NEWS.test(q)) return 'news';
  return 'general';
}

export function planQueries(query,{max=3}={}){
  const original=clean(query),q=compactQuery(original), intent=inferIntent(original), out=[];
  if(intent==='store-sale'){
    let subject=storeSaleSubject(q);const year=new Date().getFullYear();
    // This installation's Chinese search locale is zh-TW. Preserve explicit
    // regional constraints; otherwise prefer local sale coverage to USD lists.
    const chinese=/[\p{Script=Han}]/u.test(q);
    if(chinese&&!/台灣|臺灣|中國|中国|香港|澳門|日本|美國|美国|英國|英国|歐洲|欧洲|\b(?:USD|JPY|HKD|CNY|US|UK|Japan)\b/i.test(q))subject+=' 台灣';
    const dated=/\b20\d{2}\b/.test(subject)?subject:subject+' '+year;
    pushUnique(out,dated+' 特賣 推薦');
    pushUnique(out,dated+' sale best deals');
    if(chinese)pushUnique(out,dated+' 特價');
    if(/\bsteam\b/i.test(q))pushUnique(out,subject+' discounts site:store.steampowered.com');
    return {intent,queries:out.slice(0,Math.max(1,Math.min(8,max)))};
  }
  pushUnique(out,q);
  const routed=routedQueries(q);
  if(routed.length){for(const variant of routed)pushUnique(out,variant);return {intent,queries:out.slice(0,Math.max(1,Math.min(8,max)))};}
  if(intent==='news'){
    const base=q.replace(/請|幫我|搜尋|查詢|今天|今日|最新|有什麼|有哪些|的|新聞|news|latest/gi,' ').replace(/\s+/g,' ').trim()||'AI';
    pushUnique(out,base+' 最新消息');
    pushUnique(out,base+' 官方 新聞稿');
  } else if(intent==='price'){
    if(TAIWAN.test(q)){
      pushUnique(out,q+' PChome site:24h.pchome.com.tw');
      pushUnique(out,q+(/rtx|geforce|radeon|顯示卡|gpu/i.test(q)?' 原價屋 site:coolpc.com.tw':' site:momoshop.com.tw'));
    } else {
      pushUnique(out,q+' PChome momo 原價屋 AutoBuy');
      pushUnique(out,q+' Taiwan price');
    }
  } else if(intent==='legal'){
    pushUnique(out,q+' site:law.moj.gov.tw');
    pushUnique(out,q+' site:glrs.moi.gov.tw');
  } else if(intent==='game'){
    const source=gameSources(q),guide=q.replace(/最新版本|官方更新|最新|目前|版本|\blatest\b|\bcurrent\b|\bPC\b|\bSteam\b/gi,' ').replace(/\b\d+\.\d+(?:\.\d+)*\b/g,' ').replace(/\s+/g,' ').trim();
    // Translate generic mechanics only; retain the user's game name, item names
    // and constraints. Patch discovery is a separate lookup, not a guide term.
    const english=guide.replace(/品質模組/gi,' quality module ').replace(/品質/gi,' quality ').replace(/解鎖/gi,' unlock ').replace(/初期|新手/gi,' beginner ').replace(/攻略/gi,' guide ').replace(/\s+/g,' ').trim();
    if(source) pushUnique(out,english+' site:'+source.wiki);
    else pushUnique(out,english+' wiki walkthrough');
    pushUnique(out,guide+' walkthrough mechanics wiki');
    if(!source)pushUnique(out,english+' site:wiki.gg');
  } else if(intent==='official'){
    const site=knownSite(q);
    const subject=q.replace(/官方|官網|\bofficial\b|\bdocs\b|\bdocumentation\b/gi,' ').replace(/\s+/g,' ').trim();
    if(site) pushUnique(out,subject+' site:'+site);
    else pushUnique(out,subject);
    pushUnique(out,subject+(/版本|version|release|update|latest|最新/i.test(q)?' release notes':' reference'));
  } else if(intent==='tech'){
    pushUnique(out,q+' official docs');
    pushUnique(out,q+' GitHub');
  } else {
    pushUnique(out,q+' official');
  }
  if(max>3){
    const site=knownSite(q);
    if(site)pushUnique(out,q+' limitations requirements site:'+site);
    if(intent==='tech'||/故障|錯誤|崩潰|問題|error|crash|troubleshoot/i.test(q))pushUnique(out,q+' known issues troubleshooting');
    pushUnique(out,q+' evidence comparison');
  }
  return {intent,queries:out.slice(0,Math.max(1,Math.min(8,max))),...(intent==='game'?{game:gamePlan(q)}:{})};
}

export function freshnessRange(query){
  const q=clean(query);
  // Live product/category pages are current state, not "published today" content.
  // Applying a day filter hides PChome/CoolPC/momo evergreen product pages.
  if(PRICE.test(q)||isStoreSaleQuery(q)) return null;
  if(isGameQuery(q)&&!NEWS.test(q))return null;
  if(TECH.test(q)&&/setup|install|export|how\s*to|教學|安裝|設定|匯出/i.test(q))return null;
  if(/剛剛|剛才|今天|今日|即時|現在|目前|today|breaking|right now/i.test(q)) return 'day';
  // Software/version lookups must not hide stable official release pages just because
  // the user says "latest"; freshness is validated from the page itself.
  if(/官方|官網|official|版本|version|release|release notes|下載|download/i.test(q)) return null;
  if(/這週|本週|最近|最新|latest|this week/i.test(q)) return 'week';
  if(/這月|本月|this month/i.test(q)) return 'month';
  return null;
}

export function preferredLanguage(query){
  return /[\p{Script=Han}]/u.test(String(query||'')) ? 'zh-TW' : 'en-US';
}
