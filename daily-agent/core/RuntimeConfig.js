import fs from 'node:fs';
import path from 'node:path';

// Derived paths follow the selected Daily data directory, including isolated tests.
export function resolveRuntimeConfig(defaults, overrides = {}) {
  const config = {...defaults, ...overrides};
  config.dataDir = path.resolve(config.dataDir);
  if (Object.hasOwn(overrides, 'dataDir') && !Object.hasOwn(overrides, 'searchDataDir'))
    config.searchDataDir = path.join(config.dataDir, 'search');
  else config.searchDataDir = path.resolve(config.searchDataDir || path.join(config.dataDir, 'search'));
  return config;
}

// Optional settings must not prevent opening the app. Keep invalid originals intact.
export function readOptionalSettings(file, bus) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('settings_object_required');
    return value;
  } catch (error) {
    if (error.code !== 'ENOENT') bus.publish('warning', {
      code: 'SETTINGS_UNREADABLE', setting: path.basename(file),
      message: `${path.basename(file)} 無法讀取，本次使用預設值；原檔保留。`,
    });
    return {};
  }
}
