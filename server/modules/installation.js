import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { exists, xenityPaths } from './store.js';
import { which } from './system_detection.js';
import { getStudioStatus, WINE_INSTALL_HINT } from './studio.js';
import { buildPrivileged, firstLine, PRIVILEGE_HINT, privilegeTool } from './privilege.js';
import { info, warn } from './logging.js';

/**
 * Dependency validation for Arch Linux. Every entry maps a binary Xenity wants
 * to the official Arch package that provides it, so a missing dependency can be
 * explained with the exact command the user needs instead of a bare code.
 *
 * Wine is the one required entry: without it the Windows Studio build has
 * nothing to run on. The rest refine the picture (DXVK helper, Vulkan tools,
 * GPU queries) and are reported as optional.
 */
const DEPENDENCIES = [
  {
    binary: 'wine',
    package: 'wine',
    purpose: 'Compatibility layer that runs Roblox’s Windows Studio build.',
    required: true,
    repo: 'multilib',
    installCommand: WINE_INSTALL_HINT,
  },
  {
    binary: 'winetricks',
    package: 'winetricks',
    purpose: 'Installs DXVK into the prefix, which Studio’s 3D viewport needs on Vulkan.',
    required: false,
    repo: 'multilib',
  },
  {
    binary: 'cabextract',
    package: 'cabextract',
    purpose: 'Some winetricks verbs unpack Windows cabinets with it.',
    required: false,
    repo: 'extra',
  },
  {
    binary: 'vulkaninfo',
    package: 'vulkan-tools',
    purpose: 'Enumerate Vulkan devices and driver versions for diagnostics.',
    required: false,
    repo: 'extra',
  },
  {
    binary: 'glxinfo',
    package: 'mesa-utils',
    purpose: 'Report the OpenGL renderer Wine falls back to.',
    required: false,
    repo: 'extra',
  },
  {
    binary: 'lspci',
    package: 'pciutils',
    purpose: 'Identify the GPU and its kernel driver.',
    required: false,
    repo: 'base',
  },
];

const PLACE_EXTENSION = /\.(rbxl|rbxlx)$/i;

export function checkDependencies() {
  // Wine usually lands as /usr/bin/wine, but a wine64-only package is found too.
  const checks = DEPENDENCIES.map((dependency) => {
    const found =
      which(dependency.binary) ||
      (dependency.binary === 'wine' ? which('wine64') : null);
    return {
      ...dependency,
      present: Boolean(found),
      path: found || null,
      installCommand: dependency.installCommand ?? `sudo pacman -S ${dependency.package}`,
    };
  });
  const missingRequired = checks.filter((check) => check.required && !check.present);
  return {
    checks,
    missingRequired,
    ok: missingRequired.length === 0,
    checkedAt: new Date().toISOString(),
  };
}

/** Place files Xenity has been pointed at, read from its own directory. */
export function listPlaceFiles() {
  const dir = xenityPaths().applications;
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => PLACE_EXTENSION.test(name));
  } catch {
    names = [];
  }
  return {
    directory: dir,
    files: names,
    count: names.length,
    note: 'Xenity lists place files in its own directory. Places added by path are listed on the Places page.',
  };
}

