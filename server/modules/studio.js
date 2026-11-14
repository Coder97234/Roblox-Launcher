import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { detectSystem, which } from './system_detection.js';
import { getSettings } from './settings.js';
import { ensureDir, exists, xenityPaths, directorySize } from './store.js';
import { info, warn } from './logging.js';

/**
 * Roblox Studio on Linux through Wine.
 *
 * Roblox publishes Studio for Windows only, so Xenity runs the real Windows
 * Studio inside a Wine prefix it owns:
 *
 *   <Xenity data>/runtime/wineprefix        a win64 prefix (WINEPREFIX)
 *   .../drive_c/users/*\/AppData/Local/Roblox/Versions/<version>/RobloxStudioBeta.exe
 *
 * Xenity downloads Roblox's own Studio installer from setup.rbxcdn.com, runs it
 * under Wine, then detects the Studio build the installer leaves behind and
 * launches that executable. Nothing is patched, repackaged or reverse
 * engineered — this is the official Windows build, run by Wine.
 */

export const STUDIO_NAME = 'Roblox Studio';
export const STUDIO_BINARY = 'RobloxStudioBeta.exe';
export const INSTALLER_URL = 'https://setup.rbxcdn.com/RobloxStudioInstaller.exe';
export const WINE_INSTALL_HINT = 'sudo pacman -S wine winetricks';
export const WINE_READ_HINT = 'https://wiki.archlinux.org/title/Wine';

const INSTALLER_FILE = 'RobloxStudioInstaller.exe';
const INSTALL_TIMEOUT_MS = 12 * 60 * 1000;

function message(cause) {
  return String(cause?.message ?? cause);
}

export function winePrefix() {
  const override = (process.env.XENITY_WINE_PREFIX || '').trim();
  if (override) return override;
  const configured = (getSettings().studio?.prefixPath || '').trim();
  return configured || path.join(xenityPaths().runtime, 'wineprefix');
}

export function wineBinary() {
  const override = (process.env.XENITY_WINE_BIN || '').trim();
  if (override) return override;
  return which('wine64') || which('wine') || null;
}

/** Environment every Wine process Xenity starts inherits. */
function wineEnv() {
  const settings = getSettings();
  const env = {
    ...process.env,
    WINEPREFIX: winePrefix(),
    WINEARCH: 'win64',
    WINEDEBUG: process.env.WINEDEBUG ?? '-all',
  };
  // Wine's own Direct3D is the fallback; DXVK ships its own d3d11/dxgi and is
  // what Studio actually needs when the Vulkan driver is present.
  if (settings.studio?.renderer === 'opengl') {
    env.WINEDLLOVERRIDES = 'd3d11,dxgi,d3d10core=b';
  } else if (!settings.studio?.dxvk) {
    env.WINEDLLOVERRIDES = 'd3d11,dxgi,d3d10core=b';
  }
  return env;
}

export function wineInfo() {
  const binary = wineBinary();
  if (!binary) {
    return {
      present: false,
      binary: null,
      version: null,
      detail: 'Wine was not found in PATH, so Xenity has no way to run Studio.',
    };
  }
  try {
    const version = execFileSync(binary, ['--version'], {
      timeout: 10000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: wineEnv(),
    }).trim();
    return { present: true, binary, version, detail: `${version} (${binary})` };
  } catch (cause) {
    return {
      present: true,
      binary,
      version: null,
      detail: `Wine was found at ${binary} but did not answer --version: ${message(cause)}`,
    };
  }
}

export function prefixState() {
  const dir = winePrefix();
  const initialized = exists(path.join(dir, 'system.reg')) && exists(path.join(dir, 'drive_c'));
  return { path: dir, initialized, exists: exists(dir) };
}

/** Every Roblox/Versions directory Wine could have written, both layouts. */
function versionRoots() {
  const prefix = prefixState().path;
  const roots = [path.join(prefix, 'drive_c', 'Program Files (x86)', 'Roblox', 'Versions')];
  const users = path.join(prefix, 'drive_c', 'users');
  let entries = [];
  try {
    entries = fs.readdirSync(users, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    roots.push(path.join(users, entry.name, 'AppData', 'Local', 'Roblox', 'Versions'));
  }
  return roots;
}

export function studioVersions() {
  const found = [];
  for (const root of versionRoots()) {
    let names = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      const dir = path.join(root, name);
      const exe = path.join(dir, STUDIO_BINARY);
      if (!exists(exe)) continue;
      let installedAt = null;
      try {
        installedAt = fs.statSync(exe).mtime.toISOString();
      } catch {
        installedAt = null;
      }
      found.push({ version: name, dir, exe, root, installedAt, bytes: directorySize(dir) });
    }
  }
  return found.sort((a, b) => new Date(b.installedAt ?? 0) - new Date(a.installedAt ?? 0));
}

