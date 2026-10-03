import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createAgent } from "../core/createAgent.js";
const dataDir=path.resolve("test-output/learning-"+Date.now());
const agent =await createAgent({
  dataDir,
  perception: false,
  searxngUrl: "",
});
const r = {};
try {
  let calls = 0;
  const search = agent.companion.browser.search.bind(agent.companion.browser);
  agent.companion.browser.search = (...args) => {
    calls++;
    return search(...args);
  };
  r.first = await agent.companion.lookup.lookup("Archicad.exe", {
    force: true,
  });
  assert.ok(r.first);
  r.second = await agent.companion.lookup.lookup("Archicad.exe", {
    force: true,
  });
  assert.equal(r.second.memory_hit, true);
  assert.equal(calls, 1);
  r.searchCalls = calls;
  assert.match(r.first.meaning,/BIM/i);
  assert.equal(agent.companion.browser.browser.closed,true);
  r.unknown=await agent.companion.lookup.lookup("Inkscape.exe",{force:true});
  assert.ok(r.unknown,"Unlisted software lookup failed");
  assert.match(r.unknown.meaning,/vector/i);
  assert.equal(agent.companion.browser.browser.closed,true);
  r.closedAfterLookup=true;
  r.models = (await agent.full.request("/api/ps")).models;
  assert.ok(!r.models.some((m) => m.name === "qwen3.5:4b"));
  r.cards = await agent.memory.retriever.search("Archicad 是什麼軟體？");
  assert.ok(r.cards.length);
  const restarted=await createAgent({dataDir,perception:false,searxngUrl:""});
  try {
    restarted.companion.browser.search=()=>{throw Error("Restart must use saved memory");};
    assert.equal((await restarted.companion.lookup.lookup("ARCHICAD.EXE")).memory_hit,true);
    r.persistedAcrossRestart=true;
  } finally {await restarted.browser.close();await restarted.companion.browser.close();restarted.memory.close();}
  r.passed = true;
} catch (e) {
  r.error = e.stack;
  process.exitCode = 1;
} finally {
  await agent.browser.close();
  await agent.companion.browser.close();
  agent.memory.close();
  fs.writeFileSync(
    "test-output/learning-report.json",
    JSON.stringify(r, null, 2),
  );
  fs.writeFileSync(path.join(dataDir,"report.json"),JSON.stringify(r,null,2));
  console.log(JSON.stringify({dataDir,passed:r.passed,error:r.error,searchCalls:r.searchCalls,closedAfterLookup:r.closedAfterLookup,persistedAcrossRestart:r.persistedAcrossRestart,source:r.first?.source,unknownSource:r.unknown?.source,modelCount:r.models?.length}));
}
