import test from "node:test";
import assert from "node:assert/strict";
import { AgentCore } from "../core/AgentCore.js";
test("context budget preserves system and current user, excludes image bytes from text budget", () => {
  const agent = new AgentCore({ bus: { publish() {} } });
  const messages = [
    { role: "system", content: "system rules" },
    { role: "assistant", content: "old".repeat(1000) },
    { role: "user", content: "current", images: ["A".repeat(100000)] },
    { role: "system", content: "source".repeat(1000) },
  ];
  agent.fitContext(messages, 500);
  assert.equal(messages[0].content, "system rules");
  assert.ok(
    messages.some(
      (m) => m.content === "current" && m.images[0].length === 100000,
    ),
  );
});
