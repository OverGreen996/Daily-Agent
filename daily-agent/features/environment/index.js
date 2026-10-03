import { LocationProvider } from "../../environment/LocationProvider.js";
import { WeatherWatch } from "../../idle/WeatherWatch.js";
import { PerceptionEngine } from "../../idle/PerceptionEngine.js";
import { LightPerception } from "../../idle/LightPerception.js";
import { ScreenVision } from "../../idle/ScreenVision.js";
import { FullModelRuntime } from "../../models/OllamaRuntime.js";
import { ModelRole } from "../../models/ModelLifecycleManager.js";
export function create({ config, bus }) {
  const location = new LocationProvider(),
    weather = new WeatherWatch({ location, config, bus }),
    perception = new PerceptionEngine(bus);
  const lightPerception = new LightPerception();
  const visionRuntime = new FullModelRuntime(
    config.modelUrl,
    config.fullModel,
    { context: 4096 },
  );
  return {
    location,
    weather,
    perception,
    lightPerception,
    models: { [ModelRole.VISION_MODEL]: { runtime: visionRuntime, gpu: true } },
    attach(agent) {
      lightPerception.vision = new ScreenVision({
        runtime: visionRuntime,
        lifecycle: agent.lifecycle,
        bus,
      });
      agent.companion.lightPerception = lightPerception;
    },
    routes: [
      {
        method: "GET",
        path: "/",
        handle: () => ({
          weather: weather.status(),
          location: location.status(),
        }),
      },
    ],
    dispose() {
      lightPerception.vision?.cancel();
      perception.close();
    },
  };
}
