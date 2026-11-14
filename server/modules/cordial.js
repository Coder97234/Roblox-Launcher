import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { which } from './system_detection.js';
import { info, warn } from './logging.js';

/**
 * Cordial engine adapter.
 *
 * Xenity does not reimplement an Android runtime. It drives Cordial
 * (https://github.com/luohoa97/cordial, GPL-3.0-or-later), which runs Roblox's
 * official Android build natively on Linux, through the interfaces that project
 * publishes:
 *
 *   cordial --help                                   version
 *   cordial --diagnostics                            which Cordial and Roblox build this is
 *   cordial --doctor --offline                       what would stop Roblox starting
 *   cordial --profile P --play [--place-id N]        start a game, with no launcher window
 *   cordial                                          open Cordial itself (its Download Roblox button)
 *
 * Everything here is detection and process control. Xenity never patches the
 * Roblox binary and never reports a launch Cordial did not perform.
 */

export const ENGINE_NAME = 'Cordial';
export const ENGINE_PROJECT = 'https://github.com/luohoa97/cordial';
export const ENGINE_LICENCE = 'GPL-3.0-or-later';
export const FLATPAK_ID = 'io.github.luohoa97.Cordial';

export const INSTALL_HINT =
  'flatpak install flathub io.github.luohoa97.Cordial   (or: paru -S cordial-bin)';

/** The installed binary, as the project's own .desktop entry names it. */
const BINARY_NAMES = ['cordial-shell', 'cordial'];
const VERSION_NAME = /^\d+(\.\d+)+$/;
const PROFILE_NAME = /^[A-Za-z0-9_-]{1,32}$/;
const BASE_APK = 'base.apk';
const SIGNER = '.signer';
const ENGINE_LIBRARY = 'libroblox.so';

const CANDIDATE_TTL_MS = 5000;
const VERSION_TTL_MS = 60000;

let candidateCache = { at: 0, value: null };
const versionCache = new Map();

function exists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

/** A Xenity override first, so a non-standard install can be pointed at directly. */
function override() {
  return (process.env.XENITY_CORDIAL_BIN || '').trim();
}

