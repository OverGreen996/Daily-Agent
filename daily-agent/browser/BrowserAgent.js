// Standalone read-only public-page browser; no bundled search engine.
import dns from "node:dns/promises";
import net from "node:net";
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
  if (/^(just a moment|access denied|attention required|robot check|client challenge|security verification|verify.*human)/i.test(page.title?.trim() || "") ||
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
  async search(query, {limit=3}={}) {
    if(typeof query!=="string" || !query.trim() || query.length>500) throw Error("搜尋字串無效或過長");
    if(!this.searchService) throw Object.assign(Error("搜尋尚未設定，請設定搜尋 API；聊天、記憶與其他功能仍可使用。"),{code:"SEARCH_NOT_CONFIGURED"});
    return this.searchService.search(query.trim(),{limit:Math.max(1,Math.min(3,Number(limit)||3))});
  }
  async close() {
    this.epoch++;
    // Closing a page/entering idle cancels requests but must keep the search settings store reusable.
    if(this.searchService?.cancel)await this.searchService.cancel();
    else await this.searchService?.close?.();
    clearTimeout(this.timer);
    const b = this.browser;
    this.browser = null;
    this.page = null;
    this.context = null;
    this.closed = true;
    await b?.close();
  }
}
