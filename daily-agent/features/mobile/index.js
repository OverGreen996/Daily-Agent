import path from "node:path";
import fs from 'node:fs';
import { runtimePath } from "../../core/RuntimePaths.cjs";
import { DeviceRegistry } from "../../remote/DeviceRegistry.js";
import { SharedFiles } from "../../remote/SharedFiles.js";
import { NotificationHub } from "../../remote/NotificationHub.js";
import { AppearanceTransfer } from "../../remote/AppearanceTransfer.js";
import { RemoteGateway } from "../../remote/RemoteGateway.js";
import { CloudflareTunnel } from "../../remote/CloudflareTunnel.js";
import { PhoneBridge } from "../../environment/PhoneBridge.js";
export function create({ config, root, host, fallbackEnvironment }) {
  const { location, weather } = host.get("environment") || fallbackEnvironment;
  const remote = {
    devices: new DeviceRegistry(config.dataDir),
    files: new SharedFiles(config.dataDir),
    notifications: new NotificationHub(),
    appearance: new AppearanceTransfer(config.dataDir),
  };
  const phone = new PhoneBridge(location, {
    onLocation: () => {
      weather.state = null;
      weather.nextRefresh = 0;
      weather.engine.reset();
    },
  });
  return {
    remote,
    phone,
    attach(agent) {
      agent.remote = remote;
      agent.companion.phone = phone;
      remote.gateway = new RemoteGateway(agent, {
        port: Number(process.env.DAILY_REMOTE_PORT || 3221),
        apkDownload:JSON.parse(fs.readFileSync(path.join(root,'deploy/android-download.json'),'utf8').replace(/^\uFEFF/,'')),
      });
      remote.tunnel = new CloudflareTunnel(remote.gateway, {
        binary: runtimePath("cloudflared", "cloudflared.exe"),
      });
      agent.broker.remoteFiles = remote.files;
      agent.broker.remoteAuthorized = (id) =>
        remote.devices.list().some((d) => d.id === id);
    },
    routes: [
      {
        method: "POST",
        path: "/appearance",
        handle: (data) => ({
          ...remote.appearance.publish(data),
          devices: remote.devices.list().length,
        }),
      },
    ],
    async dispose() {
      remote.tunnel?.stop();
      await remote.gateway?.stop();
      await phone.close();
    },
  };
}
