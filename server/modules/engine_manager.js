import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { xenityPaths, readJson, writeJson, ensureDir } from './store.js';
import { info, warn } from './logging.js';

/**
 * Xenity-managed Cordial engine.
 *
 * Xenity ships the engine instead of asking the person to install it first:
 * the newest official Cordial release for this machine's architecture is
 * downloaded from the project's own GitHub releases into Xenity's data
 * directory and started from there. Cordial is what plays Roblox — Xenity
 * never reimplements that runtime, never patches the Roblox binary, and never
 * bundles Roblox itself: Cordial's own build store still owns the Android
 * build, and its Download Roblox button is how a build arrives.
 *
 * Layout under <Xenity data>/runtime/engine:
 *   cordial.AppImage   the engine binary (chmod +x)
 *   manifest.json      which release it is, when it arrived, whether it ran
 */

export const ENGINE_REPO = 'luohoa97/cordial';
export const ENGINE_RELEASE_PAGE = `https://github.com/${ENGINE_REPO}/releases`;

const BINARY = 'cordial.AppImage';
const MANIFEST = 'manifest.json';
const RELEASE_TTL_MS = 5 * 60 * 1000;
const ASSET_ARCH = { x64: 'x86_64', arm64: 'aarch64' };

let releaseCache = { at: 0, value: null };

export function engineDir() {
  return ensureDir(path.join(xenityPaths().runtime, 'engine'));
}

export function engineBinaryPath() {
  return path.join(engineDir(), BINARY);
}

function manifestPath() {
  return path.join(engineDir(), MANIFEST);
}

function assetArch() {
  return ASSET_ARCH[process.arch] ?? process.arch;
}

/** A downloaded AppImage needs FUSE; without it the binary self-extracts. */
export function appImagePrefix() {
  return fs.existsSync('/dev/fuse') ? [] : ['--appimage-extract-and-run'];
}

