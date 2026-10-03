import {XMLParser} from 'fast-xml-parser';
import { SearchProvider } from "./SearchProvider.js";
import {
  assessSearchQuality,
  engineRoute,
  hostOf,
  isDirectRetailUrl,
  isNewsQuery,
  isTodayQuery,
  rankSearchResults,
  titleSimilarity,
  topicCoverage,
  focusTerms,
  sourceReliability,
} from "./SearchQuality.js";
import { planQueries, freshnessRange, preferredLanguage } from "./SearchPlanner.js";
import {isStoreSaleQuery,usableStoreSaleEvidence} from './QueryText.js';
import { crossCheckFacts, gateQualityWithFacts } from "./SearchFacts.js";
import { FastPageReader } from "./FastPageReader.js";
import {referencePages,publisherKey} from './SourceRegistry.js';
import {isGameQuery,gameEvidence} from './GameSearch.js';
import {newsRelevant} from './QueryText.js';
import {gameIdentityMatches} from './GameVersionCheck.js';
export class SearXNGProvider extends SearchProvider {
  constructor({ endpoint = "", fetcher = fetch, now = () => new Date(), engineHealth = null, searchCache = null } = {}) {
    super();
    Object.assign(this, { endpoint, fetcher, now });
    this.name = "SearXNG";
    this.engineHealth = engineHealth || new Map();
    this.searchCache = searchCache || new Map();
    if (endpoint) {
      const u = new URL(endpoint);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        throw Error("Invalid SearXNG URL");
    }
  }
  status() {
    return { provider:this.name,configured:!!this.endpoint,paid:false,engine_health:this.healthSnapshot(),cache_entries:this.searchCache.size };
  }
  cancel() {
    this.controller?.abort();
  }
  close() {
    this.cancel();
  }
  healthSnapshot() {
    return Object.fromEntries([...this.engineHealth.entries()].map(([name,s])=>[name,{
      successes:s.successes||0, failures:s.failures||0,
      last_error:s.last_error||null, suspended_until:s.suspended_until||0,
      requests:s.requests||0,successful_requests:s.successful_requests||0,empty_results:s.empty_results||0,error_requests:s.error_requests||0,
      average_request_latency_ms:s.requests?Math.round((s.total_request_latency_ms||0)/s.requests):null,
      latency_scope:'whole-SearXNG-request'
    }]));
  }
  recordHealth(data) {
    const now=Date.now();
    for(const row of data?.unresponsive_engines||[]){
      const name=String(row?.[0]||"unknown"),reason=String(row?.[1]||"error");
      const s=this.engineHealth.get(name)||{successes:0,failures:0,suspended_until:0};
      s.failures++; s.last_error=reason; s.last_failure=now;
      const hard=/suspended|too many|captcha|access denied|\b401\b|\b403\b/i.test(reason);
      if(hard)s.suspended_until=now+10*60*1000;
      else if(s.failures>=2)s.suspended_until=now+5*60*1000;
      this.engineHealth.set(name,s);
    }
    for(const r of data?.results||[]) for(const name of r.engines||[]){
      const s=this.engineHealth.get(name)||{successes:0,failures:0,suspended_until:0};
      s.successes++; s.failures=Math.max(0,s.failures-1);
      if(s.failures===0)s.suspended_until=0;
      this.engineHealth.set(name,s);
    }
  }
  selectEngines(query) {
    const now=Date.now(),base=engineRoute(query).split(",").map(s=>s.trim()).filter(Boolean);
    const activeBase=base.filter(name=>(this.engineHealth.get(name)?.suspended_until||0)<=now);
    if(activeBase.length)return activeBase.join(",");
    const fallback=["yahoo","yep","bing","wikipedia","google cse"].filter(name=>(this.engineHealth.get(name)?.suspended_until||0)<=now);
    return (fallback.length?fallback:base).slice(0,6).join(",");
  }
  async rawSearch(query, originalQuery=query) {
    if(!this.controller)this.controller=new AbortController();
    this.controller.signal.throwIfAborted();
    const range=freshnessRange(originalQuery);
    const cacheKey=JSON.stringify([query,originalQuery,range,this.selectEngines(originalQuery)]);
    const cached=this.searchCache.get(cacheKey);
    if(cached?.expires>Date.now()){this.trace?.push({query,cache_hit:true,result_count:cached.value.results?.length||0,ms:0});return structuredClone(cached.value);}
    const url=new URL(this.endpoint.replace(/\/$/,"")+"/search");
    url.search=new URLSearchParams({
      q:query, format:"json", safesearch:"1",
      engines:this.selectEngines(originalQuery),
      language:preferredLanguage(originalQuery),
      ...(range?{time_range:range}:{})
    });
    const started=Date.now();
    const response=await this.fetcher(url,{
      redirect:"error",
      signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(10000)])
    });
    if(!response.ok)throw Error(`SearXNG HTTP ${response.status}；請確認已啟用 JSON format`);
    const data=await response.json(); this.recordHealth(data);
    const engineErrors=new Set((data.unresponsive_engines||[]).map(r=>r[0])),hits=new Set((data.results||[]).flatMap(r=>r.engines||[]));
    for(const name of url.searchParams.get('engines').split(',')){
      const state=this.engineHealth.get(name)||{successes:0,failures:0,suspended_until:0};state.requests=(state.requests||0)+1;state.total_request_latency_ms=(state.total_request_latency_ms||0)+Date.now()-started;
      if(engineErrors.has(name))state.error_requests=(state.error_requests||0)+1;
      else if(hits.has(name)){state.successful_requests=(state.successful_requests||0)+1;state.consecutive_empty=0;}
      else {state.empty_results=(state.empty_results||0)+1;state.consecutive_empty=(state.consecutive_empty||0)+1;}
      this.engineHealth.set(name,state);
    }
    this.trace?.push({query,engines:url.searchParams.get('engines'),cache_hit:false,result_count:data.results?.length||0,ms:Date.now()-started,unresponsive_engines:data.unresponsive_engines||[]});
    const ttl=range||isGameQuery(originalQuery)||isStoreSaleQuery(originalQuery)||/價格|售價|\bprice\b|latest|最新|版本|\bversion\b|patch notes|updates/i.test(originalQuery)?120000:600000;
    if(data.results?.length)this.searchCache.set(cacheKey,{expires:Date.now()+ttl,value:structuredClone(data)});
    if(this.searchCache.size>120)this.searchCache.delete(this.searchCache.keys().next().value);
    return data;
  }
  async resolveNewsArticle(item) {
    try {
      const cleanTitle=String(item.title||"").replace(/\s+-\s+[^-]{2,100}$/u,"").trim();
      if(!cleanTitle) return item;
      const sourceSite=hostOf(item.source_url||"").replace(/^m\./,"");
      const url=new URL(this.endpoint.replace(/\/$/,"")+"/search");
      url.search=new URLSearchParams({
        q: cleanTitle+(sourceSite?" site:"+sourceSite:" "+String(item.source||"")),
        format:"json",
        safesearch:"1",
        engines:this.selectEngines(cleanTitle),
        language:preferredLanguage(cleanTitle),
        time_range:"day",
      });
      const response=await this.fetcher(url,{
        redirect:"error",
        signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(6000)]),
      });
      if(!response.ok) return item;
      const data=await response.json();
      this.recordHealth(data);
      const candidates=rankSearchResults(data.results,cleanTitle,{limit:6});
      const sourceHint=String(item.source||"").toLowerCase();
      const hit=candidates.find(r=>{
        const host=hostOf(r.url);
        if(!host || host.endsWith("google.com")) return false;
        const sim=titleSimilarity(cleanTitle,r.title||"");
        const sourceMatch=(sourceSite&&(host===sourceSite||host.endsWith("."+sourceSite))) ||
          (sourceHint&&(host.includes(sourceHint.replace(/^www\./,""))||String(r.title||"").toLowerCase().includes(sourceHint)));
        // A similar headline on a different publisher must not inherit RSS date.
        if(sourceSite && !(host===sourceSite||host.endsWith('.'+sourceSite)))return false;
        return sim>=0.72 || (sourceMatch && sim>=0.62);
      });
      return hit ? {...item,url:hit.url,source:hostOf(hit.url)||item.source,reliability:hit.reliability,coverage:"search-excerpt",resolved_from:"Google News RSS"} : item;
    } catch(e) {
      if(this.controller.signal.aborted) throw new DOMException("查詢已取消","AbortError");
      return item;
    }
  }
  async fetchDirectFeed(url,label,query,limit=5) {
    try {
      const response=await this.fetcher(url,{redirect:"follow",signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(7000)])});
      if(!response.ok)return [];
      const xml=await response.text(); if(xml.length>2500000||/<!DOCTYPE/i.test(xml))return [];
      const feed=new XMLParser({ignoreAttributes:false,processEntities:false,attributeNamePrefix:"@_"}).parse(xml);
      const raw=feed?.rss?.channel?.item||feed?.feed?.entry||[];
      const rows=Array.isArray(raw)?raw:[raw];
      const keywords=String(query).replace(/今天|今日|最新|新聞|頭條|快訊|有什麼|有哪些|\bnews\b/gi," ")
        .match(/[\p{Script=Han}]{2,}|[A-Za-z0-9][A-Za-z0-9._-]{1,}/gu)||[];
      const now=+this.now();
      return rows.map(r=>{
        const title=String(r.title?.["#text"]??r.title??"").trim();
        const link=String(r.link?.["@_href"]??r.link?.["#text"]??r.link??"").trim();
        const date=String(r.pubDate??r.published??r.updated??"");
        const description=String(r.description?.["#text"]??r.description??r.summary?.["#text"]??r.summary??"")
          .replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,1200);
        const stamp=Date.parse(date),freshness=Number.isFinite(stamp)
          ? (new Date(stamp).toLocaleDateString("en-CA")===this.now().toLocaleDateString("en-CA")?"today":"last-24-hours-not-today")
          : "unverified-date";
        return {title,url:link,date,source:label,body:description,coverage:"search-excerpt",reliability:"trusted",direct_feed:true,freshness,retrieved_at:new Date().toISOString()};
      }).filter(r=>{
        try{
          const u=new URL(r.url),stamp=Date.parse(r.date),hay=(r.title+" "+r.body).toLowerCase();
          const relevant=!keywords.length||keywords.some(k=>{
            const key=k.toLowerCase();
            if(/^[a-z0-9._-]+$/i.test(k) && key.length<=3){
              const escaped=key.replace(/[.*+?^$(){}|[\\]\\\\]/g,"\\$&");
              return new RegExp("(^|[^a-z0-9])"+escaped+"([^a-z0-9]|$)","i").test(hay);
            }
            return hay.includes(key);
          });
          return ["http:","https:"].includes(u.protocol)&&!u.username&&!u.password&&newsRelevant(r,query)&&Number.isFinite(stamp)&&stamp<=now&&now-stamp<=24*3600000;
        }catch{return false;}
      }).sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,limit);
    } catch(e) {
      if(this.controller.signal.aborted)throw new DOMException("查詢已取消","AbortError");
      return [];
    }
  }
  async directNews(query,limit=5) {
    const feeds=[["https://news.ltn.com.tw/rss/all.xml","自由時報"]];
    if(/AI|人工智[慧能]|科技|晶片|GPU|半導體|軟體|software|technology/i.test(query)){
      feeds.push(["https://feeds.feedburner.com/rsscna/technology","中央社科技"]);
      feeds.push(["https://technews.tw/feed/","TechNews 科技新報"]);
    } else if(/財經|股票|股市|市場|金融|finance|stock/i.test(query)){
      feeds.push(["https://feeds.feedburner.com/rsscna/finance","中央社產經"]);
    } else if(/國際|世界|美國|日本|中國|歐洲|international|world/i.test(query)){
      feeds.push(["https://feeds.feedburner.com/rsscna/intworld","中央社國際"]);
    }
    const out=(await Promise.all(feeds.map(([url,label])=>this.fetchDirectFeed(url,label,query,limit)))).flat();
    return out.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,Math.max(limit,5));
  }
  async newsFallback(query,limit,undated=[]){
    const directTask=this.directNews(query,Math.max(5,Math.min(8,limit)));
    const keywords=query.split(/[，。；\n]/)[0].replace(/^(?:請)?(?:幫我|替我)?(?:搜尋|查詢|上網查|找一下|找|查)?\s*/,'').replace(/今天|今日|最新|頭條|新聞|有什麼|有哪些|的|呢|？/g,' ').trim()||'台灣';
    const url=new URL('https://news.google.com/rss/search');url.search=new URLSearchParams({q:keywords+' when:1d',hl:'zh-TW',gl:'TW',ceid:'TW:zh-Hant'});
    try {
      const response=await this.fetcher(url,{redirect:'error',signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(8000)])});
      if(!response.ok)throw Error('RSS unavailable');
      const xml=await response.text();if(xml.length>2000000||/<!DOCTYPE/i.test(xml))throw Error('Invalid feed');
      const entries=new XMLParser({ignoreAttributes:false,processEntities:false,attributeNamePrefix:"@_"}).parse(xml).rss?.channel?.item||[];
      const day=d=>new Date(d).toLocaleDateString('en-CA');const now=+this.now();
      const google=(Array.isArray(entries)?entries:[entries]).filter(r=>{try{const u=new URL(r.link),date=Date.parse(r.pubDate);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&newsRelevant({title:String(r.title?.['#text']??r.title??'')},query)&&date<=now&&now-date<=86400000;}catch{return false;}})
        .sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate)).slice(0,Math.max(3,Math.min(8,limit)))
        .map(r=>{
          const sourceNode=r.source,source=String(sourceNode?.["#text"]??sourceNode??"Google News");
          return {title:String(r.title?.["#text"]??r.title??"").slice(0,300),url:String(r.link?.["#text"]??r.link??""),date:r.pubDate,source,source_url:String(sourceNode?.["@_url"]??""),body:String(r.title?.["#text"]??r.title??"").slice(0,600),coverage:'headline-only',freshness:day(r.pubDate)===day(this.now())?'today':'last-24-hours-not-today',retrieved_at:new Date().toISOString()};
        });
      const direct=await directTask;
      const merged=[];
      for(const item of [...direct,...google]){
        if(merged.some(x=>x.url===item.url||titleSimilarity(x.title,item.title)>=0.86))continue;
        merged.push(item);
      }
      const newsScore=x=>{
        const age=Math.max(0,(now-(Date.parse(x.date)||now))/3600000);
        return (x.reliability==="trusted"?30:0)+(x.direct_feed?18:0)+(x.freshness==="today"?8:0)-Math.min(24,age);
      };
      merged.sort((a,b)=>newsScore(b)-newsScore(a));
      const take=Math.max(3,Math.min(5,limit)),selected=[],seenSources=new Set();
      for(const item of merged){
        const key=publisherKey(item.source_url||item.url)||String(item.source||"").toLowerCase();
        if(seenSources.has(key))continue;
        seenSources.add(key); selected.push(item);
        if(selected.length>=take)break;
      }
      if(selected.length<take)for(const item of merged){
        if(selected.includes(item))continue;
        selected.push(item); if(selected.length>=take)break;
      }
      const results=[];
      for(const item of selected)
        results.push(item.direct_feed?item:await this.resolveNewsArticle(item));
      if(results.length)return {query,provider:'Publisher RSS + Google News RSS + SearXNG 來源解析',results,quality:assessSearchQuality(results,query),notice:'優先使用媒體直接 RSS 的原始文章網址，再以 Google News RSS 補足。仍標示 search-excerpt / headline-only 的項目不可補寫未讀取的原文細節。'};
    }catch(e){if(this.controller.signal.aborted){await directTask.catch(()=>{});throw new DOMException('查詢已取消','AbortError');}}
    const direct=await directTask;
    if(direct.length){const results=direct.slice(0,Math.max(1,Math.min(5,limit)));return {query,provider:'Publisher RSS（Google News 不可用）',results,quality:assessSearchQuality(results,query),notice:'Google News 未成功，仍保留媒體直接 RSS；摘要不等於全文。'};}
    if(undated.length){const safe=undated.slice(0,Math.max(1,Math.min(3,limit))).map(r=>({...r,freshness:'unverified-date',coverage:'search-excerpt'}));return {query,provider:'SearXNG（日期待確認）',results:safe,quality:assessSearchQuality(safe,query),notice:'以下日期尚未核實，不可稱為今日新聞；仍應提供標題與連結供使用者查看。'};}
    throw Error('已連上 SearXNG，但新聞搜尋與備援未取得可核對日期的報導。請縮小地區或主題。');
  }
  async search(query, { limit = 3,mode='normal' } = {}) {
    if (!this.endpoint)
      throw Error("尚未設定 DAILY_SEARXNG_URL；Idle 查詢未啟用");
    this.controller = new AbortController();
    this.trace=[];
    const requestedLimit = Math.max(1, Math.min(20, Number(limit) || 3));
    const news = isNewsQuery(query);
    const today = isTodayQuery(query);
    const aiNews = news && /\bAI\b|人工智慧|人工智能/i.test(query);
    const clean = news ? query.split(/[，。；\n]/)[0]
      .replace(/^(請)?(幫我|替我)?\s*(搜尋|查詢|上網查|找一下|找|查)\s*/, '')
      .replace(/今天|今日/g, '').replace(/有什麼|有哪些|的|呢|？/g, '').trim() : query;
    const localDay = d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    const day = localDay(this.now());
    const queryBudget=mode==='fast'?1:mode==='deep'?(/latest|最新|debug|error|issue|故障|問題/i.test(query)||query.length>120?6:4):3;
    const plan=planQueries(query,{max:queryBudget});
    const rawRows=news?[]:referencePages(query),usedQueries=[];
    const queries=news
      ? [/^(AI|人工智慧|人工智能)\s*(新聞|news)$/i.test(clean) ? "artificial intelligence" : (clean||query)]
      : plan.queries;
    for(let i=0;i<queries.length;i++){
      const variant=queries[i];
      let data;
      try{data=await this.rawSearch(variant,query);}catch(e){
        if(this.controller.signal.aborted)throw e;
        this.trace.push({query:variant,error:'upstream-request-failed'});continue;
      }
      usedQueries.push(variant);
      for(const row of data.results||[])rawRows.push({...row,query_variant:variant});
      const preview=rankSearchResults(rawRows,query,{limit:8});
      const primary=preview.filter(r=>r.reliability==="primary").length;
      const domains=new Set(preview.map(r=>hostOf(r.url)).filter(Boolean)).size;
      if(mode!=='deep'&&!news && i===0 && !["price","official","legal","game","store-sale"].includes(plan.intent) && primary>=2 && domains>=2)break;
      if(mode!=='deep'&&!news && i>=1 && !["price","official","legal","game","store-sale"].includes(plan.intent) && preview.length>=6 && domains>=3)break;
      if(mode==='deep'&&i>=2&&primary>=4&&domains>=2)break;
    }
    if(mode!=='fast'&&plan.intent==="price"){
      const priceCore=String(query)
        .replace(/台灣|臺灣|現在|目前|即時|價格|售價|價錢|多少錢|比價|price|buy/gi," ")
        .replace(/\s+/g," ").trim()||query;
      for(const site of ["autobuy.tw","momoshop.com.tw"]){
        const variant=priceCore+(/rtx|geforce|radeon|顯示卡|gpu/i.test(query)?' 顯示卡 GPU':'')+" site:"+site;
        if(usedQueries.includes(variant))continue;
        const extra=await this.rawSearch(variant,query);
        usedQueries.push(variant);
        for(const row of extra.results||[])rawRows.push({...row,query_variant:variant});
      }
    }
    const gameUpdates=[];
    if(mode!=='fast'&&plan.game?.title_hint){
      try{
        const updateQuery=plan.game.update_query,rows=[];
        for(const variant of [updateQuery,...(plan.game.update_site?[updateQuery+' site:'+plan.game.update_site]:[])]){
          const update=await this.rawSearch(variant,updateQuery);usedQueries.push(variant);
          rows.push(...(update.results||[]).map(r=>({...r,query_variant:variant})));
        }
        for(const r of rankSearchResults(rows.filter(r=>gameIdentityMatches(plan.game.title_hint,{...r,content:'',body:''})&&
          (/patch|updates?|hotfix|release|news|更新|修正|補丁|アプデ|アップデート/i.test(r.title+' '+r.url)||
           sourceReliability(r.url,query)==='primary'&&/\b\d+(?:\.\d+){1,4}\b/.test(r.title)&&
           gameIdentityMatches(plan.game.title_hint,{title:r.title,url:'',content:'',body:''}))),updateQuery,{limit:4}))gameUpdates.push({
          title:String(r.title||'').slice(0,300),url:r.url,body:String(r.content||'').slice(0,1800),
          date:r.publishedDate||r.pubdate||null,reliability:r.reliability,coverage:'search-excerpt',purpose:'update-context'
        });
      }catch(e){if(this.controller.signal.aborted)throw new DOMException('查詢已取消','AbortError');}
    }
    const data={results:rawRows};
    const candidates = rankSearchResults(rawRows, query, { limit: Math.max(9, requestedLimit*3) });
    const results = candidates
      .filter((r) => {
        try {
          const u = new URL(r.url);
          if(news&&!newsRelevant(r,query))return false;
          const published = new Date(r.publishedDate || r.pubdate || '');
          if(today && news && (Number.isNaN(+published) || +this.now()-published>86400000 || +published>+this.now())) return false;
          return (
            ["https:", "http:"].includes(u.protocol) &&
            !u.username &&
            !u.password
          );
        } catch {
          return false;
        }
      })
      .slice(0, requestedLimit)
      .map((r) => ({
        title: String(r.title || "").slice(0, 300),
        url: r.url,
        body: String(r.content || "").slice(0, 3000),
        source: new URL(r.url).hostname,
        date: r.publishedDate || r.pubdate || null,
        freshness: today && news ? (localDay(new Date(r.publishedDate || r.pubdate))===day ? 'today' : 'last-24-hours-not-today') : undefined,
        coverage: "search-excerpt",
        reliability: r.reliability,
        rank_score: r.rank_score,
        query_variant: r.query_variant || query,
        ...(r.reference_entry?{reference_entry:true}:{}),
        retrieved_at: new Date().toISOString(),
      }));
    if(!results.length && news){
      const undated=rankSearchResults(data.results,query,{limit:Math.max(6,requestedLimit)}).filter(r=>{try{const u=new URL(r.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!r.publishedDate&&!r.pubdate&&r.title;}catch{return false;}}).map(r=>({title:String(r.title).slice(0,300),url:r.url,body:String(r.content||'').slice(0,3000),source:new URL(r.url).hostname,date:null,reliability:r.reliability,rank_score:r.rank_score}));
      const fallback=await this.newsFallback(query,requestedLimit,undated);
      return {...fallback,plan,search_queries:usedQueries,engine_health:this.healthSnapshot(),facts:crossCheckFacts(query,fallback.results)};
    }
    if(!results.length) throw Error(today && news
      ? '已連上 SearXNG 並搜尋新聞，但這次結果中沒有可核對為今天發布的報導。這不代表今天沒有新聞；日期不明及舊文章已略過。'
      : '已連上 SearXNG，但這次沒有取得可用結果。');
    const facts=crossCheckFacts(query,results);
    const quality=gateQualityWithFacts(assessSearchQuality(results,query),facts);
    return {
      query, results, provider:"SearXNG",
      quality, facts,
      plan, search_queries:usedQueries,
      ...(plan.game?{game:gameEvidence(query,results,gameUpdates),game_updates:gameUpdates}:{}),
      engine_health:this.healthSnapshot(),
      notice:'搜尋摘要並非文章全文；日期取自搜尋來源。last-24-hours-not-today 代表近24小時但不是今天，必須標明日期，不可稱為今日新聞。僅能說本次搜尋未找到，不能斷言今天沒有新聞。'
    };
  }
}
// Idle owns an ephemeral browser. At most three pages, closed after each lookup.
export class LightSearchBrowser {
  constructor(provider, browser, {fastReader=null}={}) {
    Object.assign(this, { provider, browser });
    this.fastReader=fastReader ?? (typeof browser?.start==="function" ? new FastPageReader() : null);
    this.cache=new Map();
    this.inFlight=new Map();this.searchQueue=Promise.resolve();
    this.epoch=0; this.lastProvider=null;
  }
  status() {
    return {
      provider:this.provider.endpoint ? "SearXNG → HTTP Fast Reader → Browser → Wikipedia fallback" : "Wikipedia → source pages",
      configured:true,paid:false,lastProvider:this.lastProvider,
      cache_entries:this.cache.size,engine_health:this.provider.healthSnapshot?.()||{}
    };
  }
  async search(query,{limit=3,mode='normal',onProgress=null,structuredStore=false}={}){
    if(typeof query!=='string'||!query.trim()||query.length>500)throw Error('搜尋字串無效或過長');
    if(!['fast','normal','deep'].includes(mode))throw Error('Invalid search mode');
    query=query.trim();limit=Math.max(1,Math.min(mode==='fast'?3:10,Number(limit)||3));
    const key=JSON.stringify([query,limit,mode,structuredStore]),epoch=this.epoch;
    if(this.inFlight.has(key))return structuredClone(await this.inFlight.get(key));
    const task=this.searchQueue.then(()=>{if(epoch!==this.epoch)throw new DOMException('查詢已取消','AbortError');return this.searchUncached(query,{limit,mode,onProgress,structuredStore});});
    this.searchQueue=task.catch(()=>{});this.inFlight.set(key,task);
    try{return structuredClone(await task);}finally{this.inFlight.delete(key);}
  }
  async searchUncached(query, {limit=3,mode='normal',onProgress=null,structuredStore=false}={}) {
    const epoch=this.epoch, results=[], fallbackSnippets=[];
    limit=Math.max(1,Math.min(mode==='fast'?3:10,limit));
    const cacheKey=JSON.stringify([String(query).trim(),limit,mode,structuredStore]);
    const cached=this.cache.get(cacheKey);
    if(cached?.expires>Date.now())return {...structuredClone(cached.value),cache_hit:true};
    const finish=value=>{
      if(epoch!==this.epoch)throw new DOMException('查詢已取消','AbortError');
      const cacheable=(value?.results?.length||0)>0 && value?.quality?.confidence!=="LOW";
      if(cacheable){
        const ttl=isNewsQuery(query)?60000:isGameQuery(query)||isStoreSaleQuery(query)||/價格|售價|價錢|price|現在|目前|latest|最新|版本|version|today/i.test(query)?120000:1800000;
        this.cache.set(cacheKey,{expires:Date.now()+ttl,value:structuredClone(value)});
        if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);
      }
      return value;
    };
    this.browser.activeSearches=(this.browser.activeSearches || 0)+1;
    try {
      if(this.provider.endpoint) {
        try {
          const candidateLimit=Math.min(20,Math.max(limit*3,limit));
          const result=await this.provider.search(query,{limit:candidateLimit,mode});
          onProgress?.(result);
          if(mode==='fast')return finish({...result,results:result.results.filter(r=>!r.reference_entry).slice(0,limit)});
          let attempts=0,browserAttempts=0;const browserFailedPublishers=new Set();
          const readDeadline=Date.now()+(mode==='deep'?18000:10000);
          const guideLimit=limit;
          for (const r of result.results) {
            if(structuredStore&&/^https?:\/\/store\.steampowered\.com\//i.test(r.url))continue;
            if(Date.now()>=readDeadline)break;
            if(epoch!==this.epoch) throw new DOMException("查詢已取消","AbortError");
            if(++attempts>Math.min(16,Math.max(6,limit*2)))break;
            try {
              let page=null;
              if(this.fastReader)try{page=await this.fastReader.open(r.url,{signal:this.provider.controller?.signal,timeout:Math.min(mode==='deep'?5500:3500,Math.max(1000,readDeadline-Date.now())),query});}catch(e){if(epoch!==this.epoch||this.provider.controller?.signal.aborted)throw new DOMException('查詢已取消','AbortError');}
              if(!page){
                const publisher=publisherKey(r.url);
                if(browserAttempts>=3||browserFailedPublishers.has(publisher)||readDeadline-Date.now()<1000)throw Error('browser read budget exhausted');
                browserAttempts++;try{page=await this.browser.open(r.url,{timeout:Math.min(mode==='deep'?8000:4000,readDeadline-Date.now())});}catch(e){browserFailedPublishers.add(publisher);throw e;}
              }
              if(epoch!==this.epoch)throw new DOMException('查詢已取消','AbortError');
              const merged={ ...r, ...page, title:page.title||r.title,date:page.date||r.date||null };
              if(!usableStoreSaleEvidence(merged,query))continue;
              if(publisherKey(page.url)!==publisherKey(r.url))merged.reliability=sourceReliability(page.url,query);
              // A full page may reveal that the search excerpt matched navigation only.
              if(!isGameQuery(query)){
                const coverage=topicCoverage(merged,query),headline=(merged.title+' '+merged.url).toLowerCase();
                if(coverage.terms.length>=2&&(coverage.ratio<0.6||(!focusTerms(query).some(t=>headline.includes(t)&&!new URL(merged.url).hostname.includes(t))&&new URL(merged.url).pathname==='/')))continue;
              }
              else if(!gameIdentityMatches(result.plan?.game?.title_hint||query,merged)||topicCoverage(merged,query).terms.length>=3&&topicCoverage(merged,query).ratio<.5)continue;
              results.push(merged);
              onProgress?.({...result,results:[...results]});
              if(results.length>=guideLimit) break;
            } catch(e) {
              if(epoch!==this.epoch||this.provider.controller?.signal.aborted)throw new DOMException('查詢已取消','AbortError');
              if(!r.reference_entry&&(["primary","trusted"].includes(r.reliability) || r.resolved_from || r.coverage==="headline-only"))
                fallbackSnippets.push(r);
            }
          }
          const updatePages=[];
          if(result.game_updates?.length&&limit>=3&&this.fastReader){
            const prioritized=[...result.game_updates].sort((a,b)=>(b.reliability==='primary')-(a.reliability==='primary'));
            for(const update of prioritized.slice(0,2)){
              if(epoch!==this.epoch)throw new DOMException('查詢已取消','AbortError');
              try{
                const page=await this.fastReader.open(update.url,{signal:this.provider.controller?.signal,timeout:3500,query:result.plan?.game?.update_query||query});
                if(epoch!==this.epoch)throw new DOMException('查詢已取消','AbortError');
                updatePages.push({...update,...page,date:page.date||update.date||null,reliability:sourceReliability(page.url,query)});break;
              }catch(e){if(epoch!==this.epoch||this.provider.controller?.signal.aborted)throw new DOMException('查詢已取消','AbortError');}
            }
          }
          if(results.length || fallbackSnippets.length) {
            const primarySnippets=fallbackSnippets.filter(r=>r.reliability==="primary");
            const otherSnippets=fallbackSnippets.filter(r=>r.reliability!=="primary");
            const combined=[...results,...primarySnippets,...otherSnippets].slice(0,limit);
            this.lastProvider=result.provider;
            const facts=crossCheckFacts(query,combined);
            const quality=gateQualityWithFacts(assessSearchQuality(combined,query,{fullText:results.length>0}),facts);
            const game=result.game?gameEvidence(query,combined,[...updatePages,...(result.game_updates||[]).filter(x=>!updatePages.some(p=>p.url===x.url))]):null;
            if(game){
              quality.game_update_status=game.update_status;
              quality.freshness_confidence=game.update_status==='primary-update-read'?'MEDIUM':'LOW';
              if(/最新|目前|current|latest/i.test(query)&&game.update_status!=='primary-update-read'&&quality.confidence==='HIGH')quality.confidence='MEDIUM';
            }
            return finish({...result,results:combined,quality,facts,...(game?{game,game_updates:[...updatePages,...(result.game_updates||[]).filter(x=>!updatePages.some(p=>p.url===x.url))]}:{})});
          }
          const headlines=result.results.filter(r=>r.coverage==="headline-only").slice(0,limit);
          if(headlines.length) {
            this.lastProvider=result.provider;
            const facts=crossCheckFacts(query,headlines);
            const quality=gateQualityWithFacts(assessSearchQuality(headlines,query),facts);
            return finish({...result,results:headlines,quality,facts});
          }
        } catch(e) {
          if(e.name==='AbortError'||this.provider.controller?.signal.aborted || epoch!==this.epoch)throw e;
          if(mode==='fast')throw e;
        }
      }
      if(epoch!==this.epoch) throw new DOMException("查詢已取消","AbortError");
      const result=await this.browser.encyclopediaSearch(query,limit);
      if(epoch!==this.epoch) throw new DOMException("查詢已取消","AbortError");
      result.results=(result.results||[]).filter(r=>{
        if(isGameQuery(query))return gameIdentityMatches(planQueries(query).game?.title_hint||query,r)&&topicCoverage(r,query).ratio>=.5;
        const c=topicCoverage(r,query);return c.terms.length<2||c.ratio>=.6;
      });
      this.lastProvider=result.provider;
      const facts=crossCheckFacts(query,result.results||[]);
      const quality=gateQualityWithFacts(assessSearchQuality(result.results||[],query,{fullText:true}),facts);
      return finish({...result,quality,facts});
    } finally {
      this.browser.activeSearches--;
      await this.browser.close();
    }
  }
  async close() {
    this.epoch++;
    this.provider.cancel();
    await this.browser.close();
  }
}
