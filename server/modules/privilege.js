import { execFileSync } from 'node:child_process';
import { which } from './system_detection.js';

/**
 * Privilege escalation for the two actions that genuinely need root: installing
 * packages with pacman and managing a swap file.
 *
 * Xenity never runs as root itself. It asks the desktop's policy agent (pkexec)
 * or a passwordless sudo for that one command, so the user keeps the ordinary
 * permissions for everything else. Nothing is escalated without the user
 * pressing the button that needs it.
 */
export const PRIVILEGE_HINT =
  'Install polkit so pkexec can ask for your password, or allow your user to run pacman and swapon through sudo without a password.';

/** The escalation tool available on this machine, or an unavailable record. */
export function privilegeTool() {
  const override = (process.env.XENITY_PRIVILEGE || '').trim();
  if (override) {
    return { command: override, args: [], label: override, available: true };
  }
  if (which('pkexec')) {
    return { command: 'pkexec', args: [], label: 'pkexec', available: true };
  }
  if (which('sudo')) {
    return { command: 'sudo', args: ['-n'], label: 'sudo -n', available: true };
  }
  return { command: null, args: [], label: 'none', available: false };
}

/** Split a privileged command into the executable and argument list to spawn. */
export function buildPrivileged(command, args = []) {
  const tool = privilegeTool();
  if (!tool.available) {
    const error = new Error(`No privilege helper is available (pkexec or sudo). ${PRIVILEGE_HINT}`);
    error.code = 'XEN-PRIV-001';
    throw error;
  }
  return { file: tool.command, args: [...tool.args, command, ...args] };
}

/** Run one command as root and return its combined output. Throws on failure. */
export function runPrivileged(command, args = [], options = {}) {
  const { file, args: argv } = buildPrivileged(command, args);
  return execFileSync(file, argv, {
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

/** First meaningful line of a failure, for messages that fit in a notice. */
export function firstLine(text) {
  const line = String(text ?? '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .find((entry) => !/^Password:|^==== AUTHENTICATING/i.test(entry));
  return line ? line.slice(0, 400) : '';
}
