export async function mobileControl(agent, command) {
  let content;
  if (command.action === "phone_location_pair") {
    const p = await agent.companion.phone.start();
    content = `舊版位置分享頁（僅同一網路）：\n${p.urls.join("\n")}\n配對碼：${p.code}（五分鐘有效）。這個頁面只分享位置，沒有 App 聊天功能。`;
    agent.bus.publish(
      "pet_bubble",
      { text: content, activity: "rest" },
      { transient: true },
    );
    return { content };
  }
  if (command.action === "phone_pair") {
    await agent.remote.gateway.start();
    const p = agent.remote.devices.begin();
    const url = agent.remote.tunnel.status().url;
    content = `App 配對碼：${p.code}（五分鐘、一次有效）。\n${url ? "連線網址：" + url : "手機入口已在電腦啟動。說「開啟 Cloudflare 連線」取得測試網址。"}\n此配對入口供原生手機 App 使用，並非網頁聊天介面。`;
    agent.bus.publish(
      "pet_bubble",
      { text: content, activity: "rest" },
      { transient: true },
    );
    return { content };
  }
  if (command.action === "remote_connect") {
    const url = await agent.remote.tunnel.start();
    content = `Cloudflare 測試連線：${url}\nAndroid App 下載：${url}/download/android.apk\n說「開啟手機配對」取得一次性配對碼。App 第一次開啟會顯示配對畫面。測試網址會在重新連線後變更。`;
  }
  if (command.action === "remote_close") {
    agent.remote.tunnel.stop();
    await agent.remote.gateway.stop();
    content = "手機連線已關閉；已配對裝置仍保留，之後可以重新連線。";
  }
  if (command.action === "remote_share")
    content =
      "手機可讀資料夾已加入：" + (await agent.remote.files.add(command.folder));
  if (command.action === "remote_unshare") {
    agent.remote.files.clear();
    content = "已停止所有資料夾共享。";
  }
  if (command.action === "remote_folders")
    content =
      "手機可讀資料夾：\n" +
      (agent.remote.files.roots.join("\n") || "尚未分享任何資料夾。");
  if (command.action === "phone_revoke") {
    agent.remote.tunnel.stop();
    await agent.remote.gateway.stop();
    for (const d of agent.remote.devices.list())
      agent.remote.notifications.disconnect(d.id);
    agent.remote.devices.revokeAll();
    agent.mobileImageSessions?.clear();
    await agent.companion.phone.close();
    content = "手機 App 與舊版位置配對已全部解除，連線已關閉。";
  }
  if (command.action === "phone_status") {
    const s = agent.remote.tunnel.status();
    content = `手機入口：${agent.remote.gateway.server ? "已啟動" : "已關閉"}\nCloudflare：${s.url || s.error || "未連線"}\n已配對：${
      agent.remote.devices
        .list()
        .map((d) => d.name)
        .join("、") || "無"
    }`;
  }
  if (command.action === "phone_device") {
    agent.companion.location.setActiveDevice(command.device);
    content = `改用${command.device === "pc" ? "電腦" : "手機"}位置；手機位置未更新時會直接告知，不會改用家中電腦。`;
  }
  if (command.action.startsWith("phone_")) {
    agent.companion.weather.nextRefresh = 0;
    agent.companion.weather.state = null;
    agent.companion.weather.engine.reset();
  }

  return content;
}
