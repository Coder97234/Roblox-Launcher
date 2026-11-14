import { detectSystem } from './system_detection.js';
import { STUDIO_NAME, WINE_INSTALL_HINT, getStudioStatus } from './studio.js';

/**
 * Runtime manager.
 *
 * There is one runtime in this build: the real Roblox Studio for Windows,
 * running inside a Wine prefix Xenity owns. Xenity installs it, detects the
 * Studio build the installer left behind and launches that executable.
 *
 * The state names say what is actually missing:
 *   wine-missing      Wine itself is not installed on this machine.
 *   studio-missing    Wine is there, but no Roblox Studio build in the prefix.
 *   ready             A Studio build exists and will start.
 */

function stateOf(studio) {
  if (!studio.wine.present) return 'wine-missing';
  if (!studio.studio.installed) return 'studio-missing';
  return 'ready';
}

function explain(studio, state) {
  if (state === 'wine-missing') {
    return {
      reason: 'Wine is the compatibility layer that runs the Windows Roblox Studio build, and it is not installed.',
      next: `Install it on Arch with: ${WINE_INSTALL_HINT} — then recheck this page.`,
    };
  }
  if (state === 'studio-missing') {
    return {
      reason: `Wine is ready (${studio.wine.version ?? 'version unknown'}), but no Roblox Studio build exists in ${studio.prefix.path} yet.`,
      next: 'Press Install Studio. Xenity downloads Roblox’s own Studio installer and runs it under Wine; the installer window is Roblox’s.',
    };
  }
  return {
    reason: `Roblox Studio ${studio.studio.version} is installed in ${studio.prefix.path}.`,
    next: 'Press Open Studio. Xenity starts the Studio executable inside the prefix, and the window is Studio’s own.',
  };
}

function backendDetail(studio, state) {
  if (state === 'wine-missing') return studio.wine.detail;
  if (state === 'studio-missing') return `${studio.wine.detail} · no Studio build in the prefix`;
  return `${studio.studio.exe} · ${studio.wine.version ?? 'Wine'}`;
}

export function getRuntimeStatus() {
  const studio = getStudioStatus();
  const system = detectSystem();
  const state = stateOf(studio);
  const available = state === 'ready';
  const { reason, next } = explain(studio, state);

  return {
    implemented: true,
    available,
    present: studio.studio.installed,
    winePresent: studio.wine.present,
    state,
    backend: 'wine',
    backendName: STUDIO_NAME,
    backends: [
      {
        id: 'wine',
        name: STUDIO_NAME,
        description:
          'Roblox’s official Windows Studio build, run by Wine inside a prefix Xenity owns. No patching, no repackaging.',
        present: studio.wine.present,
        running: studio.instances > 0,
        detail: backendDetail(studio, state),
        selectable: available,
      },
    ],
    studio,
    reason,
    next,
    graphics: system.graphics.backend,
    checkedAt: new Date().toISOString(),
  };
}
