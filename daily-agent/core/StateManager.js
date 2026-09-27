export class StateManager {
  constructor(bus) {
    this.state = "ACTIVE";
    this.bus = bus;
    this.lastInteraction = Date.now();
  }
  touch() {
    this.lastInteraction = Date.now();
  }
  transition(next, reason) {
    const allowed = {
      ACTIVE: ["IDLE", "WAKING"],
      IDLE: ["WAKING"],
      WAKING: ["ACTIVE", "IDLE"],
    };
    if (!allowed[this.state].includes(next))
      throw Error(`Invalid transition ${this.state} → ${next}`);
    const previous = this.state;
    this.state = next;
    this.bus.publish("state", { previous, state: next, reason });
  }
}
