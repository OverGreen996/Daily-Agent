const fs = require('node:fs');
const path = require('node:path');

function getRuntimeDirectory(projectRoot) {
  const root = path.resolve(projectRoot);
  const releases = path.dirname(root);
  if (path.basename(releases).toLowerCase() === 'releases') {
    const install = path.dirname(releases);
    const record = JSON.parse(fs.readFileSync(path.join(install, '.daily-install.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (record.kind !== 'DailyAgentInstallation' || typeof record.root !== 'string' || path.resolve(record.root).toLowerCase() !== install.toLowerCase()) {
      throw Error('Invalid Daily Agent installation marker');
    }
    return path.join(install, 'runtime');
  }
  return path.join(root, '.daily-runtime');
}

function runtimePath(...parts) {
  return path.join(getRuntimeDirectory(path.resolve(__dirname, '../..')), ...parts);
}

exports.getRuntimeDirectory = getRuntimeDirectory;
exports.runtimePath = runtimePath;
