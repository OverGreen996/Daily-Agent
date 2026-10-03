import fs from "node:fs";
import path from "node:path";
import { getRuntimeDirectory } from "../../core/RuntimePaths.cjs";
// The native desktop owns microphones and voice workers; this adapter reports availability.
export function create({ root }) {
  const runtime = getRuntimeDirectory(path.resolve(root, ".."));
  return {
    routes: [
      {
        method: "GET",
        path: "/",
        handle: () => ({
          owner: "native-desktop",
          windows: process.platform === "win32",
          kokoro: fs.existsSync(
            path.join(runtime, "tts/kokoro-multi-lang-v1_1/model.onnx"),
          ),
          stt: fs.existsSync(
            path.join(
              runtime,
              "stt/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30/encoder.int8.onnx",
            ),
          ),
        }),
      },
    ],
  };
}
