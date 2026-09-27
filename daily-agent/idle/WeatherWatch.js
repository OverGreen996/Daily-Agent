import { companionEvent } from "../core/CompanionEvents.js";
export class OpenMeteoProvider {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
  }
  async read(location) {
    if (location.precision !== "CITY")
      throw Error("Weather only accepts CITY location");
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: location.latitude,
      longitude: location.longitude,
      current: "temperature_2m,rain,showers,weather_code,wind_speed_10m",
      hourly: "rain,showers,weather_code,uv_index",
      forecast_days: "2",
      timeformat: "unixtime",
      timezone: "auto",
    });
    const r = await this.fetcher(url, {
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    if (!r.ok) throw Error("Open-Meteo 暫時無法取得天氣");
    const d = await r.json(),
      c = d.current,
      h = d.hourly;
    if (
      !c ||
      !h ||
      !Number.isFinite(c.temperature_2m) ||
      !Number.isFinite(c.rain) ||
      !Number.isFinite(c.showers)
    )
      throw Error("Open-Meteo 資料不完整");
    const future = h.time
      .map((t, i) => ({
        time: t * 1000,
        rain: h.rain[i] + h.showers[i],
        code: h.weather_code[i],
        uv: h.uv_index[i],
      }))
      .filter(
        (x) => x.time >= c.time * 1000 && x.time <= c.time * 1000 + 3 * 3600000,
      );
    return {
      temperature: c.temperature_2m,
      rain: c.rain + c.showers,
      code: c.weather_code,
      wind: c.wind_speed_10m,
      uv: future[0]?.uv ?? null,
      future,
      time: c.time * 1000,
      city: location.city,
      location_source: location.source,
      source: "Open-Meteo forecast",
      url: "https://open-meteo.com/",
      fetched_at: Date.now(),
    };
  }
}
export class WeatherEventEngine {
  constructor() {
    this.previous = null;
    this.conditions = new Set();
    this.sequence = 0;
  }
  reset() {
    this.previous = null;
    this.conditions.clear();
  }
  compare(s, now = Date.now()) {
    const p = this.previous,
      events = [],
      active = new Set();
    const add = (type, priority = 60) =>
      events.push(
        companionEvent(
          type,
          {
            id: ++this.sequence,
            temperature: s.temperature,
            rain: s.rain,
            wind: s.wind,
            uv: s.uv,
            source: s.source,
            city: s.city,
            forecast: true,
          },
          priority,
          now,
        ),
      );
    if (p) {
      if (s.rain >= 0.1 && p.rain < 0.1) add("RAIN_STARTED");
      if (s.rain < 0.1 && p.rain >= 0.1) add("RAIN_STOPPED");
      if (s.rain >= 2 && s.rain >= p.rain * 2 && p.rain >= 0.1)
        add("RAIN_INTENSIFIED", 75);
      if (s.temperature - p.temperature <= -4) add("TEMPERATURE_DROP");
      if (s.temperature - p.temperature >= 4) add("TEMPERATURE_RISE");
    }
    const condition = (type, yes, priority) => {
      if (yes) {
        active.add(type);
        if (!this.conditions.has(type)) add(type, priority);
      }
    };
    condition(
      "HEAVY_RAIN_INCOMING",
      s.future.some((f) => f.rain >= 8),
      92,
    );
    condition(
      "THUNDERSTORM_INCOMING",
      s.future.some((f) => f.code >= 95),
      88,
    );
    condition("STRONG_WIND", s.wind >= 40, 78);
    condition("HIGH_TEMPERATURE", s.temperature >= 35, 72);
    condition("HIGH_UV", s.uv >= 8, 70);
    // WEATHER_WARNING is reserved for a future authoritative alert adapter;
    // numeric forecast thresholds never pretend to be official warnings.
    this.conditions = active;
    this.previous = s;
    return events;
  }
}
export class WeatherWatch {
  constructor({ location, provider = new OpenMeteoProvider(), config, bus }) {
    Object.assign(this, { location, provider, config, bus });
    this.engine = new WeatherEventEngine();
    this.nextRefresh = 0;
    this.state = null;
    this.error = null;
  }
  async refresh(now = Date.now(), force = false) {
    if (
      (!this.config.weatherEnabled && !force) ||
      (!force && now < this.nextRefresh)
    )
      return [];
    this.nextRefresh = now + this.config.weatherRefreshMs;
    try {
      const loc = await this.location.current("CITY");
      if (!loc) throw Error("尚未取得目前裝置的位置");
      const key = `${loc.source}:${loc.latitude}:${loc.longitude}`;
      if (key !== this.locationKey) {
        this.engine.reset();
        this.state = null;
        this.locationKey = key;
      }
      const state = await this.provider.read(loc);
      this.state = state;
      this.error = null;
      const events = this.engine.compare(state, now);
      this.bus.publish("weather_refresh", {
        available: true,
        events: events.map((e) => e.type),
      });
      return events;
    } catch (e) {
      this.error = e.message;
      this.bus.publish("weather_refresh", {
        available: false,
        message: e.message,
      });
      return [];
    }
  }
  status() {
    return {
      enabled: this.config.weatherEnabled,
      refreshMs: this.config.weatherRefreshMs,
      state: this.state,
      error: this.error,
      nextRefresh: this.nextRefresh,
    };
  }
}
