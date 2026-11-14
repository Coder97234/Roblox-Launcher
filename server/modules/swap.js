import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { humanBytes, readJson, writeJson, xenityPaths } from './store.js';
import { which } from './system_detection.js';
import { buildPrivileged, firstLine, PRIVILEGE_HINT, privilegeTool } from './privilege.js';
import { info, warn } from './logging.js';

/**
 * External storage as RAM: Xenity puts one swap file on a drive the user picks
 * and turns it on, so a small machine can borrow an SD card or USB stick for
 * extra memory. The file is always named `.xenity-swap` at the root of the
 * chosen mount, and its exact path is recorded in the Xenity configuration,
 * so "Delete" can only ever remove the file Xenity created there.
 */

export const SWAP_FILE_NAME = '.xenity-swap';

// Leave the filesystem room for its own metadata and one last write.
const RESERVE_BYTES = 128 * 1024 * 1024;
const MIN_SWAP_BYTES = 512 * 1024 * 1024;

// Filesystems that can hold a swap file. FAT/exFAT/NTFS cannot: they have no
// permission bits and swapon refuses them, so they are rejected up front with
// an explanation instead of failing halfway through.
const SWAP_FILESYSTEMS = ['ext2', 'ext3', 'ext4', 'xfs', 'f2fs', 'btrfs'];

// Mountpoints Xenity will never put a swap file on, even if they are external.
const SYSTEM_MOUNTS = new Set([
  '/',
  '/boot',
  '/boot/efi',
  '/efi',
  '/home',
  '/usr',
  '/var',
  '/etc',
  '/tmp',
  '/opt',
  '/srv',
]);

const EXTERNAL_PREFIXES = ['/media/', '/mnt/', '/run/media/'];

function swapRecordFile() {
  return path.join(xenityPaths().config, 'swap.json');
}

function readRecord() {
  const record = readJson(swapRecordFile(), null);
  if (!record || typeof record.file !== 'string') return null;
  // Never trust a stored path that is not exactly Xenity's own swap file.
  if (path.basename(record.file) !== SWAP_FILE_NAME) return null;
  return record;
}

function isExternalMount(mountPoint) {
  return EXTERNAL_PREFIXES.some((prefix) => mountPoint.startsWith(prefix));
}

/* -------------------------------------------------------------- enumerate */

function flattenDevices(devices) {
  const out = [];
  for (const device of devices ?? []) {
    out.push(device);
    out.push(...flattenDevices(device.children));
  }
  return out;
}

