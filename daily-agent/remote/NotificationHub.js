import { createHash } from "node:crypto";
export class NotificationHub {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.sequence = 0;
    this.events = [];
    this.seen = new Map();
    this.sessions = new Map();
    this.pcInteraction = 0;
    this.mode = "smart";
  }
  heartbeat(id, active) {
    const previous = this.sessions.get(id);
    this.sessions.set(id, {
      expires: this.now() + 90000,
      interaction: active ? this.now() : previous?.interaction || 0,
    });
  }
  activeDevice() {
    return (
      [...this.sessions]
        .filter(
          ([, s]) =>
            s.expires > this.now() && s.interaction >= this.pcInteraction,
        )
        .sort((a, b) => b[1].interaction - a[1].interaction)[0]?.[0] || "pc"
    );
  }
  receive(source, input) {
    if (
      typeof input.id !== "string" ||
      input.id.length > 300 ||
      !input.id ||
      typeof input.app !== "string" ||
      input.app.length > 120 ||
      !input.app.trim()
    )
      throw Error("通知格式錯誤。");
    const app = input.app.replace(/[\r\n]/g, " "),
      title = String(input.title || "").slice(0, 180),
      key = createHash("sha256")
        .update(source + "\0" + input.id + "\0" + app + "\0" + title)
        .digest("hex");
    if (this.seen.has(key) && this.now() - this.seen.get(key) < 3600000)
      return null;
    this.seen.set(key, this.now());
    if (this.seen.size > 500) this.seen.delete(this.seen.keys().next().value);
    const destination =
      this.mode === "mirror"
        ? source === "pc"
          ? "phones"
          : "pc"
        : this.activeDevice();
    const event = {
      seq: ++this.sequence,
      type: "notification",
      source,
      destination,
      app,
      title,
      text: `${source === "pc" ? "電腦" : "手機"}的「${app}」有新通知${title ? "：" + title : "。"}`,
      at: this.now(),
    };
    this.events.push(event);
    this.events = this.events
      .filter((e) => this.now() - e.at < 1800000)
      .slice(-100);
    return event;
  }
  read(id, after) {
    return {
      cursor: this.sequence,
      events: this.events.filter(
        (e) =>
          e.seq > after &&
          e.at > this.now() - 1800000 &&
          (e.destination === id || e.destination === "phones"),
      ),
    };
  }
  disconnect(id) {
    this.sessions.delete(id);
    this.events = this.events.filter(
      (e) => e.source !== id && e.destination !== id,
    );
  }
}
