import test from "node:test";
import assert from "node:assert/strict";
import { MemoryPalace, tokens } from "../memory/MemoryPalace.js";
const embedding = {
  embed: async (texts) =>
    texts.map((t) => [
      t.includes("Qwen") ? 1 : 0,
      t.includes("列印") ? 1 : 0,
      0.1,
    ]),
};
test("Idle entity learning creates searchable cards without calling the full model", async () => {
  const p = new MemoryPalace(":memory:", embedding, {
    summarize: async () => {
      throw Error("must not wake GPU model");
    },
  });
  await p.learnEntity({
    entity: "Archicad",
    meaning: "BIM architectural design",
    source: [{ url: "https://graphisoft.com" }],
    confidence: 0.85,
  });
  assert.equal(p.entities.get("archicad").confidence, 0.85);
  assert.equal(p.books.all().length, 1);
  assert.ok((await p.retriever.search("Archicad")).length);
  p.close();
});
test("card budgets and original character offsets remain accurate", async () => {
  const p = new MemoryPalace(":memory:", embedding);
  const long = "前段。".repeat(300) + "真正重要的後段。".repeat(150);
  p.working.add("user", long, "同一話題");
  p.working.add("user", "新話題", "新話題");
  await p.flush({ force: true });
  const cards = p.db
    .prepare("SELECT * FROM cards")
    .all()
    .map((c) => p.cards.get(c.card_id));
  assert.ok(cards.length > 3);
  assert.ok(cards.every((c) => tokens(c.text) < 500));
  const late = cards.find((c) => c.text.includes("真正"));
  assert.ok(p.cards.raw(late).includes("真正"));
  p.close();
});
test("embedding failure leaves all original conversation unarchived", async () => {
  const p = new MemoryPalace(":memory:", {
    embed: async () => {
      throw Error("embedding unavailable");
    },
  });
  const id = p.working.add("user", "完整原文", "舊話題");
  p.working.add("user", "新內容", "新話題");
  await assert.rejects(() => p.flush({ force: true }));
  assert.equal(p.books.all().length, 0);
  assert.ok(p.working.list().some((m) => m.id === id));
  p.close();
});
test("14K threshold flushes complete old topic, retains current topic and every raw message", async () => {
  const p = new MemoryPalace(":memory:", embedding);
  const old = [];
  for (let i = 0; i < 18; i++)
    old.push(
      p.working.add(
        i % 2 ? "assistant" : "user",
        "Qwen 架構討論。".repeat(80),
        "Desktop Agent",
      ),
    );
  p.working.add("user", "現在談3D列印。".repeat(300), "3D列印");
  assert.ok(p.working.tokenCount >= 14336);
  const ids = await p.flush();
  assert.equal(ids.length, 1);
  const book = p.books.get(ids[0]);
  assert.deepEqual(book.raw_message_ids, old);
  assert.equal(book.raw_conversation.length, 18);
  assert.ok(p.working.list().every((m) => m.topic === "3D列印"));
  const found = await p.retriever.search("Qwen");
  assert.ok(found.length);
  assert.equal(found[0].book_id, ids[0]);
  assert.match(p.cards.raw(found[0]), /Qwen/);
  p.close();
});
test("below threshold does not flush; a single ongoing topic is never cut", async () => {
  const p = new MemoryPalace(":memory:", embedding, { flushAt: 100 });
  p.working.add("user", "短句", "same");
  assert.deepEqual(await p.flush(), []);
  p.working.add("assistant", "長對話".repeat(1000), "same");
  assert.deepEqual(await p.flush(), []);
  assert.equal(p.working.list().length, 2);
  p.close();
});
test("pins immediately persist, metadata filtering and evidence counts", async () => {
  const p = new MemoryPalace(":memory:", embedding);
  p.pins.extract("記住，請叫我小王");
  assert.equal(p.pins.all().length, 1);
  p.working.add("user", "Qwen 模型決策", "Qwen");
  p.working.add("assistant", "Qwen 4B", "Qwen");
  p.working.add("user", "3D列印", "new");
  await p.flush({ force: true });
  assert.equal(
    (await p.retriever.search("Qwen", { project: "Other" })).length,
    0,
  );
  const h = p.habits.observe("Photoshop", 1000000);
  assert.equal(h.evidence_count, 1);
  assert.equal(p.habits.observe("Photoshop", 1000010).evidence_count, 1);
  assert.equal(p.habits.observe("Photoshop", 1400000).evidence_count, 2);
  p.close();
});
