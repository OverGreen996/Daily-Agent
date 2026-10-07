import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { runtimePath } from "./core/RuntimePaths.cjs";
export const root = path.dirname(fileURLToPath(import.meta.url));
const localEnv = path.join(root, ".env.local");
if (fs.existsSync(localEnv)) process.loadEnvFile(localEnv);
const dataDir = process.env.DAILY_DATA || path.join(root, "data");
export const config = {
  version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,
  port: Number(process.env.DAILY_PORT || 3210),
  dataDir,
  timeZone: process.env.DAILY_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
  modelUrl: process.env.OLLAMA_HOST_URL || "http://127.0.0.1:11435",
  imageRuntimeDir: process.env.DAILY_COMFY_DIR || runtimePath("ComfyUI_windows_portable"),
  imageQualityCheckpoint: process.env.DAILY_IMAGE_QUALITY_CHECKPOINT || "NoobAI-XL-Vpred-v1.0-cyberfix-perpendicular.safetensors",
  imagePhotoCheckpoint: process.env.DAILY_IMAGE_PHOTO_CHECKPOINT || "PornMaster-Pro-SDXL-V7-VAE.safetensors",
  imageDefaultProfile: 'quality',
  imagePort: Number(process.env.DAILY_IMAGE_PORT || 8189),
  fullModel: "qwen3.5:4b",
  idleModel: "daily-qwen-idle:0.8b-q4",
  embeddingModel: "embeddinggemma",
  context: 16384,
  flushAt: 14336,
  idleAfterMs: 300000,
  browserIdleMs: 45000,
  searchDataDir: process.env.DAILY_SEARCH_DATA_DIR || path.join(dataDir, "search"),
  searchProvider: process.env.DAILY_SEARCH_PROVIDER === "tavily" ? "tavily" : "disabled",
  searchApiKey: process.env.TAVILY_API_KEY || "",
  searchKeys: {exa:process.env.EXA_API_KEY||'',tavily:process.env.TAVILY_API_KEY||'',firecrawl:process.env.FIRECRAWL_API_KEY||''},
  searchMonthlyLimit: Math.min(
    900,
    Math.max(0, Number(process.env.DAILY_SEARCH_MONTHLY_LIMIT || 900) || 0),
  ),
  fileRoots: [path.resolve(root, "..")],
  apps: { notepad: "notepad.exe", calculator: "calc.exe" },
  perception: true,
  lightLookup: false,
  lightPerception:false,
  memoryCompanion:true,
  screenVision:false,
  googleDriveClientId: process.env.DAILY_GOOGLE_CLIENT_ID || "",
  googleDriveClientSecret: process.env.DAILY_GOOGLE_CLIENT_SECRET || "",
  weatherEnabled: false,
  weatherRefreshMs: Math.min(
    1200000,
    Math.max(600000, Number(process.env.DAILY_WEATHER_REFRESH_MS) || 900000),
  ),
  personality:
    "你是露米（Lumi），溫暖自然、安靜貼心的桌面夥伴。使用繁體中文，不要假裝知道沒有觀察到的事。",
};
