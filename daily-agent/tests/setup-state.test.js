import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const helper = path.resolve("../Daily-SetupState.ps1");
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
function run(script) {
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `. ${quote(helper)}; $ErrorActionPreference='Stop'; ${script}`,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 15000 },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.trim();
}
test("setup readiness rejects a missing model blob instead of trusting completion markers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daily-ready-"));
  try {
    const runtime = path.join(root, ".daily-runtime");
    for (const d of ["ollama", "tokenizer", "models/blobs"])
      fs.mkdirSync(path.join(runtime, d), { recursive: true });
    fs.writeFileSync(path.join(runtime, "ollama/ollama.exe"), "fixture");
    for (const f of [
      "manifest.json",
      "tokenizer.json",
      "tokenizer_config.json",
    ])
      fs.writeFileSync(path.join(runtime, "tokenizer", f), "{}");
    const checksum = createHash("sha256")
      .update("{}")
      .digest("hex")
      .toUpperCase();
    fs.writeFileSync(
      path.join(runtime, "tokenizer", "manifest.json"),
      JSON.stringify({
        files: {
          "tokenizer.json": checksum,
          "tokenizer_config.json": checksum,
        },
      }),
    );
    const digest = "a".repeat(64);
    fs.writeFileSync(
      path.join(runtime, "models/blobs/sha256-" + digest),
      "abc",
    );
    for (const name of [
      "qwen3.5/4b",
      "embeddinggemma/latest",
      "daily-qwen-idle/0.8b-q4",
    ]) {
      const file = path.join(
        runtime,
        "models/manifests/registry.ollama.ai/library",
        name,
      );
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({
          config: { digest: "sha256:" + digest, size: 3 },
          layers: [{ digest: "sha256:" + digest, size: 3 }],
        }),
      );
    }
    assert.equal(run(`(Get-DailyReadiness ${quote(root)}).ready`), "True");
    fs.unlinkSync(path.join(runtime, "models/blobs/sha256-" + digest));
    assert.equal(run(`(Get-DailyReadiness ${quote(root)}).ready`), "False");
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
test("cleanup preserves unfinished downloads and user data and skips an external junction", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daily-clean-")),
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "daily-outside-"));
  const runtime = path.join(root, ".daily-runtime");
  try {
    fs.mkdirSync(path.join(runtime, "ollama"), { recursive: true });
    fs.mkdirSync(path.join(runtime, "stt"), { recursive: true });
    fs.mkdirSync(path.join(runtime, "tts/kokoro-multi-lang-v1_1"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(runtime, "ollama/ollama.exe"), "installed");
    fs.writeFileSync(path.join(runtime, "ollama-windows-amd64.zip"), "done");
    fs.writeFileSync(
      path.join(
        runtime,
        "stt/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2",
      ),
      "unfinished",
    );
    fs.writeFileSync(path.join(runtime, "palace.sqlite"), "memory");
    fs.writeFileSync(path.join(runtime, "token.txt"), "credential");
    fs.writeFileSync(
      path.join(runtime, "tts/kokoro-multi-lang-v1_1/model.onnx"),
      "installed",
    );
    fs.writeFileSync(
      path.join(outside, "kokoro-multi-lang-v1_1.tar.bz2"),
      "external",
    );
    fs.symlinkSync(outside, path.join(runtime, "downloads"), "junction");
    assert.equal(run(`Clear-DailyArchives ${quote(root)}`), "4");
    assert.equal(
      fs.existsSync(path.join(runtime, "ollama-windows-amd64.zip")),
      false,
    );
    assert.equal(
      fs.readFileSync(
        path.join(outside, "kokoro-multi-lang-v1_1.tar.bz2"),
        "utf8",
      ),
      "external",
    );
    assert.equal(fs.existsSync(path.join(runtime, "palace.sqlite")), true);
    assert.equal(fs.existsSync(path.join(runtime, "token.txt")), true);
    assert.equal(
      fs.existsSync(
        path.join(
          runtime,
          "stt/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2",
        ),
      ),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(outside, { recursive: true, force: true, maxRetries: 5 });
  }
});
test("asset manifests detect corrupted installed files, allowing repair after archives are removed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-assets-"));
  try {
    fs.writeFileSync(path.join(dir, "model.onnx"), "original");
    assert.equal(
      run(
        `Save-DailyAssetManifest ${quote(dir)}; Test-DailyAssetManifest ${quote(dir)}`,
      ),
      "True",
    );
    fs.writeFileSync(path.join(dir, "model.onnx"), "modified");
    assert.equal(run(`Test-DailyAssetManifest ${quote(dir)}`), "False");
    fs.writeFileSync(
      path.join(dir, ".asset-ready.json"),
      JSON.stringify({
        schema: 1,
        files: [{ path: "../escape", size: 8, sha256: "a".repeat(64) }],
      }),
    );
    assert.equal(run(`Test-DailyAssetManifest ${quote(dir)}`), "False");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
