import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { config, root } from "./config.js";
import { createAgent } from "./core/createAgent.js";
import { tokens } from "./memory/MemoryPalace.js";
import {palaceView,palaceBook} from './memory/PalaceView.js';
const agent = createAgent(),
  secret = randomBytes(32).toString("hex");
agent.start();
const server = http.createServer(async (req, res) => {
  const send = (code, data) => {
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    const expected = `127.0.0.1:${config.port}`;
    if (req.headers.host !== expected)
      return send(403, { error: "Host rejected" });
    if (req.headers.origin && req.headers.origin !== `http://${expected}`)
      return send(403, { error: "Origin rejected" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return send(403, { error: "Cross-site rejected" });
    const url = new URL(req.url, `http://${expected}`);
    if (url.pathname.startsWith("/api/")) {
      const token = String(
        req.headers["x-daily-token"] || url.searchParams.get("token") || "",
      );
      if (
        token.length !== secret.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
      )
        return send(401, { error: "Token required" });
      if (closing) return send(503, { error: "正在保存記憶並停止服務，請稍候。" });
      if(url.pathname==='/api/pocketdrop'&&req.method==='GET')return send(200,agent.pocketdrop.status());
      if (url.pathname === "/api/status" && req.method === "GET")
        return send(200, await agent.status());
      if(url.pathname==='/api/palace' && req.method==='GET')return send(200,palaceView(agent.memory,url.searchParams.get('q')||'',url.searchParams.get('page')));
      if(url.pathname==='/api/palace/book' && req.method==='GET')return send(200,palaceBook(agent.memory,url.searchParams.get('id'),url.searchParams.get('offset')));
      if (url.pathname === "/api/history" && req.method === "GET")
        return send(200, agent.memory.working.list().slice(-100));
      if (url.pathname === "/api/books" && req.method === "GET")
        return send(200, agent.memory.books.all());
      if (url.pathname === "/api/book" && req.method === "GET")
        return send(200, agent.memory.books.get(url.searchParams.get("id")));
      if (url.pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        const listener = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
        agent.bus.on("event", listener);
        const heartbeat = setInterval(
          () => res.write(": heartbeat\n\n"),
          25000,
        );
        req.on("close", () => {
          clearInterval(heartbeat);
          agent.bus.off("event", listener);
        });
        return;
      }
      if (req.method !== "POST") return send(404, { error: "Not found" });
      let body = "";
      for await (const c of req) {
        body += c;
        if (body.length > 9_000_000)
          return send(413, { error: "Image/body too large" });
      }
      const data = JSON.parse(body || "{}");
      if(url.pathname==='/api/pocketdrop/pair')return send(200,await agent.pocketdrop.pair(data.invite));
      if(url.pathname==='/api/pocketdrop/check'){const state=await agent.pocketdrop.state();return send(200,{connected:true,room:state.room_name,files:state.files.length,revision:state.revision});}
      if(url.pathname==='/api/pocketdrop/disconnect')return send(200,{message:agent.pocketdrop.disconnect()});
      if(url.pathname==='/api/mobile/appearance')return send(200,{...agent.remote.appearance.publish(data),devices:agent.remote.devices.list().length});
      if(url.pathname==='/api/notification'){
        if(data.clear){agent.companion.pending.delete('NEW_NOTIFICATION');return send(200,{cleared:true});}
        const event=agent.companion.notifications.receive(data);
        if(event){
          const remoteEvent=agent.remote.notifications.receive('pc',data);
          if(remoteEvent?.destination==='pc')agent.companion.enqueue(event);
        }
        return send(200,{queued:!!event});
      }
      if (url.pathname === "/api/chat") {
        if (
          typeof data.text !== "string" ||
          !data.text.trim() ||
          data.text.length > 14000 ||
          tokens(data.text) > 7000
        )
          return send(400, {
            error: "訊息太長或為空，請拆成較短段落（單則上限約 7000 tokens）。",
          });
        if (
          data.image &&
          (!/^[A-Za-z0-9+/=]+$/.test(data.image) ||
            data.image.length > 8_000_000)
        )
          return send(400, { error: "圖片格式錯誤" });
        return send(200, await agent.chat(data.text, data.image, data.document));
      }
      if (url.pathname === "/api/idle") {
        await agent.exclusive(() => agent.enterIdle());
        return send(200, await agent.status());
      }
      if (url.pathname === "/api/weather")
        return send(200, await agent.weatherReply());
      // Local authenticated adapter for a future paired Android transport.
      // No LAN listener, pairing service or GPS persistence is introduced here.
      if (url.pathname === "/api/environment/location") {
        if (data.android) agent.companion.location.updateAndroid(data.android);
        if (data.activeDevice)
          agent.companion.location.setActiveDevice(data.activeDevice);
        agent.companion.weather.nextRefresh = 0;
        agent.companion.weather.state = null;
        agent.companion.weather.engine.reset();
        return send(200, agent.companion.location.status());
      }
      if (url.pathname === "/api/shutdown") {
        closing = true;
        try { await agent.stop(); }
        catch (error) { closing = false; throw error; }
        send(200, { stopped: true });
        setTimeout(() => { server.close(); process.exit(0); }, 100);
        return;
      }
      if (url.pathname === "/api/settings") {
        if (
          data.weatherRefreshMs !== undefined &&
          (!Number.isFinite(data.weatherRefreshMs) ||
            data.weatherRefreshMs < 600000 ||
            data.weatherRefreshMs > 1200000)
        )
          return send(400, { error: "天氣更新間隔須為 10–20 分鐘" });
        if (typeof data.perception === "boolean") {
          agent.config.perception = data.perception;
          data.perception ? agent.perception.start() : agent.perception.close();
        }
        if (typeof data.lightLookup === "boolean")
          agent.config.lightLookup = data.lightLookup;
        if(typeof data.lightPerception==='boolean')agent.config.lightPerception=data.lightPerception;
        if(typeof data.memoryCompanion==='boolean')agent.config.memoryCompanion=data.memoryCompanion;
        if(typeof data.screenVision==='boolean'){agent.config.screenVision=data.screenVision;if(data.screenVision)agent.config.lightPerception=true;}
        if(data.screenVision===false||data.lightPerception===false||data.perception===false){agent.companion.lightPerception?.vision?.cancel();agent.companion.pending.delete('SCREEN_ACTIVITY');}
        if (typeof data.weatherEnabled === "boolean") {
          agent.config.weatherEnabled = data.weatherEnabled;
          if (data.weatherEnabled) agent.companion.weather.nextRefresh = 0;
          else
            for (const [key, e] of agent.companion.pending)
              if (e.data.forecast) agent.companion.pending.delete(key);
        }
        if (data.weatherRefreshMs !== undefined) {
          agent.config.weatherRefreshMs = data.weatherRefreshMs;
          agent.companion.weather.nextRefresh = 0;
        }
        const settings = Object.fromEntries(
          [
            "perception",
            "lightLookup",
            "weatherEnabled",
            "weatherRefreshMs",
            "lightPerception",
            "memoryCompanion",
            "screenVision",
          ].map((k) => [k, agent.config[k]]),
        );
        const settingsPath = path.join(
          config.dataDir,
          "environment-settings.json",
        );
        // Synchronous tiny atomic write prevents concurrent settings requests from racing.
        fsSync.writeFileSync(settingsPath + ".tmp", JSON.stringify(settings));
        fsSync.renameSync(settingsPath + ".tmp", settingsPath);
        return send(200, {
          perception: agent.config.perception,
          lightLookup: agent.config.lightLookup,
          weatherEnabled: agent.config.weatherEnabled,
          weatherRefreshMs: agent.config.weatherRefreshMs,
        });
      }
      return send(404, { error: "Not found" });
    }
    if (url.pathname === '/lumi.webp') {
      const data=await fs.readFile(path.join(root,'desktop','assets','lumi','spritesheet.webp'));
      res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'public, max-age=3600'});res.end(data);return;
    }
    if(url.pathname==='/jsqr.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(await fs.readFile(path.join(root,'node_modules/jsqr/dist/jsQR.js')));return;}
    const files = {
      "/": "index.html",
      "/pocketdrop":"pocketdrop.html",
      "/pocketdrop.js":"pocketdrop.js",
      "/app.js": "app.js",
      "/style.css": "style.css",
      '/palace':'palace.html',
      '/palace.js':'palace.js',
      '/palace.css':'palace.css',
    };
    if (!files[url.pathname]) return send(404, { error: "Not found" });
    let content = await fs.readFile(
      path.join(root, "ui", files[url.pathname]),
      "utf8",
    );
    if (url.pathname === "/" || url.pathname==='/palace' || url.pathname==='/pocketdrop') content = content.replace("__TOKEN__", secret);
    res.writeHead(200, {
      "Content-Type": url.pathname.endsWith(".js")
        ? "text/javascript"
        : url.pathname.endsWith(".css")
          ? "text/css"
          : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    });
    res.end(content);
  } catch (e) {
    send(500, { error: e.message });
  }
});
server.listen(config.port, "127.0.0.1", () =>
  console.log(`Daily Agent http://127.0.0.1:${config.port}`),
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  try {
    await agent.stop();
  } catch (e) {
    console.error(e);
  }
  process.exit();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