export function installationState() {
  const paths = xenityPaths();
  const studioStatus = getStudioStatus();
  // The Wine prefix is reported, not required: it only exists once Studio has
  // been installed, and a missing prefix must never read as a broken install.
  const tracked = [
    { label: 'Runtime directory', path: paths.runtime, exists: exists(paths.runtime) },
    {
      label: 'Wine prefix',
      path: studioStatus.prefix.path,
      exists: exists(studioStatus.prefix.path),
      optional: true,
    },
    { label: 'Places directory', path: paths.applications, exists: exists(paths.applications) },
    { label: 'Cache directory', path: paths.cache, exists: exists(paths.cache) },
    { label: 'Logs directory', path: paths.logs, exists: exists(paths.logs) },
    { label: 'Configuration directory', path: paths.config, exists: exists(paths.config) },
  ];
  const places = listPlaceFiles();
  const dependencies = checkDependencies();
  const studio = {
    name: studioStatus.name,
    present: studioStatus.studio.installed,
    version: studioStatus.studio.version,
    exe: studioStatus.studio.exe,
    prefix: studioStatus.prefix.path,
    prefixReady: studioStatus.prefix.initialized,
    wine: studioStatus.wine.version,
    running: studioStatus.instances,
  };
  const status = !dependencies.ok
    ? 'missing-dependencies'
    : !studio.present
      ? 'studio-missing'
      : 'ready';
  const summary =
    status === 'missing-dependencies'
      ? `${dependencies.missingRequired.length} required dependenc${dependencies.missingRequired.length === 1 ? 'y is' : 'ies are'} missing.`
      : status === 'studio-missing'
        ? studio.wine
          ? 'Wine is installed, but no Roblox Studio build exists in the prefix yet.'
          : 'Wine is not installed, so Roblox Studio cannot run yet.'
        : `Roblox Studio ${studio.version ?? ''} is installed in ${studio.prefix}.`.replace('  ', ' ');

  return {
    root: paths.root,
    directories: tracked,
    configFile: path.join(paths.config, 'settings.json'),
    directoriesOk: tracked
      .filter((entry) => !entry.optional)
      .every((entry) => entry.exists || entry.path === paths.runtime),
    places,
    dependencies,
    studio,
    verified: dependencies.ok && studio.present,
    status,
    summary,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Repair only touches Xenity-owned directories. Nothing outside the Xenity data
 * root is ever created or removed.
 */
export function repairInstallation() {
  const paths = xenityPaths();
  const created = [];
  for (const dir of [paths.runtime, paths.applications, paths.shaders, paths.cache, paths.logs]) {
    if (!exists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  return {
    created,
    message: created.length
      ? `Recreated ${created.length} missing Xenity director${created.length === 1 ? 'y' : 'ies'}.`
      : 'All Xenity directories were already present.',
  };
}

/* ------------------------------------------------------- dependency install */

const installJob = {
  status: 'idle',
  phase: 'idle',
  packages: [],
  command: null,
  lines: [],
  error: null,
  message: null,
  startedAt: null,
  finishedAt: null,
};

function pushLine(text) {
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    installJob.lines.push(trimmed.slice(0, 240));
  }
  while (installJob.lines.length > 120) installJob.lines.shift();
}

export function dependencyInstallStatus() {
  return {
    job: structuredClone(installJob),
    dependencies: checkDependencies(),
    privilege: privilegeTool(),
  };
}

/** Every package Xenity wants, deduplicated, in dependency order. */
function missingPackages(checks) {
  return [...new Set(checks.checks.filter((check) => !check.present).map((check) => check.package))];
}

/**
 * Install every missing package in one pacman run, through pkexec or sudo -n.
 * Output is streamed into the job so the panel can show what pacman is doing.
 */
export async function startDependencyInstall() {
  if (installJob.status === 'running') {
    const conflict = new Error('A dependency install is already running.');
    conflict.status = 409;
    throw conflict;
  }

  const checks = checkDependencies();
  const packages = missingPackages(checks);
  installJob.status = 'running';
  installJob.phase = 'checking';
  installJob.packages = packages;
  installJob.command = null;
  installJob.lines = [];
  installJob.error = null;
  installJob.message = null;
  installJob.startedAt = new Date().toISOString();
  installJob.finishedAt = null;

  if (packages.length === 0) {
    installJob.status = 'done';
    installJob.phase = 'done';
    installJob.finishedAt = new Date().toISOString();
    installJob.message = 'Every Xenity dependency is already installed.';
    return dependencyInstallStatus();
  }

  const pacman = which('pacman');
  const privilege = privilegeTool();
  if (!pacman) {
    installJob.status = 'failed';
    installJob.phase = 'failed';
    installJob.error = `Xenity installs its dependencies with pacman on Arch Linux, and this machine has no pacman. Install these packages with your distribution’s package manager: ${packages.join(' ')}.`;
    installJob.finishedAt = new Date().toISOString();
    return dependencyInstallStatus();
  }
  if (!privilege.available) {
    installJob.status = 'failed';
    installJob.phase = 'failed';
    installJob.error = `Nothing on this machine can ask for root (pkexec or sudo), so pacman cannot run. ${PRIVILEGE_HINT}`;
    installJob.finishedAt = new Date().toISOString();
    return dependencyInstallStatus();
  }

  const command = `pacman -Sy --needed --noconfirm ${packages.join(' ')}`;
  installJob.command = command;
  installJob.phase = 'installing';
  info('installation', 'Installing dependencies', { packages, privilege: privilege.label });

  void (async () => {
    try {
      const { file, args } = buildPrivileged('pacman', ['-Sy', '--needed', '--noconfirm', ...packages]);
      const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      pushLine(`$ ${command}`);
      child.stdout?.on('data', (chunk) => pushLine(chunk));
      child.stderr?.on('data', (chunk) => pushLine(chunk));
      const code = await new Promise((resolve) => {
        child.on('error', (cause) => {
          pushLine(cause?.message ?? String(cause));
          resolve(-1);
        });
        child.on('exit', (exitCode) => resolve(exitCode ?? -1));
      });

      const recheck = checkDependencies();
      const stillMissing = missingPackages(recheck);
      if (code === 0 && stillMissing.length === 0) {
        installJob.status = 'done';
        installJob.phase = 'done';
        installJob.message = `${packages.length} package${packages.length === 1 ? '' : 's'} installed: ${packages.join(', ')}.`;
        info('installation', installJob.message);
      } else {
        installJob.status = 'failed';
        installJob.phase = 'failed';
        installJob.error =
          code !== 0
            ? `pacman exited with code ${code}: ${firstLine(installJob.lines.slice().reverse().join('\n')) || 'no output'}`
            : `pacman finished, but these binaries are still missing: ${stillMissing.join(', ')}.`;
        warn('installation', installJob.error);
      }
    } catch (cause) {
      installJob.status = 'failed';
      installJob.phase = 'failed';
      installJob.error = cause?.message ?? String(cause);
      warn('installation', `Dependency install failed: ${installJob.error}`);
    } finally {
      installJob.finishedAt = new Date().toISOString();
    }
  })();

  return dependencyInstallStatus();
}

/** Legacy export names kept for callers that only need the file listing. */
export const listApplicationFiles = listPlaceFiles;
