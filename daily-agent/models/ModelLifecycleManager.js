import fs from "node:fs";
export const ModelRole = Object.freeze({
  FULL_LLM: "FULL_LLM",
  IDLE_LLM: "IDLE_LLM",
  IMAGE_GENERATOR: "IMAGE_GENERATOR",
  VISION_MODEL: "VISION_MODEL",
});
/** Coordinates model residency. Callers serialize workflows through AgentCore.exclusive. */
export class ModelLifecycleManager {
  constructor({ models, snapshotFile, bus, saveState, restoreState }) {
    Object.assign(this, { models, snapshotFile, bus, saveState, restoreState });
    this.owner = null;
    this.loaded = new Set();
  }
  definition(role) {
    const item = this.models[role];
    if (!item) throw Error(`模型角色尚未實作: ${role}`);
    return item;
  }
  get_active_model() {
    return { gpu_owner: this.owner, loaded_roles: [...this.loaded] };
  }
  request_gpu_owner(role) {
    const def = this.definition(role);
    if (!def.gpu) throw Error("CPU-only role cannot acquire GPU");
    if (this.owner && this.owner !== role)
      throw Error(
        `GPU is owned by ${this.owner}; unload it before loading ${role}`,
      );
    this.owner = role;
    this.bus.publish("gpu_owner", { owner: role });
    return role;
  }
  async release_gpu_owner(role) {
    const def = this.definition(role);
    if (this.owner !== role) return;
    if (await def.runtime.status())
      throw Error("Cannot release GPU ownership while model remains loaded");
    this.owner = null;
    this.bus.publish("gpu_owner", { owner: null });
  }
  async load_model(role) {
    const def = this.definition(role);
    const resident = await def.runtime.status();
    if (resident) {
      if (!def.gpu && resident.size_vram !== 0)
        throw Error("CPU-only runtime has GPU residency");
      if (def.gpu) this.request_gpu_owner(role);
      this.loaded.add(role);
      return resident;
    }
    if (def.gpu) this.request_gpu_owner(role);
    try {
      const result = await def.runtime.load();
      this.loaded.add(role);
      this.bus.publish("model_loaded", { role, cpu_only: !def.gpu });
      return result;
    } catch (e) {
      if (def.gpu && !(await def.runtime.status())) this.owner = null;
      throw e;
    }
  }
  async unload_model(role) {
    const def = this.definition(role);
    await def.runtime.unload();
    if (await def.runtime.status())
      throw Error(`Unload verification failed: ${role}`);
    this.loaded.delete(role);
    if (def.gpu) await this.release_gpu_owner(role);
    this.bus.publish("model_unloaded", { role, verified: true });
  }
  async save_runtime_state(taskState = null) {
    const state = {
      version: 1,
      saved_at: new Date().toISOString(),
      models: this.get_active_model(),
      context: await this.saveState(),
      taskState,
    };
    const temp = this.snapshotFile + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(state));
    fs.renameSync(temp, this.snapshotFile);
    this.bus.publish("runtime_saved", { has_task: taskState !== null });
    return state;
  }
  async restore_runtime_state() {
    if (!fs.existsSync(this.snapshotFile)) return null;
    const state = JSON.parse(fs.readFileSync(this.snapshotFile, "utf8"));
    if (state.version !== 1) throw Error("Unsupported runtime snapshot");
    await this.restoreState(state.context);
    this.bus.publish("runtime_restored", {});
    return state;
  }
}
