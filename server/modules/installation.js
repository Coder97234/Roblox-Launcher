import fs from 'node:fs';
import path from 'node:path';
import { exists, xenityPaths } from './store.js';
import { which } from './system_detection.js';

/**
 * Dependency validation for Arch Linux. Every entry maps a binary Xenity wants
 * to the official Arch package that provides it, so a missing dependency can be
 * explained with the exact command the user needs instead of a bare code.
 */
const DEPENDENCIES = [
  {
    binary: 'waydroid',
    package: 'waydroid',
    purpose: 'Android runtime backend used to execute the Roblox Android application.',
    required: true,
    repo: 'extra',
  },
  {
    binary: 'unzip',
    package: 'unzip',
    purpose: 'Expand application bundles during installation and validation.',
    required: true,
    repo: 'core',
  },
  {
    binary: 'curl',
    package: 'curl',
    purpose: 'Connectivity checks and update metadata retrieval.',
    required: true,
    repo: 'core',
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
    purpose: 'Inspect the Android runtime and installed packages.',
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
      installCommand: `sudo pacman -S ${dependency.package}`,
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

  return {
    root: paths.root,
    directories: tracked,
    configFile: path.join(paths.config, 'settings.json'),
    directoriesOk: tracked.every((entry) => entry.exists || entry.path === paths.runtime),
    applications,
    dependencies,
    verified: dependencies.ok && applications.present,
    status: !dependencies.ok
      ? 'missing-dependencies'
      : !applications.present
        ? 'application-missing'
        : 'ready',
    summary: !dependencies.ok
      ? `${dependencies.missingRequired.length} required dependenc${dependencies.missingRequired.length === 1 ? 'y is' : 'ies are'} missing.`
      : !applications.present
        ? 'Dependencies are satisfied, but no Roblox application bundle has been added yet.'
        : 'Dependencies and application bundle look complete.',
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