function flatpakInstalled(flatpak) {
  try {
    execFileSync(flatpak, ['info', FLATPAK_ID], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function discoverCandidate() {
  const explicit = override();
  if (explicit) {
    return { kind: 'native', command: explicit, prefix: [], source: 'XENITY_CORDIAL_BIN' };
  }
  for (const name of BINARY_NAMES) {
    const found = which(name);
    if (found) return { kind: 'native', command: found, prefix: [], source: `PATH (${name})` };
  }
  const flatpak = which('flatpak');
  if (flatpak && flatpakInstalled(flatpak)) {
    return { kind: 'flatpak', command: flatpak, prefix: ['run', FLATPAK_ID], source: 'Flatpak' };
  }
  return null;
}

export function findCandidate({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && now - candidateCache.at < CANDIDATE_TTL_MS) return candidateCache.value;
  const value = discoverCandidate();
  candidateCache = { at: now, value };
  return value;
}

/** How a person would type this engine's command. */
export function describeCandidate(candidate) {
  if (!candidate) return null;
  return candidate.prefix.length
    ? `${candidate.command} ${candidate.prefix.join(' ')}`
    : candidate.command;
}

function runSync(candidate, args, timeout = 8000) {
  try {
    const stdout = execFileSync(candidate.command, [...candidate.prefix, ...args], {
      timeout,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, status: 0, output: stdout };
  } catch (cause) {
    const stdout = typeof cause?.stdout === 'string' ? cause.stdout : '';
    const stderr = typeof cause?.stderr === 'string' ? cause.stderr : '';
    return {
      ok: false,
      status: typeof cause?.status === 'number' ? cause.status : null,
      output: `${stdout}${stderr}`,
      message: String(cause?.message ?? cause),
    };
  }
}

/** `--help` opens with "cordial <version>"; there is no `--version` flag. */
export function readVersion(candidate = findCandidate()) {
  if (!candidate) return null;
  const key = describeCandidate(candidate);
  const cached = versionCache.get(key);
  if (cached && Date.now() - cached.at < VERSION_TTL_MS) return cached.value;
  const result = runSync(candidate, ['--help'], 6000);
  const match = (result.output || '').match(/^\s*cordial\s+(\S+)\s*$/m);
  const value = match ? match[1] : null;
  versionCache.set(key, { at: Date.now(), value });
  return value;
}

function lines(text, limit) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, limit);
}

/** The `--diagnostics` block, reduced to the fields Xenity shows. */
export function readEngineReport() {
  const candidate = findCandidate();
  if (!candidate) {
    return {
      ran: false,
      command: null,
      fields: {},
      lines: [],
      reason: `${ENGINE_NAME} is not installed, so there is no engine to report on.`,
    };
  }
  const result = runSync(candidate, ['--diagnostics'], 10000);
  const block = lines(result.output, 40);
  const field = (label) =>
    block.find((line) => line.trimStart().startsWith(label))?.slice(label.length).trim() ?? null;
  return {
    ran: result.ok,
    command: describeCandidate(candidate),
    fields: {
      cordial: field('Cordial'),
      roblox: field('Roblox'),
      install: field('Install'),
      licence: field('Licence'),
      session: field('Session'),
      graphics: field('Graphics'),
    },
    lines: block,
    reason: result.ok ? null : result.message ?? 'Cordial did not answer.',
  };
}

/** `--doctor --offline`: exit code 1 means something would stop Roblox starting. */
export function runDoctor() {
  const candidate = findCandidate();
  if (!candidate) {
    return {
      ran: false,
      blocked: true,
      exitCode: null,
      lines: [],
      reason: `${ENGINE_NAME} is not installed, so its machine checks cannot run.`,
      install: INSTALL_HINT,
    };
  }
  const result = runSync(candidate, ['--doctor', '--offline'], 30000);
  const blocked = result.status !== 0;
  if (blocked) warn('engine', `Cordial doctor reported a blocking problem (exit ${result.status})`);
  else info('engine', 'Cordial doctor found nothing that stops Roblox starting');
  return {
    ran: true,
    blocked,
    exitCode: result.status,
    command: describeCandidate(candidate),
    lines: lines(result.output, 60),
    reason: blocked
      ? 'Cordial doctor exited non-zero: at least one check says Roblox will not start on this machine.'
      : 'Every Cordial doctor check passed.',
  };
}

/** Where Cordial keeps its own Roblox builds, newest layout first. */
export function storeRoots() {
  const roots = [];
  const explicit = (process.env.XENITY_CORDIAL_STORE || '').trim();
  if (explicit) roots.push(explicit);
  const home = process.env.HOME || '';
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) roots.push(path.join(xdg, 'cordial', 'builds'));
  if (home) {
    roots.push(path.join(home, '.local', 'share', 'cordial', 'builds'));
    // A Flatpak's XDG_DATA_HOME is the sandbox's own, so its store lives here.
    roots.push(path.join(home, '.var', 'app', FLATPAK_ID, 'data', 'cordial', 'builds'));
  }
  return [...new Set(roots)];
}

/** Numeric, component-wise: `2.9` sorts below `2.740`, which is the point. */
function compareVersionsDesc(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function scanRoot(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { path: root, exists: false, builds: [] };
  }
  const builds = entries
    .filter((entry) => entry.isDirectory() && VERSION_NAME.test(entry.name))
    .map((entry) => {
      const dir = path.join(root, entry.name);
      const engine = exists(path.join(dir, ENGINE_LIBRARY));
      const baseApk = exists(path.join(dir, BASE_APK));
      const signer = exists(path.join(dir, SIGNER));
      return {
        version: entry.name,
        dir,
        root,
        engine,
        baseApk,
        signer,
        // Cordial's own rule: an entry a launch may run holds its own APK and
        // somebody has established who signed it.
        launchable: engine && baseApk && signer,
      };
    })
    .filter((build) => build.engine)
    .sort((a, b) => compareVersionsDesc(a.version, b.version));
  return { path: root, exists: true, builds };
}

/**
 * Read-only view of Cordial's build store. Xenity never writes here: Cordial
 * owns its builds (its ADR-054), and a download or import happens in Cordial.
 */
export function readBuildStore() {
  const roots = storeRoots().map(scanRoot);
  const builds = roots
    .flatMap((root) => root.builds)
    .sort((a, b) => compareVersionsDesc(a.version, b.version));
  const active = roots.find((root) => root.builds.length > 0) ?? roots[0] ?? null;
  return {
    roots: roots.map((root) => ({
      path: root.path,
      exists: root.exists,
      builds: root.builds.length,
    })),
    root: active?.path ?? null,
    builds,
    newest: builds[0] ?? null,
    runnableBuild: builds.find((build) => build.launchable) ?? null,
  };
}

const instances = new Map();
let instanceCounter = 0;

export function listInstances() {
  return [...instances.values()];
}

export function runningInstances() {
  return [...instances.values()].filter(
    (instance) => instance.status === 'starting' || instance.status === 'running',
  );
}

/**
 * Start one process and settle once it is either visibly alive or already
 * gone. A child that dies inside the settle window is a failure worth showing,
 * not a launch to be claimed.
 */
function spawnTracked(candidate, args, meta) {
  const argv = [...candidate.prefix, ...args];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(candidate.command, argv, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    } catch (cause) {
      resolve({
        started: false,
        instance: null,
        error: { code: 'XEN-START-005', message: String(cause?.message ?? cause) },
      });
      return;
    }

    instanceCounter += 1;
    const instance = {
      id: `engine_${Date.now().toString(36)}_${instanceCounter}`,
      pid: child.pid ?? null,
      kind: meta.kind,
      profile: meta.profile ?? null,
      placeId: meta.placeId ?? null,
      command: `${describeCandidate(candidate)} ${argv.slice(candidate.prefix.length).join(' ')}`.trim(),
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
      info('engine', `Cordial is running (${meta.kind})`, {
        pid: instance.pid,
        profile: instance.profile,
        placeId: instance.placeId,
      });
      settle({ started: true, instance, error: null });
    }, 1200);

    child.on('error', (cause) => {
      instance.status = 'failed';
      instance.endedAt = new Date().toISOString();
      const message = String(cause?.message ?? cause);
      warn('engine', `Cordial could not be started: ${message}`);
      settle({ started: false, instance, error: { code: 'XEN-START-005', message } });
    });

    child.on('exit', (code, signal) => {
      instance.exitCode = code;
      instance.signal = signal ?? null;
      instance.endedAt = new Date().toISOString();
      const failed = code !== 0;
      instance.status = failed ? 'failed' : 'exited';
      const summary = `Cordial exited (code ${code}${signal ? `, ${signal}` : ''})`;
      if (failed) {
        warn('engine', summary, { output: instance.output.slice(-6) });
      } else {
        info('engine', summary);
      }
      if (failed && !settled) {
        settle({
          started: false,
          instance,
          error: {
            code: 'XEN-START-005',
            message: `Cordial exited with code ${code} before the game window appeared.`,
            output: instance.output.slice(-6),
          },
        });
      }
    });
  });
}

