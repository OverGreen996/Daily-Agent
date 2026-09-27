import { cosine, lexical } from "../memory/MemoryPalace.js";
export class BoredomSystem {
  constructor() {
    this.value = 0;
    this.updated = Date.now();
  }
  tick(now = Date.now()) {
    this.value = Math.min(
      100,
      this.value + ((now - this.updated) / 60000) * 0.7,
    );
    this.updated = now;
    return this.value;
  }
  respond() {
    this.value = Math.max(0, this.value - 60);
    this.updated = Date.now();
  }
}
export class SpeakDecisionEngine {
  constructor(embedding) {
    this.embedding = embedding;
    this.lastSpoke = 0;
    this.topics = new Map();
    this.recent = [];
  }
  decide({
    activity,
    awayMs,
    boredom,
    unknown = false,
    event = null,
    memory = null,
    now = Date.now(),
  }) {
    const duration = now - activity.since,
      hour = new Date(now).getHours();
    let score = boredom * 0.35,
      tag = "idle";
    if (duration > 45 * 60000 && activity.idleMs < 5 * 60000) {
      score += 38;
      tag = "work_long";
    }
    if (hour < 5 && activity.idleMs < 300000) {
      score += 18;
      tag = "late_night";
    }
    if (unknown && activity.changed) {
      score += 22;
      tag = "new_app";
    }
    if (awayMs < 10 * 60000) score -= 25;
    if (activity.idleMs > 20 * 60000) score -= 25;
    // Entering IDLE at five minutes only unloads the full model. If the user is
    // still actively using the PC, allow one quiet check-in from ten minutes on.
    // The global and topic cooldowns below keep this from becoming periodic spam.
    if (!event && !memory && awayMs >= 10 * 60000 && activity.idleMs < 5 * 60000) {
      score += 50;
      tag = "idle_checkin";
    }
    if(memory&&!event){score+=18+30*Math.min(1,Math.max(0,memory.score));tag='memory_followup';}
    if (event) {
      score = event.priority + boredom * 0.1;
      tag = event.type;
      if (this.eventKeys?.has(event.key) || event.expires_at <= now)
        score = -100;
      if (activity.idleMs > 20 * 60000 && event.priority < 85) score -= 30;
    }
    if (
      now - this.lastSpoke < (event?.priority >= 85 ? 90000 : 12 * 60000) ||
      now - (this.topics.get(event?.type==='CALENDAR_EVENT'?event.key:tag) || 0) < 45 * 60000
    )
      score = -100;
    return { should_speak: score >= 48, context_tag: tag, score };
  }
  async accept(text, tag, now = Date.now(), event=null) {
    if (!text.trim() || text.length > 160) return false;
    const normalized = lexical(text).replaceAll(" ", "");
    if (this.recent.some((r) => r.normalized === normalized)) return false;
    const [vector] = await this.embedding.embed([text]);
    if (event?.type!=='CALENDAR_EVENT' && this.recent.some((r) => cosine(vector, r.vector) > 0.84)) return false;
    this.recent.push({ text, normalized, vector, time: now });
    this.recent = this.recent.slice(-12);
    this.lastSpoke = now;
    this.topics.set(event?.type==='CALENDAR_EVENT'?event.key:tag, now);
    return true;
  }
  markEvent(event) {
    if (!event) return;
    this.eventKeys ||= new Set();
    this.eventKeys.add(event.key);
    if (this.eventKeys.size > 100)
      this.eventKeys.delete(this.eventKeys.values().next().value);
  }
}
