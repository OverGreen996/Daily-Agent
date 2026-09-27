import { config } from "../config.js";
import {
  TavilySearchProvider,
  SearchService,
} from "../browser/SearchProvider.js";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
if (!config.searchApiKey) {
  console.log(
    "NOT RUN: no Tavily API key. Run Configure-Search.ps1 locally, then rerun this script.",
  );
  process.exit(2);
}
const db = new DatabaseSync(path.join(config.dataDir, "palace.sqlite"));
const service = new SearchService({
  provider: new TavilySearchProvider({ apiKey: config.searchApiKey }),
  db,
  monthlyLimit: config.searchMonthlyLimit,
});
try {
  const result = await service.search("今天 AI 新聞");
  fs.mkdirSync("test-output", { recursive: true });
  fs.writeFileSync(
    "test-output/search-api-report.json",
    JSON.stringify(result, null, 2),
  );
  console.log({
    provider: result.provider,
    results: result.results.map((r) => ({
      title: r.title,
      url: r.url,
      date: r.date,
    })),
    usage: service.status(),
  });
} finally {
  service.close();
  db.close();
}
