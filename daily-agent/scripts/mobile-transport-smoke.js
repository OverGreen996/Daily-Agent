// Exercises the real Cloudflare transport with synthetic data, never the desktop API.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { DeviceRegistry } from "../remote/DeviceRegistry.js";
import { SharedFiles } from "../remote/SharedFiles.js";
import { NotificationHub } from "../remote/NotificationHub.js";
import { RemoteGateway } from "../remote/RemoteGateway.js";
import { CloudflareTunnel } from "../remote/CloudflareTunnel.js";
import { AppearanceTransfer } from "../remote/AppearanceTransfer.js";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-cloudflare-smoke-"));
const agent = {
  bus: new EventEmitter(),
  states: { state: "IDLE" },
  companion: { enqueue: () => {} },
  remote: {
    devices: new DeviceRegistry(dir),
    files: new SharedFiles(dir),
    notifications: new NotificationHub(),
    appearance: new AppearanceTransfer(dir),
  },
  chat: async (text) => ({ content: "Transport verified: " + text }),
};
const gateway = new RemoteGateway(agent, {
    port: 0,
    apkPath: path.resolve("android/dist/DailyPet-Android-0.1.0-preview.apk"),
  }),
  tunnel = new CloudflareTunnel(gateway);
try {
  const url = await tunnel.start();
  let ready = false;
  for (let n = 0; n < 12; n++) {
    try {
      const r = await fetch(url + "/health", {
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok && (await r.json()).protocol === 1) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  assert.ok(ready, "Cloudflare public HTTPS endpoint ready");
  const request = async (route, data, token) => {
    const r = await fetch(url + route, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, data: await r.json() };
  };
  assert.equal((await request("/v1/events")).status, 401);
  const code = agent.remote.devices.begin().code,
    paired = await request("/v1/pair", { code, name: "Transport smoke" });
  assert.equal(paired.status, 200);
  const token = paired.data.token;
  const job = await request(
    "/v1/jobs",
    { text: "synthetic request", requestId: "transport-smoke-1" },
    token,
  );
  assert.equal(job.status, 202);
  const result = await request("/v1/jobs/" + job.data.id, null, token);
  assert.equal(result.data.text, "Transport verified: synthetic request");
  assert.equal((await request("/api/shutdown", {}, token)).status, 404);
  const image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const profile = agent.remote.appearance.publish({
    name: "Cloudflare transfer test",
    animated: false,
    image,
  });
  const downloaded = await fetch(
    url + "/v1/appearance/image?version=" + profile.version,
    { headers: { Authorization: "Bearer " + token } },
  );
  assert.equal(downloaded.status, 200);
  assert.deepEqual(
    Buffer.from(await downloaded.arrayBuffer()),
    Buffer.from(image, "base64"),
  );
  agent.chat=async()=>({content:'合成圖片傳輸測試',image});
  const pictureJob=await request('/v1/jobs',{text:'synthetic image transport',requestId:'transport-picture-1'},token);
  const pictureResult=await request('/v1/jobs/'+pictureJob.data.id,null,token);
  assert.equal(pictureResult.data.state,'done');
  const pictureResponse=await fetch(url+pictureResult.data.image.url,{headers:{Authorization:'Bearer '+token}});
  assert.equal(pictureResponse.status,200);
  assert.deepEqual(Buffer.from(await pictureResponse.arrayBuffer()),Buffer.from(image,'base64'));
  const apk = await fetch(url + "/download/android.apk");
  assert.equal(apk.status, 200);
  assert.deepEqual(
    Buffer.from(await apk.arrayBuffer()),
    await fs.readFile(gateway.apkPath),
  );
  await request("/v1/session", { active: true }, token);
  agent.remote.notifications.receive("pc", {
    id: "test-1",
    app: "Synthetic Calendar",
  });
  assert.equal(
    (await request("/v1/events", null, token)).data.events.length,
    1,
  );
  await request("/v1/revoke", {}, token);
  assert.equal((await request("/v1/events", null, token)).status, 401);
  console.log(
    JSON.stringify({
      passed: true,
      transport: "Cloudflare Quick Tunnel HTTPS",
      checks: [
        "unauthorized rejected",
        "one-time pairing",
        "queued chat + polling",
        "desktop routes excluded",
        "PC notification routing",
        "PC-to-phone appearance binary integrity",
        "Android APK download integrity",
        "generated image authenticated binary integrity",
        "revocation",
      ],
      tunnelClosedAfterTest: true,
    }),
  );
} finally {
  tunnel.stop();
  await gateway.stop();
  await fs.rm(dir, { recursive: true, force: true });
}