/** Start Roblox through Cordial's own headless launcher. */
export function launchEngine({ placeId = null, profile = 'xenity', fullscreen = false } = {}) {
  const candidate = findCandidate({ refresh: true });
  if (!candidate) {
    return Promise.resolve({
      started: false,
      instance: null,
      error: {
        code: 'XEN-ENGINE-001',
        message: `${ENGINE_NAME} is not installed, so there is no engine to start.`,
        install: INSTALL_HINT,
      },
    });
  }
  const safeProfile = PROFILE_NAME.test(String(profile)) ? String(profile) : 'xenity';
  const args = ['--profile', safeProfile, '--play'];
  const numericPlace = Number(placeId);
  if (Number.isInteger(numericPlace) && numericPlace > 0) args.push('--place-id', String(numericPlace));
  if (fullscreen) args.push('--fullscreen');
  return spawnTracked(candidate, args, {
    kind: 'game',
    profile: safeProfile,
    placeId: Number.isInteger(numericPlace) && numericPlace > 0 ? numericPlace : null,
  });
}

/** Open Cordial itself: its Download Roblox button is how a build arrives. */
export function openEngine() {
  const candidate = findCandidate({ refresh: true });
  if (!candidate) {
    return Promise.resolve({
      started: false,
      instance: null,
      error: {
        code: 'XEN-ENGINE-001',
        message: `${ENGINE_NAME} is not installed, so its own window cannot be opened.`,
        install: INSTALL_HINT,
      },
    });
  }
  return spawnTracked(candidate, [], { kind: 'launcher', profile: null, placeId: null });
}

/** Everything the launcher shows about the engine, in one honest snapshot. */
export function getEngineStatus() {
  const candidate = findCandidate();
  const store = readBuildStore();
  const version = candidate ? readVersion(candidate) : null;
  const running = runningInstances();
  const runnableBuild = store.runnableBuild;
  return {
    engine: ENGINE_NAME,
    project: ENGINE_PROJECT,
    licence: ENGINE_LICENCE,
    install: INSTALL_HINT,
    present: Boolean(candidate),
    kind: candidate?.kind ?? null,
    command: describeCandidate(candidate),
    source: candidate?.source ?? null,
    version,
    store,
    build: runnableBuild ?? store.newest ?? null,
    runnable: Boolean(runnableBuild),
    instances: running.length,
    running: running.map((instance) => ({
      id: instance.id,
      pid: instance.pid,
      kind: instance.kind,
      profile: instance.profile,
      placeId: instance.placeId,
      startedAt: instance.startedAt,
      status: instance.status,
    })),
    checkedAt: new Date().toISOString(),
  };
}
