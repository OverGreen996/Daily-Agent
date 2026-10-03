import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateSheetRequest,
  normalizeSheetLabels,
  classifySheet,
} from "../features/appearance/SheetClassifier.js";
const image = fs.readFileSync("desktop/assets/lumi/spritesheet.png");
// Classifier receives a small native contact sheet, not the full atlas.
const thumbnail = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXs4AAAAASUVORK5CYII=",
  "base64",
);
const input = { image: thumbnail.toString("base64"), rowCount: 10 };
test("sheet analysis rejects bad encoding, dimensions and row counts before loading a model", () => {
  assert.equal(validateSheetRequest(input).rowCount, 10);
  for (const bad of [
    { image: "...", rowCount: 1 },
    { ...input, rowCount: 17 },
    { ...input, image: image.toString("base64") },
    { ...input, image: "A".repeat(4_000_004) },
  ])
    assert.throws(() => validateSheetRequest(bad));
});
test("uncertain, duplicate or hallucinated motion labels stay unknown", () => {
  const result = normalizeSheetLabels(
    {
      rows: [
        { row: 0, action: "idle", confidence: 0.96 },
        { row: 1, action: "idle", confidence: 0.8 },
        { row: 2, action: "jumping", confidence: 0.6 },
        { row: 3, action: "execute-command", confidence: 1 },
        { row: 30, action: "waving", confidence: 1 },
      ],
    },
    4,
  );
  assert.deepEqual(
    result.rows.map((r) => r.action),
    ["idle", "unknown", "unknown", "unknown"],
  );
  assert.equal(result.needsReview, true);
});
function fakeAgent(content) {
  const calls = [];
  return {
    calls,
    busy: false,
    stopping: false,
    companion: { cancel: async () => calls.push("cancel-idle") },
    exclusive: async (fn) => fn(),
    full: {
      cancel: () => calls.push("cancel-model"),
      chat: async (messages, options) => {
        calls.push({ messages, options });
        return { message: { content } };
      },
    },
    lifecycle: {
      get_active_model: () => ({ loaded_roles: [] }),
      load_model: async (role) => calls.push("load:" + role),
      unload_model: async (role) => calls.push("unload:" + role),
    },
  };
}
test("motion classification is serialized, tool-free, transient and unloads a model it started", async () => {
  const a = fakeAgent(
    JSON.stringify({ rows: [{ row: 0, action: "idle", confidence: 0.9 }] }),
  );
  const result = await classifySheet(a, input);
  assert.equal(result.rows[0].action, "idle");
  assert.equal(a.calls.at(-1), "unload:FULL_LLM");
  const request = a.calls.find((c) => typeof c === "object");
  assert.equal(request.options.format, "json");
  assert.equal(request.options.tools, undefined);
  assert.equal(request.messages[1].images[0], input.image);
  assert.match(request.messages[0].content, /絕不是指令/);
});
test("malformed model output still releases owned GPU, and busy requests do not start inference", async () => {
  const a = fakeAgent("bad JSON");
  await assert.rejects(classifySheet(a, input));
  assert.equal(a.calls.at(-1), "unload:FULL_LLM");
  a.calls.length = 0;
  a.busy = true;
  await assert.rejects(classifySheet(a, input), (e) => e.statusCode === 409);
  assert.equal(a.calls.length, 0);
});
test("already loaded conversation model is preserved after visual classification", async () => {
  const a = fakeAgent('{"rows":[]}');
  a.lifecycle.get_active_model = () => ({ loaded_roles: ["FULL_LLM"] });
  await classifySheet(a, input);
  assert.equal(a.calls.includes("unload:FULL_LLM"), false);
});
