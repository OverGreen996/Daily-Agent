import { WeatherWatch } from "../../idle/WeatherWatch.js";
class WeatherCommands {
  async weatherReply(question = "現在天氣？", request = {}) {
    this.states.touch();
    this.companion.boredom.respond();
    return this.exclusive(async () => {
      const weather = request.deviceId
        ? new WeatherWatch({
            location: { current: async () => request.location || null },
            config: { weatherEnabled: false, weatherRefreshMs: 900000 },
            bus: { publish() {} },
          })
        : this.companion.weather;
      const force =
        (request.deviceId || !this.config?.weatherEnabled) &&
        (!weather.state || Date.now() >= weather.nextRefresh);
      for (const e of await weather.refresh(Date.now(), force))
        if (!request.deviceId && this.config?.weatherEnabled)
          this.companion.enqueue(e);
      const { state: s, error } = weather.status();
      const outlook = s?.future?.length
        ? s.future.some((f) => f.rain >= 0.1)
          ? "未來約三小時預報有降雨，出門可以帶把傘。"
          : "未來約三小時預報暫無明顯降雨。"
        : "";
      const content =
        !s || error
          ? `目前無法確認天氣：${error || "尚未取得資料"}。`
          : `Open-Meteo 預報顯示，${s.city || "目前所在地區"}目前約 ${s.temperature}°C，${s.rain >= 0.1 ? "有降雨" : "暫無明顯降雨"}。${outlook}${s.location_source === "ip_geolocation" ? "位置來自 IP 粗估。" : ""}`;
      this.memory.working.add("user", question, "天氣");
      this.memory.working.add("assistant", content, "天氣", { idle: true });
      this.bus.publish("pet_bubble", {
        target_device: request.deviceId,
        text: content,
        emotion: "gentle",
        activity: s?.rain >= 0.1 ? "rain" : "rest",
        idle: this.states.state === "IDLE",
      });
      return {
        content,
        sources: s ? [{ title: "Open-Meteo", url: s.url }] : [],
      };
    });
  }
}
export const weatherReply = WeatherCommands.prototype.weatherReply;
