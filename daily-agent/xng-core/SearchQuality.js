import {OFFICIAL_DOMAINS, publisherKey,curatedGameWiki,sourceOverride} from './SourceRegistry.js';
import {compactQuery,isStoreSaleQuery,storeSaleSubject,usableStoreSaleEvidence} from './QueryText.js';
import {isGameQuery,gamePlan} from './GameSearch.js';
import {gameIdentityMatches,observedGameVersions} from './GameVersionCheck.js';
const NEWS_RE = /新聞|最新消息|最新動態|頭條|快訊|\bnews\b|\blatest\s+news\b/i;
const TODAY_RE = /今天|今日|\btoday\b/i;
const PRICE_RE = /價格|售價|價錢|多少錢|比價|\bprice\b|\bbuy\b/i;
const OFFICIAL_RE = /官方|官網|\bofficial\b/i;
const GAME_RE = /攻略|wiki\.gg|fextralife|remnant|boss|武器|裝備|配裝|遊戲|\bgame\b/i;
const TECH_RE = /github|stack\s*overflow|api|sdk|程式|版本|release|zbrush|godot|blender|windows|microsoft|software/i;

const DIRECT_RETAIL = new Set([
  "24h.pchome.com.tw", "pchome.com.tw", "coolpc.com.tw", "www.coolpc.com.tw",
  "momo.com.tw", "www.momoshop.com.tw", "autobuy.tw"
]);
const PRICE_AGGREGATORS = new Set(["feebee.com.tw", "biggo.com.tw"]);
const COMMUNITY = ["reddit.com", "gamer.com.tw", "mobile01.com", "fextralife.com", "zbrushcentral.com", "forum.godotengine.org"];
const TRUSTED = [
  "wikipedia.org", "wiki.gg", "github.com", "stackoverflow.com", "microsoft.com",
  "developer.mozilla.org", "docs.python.org", "nodejs.org", "kubernetes.io",
  "docs.docker.com", "developers.cloudflare.com", "developer.android.com",
  "cna.com.tw", "technews.tw", "reuters.com", "apnews.com", "bbc.com"
  , "fandom.com", "bg3.wiki", "uesp.net", "minecraft.wiki", "stardewvalleywiki.com"
];
const GLOBAL_PRIMARY = OFFICIAL_DOMAINS;
const STOP_WORDS=new Set(["official","latest","stable","version","release","download","software","docs","documentation","the","of","and","for","with","to","in","on","at","as","is","be","an","by","or","vs","it","最新版","版本","官方","下載","軟體"]);

const PRIMARY_RULES = [
  { re: /zbrush|maxon/i, domains: ["maxon.net", "support.maxon.net"] },
  { re: /nvidia|geforce|rtx/i, domains: ["nvidia.com"] },
  { re: /windows|microsoft|\.net|dotnet/i, domains: ["microsoft.com"] },
  { re: /godot/i, domains: ["godotengine.org"] },
  { re: /remnant\s*2|遺跡\s*2/i, domains: ["remnant2.wiki.gg", "gunfiregames.com"] }
];
export const isNewsQuery = (q) => NEWS_RE.test(q || "");
export const isTodayQuery = (q) => TODAY_RE.test(q || "");

