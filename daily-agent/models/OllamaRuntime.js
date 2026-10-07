import { ModelRuntime } from "./ModelRuntime.js";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export class OllamaRuntime extends ModelRuntime {
  constructor(url, model, { cpu = false, context = 16384 } = {}) {
    super();
    Object.assign(this, { url, model, cpu, context });
    this.controllers = new Set();
  }
  async request(endpoint, body, onDelta, timeoutMs = 240000) {
    const controller = new AbortController();
    this.controllers.add(controller);
    this.controller = controller;
    try {
      const r = await fetch(this.url + endpoint, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(timeoutMs),
        ]),
      });
      if (!r.ok)
        throw Error(`模型後端 ${r.status}: ${(await r.text()).slice(0, 400)}`);
      if (!onDelta) return await r.json();
      const decoder = new TextDecoder();
      let pending = "", content = "", done = false, final;
      const toolCalls = [];
      const consume = (line) => {
        if (!line.trim()) return;
        const chunk = JSON.parse(line);
        if (chunk.error) throw Error(chunk.error);
        if (done) throw Error("模型串流在完成後仍回傳資料");
        const delta = chunk.message?.content || "";
        content += delta;
        if (content.length > 1_000_000) throw Error("模型串流超出回覆長度限制");
        if (delta) onDelta(delta);
        toolCalls.push(...(chunk.message?.tool_calls || []));
        if (chunk.done) { done = true; final = chunk; }
      };
      for await (const bytes of r.body) {
        pending += decoder.decode(bytes, { stream: true });
        let newline;
        while ((newline = pending.indexOf("\n")) >= 0) {
          consume(pending.slice(0, newline)); pending = pending.slice(newline + 1);
        }
        if (pending.length > 2_000_000) throw Error("模型串流資料過大");
      }
      pending += decoder.decode(); consume(pending);
      if (!done) throw Error("模型串流中斷，尚未取得完整回答");
      return { ...final, message: { role: "assistant", content,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}) } };
    } finally {
      this.controllers.delete(controller);
      if (this.controller === controller) this.controller = [...this.controllers].at(-1) || null;
    }
  }
  cancel() {
    for (const controller of this.controllers) controller.abort();
  }
  get options() {
    return {
      num_ctx: this.context,
      num_gpu: this.cpu ? 0 : 99,
      num_thread: 4,
      num_predict: this.cpu ? 70 : 1200,
      temperature: 0.6,
    };
  }
  async chat(messages, { tools, format, num_predict, onDelta, temperature, timeoutMs } = {}) {
    return this.request("/api/chat", {
      model: this.model,
      messages,
      tools,
      format,
      stream: !!onDelta,
      think: false,
      keep_alive: "10m",
      options: { ...this.options, ...(num_predict ? { num_predict } : {}), ...(temperature!==undefined ? {temperature} : {}) },
    }, onDelta, timeoutMs);
  }
  async load() {
    await this.request("/api/generate", {
      model: this.model,
      prompt: "",
      stream: false,
      keep_alive: "10m",
      options: this.options,
    });
    const s = await this.status();
    if (this.cpu && s?.size_vram !== 0) {
      await this.unload();
      throw Error("CPU-only verification failed");
    }
    return s;
  }
  async unload() {
    if (!(await this.status())) return true;
    await this.request("/api/generate", {
      model: this.model,
      keep_alive: 0,
      stream: false,
    }, undefined, 15000);
    for (let i = 0; i < 30; i++) {
      if (!(await this.status())) return true;
      await pause(250);
    }
    throw Error(`模型仍在記憶體中: ${this.model}`);
  }
  async status() {
    return (
      (await this.request("/api/ps", undefined, undefined, 2000)).models?.find(
        (m) => m.name === this.model || m.model === this.model,
      ) || null
    );
  }
}
export class FullModelRuntime extends OllamaRuntime {}
export class IdleModelRuntime extends OllamaRuntime {
  constructor(url, model) {
    super(url, model, { cpu: true, context: 2048 });
  }
  async chat(messages, options = {}) {
    const r = await super.chat(messages, { ...options, tools: undefined });
    const s = await this.status();
    if (s?.size_vram !== 0) {
      await this.unload();
      throw Error("Idle runtime used GPU");
    }
    return r;
  }
}
export class EmbeddingProvider extends OllamaRuntime {
  constructor(url, model) {
    super(url, model, { cpu: true, context: 2048 });
  }
  async embed(texts) {
    const r = await this.request("/api/embed", {
      model: this.model,
      input: texts,
      keep_alive: 0,
      truncate: false,
      options: { num_gpu: 0, num_thread: 4 },
    });
    return r.embeddings;
  }
}
