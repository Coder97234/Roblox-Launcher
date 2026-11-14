import fs from 'node:fs';
import path from 'node:path';

// Xenity-owned storage. Everything the launcher writes lives under this root so
// cleanup operations can never touch unrelated user files.
export const DATA_DIR = process.env.XENITY_DATA_DIR || '/data';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function xenityPaths() {
  const root = ensureDir(DATA_DIR);
  return {
    root,
    cache: ensureDir(path.join(root, 'cache')),
    logs: ensureDir(path.join(root, 'logs')),
    runtime: ensureDir(path.join(root, 'runtime')),
    applications: ensureDir(path.join(root, 'applications')),
    shaders: ensureDir(path.join(root, 'shaders')),
    config: ensureDir(path.join(root, 'config')),
  };
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

export function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function exists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

/** Recursive size of a Xenity-owned directory in bytes. Never follows symlinks. */
export function directorySize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += directorySize(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch {
      // A file removed mid-walk is not an error.
    }
  }
  return total;
}

export function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value >= 100 || power === 0 ? Math.round(value) : value.toFixed(1)} ${units[power]}`;
}
