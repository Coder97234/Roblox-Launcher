import path from 'node:path';
import { readJson, writeJson, xenityPaths } from './store.js';
import { info, warn } from './logging.js';

const THEMES = ['xenity-dark', 'charcoal', 'midnight'];
const LANGUAGES = ['en', 'de', 'fr', 'es', 'pt-BR'];
const BACKENDS = ['auto', 'vulkan', 'opengl'];
const RENDERERS = ['auto', 'vulkan', 'opengl'];
const CHANNELS = ['stable', 'beta', 'nightly'];
const RESOLUTIONS = ['auto', 'native', '1600x900', '1920x1080', '2560x1440'];
const FPS_CAPS = ['auto', '30', '60', '120', '144', 'unlimited'];

export const DEFAULT_SETTINGS = {
  general: {
    launchOnStartup: false,
    minimizeToTray: true,
    language: 'en',
    theme: 'xenity-dark',
    notifications: true,
  },
  graphics: {
    backend: 'auto',
    vsync: true,
    resolution: 'auto',
    fpsCap: 'auto',
  },
  studio: {
    // Blank means Xenity's own prefix: <Xenity data>/runtime/wineprefix.
    prefixPath: '',
    renderer: 'auto',
    dxvk: true,
    autoValidate: true,
  },
  storage: {
    installationDirectory: '/data/applications',
    cacheDirectory: '/data/cache',
  },
  updates: {
    channel: 'stable',
    checkOnStartup: true,
  },
};

function settingsFile() {
  return path.join(xenityPaths().config, 'settings.json');
}

function clampChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/** Merge and validate an incoming settings patch against the defaults. */
function sanitize(patch, base) {
  const next = structuredClone(base);
  if (patch.general) {
    const g = patch.general;
    if (typeof g.launchOnStartup === 'boolean') next.general.launchOnStartup = g.launchOnStartup;
    if (typeof g.minimizeToTray === 'boolean') next.general.minimizeToTray = g.minimizeToTray;
    if (typeof g.notifications === 'boolean') next.general.notifications = g.notifications;
    if (typeof g.language === 'string')
      next.general.language = clampChoice(g.language, LANGUAGES, next.general.language);
    if (typeof g.theme === 'string')
      next.general.theme = clampChoice(g.theme, THEMES, next.general.theme);
  }
  if (patch.graphics) {
    const g = patch.graphics;
    if (typeof g.backend === 'string')
      next.graphics.backend = clampChoice(g.backend, BACKENDS, next.graphics.backend);
    if (typeof g.vsync === 'boolean') next.graphics.vsync = g.vsync;
    if (typeof g.resolution === 'string')
      next.graphics.resolution = clampChoice(g.resolution, RESOLUTIONS, next.graphics.resolution);
    if (typeof g.fpsCap === 'string')
      next.graphics.fpsCap = clampChoice(g.fpsCap, FPS_CAPS, next.graphics.fpsCap);
  }
  if (patch.studio) {
    const s = patch.studio;
    if (typeof s.prefixPath === 'string') {
      const value = s.prefixPath.trim().slice(0, 200);
      // Empty means the Xenity-owned prefix; anything else must be absolute.
      if (!value || value.startsWith('/')) next.studio.prefixPath = value;
    }
    if (typeof s.renderer === 'string')
      next.studio.renderer = clampChoice(s.renderer, RENDERERS, next.studio.renderer);
    if (typeof s.dxvk === 'boolean') next.studio.dxvk = s.dxvk;
    if (typeof s.autoValidate === 'boolean') next.studio.autoValidate = s.autoValidate;
  }
  if (patch.storage) {
    const s = patch.storage;
    if (typeof s.installationDirectory === 'string' && s.installationDirectory.startsWith('/'))
      next.storage.installationDirectory = s.installationDirectory.slice(0, 200);
    if (typeof s.cacheDirectory === 'string' && s.cacheDirectory.startsWith('/'))
      next.storage.cacheDirectory = s.cacheDirectory.slice(0, 200);
  }
  if (patch.updates) {
    const u = patch.updates;
    if (typeof u.channel === 'string')
      next.updates.channel = clampChoice(u.channel, CHANNELS, next.updates.channel);
    if (typeof u.checkOnStartup === 'boolean') next.updates.checkOnStartup = u.checkOnStartup;
  }
  return next;
}

export function getSettings() {
  const stored = readJson(settingsFile(), {});
  return sanitize(stored, structuredClone(DEFAULT_SETTINGS));
}

export function updateSettings(patch) {
  const next = sanitize(patch, getSettings());
  writeJson(settingsFile(), next);
  info('settings', 'Configuration saved', { sections: Object.keys(patch || {}) });
  return next;
}

export function resetSettings() {
  const fresh = structuredClone(DEFAULT_SETTINGS);
  writeJson(settingsFile(), fresh);
  warn('settings', 'Configuration reset to defaults');
  return fresh;
}

export function settingsFilePath() {
  return settingsFile();
}
