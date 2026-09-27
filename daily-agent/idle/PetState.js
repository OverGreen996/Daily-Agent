const mapping = {
  RAIN_STARTED: ["curious", "rain"],
  RAIN_STOPPED: ["happy", "rest"],
  RAIN_INTENSIFIED: ["concerned", "rain"],
  HEAVY_RAIN_INCOMING: ["concerned", "weather_alert"],
  THUNDERSTORM_INCOMING: ["concerned", "weather_alert"],
  WEATHER_WARNING: ["concerned", "weather_alert"],
  LOW_BATTERY_CRITICAL: ["concerned", "alert"],
  SEARCHING: ["curious", "reading"],
  LIGHT_WEB_LOOKUP: ["curious", "reading"],
  LONG_WORK_SESSION: ["gentle", "watching"],
  work_long: ["gentle", "watching"],
  LATE_NIGHT: ["sleepy", "rest"],
  late_night: ["sleepy", "rest"],
  NEW_APPLICATION: ["curious", "watching"],
};
export function petState(tag) {
  const [emotion, activity] = mapping[tag] || ["gentle", "rest"];
  return { emotion, activity };
}
export function validPetReply(reply, tag) {
  const fallback = petState(tag);
  return {
    text: String(reply.text || "").trim(),
    emotion: ["curious", "happy", "concerned", "gentle", "sleepy"].includes(
      reply.emotion,
    )
      ? reply.emotion
      : fallback.emotion,
    activity: [
      "rain",
      "rest",
      "weather_alert",
      "alert",
      "reading",
      "watching",
    ].includes(reply.activity)
      ? reply.activity
      : fallback.activity,
  };
}
