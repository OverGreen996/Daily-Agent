import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { tokens } from "../memory/MemoryPalace.js";
import { parseConversationControl } from "../core/ConversationControls.js";
import { companionEvent } from "../core/CompanionEvents.js";
import { parseDocumentCommand } from "../core/DocumentCommands.js";
import {androidUpdate} from './UpdateFeed.js';
export class RemoteGateway {
  constructor(agent, { port = 3221, now = Date.now, apkPath = null } = {}) {
    this.agent = agent;
    this.port = port;
    this.apkPath = apkPath;
    this.now = now;
    this.jobs = new Map();
    this.rate = new Map();
    this.locations = new Map();
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.server) return;
    this.starting = this.listen();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }
  async listen() {
    const server = http.createServer((req, res) => this.handle(req, res));
    server.requestTimeout = 30000;
    server.headersTimeout = 10000;
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.port, "127.0.0.1", resolve);
      });
      this.server = server;
      this.port = server.address().port;
    } catch (e) {
      server.close();
      throw e;
    }
  }
  async stop() {
    this.locations.clear();
    for (const device of this.agent.remote.devices.list())
      this.agent.remote.notifications.disconnect(device.id);
    const s = this.server;
    this.server = null;
    if (s) {
      s.closeAllConnections();
      await new Promise((r) => s.close(r));
    }
  }
  limited(id, limit = 120) {
    const minute = Math.floor(this.now() / 60000),
      r = this.rate.get(id);
    if (!r || r.minute !== minute) this.rate.set(id, { minute, count: 1 });
    else if (++r.count > limit) return true;
    if (this.rate.size > 100) this.rate.delete(this.rate.keys().next().value);
    return false;
  }
  async handle(req, res) {
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    try {
      // Native clients only. Never publish the desktop HTML containing its local token.
      if (req.headers.origin || req.headers["sec-fetch-site"] === "cross-site")
        return send(403, { error: "僅供配對 App 使用。" });
      const url = new URL(req.url, "http://127.0.0.1"),
        remote = this.agent.remote;
      if (req.method === "GET" && url.pathname === "/health")
        return send(200, { service: "daily-agent-mobile", protocol: 1 });
      if(req.method==='GET' && url.pathname==='/v1/updates') {
        if(this.limited('updates',30))return send(429,{error:'請稍後重試'});
        try{return send(200,await androidUpdate(this.apkPath));}
        catch{return send(503,{error:'目前沒有通過完整性驗證的 APK 更新'});}
      }
      if (req.method === "GET" && url.pathname === "/download/android.apk") {
        if (this.limited("apk", 20))
          return send(429, { error: "請稍後重試下載。" });
        if (!this.apkPath)
          return send(404, { error: "此電腦尚未建置 Android App。" });
        try {
          const apk = await fs.readFile(this.apkPath);
          res.writeHead(200, {
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Disposition":
              'attachment; filename="DailyPet-Android.apk"',
            "Content-Length": apk.length,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(apk);
          return;
        } catch {
          return send(404, { error: "此電腦尚未建置 Android App。" });
        }
      }
      const pairing = req.method === "POST" && url.pathname === "/v1/pair";
      const device = pairing
        ? null
        : remote.devices.authenticate(
            req.headers.authorization?.replace(/^Bearer /, ""),
          );
      if (!pairing && !device)
        return send(401, { error: "裝置未配對或已解除。" });
      if (req.method === "GET" && url.pathname === "/v1/appearance")
        return send(200, remote.appearance?.current() || { available: false });
      if (req.method === "GET" && url.pathname === "/v1/appearance/image") {
        try {
          const bytes = remote.appearance.image(
            url.searchParams.get("version"),
          );
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": bytes.length,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(bytes);
          return;
        } catch {
          return send(409, { error: "外觀已更新或尚未傳送，請重新取得版本。" });
        }
      }
      if (this.limited(device?.id || "pair", device ? 120 : 15))
        return send(429, { error: "請稍後再試。" });
      let body = "";
      if (req.method === "POST") {
        if (!String(req.headers["content-type"]).startsWith("application/json"))
          return send(415, { error: "需要 JSON。" });
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 7500000)
            return send(413, { error: "圖片或訊息過大。" });
        }
      }
      const data = body ? JSON.parse(body) : {};
      if (pairing)
        return send(
          200,
          remote.devices.pair(data.code, data.name, data.replaceDeviceId),
        );
      if (req.method === "POST" && url.pathname === "/v1/session") {
        if (data.connected === false) {
          remote.notifications.disconnect(device.id);
          this.locations.delete(device.id);
          return send(200, { disconnected: true });
        }
        remote.notifications.heartbeat(device.id, data.active === true);
        return send(200, {
          state: this.agent.states.state,
          device: device.name,
          activeDevice: remote.notifications.activeDevice(),
        });
      }
      if (req.method === "POST" && url.pathname === "/v1/revoke") {
        this.locations.delete(device.id);
        remote.devices.revoke(device.id);
        this.agent.mobileImageSessions?.delete(device.id);
        remote.notifications.disconnect(device.id);
        return send(200, { revoked: true });
      }
      if (req.method === "POST" && url.pathname === "/v1/location") {
        if (
          !Number.isFinite(data.latitude) ||
          Math.abs(data.latitude) > 90 ||
          !Number.isFinite(data.longitude) ||
          Math.abs(data.longitude) > 180
        )
          return send(400, { error: "位置格式錯誤。" });
        this.locations.set(device.id, {
          latitude: +(Math.round(data.latitude * 10) / 10).toFixed(1),
          longitude: +(Math.round(data.longitude * 10) / 10).toFixed(1),
          accuracy: 15000,
          precision: "CITY",
          source: "android_gps",
          updated_at: this.now(),
        });
        return send(200, { updated: true, precision: "CITY" });
      }
      if (req.method === "GET" && url.pathname === "/v1/events")
        return send(
          200,
          remote.notifications.read(
            device.id,
            Math.max(0, Number(url.searchParams.get("after")) || 0),
          ),
        );
      if (req.method === "POST" && url.pathname === "/v1/notification") {
        const event = remote.notifications.receive(device.id, data);
        if (event?.destination === "pc")
          this.agent.companion.enqueue(
            companionEvent(
              "NEW_NOTIFICATION",
              { id: String(event.seq), text: event.text },
              55,
            ),
          );
        return send(200, { received: true });
      }
      if (req.method === "GET" && url.pathname === "/v1/files")
        return send(200, {
          files: await remote.files.search({
            query: (url.searchParams.get("q") || "").slice(0, 200),
          }),
        });
      if (req.method === "POST" && url.pathname === "/v1/jobs") {

        if (
          typeof data.text !== "string" ||
          !data.text.trim() ||
          data.text.length > 14000 ||
          tokens(data.text) > 7000
        )
          return send(400, { error: "請輸入較短的訊息。" });
        if (
          data.image &&
          (typeof data.image !== "string" ||
            data.image.length > 7000000 ||
            !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              data.image,
            ))
        )
          return send(400, { error: "圖片格式錯誤。" });
        const control = parseConversationControl(data.text);
        if (
          control &&
          ![
            "status",
            "memory",
            "search_status",
            "calendar_list",
            "pins_list",
            "pins_search",
          ].includes(control.action)
        )
          return send(403, { error: "這項管理操作請在電腦桌寵執行。" });
        if (parseDocumentCommand(data.text))
          return send(403, {
            error:
              "手機請先搜尋共享檔案，再附上檔案提問；電腦文件庫管理僅限本機。",
          });
        const key = String(data.requestId || randomUUID());
        if (!/^[a-zA-Z0-9-]{8,80}$/.test(key))
          return send(400, { error: "requestId 格式錯誤。" });
        const previous = [...this.jobs.values()].find(
          (j) => j.device === device.id && j.requestId === key,
        );
        if (previous)
          return send(200, { id: previous.id, state: previous.state });
        if(data.location){
          const {latitude,longitude}=data.location;
          if(!Number.isFinite(data.location.captured_at)||Math.abs(this.now()-data.location.captured_at)>120000)return send(400,{error:'手機位置已過期，請重新送出問題以更新位置。'});
          if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)return send(400,{error:"位置格式錯誤。"});
          this.locations.set(device.id,{latitude:Math.round(latitude*10)/10,longitude:Math.round(longitude*10)/10,accuracy:15000,precision:"CITY",source:"android_gps",updated_at:this.now()});
        }
        if (
          [...this.jobs.values()].some(
            (j) => j.device === device.id && j.state === "running",
          ) ||
          [...this.jobs.values()].filter((j) => j.state === "running").length >=
            2
        )
          return send(409, { error: "正在處理上一個問題，請稍候。" });
        for (const [id, j] of this.jobs)
          if (j.state !== "running" && this.now() - j.created > 600000)
            this.jobs.delete(id);
        if (this.jobs.size >= 40) {
          const done = [...this.jobs.values()].find(
            (j) => j.state !== "running",
          );
          if (done) this.jobs.delete(done.id);
        }
        const job = {
          id: randomUUID(),
          requestId: key,
          device: device.id,
          state: "running",
          text: "",
          created: this.now(),
        };
        this.jobs.set(job.id, job);
        remote.notifications.heartbeat(device.id, true);
        send(202, { id: job.id, state: job.state });
        void this.run(job, data);
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/v1/jobs/")) {
        const parts=url.pathname.split('/');
        const job = this.jobs.get(parts[3]);
        if (!job || job.device !== device.id)
          return send(404, { error: "找不到任務。" });
        if(parts.length===5&&parts[4]==='image'){
          if(!job.image)return send(404,{error:'圖片已過期，請重新生成。'});
          res.writeHead(200,{'Content-Type':'image/png','Content-Length':job.image.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
          res.end(job.image);return;
        }
        if(parts.length!==4)return send(404,{error:'沒有此遠端功能。'});
        return send(200, {
          id: job.id,
          state: job.state,
          text: job.text,
          error: job.error,
          sources: job.sources,
          image: job.image ? {url:`/v1/jobs/${job.id}/image`,name:'DailyPet-'+job.id+'.png'} : null,
        });
      }
      send(404, { error: "沒有此遠端功能。" });
    } catch (e) {
      if (!res.headersSent) send(400, { error: e.message });
    }
  }
  async run(job, data) {
    const listener = (e) => {
      if (e.request_id !== job.id) return;
      if (e.type === "reply_start") job.text = "";
      if (e.type === "reply_delta")
        job.text = (job.text + e.delta).slice(0, 100000);
    };
    this.agent.bus.on("event", listener);
    try {
      if (!this.agent.remote.devices.list().some((d) => d.id === job.device))
        throw Error("裝置配對已解除。");
      let document;
      if (data.file) {
        const real = await this.agent.remote.files.allowed(data.file);
        if (!/\.(txt|md|pdf)$/i.test(real))
          throw Error("直接提問支援 TXT、Markdown、PDF。");
        if ((await fs.stat(real)).size > 5 * 1024 * 1024)
          throw Error("檔案超過 5 MB。");
        document = {
          name: path.basename(real),
          data: (await fs.readFile(real)).toString("base64"),
        };
      }
      const answer = await this.agent.chat(data.text, data.image, document, {
        deviceId: job.device,
        id: job.id,
        location:
          this.locations.has(job.device) &&
          this.now() - this.locations.get(job.device).updated_at < 300000
            ? this.locations.get(job.device)
            : null,
      });
      job.text = answer.content;
      if(answer.image){
        const image=Buffer.from(answer.image,'base64');
        if(image.length>16*1024*1024||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('生成圖片格式或大小不受支援。');
        job.image=image;
        let total=[...this.jobs.values()].reduce((n,j)=>n+(j.image?.length||0),0);
        for(const old of this.jobs.values()){if(total<=32*1024*1024)break;if(old!==job&&old.image){total-=old.image.length;delete old.image;}}
      }
      job.sources = answer.sources || [];
      job.state = "done";
    } catch (e) {
      job.state = "error";
      job.text = "";
      job.error = e.message;
    } finally {
      this.agent.bus.off("event", listener);
    }
  }
}