export function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}
export function isDirectRetailUrl(value) {
  const host=hostOf(value);
  return [...DIRECT_RETAIL].some(domain=>hostMatches(host,domain));
}
export function sourceReliability(value,query){
  if(/(?:^|\/\/)(?:discuss|forum[^.]*|forums|(?:tech)?community)\./i.test(value)||/\/(?:forums?|discussions?|message-id|mailing-list)\//i.test(value)||/github\.com\/[^/]+\/[^/]+\/(?:issues|discussions)\//i.test(value))return 'community';
  return qualityForHost(hostOf(value),query);
}
export function merchantKey(value) {
  const host=hostOf(value);
  if(hostMatches(host,"pchome.com.tw"))return "pchome";
  if(hostMatches(host,"coolpc.com.tw"))return "coolpc";
  if(hostMatches(host,"momoshop.com.tw")||hostMatches(host,"momo.com.tw"))return "momo";
  if(hostMatches(host,"autobuy.tw"))return "autobuy";
  return host;
}
function hostMatches(host, domain) {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith("." + d);
}
function explicitDomain(query) {
  const site = query.match(/site:([\w.-]+)/i)?.[1];
  if (site) return site.toLowerCase().replace(/^www\./, "");
  const raw = query.match(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|gov|edu|gg|tw|io|dev)\b/i)?.[0];
  return raw?.toLowerCase().replace(/^www\./, "") || "";
}
function primaryDomains(query) {
  return PRIMARY_RULES.filter(r => r.re.test(query)).flatMap(r => r.domains);
}
function likelyOfficialHost(host,query){
  if(GLOBAL_PRIMARY.some(d=>hostMatches(host,d)))return true;
  if(!OFFICIAL_RE.test(query))return false;
  // Product-name substrings in an unknown host do not establish ownership.
  return false;
}
function qualityForHost(host, query) {
  const override=sourceOverride(host);
  if(['primary','trusted','community','standard'].includes(override.reliability))return override.reliability;
  if(override.source_type==='official')return 'primary';
  const explicit = explicitDomain(query);
  if (/\.gov(?:\.tw)?$|\.edu(?:\.tw)?$/.test(host)) return "primary";
  if (PRICE_RE.test(query) && [...DIRECT_RETAIL].some(d => hostMatches(host,d))) return "primary";
  if (PRICE_RE.test(query) && [...PRICE_AGGREGATORS].some(d => hostMatches(host,d))) return "trusted";
  // Known forums/community hosts never become "official" merely because their
  // hostname contains the product name or is a subdomain of an official site.
  if (COMMUNITY.some(d => hostMatches(host, d))) return "community";
  if (primaryDomains(query).some(d => hostMatches(host, d))) return "primary";
  if(curatedGameWiki(host,query))return 'trusted';
  if(host==='wiki.warframe.com')return 'trusted';
  if (likelyOfficialHost(host,query)) return "primary";
  if (TRUSTED.some(d => hostMatches(host, d))) return "trusted";
  return "standard";
}
function textUnits(value) {
  const s=String(value||"").toLowerCase().replace(/\s+-\s+[^-]{2,100}$/u," ").replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const units=new Set(s.match(/[a-z0-9][a-z0-9._-]{1,}/g)||[]);
  const han=(s.match(/[\p{Script=Han}]+/gu)||[]).join("");
  for(let i=0;i<han.length-1;i++) units.add(han.slice(i,i+2));
  return units;
}
export function titleSimilarity(a,b) {
  const x=textUnits(a),y=textUnits(b);
  if(!x.size||!y.size)return 0;
  let common=0; for(const v of x)if(y.has(v))common++;
  return (2*common)/(x.size+y.size);
}
function canonicalUrl(value) {
  try {
    const u = new URL(value);
    u.hash = "";
    u.pathname=u.pathname.replace(/\/index\.md$/i,'/');
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|gclid|fbclid|ref$|source$)/i.test(key)) u.searchParams.delete(key);
    return u.href.replace(/\/$/, "");
  } catch { return value; }
}

export function engineRoute(query) {
  if (isNewsQuery(query) || isGameQuery(query) || isStoreSaleQuery(query) || PRICE_RE.test(query) || OFFICIAL_RE.test(query))
    return "google cse,yahoo,yep,bing";
  if (TECH_RE.test(query))
    return "google cse,yahoo,yep,bing,wikipedia,github";
  return "google cse,yahoo,yep,bing,wikipedia";
}

