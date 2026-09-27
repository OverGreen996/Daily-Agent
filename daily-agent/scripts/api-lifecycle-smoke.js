import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.DAILY_UI_URL || "http://127.0.0.1:3211";
const html = await fetch(base).then((r) => r.text());
const token = html.match(/name="daily-token" content="([^"]+)/)[1];
const call = async (p, data) => {
  const r = await fetch(base + "/api/" + p, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-daily-token": token },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
};
const report = {};
try {
  report.idle = await call("idle", {});
  assert.equal(report.idle.state, "IDLE");
  assert.equal(report.idle.lifecycle.gpu_owner, null);
  assert.ok(report.idle.models.every((m) => m.size_vram === 0));
  report.wake = await call("chat", { text: "你記得這場UI測試的稱呼嗎？" });
  assert.match(report.wake.content, /阿澄/);
  report.passed = true;
} finally {
  report.shutdown = await call("shutdown", {});
  fs.writeFileSync(
    "test-output/api-lifecycle-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log({
    passed: report.passed,
    idle: report.idle?.lifecycle,
    wake: report.wake?.content,
    shutdown: report.shutdown,
  });
}
