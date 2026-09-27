import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
export const run = promisify(execFile);
export class FileTools {
  constructor(roots) {
    this.roots = roots;
  }
  async allowed(file) {
    const real = await fs.realpath(path.resolve(file));
    const roots = await Promise.all(this.roots.map((r) => fs.realpath(r)));
    if (
      !roots.some((r) => {
        const rel = path.relative(r, real);
        return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
      })
    )
      throw Error("檔案不在允許的搜尋資料夾");
    return real;
  }
  async search({ query = "", root = this.roots[0] }) {
    const base = await this.allowed(root),
      results = [];
    let visited = 0;
    const walk = async (dir, depth) => {
      if (depth > 7 || visited > 10000 || results.length >= 50) return;
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        visited++;
        if (
          e.isSymbolicLink() ||
          ["node_modules", ".git", ".daily-runtime", "data"].includes(e.name)
        )
          continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full, depth + 1);
        else if (e.name.toLowerCase().includes(query.toLowerCase()))
          results.push(full);
        if (results.length >= 50) break;
      }
    };
    await walk(base, 0);
    return results;
  }
  async read({ path: file }) {
    const real = await this.allowed(file);
    if (!/\.(txt|md|json|csv|log|js|ts|html|css|py|yaml|yml)$/i.test(real))
      throw Error("僅允許文字檔案");
    if ((await fs.stat(real)).size > 262144)
      throw Error("檔案超過 256KB，請縮小範圍");
    return (await fs.readFile(real, "utf8")).slice(0, 20000);
  }
}
export class ClipboardTools {
  async read() {
    return (
      await run(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Get-Clipboard -Raw",
        ],
        { windowsHide: true, maxBuffer: 65536 },
      )
    ).stdout.trim();
  }
  async write({ text }) {
    if (typeof text !== "string" || text.length > 16000)
      throw Error("剪貼簿內容過長");
    await new Promise((resolve, reject) => {
      const p = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false); $v=[Console]::In.ReadToEnd(); Set-Clipboard -Value $v",
        ],
        { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
      );
      p.on("error", reject);
      p.on("exit", (c) => (c ? reject(Error("Clipboard failed")) : resolve()));
      p.stdin.end(text);
    });
    return "已更新剪貼簿";
  }
}
export class SystemTools {
  static async info() {
    let gpu = null;
    try {
      gpu = (
        await run(
          "nvidia-smi",
          [
            "--query-gpu=name,memory.used,memory.total,utilization.gpu",
            "--format=csv,noheader,nounits",
          ],
          { windowsHide: true },
        )
      ).stdout.trim();
    } catch {}
    return {
      platform: os.platform(),
      cpu: os.cpus()[0]?.model,
      ram_total: os.totalmem(),
      ram_free: os.freemem(),
      gpu,
      time: new Date().toISOString(),
      agent_rss: process.memoryUsage().rss,
    };
  }
  static launch(app, apps) {
    if (!Object.hasOwn(apps, app)) throw Error("程式不在允許清單");
    const p = spawn(apps[app], [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    p.unref();
    return { launched: app };
  }
}
