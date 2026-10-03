import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runtimePath } from "../core/RuntimePaths.cjs";
export class CloudflareTunnel {
  constructor(
    gateway,
    {
      binary = runtimePath("cloudflared", "cloudflared.exe"),
    } = {},
  ) {
    this.gateway = gateway;
    this.binary = binary;
    this.url = null;
    this.error = null;
  }
  status() {
    return {
      running: !!this.child,
      url: this.url,
      error: this.error,
      temporary: true,
    };
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.child && this.url) return this.url;
    this.starting = this.launch();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }
  async launch() {
    if (!fs.existsSync(this.binary))
      throw Error("請先執行 Setup-MobileBridge.ps1 安裝 Cloudflare 連線工具。");
    await this.gateway.start();
    this.error = null;
    const child = spawn(
      this.binary,
      [
        "tunnel",
        "--no-autoupdate",
        "--url",
        `http://127.0.0.1:${this.gateway.port}`,
        "--protocol",
        "http2",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    this.child = child;
    return new Promise((resolve, reject) => {
      let buffer = "",
        settled = false;
      const finish = (error, url) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(url);
      };
      const timer = setTimeout(() => {
        this.stop();
        finish(Error("Cloudflare 連線逾時，請稍後再試。"));
      }, 45000);
      const collect = (chunk) => {
        buffer = (buffer + chunk.toString()).slice(-8000);
        const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          this.url = match[0];
          finish(null, this.url);
        }
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.once("error", (e) => {
        this.error = e.message;
        this.child = null;
        this.url = null;
        finish(e);
      });
      child.once("exit", (code) => {
        if (this.child === child) {
          this.child = null;
          this.url = null;
          this.error = code ? "Cloudflare 連線中斷。" : null;
        }
        finish(Error("Cloudflare 連線已結束。"));
      });
    });
  }
  stop() {
    const child = this.child;
    this.child = null;
    this.url = null;
    child?.kill();
  }
}
