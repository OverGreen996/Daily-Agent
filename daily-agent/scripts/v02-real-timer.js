import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAgent } from "../core/createAgent.js";
const exec = promisify(execFile);
const agent =await createAgent({
  dataDir: path.resolve("test-output/v02-timer-" + Date.now()),
  weatherEnabled: false,
  lightLookup: false,
});
const report = { samples: [], states: [] };
agent.bus.on("event", (e) => {
  if (e.type === "state") report.states.push(e);
});
try {
  agent.start();
  await agent.chat("這是自動休息計時測試。只回答收到。");
  report.lastInteraction = agent.states.lastInteraction;
  report.active = (await agent.full.request("/api/ps")).models;
  assert.ok(
    report.active.some(
      (m) => m.name === agent.config.fullModel && m.size_vram > 0,
    ),
  );
  console.log(
    "Started real five-minute inactivity at " +
      new Date(report.lastInteraction).toISOString(),
  );
  while (Date.now() - report.lastInteraction < 345000) {
    await new Promise((r) => setTimeout(r, 15000));
    const elapsedMs = Date.now() - report.lastInteraction;
    report.samples.push({ elapsedMs, state: agent.states.state });
    console.log(Math.round(elapsedMs / 1000), agent.states.state);
    if (elapsedMs < 300000) assert.equal(agent.states.state, "ACTIVE");
    if (agent.states.state === "IDLE") {
      report.elapsedMs = elapsedMs;
      break;
    }
  }
  assert.equal(agent.states.state, "IDLE");
  report.models = (await agent.full.request("/api/ps")).models;
  assert.equal(report.models.length, 0);
  report.timingPassed = true;
  report.resources = JSON.parse(
    (
      await exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/measure-resources.ps1",
          "-AgentProcessId",
          String(process.pid),
        ],
        { windowsHide: true },
      )
    ).stdout,
  );
  report.gpu = (
    await exec(
      "nvidia-smi",
      [
        "--query-gpu=memory.used,utilization.gpu",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true },
    )
  ).stdout.trim();
  const snapshot = agent.perception.snapshot();
  report.watchers = {
    network: snapshot.network,
    battery: snapshot.battery,
    process: snapshot.process,
  };
  report.passed = true;
} catch (e) {
  report.error = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  await agent.stop();
  fs.writeFileSync(
    "test-output/v02-real-timer-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      elapsedMs: report.elapsedMs,
      ramMiB: report.resources?.totalRamBytes / 1024 ** 2,
      gpu: report.gpu,
    }),
  );
}
