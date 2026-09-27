export class SearchProvider {
  async search(query, options = {}) {
    throw Error("SearchProvider.search not implemented");
  }
  cancel() {}
}
export class TavilySearchProvider extends SearchProvider {
  constructor({ apiKey, fetcher = fetch }) {
    super();
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.name = "Tavily";
  }
  cancel() {
    this.controller?.abort();
  }
  async search(query, { limit = 3 } = {}) {
    if (!this.apiKey)
      throw Error("尚未設定 Tavily API 金鑰，請執行 Configure-Search.ps1");
    const news = /新聞|news/i.test(query),
      today = /今天|今日|today/i.test(query);
    const domains = [...query.matchAll(/site:([a-z0-9.-]+)/gi)]
      .map((m) => m[1])
      .slice(0, 5);
    this.controller = new AbortController();
    let response;
    try {
      response = await this.fetcher("https://api.tavily.com/search", {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: "Bearer " + this.apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(15000),
        ]),
        body: JSON.stringify({
          query,
          search_depth: "basic",
          auto_parameters: false,
          max_results: Math.max(1, Math.min(3, limit)),
          topic: news ? "news" : "general",
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          include_usage: true,
          ...(domains.length ? { include_domains: domains } : {}),
          ...(today ? { time_range: "day" } : {}),
        }),
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw Error("搜尋 API 暫時無法連線");
    }
    if (!response.ok) {
      const reason = [401, 403].includes(response.status)
        ? "金鑰無效或未獲授權"
        : response.status === 429
          ? "頻率或額度限制"
          : response.status === 432
            ? "額度不足"
            : `服務回應 ${response.status}`;
      throw Error("Tavily 搜尋失敗：" + reason);
    }
    const data = await response.json();
    const results = (Array.isArray(data.results) ? data.results : [])
      .slice(0, limit)
      .flatMap((r) => {
        try {
          const u = new URL(r.url);
          if (
            !["http:", "https:"].includes(u.protocol) ||
            u.username ||
            u.password
          )
            return [];
          return [
            {
              title: String(r.title || u.hostname).slice(0, 500),
              url: u.href,
              source: u.hostname,
              date: r.published_date || null,
              body: String(r.content || "").slice(0, 12000),
              coverage: "search-excerpt",
              retrieved_at: new Date().toISOString(),
            },
          ];
        } catch {
          return [];
        }
      })
      .filter((r) => r.body);
    if (!results.length) throw Error("搜尋 API 沒有找到可用資料");
    return {
      query,
      provider: this.name,
      notice:
        "內容為搜尋來源摘要，未必是文章全文。只有另行讀取頁面後才能宣稱已讀全文。",
      results,
    };
  }
}
export class SearchService {
  constructor({
    provider,
    db,
    monthlyLimit = 900,
    bus,
    now = () => Date.now(),
  }) {
    Object.assign(this, { provider, db, monthlyLimit, bus, now });
    this.cache = new Map();
    this.pending = new Map();
    db.exec(
      "CREATE TABLE IF NOT EXISTS search_usage(month TEXT PRIMARY KEY,requests INTEGER NOT NULL)",
    );
  }
  status() {
    const month = new Date(this.now()).toISOString().slice(0, 7),
      used =
        this.db
          .prepare("SELECT requests FROM search_usage WHERE month=?")
          .get(month)?.requests || 0;
    return {
      provider: this.provider.name,
      configured: !!this.provider.apiKey,
      month,
      requests: used,
      monthlyLimit: this.monthlyLimit,
    };
  }
  async search(query, { limit = 3 } = {}) {
    if (typeof query !== "string" || !query.trim() || query.length > 500)
      throw Error("搜尋字串需為 1–500 字元");
    const key = JSON.stringify([query.trim().toLowerCase(), limit]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now())
      return { ...structuredClone(cached.data), cache_hit: true };
    if (this.pending.has(key))
      return structuredClone(await this.pending.get(key));
    const task = this.perform(query, { limit }, key);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  async perform(query, options, key) {
    const s = this.status();
    if (!s.configured)
      throw Error("尚未設定 Tavily API 金鑰，請執行 Configure-Search.ps1");
    // Reserve before network IO; uncertain/failed requests remain counted to prevent overspend.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const used =
        this.db
          .prepare("SELECT requests FROM search_usage WHERE month=?")
          .get(s.month)?.requests || 0;
      if (used >= this.monthlyLimit)
        throw Error("已到本機搜尋月用量上限；未發送 API 請求");
      this.db
        .prepare(
          "INSERT INTO search_usage VALUES(?,1) ON CONFLICT(month) DO UPDATE SET requests=requests+1",
        )
        .run(s.month);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.bus?.publish("search", { provider: this.provider.name });
    const data = await this.provider.search(query, options);
    const ttl = /今天|今日|最新|新聞|news|today|latest/i.test(query)
      ? 300000
      : 1800000;
    if (this.cache.size >= 100)
      this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, {
      data: structuredClone(data),
      expires: this.now() + ttl,
    });
    return { ...data, cache_hit: false };
  }
  close() {
    this.provider.cancel();
  }
}
