import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAgent } from "../core/createAgent.js";
import { companionEvent } from "../core/CompanionEvents.js";
const exec = promisify(execFile),
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
const directory = path.resolve("test-output/v02-" + Date.now());
const agent = createAgent({ dataDir: directory, lightLookup: false });
const report = {
  started: new Date().toISOString(),
  dataDir: directory,
  events: [],
  samples: [],
};
agent.bus.on("event", (e) => {
  if (
    [
      "model_loaded",
      "model_unloaded",
      "state",
      "pet_bubble",
      "weather_refresh",
    ].includes(e.type)
  )
    report.events.push(e);
});
const models = () => agent.full.request("/api/ps").then((r) => r.models);
const resources = async () => ({
  models: await models(),
  gpu: (
    await exec(
      "nvidia-smi",
      [
        "--query-gpu=memory.used,utilization.gpu",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true },
    )
  ).stdout.trim(),
});
try {
  agent.start();
  console.log("Real 4B chat");
  report.chat = await agent.chat("請記住測試代號是青葉。用一句話回答。");
  assert.match(report.chat.content, /青葉/);
  report.active = await resources();
  console.log("Actual model unload at five-minute boundary");
  await agent.exclusive(() =>
    agent.tick(agent.states.lastInteraction + 300001),
  );
  assert.equal(agent.states.state, "IDLE");
  report.idle = await resources();
  assert.equal(report.idle.models.length, 0);
  console.log(
    "Real Windows/IP location -> Open-Meteo; weather question must remain Idle",
  );
  report.weatherAnswer = await agent.chat("今天天氣？");
  report.location = agent.companion.location.status();
  report.weather = agent.companion.weather.status();
  assert.ok(report.weather.state, report.weather.error);
  assert.equal(agent.states.state, "IDLE");
  assert.equal((await models()).length, 0);
  report.watchers = {
    process: agent.perception.snapshot().process,
    network: agent.perception.snapshot().network,
    battery: agent.perception.snapshot().battery,
  };
  console.log(
    "Synthetic rain event -> real CPU sentence -> unload; sample actual model residency",
  );
  agent.companion.pending.clear();
  agent.companion.decision.lastSpoke = 0;
  agent.companion.enqueue(
    companionEvent(
      "HEAVY_RAIN_INCOMING",
      {
        forecast: true,
        rain: 9,
        temperature: 25,
        source: "TEST FIXTURE, not live forecast",
      },
      92,
    ),
  );
  const sampling = setInterval(async () => {
    try {
      report.samples.push(await models());
    } catch {}
  }, 500);
  try {
    report.speech = await agent.exclusive(() => agent.companion.tick(600000));
  } finally {
    clearInterval(sampling);
  }
  assert.ok(report.speech, "expected CPU-generated bubble");
  assert.match(report.speech, /大雨|強降雨/);
  const residents = report.samples.flat();
  assert.ok(residents.some((m) => m.name === agent.config.idleModel));
  assert.ok(
    residents.every(
      (m) => m.size_vram === 0 && m.name !== agent.config.fullModel,
    ),
  );
  report.afterSpeech = await resources();
  assert.equal(report.afterSpeech.models.length, 0);
  assert.equal(agent.browser.closed, true);
  report.wake = await agent.chat("剛剛測試代號是什麼？你說的提醒是什麼？");
  assert.match(report.wake.content, /青葉/);
  assert.equal(agent.states.state, "ACTIVE");
  console.log("Wake and context continuity passed");
  await agent.exclusive(() => agent.enterIdle());
  await delay(1000);
  report.finalIdle = await resources();
  report.passed = true;
} catch (e) {
  report.error = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  await agent.stop().catch((e) => {
    report.stopError = e.message;
  });
  fs.writeFileSync(
    "test-output/companion-v02-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        error: report.error,
        speech: report.speech,
        location: report.location,
        weather: report.weatherAnswer,
        active: report.active?.gpu,
        idle: report.idle?.gpu,
        afterSpeech: report.afterSpeech?.gpu,
      },
      null,
      2,
    ),
  );
}
