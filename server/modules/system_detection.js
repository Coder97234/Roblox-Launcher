import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Run a read-only probe. Returns { available, output } and never throws, so a
 * missing tool degrades to "unknown" instead of breaking the diagnostics page.
 */
export function probe(command, args = [], timeout = 2500) {
  try {
    const output = execFileSync(command, args, {
      timeout,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .slice(0, 40)
      .join('\n');
    return { available: true, output };
  } catch {
    return { available: false, output: null };
  }
}

export function which(binary) {
  try {
    const found = execFileSync('sh', ['-c', `command -v ${JSON.stringify(binary)} 2>/dev/null`], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    return found || null;
  } catch {
    return null;
  }
}

function readOsRelease() {
  try {
    const raw = fs.readFileSync('/etc/os-release', 'utf8');
    const data = {};
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
      if (match) data[match[1]] = match[2];
    }
    return data;
  } catch {
    return {};
  }
}

function readCpuModel() {
  try {
    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const model = cpuinfo.match(/^model name\s*:\s*(.+)$/m);
    if (model) return model[1].trim();
  } catch {
    // Fall through to os.cpus().
  }
  return os.cpus()[0]?.model?.trim() || 'Unknown CPU';
}

const PCI_VENDORS = {
  '0x10de': 'NVIDIA',
  '0x1002': 'AMD',
  '0x8086': 'Intel',
  '0x1af4': 'Red Hat (virtio)',
  '0x15ad': 'VMware',
  '0x1234': 'QEMU',
};

function detectGpus() {
  const gpus = [];
  let cards = [];
  try {
    cards = fs.readdirSync('/sys/class/drm').filter((name) => /^card\d+$/.test(name));
  } catch {
    cards = [];
  }
  for (const card of cards) {
    const base = `/sys/class/drm/${card}/device`;
    try {
      const vendor = fs.readFileSync(`${base}/vendor`, 'utf8').trim().toLowerCase();
      const device = fs.readFileSync(`${base}/device`, 'utf8').trim();
      const driver = (() => {
        try {
          return fs.readlinkSync(`${base}/driver`).split('/').pop();
        } catch {
          return null;
        }
      })();
      gpus.push({
        card,
        vendor: PCI_VENDORS[vendor] || vendor,
        deviceId: device,
        driver,
      });
    } catch {
      gpus.push({ card, vendor: 'Unknown', deviceId: null, driver: null });
    }
  }
  const renderNodes = (() => {
    try {
      return fs.readdirSync('/dev/dri').filter((name) => name.startsWith('renderD'));
    } catch {
      return [];
    }
  })();
  return { gpus, renderNodes };
}

function sessionType() {
  const env = process.env;
  if (env.XDG_SESSION_TYPE) return env.XDG_SESSION_TYPE;
  if (env.WAYLAND_DISPLAY) return 'wayland';
  if (env.DISPLAY) return 'x11';
  return 'none';
}

function vulkanStatus() {
  const vulkaninfo = which('vulkaninfo');
  if (vulkaninfo) {
    const summary = probe('vulkaninfo', ['--summary']);
    if (summary.available) {
      const device = summary.output.match(/deviceName\s*=\s*(.+)/)?.[1]?.trim() || 'unknown device';
      const version = summary.output.match(/apiVersion\s*=\s*(.+)/)?.[1]?.trim() || null;
      return { available: true, device, apiVersion: version, detail: 'vulkaninfo --summary' };
    }
  }
  const libraries = probe('sh', ['-c', 'ldconfig -p 2>/dev/null | grep -c libvulkan']);
  const loaderPresent = libraries.available && Number(libraries.output) > 0;
  return {
    available: false,
    device: null,
    apiVersion: null,
    detail: loaderPresent
      ? 'Vulkan loader library found, but vulkaninfo is not installed so devices cannot be enumerated.'
      : 'No Vulkan loader or vulkaninfo found in this environment.',
  };
}

function openglStatus() {
  const glxinfo = which('glxinfo');
  if (!glxinfo) {
    return { available: false, renderer: null, detail: 'glxinfo is not installed.' };
  }
  const result = probe('glxinfo', ['-B']);
  const renderer = result.output?.match(/OpenGL renderer string:\s*(.+)/)?.[1]?.trim() || null;
  const version = result.output?.match(/OpenGL version string:\s*(.+)/)?.[1]?.trim() || null;
  return { available: Boolean(renderer), renderer, version, detail: 'glxinfo -B' };
}

/** Full, honest snapshot of what this machine actually provides. */
export function detectSystem() {
  const osRelease = readOsRelease();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const { gpus, renderNodes } = detectGpus();
  const vulkan = vulkanStatus();
  const opengl = openglStatus();
  const isArch = ['arch', 'archarm', 'manjaro', 'endeavouros'].includes(
    (osRelease.ID || '').toLowerCase(),
  );

  return {
    detectedAt: new Date().toISOString(),
    distribution: {
      name: osRelease.PRETTY_NAME || osRelease.NAME || 'Unknown distribution',
      id: osRelease.ID || 'unknown',
      version: osRelease.VERSION_ID || null,
      target: 'Arch Linux',
      matchesTarget: isArch,
    },
    kernel: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    cpu: {
      model: readCpuModel(),
      cores: os.cpus().length,
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    gpu: {
      devices: gpus,
      renderNodes,
      status: gpus.length ? 'detected' : 'not-detected',
    },
    graphics: {
      sessionType: sessionType(),
      vulkan,
      opengl,
      backend:
        vulkan.available
          ? 'Vulkan'
          : opengl.available
            ? 'OpenGL'
            : 'none available in this environment',
    },
    desktopSession: {
      type: sessionType(),
      available: sessionType() !== 'none',
    },
  };
}
