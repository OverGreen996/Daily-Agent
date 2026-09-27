import { EventEmitter } from "node:events";
import fs from "node:fs";
export class EventBus extends EventEmitter {
  constructor(file) {
    super();
    this.file = file;
  }
  publish(type, data = {}, { transient = false } = {}) {
    const e = { type, time: new Date().toISOString(), ...data };
    if (!transient) fs.appendFileSync(this.file, JSON.stringify(e) + "\n");
    this.emit("event", e);
    return e;
  }
}
