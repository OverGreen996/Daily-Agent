import fs from "node:fs";
import path from "node:path";
import { config as defaults,root } from "../config.js";
import {
  FullModelRuntime,
  IdleModelRuntime,
  EmbeddingProvider,
} from "../models/OllamaRuntime.js";
import { VisionProvider } from "../models/ModelRuntime.js";
import { ComfyUIImageRuntime } from "../models/ImageGeneration.js";
import { MemoryPalace } from "../memory/MemoryPalace.js";
import { BrowserAgent } from "../browser/BrowserAgent.js";
import {
  SearchService,
  TavilySearchProvider,
} from "../browser/SearchProvider.js";
import { ToolBroker } from "../tools/ToolBroker.js";
import { EventBus } from "./EventBus.js";
import { AgentCore } from "./AgentCore.js";
import { DocumentStore } from "../documents/DocumentStore.js";
import {loadNativeTokenizer} from '../models/NativeTokenizer.js';
import {setTokenCounter,tokens} from '../memory/MemoryPalace.js';
import {LightPerception} from '../idle/LightPerception.js';
import {ScreenVision} from '../idle/ScreenVision.js';
import {CalendarWatch} from '../idle/CalendarWatch.js';
import {PhoneBridge} from '../environment/PhoneBridge.js';
import {NotificationWatch} from '../idle/NotificationWatch.js';
import {DeviceRegistry} from '../remote/DeviceRegistry.js';
import {SharedFiles} from '../remote/SharedFiles.js';
import {NotificationHub} from '../remote/NotificationHub.js';
import {RemoteGateway} from '../remote/RemoteGateway.js';
import {CloudflareTunnel} from '../remote/CloudflareTunnel.js';
import {AppearanceTransfer} from '../remote/AppearanceTransfer.js';
import { PerceptionEngine } from "../idle/PerceptionEngine.js";
import { IdleCompanion } from "../idle/IdleCompanion.js";
import {
  SearXNGProvider,
  LightSearchBrowser,
} from "../browser/SearXNGProvider.js";
import { LocationProvider } from "../environment/LocationProvider.js";
import { WeatherWatch } from "../idle/WeatherWatch.js";
import {
  ModelLifecycleManager,
  ModelRole,
} from "../models/ModelLifecycleManager.js";
export function createAgent(overrides = {}) {
  const config = { ...defaults, ...overrides };
  const tokenizerDir=path.resolve(root,'../.daily-runtime/tokenizer');
  try{const tokenizer=loadNativeTokenizer(tokenizerDir);setTokenCounter(s=>tokenizer.count(s));config.tokenizer={model:tokenizer.model,revision:tokenizer.revision};}catch(e){setTokenCounter(null);config.tokenizer={fallback:true,reason:e.message};}
  const settingsFile = path.join(config.dataDir, "environment-settings.json");
  if (fs.existsSync(settingsFile)) {
    const saved = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    for (const key of ["perception", "lightLookup", "weatherEnabled","lightPerception","memoryCompanion","screenVision"])
      if (typeof saved[key] === "boolean" && !(key in overrides))
        config[key] = saved[key];
    if (
      Number.isFinite(saved.weatherRefreshMs) &&
      !("weatherRefreshMs" in overrides)
    )
      config.weatherRefreshMs = Math.min(
        1200000,
        Math.max(600000, saved.weatherRefreshMs),
      );
  }
  fs.mkdirSync(config.dataDir, { recursive: true });
  const bus = new EventBus(path.join(config.dataDir, "events.jsonl"));
  const full = new FullModelRuntime(config.modelUrl, config.fullModel, {
    context: config.context,
  });
  const idleRuntime = new IdleModelRuntime(config.modelUrl, config.idleModel),
    embedding = new EmbeddingProvider(config.modelUrl, config.embeddingModel);
  const imageRuntime = new ComfyUIImageRuntime({
    root: config.imageRuntimeDir,
    checkpoint: path.join(config.imageRuntimeDir, "ComfyUI", "models", "checkpoints", config.imageCheckpoint),
    qualityCheckpoint: path.join(config.imageRuntimeDir, "ComfyUI", "models", "checkpoints", config.imageQualityCheckpoint),
    photoCheckpoint: path.join(config.imageRuntimeDir, "ComfyUI", "models", "checkpoints", config.imagePhotoCheckpoint),
    outputDir: path.join(config.dataDir, "generated-images"),
    port: config.imagePort,
  });
  const memory = new MemoryPalace(
    path.join(config.dataDir, "palace.sqlite"),
    embedding,
    { flushAt: config.flushAt, timeZone: config.timeZone },
  );
  if(!config.tokenizer.fallback){const update=memory.db.prepare('UPDATE messages SET tokens=? WHERE id=?');for(const m of memory.working.list())update.run(tokens(m.content),m.id);}
  memory.pins.seedDefaults([
    "Daily Agent 預設模型 Qwen3.5 4B Q4",
    "Working Context = 16K；14K 開始整理完整舊話題",
    "Idle Timeout = 5 minutes",
    "Idle Model GPU = OFF；只使用 CPU",
    "Learning = Memory；禁止自行訓練",
  ]);
  const searxng = new SearXNGProvider({ endpoint: config.searxngUrl });
  if (!["browser", "tavily", "searxng"].includes(config.searchProvider))
    throw Error("不支援的 Search Provider");
  const searchService =
    config.searchProvider === "tavily"
      ? new SearchService({
          provider: new TavilySearchProvider({ apiKey: config.searchApiKey }),
          db: memory.db,
          monthlyLimit: config.searchMonthlyLimit,
          bus,
        })
      : config.searchProvider === "searxng"
        ? searxng
        : null;
  const location = new LocationProvider();
  const weather = new WeatherWatch({ location, config, bus });
  const browser = new BrowserAgent({
      idleMs: config.browserIdleMs,
      searchService,
    }),
    perception = new PerceptionEngine(bus),
    vision = new VisionProvider(full),
    broker = new ToolBroker(browser, config, bus),
    companion = new IdleCompanion({
      runtime: idleRuntime,
      memory,
      browser: new LightSearchBrowser(
        searxng,
        new BrowserAgent({ idleMs: 1000 }),
      ),
      embedding,
      config,
      bus,
      perception,
      weather,
      location,
    });
  let agent;
  const lifecycle = new ModelLifecycleManager({
    models: {
      [ModelRole.FULL_LLM]: { runtime: full, gpu: true },
      [ModelRole.IDLE_LLM]: { runtime: idleRuntime, gpu: false },
      [ModelRole.VISION_MODEL]: {runtime:new FullModelRuntime(config.modelUrl,config.fullModel,{context:4096}),gpu:true},
      [ModelRole.IMAGE_GENERATOR]: {runtime:imageRuntime,gpu:true},
    },
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
        if (!memory.db.prepare("SELECT id FROM messages WHERE id=?").get(m.id))
          throw Error("Runtime snapshot references missing memory");
      agent.summary = state.summary || "";
    },
  });
  companion.lifecycle = lifecycle;
  companion.lightPerception=new LightPerception();
  companion.lightPerception.vision=new ScreenVision({runtime:lifecycle.models[ModelRole.VISION_MODEL].runtime,lifecycle,bus});
  companion.calendar=new CalendarWatch(config.dataDir);
  companion.phone=new PhoneBridge(location,{onLocation:()=>{weather.state=null;weather.nextRefresh=0;weather.engine.reset();}});
  companion.notifications=new NotificationWatch();
  agent = new AgentCore({
    config,
    full,
    idleRuntime,
    vision,
    memory,
    browser,
    broker,
    bus,
    companion,
    perception,
    lifecycle,
    documents: new DocumentStore(config.dataDir,{embedding}),
    imageRuntime,
  });
  memory.summarize = (messages) => agent.summarize(messages);
  agent.remote={devices:new DeviceRegistry(config.dataDir),files:new SharedFiles(config.dataDir),notifications:new NotificationHub()};
  agent.remote.appearance=new AppearanceTransfer(config.dataDir);
  broker.remoteFiles=agent.remote.files;
  broker.remoteAuthorized=id=>agent.remote.devices.list().some(d=>d.id===id);
  agent.remote.gateway=new RemoteGateway(agent,{port:Number(process.env.DAILY_REMOTE_PORT||3221),apkPath:path.join(root,'android/dist/DailyPet-Android-0.1.0-preview.apk')});
  agent.remote.tunnel=new CloudflareTunnel(agent.remote.gateway,{binary:path.resolve(root,'../.daily-runtime/cloudflared/cloudflared.exe')});
  return agent;
}