export function installedStudio() {
  const versions = studioVersions();
  const newest = versions[0] ?? null;
  return {
    installed: Boolean(newest),
    version: newest?.version ?? null,
    exe: newest?.exe ?? null,
    dir: newest?.dir ?? null,
    installedAt: newest?.installedAt ?? null,
    bytes: newest?.bytes ?? 0,
    versions: versions.length,
    reason: newest
      ? null
      : 'Roblox Studio is not installed in this Wine prefix yet. Xenity can run Roblox’s own Studio installer for you.',
  };
}

const instances = new Map();
let instanceCounter = 0;

export function runningInstances() {
  return [...instances.values()].filter(
    (instance) => instance.status === 'starting' || instance.status === 'running',
  );
}

/** Start one Wine process and settle once it is visibly alive or already gone. */
function spawnTracked(args, meta) {
  const wine = wineBinary();
  if (!wine) {
    return Promise.resolve({
      started: false,
      instance: null,
      error: {
        code: 'XEN-WINE-001',
        message: 'Wine is not installed, so Studio cannot start.',
        hint: WINE_INSTALL_HINT,
      },
    });
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(wine, args, { stdio: ['ignore', 'pipe', 'pipe'], env: wineEnv() });
    } catch (cause) {
      resolve({
        started: false,
        instance: null,
        error: { code: 'XEN-STUDIO-005', message: message(cause) },
      });
      return;
    }

    instanceCounter += 1;
    const instance = {
      id: `studio_${Date.now().toString(36)}_${instanceCounter}`,
      pid: child.pid ?? null,
      place: meta.place ?? null,
      command: ['wine', ...args].join(' '),
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'starting',
      exitCode: null,
      signal: null,
      output: [],
    };
    instances.set(instance.id, instance);
    if (instances.size > 8) instances.delete(instances.keys().next().value);

    const collect = (chunk) => {
      for (const line of String(chunk).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        instance.output.push(trimmed.slice(0, 300));
        if (instance.output.length > 40) instance.output.shift();
      }
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      instance.status = 'running';
      info('studio', 'Roblox Studio is running', { pid: instance.pid, place: instance.place });
      settle({ started: true, instance, error: null });
    }, 1500);

    child.on('error', (cause) => {
      instance.status = 'failed';
      instance.endedAt = new Date().toISOString();
      const text = message(cause);
      warn('studio', `Roblox Studio could not be started: ${text}`);
      settle({ started: false, instance, error: { code: 'XEN-STUDIO-005', message: text } });
    });

    child.on('exit', (code, signal) => {
      instance.exitCode = code;
      instance.signal = signal ?? null;
      instance.endedAt = new Date().toISOString();
      const failed = code !== 0;
      instance.status = failed ? 'failed' : 'exited';
      const summary = `Roblox Studio exited (code ${code}${signal ? `, ${signal}` : ''})`;
      if (failed) warn('studio', summary, { output: instance.output.slice(-6) });
      else info('studio', summary);
      if (failed && !settled) {
        settle({
          started: false,
          instance,
          error: {
            code: 'XEN-STUDIO-005',
            message: `Roblox Studio exited with code ${code} before its window appeared.`,
            output: instance.output.slice(-6),
          },
        });
      }
    });
  });
}