async function get(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': 'Xenity-Launcher', Accept: '*/*', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`GitHub answered HTTP ${response.status} for ${url}`);
  }
  return response;
}

/**
 * Which official Cordial release this machine would get: the tag comes from the
 * releases/latest redirect, the AppImage name from that release's asset list.
 */
export async function resolveLatestRelease({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && releaseCache.value && now - releaseCache.at < RELEASE_TTL_MS) {
    return releaseCache.value;
  }

  let tag = null;
  let assets = [];
  try {
    const latest = await fetch(`${ENGINE_RELEASE_PAGE}/latest`, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Xenity-Launcher' },
      signal: AbortSignal.timeout(12000),
    });
    tag = (latest.headers.get('location') || '').split('/releases/tag/')[1] || null;
    if (!tag) {
      const html = await latest.text();
      tag = html.match(/\/releases\/tag\/([^"?#]+)/)?.[1] ?? null;
    }
    if (tag) {
      const page = await get(`${ENGINE_RELEASE_PAGE}/expanded_assets/${tag}`);
      const html = await page.text();
      const seen = new Set();
      for (const match of html.matchAll(new RegExp(`/releases/download/${tag}/([A-Za-z0-9._-]+\\.AppImage)`, 'g'))) {
        if (!seen.has(match[1])) {
          seen.add(match[1]);
          assets.push(match[1]);
        }
      }
    }
  } catch (cause) {
    const value = {
      resolved: false,
      tag: null,
      version: null,
      asset: null,
      url: null,
      size: null,
      arch: assetArch(),
      page: ENGINE_RELEASE_PAGE,
      reason: `The Cordial release list could not be read: ${String(cause?.message ?? cause)}`,
      checkedAt: new Date().toISOString(),
    };
    releaseCache = { at: now, value };
    return value;
  }

  const wanted = `${assetArch()}.AppImage`;
  const asset = assets.find((name) => name.endsWith(wanted)) ?? null;
  const version = tag ? tag.replace(/^v/, '') : null;
  let size = null;
  if (asset) {
    try {
      const head = await fetch(`${ENGINE_RELEASE_PAGE}/download/${tag}/${asset}`, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'Xenity-Launcher' },
        signal: AbortSignal.timeout(12000),
      });
      size = Number(head.headers.get('content-length')) || null;
    } catch {
      size = null;
    }
  }

  const value = {
    resolved: Boolean(tag && asset),
    tag,
    version,
    asset,
    url: asset ? `${ENGINE_RELEASE_PAGE}/download/${tag}/${asset}` : null,
    size,
    arch: assetArch(),
    page: ENGINE_RELEASE_PAGE,
    reason:
      tag && asset
        ? null
        : tag
          ? `Cordial ${tag} publishes no AppImage for this architecture (${assetArch()}).`
          : 'No Cordial release could be resolved from GitHub.',
    checkedAt: new Date().toISOString(),
  };
  releaseCache = { at: now, value };
  return value;
}

/** The engine Xenity installed itself, if any. */
export function installedEngine() {
  const binary = engineBinaryPath();
  let exists = false;
  try {
    fs.accessSync(binary, fs.constants.X_OK);
    exists = true;
  } catch {
    exists = false;
  }
  const manifest = readJson(manifestPath(), null);
  if (!exists) {
    return { installed: false, binary, path: null, manifest: null, runnable: false, reason: 'No engine has been installed by Xenity yet.' };
  }
  return {
    installed: true,
    binary,
    path: binary,
    manifest,
    version: manifest?.version ?? null,
    tag: manifest?.tag ?? null,
    size: manifest?.size ?? null,
    installedAt: manifest?.installedAt ?? null,
    verified: Boolean(manifest?.verified),
    runnable: Boolean(manifest?.verified),
    reason: manifest?.verified
      ? null
      : manifest?.verifyError ?? 'The engine was downloaded but has not been confirmed to start on this machine.',
  };
}

/** A discovered engine candidate in the shape cordial.js launches. */
export function managedCandidate() {
  const engine = installedEngine();
  if (!engine.installed) return null;
  return {
    kind: 'managed',
    command: engine.binary,
    prefix: appImagePrefix(),
    source: 'Xenity engine (bundled AppImage)',
  };
}

function probe(binary) {
  try {
    const output = execFileSync(binary, [...appImagePrefix(), '--help'], {
      timeout: 25000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (cause) {
    const out = `${cause?.stdout ?? ''}${cause?.stderr ?? ''}`;
    return { ok: false, output: out || String(cause?.message ?? cause) };
  }
}

const job = {
  status: 'idle',
  phase: 'idle',
  release: null,
  received: 0,
  total: null,
  percent: 0,
  error: null,
  startedAt: null,
  finishedAt: null,
};

export function engineInstallStatus() {
  return { job: structuredClone(job), engine: installedEngine() };
}

async function download(release) {
  const target = `${engineBinaryPath()}.part`;
  fs.rmSync(target, { force: true });
  const response = await fetch(release.url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Xenity-Launcher' },
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`The engine download failed with HTTP ${response.status}.`);
  }
  const total = Number(response.headers.get('content-length')) || release.size || null;
  job.total = total;
  let received = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      job.received = received;
      job.percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(target));
  fs.chmodSync(target, 0o755);
  fs.renameSync(target, engineBinaryPath());
  return received;
}

async function runInstall(release, force) {
  job.status = 'running';
  job.phase = 'resolving';
  job.release = release;
  job.error = null;
  job.received = 0;
  job.percent = 0;
  job.total = release.size ?? null;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  info('engine', `Installing ${release.asset}`, { tag: release.tag, url: release.url });

  try {
    if (!release.resolved || !release.url) {
      throw new Error(release.reason ?? 'No engine release is available for this machine.');
    }
    if (force) fs.rmSync(engineBinaryPath(), { force: true });

    job.phase = 'downloading';
    const bytes = await download(release);

    job.phase = 'verifying';
    const result = probe(engineBinaryPath());
    if (!result.ok) {
      warn('engine', 'The downloaded engine did not answer --help on this machine', {
        output: String(result.output).slice(-400),
      });
    }

    writeJson(manifestPath(), {
      tag: release.tag,
      version: release.version,
      asset: release.asset,
      url: release.url,
      size: bytes,
      installedAt: new Date().toISOString(),
      verified: result.ok,
      verifyOutput: String(result.output).slice(-800),
      verifyError: result.ok ? null : 'The engine was downloaded but did not answer --help here; it needs this machine’s desktop libraries to start.',
    });

    job.status = 'done';
    job.phase = 'done';
    job.percent = 100;
    job.finishedAt = new Date().toISOString();
    info('engine', `Engine installed (${release.tag})`, { verified: result.ok, bytes });
  } catch (cause) {
    const message = String(cause?.message ?? cause);
    job.status = 'failed';
    job.phase = 'failed';
    job.error = message;
    job.finishedAt = new Date().toISOString();
    warn('engine', `Engine install failed: ${message}`);
    fs.rmSync(`${engineBinaryPath()}.part`, { force: true });
  }
}

/** Start (or restart) the engine download. One install at a time. */
export async function startEngineInstall({ force = false } = {}) {
  if (job.status === 'running') {
    const conflict = new Error('An engine install is already running.');
    conflict.status = 409;
    throw conflict;
  }
  const release = await resolveLatestRelease({ refresh: force });
  job.status = 'running';
  job.phase = 'resolving';
  job.release = release;
  job.startedAt = new Date().toISOString();
  job.error = null;
  job.received = 0;
  job.percent = 0;
  job.finishedAt = null;
  void runInstall(release, force);
  return engineInstallStatus();
}

/** Remove the engine Xenity installed. The system Cordial, if any, is untouched. */
export function uninstallEngine() {
  const dir = engineDir();
  fs.rmSync(dir, { recursive: true, force: true });
  releaseCache = { at: 0, value: null };
  if (job.status !== 'running') {
    Object.assign(job, {
      status: 'idle',
      phase: 'idle',
      release: null,
      received: 0,
      total: null,
      percent: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    });
  }
  info('engine', 'The Xenity-managed engine was removed');
  return { removed: true, directory: dir };
}
