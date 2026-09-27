import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createAgent } from "../core/createAgent.js";
import { SystemTools, run } from "../tools/BasicTools.js";
const output = path.resolve("test-output");
fs.mkdirSync(output, { recursive: true });
const agent = createAgent({
  dataDir: path.join(output, "smoke-" + Date.now()),
  perception: false,
  lightLookup: false,
  weatherEnabled: false,
});
const report = { started: new Date().toISOString() };
const step = (s) => console.log(new Date().toISOString(), s);
try {
  report.baseline = await SystemTools.info();
  step("Real Qwen 4B conversation");
  report.chat = await agent.chat(
    "請記住，我的稱呼是阿澄。請用一句繁體中文向我打招呼。",
  );
  assert.match(report.chat.content, /阿澄/);
  report.active = await agent.status();
  report.activeSystem = await SystemTools.info();
  step("Real hybrid memory index + raw source");
  const ids = [];
  for (const text of [
    "主人偏好遊戲時不要載入本地模型，因為需要把GPU顯存留給其他工作。",
    "日常助理預設模型是 Qwen3.5 4B，工作上下文16K。",
  ])
    ids.push(agent.memory.working.add("user", text, "架構測試"));
  agent.memory.working.add("user", "現在改談3D列印支撐材。", "3D列印");
  report.flush = await agent.memory.flush({ force: true });
  report.retrieval =
    await agent.memory.retriever.search("我是不是說過玩遊戲要把 AI 關掉？");
  assert.ok(report.retrieval.some((c) => c.text.includes("不要載入")));
  step("Real headless Chromium search and extraction");
  report.search = await agent.browser.search(
    "Archicad software site:graphisoft.com",
    { limit: 2 },
  );
  assert.ok(report.search.results.some((r) => r.body));
  report.headless = agent.browser.launchOptions.headless;
  await agent.browser.close();
  assert.equal(agent.browser.closed, true);
  step("Real web summary through AgentCore");
  report.summary = await agent.chat(
    "請摘要 https://www.example.com/ 的內容，附上來源。",
  );
  step("Five-minute boundary -> actual unload + CPU idle load");
  agent.states.lastInteraction = Date.now() - 300001;
  await agent.exclusive(() => agent.tick());
  report.idle = await agent.status();
  report.idleSystem = await SystemTools.info();
  assert.equal(report.idle.state, "IDLE");
  assert.ok(!report.idle.models.some((m) => m.name === "qwen3.5:4b"));
  assert.equal(
    report.idle.models.some((m) => m.name === agent.config.idleModel),
    false,
  );
  report.processes = (
    await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-Process ollama,node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json",
      ],
      { windowsHide: true },
    )
  ).stdout;
  step("Real CPU-only autonomous sentence selected by SpeakDecisionEngine");
  agent.perception.current = {
    process: "ZBrush",
    title: "ZBrush - character",
    idleMs: 0,
    since: Date.now() - 3600000,
  };
  agent.companion.boredom.value = 80;
  report.idleSpeech = await agent.companion.tick(3600000);
  assert.ok(report.idleSpeech);
  report.idleAfterSpeech = await agent.status();
  assert.equal(
    report.idleAfterSpeech.models.some(
      (m) => m.name === agent.config.idleModel,
    ),
    false,
  );
  step("Wake full model and recall identity");
  report.wake = await agent.chat(
    "我回來了，你記得我的稱呼嗎？剛剛你有說什麼？",
  );
  assert.match(report.wake.content, /阿澄/);
  assert.equal(agent.states.state, "ACTIVE");
  report.passed = true;
} catch (e) {
  report.error = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    path.join(output, "smoke-report.json"),
    JSON.stringify(report, null, 2),
  );
  await agent.stop().catch(console.error);
  step("Report saved to test-output/smoke-report.json");
}