/** Open Studio, optionally with a place file already loaded. */
export function launchStudio({ placePath = null } = {}) {
  const studio = installedStudio();
  if (!studio.installed || !studio.exe) {
    return Promise.resolve({
      started: false,
      instance: null,
      error: {
        code: 'XEN-STUDIO-001',
        message: `${STUDIO_NAME} is not installed in Xenity’s Wine prefix yet.`,
        hint: 'Press Install Studio: Xenity downloads Roblox’s own installer and runs it under Wine.',
      },
    });
  }
  if (placePath && !exists(placePath)) {
    return Promise.resolve({
      started: false,
      instance: null,
      error: {
        code: 'XEN-STUDIO-002',
        message: `The place file ${placePath} does not exist.`,
        hint: 'Pick the place again from your places list.',
      },
    });
  }
  const args = [studio.exe];
  if (placePath) args.push(placePath);
  return spawnTracked(args, { place: placePath ?? null });
}

export function openStudio() {
  return launchStudio({});
}

/* ------------------------------------------------------------------ install */

const job = {
  status: 'idle',
  phase: 'idle',
  installer: null,
  received: 0,
  total: null,
  percent: 0,
  error: null,
  startedAt: null,
  finishedAt: null,
};

export function installStatus() {
  return {
    job: structuredClone(job),
    wine: wineInfo(),
    prefix: prefixState(),
    studio: installedStudio(),
  };
}

function installerCache() {
  return path.join(ensureDir(xenityPaths().cache), INSTALLER_FILE);
}

