import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createAgent } from "../core/createAgent.js";
import { RemoteGateway } from "../remote/RemoteGateway.js";
const dir = path.resolve("test-output/mobile-model-" + Date.now());
await fs.mkdir(dir, { recursive: true });
const agent =await createAgent({
  dataDir: path.join(dir, "data"),
  perception: false,
  lightLookup: false,
  weatherEnabled: false,
});
agent.remote.gateway = new RemoteGateway(agent, { port: 0 });
const report = { started: new Date().toISOString() };
try {
  const status = await (await fetch("http://127.0.0.1:11435/api/ps")).json();
  assert.equal(
    status.models.length,
    0,
    "Run only when existing Ollama models are idle/unloaded",
  );
  await agent.remote.gateway.start();
  const paired = agent.remote.devices.pair(
    agent.remote.devices.begin().code,
    "Model smoke",
  );
  const call = async (route, data) => {
    const r = await fetch(
      `http://127.0.0.1:${agent.remote.gateway.port}${route}`,
      {
        method: data ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + paired.token,
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      },
    );
    const value = await r.json();
    if (!r.ok) throw Error(value.error);
    return value;
  };
  const ask = async (data) => {
    const job = await call("/v1/jobs", data);
    let result;
    for (let n = 0; n < 300; n++) {
      result = await call("/v1/jobs/" + job.id);
      if (result.state !== "running") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal(result.state, "done", result.error);
    return result.text;
  };
  console.log("Real Qwen chat through authenticated mobile gateway");
  report.chat = await ask({ text: "請用一句繁體中文回答：你能陪我聊天嗎？" });
  assert.ok(report.chat.length > 3);
  console.log("Image question through mobile gateway");
  const image = (await fs.readFile("test-output/vision-427.png")).toString(
    "base64",
  );
  report.image = await ask({
    text: "圖片中最大的數字是什麼？只回答數字。",
    image,
  });
  assert.match(report.image, /427/);
  console.log("Shared document through mobile gateway");
  const share = path.join(dir, "shared");
  await fs.mkdir(share);
  const file = path.join(share, "remote-note.txt");
  await fs.writeFile(
    file,
    "手機連線驗證專案的辨識碼是 LUMI-7392，文件只供測試。",
  );
  await agent.remote.files.add(share);
  assert.equal((await call("/v1/files?q=remote-note")).files.length, 1);
  report.document = await ask({
    text: "這份文件的辨識碼是什麼？只回答辨識碼。",
    file,
  });
  assert.match(report.document, /LUMI-7392/);
  await agent.exclusive(() => agent.enterIdle());
  report.idle = await agent.status();
  assert.equal(report.idle.state, "IDLE");
  assert.equal(report.idle.models.length, 0);
  report.passed = true;
} catch (e) {
  report.error = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  await agent.stop();
  await fs.writeFile(
    path.join(dir, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(path.join(dir, "report.json"));
}
