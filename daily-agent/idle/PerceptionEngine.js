import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
export class PerceptionEngine {
  constructor(bus) {
    this.bus = bus;
    this.current = {
      process: "unknown",
      title: "",
      idleMs: 0,
      since: Date.now(),
      changed: false,
    };
  }
  start() {
    if (this.child || process.platform !== "win32") return;
    this.child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fileURLToPath(new URL("./perception.ps1", import.meta.url)),
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      try {
        const s = JSON.parse(line),
          changed = s.process !== this.current.process;
        this.current = {
          ...s,
          changed,
          since: changed ? Date.now() : this.current.since,
          windowChanged: changed || s.title !== this.current.title,
        };
        if (changed) this.bus.publish("activity", { process: s.process });
        if (this.current.windowChanged)
          this.bus.publish("window_change", { process: s.process });
      } catch {}
    });
    this.child.on("error", (e) =>
      this.bus.publish("error", { where: "perception", message: e.message }),
    );
    this.child.stderr.on("data", () => {});
    const child = this.child;
    child.on("exit", () => {
      if (this.child === child) this.child = null;
    });
  }
  snapshot() {
    return { ...this.current };
  }
  close() {
    this.child?.kill();
    this.child = null;
    this.current = {
      process: "unknown",
      title: "",
      idleMs: 0,
      since: Date.now(),
      changed: false,
    };
  }
}
