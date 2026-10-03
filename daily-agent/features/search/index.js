import { BrowserAgent } from "../../browser/BrowserAgent.js";
import {
  SearchService,
  TavilySearchProvider,
} from "../../browser/SearchProvider.js";
import {
  SearXNGProvider,
  LightSearchBrowser,
} from "../../browser/SearXNGProvider.js";
import * as conversation from "./Conversation.js";
import {XngHubClient} from '../../browser/XngHubClient.js';
export function create({ config, memory, bus }) {
  const engineHealth = new Map(),
    searchCache = new Map();
  const provider = () =>
    new SearXNGProvider({
      endpoint: config.searxngUrl,
      engineHealth,
      searchCache,
    });
  const localFullSearch = new LightSearchBrowser(
    provider(),
    new BrowserAgent({ idleMs: 1000 }),
  );
  const localIdleBrowser = new LightSearchBrowser(
    provider(),
    new BrowserAgent({ idleMs: 1000 }),
  );
  const fullSearch=config.searchProvider==='searxng'&&config.xngHubUrl?new XngHubClient({endpoint:config.xngHubUrl,fallback:localFullSearch}):localFullSearch;
  const idleBrowser=config.xngHubUrl?new XngHubClient({endpoint:config.xngHubUrl,fallback:localIdleBrowser}):localIdleBrowser;
  if (!["browser", "tavily", "searxng"].includes(config.searchProvider))
    throw Error("不支援的 Search Provider");
  const searchService =
    config.searchProvider === "tavily"
      ? new SearchService({
          provider: new TavilySearchProvider({ apiKey: config.searchApiKey }),
          db: memory.db,
          monthlyLimit: config.searchMonthlyLimit,
          bus,
        })
      : config.searchProvider === "searxng"
        ? fullSearch
        : null;
  const browser = new BrowserAgent({
    idleMs: config.browserIdleMs,
    searchService,
  });
  return {
    browser,
    idleBrowser,
    conversation,
    routes: [
      {
        method: "GET",
        path: "/",
        handle: () =>
          searchService?.status() || {
            provider: "browser",
            configured: true,
            paid: false,
          },
      },
    ],
    async dispose() {
      await Promise.allSettled([
        browser.close(),
        idleBrowser.close(),
        fullSearch.close(),
      ]);
    },
  };
}