function criticalTokens(query){
  const tokens=[...new Set((compactQuery(query).match(/\b\d+(?:\.\d+)+\b|\b\d{3,}\b|\b[A-Za-z]+\d+[A-Za-z0-9-]*\b/g)||[]).map(s=>s.toLowerCase()))];
  return isGameQuery(query)&&/能|可以|支援|適用|加入|available|compatible|supported|added|introduced/i.test(query)?tokens.filter(t=>!/^\d+(?:\.\d+)+$/.test(t)):tokens;
}
function entityTokens(query){
  return [...new Set((String(query).toLowerCase().match(/\b[a-z][a-z0-9._-]{1,}\b/g)||[])
    .filter(w=>!STOP_WORDS.has(w)&&!["latest","official","software","release","notes","download","docs","documentation"].includes(w)))];
}
const HAN_STOP=new Set(["台灣","臺灣","官方","官網","最新","今天","今日","新聞","價格","售價","查詢","搜尋"]);
function subjectTerms(query){
  const han=(String(query).match(/[\p{Script=Han}]{2,}/gu)||[]).filter(x=>!HAN_STOP.has(x));
  return [...new Set([...entityTokens(query),...han.map(x=>x.toLowerCase())])];
}
export function focusTerms(query){
  if(isStoreSaleQuery(query))return subjectTerms(storeSaleSubject(query).replace(/site:\S+/gi,' '));
  const q=compactQuery(query).replace(/site:\S+/gi,' ').replace(/顯示卡/g,' GPU ').replace(/容器/g,' containers ').replace(/最新穩定版本|最新版本|官方更新|最新|最近|是多少|是什麼|多少|請|想|可以|需要|以及|與|的|哪一版|哪一|怎麼|如何|什麼|現在|目前|限制|差別|設定|匯出|官方|文件|說明/g,' ');
  return subjectTerms(q).filter(t=>!['setup','install','export','migration','requirements','free','pricing','neurons','taiwan','current','how','wiki.gg','notes','guide','walkthrough','best','pc','steam'].includes(t));
}
export function topicCoverage(result,query){
  const terms=focusTerms(query), hay=[result.title,result.url,result.body??result.content].join(' ').toLowerCase();
  const missing=terms.filter(t=>/^[a-z]{2,3}$/.test(t)?!new RegExp('\\b'+t+'\\b','i').test(hay):!hay.includes(t));
  return {terms,missing,ratio:terms.length?(terms.length-missing.length)/terms.length:1};
}
function scoreResult(r, query) {
  const host = hostOf(r.url);
  let score = Math.max(0, Number(r.score) || 0) * 10;
  if(isStoreSaleQuery(query)){
    const stamp=Date.parse(r.date||r.publishedDate),hay=String(r.title)+' '+String(r.content);
    if(/sale|discount|deals|特賣|特價|折扣/i.test(hay))score+=90;
    const years=hay.match(/\b20\d{2}\b/g)||[];
    if(years.length&&Math.max(...years.map(Number))<new Date().getFullYear())score-=200;
    if(Number.isFinite(stamp)&&Date.now()-stamp>30*86400000)score-=100;
  }
  score-=Math.max(0,Number(sourceOverride(r.url).penalty)||0)*400;
  let quality = sourceReliability(r.url, query);
  if (/godot/i.test(query) && hostMatches(host,"github.com") && /^https?:\/\/github\.com\/godotengine\//i.test(r.url||""))
    quality = "primary";
  const explicit = explicitDomain(query);
  const routed = explicitDomain(r.query_variant || "");
  if (explicit && hostMatches(host, explicit)) score += 120;
  if (routed && hostMatches(host, routed)) score += 100;
  if (quality === "primary") score += 80;
  else if (quality === "trusted") score += 30;
  else if (quality === "community" && !/論壇|心得|reddit|討論/i.test(query)) score -= 15;

  if (PRICE_RE.test(query)) {
    if ([...DIRECT_RETAIL].some(d => hostMatches(host, d))) score += 90;
    if ([...PRICE_AGGREGATORS].some(d => hostMatches(host, d))) score += 20;
  }
  if (GAME_RE.test(query) && hostMatches(host, "wiki.gg")) score += 80;
  if (OFFICIAL_RE.test(query) && quality === "primary") score += 40;
  const focus=focusTerms(query), headline=((r.title||'')+' '+(r.url||'')).toLowerCase();
  score+=focus.filter(t=>headline.includes(t)).length*30;
  const relevance=topicCoverage(r,query);
  if(focus.length>=2)score-=relevance.missing.length*35;
  if(r.reference_entry)score+=160;
  if(/docs|documentation|文件|教學|export|setup/i.test(query)&&/\/article\/|release|beta|snapshot/i.test(r.url+' '+r.title))score-=100;
  if(/latest|最新|最新版/i.test(query)&&!/\b\d+\.\d+\b/.test(query)){
    const years=String(r.title||'').match(/\b20\d{2}\b/g)||[];
    if(years.length&&Math.max(...years.map(Number))<new Date().getFullYear()-1)score-=150;
    if(/archive|pre-release|\bbeta\b|\balpha\b/i.test(r.url+' '+r.title))score-=80;
  }
  if(/價格|\bprice\b/i.test(query)&&/上市|首賣|launch|宣布|發表/i.test(r.title||''))score-=110;
  if(/LawContentSearch\.aspx/i.test(r.url||''))score-=100;

  const critical=criticalTokens(query);
  const hay = ((r.title || "") + " " + (r.url || "") + " " + (r.content || "")).toLowerCase();
  if(isGameQuery(query)&&curatedGameWiki(host,query))score+=140;
  const criticalHits=critical.filter(t=>hay.includes(t)).length;
  score += criticalHits*25;
  if(critical.length && (PRICE_RE.test(query)||OFFICIAL_RE.test(query)) && criticalHits<critical.length)score-=90;

  const words = query.toLowerCase().match(/[\p{L}\p{N}_.-]{2,}/gu) || [];
  score += Math.min(20, words.filter(w => hay.includes(w)).length * 3);
  return { score, quality };
}

export function rankSearchResults(results, query, { limit = 9 } = {}) {
  const seen = new Set(), perHost = new Map();
  const critical=criticalTokens(query),subjects=subjectTerms(query);
  const ranked = (Array.isArray(results) ? results : [])
    .filter(r => r?.url && /^https?:\/\//i.test(r.url))
    .filter(r=>{
      const hay=((r.title||"")+" "+(r.url||"")+" "+(r.content||"")).toLowerCase();
      if(sourceOverride(r.url).blocked)return false;
      if(!usableStoreSaleEvidence(r,query))return false;
      const scope=explicitDomain(query);if(scope&&!hostMatches(hostOf(r.url),scope))return false;
      const title=String(r.title||"").toLowerCase();
      if(isStoreSaleQuery(query)){
        if(/\/(?:login|about|download|giftcards)(?:[/?]|$)/i.test(r.url)||/儲值|禮物卡|錢包|wallet|gift\s*cards/i.test(title))return false;
        if(!/sale|discount|deals|特賣|特價|折扣/i.test(hay)&&!/^https?:\/\/store\.steampowered\.com\/(?:app\/|specials|search|sale\/)/i.test(r.url))return false;
      }
      if(/latest|最新|最新版|\bstable\b/i.test(query)&&!/\bbeta\b|\balpha\b|nightly|preview|測試|開發版/i.test(query)&&/\bbeta\b|\balpha\b|nightly|nightlies|preview|pre-release/i.test(title+' '+r.url))return false;
      if(isGameQuery(query)&&!gameIdentityMatches(gamePlan(query).title_hint||query,r))return false;
      const relevance=topicCoverage(r,query);
      if(relevance.missing.some(t=>/^[a-z]{2,3}$/.test(t)))return false;
      if(!r.reference_entry&&relevance.terms.length>=2&&relevance.ratio<.35)return false;
      const priceNoise=/組合包|整機|電腦主機|電競主機|桌上型電腦|筆電|notebook|laptop|外接顯示卡|ai\s*box/i;
      // Filter a noisy product only when the result itself is that product.
      // Category pages may legitimately contain a few restricted child products.
      if(PRICE_RE.test(query)&&priceNoise.test(title)&&!priceNoise.test(query))return false;
      if((PRICE_RE.test(query)||OFFICIAL_RE.test(query))&&!isGameQuery(query)&&critical.length&&!critical.every(t=>hay.includes(t)))return false;
      if(isGameQuery(query)){
        if(!critical.filter(t=>!/^\d+(?:\.\d+)+$/.test(t)).every(t=>hay.includes(t)))return false;
        const requested=critical.filter(t=>/^\d+(?:\.\d+)+$/.test(t)),observed=observedGameVersions(hay);
        if(requested.length&&observed.length&&!requested.some(v=>observed.some(o=>o===v||o.startsWith(v+'.'))))return false;
        // No version in a discovery snippet means unknown, not incompatible.
        // Read it first; the evidence pack must still report compatibility unknown.
      }
      if(/docs|documentation|文件|export|setup/i.test(query)&&!isGameQuery(query)&&/\/asset\//i.test(r.url||''))return false;
      if(OFFICIAL_RE.test(query)&&subjects.length&&!subjects.some(t=>hay.includes(t)))return false;
      return true;
    })
    .map(r => ({ r, ...scoreResult(r, query), canonical: canonicalUrl(r.url), host: hostOf(r.url) }))
    .sort((a, b) => b.score - a.score);
  const output = [];
  const hostCap=PRICE_RE.test(query)?1:2;
  for (const x of ranked) {
    if (!x.host || seen.has(x.canonical)) continue;
    const group=PRICE_RE.test(query)?merchantKey(x.r.url):x.host;
    const count = perHost.get(group) || 0;
    if (count >= hostCap) continue;
    seen.add(x.canonical);
    perHost.set(group, count + 1);
    output.push({ ...x.r, reliability: x.quality, rank_score: Math.round(x.score * 100) / 100 });
    if (output.length >= Math.max(1, Math.min(20, limit))) break;
  }
  return output;
}

export function assessSearchQuality(results, query, { fullText = false } = {}) {
  const list = Array.isArray(results) ? results : [];
  const sourceKey = r => r.source_url ? publisherKey(r.source_url) : r.coverage === "headline-only" && r.source ? String(r.source).toLowerCase() : publisherKey(r.url);
  const domains = new Set(list.map(sourceKey).filter(Boolean));
  const quality = r => r.reliability || qualityForHost(hostOf(r.url), query);
  const primary = list.filter(r => quality(r) === "primary").length;
  const trusted = list.filter(r => ["primary", "trusted"].includes(quality(r))).length;
  const pages = list.filter(r => r.coverage === "page" || r.coverage === "article").length;
  const primaryPages = list.filter(r => (r.coverage === "page" || r.coverage === "article") && quality(r) === "primary").length;
  const trustedPages = list.filter(r => (r.coverage === "page" || r.coverage === "article") && ["primary","trusted"].includes(quality(r))).length;
  let confidence = "LOW";
  if (primaryPages > 0) confidence = "HIGH";
  else if (domains.size >= 2 && trustedPages >= 2) confidence = "HIGH";
  else if (domains.size >= 2 || trusted > 0 || pages > 0) confidence = "MEDIUM";
  const gates=[];
  if(isStoreSaleQuery(query)){
    gates.push('current-regional-prices-not-verified');
    if(confidence==='HIGH')confidence='MEDIUM';
  }
  if(OFFICIAL_RE.test(query)&&!primaryPages){gates.push('official-page-not-read');if(confidence==='HIGH')confidence='MEDIUM';}
  const focus=focusTerms(query);
  if(focus.length>=2&&list.some(r=>r.body||r.content)){
    const all=list.map(r=>[r.title,r.url,r.body].join(' ')).join(' ').toLowerCase();
    const missing=focus.filter(t=>!all.includes(t));
    if(missing.length){gates.push('missing-query-topics');if(confidence==='HIGH')confidence='MEDIUM';}
  }
  if(isNewsQuery(query)){
    const dated=list.filter(r=>Number.isFinite(Date.parse(r.date))&&Date.parse(r.date)<=Date.now());
    const publishers=new Set(dated.filter(r=>['primary','trusted'].includes(quality(r))).map(sourceKey));
    if(publishers.size<2||dated.length!==list.length){gates.push('news-evidence-incomplete');if(confidence==='HIGH')confidence='MEDIUM';}
  }
  return {
    confidence,
    sources: list.length,
    independent_domains: domains.size,
    primary_sources: primary,
    primary_full_pages: primaryPages,
    full_pages: pages,
    ...(gates.length?{evidence_gates:gates}:{})
  };
}
