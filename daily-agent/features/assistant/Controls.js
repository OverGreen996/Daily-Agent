export async function calendarControl(agent, command) {
  let content;
  const calendar = agent.companion.calendar;
  if (command.action === "calendar_import") {
    const count = await calendar.import(command.name, command.text);
    content = `已匯入 ${command.name}，未來 90 天共有 ${count} 筆行程。提醒${calendar.state.enabled ? "開啟" : "關閉"}；說「開啟行事曆提醒」可在行程前 15 分鐘提醒。`;
  }
  if (command.action === "calendar_list")
    content =
      "未來七天的行程：\n" +
      (calendar
        .upcoming()
        .map(
          (e) =>
            `${new Date(e.start).toLocaleString("zh-TW")} ${e.title}${e.allDay ? "（全天；僅列示）" : ""}`,
        )
        .join("\n") || "沒有行程。拖入 .ics 可匯入。");
  if (command.action === "calendar_toggle") {
    calendar.enable(command.value);
    content = `行事曆提醒已${command.value ? "開啟" : "關閉"}。`;
  }
  if (command.action === "calendar_clear") {
    calendar.clear();
    agent.companion.pending.delete("CALENDAR_EVENT");
    content = "已清除匯入的行事曆並關閉提醒。";
  }

  return content;
}
