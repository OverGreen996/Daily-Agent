import { runtimePath } from "../core/RuntimePaths.cjs";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {setupProgress} from './SetupProgress.js';
const url = "http://127.0.0.1:11435";
const existing = await fetch(url+'/api/show',{method:'POST',body:JSON.stringify({model:'daily-qwen-idle:0.8b-q4'})});
if(existing.ok && (await existing.json()).details?.quantization_level==='Q4_K_M'){
  console.log('Idle Q4 model is already installed');process.exit(0);
}
async function stream(endpoint, body) {
  const r = await fetch(url + endpoint, {
    method: "POST",
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!r.ok) throw Error(await r.text());
  let pending = "",
    last = 0;
  for await (const chunk of r.body) {
    pending += new TextDecoder().decode(chunk);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      const e = JSON.parse(line);
      if (e.error) throw Error(e.error);
      setupProgress('待機陪伴模型',e);
      if (Date.now() - last > 5000 || e.status === "success") {
        console.log(
          e.status,
          e.total ? Math.round((100 * (e.completed || 0)) / e.total) + "%" : "",
        );
        last = Date.now();
      }
    }
  }
}
await stream("/api/pull", { model: "qwen3.5:0.8b-bf16" });
const runtime = runtimePath();
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(
      runtime,
      "models/manifests/registry.ollama.ai/library/qwen3.5/0.8b-bf16",
    ),
    "utf8",
  ),
);
const digest = manifest.layers
  .find((l) => l.mediaType === "application/vnd.ollama.image.model")
  .digest.replace(":", "-");
const output = path.join(runtime, "qwen3.5-0.8b-q4.gguf");
setupProgress('正在壓縮待機模型，減少記憶體與磁碟用量。',{},'extracting');
const run = promisify(execFile);
if (!fs.existsSync(output))
  await run(
    path.join(runtime, "ollama/lib/ollama/llama-quantize.exe"),
    [path.join(runtime, "models/blobs", digest), output, "Q4_K_M", "4"],
    { windowsHide: true, maxBuffer: 4e6 },
  );
const modelfile = path.join(runtime, "Idle.Modelfile");
fs.writeFileSync(
  modelfile,
  "FROM ./qwen3.5-0.8b-q4.gguf\nPARAMETER num_gpu 0\nPARAMETER num_ctx 2048\n",
);
await run(
  path.join(runtime, "ollama/ollama.exe"),
  ["create", "daily-qwen-idle:0.8b-q4", "-f", modelfile],
  {
    windowsHide: true,
    env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11435" },
    maxBuffer: 4e6,
  },
);
const info = await fetch(url + "/api/show", {
  method: "POST",
  body: JSON.stringify({ model: "daily-qwen-idle:0.8b-q4" }),
}).then((r) => r.json());
if (info.details?.quantization_level !== "Q4_K_M")
  throw Error("Unexpected quantization " + JSON.stringify(info.details));
fs.mkdirSync("test-output", { recursive: true });
fs.writeFileSync(
  "test-output/idle-q4.json",
  JSON.stringify(info.details, null, 2),
);
console.log(info.details);

// The imported Q4 model is verified above. Its build input and duplicate GGUF are no longer needed.
const deleted=process.env.DAILY_SETUP_OWNED_OLLAMA === '1' && await fetch(url+'/api/delete',{method:'DELETE',body:JSON.stringify({model:'qwen3.5:0.8b-bf16'})});
if(deleted && deleted.ok){fs.rmSync(output,{force:true});console.log('已清理待機模型的轉換來源與重複檔案。');}
else console.log('轉換來源暫時保留；已安裝的待機模型可繼續使用。');
setupProgress('待機模型已準備完成。',{},'complete');
