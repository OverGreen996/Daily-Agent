import { parseDocumentCommand } from "../../core/DocumentCommands.js";
import { WeatherWatch } from "../../idle/WeatherWatch.js";
export async function personalChat(agent, text, image, document, request = {}) {
  return async function () {
    const docCommand = !image && !document && parseDocumentCommand(text);
    if (!image && !document && !docCommand && this.memory.personal) {
      const personal = await this.exclusive(async () => {
        if (
          request.deviceId &&
          !this.remote?.devices.list().some((d) => d.id === request.deviceId)
        )
          throw Error("裝置配對已解除。");
        let content;
        try {
          content = this.memory.personal.handle(text, {
            scope: request.deviceId || "pc",
            calendar: this.companion.calendar,
          });
        } catch (e) {
          content = "這次沒有保存或修改：" + e.message;
        }
        if (content === null) return null;
        if (/^(今天|出門)(的)?摘要[。！]?$/.test(text.trim())) {
          try {
            const weather = request.deviceId
              ? new WeatherWatch({
                  location: { current: async () => request.location || null },
                  config: { weatherEnabled: false, weatherRefreshMs: 900000 },
                  bus: { publish() {} },
                })
              : this.companion.weather;
            if (!weather) throw Error("尚未設定天氣");
            await weather.refresh(Date.now(), true);
            const result = weather.status();
            if (!result.state || result.error)
              throw Error(result.error || "尚未取得位置");
            const w = result.state;
            content +=
              "\n\n目前天氣：" +
              (w.city || "目前所在地區") +
              " " +
              w.temperature +
              "°C。" +
              (w.future?.some((f) => f.rain >= 0.1)
                ? "未來約三小時有雨，出門請帶傘。"
                : "請依實際天候準備衣物。") +
              "\n來源：" +
              w.url;
          } catch (e) {
            content += "\n\n天氣暫時無法確認；手機可先說「更新手機位置」。";
          }
        }
        this.states.touch();
        this.companion.boredom.respond();
        this.memory.working.add("user", text, "個人資料與行程");
        this.memory.working.add("assistant", content, "個人資料與行程");
        this.bus.publish(
          "pet_bubble",
          {
            text: content,
            target_device: request.deviceId,
            request_id: request.id,
            activity: "rest",
          },
          { transient: true },
        );
        return { content };
      });
      if (personal) return personal;
    }

    return null;
  }.call(agent);
}
