import fs from "node:fs";
import { SystemTools, run } from "../tools/BasicTools.js";
const session = JSON.parse(fs.readFileSync("test-output/idle-observer.json"));
const report = {
  started: new Date().toISOString(),
  lastInteraction: session.lastInteraction,
};
const headers = { "x-daily-token": session.token };
while (Date.now() - session.lastInteraction < 325000) {
  await new Promise((r) => setTimeout(r, 15000));
  const s = await fetch("http://127.0.0.1:3210/api/status", { headers }).then(
    (r) => r.json(),
  );
  console.log(
    Math.round((Date.now() - session.lastInteraction) / 1000) + " seconds",
    s.state,
  );
  if (s.state === "IDLE") {
    report.status = s;
    report.elapsedMs = Date.now() - session.lastInteraction;
    report.system = await SystemTools.info();
    break;
  }
}
report.processes = JSON.parse(
  (
    await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*8B*' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*') } | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,ExecutablePath | ConvertTo-Json",
      ],
      { windowsHide: true },
    )
  ).stdout,
);
report.passed =
  report.status?.state === "IDLE" &&
  !report.status.models.some((m) => m.name === "qwen3.5:4b") &&
  report.status.models.every((m) => m.size_vram === 0);
fs.writeFileSync(
  "test-output/real-five-minute-idle.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
