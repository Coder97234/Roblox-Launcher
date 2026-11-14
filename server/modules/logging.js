import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, xenityPaths } from './store.js';

const MAX_LOG_BYTES = 512 * 1024;
const MEMORY_LIMIT = 300;
const memory = [];

function logFile() {
  return path.join(ensureDir(xenityPaths().logs), 'xenity.log');
}

function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
    // No file yet.
  }
}

/** Structured log entry — module, level, message, optional non-secret detail. */
export function log(level, module, message, detail = null) {
  const entry = {
    at: new Date().toISOString(),
    level,
    module,
    message,
    detail: detail ?? null,
  };
  memory.push(entry);
  if (memory.length > MEMORY_LIMIT) memory.shift();
  try {
    const file = logFile();
    rotateIfNeeded(file);
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch {
    // Logging must never take the launcher down.
  }
  const line = `[${entry.at}] ${level.toUpperCase()} ${module}: ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
  return entry;
}

export const info = (module, message, detail) => log('info', module, message, detail);
export const warn = (module, message, detail) => log('warn', module, message, detail);
export const error = (module, message, detail) => log('error', module, message, detail);

export function recentLogs({ limit = 150, level = null } = {}) {
  const entries = level ? memory.filter((entry) => entry.level === level) : memory;
  return entries.slice(-limit).reverse();
}

export function errorsOnly(limit = 10) {
  return recentLogs({ limit, level: 'error' });
}

/** Raw log tail for the "Export logs" action. */
export function tail(file = logFile(), lines = 1000) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export function currentLogFile() {
  return logFile();
}
