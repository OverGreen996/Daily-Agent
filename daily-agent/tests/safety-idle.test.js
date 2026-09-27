import test from "node:test";
import assert from "node:assert/strict";
import { PermissionBroker } from "../tools/ToolBroker.js";
import { isPublicIP, safeUrl } from "../browser/BrowserAgent.js";
import { StateManager } from "../core/StateManager.js";
import { SpeakDecisionEngine } from "../idle/SpeakDecisionEngine.js";
import { AgentCore } from "../core/AgentCore.js";
import { LightWebLookup } from "../idle/LightWebLookup.js";
const lifecycleFor = (agent) => ({
  save_runtime_state: async () => agent.memory.checkpoint(),
  restore_runtime_state: async () => {},
  load_model: (role) =>
    (role === "FULL_LLM" ? agent.full : agent.idleRuntime).load(),
  unload_model: (role) =>
    (role === "FULL_LLM" ? agent.full : agent.idleRuntime).unload(),
});
test("broker denies forbidden tools, extra args, and unsolicited clipboard access", () => {
  const b = new PermissionBroker();
  for (const tool of [
    "shell",
    "delete_file",
    "registry_write",
    "automatic_upload",
    "payment",
  ])
    assert.throws(() => b.authorize(tool, {}, { source: "user" }));
  assert.throws(() =>
    b.authorize("clipboard_read", {}, { source: "user", userText: "摘要網頁" }),
  );
  assert.throws(() =>
    b.authorize("web_search", { query: "hi", shell: "x" }, { source: "user" }),
  );
  assert.ok(b.authorize("web_search", { query: "hi" }, { source: "user" }));
});
test("public URL restrictions", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.2",
    "::1",
    "::ffff:127.0.0.1",
    "169.254.169.254",
  ])
    assert.equal(isPublicIP(ip), false);
  assert.equal(isPublicIP("8.8.8.8"), true);
  for (const u of [
    "file:///etc/passwd",
    "http://127.0.0.1",
    "https://user:pass@example.com",
  ])
    await assert.rejects(() => safeUrl(u));
});
test("idle timeout, unload order, wake continuity, transition logs", async () => {
  const events = [],
    calls = [];
  const bus = { publish: (t, d) => events.push({ t, ...d }) };
  const agent = new AgentCore({
    config: { idleAfterMs: 300000 },
    bus,
    memory: { checkpoint: () => calls.push("save") },
    browser: { close: async () => calls.push("browser") },
    vision: { close: async () => calls.push("vision") },
    full: {
      unload: async () => calls.push("unloadFull"),
      load: async () => calls.push("loadFull"),
    },
    idleRuntime: {
      load: async () => calls.push("loadIdle"),
      unload: async () => calls.push("unloadIdle"),
    },
    companion: { tick: async () => {} },
  });
  agent.lifecycle = lifecycleFor(agent);
  const start = agent.states.lastInteraction;
  await agent.tick(start + 299999);
  assert.equal(agent.states.state, "ACTIVE");
  await agent.tick(start + 300000);
  assert.equal(agent.states.state, "IDLE");
  assert.ok(calls.includes("unloadFull"));
  assert.equal(
    calls.includes("loadIdle"),
    false,
    "CPU model is on demand, not loaded upon entering Idle",
  );
  await agent.wake();
  assert.equal(agent.states.state, "ACTIVE");
  assert.deepEqual(
    events.filter((e) => e.t === "state").map((e) => e.state),
    ["IDLE", "WAKING", "ACTIVE"],
  );
});
test("unload failure never reports successful Idle", async () => {
  const agent = new AgentCore({
    config: {},
    bus: { publish() {} },
    memory: { checkpoint() {} },
    browser: { close: async () => {} },
    vision: { close: async () => {} },
    full: {
      unload: async () => {
        throw Error("still loaded");
      },
    },
    idleRuntime: {
      load: async () => {
        throw Error("must not load");
      },
    },
  });
  agent.lifecycle = lifecycleFor(agent);
  await assert.rejects(() => agent.enterIdle());
  assert.equal(agent.states.state, "ACTIVE");
});
test("speak score is activity-based; semantic duplicate and cooldown suppressed", async () => {
  const e = new SpeakDecisionEngine({ embed: async () => [[1, 0]] }),
    now = Date.now();
  const short = {
    activity: { since: now - 180000, idleMs: 0, changed: false },
    awayMs: 300000,
    boredom: 10,
    now,
  };
  assert.equal(e.decide(short).should_speak, false);
  const checkin={...short,awayMs:10*60000,boredom:7};
  assert.equal(e.decide(checkin).context_tag,"idle_checkin");
  assert.equal(e.decide(checkin).should_speak,true);
  assert.equal(e.decide({...checkin,activity:{...checkin.activity,idleMs:6*60000}}).should_speak,false);
  const long = {
    ...short,
    activity: { since: now - 3600000, idleMs: 0 },
    awayMs: 3600000,
    boredom: 60,
  };
  assert.equal(e.decide(long).should_speak, true);
  assert.equal(await e.accept("休息一下吧", "work_long", now), true);
  assert.equal(
    await e.accept("要不要休息呢", "work_long", now + 3600000),
    false,
  );
  assert.equal(e.decide(long).should_speak, false);
});
test("unknown software lookup is persisted and second lookup makes no network request", async () => {
  const map = new Map();
  let count = 0;
  const l = new LightWebLookup(
    { entities: { get: (k) => map.get(k), save: (k, v) => map.set(k, v) } },
    {
      search: async () => {
        count++;
        return {
          results: [
            {
              url: "https://www.graphisoft.com/archicad",
              title: "Archicad",
              body: "Architecture BIM design",
              retrieved_at: new Date().toISOString(),
            },
          ],
        };
      },
      close: async () => {},
    },
  );
  assert.ok(await l.lookup("Archicad.exe", { force: true }));
  assert.equal((await l.lookup("Archicad.exe")).memory_hit, true);
  assert.equal(count, 1);
});