function lsblkDevices() {
  const binary = which('lsblk');
  if (!binary) return null;
  try {
    const raw = execFileSync(
      binary,
      [
        '--json',
        '--bytes',
        '--output',
        'NAME,PATH,MOUNTPOINT,SIZE,TYPE,RM,RO,FSTYPE,LABEL,MODEL,TRAN',
      ],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return flattenDevices(JSON.parse(raw)?.blockdevices ?? []);
  } catch {
    return null;
  }
}

/**
 * mountpoint -> filesystem, straight from the kernel. lsblk reports a null
 * fstype on machines without udev, so the kernel's own table is authoritative.
 */
function mountTable() {
  const table = new Map();
  let raw = '';
  try {
    raw = fs.readFileSync('/proc/mounts', 'utf8');
  } catch {
    return table;
  }
  for (const line of raw.split('\n')) {
    const fields = line.split(' ');
    if (fields.length < 3) continue;
    const mountPoint = fields[1].replace(/\\040/g, ' ');
    if (!table.has(mountPoint)) {
      table.set(mountPoint, {
        device: fields[0].replace(/\\040/g, ' '),
        filesystem: fields[2],
      });
    }
  }
  return table;
}

/** Mounts from /proc/mounts, used when lsblk is not installed. */
function procMounts() {
  return [...mountTable().entries()].map(([mountPoint, entry]) => ({
    path: entry.device,
    mountpoint: mountPoint,
    fstype: entry.filesystem,
    rm: false,
    ro: false,
    label: null,
    model: null,
    tran: null,
    size: null,
  }));
}

function freeBytes(mountPoint) {
  try {
    const stats = fs.statfsSync(mountPoint);
    // bfree counts blocks root may use, which is what the swap file gets.
    return Number(stats.bfree) * Number(stats.bsize);
  } catch {
    return null;
  }
}

function activeSwaps() {
  let raw = '';
  try {
    raw = fs.readFileSync('/proc/swaps', 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length >= 4 && fields[0].startsWith('/'))
    .map(([file, type, size, used]) => ({
      file,
      type,
      // /proc/swaps reports KiB.
      sizeBytes: Number(size) * 1024,
      usedBytes: Number(used) * 1024,
    }));
}

export function listDrives() {
  const record = readRecord();
  const mounts = mountTable();
  const fromLsblk = lsblkDevices();
  const source = fromLsblk ?? procMounts();
  const seen = new Set();
  const drives = [];

  for (const device of source) {
    const mountPoint = device.mountpoint;
    if (!mountPoint || seen.has(mountPoint)) continue;
    if (SYSTEM_MOUNTS.has(mountPoint)) continue;
    const removable = device.rm === true || device.rm === '1' || device.rm === 1;
    const transport = device.tran ? String(device.tran).toLowerCase() : null;
    const external = removable || transport === 'usb' || isExternalMount(mountPoint);
    if (!external) continue;

    let isDirectory = false;
    try {
      isDirectory = fs.statSync(mountPoint).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) continue;

    seen.add(mountPoint);
    const kernelMount = mounts.get(mountPoint);
    const filesystem = kernelMount?.filesystem ?? (device.fstype ? String(device.fstype) : null);
    const sizeBytes = Number(device.size) || 0;
    const free = freeBytes(mountPoint) ?? 0;
    const readOnly = device.ro === true || device.ro === '1' || device.ro === 1;
    const usable = Math.max(0, free - RESERVE_BYTES);

    let reason = null;
    if (readOnly) {
      reason = 'The drive is mounted read-only, so no file can be created on it.';
    } else if (!filesystem || !SWAP_FILESYSTEMS.includes(filesystem)) {
      reason = `${filesystem ?? 'This'} filesystem cannot hold a swap file. Reformat the drive as ext4 to use it as RAM.`;
    } else if (usable < MIN_SWAP_BYTES) {
      reason = `Only ${humanBytes(free)} is free; a swap file needs at least ${humanBytes(MIN_SWAP_BYTES)}.`;
    }

    drives.push({
      device: String(device.path ?? device.name ?? mountPoint),
      mountPoint,
      label: device.label ? String(device.label) : null,
      model: device.model ? String(device.model).trim() : null,
      filesystem,
      sizeBytes,
      freeBytes: free,
      removable,
      transport,
      swapSizeBytes: usable >= MIN_SWAP_BYTES ? usable : 0,
      supportsSwap: reason === null,
      reason,
      managedSwap: Boolean(record && record.mountPoint === mountPoint),
    });
  }

  return drives.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint));
}

/* -------------------------------------------------------------------- job */

function emptyJob() {
  return {
    status: 'idle',
    action: null,
    phase: 'idle',
    mountPoint: null,
    file: null,
    sizeBytes: null,
    received: 0,
    percent: 0,
    error: null,
    message: null,
    lines: [],
    startedAt: null,
    finishedAt: null,
  };
}

let job = emptyJob();

function pushLine(text) {
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    job.lines.push(trimmed.slice(0, 240));
  }
  while (job.lines.length > 60) job.lines.shift();
}

