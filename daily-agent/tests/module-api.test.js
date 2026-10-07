import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("plugin API uses central authentication, disabled mobile returns 503, settings preserve plugin registration", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-module-api-"));
  fs.writeFileSync(
    path.join(dir, "modules.json"),
    JSON.stringify({
      enabled: { environment: false, images: false, mobile: false },
      plugins: [{ id: "example", entry: "example/index.js", enabled: true }],
    }),
  );
  const model = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(req.url === "/api/ps" ? '{"models":[]}' : "{}");
  });
  await new Promise((resolve) => model.listen(0, "127.0.0.1", resolve));
  const reserve = http.createServer();
  await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      DAILY_DATA: dir,
      DAILY_PORT: String(port),
      OLLAMA_HOST_URL: `http://127.0.0.1:${model.address().port}`,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (b) => (output += b));
  child.stdout.on("data", (b) => (output += b));
  const base = `http://127.0.0.1:${port}`;
  try {
    let html;
    for (let i = 0; i < 60; i++) {
      try {
        html = await fetch(base).then((r) => r.text());
        break;
      } catch {
        await pause(100);
      }
    }
    assert.ok(html, output);
    const token = html.match(/name="daily-token" content="([a-f0-9]+)"/)[1];
    const request = (route, body, auth = true) =>
      fetch(base + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(auth ? { "x-daily-token": token } : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    assert.equal(
      (await request("/api/modules/example/ping", undefined, false)).status,
      401,
    );
    assert.equal(
      (await (await request("/api/modules/example/ping")).json()).message,
      "插件 API 正常",
    );
    assert.equal((await request("/api/modules/images/")).status, 503);
    assert.equal((await request('/api/modules/backup',undefined,false)).status,401);
    assert.equal((await request('/api/modules/backup')).status,200);
    assert.equal((await (await request('/api/modules/backup')).json()).connected,false);
    assert.equal((await request('/api/modules/backup/login',{},false)).status,401);
    const noClient=await request('/api/modules/backup/login',{});
    assert.equal(noClient.status,500);
    assert.match((await noClient.json()).error,/尚未設定 Google OAuth/);
    assert.equal(
      (
        await request(
          "/api/modules/appearance/classify",
          { image: "invalid", rowCount: 2 },
          false,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/api/modules/appearance/classify", {
          image: "invalid",
          rowCount: 2,
        })
      ).status,
      400,
    );
    assert.equal(
      (await request("/api/chat", { text: "開啟手機配對" })).status,
      503,
    );
    const result = await request("/api/modules/configure", {
      id: "documents",
      enabled: false,
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).restartRequired, true);
    const saved = JSON.parse(
      fs.readFileSync(path.join(dir, "modules.json"), "utf8"),
    );
    assert.equal(saved.plugins[0].id, "example");
    assert.equal(saved.enabled.documents, false);
    assert.equal((await request("/api/modules")).status, 200);
    const retired = "pocket" + "drop";
    assert.equal((await request("/api/" + retired)).status, 404);
    assert.equal((await request("/api/modules/" + retired)).status, 503);
    assert.ok(!(await (await request("/api/modules")).json()).modules.some(m => m.id === retired));
    assert.equal((await request("/api/shutdown", {})).status, 200);
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      pause(5000),
    ]);
  } finally {
    child.kill();
    await new Promise((resolve) => model.close(resolve));
    await pause(100);
    fs.rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
