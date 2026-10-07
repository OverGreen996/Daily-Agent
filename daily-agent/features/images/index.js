import path from "node:path";
import { ComfyUIImageRuntime } from "../../models/ImageGeneration.js";
import { ModelRole } from "../../models/ModelLifecycleManager.js";
import { imageChat } from "./ImageCommands.js";
export function create({ config }) {
  const checkpoint = (name) =>
    path.join(config.imageRuntimeDir, "ComfyUI", "models", "checkpoints", name);
  const runtime = new ComfyUIImageRuntime({
    root: config.imageRuntimeDir,
    qualityCheckpoint: checkpoint(config.imageQualityCheckpoint),
    photoCheckpoint: checkpoint(config.imagePhotoCheckpoint),
    outputDir: path.join(config.dataDir, "generated-images"),
    port: config.imagePort,
  });
  return {
    models: { [ModelRole.IMAGE_GENERATOR]: { runtime, gpu: true } },
    chat: imageChat,
    attach(agent) {
      agent.imageRuntime = runtime;
    },
  };
}
