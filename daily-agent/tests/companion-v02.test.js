import test from "node:test";
import assert from "node:assert/strict";
import { LocationProvider } from "../environment/LocationProvider.js";
import {
  WeatherEventEngine,
  WeatherWatch,
  OpenMeteoProvider,
} from "../idle/WeatherWatch.js";
import { EnvironmentWatch } from "../idle/EnvironmentWatch.js";
import { SpeakDecisionEngine } from "../idle/SpeakDecisionEngine.js";
import { companionEvent } from "../core/CompanionEvents.js";
import { IdleCompanion } from "../idle/IdleCompanion.js";
import {
  SearXNGProvider,
  LightSearchBrowser,
} from "../browser/SearXNGProvider.js";
import { AgentCore } from "../core/AgentCore.js";
import { groundEventText } from "../idle/EventNarration.js";
const bus = { publish() {} };
test("event narration rejects stale sunny history and invented clear time", () => {
  const e = companionEvent("HEAVY_RAIN_INCOMING", { forecast: true }, 92);
  assert.match(groundEventText("預報顯示目前無明顯降雨，32.9度。", e), /大雨/);
  assert.doesNotMatch(
    groundEventText("預報顯示大雨將在30分鐘後停止。", e),
    /30/,
  );
  assert.equal(
    groundEventText("預報顯示可能有大雨，記得带傘。", e),
    "預報顯示可能有大雨，記得带傘。",
  );
});
const weatherState = (extra = {}) => ({
  temperature: 26,
  rain: 0,
  wind: 10,
  uv: 3,
  future: [],
  source: "Open-Meteo forecast",
  ...extra,
});
test("location precedence, freshness, minimum precision and no home fallback for active phone", async () => {
  let now = Date.now(),
    ipCalls = 0;
  const l = new LocationProvider({
    now: () => now,
    windows: async () => ({
      latitude: 25.03231,
      longitude: 121.56321,
      source: "windows_location",
    }),
    ip: async () => {
      ipCalls++;
      return null;
    },
  });
  const city = await l.current("CITY");
  assert.equal(city.latitude, 25);
  assert.equal(city.longitude, 121.6);
  assert.ok(city.accuracy >= 15000);
  assert.equal(ipCalls, 0);
  assert.equal("latitude" in l.status(), false);
  await assert.rejects(() => l.current("PRECISE"));
  l.updateAndroid({ latitude: 22.61234, longitude: 120.31234, accuracy: 10 });
  l.setActiveDevice("android");
  assert.equal((await l.current("CITY")).source, "android_gps");
  now += 300001;
  assert.equal(await l.current("CITY"), null);
  l.setActiveDevice("pc");
  assert.equal((await l.current("AREA")).latitude, 25.03);
  l.updateAndroid({
    latitude: 22.6,
    longitude: 120.3,
    updated_at: new Date(now - 600000).toISOString(),
  });
  l.setActiveDevice("android");
  assert.equal(
    await l.current("CITY"),
    null,
    "receiving an old GPS fix must not make it fresh",
  );
  assert.throws(() => l.updateAndroid({ latitude: 999, longitude: 0 }));
});
test("Windows unavailable uses IP once, location is ephemeral", async () => {
  let calls = 0;
  const l = new LocationProvider({
    windows: async () => {
      throw Error("denied");
    },
    ip: async () => {
      calls++;
      return { latitude: 25, longitude: 121.5, source: "ip_geolocation" };
    },
  });
  assert.equal((await l.current()).source, "ip_geolocation");
  await l.current();
  assert.equal(calls, 1);
});
test("weather emits transitions, not each refresh, and rearms after conditions clear", () => {
  const e = new WeatherEventEngine();
  assert.deepEqual(e.compare(weatherState()), []);
  const rain = weatherState({ rain: 0.4 });
  assert.deepEqual(
    e.compare(rain).map((e) => e.type),
    ["RAIN_STARTED"],
  );
  assert.deepEqual(e.compare(rain), []);
  assert.deepEqual(
    e.compare(weatherState({ rain: 3 })).map((e) => e.type),
    ["RAIN_INTENSIFIED"],
  );
  assert.deepEqual(
    e.compare(weatherState()).map((e) => e.type),
    ["RAIN_STOPPED"],
  );
  const hazard = weatherState({
    temperature: 36,
    wind: 45,
    uv: 9,
    future: [{ rain: 9, code: 95 }],
  });
  const types = e.compare(hazard).map((e) => e.type);
  for (const t of [
    "TEMPERATURE_RISE",
    "HIGH_TEMPERATURE",
    "STRONG_WIND",
    "HIGH_UV",
    "HEAVY_RAIN_INCOMING",
    "THUNDERSTORM_INCOMING",
  ])
    assert.ok(types.includes(t));
  assert.equal(types.includes("WEATHER_WARNING"), false);
  assert.deepEqual(e.compare(hazard), []);
  assert.ok(
    e.compare(weatherState()).some((e) => e.type === "TEMPERATURE_DROP"),
  );
  assert.ok(e.compare(hazard).some((e) => e.type === "HEAVY_RAIN_INCOMING"));
});
test("weather schedules bounded refreshes, never transmits precise location or logs GPS", async () => {
  let requests = 0,
    sent,
    events = [];
  const provider = new OpenMeteoProvider(async (url) => {
    sent = new URL(url);
    requests++;
    return {
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 25,
          rain: 0,
          showers: 0,
          weather_code: 0,
          wind_speed_10m: 8,
          time: 1000,
        },
        hourly: {
          time: [1000],
          rain: [0],
          showers: [0],
          weather_code: [0],
          uv_index: [4],
        },
      }),
    };
  });
  const watch = new WeatherWatch({
    location: {
      current: async (precision) => {
        assert.equal(precision, "CITY");
        return { latitude: 25, longitude: 121.5, precision, city: "測試城市" };
      },
    },
    provider,
    config: { weatherEnabled: true, weatherRefreshMs: 900000 },
    bus: { publish: (...e) => events.push(e) },
  });
  await watch.refresh(1000000);
  await watch.refresh(1000001);
  assert.equal(requests, 1);
  await watch.refresh(1900000);
  assert.equal(requests, 2);
  assert.equal(sent.searchParams.get("latitude"), "25");
  assert.equal(JSON.stringify(events).includes("latitude"), false);
  assert.equal("latitude" in watch.state, false);
});
test("environment transitions are deduplicated including battery, network, user return", () => {
  const w = new EnvironmentWatch(),
    now = Date.now();
  const s = {
    process: "notepad",
    since: now,
    idleMs: 600001,
    network: true,
    battery: null,
  };
  w.observe(s, now);
  const next = {
    ...s,
    process: "blender",
    idleMs: 0,
    network: false,
    battery: { percent: 4, charging: false },
  };
  const types = w.observe(next, now).map((e) => e.type);
  for (const t of [
    "NEW_APPLICATION",
    "USER_RETURNED",
    "NETWORK_LOST",
    "LOW_BATTERY_CRITICAL",
  ])
    assert.ok(types.includes(t));
  assert.deepEqual(w.observe(next, now), []);
  assert.ok(
    w
      .observe({ ...next, network: true }, now)
      .some((e) => e.type === "NETWORK_RESTORED"),
  );
});
test("urgent events respect global minimum, topic cooldown and event deduplication", () => {
  const d = new SpeakDecisionEngine({}),
    now = Date.now();
  const event = companionEvent("HEAVY_RAIN_INCOMING", {}, 92, now);
  const input = {
    now,
    event,
    activity: { since: now, idleMs: 0 },
    awayMs: 600000,
    boredom: 0,
  };
  assert.equal(d.decide(input).should_speak, true);
  d.lastSpoke = now - 60000;
  assert.equal(d.decide(input).should_speak, false);
  d.lastSpoke = now - 120000;
  assert.equal(d.decide(input).should_speak, true);
  d.markEvent(event);
  assert.equal(d.decide(input).should_speak, false);
});
function companionFixture(chat) {
  const calls = [],
    messages = [],
    events = [];
  const runtime = {
    load: async () => calls.push("CPU load"),
    unload: async () => calls.push("CPU unload"),
    cancel() {},
    chat: async (...args) => {
      calls.push("CPU chat");
      return chat(...args);
    },
  };
  const c = new IdleCompanion({
    runtime,
    memory: {
      working: { list: () => [], add: (...m) => messages.push(m) },
      pins: { all: () => [] },
      habits: { observe() {} },
      entities: { get() {} },
    },
    browser: { close: async () => {} },
    embedding: { embed: async () => [[1, 0]] },
    config: { personality: "小日", perception: false },
    bus: { publish: (type, data) => events.push({ type, ...data }) },
    perception: {
      snapshot: () => ({
        process: "unknown",
        title: "",
        since: Date.now(),
        idleMs: 0,
      }),
    },
    weather: { refresh: async () => [] },
  });
  return { c, calls, messages, events };
}
test('truncated idle JSON stays quiet, keeps no fabricated memory and still unloads CPU model',async()=>{
 const {c,calls,messages,events}=companionFixture(async(_messages,options)=>{
  assert.equal(options.format.additionalProperties,false);
  return {message:{content:'{"text":"unfinished'}};
 });
 assert.equal(await c.speak('work_long',{process:'ZBrush',title:'drawing'}),null);
 assert.deepEqual(calls,['CPU load','CPU chat','CPU unload']);
 assert.equal(messages.length,0);assert.equal(events.some(e=>e.type==='pet_bubble'),false);
});
test("event speaks through CPU on demand, unloads before bubble and never loads Full", async () => {
  const { c, calls, events } = companionFixture(async () => ({
    message: {
      content: JSON.stringify({ text: "預報顯示可能有大雨，出門帶把傘吧。" }),
    },
  }));
  c.enqueue(companionEvent("HEAVY_RAIN_INCOMING", { forecast: true }, 92));
  assert.ok(await c.tick(600000));
  assert.deepEqual(calls, ["CPU load", "CPU chat", "CPU unload"]);
  assert.equal(events.filter((e) => e.type === "pet_bubble").length, 1);
  assert.equal(
    events.some((e) => e.type === "message"),
    false,
  );
  await c.tick(600001);
  assert.equal(calls.length, 3);
});
test("invalid Idle response still unloads CPU; cancellation cannot leak a stale bubble", async () => {
  const invalid = companionFixture(async () => ({
    message: { content: "invalid json" },
  }));
  assert.equal(await invalid.c.speak("idle"),null);
  assert.equal(invalid.calls.at(-1), "CPU unload");
  let c;
  const fixture = companionFixture(async () => {
    await c.cancel();
    return { message: { content: '{"text":"過期訊息"}' } };
  });
  c = fixture.c;
  assert.equal(await c.speak("idle"), null);
  assert.equal(
    fixture.events.some((e) => e.type === "pet_bubble"),
    false,
  );
  assert.equal(fixture.calls.at(-1), "CPU unload");
});
test("rejected autonomous phrases cannot retry CPU generation on every watcher tick", async () => {
  const { c, calls } = companionFixture(async () => ({
    message: { content: '{"text":"重複的話"}' },
  }));
  c.decision.accept = async () => false;
  c.boredom.value = 100;
  c.perception.snapshot = () => ({
    process: "ZBrush",
    title: "",
    since: Date.now() - 3600000,
    idleMs: 0,
  });
  await c.tick(3600000);
  await c.tick(3600000);
  assert.equal(calls.filter((c) => c === "CPU chat").length, 1);
});
test("SearXNG is opt-in, uses JSON, reads max three pages and closes ephemeral browser", async () => {
  await assert.rejects(
    () => new SearXNGProvider().search("test"),
    /DAILY_SEARXNG_URL/,
  );
  let visited = 0,
    closed = 0;
  const provider = new SearXNGProvider({
    endpoint: "http://127.0.0.1:8888",
    fetcher: async (url) => {
      assert.equal(url.searchParams.get("format"), "json");
      return {
        ok: true,
        json: async () => ({
          results: Array.from({ length: 8 }, (_, i) => ({
            url: `https://example${i}.com/${i}`,
            content: "test",
          })),
        }),
      };
    },
  });
  const browser = new LightSearchBrowser(provider, {
    open: async (url) => {
      visited++;
      return { url, body: "read page" };
    },
    close: async () => {
      closed++;
    },
  });
  assert.equal((await browser.search("test", { limit: 10 })).results.length, 3);
  assert.equal(visited, 3);
  assert.equal(closed, 1);
});
test("simple weather question remains Idle and never calls wake", async () => {
  const saved = [],
    events = [];
  const a = new AgentCore({
    bus: { publish: (t, d) => events.push({ t, ...d }) },
    companion: {
      boredom: { respond() {} },
      enqueue() {},
      weather: {
        refresh: async () => [],
        status: () => ({
          state: {
            city: "測試城市",
            temperature: 25,
            rain: 0,
            wind: 8,
            url: "https://open-meteo.com/",
          },
        }),
      },
    },
    memory: { working: { add: (...v) => saved.push(v) } },
  });
  a.states.state = "IDLE";
  a.wake = () => {
    throw Error("must not wake");
  };
  const answer = await a.chat("今天天氣？");
  assert.match(answer.content, /25°C/);
  assert.equal(a.states.state, "IDLE");
  assert.equal(saved.length, 2);
  assert.equal(events.at(-1).t, "pet_bubble");
});
