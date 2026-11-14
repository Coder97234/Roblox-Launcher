import fs from 'node:fs';
import path from 'node:path';
import { exists, xenityPaths } from './store.js';
import { which } from './system_detection.js';
import { getEngineStatus, INSTALL_HINT } from './cordial.js';

/**
 * Dependency validation for Arch Linux. Every entry maps a binary Xenity wants
 * to the official Arch package that provides it, so a missing dependency can be
 * explained with the exact command the user needs instead of a bare code.
 *
 * The engine itself (Cordial) is not a plain binary dependency: it is a native
 * package or a Flatpak, so its presence is decided by cordial.js and reported
 * separately as `installation.engine`.
 */
const DEPENDENCIES = [
  {
    binary: 'cordial-shell',
    package: 'cordial-bin',
    purpose: 'Engine backend: runs the Roblox Android build natively (a Flatpak install counts too).',
    required: false,
    repo: 'aur',
    installCommand: INSTALL_HINT,
  },
  {
    binary: 'flatpak',
    package: 'flatpak',
    purpose: 'The usual way Cordial is installed, and where its build store lives when it is.',
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
    purpose: 'Report OpenGL renderer details when Vulkan is unavailable.',
    required: false,
    repo: 'extra',
  },
  {
    binary: 'adb',
    package: 'android-tools',
    purpose: 'Only needed for Cordial’s Quest import path, not for an ordinary launch.',
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

export function checkDependencies() {
  const checks = DEPENDENCIES.map((dependency) => {
    const found = which(dependency.binary);
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

/** Files in the Xenity-owned application directory, classified by APK split name. */
export function listApplicationFiles() {
  const dir = xenityPaths().applications;
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.apk'));
  } catch {
    names = [];
  }
  const base = names.find((name) => /^base(-\d+)?\.apk$/i.test(name)) || null;
  const splits = names.filter((name) => name !== base);
  return {
    directory: dir,
    baseApk: base,
    splits,
    files: names,
    present: Boolean(base),
    note: 'Split names are reported as packaged. Xenity does not yet validate manifests or signatures in this build.',
  };
}

export function installationState() {
  const paths = xenityPaths();
  const tracked = [
    { label: 'Runtime directory', path: paths.runtime, exists: exists(paths.runtime) },
    { label: 'Applications directory', path: paths.applications, exists: exists(paths.applications) },
    { label: 'Cache directory', path: paths.cache, exists: exists(paths.cache) },
    { label: 'Logs directory', path: paths.logs, exists: exists(paths.logs) },
    { label: 'Configuration directory', path: paths.config, exists: exists(paths.config) },
  ];
  const applications = listApplicationFiles();
  const dependencies = checkDependencies();
  const engineStatus = getEngineStatus();
  const engine = {
    name: engineStatus.engine,
    present: engineStatus.present,
    version: engineStatus.version,
    command: engineStatus.command,
    kind: engineStatus.kind,
    runnable: engineStatus.runnable,
    store: engineStatus.store.root,
    build: engineStatus.build
      ? { version: engineStatus.build.version, path: engineStatus.build.dir }
      : null,
  };
  const status = !dependencies.ok
    ? 'missing-dependencies'
    : !engine.present
      ? 'engine-missing'
      : !engine.runnable
        ? 'build-missing'
        : 'ready';
  const summary =
    status === 'missing-dependencies'
      ? `${dependencies.missingRequired.length} required dependenc${dependencies.missingRequired.length === 1 ? 'y is' : 'ies are'} missing.`
      : status === 'engine-missing'
        ? 'Cordial, the engine backend Xenity drives, is not installed.'
        : status === 'build-missing'
          ? `Cordial ${engine.version ?? ''} is installed, but it holds no verified Roblox build yet.`.replace('  ', ' ')
          : `Cordial ${engine.version ?? ''} will run Roblox ${engine.build?.version ?? 'from its store'}.`.replace('  ', ' ');

  return {
    root: paths.root,
    directories: tracked,
    configFile: path.join(paths.config, 'settings.json'),
    directoriesOk: tracked.every((entry) => entry.exists || entry.path === paths.runtime),
    applications,
    dependencies,
    engine,
    verified: dependencies.ok && engine.runnable,
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
