import dns from "node:dns/promises";
import net from "node:net";
import { XMLParser } from "fast-xml-parser";
export function isPublicIP(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIP(ip) === 6) return !/^(::|fc|fd|fe[89ab]|2001:db8)/i.test(ip);
  return false;
}
export async function safeUrl(value) {
  const u = new URL(value);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    !["", "80", "443"].includes(u.port)
  )
    throw Error("只允許公開 HTTP(S) 網頁");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((x) => !isPublicIP(x.address)))
    throw Error("禁止存取本機或私人網路");
  return u.href;
}
export function assertReadablePage(page, status = 200) {
  if (status >= 400) throw Error(`網頁 HTTP ${status}，未取得可閱讀內容`);
  if (/^(just a moment|access denied|attention required|robot check|verify.*human)/i.test(page.title?.trim() || "") ||
      (page.body?.length < 1800 && /verify (?:that )?you are human|unusual traffic|完成.{0,8}人機驗證/i.test(page.body)))
    throw Error("網站要求驗證，已略過，沒有讀取文章內容");
  if (!page.body?.trim()) throw Error("網頁沒有可讀文字");
  return page;
}
export class PageExtractor {
  static async extract(page) {
    return page.evaluate(() => {
      const root =
        document.querySelector("article,main,[role=main]") || document.body;
      const copy = root.cloneNode(true);
      copy
        .querySelectorAll("script,style,nav,footer,header,form,iframe,noscript")
        .forEach((n) => n.remove());
      return {
        title: document.title,
        source: location.hostname,
        url: location.href,
        date:
          document.querySelector('meta[property="article:published_time"]')
            ?.content ||
          document.querySelector("time")?.dateTime ||
          null,
        body: (copy.innerText || copy.textContent || "")
          .replace(/\s+/g, " ")
          .slice(0, 18000),
        description: document.querySelector('meta[name="description"],meta[property="og:description"]')?.content || "",
        coverage: "page",
        retrieved_at: new Date().toISOString(),
      };
    });
  }
}
export class BrowserAgent {
  constructor({ idleMs = 45000, searchService = null } = {}) {
    this.idleMs = idleMs;
    this.searchService = searchService;
    this.launchOptions = {
      channel: process.env.DAILY_BROWSER_CHANNEL || "msedge",
      headless: true,
      args: ["--disable-gpu", "--disable-background-networking"],
    };
    this.closed = true;
    this.cache = new Map(); this.inFlight = new Map(); this.searchQueue = Promise.resolve();
    this.epoch = 0; this.activeSearches = 0;
  }
  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.activeSearches ? this.touch() : this.close().catch(() => {}), this.idleMs);
    this.timer.unref();
  }
  async start() {
    if (this.browser) {
      this.touch();
      return;
    }
    const epoch=this.epoch;
    const {chromium}=await import('playwright');
    const browser = await chromium.launch(this.launchOptions);
    if(epoch!==this.epoch) { await browser.close(); throw new DOMException("查詢已取消", "AbortError"); }
    this.browser = browser;
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    this.checkEpoch(epoch);
    await this.context.route("**/*", async (route) => {
      try {
        const req = route.request();
        if (
          !["GET", "HEAD"].includes(req.method()) ||
          ["image", "media", "font", "websocket"].includes(req.resourceType())
        )
          return route.abort();
        await safeUrl(req.url());
        return route.continue();
      } catch {
        return route.abort();
      }
    });
    this.page = await this.context.newPage();
    this.checkEpoch(epoch);
    this.page.on("download", (d) => d.cancel());
    this.context.on("page", (p) => {
      if (p !== this.page) p.close();
    });
    this.closed = false;
    this.touch();
  }
  async open(url, { timeout = 25000 } = {}) {
    const epoch=this.epoch;
    timeout=Math.max(3000,Math.min(25000,Number(timeout)||25000));
    await safeUrl(url);
    this.checkEpoch(epoch);
    await this.start();
    const response = await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    this.lastResponse = response;
    this.touch();
    this.checkEpoch(epoch);
    return assertReadablePage(await this.read_page(), response?.status());
  }
  async read_page() {
    if (!this.page) throw Error("尚未開啟網頁");
    this.touch();
    return PageExtractor.extract(this.page);
  }
  async get_links({ limit = 100 } = {}) {
    if (!this.page) throw Error("尚未開啟網頁");
    return this.page.locator("a[href]").evaluateAll((as, limit) =>
      as
        .map((a) => ({ text: a.textContent.trim(), url: a.href }))
        .filter((a) => a.text && /^https?:/.test(a.url))
        .slice(0, limit), Math.max(1,Math.min(2000,limit)),
    );
  }
  async click({ url }) {
    return this.open(url);
  } // Read-only navigation, never arbitrary button/form actions.
  async scroll() {
    await this.page?.mouse.wheel(0, 600);
    return this.read_page();
  }
  async back() {
    await this.page?.goBack({ waitUntil: "domcontentloaded" });
    return this.read_page();
  }
  checkEpoch(epoch) { if(epoch!==this.epoch) throw new DOMException("查詢已取消", "AbortError"); }
  async search(query, { limit = 3 } = {}) {
    if(typeof query!=="string" || !query.trim() || query.length>500) throw Error("搜尋字串無效或過長");
    query=query.trim(); limit=Math.max(1,Math.min(3,Number(limit)||3));
    // Paid/API providers already manage their own usage and cache.
    if(this.searchService) return this.searchService.search(query,{limit});
    const key=JSON.stringify([query,limit]), cached=this.cache.get(key);
    if(cached && cached.expires>Date.now()) return {...structuredClone(cached.value),cache_hit:true};
    if(this.inFlight.has(key)) return structuredClone(await this.inFlight.get(key));
    const epoch=this.epoch;
    const task=this.searchQueue.then(async()=>{
      this.checkEpoch(epoch); this.activeSearches++;
      try {
        const value=await this.searchUncached(query,{limit,epoch}); this.checkEpoch(epoch);
        const ttl=/新聞|最新|今天|今日|news|today|latest/i.test(query)?300000:1800000;
        this.cache.set(key,{expires:Date.now()+ttl,value:structuredClone(value)});
        if(this.cache.size>100) this.cache.delete(this.cache.keys().next().value);
        return value;
      } finally {this.activeSearches--; if(this.browser)this.touch();}
    });
    this.searchQueue=task.catch(()=>{}); this.inFlight.set(key,task);
    try{return structuredClone(await task);}finally{this.inFlight.delete(key);}
  }
  async searchUncached(query, { limit = 3, epoch=this.epoch } = {}) {
    if (typeof query !== "string" || query.length > 500)
      throw Error("搜尋字串過長");
    if (/新聞|最新|今天|今日|news|today|latest/i.test(query))
      return this.newsSearch(query, limit, epoch);
    let links = [];
    try {
      await this.open(
        "https://www.bing.com/search?q=" + encodeURIComponent(query),
      );
      links = await this.page
        .locator("li.b_algo h2 a")
        .evaluateAll((as) =>
          as.map((a) => ({ title: a.textContent, url: a.href })),
        );
    } catch {}
    this.checkEpoch(epoch);
    const key = query
      .replace(/site:\S+/g, "")
      .match(/[A-Za-z][A-Za-z0-9.-]{2,}/)?.[0]
      ?.toLowerCase();
    links = links
      .map((l) => {
        try {
        const u = new URL(l.url);
        const encoded = u.searchParams.get("u");
        if (u.hostname.endsWith("bing.com") && encoded?.startsWith("a1")) {
          try {
            l.url = Buffer.from(encoded.slice(2), "base64url").toString();
          } catch {}
        }
        return l;
        } catch { return null; }
      })
      .filter(
        (l) => l && (!key || (l.title + " " + l.url).toLowerCase().includes(key)),
      );
    const results = [];
    for (const link of links.slice(0, Math.min(3, limit))) {
      this.checkEpoch(epoch);
      try {
        results.push(await this.open(link.url));
      } catch {}
    }
    if (results.some((r) => r.body))
      return { query, provider: "Bing", results };
    this.checkEpoch(epoch);
    return this.encyclopediaSearch(query, limit, epoch);
  }
  async encyclopediaSearch(query, limit = 3, epoch=this.epoch) {
    const site = query.match(/site:([\w.-]+)/)?.[1],
      clean = query
        .replace(/site:\S+/g, "")
        .replace(/\bsoftware\b|\bofficial\b/gi, "")
        .replace(/^(搜尋|查詢|上網查)\s*/, "")
        .trim();
    const lang = /[\p{Script=Han}]/u.test(clean) ? "zh" : "en";
    await this.open(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(clean)}&format=json`,
    );
    const data = JSON.parse(await this.lastResponse.text());
    const results = [];
    for (const hit of (data.query?.search || []).slice(0, Math.min(3, limit))) {
      this.checkEpoch(epoch);
      try {
        const page = await this.open(
          `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(hit.title)}`,
        );
        if (site) {
          const official = (await this.get_links({limit:2000})).find((l) => {
            try {
              const h = new URL(l.url).hostname;
              return h === site || h.endsWith("." + site);
            } catch {
              return false;
            }
          });
          if (official) {
            results.push(await this.open(official.url));
            break;
          }
        } else results.push({...page,reliability:"encyclopedia"});
      } catch {}
    }
    this.checkEpoch(epoch);
    if (!results.length)
      throw Error("搜尋引擎暫時無結果或需要人機驗證；請提供官方網址");
    return {
      query,
      provider: "Wikipedia search → source pages (general engine unavailable)",
      results,
    };
  }
  async newsSearch(query, limit, epoch=this.epoch) {
    const clean =
      query
        .replace(
          /請|幫我|搜尋|查詢|今天|今日|最新|有什麼|的|新聞|today|latest|news|search/gi,
          " ",
        )
        .trim() || "AI";
    await this.open(
      "https://news.google.com/rss/search?q=" +
        encodeURIComponent(clean + " when:2d") +
        "&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    );
    const xml = await this.lastResponse.text();
    if (xml.length > 2e6 || /<!DOCTYPE/i.test(xml))
      throw Error("不支援的新聞資料格式");
    const feed = new XMLParser({
      ignoreAttributes: true,
      processEntities: false,
    }).parse(xml);
    const entries = feed.rss?.channel?.item || [];
    const items = (Array.isArray(entries) ? entries : [entries])
      .slice(0, 6)
      .map((i) => ({
        title: String(i.title || ""),
        url: String(i.link || ""),
        date: i.pubDate,
        source: i.source,
        body: String(i.title || ""),
        coverage: "headline-only",
      }));
    const results = [];
    for (const item of items.slice(0, Math.min(limit, 3))) {
      this.checkEpoch(epoch);
      try {
        const page = await this.open(item.url);
        results.push(
          page.source.includes("google.com")
            ? { ...item, retrieved_at: new Date().toISOString() }
            : { ...page, date: page.date || item.date, coverage: "article" },
        );
      } catch {
        results.push({ ...item, retrieved_at: new Date().toISOString() });
      }
    }
    this.checkEpoch(epoch);
    if (!results.length) throw Error("新聞來源暫時不可用");
    return {
      query,
      provider: "Google News RSS",
      notice:
        "標示 headline-only 的結果只取得標題，不能宣稱已閱讀全文；請保留原始發布日期。",
      results,
    };
  }
  async close() {
    this.epoch++;
    await this.searchService?.close?.();
    clearTimeout(this.timer);
    const b = this.browser;
    this.browser = null;
    this.page = null;
    this.context = null;
    this.closed = true;
    await b?.close();
  }
}
