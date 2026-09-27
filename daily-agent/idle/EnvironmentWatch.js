import { companionEvent } from "../core/CompanionEvents.js";
export class EnvironmentWatch {
  constructor() {
    this.previous = null;
    this.flags = new Set();
  }
  observe(s, now = Date.now()) {
    const p = this.previous,
      events = [],
      active = new Set();
    const emit = (type, priority = 55) =>
      events.push(companionEvent(type, {}, priority, now));
    if (p) {
      if (s.process !== p.process && s.process !== "unknown")
        emit("NEW_APPLICATION", 30);
      if (p.idleMs > 300000 && s.idleMs < 60000) emit("USER_RETURNED", 35);
      if (
        typeof s.network === "boolean" &&
        typeof p.network === "boolean" &&
        s.network !== p.network
      )
        emit(s.network ? "NETWORK_RESTORED" : "NETWORK_LOST", 65);
    }
    const flag = (type, condition, priority) => {
      if (condition) {
        active.add(type);
        if (!this.flags.has(type)) emit(type, priority);
      }
    };
    flag(
      "LONG_WORK_SESSION",
      now - s.since >= 2700000 && s.idleMs < 300000,
      58,
    );
    flag("USER_IDLE_LONG", s.idleMs >= 3600000, 10);
    flag("LATE_NIGHT", new Date(now).getHours() < 5 && s.idleMs < 300000, 40);
    const b = s.battery;
    flag(
      "LOW_BATTERY",
      b && !b.charging && b.percent <= 20 && b.percent > 5,
      75,
    );
    flag("LOW_BATTERY_CRITICAL", b && !b.charging && b.percent <= 5, 98);
    this.flags = active;
    this.previous = { ...s };
    return events;
  }
}
