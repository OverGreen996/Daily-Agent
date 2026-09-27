import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  TavilySearchProvider,
  SearchService,
} from "../browser/SearchProvider.js";
import { BrowserAgent } from "../browser/BrowserAgent.js";
const response = () => ({
  ok: true,
  json: async () => ({
    results: [
      {
        title: "Official update",
        url: "https://example.com/news",
        content: "Verified search excerpt",
        published_date: "2026-09-27",
      },
      { title: "invalid", url: "file:///private", content: "blocked" },
    ],
  }),
});
test("provider uses fixed API endpoint, basic depth, no hosted answer, normalized excerpt metadata", async () => {
  let request;
  const p = new TavilySearchProvider({
    apiKey: "tvly-test-only-not-real",
    fetcher: async (url, init) => {
      request = { url, ...init };
      return response();
    },
  });
  const r = await p.search("今天 AI 新聞 site:example.com");
  const body = JSON.parse(request.body);
  assert.equal(request.url, "https://api.tavily.com/search");
  assert.equal(request.redirect, "error");
  assert.equal(body.search_depth, "basic");
  assert.equal(body.auto_parameters, false);
  assert.equal(body.include_answer, false);
  assert.equal(body.topic, "news");
  assert.equal(body.time_range, "day");
  assert.deepEqual(body.include_domains, ["example.com"]);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].coverage, "search-excerpt");
  assert.equal(r.results[0].date, "2026-09-27");
  assert.ok(!JSON.stringify(r).includes("tvly-"));
});
test("cache and concurrent dedup avoid repeated API usage; monthly cap blocks network calls", async () => {
  const db = new DatabaseSync(":memory:");
  let calls = 0,
    now = 1790480000000;
  const provider = new TavilySearchProvider({
    apiKey: "test",
    fetcher: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return response();
    },
  });
  const service = new SearchService({
    provider,
    db,
    monthlyLimit: 1,
    now: () => now,
  });
  const [a, b] = await Promise.all([
    service.search("今天 AI 新聞"),
    service.search("今天 AI 新聞"),
  ]);
  assert.equal(calls, 1);
  a.results[0].body = "mutated";
  assert.notEqual(b.results[0].body, "mutated");
  assert.equal((await service.search("今天 AI 新聞")).cache_hit, true);
  assert.equal(service.status().requests, 1);
  now += 300001;
  await assert.rejects(() => service.search("今天 AI 新聞"), /上限/);
  assert.equal(calls, 1);
  db.close();
});
test("missing key makes no network call; errors never expose vendor body or credential", async () => {
  let called = false;
  const db = new DatabaseSync(":memory:");
  const p = new TavilySearchProvider({
    apiKey: "",
    fetcher: async () => {
      called = true;
    },
  });
  const s = new SearchService({ provider: p, db });
  await assert.rejects(() => s.search("hello"), /尚未設定/);
  assert.equal(s.status().requests, 0);
  assert.equal(called, false);
  p.apiKey = "tvly-secret-test";
  p.fetcher = async () => ({
    ok: false,
    status: 401,
    text: async () => p.apiKey,
  });
  await assert.rejects(
    () => s.search("hello"),
    (e) => e.message.includes("金鑰無效") && !e.message.includes(p.apiKey),
  );
  assert.equal(s.status().requests, 1);
  db.close();
});
test("API search works without launching Chromium, and close cancels pending API work", async () => {
  let closed = false;
  const b = new BrowserAgent({
    searchService: {
      search: async () => ({ provider: "test", results: [] }),
      close: () => (closed = true),
    },
  });
  b.start = () => {
    throw Error("must not launch browser for API search");
  };
  assert.equal((await b.search("question")).provider, "test");
  assert.equal(b.closed, true);
  await b.close();
  assert.equal(closed, true);
});
