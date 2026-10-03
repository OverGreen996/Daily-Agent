import { IdleCompanion } from "../../idle/IdleCompanion.js";
import { NotificationWatch } from "../../idle/NotificationWatch.js";
export function create({
  config,
  memory,
  embedding,
  bus,
  idleRuntime,
  host,
  fallbackEnvironment,
  fallbackBrowser,
}) {
  const environment = host.get("environment") || fallbackEnvironment;
  const browser = host.get("search")?.idleBrowser || fallbackBrowser;
  const companion = new IdleCompanion({
    runtime: idleRuntime,
    memory,
    browser,
    embedding,
    config,
    bus,
    perception: environment.perception,
    weather: environment.weather,
    location: environment.location,
  });
  companion.notifications = new NotificationWatch();
  return {
    companion,
    attach(agent) {
      companion.lifecycle = agent.lifecycle;
    },
    dispose: () => companion.cancel(),
  };
}
