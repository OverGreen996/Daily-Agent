// Small models may confuse a fresh event with old dialogue. Give them a grounded
// sentence and reject rewrites that lose the event or invent forecast timing.
const facts = {
  LONG_WORK_SESSION: ['你在同一個程式忙一陣子了，要不要讓眼睛休息一下？',/休息|忙|工作/],
  LATE_NIGHT: ['時間有點晚了，忙完記得休息喔。',/晚|休息/],
  USER_RETURNED: ['你回來了，我還在這裡。',/回來|這裡/],
  USER_IDLE_LONG: ['我安靜陪著你，有需要再叫我。',/陪|安靜/],
  NEW_APPLICATION: ['換了個程式呀，需要幫忙再叫我。',/程式|幫忙/],
  RAIN_STARTED: ["預報顯示目前開始有降雨，出門記得帶傘。", /雨/],
  RAIN_STOPPED: ["預報顯示目前降雨已停止，路面可能還濕，走路小心。", /停|雨歇/],
  RAIN_INTENSIFIED: ["預報顯示雨勢增強了，出門多留意天氣。", /增強|變大|大雨/],
  HEAVY_RAIN_INCOMING: [
    "預報顯示未來幾小時可能有大雨，出門記得帶傘。",
    /大雨|強降雨/,
  ],
  THUNDERSTORM_INCOMING: ["預報顯示未來幾小時可能有雷雨，外出留意天氣。", /雷/],
  TEMPERATURE_DROP: [
    "預報顯示氣溫明顯下降了，記得適時添件衣服。",
    /降|變冷|轉涼/,
  ],
  TEMPERATURE_RISE: ["預報顯示氣溫明顯升高了，記得喝點水。", /升|熱/],
  STRONG_WIND: ["預報顯示目前風勢較強，外出留意安全。", /風/],
  HIGH_TEMPERATURE: ["預報顯示目前氣溫偏高，記得補充水分。", /高溫|熱|氣溫/],
  HIGH_UV: ["預報顯示紫外線偏強，外出記得防曬。", /紫外線|防曬/],
  WEATHER_WARNING: ["有新的天氣警示，請查看警示來源的詳細資訊。", /警示|警報/],
  LOW_BATTERY: ["電池電量偏低了，方便的話接上電源吧。", /電/],
  LOW_BATTERY_CRITICAL: ["電池電量已非常低，先接上電源並儲存工作吧。", /電/],
  NETWORK_LOST: ["網路連線似乎中斷了，我的本機功能還在。", /網路|連線/],
  NETWORK_RESTORED: ["網路連線恢復了，需要查資料時再叫我。", /網路|連線/],
};
export function eventFact(event) {
  if(event?.type==='SCREEN_ACTIVITY')return null;
  if(['CALENDAR_EVENT','NEW_NOTIFICATION'].includes(event?.type))return event.data.text;
  return facts[event?.type]?.[0] || null;
}
export function groundEventText(text, event) {
  if(event?.type==='SCREEN_ACTIVITY')return ''; // ScreenConversation validates structured candidates instead.
  if(['CALENDAR_EVENT','NEW_NOTIFICATION'].includes(event?.type))return event.data.text;
  const fact = facts[event?.type];
  if (!fact) return text;
  const weather = event?.data.forecast;
  const invalid =
    !fact[1].test(text) ||
    /\d/.test(text) ||
    (!weather && /預報|降雨|晴天|警報|分鐘|小時/.test(text)) ||
    text.length > 65 || /問句|本事件|似乎是因為|根據.*(?:資料|事件)/.test(text) ||
    (weather &&
      (!text.includes("預報") ||
        /無.*降雨|不會.*雨|晴天|雨.*(分鐘|小時).*停|警報|警示/.test(text)));
  return invalid ? fact[0] : text;
}
