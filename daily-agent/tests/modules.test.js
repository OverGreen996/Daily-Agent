import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ModuleHost } from "../modules/ModuleHost.js";
import { createAgent } from "../core/createAgent.js";
import { moduleCatalog } from "../modules/catalog.js";
const bus = { publish() {} };
function host(config = {}) {
  return new ModuleHost({
    config,
    bus,
    settingsFile: path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "daily-modules-")),
      "modules.json",
    ),
  });
}
test("disabled modules never import; missing module and dependent fail without blocking unrelated features", async () => {
  const h = host({ modules: { disabled: false } }),
    loaded = [];
  await h.load(
    [
      {
        id: "disabled",
        load: () => {
          throw Error("must never import");
        },
      },
      {
        id: "missing",
        load: () => import("../features/not-installed/index.js"),
      },
      {
        id: "dependent",
        requires: ["missing"],
        create: () => {
          throw Error("must not construct");
        },
      },
      {
        id: "good",
        create: () => {
          loaded.push("good");
          return {};
        },
      },
    ],
    {},
  );
  assert.equal(h.records.get("disabled").state, "disabled");
  assert.equal(h.records.get("dependent").state, "failed");
  assert.equal(h.enabled("good"), true);
  assert.deepEqual(loaded, ["good"]);
  await h.dispose();
});
test("dependencies load first and cleanup runs once in reverse order even when a cleanup fails", async () => {
  const h = host(),
    calls = [];
  await h.load(
    [
      {
        id: "child",
        requires: ["parent"],
        create: () => ({
          dispose() {
            calls.push("child");
            throw Error("cleanup");
          },
        }),
      },
      {
        id: "parent",
        create: () => ({
          dispose() {
            calls.push("parent");
          },
        }),
      },
    ],
    {},
  );
  assert.deepEqual(h.order, ["parent", "child"]);
  assert.equal((await h.dispose()).length, 1);
  await h.dispose();
  assert.deepEqual(calls, ["child", "parent"]);
});
test("cycles and duplicate identifiers are rejected without running factories", async () => {
  const h = host();
  await h.load(
    [
      { id: "a", requires: ["b"], create: () => ({}) },
      { id: "b", requires: ["a"], create: () => ({}) },
    ],
    {},
  );
  assert.equal(h.enabled("a"), false);
  assert.equal(h.enabled("b"), false);
  await assert.rejects(host().load([{ id: "a" }, { id: "a" }], {}), /重複/);
});
test("module routes stay namespaced and tool parameters/mobile permission are enforced", async () => {
  const h = host();
  let executions = 0;
  await h.load(
    [
      {
        id: "custom",
        create: () => ({
          routes: [
            { method: "GET", path: "/ping", handle: () => ({ ok: true }) },
          ],
          tools: [
            {
              name: "ping",
              description: "Test",
              parameters: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
              execute: (args) => {
                executions++;
                return args.text;
              },
            },
          ],
        }),
      },
    ],
    {},
  );
  assert.equal(await h.route("GET", "/api/shutdown"), null);
  assert.equal(
    (await h.route("GET", "/api/modules/custom/ping")).data.ok,
    true,
  );
  assert.equal(h.toolSchemas({ deviceId: "phone" }).length, 0);
  await assert.rejects(
    h.executeTool("module_custom__ping", { text: "x" }, { source: "idle" }),
    /使用者/,
  );
  await assert.rejects(
    h.executeTool(
      "module_custom__ping",
      { text: "x" },
      { source: "user", deviceId: "phone" },
    ),
    /手机|手機/,
  );
  await assert.rejects(
    h.executeTool(
      "module_custom__ping",
      { text: "x", extra: 1 },
      { source: "user" },
    ),
    /參數/,
  );
  assert.equal(
    await h.executeTool(
      "module_custom__ping",
      { text: "ok" },
      { source: "user" },
    ),
    "ok",
  );
  assert.equal(executions, 1);
});
test("module settings are atomic, preserve installed plugins and take effect only on restart", async () => {
  const h = host();
  await h.load([{ id: "images", create: () => ({}) }], {});
  fs.writeFileSync(
    h.settingsFile,
    JSON.stringify({
      plugins: [{ id: "mine", entry: "mine.js", enabled: true }],
    }),
  );
  h.configure("images", false);
  assert.equal(h.enabled("images"), true);
  assert.equal(h.status()[0].restartRequired, true);
  assert.equal(
    JSON.parse(fs.readFileSync(h.settingsFile)).plugins[0].id,
    "mine",
  );
  assert.throws(() => h.configure("unknown", false), /無效/);
});
function mockInference(agent) {
  agent.wake = async () => {};
  agent.full.chat = async () => ({ message: { content: "測試對話正常。" } });
  agent.full.request = async () => ({ models: [] });
  agent.lifecycle.load_model = async () => {};
  agent.lifecycle.unload_model = async () => {};
}
for (const definition of moduleCatalog)
  test(`unplug ${definition.id}: basic chat, status and shutdown still work`, async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-unplug-"));
    const agent = await createAgent({
      dataDir,
      perception: false,
      modules: { [definition.id]: false },
    });
    try {
      mockInference(agent);
      assert.equal(agent.modules.enabled(definition.id), false);
      assert.equal((await agent.chat("你好")).content, "測試對話正常。");
      assert.equal((await agent.status()).modules.length, moduleCatalog.length);
      if (definition.id === "images")
        assert.equal(
          Object.hasOwn(agent.lifecycle.models, "IMAGE_GENERATOR"),
          false,
        );
      if (definition.id === "assistant")
        assert.equal(agent.memory.personal, null);
      if (definition.id === "pocketdrop")
        await assert.rejects(
          agent.modules.route("GET", "/api/modules/pocketdrop"),
          /停用/,
        );
      if (definition.id === "documents")
        await assert.rejects(agent.chat("查看文件庫"), /停用/);
      await agent.tick();
      await agent.stop();
    } finally {
      if (!agent.stopping) {
        await agent.modules.dispose();
        agent.memory.close();
      }
      fs.rmSync(dataDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  });
test("physically missing feature entry does not prevent startup or chat", () => {
  fs.mkdirSync(path.resolve("test-output"), {recursive: true});
  const source = path.resolve("."),
    directory = fs.mkdtempSync(
      path.join(source, "test-output", "missing-feature-"),
    );
  try {
    for (const name of [
      "core",
      "modules",
      "models",
      "memory",
      "idle",
      "environment",
      "documents",
      "remote",
      "browser",
      "tools",
      "features",
    ])
      fs.cpSync(path.join(source, name), path.join(directory, name), {
        recursive: true,
      });
    for (const name of ["package.json", "config.js"])
      fs.copyFileSync(path.join(source, name), path.join(directory, name));
    fs.unlinkSync(path.join(directory, "features", "images", "index.js"));
    // Ancestor node_modules resolves naturally; no links or shared data directory are modified.
    const code = `import {createAgent} from './core/createAgent.js';const a=await createAgent({dataDir:'./isolated-data',perception:false});if(a.modules.enabled('images'))throw Error('missing module loaded');a.wake=async()=>{};a.full.chat=async()=>({message:{content:'ok'}});if((await a.chat('hello')).content!=='ok')throw Error('chat failed');await a.modules.dispose();a.memory.close();`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { cwd: directory, encoding: "utf8", timeout: 15000, windowsHide: true },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
