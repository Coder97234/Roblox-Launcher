import fs from 'node:fs';
import path from 'node:path';
import { directorySize, humanBytes, xenityPaths } from './store.js';
import { getSettings } from './settings.js';
import { info } from './logging.js';

/** Storage reporting and cleanup, strictly limited to Xenity-owned directories. */
export function storageReport() {
  const paths = xenityPaths();
  const settings = getSettings();
  const areas = [
    { id: 'applications', label: 'Applications', dir: paths.applications },
    { id: 'runtime', label: 'Runtime', dir: paths.runtime },
    { id: 'cache', label: 'Cache', dir: paths.cache },
    { id: 'shaders', label: 'Shader cache', dir: paths.shaders },
    { id: 'logs', label: 'Logs', dir: paths.logs },
    { id: 'config', label: 'Configuration', dir: paths.config },
  ].map((area) => {
    const bytes = directorySize(area.dir);
    return { ...area, bytes, human: humanBytes(bytes) };
  });

  const total = areas.reduce((sum, area) => sum + area.bytes, 0);
  return {
    root: paths.root,
    areas,
    total,
    totalHuman: humanBytes(total),
    configuration: {
      installationDirectory: settings.storage.installationDirectory,
      cacheDirectory: settings.storage.cacheDirectory,
    },
  };
}

/** Empties Xenity's own cache directory. Nothing outside it is touched. */
export function clearCache() {
  const cacheDir = xenityPaths().cache;
  let removed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    const target = path.join(cacheDir, entry.name);
    // Guard: resolve and confirm the target really sits inside the cache dir.
    if (path.dirname(path.resolve(target)) !== path.resolve(cacheDir)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    removed += 1;
  }
  info('storage', 'Cache cleared', { removed, directory: cacheDir });
  return {
    removed,
    directory: cacheDir,
    bytesFreed: 0,
    message: removed
      ? `Removed ${removed} cache entr${removed === 1 ? 'y' : 'ies'} from ${cacheDir}.`
      : 'The cache directory was already empty.',
  };
}
