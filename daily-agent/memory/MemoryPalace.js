import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {PinConflicts} from './PinConflicts.js';
import {PersonalMemory} from './PersonalMemory.js';
// Conservative budget, calibrated against runtime prompt_eval_count in AgentCore.
let nativeCounter;
export const setTokenCounter=counter=>{nativeCounter=counter;};
export const tokens = (s) => nativeCounter ? nativeCounter(String(s))+16 :
  Math.ceil(Buffer.byteLength(String(s), "utf8") / 2) + 8;
export const lexical = (s) =>
  [
    ...String(s)
      .toLowerCase()
      .matchAll(/[a-z0-9_.-]+|[\p{Script=Han}]/gu),
  ]
    .map((m) => m[0])
    .join(" ");
export const cosine = (a, b) => {
  if (!a?.length || a.length !== b?.length) return 0;
  let d = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    x += a[i] ** 2;
    y += b[i] ** 2;
  }
  return d / (Math.sqrt(x * y) || 1);
};
const uid = () => randomUUID(),
  now = () => new Date().toISOString();
const decode = (r) =>
  r
    ? {
        ...r,
        metadata: JSON.parse(r.metadata || "{}"),
        embedding: JSON.parse(r.embedding || "[]"),
      }
    : null;
export class WorkingMemory {
  constructor(db) {
    this.db = db;
  }
  add(role, content, topic = "日常", extra = {}) {
    if(extra.generation || Object.hasOwn(extra,'image_mode') || extra.no_memory)return null;
    const id = uid();
    this.db
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,0)")
      .run(
        id,
        now(),
        role,
        content,
        topic,
        tokens(content),
        JSON.stringify(extra),
      );
    return id;
  }
  list() {
    return this.db
      .prepare("SELECT * FROM messages WHERE archived=0 ORDER BY rowid")
      .all();
  }
  get tokenCount() {
    return this.list().reduce((s, m) => s + m.tokens, 0);
  }
}
export class BookStore {
  constructor(db) {
    this.db = db;
  }
  all() {
    return this.db
      .prepare(
        "SELECT book_id,created_at,summary,metadata FROM books ORDER BY created_at DESC",
      )
      .all()
      .map(decode);
  }
  get(id) {
    const b = decode(
      this.db.prepare("SELECT * FROM books WHERE book_id=?").get(id),
    );
    return b
      ? {
          ...b,
          raw_conversation: JSON.parse(b.raw_conversation),
          raw_message_ids: JSON.parse(b.raw_message_ids),
        }
      : null;
  }
}
export class MemoryCardStore {
  constructor(db) {
    this.db = db;
  }
  get(id) {
    return decode(
      this.db.prepare("SELECT * FROM cards WHERE card_id=?").get(id),
    );
  }
  raw(card, budget = 1200) {
    const b = JSON.parse(
      this.db
        .prepare("SELECT raw_conversation FROM books WHERE book_id=?")
        .get(card.book_id).raw_conversation,
    );
    const m = b[card.start_position];
    let start = Math.max(0, (card.metadata?.char_start || 0) - 150),
      end = Math.min(
        m.content.length,
        (card.metadata?.char_end || m.content.length) + 600,
      );
    let text = m.content.slice(start, end);
    while (tokens(text) > budget)
      text = text.slice(0, Math.floor(text.length * 0.9));
    return `${m.role} [message ${m.id}, offset ${start}]: ${text}`;
  }
}
export class PermanentPins {
  constructor(db) {
    this.db = db;
    db.exec("CREATE TABLE IF NOT EXISTS memory_settings(key TEXT PRIMARY KEY,value TEXT)");
    this.conflicts=new PinConflicts(db);
  }
  seedDefaults(texts) {
    if(this.db.prepare("SELECT 1 FROM memory_settings WHERE key='default_pins_seeded'").get())return;
    this.db.exec("BEGIN");
    try {
      for(const text of texts)this.save(text,"rule");
      this.db.prepare("INSERT INTO memory_settings VALUES('default_pins_seeded','1')").run();
      this.db.exec("COMMIT");
    } catch(e) {this.db.exec("ROLLBACK");throw e;}
  }
  validate(text) {
    if(typeof text!=="string" || !text.trim())throw Error("記憶內容不能是空白。");
    if(text.length>1600)throw Error("一條永久記憶最多 1600 字，請拆成幾條。");
    return text.trim();
  }
  save(text, type = "preference", confidence = 1, {skipConflict=false}={}) {
    text=this.validate(text);
    if(!skipConflict){const conflict=this.conflicts.detect(text,type);if(conflict)return conflict;}
    if (
      ![
        "decision",
        "rule",
        "preference",
        "project",
        "architecture",
        "person",
        "entity",
        "question",
        "idea",
        "habit",
        "knowledge",
      ].includes(type)
    )
      type = "knowledge";
    this.db
      .prepare(
        "INSERT INTO pins VALUES(?,?,?,?,?) ON CONFLICT(text) DO UPDATE SET confidence=excluded.confidence",
      )
      .run(uid(), text, type, confidence, now());
    return this.db.prepare("SELECT * FROM pins WHERE text=?").get(text);
  }
  resolve(id) {
    if(!/^[a-f0-9-]{8,36}$/i.test(id))throw Error("請提供記憶清單中的編號。");
    const rows=this.db.prepare("SELECT * FROM pins WHERE lower(substr(id,1,?))=?").all(id.length,id.toLowerCase());
    if(!rows.length)throw Error("找不到這個記憶編號，可先說「查看永久記憶」。");
    if(rows.length>1)throw Error("這個短編號對應多條記憶，請使用完整編號。");
    return rows[0];
  }
  update(id,text) {
    const pin=this.resolve(id);text=this.validate(text);
    const duplicate=this.db.prepare("SELECT id FROM pins WHERE text=? AND id<>?").get(text,pin.id);
    if(duplicate)throw Error("已有相同內容的記憶，原記憶已保留。");
    this.db.prepare("UPDATE pins SET text=?,confidence=1 WHERE id=?").run(text,pin.id);
    return this.resolve(pin.id);
  }
  remove(id) {
    const pin=this.resolve(id);this.db.prepare("DELETE FROM pins WHERE id=?").run(pin.id);return pin;
  }
  page(query="",page=1) {
    query=String(query).slice(0,200); page=Math.max(1,Math.min(100000,Number(page)||1));
    const total=this.db.prepare("SELECT count(*) AS n FROM pins WHERE instr(lower(text),lower(?))>0").get(query).n;
    const rows=this.db.prepare("SELECT * FROM pins WHERE instr(lower(text),lower(?))>0 ORDER BY created_at DESC,rowid DESC LIMIT 8 OFFSET ?").all(query,(page-1)*8);
    return {rows,total,page,pages:Math.max(1,Math.ceil(total/8))};
  }
  all() {
    return this.db
      .prepare("SELECT * FROM pins ORDER BY created_at DESC LIMIT 40")
      .all();
  }
  extract(text) {
    if (/^(我)?(是不是|是否|該不該|有沒有)|^did i|^should i/i.test(text.trim()))
      return;
    if (
      /記住|記得|規則|偏好|我喜歡|我不喜歡|決定|預設|禁止|不要|請叫我|稱呼我|remember|prefer|always|never/i.test(
        text,
      )
    )
      return this.save(
        text.slice(0, 1600),
        /禁止|不要|規則|never/i.test(text)
          ? "rule"
          : /決定|預設/i.test(text)
            ? "decision"
            : "preference",
      );
  }
}
export class EntityMemory {
  constructor(db) {
    this.db = db;
  }
  get(name) {
    const r = this.db
      .prepare("SELECT * FROM entities WHERE name=? COLLATE NOCASE")
      .get(name);
    return r ? JSON.parse(r.data) : null;
  }
  save(name, data) {
    this.db
      .prepare(
        "INSERT INTO entities VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen",
      )
      .run(name, JSON.stringify(data), now());
  }
  search(query) {
    return this.db
      .prepare("SELECT name,data FROM entities")
      .all()
      .filter((e) => query.toLowerCase().includes(e.name.toLowerCase()))
      .slice(0, 4)
      .map((e) => JSON.parse(e.data));
  }
}
export class HabitMemory {
  constructor(db) {
    this.db = db;
  }
  observe(key, at = Date.now()) {
    const r = this.db.prepare("SELECT * FROM habits WHERE key=?").get(key);
    if (r && at - r.last_seen < 300000) return r;
    const n = (r?.evidence_count || 0) + 1;
    this.db
      .prepare(
        "INSERT INTO habits VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET evidence_count=excluded.evidence_count,confidence=excluded.confidence,last_seen=excluded.last_seen",
      )
      .run(key, n, Math.min(0.9, 0.15 + n * 0.05), at);
    return this.db.prepare("SELECT * FROM habits WHERE key=?").get(key);
  }
  observeSequence(activity,at=Date.now()){
    const process=(activity.process||'unknown').toLowerCase(),previous=this.previous;
    if(previous?.process===process){previous.at=at;previous.asset ||= /character|sprite|角色/i.test(activity.title||'');return;}
    this.previous={process,at,asset:/character|sprite|角色/i.test(activity.title||'')};
    if(previous && at-previous.at<1800000 && /photoshop|krita|gimp/i.test(previous.process) && /aseprite|pixel/i.test(process) && (previous.asset||this.previous.asset))this.observe('possible_character_asset_workflow',at);
    if(previous && previous.process!=='unknown' && process!=='unknown' && at-previous.at<1800000)this.observe('sequence:'+previous.process+' → '+process,at);
  }
  confirmed(){return this.db.prepare("SELECT * FROM habits WHERE evidence_count>=5 AND confidence>=0.4 ORDER BY last_seen DESC LIMIT 8").all();}
}
export class MemoryIndexer {
  constructor(db, embedding) {
    this.db = db;
    this.embedding = embedding;
  }
  async index(texts) {
    return this.embedding.embed(texts);
  }
}
export class MemoryRetriever {
  constructor(palace) {
    this.p = palace;
  }
  analyze(query, filters = {}) {
    const entities = [...query.matchAll(/[A-Za-z][A-Za-z0-9_.-]{2,}/g)].map(
      (m) => m[0],
    );
    return {
      query,
      entities,
      needsRaw: /原文|詳細|exact|怎麼說|當時/i.test(query),
      ...filters,
    };
  }
  async search(query, filters = {}) {
    const a = this.analyze(query, filters),
      db = this.p.db;
    const [vector] = await this.p.indexer.index([query]);
    const words = [...new Set(lexical(query).split(" ").filter(Boolean))].slice(
      0,
      40,
    );
    const fts = words.length
      ? db
          .prepare(
            "SELECT card_id,bm25(card_fts) AS rank FROM card_fts WHERE card_fts MATCH ? ORDER BY rank LIMIT 40",
          )
          .all(words.map((w) => '"' + w.replaceAll('"', "") + '"').join(" OR "))
      : [];
    const lexicalRanks = new Map(fts.map((r, i) => [r.card_id, 1 / (i + 1)]));
    const rows = db
      .prepare("SELECT * FROM cards")
      .all()
      .map(decode)
      .filter(
        (c) =>
          (!a.project || c.metadata.project === a.project) &&
          (!a.memory_type ||
            c.metadata.memory_types?.includes(a.memory_type)) &&
          (!a.topic || c.metadata.topics?.includes(a.topic)) &&
          (!a.entity || c.metadata.entities?.includes(a.entity)) &&
          (!a.date || c.created_at.startsWith(a.date)),
      );
    const ranked = rows
      .map((c) => {
        const semantic = cosine(vector, c.embedding);
        const entity = a.entities.some((e) =>
          JSON.stringify(c.metadata).toLowerCase().includes(e.toLowerCase()),
        )
          ? 0.08
          : 0;
        const age = (Date.now() - Date.parse(c.created_at)) / 86400000;
        return {
          ...c,
          semantic,
          score:
            0.65 * Math.max(0, semantic) +
            0.22 * (lexicalRanks.get(c.card_id) || 0) +
            entity +
            0.02 * (c.metadata.importance || 0.5) +
            0.02 * Math.exp(-age / 30),
        };
      })
      .filter((c) => c.semantic > 0.2 || lexicalRanks.has(c.card_id))
      .sort((x, y) => y.score - x.score);
    // Diversity rerank: penalize near-duplicate cards, retain 3–6 when available.
    const selected = [];
    for (const c of ranked) {
      if (selected.some((s) => cosine(s.embedding, c.embedding) > 0.97))
        continue;
      selected.push({
        ...c,
        raw:
          a.needsRaw || c.semantic < 0.45
            ? this.p.cards.raw(c, 1000)
            : undefined,
      });
      if (selected.length === 5) break;
    }
    return selected;
  }
}
export class MemoryPalace {
  constructor(file, embedding, { flushAt = 14336, summarize = null, timeZone, now, personal = true } = {}) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,time TEXT,role TEXT,content TEXT,topic TEXT,tokens INTEGER,extra TEXT,archived INTEGER);
      CREATE TABLE IF NOT EXISTS books(book_id TEXT PRIMARY KEY,created_at TEXT,start_time TEXT,end_time TEXT,summary TEXT,metadata TEXT,raw_conversation TEXT,raw_message_ids TEXT,embedding TEXT);
      CREATE TABLE IF NOT EXISTS cards(card_id TEXT PRIMARY KEY,book_id TEXT REFERENCES books(book_id),created_at TEXT,text TEXT,start_position INTEGER,end_position INTEGER,metadata TEXT,embedding TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS card_fts USING fts5(card_id UNINDEXED,text);
      CREATE TABLE IF NOT EXISTS pins(id TEXT PRIMARY KEY,text TEXT UNIQUE,type TEXT,confidence REAL,created_at TEXT);
      CREATE TABLE IF NOT EXISTS entities(name TEXT PRIMARY KEY COLLATE NOCASE,data TEXT,last_seen TEXT);
      CREATE TABLE IF NOT EXISTS habits(key TEXT PRIMARY KEY,evidence_count INTEGER,confidence REAL,last_seen INTEGER);
      CREATE INDEX IF NOT EXISTS card_project ON cards(json_extract(metadata,'$.project'));
      CREATE INDEX IF NOT EXISTS card_importance ON cards(json_extract(metadata,'$.importance'));
      CREATE INDEX IF NOT EXISTS card_confidence ON cards(json_extract(metadata,'$.confidence'));
      CREATE INDEX IF NOT EXISTS card_date ON cards(created_at);
      CREATE TABLE IF NOT EXISTS metadata_index(card_id TEXT,kind TEXT,value TEXT);
      CREATE INDEX IF NOT EXISTS metadata_lookup ON metadata_index(kind,value);`);
    Object.assign(this, { flushAt, summarize });
    this.working = new WorkingMemory(this.db);
    this.books = new BookStore(this.db);
    this.cards = new MemoryCardStore(this.db);
    this.pins = new PermanentPins(this.db);
    this.entities = new EntityMemory(this.db);
    this.habits = new HabitMemory(this.db);
    this.personal = personal ? new PersonalMemory(this.db,{timeZone,now}) : null;
    this.indexer = new MemoryIndexer(this.db, embedding);
    this.retriever = new MemoryRetriever(this);
  }
  async flush({ force = false } = {}) {
    const all = this.working.list();
    if (!force && this.working.tokenCount < this.flushAt) return [];
    // Only complete topic runs are archived. The current run is kept intact.
    const runs = [];
    for (const m of all) {
      if (!runs.length || runs.at(-1)[0].topic !== m.topic) runs.push([]);
      runs.at(-1).push(m);
    }
    const completed = runs.slice(0, -1);
    let moved = 0,
      ids = [];
    for (const run of completed) {
      ids.push(await this.archive(run));
      moved += run.reduce((s, m) => s + m.tokens, 0);
      if (moved >= 8192) break;
    }
    return ids;
  }
  async archive(run, { summaryOverride } = {}) {
    const id = uid(),
      topic = run[0].topic,
      created = now();
    let summary = run
      .map((m) => m.content)
      .join("\n")
      .slice(0, 1500);
    if (summaryOverride !== undefined) summary = summaryOverride;
    else if (this.summarize) summary = await this.summarize(run);
    const metadata = {
      project: "Daily Agent",
      topics: [topic],
      entities: [
        ...new Set(
          run.flatMap((m) =>
            [...m.content.matchAll(/[A-Za-z][A-Za-z0-9_.-]{2,}/g)].map(
              (x) => x[0],
            ),
          ),
        ),
      ].slice(0, 30),
      keywords: lexical(summary).split(" ").slice(0, 40),
      memory_types: ["knowledge"],
      importance: 0.6,
      confidence: 0.8,
    };
    // Cards are bounded excerpts with exact message and character provenance.
    const chunks = [];
    for (let pos = 0; pos < run.length; pos++) {
      const m = run[pos];
      let start = 0;
      while (start < m.content.length) {
        let end = Math.min(start + 1000, m.content.length);
        while (tokens(m.content.slice(start, end)) + tokens(topic) > 450)
          end = start + Math.floor((end - start) * 0.85);
        if (end < m.content.length) {
          const cut = m.content.lastIndexOf("。", end);
          if (cut > start + 80) end = cut + 1;
        }
        chunks.push({
          text: `${topic} / ${m.role}: ${m.content.slice(start, end)}`,
          start_position: pos,
          end_position: pos,
          char_start: start,
          char_end: end,
        });
        start = end;
      }
    }
    const vectors = await this.indexer.index([
      summary,
      ...chunks.map((c) => c.text),
    ]);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          created,
          run[0].time,
          run.at(-1).time,
          summary,
          JSON.stringify(metadata),
          JSON.stringify(run),
          JSON.stringify(run.map((m) => m.id)),
          JSON.stringify(vectors[0]),
        );
      chunks.forEach((c, i) => {
        const cid = uid(),
          meta = {
            ...metadata,
            char_start: c.char_start,
            char_end: c.char_end,
          };
        this.db
          .prepare("INSERT INTO cards VALUES(?,?,?,?,?,?,?,?)")
          .run(
            cid,
            id,
            created,
            c.text,
            c.start_position,
            c.end_position,
            JSON.stringify(meta),
            JSON.stringify(vectors[i + 1]),
          );
        this.db
          .prepare("INSERT INTO card_fts VALUES(?,?)")
          .run(cid, lexical(c.text));
        for (const kind of ["topics", "entities", "memory_types"])
          for (const value of metadata[kind])
            this.db
              .prepare("INSERT INTO metadata_index VALUES(?,?,?)")
              .run(cid, kind, value);
      });
      for (const m of run)
        this.db.prepare("UPDATE messages SET archived=1 WHERE id=?").run(m.id);
      this.db.exec("COMMIT");
      return id;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  checkpoint() {
    this.db.exec("PRAGMA wal_checkpoint(PASSIVE)");
  }
  async learnEntity(entry) {
    const time = now();
    await this.archive(
      [
        {
          id: uid(),
          time,
          role: "tool",
          content: JSON.stringify(entry),
          topic: "Entity: " + entry.entity,
          tokens: tokens(JSON.stringify(entry)),
          extra: "{}",
          archived: 1,
        },
      ],
      { summaryOverride: entry.entity + ": " + entry.meaning },
    );
    this.entities.save(entry.entity, entry);
  }
  close() {
    this.db.close();
  }
}
