import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DeviceRegistry } from "../remote/DeviceRegistry.js";
import { SharedFiles } from "../remote/SharedFiles.js";
import { NotificationHub } from "../remote/NotificationHub.js";
import { RemoteGateway } from "../remote/RemoteGateway.js";
import { PermissionBroker, ToolBroker } from "../tools/ToolBroker.js";
import { parseConversationControl } from "../core/ConversationControls.js";
import { AppearanceTransfer } from "../remote/AppearanceTransfer.js";
import { AgentCore,mobileLocationContext } from "../core/AgentCore.js";
test('image mode commands and continuation state are isolated per device',async()=>{
  const agent=new AgentCore({bus:{publish(){}},memory:{working:{add(){}}},companion:{boredom:{respond(){}}}});
  await agent.chat('動漫模式');
  const pcSpec={prompt:'a blue cube'};agent.lastImageSpec=pcSpec;
  await agent.chat('真人模式',null,null,{deviceId:'phone-a'});
  const phone=agent.imageSessionFor({deviceId:'phone-a'});phone.lastImageSpec={prompt:'a red cube'};
  assert.equal(agent.imageProfile,'quality');assert.equal(phone.imageProfile,'photo');
  await agent.chat('結束生圖',null,null,{deviceId:'phone-a'});
  assert.equal(phone.imageMode,false);assert.equal(phone.lastImageSpec,null);
  assert.equal(agent.imageMode,true);assert.equal(agent.lastImageSpec,pcSpec);
  assert.equal(agent.imageSessionFor({deviceId:'phone-b'}).imageMode,false);
  await agent.chat('結束這張圖');assert.equal(agent.lastImageSpec,null);assert.equal(agent.imageMode,true);
});
test('automatic phone location is coarse, request-scoped and rejects stale retry coordinates',async t=>{
  let received;const f=await fixture(t,async(text,image,document,request)=>{received=request;return {content:'ok'};});
  const location={latitude:25.123456,longitude:121.56789,captured_at:Date.now()};
  assert.equal((await f.request('/v1/jobs',{text:'今天天氣',location})).status,202);
  await new Promise(r=>setImmediate(r));
  assert.equal(received.location.latitude,25.1);assert.equal(received.location.longitude,121.6);
  assert.equal((await f.request('/v1/jobs',{text:'天氣',location:{...location,captured_at:Date.now()-180000}})).status,400);
});
test('generated image download requires job owner and preserves bytes without embedding them in polling JSON',async t=>{
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const f=await fixture(t,async()=>({content:'完成',image}));
  const created=await f.request('/v1/jobs',{text:'畫一個藍色方塊'});
  await new Promise(r=>setImmediate(r));
  const result=await f.request('/v1/jobs/'+created.data.id);
  assert.equal(result.data.state,'done');assert.ok(result.data.image.url.endsWith('/image'));
  const url=`http://127.0.0.1:${f.gateway.port}${result.data.image.url}`;
  assert.equal((await fetch(url)).status,401);
  const other=f.agent.remote.devices.pair(f.agent.remote.devices.begin().code,'other');
  assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+other.token}})).status,404);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+f.paired.token}});
  assert.equal(response.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(image,'base64'));
  await f.request('/v1/revoke',{});
  assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+f.paired.token}})).status,401);
});
test('re-pairing after temporary URL change rotates token without filling device slots',async t=>{
  const dir=await temp(t),registry=new DeviceRegistry(dir);let paired=registry.pair(registry.begin().code,'phone');const id=paired.device.id;
  for(let n=0;n<7;n++){const previous=paired.token;paired=registry.pair(registry.begin().code,'phone',id);assert.equal(paired.device.id,id);assert.equal(registry.authenticate(previous),null);assert.equal(registry.list().length,1);}
});
const temp = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-remote-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
};
test("mobile appearance is explicit, atomic, bounded and authenticated", async (t) => {
  const f = await fixture(t),
    store = new AppearanceTransfer(f.dir);
  f.agent.remote.appearance = store;
  assert.equal(store.current().available, false);
  const image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const first = store.publish({ name: "測試寵物", animated: false, image });
  assert.equal(first.available, true);
  assert.equal(new AppearanceTransfer(f.dir).current().name, "測試寵物");
  assert.deepEqual(store.image(first.version), Buffer.from(image, "base64"));
  assert.throws(() => store.publish({ name: "bad", animated: true, image }));
  assert.equal(store.current().version, first.version);
  const second = store.publish({ name: "另一個名字", animated: false, image });
  assert.notEqual(first.version, second.version);
  assert.throws(() => store.image(first.version));
  assert.equal((await f.request("/v1/appearance")).data.name, "另一個名字");
  assert.equal((await f.request("/v1/appearance", undefined, "")).status, 401);
  const r = await fetch(
    `http://127.0.0.1:${f.gateway.port}/v1/appearance/image?version=${second.version}`,
    { headers: { Authorization: "Bearer " + f.paired.token } },
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.deepEqual(
    Buffer.from(await r.arrayBuffer()),
    Buffer.from(image, "base64"),
  );
  assert.equal(
    (
      await f.request("/api/mobile/appearance", {
        name: "blocked",
        image,
        animated: false,
      })
    ).status,
    404,
  );
});
test("phone location is city precision, device-specific, expires and disconnect clears it", async (t) => {
  const contexts = [],
    f = await fixture(t, async (text, image, document, request) => {
      contexts.push(request);
      return { content: "ok" };
    });
  assert.equal(
    (await f.request("/v1/location", { latitude: 91, longitude: 121 })).status,
    400,
  );
  assert.equal(
    (
      await f.request("/v1/location", {
        latitude: 25.123456,
        longitude: 121.54321,
      })
    ).status,
    200,
  );
  await f.request("/v1/jobs", { text: "今天天氣？" });
  await new Promise((r) => setImmediate(r));
  assert.equal(contexts[0].location.latitude, 25.1);
  assert.equal(contexts[0].location.longitude, 121.5);
  assert.equal(contexts[0].location.precision, "CITY");
  f.gateway.now = () => Date.now() + 300001;
  await f.request("/v1/jobs", { text: "再問天氣" });
  await new Promise((r) => setImmediate(r));
  assert.equal(contexts[1].location, null);
  await f.request("/v1/session", { connected: false });
  assert.equal(f.gateway.locations.size, 0);
  assert.equal(f.agent.remote.notifications.activeDevice(), "pc");
});
test("mobile weather without GPS never uses PC weather or wakes the full model", async () => {
  const agent = new AgentCore({
    config: { weatherEnabled: true },
    bus: { publish() {} },
    companion: {
      boredom: { respond() {} },
      weather: {
        status() {
          throw Error("must not use PC weather");
        },
      },
    },
    memory: { working: { add() {} } },
  });
  const result = await agent.weatherReply("今天天氣？", {
    deviceId: "phone",
    location: null,
  });
  assert.match(result.content, /尚未取得目前裝置的位置/);
});
test('all mobile location context is phone-only and coarse',async()=>{
  const context=mobileLocationContext({deviceId:'phone',location:{latitude:25.123456,longitude:121.54321,accuracy:18,source:'android_gps'}});
  assert.match(context,/25\.1/);assert.match(context,/121\.5/);assert.match(context,/CITY/);assert.doesNotMatch(context,/25\.123456|121\.54321|PC 所在地.*使用/);
  const missing=mobileLocationContext({deviceId:'phone',location:null});assert.match(missing,/更新手機位置/);assert.match(missing,/不得改用 PC 位置/);
  assert.equal(mobileLocationContext({location:{latitude:25,longitude:121}}),'');
  const calls=[];const broker=new ToolBroker({search:async query=>(calls.push(query),{results:[]})},{fileRoots:[],apps:{}},{publish(){}});broker.remoteAuthorized=()=>true;
  await broker.execute({tool:'web_search',args:{query:'附近咖啡店'}},{source:'user',deviceId:'phone',userText:'幫我找附近咖啡店',location:{latitude:25.123,longitude:121.543}});
  assert.match(calls[0],/25\.1/);assert.match(calls[0],/121\.5/);assert.doesNotMatch(calls[0],/25\.123|121\.543/);
  await assert.rejects(()=>broker.execute({tool:'web_search',args:{query:'附近咖啡店'}},{source:'user',deviceId:'phone',userText:'附近咖啡店',location:null}),/更新手機位置/);
});
async function fixture(t, chat) {
  const dir = await temp(t),
    bus = new EventEmitter();
  const agent = {
    bus,
    states: { state: "IDLE" },
    remote: {
      devices: new DeviceRegistry(dir),
      files: new SharedFiles(dir),
      notifications: new NotificationHub(),
    },
    companion: { enqueue: () => {} },
    chat:
      chat ||
      async function (text, image, document, request) {
        bus.emit("event", {
          type: "reply_delta",
          request_id: request.id,
          delta: "部分文字",
        });
        return { content: "手機回答：" + text, sources: [] };
      },
  };
  const gateway = new RemoteGateway(agent, { port: 0 });
  await gateway.start();
  t.after(() => gateway.stop());
  const pairing = agent.remote.devices.begin(),
    paired = agent.remote.devices.pair(pairing.code, "Test phone");
  const request = async (route, data, token = paired.token, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${gateway.port}${route}`, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: res.status, data: await res.json() };
  };
  return { agent, gateway, request, paired, dir };
}
test("pairing is single-use, expires, limits guesses, persists only token hash, supports revocation", async (t) => {
  const dir = await temp(t);
  let now = 100;
  const registry = new DeviceRegistry(dir, { now: () => now });
  let p = registry.begin();
  for (let i = 0; i < 5; i++) assert.throws(() => registry.pair("wrong", "x"));
  assert.throws(() => registry.pair(p.code, "x"));
  p = registry.begin();
  now += 300001;
  assert.throws(() => registry.pair(p.code, "x"));
  p = registry.begin();
  const result = registry.pair(p.code, "phone");
  assert.throws(() => registry.pair(p.code, "phone"));
  assert.ok(!JSON.stringify(registry.list()).includes("tokenHash"));
  assert.ok(!(await fs.readFile(registry.file, "utf8")).includes(result.token));
  const restored = new DeviceRegistry(dir);
  assert.equal(restored.authenticate(result.token).name, "phone");
  restored.revoke(result.device.id);
  assert.equal(restored.authenticate(result.token), null);
});
test("shared files start empty and forbid parent escape, secrets, private databases and symlink targets", async (t) => {
  const dir = await temp(t),
    share = path.join(dir, "shared"),
    outside = path.join(dir, "outside");
  await fs.mkdir(share);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(share, "report.txt"), "read me");
  await fs.writeFile(path.join(outside, "private.txt"), "private");
  await fs.writeFile(path.join(share, ".env"), "secret");
  await fs.writeFile(path.join(share, "memory.sqlite"), "db");
  const files = new SharedFiles(dir);
  await assert.rejects(files.read({ path: path.join(share, "report.txt") }));
  await files.add(share);
  await assert.rejects(files.add(path.parse(dir).root));
  assert.ok(
    JSON.stringify(
      await files.read({ path: path.join(share, "report.txt") }),
    ).includes("read me"),
  );
  await assert.rejects(
    files.allowed(path.join(share, "../outside/private.txt")),
  );
  await assert.rejects(files.allowed(path.join(share, ".env")));
  await assert.rejects(files.allowed(path.join(share, "memory.sqlite")));
  await fs.symlink(outside, path.join(share, "escape"), "junction");
  await assert.rejects(files.allowed(path.join(share, "escape/private.txt")));
  assert.deepEqual(await files.search({ query: "" }), [
    path.join(share, "report.txt"),
  ]);
  files.clear();
  await assert.rejects(files.search({ query: "" }));
});
test("notification source routing, same-device pet delivery, dedup and expiring active-device lease", () => {
  let now = 100;
  const hub = new NotificationHub({ now: () => now });
  hub.heartbeat("phone", true);
  const e = hub.receive("pc", { id: "1", app: "Calendar" });
  assert.equal(e.destination, "phone");
  assert.equal(hub.receive("pc", { id: "1", app: "Calendar" }), null);
  assert.equal(hub.read("phone", 0).events.length, 1);
  hub.receive("phone", { id: "android-1", app: "Messages" });
  assert.equal(hub.read("phone", 1).events.length, 1);
  assert.equal(hub.read("another-phone", 0).events.length, 0);
  now += 90001;
  assert.equal(hub.activeDevice(), "pc");
  hub.mode = "mirror";
  assert.equal(
    hub.receive("pc", { id: "2", app: "Calendar" }).destination,
    "phones",
  );
  assert.equal(
    hub.receive("phone", { id: "2", app: "Messages" }).destination,
    "pc",
  );
});
test("remote gateway excludes desktop routes, rejects browser origins and requires pairing", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/health", undefined, "")).status, 200);
  assert.equal((await f.request("/v1/events", undefined, "")).status, 401);
  assert.equal(
    (
      await f.request("/v1/events", undefined, f.paired.token, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal((await f.request("/api/shutdown", {})).status, 404);
  assert.equal((await f.request("/", undefined)).status, 404);
});
test("remote chat retries are idempotent and job output is device-private", async (t) => {
  let finish,
    calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    await new Promise((r) => (finish = r));
    return { content: "完成" };
  });
  const input = { text: "你好", requestId: "same-request-123" };
  const a = await f.request("/v1/jobs", input),
    b = await f.request("/v1/jobs", input);
  assert.equal(a.status, 202);
  assert.equal(b.status, 200);
  assert.equal(a.data.id, b.data.id);
  assert.equal(calls, 1);
  const p = f.agent.remote.devices.begin(),
    other = f.agent.remote.devices.pair(p.code, "other");
  assert.equal(
    (await f.request("/v1/jobs/" + a.data.id, undefined, other.token)).status,
    404,
  );
  finish();
  await new Promise((r) => setImmediate(r));
  assert.equal((await f.request("/v1/jobs/" + a.data.id)).data.text, "完成");
});
test("remote jobs reject administration and local document-library bypass", async (t) => {
  const f = await fixture(t);
  for (const text of [
    "開啟手機配對",
    "分享資料夾 C:\\Users",
    "查看文件庫",
    "比較文件 1、2：摘要",
  ])
    assert.equal((await f.request("/v1/jobs", { text })).status, 403);
  assert.equal(
    (await f.request("/v1/jobs", { text: "?", image: "$invalid" })).status,
    400,
  );
  assert.equal((await f.request("/v1/revoke", {})).status, 200);
  assert.equal((await f.request("/v1/events")).status, 401);
});
test("remote tools are restricted to read/search and show matching schemas", () => {
  const p = new PermissionBroker(),
    context = { source: "user", deviceId: "phone", userText: "讀取檔案" };
  assert.doesNotThrow(() => p.authorize("file_read", { path: "x" }, context));
  assert.throws(() => p.authorize("clipboard_read", {}, context));
  assert.throws(() => p.authorize("app_launch", { app: "notepad" }, context));
  const broker = new ToolBroker(null, { fileRoots: [] }, null);
  assert.deepEqual(
    broker.schemasFor(context).map((s) => s.function.name),
    ["web_search", "web_read", "file_search", "file_read"],
  );
});
test("mobile commands preserve spaces in folder paths and explicit connection/revocation", () => {
  assert.equal(
    parseConversationControl('分享資料夾 "C:\\My Files"').folder,
    "C:\\My Files",
  );
  assert.equal(
    parseConversationControl("開啟 Cloudflare 連線").action,
    "remote_connect",
  );
  assert.equal(parseConversationControl("關閉手機連線").action, "remote_close");
  assert.equal(
    parseConversationControl("開啟手機位置配對").action,
    "phone_location_pair",
  );
});
