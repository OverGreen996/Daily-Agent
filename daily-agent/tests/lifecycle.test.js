import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ModelLifecycleManager,
  ModelRole as R,
} from "../models/ModelLifecycleManager.js";
const runtime = (gpu = true) => {
  let loaded = false;
  return {
    status: async () => (loaded ? { size_vram: gpu ? 100 : 0 } : null),
    load: async () => {
      loaded = true;
      return { size_vram: gpu ? 100 : 0 };
    },
    unload: async () => {
      loaded = false;
    },
  };
};
function manager(models) {
  let restored;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-lifecycle-"));
  const m = new ModelLifecycleManager({
    models,
    snapshotFile: path.join(dir, "state.json"),
    bus: { publish() {} },
    saveState: async () => ({
      working_context: [{ content: "記住稱呼" }],
      memory_database: "palace.sqlite",
    }),
    restoreState: async (s) => {
      restored = s;
    },
  });
  return { m, getRestored: () => restored };
}
test("GPU owner is exclusive, CPU cannot acquire GPU, future roles are unregistered", async () => {
  const { m } = manager({
    [R.FULL_LLM]: { runtime: runtime(), gpu: true },
    [R.IDLE_LLM]: { runtime: runtime(false), gpu: false },
  });
  await m.load_model(R.FULL_LLM);
  assert.equal(m.get_active_model().gpu_owner, R.FULL_LLM);
  assert.throws(() => m.request_gpu_owner(R.IDLE_LLM));
  await assert.rejects(() => m.release_gpu_owner(R.FULL_LLM));
  await assert.rejects(() => m.load_model(R.IMAGE_GENERATOR));
  await m.unload_model(R.FULL_LLM);
  assert.equal(m.get_active_model().gpu_owner, null);
  await m.load_model(R.IDLE_LLM);
  assert.equal(m.get_active_model().gpu_owner, null);
});
test("future heavy GPU runtime cannot overlap Full; failed unload retains ownership", async () => {
  const full = runtime();
  const { m } = manager({
    [R.FULL_LLM]: { runtime: full, gpu: true },
    [R.IMAGE_GENERATOR]: { runtime: runtime(), gpu: true },
  });
  await m.load_model(R.FULL_LLM);
  await assert.rejects(() => m.load_model(R.IMAGE_GENERATOR));
  full.unload = async () => {
    throw Error("unload failed");
  };
  await assert.rejects(() => m.unload_model(R.FULL_LLM));
  assert.equal(m.get_active_model().gpu_owner, R.FULL_LLM);
});
test("save and restore persists working context plus opaque future task state", async () => {
  const { m, getRestored } = manager({});
  await m.save_runtime_state({ id: "future-test-only", prompt: "opaque spec" });
  const restored = await m.restore_runtime_state();
  assert.equal(restored.taskState.id, "future-test-only");
  assert.equal(getRestored().working_context[0].content, "記住稱呼");
});