/** Run one privileged step, recording its command and output in the job. */
function step(command, args, label) {
  pushLine(`$ ${command} ${args.join(' ')}`);
  try {
    const { file, args: argv } = buildPrivileged(command, args);
    pushLine(
      execFileSync(file, argv, {
        encoding: 'utf8',
        timeout: 30 * 60 * 1000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch (cause) {
    throw new Error(
      `${label} failed: ${firstLine(cause.stderr) || firstLine(cause.message) || 'the command exited with an error'}`,
    );
  }
}

/* ------------------------------------------------------------------ tools */

export function swapTools() {
  const required = ['mkswap', 'swapon'];
  const optional = ['swapoff', 'fallocate', 'dd'];
  const missing = required.filter((binary) => !which(binary));
  const optionalMissing = optional.filter((binary) => !which(binary));
  const privilege = privilegeTool();
  return {
    available: missing.length === 0 && privilege.available,
    missing,
    optionalMissing,
    privilege: privilege.label,
    privilegeAvailable: privilege.available,
    detail:
      missing.length > 0
        ? `Missing ${missing.join(', ')}. Install util-linux.`
        : !privilege.available
          ? PRIVILEGE_HINT
          : 'Swap actions will ask for your password.',
  };
}

export function swapStatus() {
  const record = readRecord();
  const active = activeSwaps();
  const managedRecord = record && fs.existsSync(record.file) ? { ...record } : null;
  const managed = managedRecord
    ? {
        ...managedRecord,
        active: active.some((entry) => entry.file === managedRecord.file),
      }
    : record
      ? { ...record, active: false, missing: true }
      : null;

  return {
    drives: listDrives(),
    managed,
    active,
    tools: swapTools(),
    job: structuredClone(job),
    reserveBytes: RESERVE_BYTES,
    checkedAt: new Date().toISOString(),
  };
}

/* --------------------------------------------------------------- allocate */

function runToCompletion(file, argv) {
  return new Promise((resolve) => {
    let stderr = '';
    let child;
    try {
      child = spawn(file, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (cause) {
      resolve({ code: -1, stderr: String(cause?.message ?? cause) });
      return;
    }
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (cause) => resolve({ code: -1, stderr: String(cause?.message ?? cause) }));
    child.on('exit', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

/** Reserve the space, reporting how much of it has landed so far. */
async function allocate(file, sizeBytes) {
  job.phase = 'allocating';
  const sizeMiB = Math.floor(sizeBytes / (1024 * 1024));
  const track = () => {
    try {
      const written = fs.statSync(file).size;
      job.received = written;
      job.percent = Math.min(99, Math.round((written / sizeBytes) * 100));
    } catch {
      // The file does not exist yet; the next tick will see it.
    }
  };
  const timer = setInterval(track, 700);
  try {
    const fallocate = buildPrivileged('fallocate', ['-l', String(sizeBytes), file]);
    const reserved = await runToCompletion(fallocate.file, fallocate.args);
    if (reserved.code === 0) {
      job.received = sizeBytes;
      job.percent = 99;
      return;
    }
    pushLine(`fallocate could not reserve the space (${firstLine(reserved.stderr) || 'unsupported'}), filling the file with dd instead.`);
    const dd = buildPrivileged('dd', ['if=/dev/zero', `of=${file}`, 'bs=1M', `count=${sizeMiB}`, 'conv=fsync', 'status=none']);
    const filled = await runToCompletion(dd.file, dd.args);
    if (filled.code !== 0) {
      throw new Error(
        `The swap file could not be written to the drive: ${firstLine(filled.stderr) || `dd exited with code ${filled.code}`}`,
      );
    }
    job.received = sizeBytes;
    job.percent = 99;
  } finally {
    clearInterval(timer);
  }
}

/* ----------------------------------------------------------------- create */

async function createSwap({ mountPoint }) {
  const drives = listDrives();
  const drive = drives.find((entry) => entry.mountPoint === mountPoint);
  if (!drive) {
    throw new Error(
      `${mountPoint} is not a mounted external drive Xenity can see. Refresh the drive list and pick one of the listed drives.`,
    );
  }
  if (!drive.supportsSwap) throw new Error(drive.reason ?? 'That drive cannot hold a swap file.');
  if (activeSwaps().some((entry) => entry.file === path.join(drive.mountPoint, SWAP_FILE_NAME))) {
    throw new Error(`${drive.mountPoint} already has an active Xenity swap file. Delete it first.`);
  }

  const sizeBytes = drive.swapSizeBytes;
  const file = path.join(drive.mountPoint, SWAP_FILE_NAME);
  job.mountPoint = drive.mountPoint;
  job.file = file;
  job.sizeBytes = sizeBytes;
  const label = drive.label || drive.model || drive.device;

  info('swap', 'Creating a swap file on external storage', {
    mountPoint: drive.mountPoint,
    file,
    sizeBytes,
  });

  if (fs.existsSync(file)) {
    // A file Xenity left behind by an interrupted run: start from a clean one.
    step('rm', ['-f', file], 'Removing the previous swap file');
  }
  if (drive.filesystem === 'btrfs') {
    // btrfs only accepts a swap file whose extents have copy-on-write disabled.
    step('truncate', ['-s', '0', file], 'Creating an empty swap file');
    step('chattr', ['+C', file], 'Disabling copy-on-write on the swap file');
  }

  await allocate(file, sizeBytes);
  step('chmod', ['600', file], 'Setting the swap file permissions');
  job.phase = 'formatting';
  step('mkswap', [file], 'mkswap');
  job.phase = 'activating';
  step('swapon', [file], 'swapon');

  const active = activeSwaps().find((entry) => entry.file === file);
  if (!active) {
    throw new Error(
      `${file} was created but does not appear in the active swap list, so the kernel did not accept it.`,
    );
  }

  writeJson(swapRecordFile(), {
    file,
    mountPoint: drive.mountPoint,
    device: drive.device,
    label: drive.label,
    sizeBytes: active.sizeBytes || sizeBytes,
    createdAt: new Date().toISOString(),
  });

  job.status = 'done';
  job.phase = 'done';
  job.percent = 100;
  job.message = `${humanBytes(active.sizeBytes || sizeBytes)} of swap is now active from ${label} (${drive.mountPoint}).`;
  info('swap', 'Swap activated', { file, bytes: active.sizeBytes || sizeBytes });
}

/* ----------------------------------------------------------------- remove */

async function removeSwap() {
  const record = readRecord();
  job.action = 'remove';
  if (!record) {
    job.mountPoint = null;
    job.file = null;
    job.sizeBytes = null;
    job.status = 'done';
    job.phase = 'done';
    job.message = 'Xenity has no swap file of its own to delete.';
    return;
  }

  // The stored path is exactly `<mount>/.xenity-swap`; never anything else.
  if (path.basename(record.file) !== SWAP_FILE_NAME || !path.isAbsolute(record.file)) {
    throw new Error('The recorded swap file path is not a Xenity swap file, so it was left alone.');
  }

  job.mountPoint = record.mountPoint ?? null;
  job.file = record.file;
  job.sizeBytes = record.sizeBytes ?? null;

  const active = activeSwaps().some((entry) => entry.file === record.file);
  const existed = fs.existsSync(record.file);
  if (active) {
    job.phase = 'deactivating';
    step('swapoff', [record.file], 'swapoff');
  }

  if (existed || active) {
    job.phase = 'deleting';
    step('rm', ['-f', record.file], 'Removing the swap file');
  }

  fs.rmSync(swapRecordFile(), { force: true });
  job.status = 'done';
  job.phase = 'done';
  job.percent = 100;
  job.message = active
    ? `Swap was turned off and ${record.file} was deleted.`
    : existed
      ? `${record.file} was deleted.`
      : `${record.file} was already gone, so Xenity only cleared its record.`;
  info('swap', 'Swap file removed', { file: record.file, wasActive: active });
}

/* ------------------------------------------------------------------ start */

function assertIdle() {
  if (job.status === 'running') {
    const conflict = new Error('Another swap operation is still running. Wait for it to finish.');
    conflict.status = 409;
    throw conflict;
  }
}

async function run(action, payload) {
  try {
    if (action === 'create') await createSwap(payload);
    else await removeSwap();
    job.finishedAt = new Date().toISOString();
  } catch (cause) {
    const text = cause?.message ?? String(cause);
    job.status = 'failed';
    job.phase = 'failed';
    job.error = text;
    job.finishedAt = new Date().toISOString();
    warn('swap', `Swap ${action} failed: ${text}`);
  }
}

function begin(action) {
  assertIdle();
  if (!swapTools().available) {
    const error = new Error(swapTools().detail);
    error.status = 400;
    throw error;
  }
  job = { ...emptyJob(), status: 'running', action, phase: 'checking', startedAt: new Date().toISOString() };
}

export function startSwap({ mountPoint }) {
  if (typeof mountPoint !== 'string' || !mountPoint.startsWith('/')) {
    const error = new Error('Pick a mounted drive to use as swap first.');
    error.status = 400;
    throw error;
  }
  begin('create');
  void run('create', { mountPoint });
  return swapStatus();
}

export function deleteManagedSwap() {
  begin('remove');
  void run('remove', null);
  return swapStatus();
}
