export const CompanionEvent = Object.freeze(
  Object.fromEntries(
    [
      "WEATHER_CHANGE",
      "RAIN_STARTED",
      "RAIN_STOPPED",
      "RAIN_INTENSIFIED",
      "HEAVY_RAIN_INCOMING",
      "THUNDERSTORM_INCOMING",
      "TEMPERATURE_DROP",
      "TEMPERATURE_RISE",
      "STRONG_WIND",
      "HIGH_TEMPERATURE",
      "HIGH_UV",
      "WEATHER_WARNING",
      "LONG_WORK_SESSION",
      "LATE_NIGHT",
      "NEW_APPLICATION",
      "USER_RETURNED",
      "USER_IDLE_LONG",
      "NETWORK_LOST",
      "NETWORK_RESTORED",
      "LOW_BATTERY",
      "LOW_BATTERY_CRITICAL",
      "NEW_NOTIFICATION",
      "CALENDAR_EVENT",
      "LIGHT_WEB_LOOKUP",
      "SEARCHING",
      "SCREEN_ACTIVITY",
    ].map((x) => [x, x]),
  ),
);
export function companionEvent(
  type,
  data = {},
  priority = 55,
  now = Date.now(),
) {
  if (!CompanionEvent[type]) throw Error("Unknown companion event");
  return {
    type,
    data,
    priority,
    created_at: now,
    expires_at: now + 1800000,
    key: type + ":" + (data.id || ""),
  };
}
