const official = {
  archicad: "graphisoft.com",
  zbrush: "maxon.net",
  photoshop: "adobe.com",
  blender: "blender.org",
  notepad: "microsoft.com",
};
export function entityKey(name) { return String(name || "unknown").toLowerCase().replace(/\.exe$/, ""); }
export class LightWebLookup {
  constructor(memory, browser) {
    Object.assign(this, { memory, browser });
    this.lastLookup = 0;
    this.failures = new Map();
    this.inFlight = new Map();
  }
  async lookup(name, options = {}) {
    const key=entityKey(name);
    if(this.inFlight.has(key))return this.inFlight.get(key);
    const task=this.lookupOnce(key,options); this.inFlight.set(key,task);
    try{return await task;}finally{this.inFlight.delete(key);}
  }
  async lookupOnce(key, { force = false } = {}) {
    const known = this.memory.entities.get(key);
    if (known) return { ...known, memory_hit: true };
    if (
      !/^[a-z][a-z0-9 ._-]{1,50}$/i.test(key) ||
      [
        "unknown",
        "codex",
        "powershell",
        "pwsh",
        "msedge",
        "chrome",
        "explorer",
      ].includes(key)
    )
      return null;
    if (
      !force &&
      (Date.now() - this.lastLookup < 600000 ||
        Date.now() - (this.failures.get(key) || 0) < 3600000)
    )
      return null;
    this.lastLookup = Date.now();
    try {
      const q = official[key]
        ? `${key} software site:${official[key]}`
        : `${key} software official`;
      const data = await this.browser.search(q, { limit: 2 });
      const pages = data.results.filter(
        (r) =>
          r.body &&
          r.coverage !== "search-excerpt" && r.coverage !== "headline-only" &&
          (official[key] || (r.title+" "+r.url).toLowerCase().includes(key)) &&
          (!official[key] ||
            new URL(r.url).hostname === official[key] ||
            new URL(r.url).hostname.endsWith("." + official[key])),
      );
      if (!pages.length) throw Error("無可靠來源");
      if(!official[key] && !pages.some(p=>(p.title+" "+p.url).toLowerCase().includes(key))) throw Error("來源與軟體名稱不符");
      const meaning=[pages[0].description,pages[0].body].filter(Boolean).join("\n").slice(0,1200);
      const activity=/\bBIM\b|building information model|建築資訊模型/i.test(meaning) ? "可能正在建築設計／BIM 建模" :
        /vector graphics|vector editor|向量繪圖/i.test(meaning) ? "可能正在向量繪圖" :
        /3D.*(?:creat|model|sculpt)|3D CG|三維|三維建模/i.test(meaning) ? "可能正在製作 3D 內容" : "尚待更多證據";
      const entry = {
        entity: key,
        type: "software",
        meaning,
        likely_activity: activity,
        confidence: official[key] ? 0.85 : pages[0].reliability==="encyclopedia" ? 0.65 : 0.45,
        source: pages.map((p) => ({
          url: p.url,
          title: p.title,
          retrieved_at: p.retrieved_at,
        })),
        last_seen: new Date().toISOString(),
      };
      if (this.memory.learnEntity) await this.memory.learnEntity(entry);
      else this.memory.entities.save(key, entry);
      return entry;
    } catch (e) {
      if(e.name==="AbortError")return null;
      this.failures.set(key, Date.now());
      if(this.failures.size>128)this.failures.delete(this.failures.keys().next().value);
      return null;
    } finally {
      await this.browser.close();
    }
  }
}