async function downloadInstaller() {
  const target = installerCache();
  const response = await fetch(INSTALLER_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Xenity-Launcher' },
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Roblox answered HTTP ${response.status} for the Studio installer.`);
  }
  const total = Number(response.headers.get('content-length')) || null;
  job.total = total;
  let received = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      job.received = received;
      job.percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
      callback(null, chunk);
    },
  });
  const part = `${target}.part`;
  fs.rmSync(part, { force: true });
  await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(part));
  fs.renameSync(part, target);
  return { file: target, bytes: received };
}

function initialisePrefix(wine) {
  const dir = winePrefix();
  ensureDir(dir);
  job.phase = 'preparing';
  try {
    execFileSync(wine, ['wineboot', '-u'], {
      timeout: 180000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: wineEnv(),
    });
  } catch (cause) {
    throw new Error(`The Wine prefix at ${dir} could not be prepared: ${message(cause)}`);
  }
  info('studio', 'Wine prefix prepared', { prefix: dir });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runInstall({ installerPath = null } = {}) {
  job.status = 'running';
  job.phase = 'preparing';
  job.error = null;
  job.received = 0;
  job.percent = 0;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.installer = null;

  let child = null;
  try {
    const wine = wineBinary();
    if (!wine) {
      throw new Error(`Wine is not installed, so Roblox Studio cannot be installed. Install it with: ${WINE_INSTALL_HINT}`);
    }

    let installer = installerPath ? path.resolve(installerPath) : null;
    if (installer) {
      if (!exists(installer)) throw new Error(`The installer ${installer} does not exist.`);
      if (!/\.exe$/i.test(installer)) throw new Error('The installer must be a Windows .exe file.');
      job.installer = installer;
    } else {
      job.phase = 'downloading';
      info('studio', 'Downloading the Roblox Studio installer', { url: INSTALLER_URL });
      const download = await downloadInstaller();
      installer = download.file;
      job.installer = installer;
    }

    initialisePrefix(wine);

    job.phase = 'installing';
    info('studio', 'Running the Roblox Studio installer under Wine', { installer });
    child = spawn(wine, [installer], { stdio: 'ignore', env: wineEnv() });
    const exit = new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      child.on('error', () => resolve(-1));
    });

    job.phase = 'waiting';
    const deadline = Date.now() + INSTALL_TIMEOUT_MS;
    let code = null;
    while (Date.now() < deadline) {
      if (installedStudio().installed) break;
      code = await Promise.race([exit, wait(3000).then(() => null)]);
      if (code !== null && code !== 0) break;
    }

    const studio = installedStudio();
    if (!studio.installed) {
      throw new Error(
        code && code !== 0
          ? `The Roblox Studio installer exited with code ${code} without installing Studio.`
          : 'The installer finished but no Roblox Studio build appeared in the Wine prefix. Complete the installer window, then press Recheck.',
      );
    }

    job.status = 'done';
    job.phase = 'done';
    job.percent = 100;
    job.finishedAt = new Date().toISOString();
    info('studio', `Roblox Studio ${studio.version} installed`, { exe: studio.exe });
  } catch (cause) {
    const text = message(cause);
    job.status = 'failed';
    job.phase = 'failed';
    job.error = text;
    job.finishedAt = new Date().toISOString();
    warn('studio', `Studio install failed: ${text}`);
    if (child && !child.killed && child.exitCode === null) child.kill();
  }
}

/** Start the Studio install. One install at a time. */
export async function startStudioInstall({ installerPath = null } = {}) {
  if (job.status === 'running') {
    const conflict = new Error('A Roblox Studio install is already running.');
    conflict.status = 409;
    throw conflict;
  }
  job.status = 'running';
  job.phase = 'preparing';
  job.startedAt = new Date().toISOString();
  job.error = null;
  job.received = 0;
  job.percent = 0;
  job.finishedAt = null;
  void runInstall({ installerPath });
  return installStatus();
}

/* ------------------------------------------------------------------- doctor */

export function runDoctor() {
  const system = detectSystem();
  const wine = wineInfo();
  const prefix = prefixState();
  const studio = installedStudio();
  const dxvk = exists(path.join(prefix.path, 'drive_c', 'windows', 'system32', 'd3d11.dll'));
  const display = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY) || system.desktopSession.available;
  const graphics = system.graphics.vulkan.available || system.graphics.opengl.available;

  const checks = [
    {
      id: 'wine',
      label: 'Wine runtime',
      status: wine.present ? 'ok' : 'fail',
      detail: wine.detail,
    },
    {
      id: 'prefix',
      label: 'Wine prefix',
      status: prefix.initialized ? 'ok' : 'warn',
      detail: prefix.initialized
        ? `${prefix.path} is initialised`
        : `${prefix.path} is not initialised yet; Xenity creates it when Studio is installed`,
    },
    {
      id: 'studio',
      label: STUDIO_NAME,
      status: studio.installed ? 'ok' : 'fail',
      detail: studio.installed ? `${studio.version} at ${studio.exe}` : studio.reason,
    },
    {
      id: 'display',
      label: 'Display session',
      status: display ? 'ok' : 'fail',
      detail: display
        ? `${system.graphics.sessionType} session detected`
        : 'No DISPLAY or WAYLAND_DISPLAY is set for the Xenity service',
    },
    {
      id: 'graphics',
      label: 'Graphics driver',
      status: graphics ? 'ok' : 'warn',
      detail: graphics
        ? system.graphics.vulkan.available
          ? `Vulkan: ${system.graphics.vulkan.device ?? 'device detected'}`
          : `OpenGL: ${system.graphics.opengl.renderer ?? 'renderer detected'}`
        : 'Neither Vulkan nor OpenGL answered; Wine will fall back to software rendering',
    },
    {
      id: 'dxvk',
      label: 'DXVK',
      status: dxvk ? 'ok' : 'warn',
      detail: dxvk
        ? 'd3d11.dll is present in the prefix, so Studio renders through Vulkan'
        : 'No DXVK d3d11.dll in the prefix; install it with winetricks dxvk for Studio’s 3D viewport',
    },
  ];

  const blocked = checks.some((check) => check.status === 'fail');
  return {
    ran: true,
    blocked,
    exitCode: blocked ? 1 : 0,
    checks,
    lines: checks.map((check) => `[${check.status.toUpperCase()}] ${check.label}: ${check.detail}`),
    reason: blocked
      ? 'At least one check says Studio cannot start: install what is marked FAIL, then run the check again.'
      : 'Every check passed. Studio should start through Wine on this machine.',
    install: WINE_INSTALL_HINT,
    at: new Date().toISOString(),
  };
}

/** Everything the launcher shows about Studio, in one honest snapshot. */
export function getStudioStatus() {
  const settings = getSettings();
  const wine = wineInfo();
  const prefix = prefixState();
  const studio = installedStudio();
  const running = runningInstances();
  return {
    name: STUDIO_NAME,
    installerUrl: INSTALLER_URL,
    installHint: WINE_INSTALL_HINT,
    wine,
    prefix,
    studio,
    renderer: settings.studio?.renderer ?? 'auto',
    dxvk: Boolean(settings.studio?.dxvk),
    instances: running.length,
    running: running.map((instance) => ({
      id: instance.id,
      pid: instance.pid,
      place: instance.place,
      startedAt: instance.startedAt,
      status: instance.status,
    })),
    checkedAt: new Date().toISOString(),
  };
}
