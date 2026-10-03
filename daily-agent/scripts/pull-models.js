import fs from "node:fs";
import {setupProgress} from './SetupProgress.js';
const url = "http://127.0.0.1:11435";
const installed = await fetch(url + '/api/tags').then(r => {if(!r.ok)throw Error('Ollama unavailable');return r.json();});
for (const model of ["qwen3.5:4b", "embeddinggemma"]) {
  if(installed.models?.some(m=>m.name === (model.includes(':')?model:model+':latest'))){console.log('Already installed',model);continue;}
  console.log("Downloading", model);
  const r = await fetch(url + "/api/pull", {
    method: "POST",
    body: JSON.stringify({ model, stream: true }),
  });
  if (!r.ok) throw Error(await r.text());
  const reader = r.body.getReader();
  let pending = "",
    last = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += new TextDecoder().decode(value);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.error) throw Error(e.error);
      setupProgress(model==='embeddinggemma'?'記憶檢索模型':'基本聊天模型',e);
      if (Date.now() - last > 5000 || e.status === "success") {
        console.log(
          model,
          e.status,
          e.total ? Math.round((100 * (e.completed || 0)) / e.total) + "%" : "",
        );
        last = Date.now();
      }
    }
  }
  const show = await fetch(url + "/api/show", {
    method: "POST",
    body: JSON.stringify({ model }),
  }).then((r) => r.json());
  fs.mkdirSync("test-output", { recursive: true });
  fs.writeFileSync(
    "test-output/" + model.replaceAll(":", "-") + ".json",
    JSON.stringify(
      { details: show.details, capabilities: show.capabilities },
      null,
      2,
    ),
  );
}
