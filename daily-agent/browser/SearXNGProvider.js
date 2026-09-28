import {XMLParser} from 'fast-xml-parser';
import { SearchProvider } from "./SearchProvider.js";
export class SearXNGProvider extends SearchProvider {
  constructor({ endpoint = "", fetcher = fetch, now = () => new Date() } = {}) {
    super();
    Object.assign(this, { endpoint, fetcher, now });
    this.name = "SearXNG";
    if (endpoint) {
      const u = new URL(endpoint);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        throw Error("Invalid SearXNG URL");
    }
  }
  status() {
    return { provider: this.name, configured: !!this.endpoint, paid: false };
  }
  cancel() {
    this.controller?.abort();
  }
  close() {
    this.cancel();
  }
  async newsFallback(query,limit,undated=[]){
    const keywords=query.split(/[，。；\n]/)[0].replace(/^(?:請)?(?:幫我|替我)?(?:搜尋|查詢|上網查|找一下|找|查)?\s*/,'').replace(/今天|今日|最新|頭條|新聞|有什麼|有哪些|的|呢|？/g,' ').trim()||'台灣';
    const url=new URL('https://news.google.com/rss/search');url.search=new URLSearchParams({q:keywords+' when:1d',hl:'zh-TW',gl:'TW',ceid:'TW:zh-Hant'});
    try {
      const response=await this.fetcher(url,{redirect:'error',signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(8000)])});
      if(!response.ok)throw Error('RSS unavailable');
      const xml=await response.text();if(xml.length>2000000||/<!DOCTYPE/i.test(xml))throw Error('Invalid feed');
      const entries=new XMLParser({ignoreAttributes:true,processEntities:false}).parse(xml).rss?.channel?.item||[];
      const day=d=>new Date(d).toLocaleDateString('en-CA');const now=+this.now();
      const results=(Array.isArray(entries)?entries:[entries]).filter(r=>{try{const u=new URL(r.link),date=Date.parse(r.pubDate);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&date<=now&&now-date<=86400000;}catch{return false;}})
        .sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate)).slice(0,Math.max(1,Math.min(3,limit)))
        .map(r=>({title:String(r.title).slice(0,300),url:r.link,date:r.pubDate,source:String(r.source||'Google News'),body:String(r.title).slice(0,600),coverage:'headline-only',freshness:day(r.pubDate)===day(this.now())?'today':'last-24-hours-not-today',retrieved_at:new Date().toISOString()}));
      if(results.length)return {query,provider:'Google News RSS（SearXNG 備援）',results,notice:'僅取得新聞標題與來源提供的日期，未讀全文；只能整理標題，不可補寫細節。'};
    }catch(e){if(this.controller.signal.aborted)throw new DOMException('查詢已取消','AbortError');}
    if(undated.length)return {query,provider:'SearXNG（日期待確認）',results:undated.slice(0,Math.max(1,Math.min(3,limit))).map(r=>({...r,freshness:'unverified-date',coverage:'search-excerpt'})),notice:'以下日期尚未核實，不可稱為今日新聞；仍應提供標題與連結供使用者查看。'};
    throw Error('已連上 SearXNG，但新聞搜尋與備援未取得可核對日期的報導。請縮小地區或主題。');
  }
  async search(query, { limit = 3 } = {}) {
    if (!this.endpoint)
      throw Error("尚未設定 DAILY_SEARXNG_URL；Idle 查詢未啟用");
    this.controller = new AbortController();
    const news = /新聞|\bnews\b/i.test(query);
    const today = /今天|今日|\btoday\b/i.test(query);
    const aiNews = news && /\bAI\b|人工智慧|人工智能/i.test(query);
    const clean = news ? query.split(/[，。；\n]/)[0]
      .replace(/^(請)?(幫我|替我)?\s*(搜尋|查詢|上網查|找一下|找|查)\s*/, '')
      .replace(/今天|今日/g, '').replace(/有什麼|有哪些|的|呢|？/g, '').trim() : query;
    const localDay = d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    const day = localDay(this.now());
    const url = new URL(this.endpoint.replace(/\/$/, "") + "/search");
    url.search = new URLSearchParams({
      q: /^(AI|人工智慧|人工智能)\s*(新聞|news)$/i.test(clean) ? 'artificial intelligence' : clean || query,
      format: "json",
      safesearch: "1",
      ...(news ? {categories:'news'} : {}),
      ...(today ? {time_range:'day'} : {}),
    });
    const response = await this.fetcher(url, {
      redirect: "error",
      signal: AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(12000),
      ]),
    });
    if (!response.ok)
      throw Error(`SearXNG HTTP ${response.status}；請確認已啟用 JSON format`);
    const data = await response.json();
    const results = (Array.isArray(data.results) ? data.results : [])
      .filter((r) => {
        try {
          const u = new URL(r.url);
          if(aiNews && !/\bAI\b|artificial intelligence|人工智[慧能]|OpenAI|Anthropic|ChatGPT|LLM|機器學習/i.test(`${r.title || ''} ${r.content || ''}`)) return false;
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
      .slice(0, Math.min(3, limit))
      .map((r) => ({
        title: String(r.title || "").slice(0, 300),
        url: r.url,
        body: String(r.content || "").slice(0, 3000),
        source: new URL(r.url).hostname,
        date: r.publishedDate || r.pubdate || null,
        freshness: today && news ? (localDay(new Date(r.publishedDate || r.pubdate))===day ? 'today' : 'last-24-hours-not-today') : undefined,
        coverage: "search-excerpt",
        retrieved_at: new Date().toISOString(),
      }));
    if(!results.length && news){
      const undated=(data.results||[]).filter(r=>{try{const u=new URL(r.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!r.publishedDate&&!r.pubdate&&r.title;}catch{return false;}}).map(r=>({title:String(r.title).slice(0,300),url:r.url,body:String(r.content||'').slice(0,3000),source:new URL(r.url).hostname,date:null}));
      return this.newsFallback(query,limit,undated);
    }
    if(!results.length) throw Error(today && news
      ? '已連上 SearXNG 並搜尋新聞，但這次結果中沒有可核對為今天發布的報導。這不代表今天沒有新聞；日期不明及舊文章已略過。'
      : '已連上 SearXNG，但這次沒有取得可用結果。');
    return { query, results, provider: "SearXNG", notice:'搜尋摘要並非文章全文；日期取自搜尋來源。last-24-hours-not-today 代表近24小時但不是今天，必須標明日期，不可稱為今日新聞。僅能說本次搜尋未找到，不能斷言今天沒有新聞。' };
  }
}
// Idle owns an ephemeral browser. At most three pages, closed after each lookup.
export class LightSearchBrowser {
  constructor(provider, browser) {
    Object.assign(this, { provider, browser });
    this.epoch=0; this.lastProvider=null;
  }
  status() { return {provider:this.provider.endpoint ? "SearXNG / Wikipedia → source pages" : "Wikipedia → source pages",configured:true,paid:false,lastProvider:this.lastProvider}; }
  async search(query, {limit=3}={}) {
    const epoch=this.epoch, results=[];
    limit=Math.max(1,Math.min(3,limit));
    this.browser.activeSearches=(this.browser.activeSearches || 0)+1;
    try {
      if(this.provider.endpoint) {
        try {
          const result=await this.provider.search(query,{limit});
          for (const r of result.results.slice(0,limit)) {
            if(epoch!==this.epoch) throw new DOMException("查詢已取消","AbortError");
            try { results.push({ ...r, ...await this.browser.open(r.url) }); }
            catch(e) { if(e.name==="AbortError")throw e; }
          }
          if(results.length) { this.lastProvider=result.provider; return {...result,results}; }
        } catch(e) {
          if(e.name==="AbortError" || epoch!==this.epoch)throw e;
        }
      }
      if(epoch!==this.epoch) throw new DOMException("查詢已取消","AbortError");
      const result=await this.browser.encyclopediaSearch(query,limit);
      if(epoch!==this.epoch) throw new DOMException("查詢已取消","AbortError");
      this.lastProvider=result.provider;
      return result;
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
