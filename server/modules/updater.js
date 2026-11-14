import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { xenityPaths, readJson, writeJson } from './store.js';
import { getSettings } from './settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(here, '../../package.json'), 'utf8'),
);

const MANIFEST_URL = process.env.XENITY_UPDATE_MANIFEST_URL || '';

function historyFile() {
  return path.join(xenityPaths().config, 'updates.json');
}

export function updateHistory() {
  return readJson(historyFile(), []);
}

/** No update server is configured in this build, so the answer is honest. */
export async function checkForUpdates() {
  const channel = getSettings().updates.channel;
  const current = packageJson.version;
  let result;

  if (!MANIFEST_URL) {
    result = {
      status: 'unconfigured',
      currentVersion: current,
      channel,
      latestVersion: null,
      message:
        'No Xenity update channel is configured for this build, so no update could be located.',
      next: 'Set XENITY_UPDATE_MANIFEST_URL to an update manifest you control, then check again.',
      checkedAt: new Date().toISOString(),
    };
  } else {
    try {
      const response = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`manifest responded ${response.status}`);
      const manifest = await response.json();
      const latest = String(manifest.version || current);
      result = {
        status: latest === current ? 'up-to-date' : 'update-available',
        currentVersion: current,
        channel,
        latestVersion: latest,
        message:
          latest === current
            ? `Xenity ${current} is the newest build on the ${channel} channel.`
            : `Xenity ${latest} is available on the ${channel} channel.`,
        next: latest === current ? 'Nothing to do.' : 'Automatic updates are not implemented yet.',
        checkedAt: new Date().toISOString(),
      };
    } catch (cause) {
      result = {
        status: 'failed',
        currentVersion: current,
        channel,
        latestVersion: null,
        message: `The update manifest could not be reached: ${String(cause.message || cause)}.`,
        next: 'Check the network connection, or verify XENITY_UPDATE_MANIFEST_URL points at a reachable manifest.',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  const history = [{ ...result }, ...updateHistory()].slice(0, 20);
  writeJson(historyFile(), history);
  return { ...result, history };
}

export function versionInfo() {
  return {
    version: packageJson.version,
    name: packageJson.name,
    channel: getSettings().updates.channel,
    history: updateHistory(),
  };
}
