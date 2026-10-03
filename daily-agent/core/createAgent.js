import fs from "node:fs";
import { runtimePath } from "./RuntimePaths.cjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as defaults, root } from "../config.js";
import {
  FullModelRuntime,
  IdleModelRuntime,
  EmbeddingProvider,
} from "../models/OllamaRuntime.js";
import { VisionProvider } from "../models/ModelRuntime.js";
import {
  MemoryPalace,
  setTokenCounter,
  tokens,
} from "../memory/MemoryPalace.js";
import { loadNativeTokenizer } from "../models/NativeTokenizer.js";
import {
  ModelLifecycleManager,
  ModelRole,
} from "../models/ModelLifecycleManager.js";
import { ToolBroker } from "../tools/ToolBroker.js";
import { EventBus } from "./EventBus.js";
import { AgentCore } from "./AgentCore.js";
import { ModuleHost } from "../modules/ModuleHost.js";
import { moduleCatalog } from "../modules/catalog.js";
import {
  fallbackBrowser,
  fallbackCompanion,
  fallbackEnvironment,
} from "../modules/Fallbacks.js";
function readSettings(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}
function installedPlugins(settings) {
  const directory = path.join(root, "plugins");
  return (settings.plugins || [])
    .filter((p) => p.enabled === true)
    .map((p) => ({
      id: p.id,
      name: p.name || p.id,
      requires: p.requires || [],
      load: async () => {
        const file = path.resolve(directory, p.entry || "");
        const realDirectory = fs.realpathSync(directory),
          realFile = fs.realpathSync(file);
        if (
          !realFile.startsWith(realDirectory + path.sep) ||
          !realFile.endsWith(".js")
        )
          throw Error("插件入口必須位於 plugins 目錄");
        return import(pathToFileURL(realFile).href);
      },
    }));
}
export async function createAgent(overrides = {}) {
  const config = { ...defaults, ...overrides };
  fs.mkdirSync(config.dataDir, { recursive: true });
  const bus = new EventBus(path.join(config.dataDir, "events.jsonl"));
  const environment = readSettings(
    path.join(config.dataDir, "environment-settings.json"),
  );
  for (const key of [
    "perception",
    "lightLookup",
    "weatherEnabled",
    "lightPerception",
    "memoryCompanion",
    "screenVision",
  ])
    if (typeof environment[key] === "boolean" && !(key in overrides))
      config[key] = environment[key];
  if (
    Number.isFinite(environment.weatherRefreshMs) &&
    !("weatherRefreshMs" in overrides)
  )
    config.weatherRefreshMs = Math.min(
      1200000,
      Math.max(600000, environment.weatherRefreshMs),
    );
  const settingsFile = path.join(config.dataDir, "modules.json");
  const settings = readSettings(settingsFile);
  config.modules = {
    ...(settings.enabled || {}),
    ...(overrides.modules || {}),
  };
  try {
    const tokenizer = loadNativeTokenizer(
      runtimePath("tokenizer"),
    );
    setTokenCounter((s) => tokenizer.count(s));
    config.tokenizer = { model: tokenizer.model, revision: tokenizer.revision };
  } catch (e) {
    setTokenCounter(null);
    config.tokenizer = { fallback: true, reason: e.message };
  }
  const full = new FullModelRuntime(config.modelUrl, config.fullModel, {
    context: config.context,
  });
  const idleRuntime = new IdleModelRuntime(config.modelUrl, config.idleModel),
    embedding = new EmbeddingProvider(config.modelUrl, config.embeddingModel);
  const memory = new MemoryPalace(
    path.join(config.dataDir, "palace.sqlite"),
    embedding,
    { flushAt: config.flushAt, timeZone: config.timeZone, personal: false },
  );
  const host = new ModuleHost({ config, bus, settingsFile });
  let agent;
  try {
    if (!config.tokenizer.fallback) {
      const update = memory.db.prepare(
        "UPDATE messages SET tokens=? WHERE id=?",
      );
      for (const m of memory.working.list())
        update.run(tokens(m.content), m.id);
    }
    memory.pins.seedDefaults([
      "Daily Agent 預設模型 Qwen3.5 4B Q4",
      "Working Context = 16K；14K 開始整理完整舊話題",
      "Idle Timeout = 5 minutes",
      "Idle Model GPU = OFF；只使用 CPU",
      "Learning = Memory；禁止自行訓練",
    ]);
    const neutralEnvironment = fallbackEnvironment(),
      neutralBrowser = fallbackBrowser();
    await host.load(
      [
        ...moduleCatalog,
        ...installedPlugins(settings),
        ...(overrides.plugins || []),
      ],
      {
        config,
        root,
        bus,
        memory,
        full,
        idleRuntime,
        embedding,
        fallbackEnvironment: neutralEnvironment,
        fallbackBrowser: neutralBrowser,
      },
    );
    if (!host.enabled("environment"))
      Object.assign(config, {
        perception: false,
        lightPerception: false,
        screenVision: false,
        weatherEnabled: false,
      });
    if (!host.enabled("search")) config.lightLookup = false;
    const env = host.get("environment") || neutralEnvironment,
      browser = host.get("search")?.browser || neutralBrowser;
    const companion =
      host.get("companion")?.companion || fallbackCompanion(env, browser);
    const models = {
      [ModelRole.FULL_LLM]: { runtime: full, gpu: true },
      [ModelRole.IDLE_LLM]: { runtime: idleRuntime, gpu: false },
    };
    for (const id of host.order)
      Object.assign(models, host.get(id)?.models || {});
    const lifecycle = new ModelLifecycleManager({
      models,
      snapshotFile: path.join(config.dataDir, "runtime-state.json"),
      bus,
      saveState: async () => {
        memory.checkpoint();
        return {
          working_context: memory.working.list(),
          summary: agent.summary,
          memory_database: "palace.sqlite",
          state: agent.states.state,
        };
      },
      restoreState: async (state) => {
        for (const m of state.working_context || [])
          if (
            !memory.db.prepare("SELECT id FROM messages WHERE id=?").get(m.id)
          )
            throw Error("Runtime snapshot references missing memory");
        agent.summary = state.summary || "";
      },
    });
    const broker = new ToolBroker(browser, config, bus);
    broker.modules = host;
    agent = new AgentCore({
      config,
      full,
      idleRuntime,
      vision: new VisionProvider(full),
      memory,
      browser,
      broker,
      bus,
      companion,
      perception: env.perception,
      lifecycle,
    });
    agent.modules = host;
    memory.summarize = (messages) => agent.summarize(messages);
    await host.attach(agent);
    return agent;
  } catch (error) {
    await host.dispose();
    memory.close();
    throw error;
  }
}
