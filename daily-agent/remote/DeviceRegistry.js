import fs from "node:fs";
import path from "node:path";
import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class DeviceRegistry {
  constructor(dir, { now = Date.now } = {}) {
    this.file = path.join(dir, "remote-devices.json");
    this.now = now;
    this.devices = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : [];
    this.pending = null;
  }
  save() {
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.devices));
    fs.renameSync(this.file + ".tmp", this.file);
  }
  begin() {
    const code = String(randomInt(10000000, 100000000));
    this.pending = { code, expires: this.now() + 300000, attempts: 0 };
    return { code, expires_at: new Date(this.pending.expires).toISOString() };
  }
  pair(code, name, replaceDeviceId) {
    const p = this.pending;
    if (
      !p ||
      this.now() > p.expires ||
      p.attempts++ >= 5 ||
      !same(code, p.code)
    )
      throw Error("配對碼錯誤或過期，請在電腦重新開啟 App 配對。");
    const previous = this.devices.find((d) => d.id === replaceDeviceId);
    if (this.devices.length >= 5 && !previous)
      throw Error("最多配對五台裝置，請先在電腦解除舊裝置。");
    const token = randomBytes(32).toString("hex"),
      device = {
        id: previous?.id || randomBytes(12).toString("hex"),
        name: String(name || "手機").slice(0, 80),
        tokenHash: hash(token),
        created_at: new Date(this.now()).toISOString(),
      };
    this.pending = null;
    if (previous)
      this.devices = this.devices.filter((d) => d.id !== previous.id);
    this.devices.push(device);
    this.save();
    return { token, device: { id: device.id, name: device.name } };
  }
  authenticate(token) {
    if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
    const digest = hash(token);
    return this.devices.find((d) => same(d.tokenHash, digest)) || null;
  }
  list() {
    return this.devices.map(({ tokenHash, ...d }) => d);
  }
  revoke(id) {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== id);
    this.save();
    return before !== this.devices.length;
  }
  revokeAll() {
    this.devices = [];
    this.pending = null;
    this.save();
  }
}
