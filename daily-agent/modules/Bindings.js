import {fallbackCompanion} from './Fallbacks.js';

// One composition boundary owns the core's references to optional built-in modules.
export function moduleServices(host, fallbacks) {
  const environment = host.get('environment') || fallbacks.environment;
  const browser = host.get('search')?.browser || fallbacks.browser;
  const companion = host.get('companion')?.companion || fallbackCompanion(environment, browser);
  return {environment, browser, companion};
}

export function bindAgentModules(agent, host, fallbacks) {
  const {environment, browser, companion} = moduleServices(host, fallbacks);
  Object.assign(agent, {browser, companion, perception: environment.perception});
  Object.assign(companion, {location: environment.location, weather: environment.weather,
    perception: environment.perception, browser: host.get('search')?.idleBrowser || fallbacks.browser});
  if (companion.lookup) companion.lookup.browser = companion.browser;
  companion.calendar = host.get('assistant')?.calendar;
  companion.phone = host.get('mobile')?.phone;
  companion.lightPerception = host.get('environment')?.lightPerception;
  agent.memory.personal = host.get('assistant')?.personal || null;
  agent.documents = host.get('documents')?.documents;
  agent.imageRuntime = host.get('images')?.models?.IMAGE_GENERATOR?.runtime;
  agent.remote = host.get('mobile')?.remote;
  agent.broker.browser = browser;
  if (!agent.remote) {
    agent.broker.remoteFiles = undefined;
    agent.broker.remoteAuthorized = undefined;
  }
  if (!host.enabled('environment')) Object.assign(agent.config, {
    perception: false, lightPerception: false, screenVision: false, weatherEnabled: false,
  });
  if (!host.enabled('search')) agent.config.lightLookup = false;
}
