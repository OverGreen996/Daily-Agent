import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
export const root = path.dirname(fileURLToPath(import.meta.url));
const localEnv = path.join(root, ".env.local");
if (fs.existsSync(localEnv)) process.loadEnvFile(localEnv);
export const config = {
  version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,
  port: Number(process.env.DAILY_PORT || 3210),
  dataDir: process.env.DAILY_DATA || path.join(root, "data"),
  timeZone: process.env.DAILY_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
  modelUrl: process.env.OLLAMA_HOST_URL || "http://127.0.0.1:11435",
  imageRuntimeDir: process.env.DAILY_COMFY_DIR || path.resolve(root, "../.daily-runtime/ComfyUI_windows_portable"),
  imageCheckpoint: process.env.DAILY_IMAGE_CHECKPOINT || "NoobAI-XL-v1.1.safetensors",
  imageQualityCheckpoint: process.env.DAILY_IMAGE_QUALITY_CHECKPOINT || "NoobAI-XL-Vpred-v1.0-cyberfix-perpendicular.safetensors",
  imagePhotoCheckpoint: process.env.DAILY_IMAGE_PHOTO_CHECKPOINT || "PornMaster-Pro-SDXL-V7-VAE.safetensors",
  imagePort: Number(process.env.DAILY_IMAGE_PORT || 8189),
  fullModel: "qwen3.5:4b",
  idleModel: "daily-qwen-idle:0.8b-q4",
  embeddingModel: "embeddinggemma",
  context: 16384,
  flushAt: 14336,
  idleAfterMs: 300000,
  browserIdleMs: 45000,
  searchProvider: process.env.DAILY_SEARCH_PROVIDER || "browser",
  searchApiKey: process.env.TAVILY_API_KEY || "",
  searchMonthlyLimit: Math.min(
    900,
    Math.max(0, Number(process.env.DAILY_SEARCH_MONTHLY_LIMIT || 900) || 0),
  ),
  fileRoots: [path.resolve(root, "..")],
  apps: { notepad: "notepad.exe", calculator: "calc.exe" },
  perception: true,
  lightLookup: true,
  lightPerception:false,
  memoryCompanion:true,
  screenVision:false,
  searxngUrl: process.env.DAILY_SEARXNG_URL || "",
  weatherEnabled: false,
  weatherRefreshMs: Math.min(
    1200000,
    Math.max(600000, Number(process.env.DAILY_WEATHER_REFRESH_MS) || 900000),
  ),
  personality:
    "你是露米（Lumi），溫暖自然、安靜貼心的桌面夥伴。使用繁體中文，不要假裝知道沒有觀察到的事。",
};
