import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
export const LocationPrecision = Object.freeze({
  CITY: "CITY",
  AREA: "AREA",
  PRECISE: "PRECISE",
});
// Ephemeral environment state. Never connected to MemoryPalace or the event log.
export class LocationProvider {
  constructor({
    windows = windowsLocation,
    ip = ipLocation,
    now = Date.now,
  } = {}) {
    Object.assign(this, { windows, ip, now });
    this.activeDevice = "pc";
    this.phone = null;
    this.pc = null;
    this.retryAt = 0;
  }
  validate(value) {
    if (
      !value ||
      !Number.isFinite(value.latitude) ||
      Math.abs(value.latitude) > 90 ||
      !Number.isFinite(value.longitude) ||
      Math.abs(value.longitude) > 180
    )
      throw Error("位置格式錯誤");
    return {
      latitude: value.latitude,
      longitude: value.longitude,
      accuracy: Math.max(0, Number(value.accuracy) || 0),
      city: String(value.city || "").slice(0, 80),
      district: String(value.district || "").slice(0, 80),
      source: value.source,
      updated_at: new Date(this.now()).toISOString(),
    };
  }
  updateAndroid(value) {
    this.phone = this.validate({ ...value, source: "android_gps" });
    if (value.updated_at !== undefined) {
      const stamp = Date.parse(value.updated_at);
      if (!Number.isFinite(stamp) || stamp > this.now() + 30000) {
        this.phone = null;
        throw Error("GPS 時間格式錯誤");
      }
      this.phone.updated_at = new Date(stamp).toISOString();
    }
  }
  setActiveDevice(device) {
    if (!["pc", "android"].includes(device)) throw Error("未知 Active Device");
    this.activeDevice = device;
  }
  async current(precision = "CITY", { preciseNeeded = false } = {}) {
    if (!Object.values(LocationPrecision).includes(precision))
      throw Error("未知位置精度");
    if (precision === "PRECISE" && !preciseNeeded)
      throw Error("此功能不需要精確位置");
    let value;
    if (this.activeDevice === "android") {
      // A stale/missing mobile fix must not silently turn into the home PC location.
      value =
        this.phone && this.now() - Date.parse(this.phone.updated_at) < 300000
          ? this.phone
          : null;
    } else {
      if (
        (!this.pc || this.now() - Date.parse(this.pc.updated_at) > 1800000) &&
        this.now() >= this.retryAt
      ) {
        this.retryAt = this.now() + 900000;
        const result =
          (await this.windows().catch(() => null)) ||
          (await this.ip().catch(() => null));
        this.pc = result ? this.validate(result) : null;
      }
      value = this.pc;
    }
    if (!value) return null;
    if (precision === "PRECISE") return { ...value, precision };
    const grid = precision === "CITY" ? 0.1 : 0.01;
    return {
      ...value,
      latitude: +(Math.round(value.latitude / grid) * grid).toFixed(2),
      longitude: +(Math.round(value.longitude / grid) * grid).toFixed(2),
      accuracy: Math.max(value.accuracy, precision === "CITY" ? 15000 : 1500),
      district: precision === "CITY" ? "" : value.district,
      precision,
    };
  }
  status() {
    const v = this.activeDevice === "android" ? this.phone : this.pc;
    return {
      activeDevice: this.activeDevice,
      available:
        !!v &&
        this.now() - Date.parse(v.updated_at) <
          (this.activeDevice === "android" ? 300000 : 1800000),
      city: v?.city || "",
      source: v?.source || null,
      updated_at: v?.updated_at || null,
    };
  }
}
export async function ipLocation() {
  const r = await fetch("https://ipwho.is/", {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.success) return null;
  return {
    latitude: d.latitude,
    longitude: d.longitude,
    city: d.city,
    accuracy: 50000,
    source: "ip_geolocation",
  };
}
export function windowsLocation() {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) =>
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fileURLToPath(new URL("./location.ps1", import.meta.url)),
      ],
      { windowsHide: true, timeout: 10000, maxBuffer: 4096 },
      (err, out) => {
        try {
          resolve(err ? null : JSON.parse(out.replace(/^\uFEFF/, "")));
        } catch {
          resolve(null);
        }
      },
    ),
  );
}
