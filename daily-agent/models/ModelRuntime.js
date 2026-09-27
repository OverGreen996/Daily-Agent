export class ModelRuntime {
  // options.onDelta(text) is optional. Implementations still return the complete
  // response only after a successful finish; partial output is presentation only.
  async chat(messages, options = {}) {
    throw new Error("ModelRuntime.chat not implemented");
  }
  async load() {
    throw new Error("ModelRuntime.load not implemented");
  }
  async unload() {
    throw new Error("ModelRuntime.unload not implemented");
  }
  async status() {
    throw new Error("ModelRuntime.status not implemented");
  }
}
export class VisionProvider {
  constructor(runtime) {
    this.runtime = runtime;
  }
  async understand(messages, image) {
    return this.runtime.chat([
      ...messages,
      { role: "user", content: "請解釋圖片", images: [image] },
    ]);
  }
  async close() {} // Main model owns vision allocation; unloaded with runtime.
}
