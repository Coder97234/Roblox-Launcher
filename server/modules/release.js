import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AppImage release artifacts.
 *
 * `npm run appimage` (and the release workflow) writes Xenity-<version>-<arch>.AppImage
 * into release/. When that file exists next to this checkout the launcher offers it
 * for download itself; otherwise it points at the repository's GitHub releases.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = process.env.XENITY_RELEASE_DIR || path.resolve(here, '../../release');
const REPOSITORY = 'https://github.com/Coder97234/Roblox-Launcher';

export const RELEASES_PAGE = `${REPOSITORY}/releases`;

function candidates() {
  try {
    return fs
      .readdirSync(RELEASE_DIR)
      .filter((name) => name.endsWith('.AppImage'))
      .map((name) => {
        const file = path.join(RELEASE_DIR, name);
        const stat = fs.statSync(file);
        return { name, file, size: stat.size, builtAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.builtAt).getTime() - new Date(a.builtAt).getTime());
  } catch {
    return [];
  }
}

export function appImageStatus() {
  const builds = candidates();
  const newest = builds[0] ?? null;
  return {
    available: Boolean(newest),
    file: newest?.name ?? null,
    size: newest?.size ?? null,
    builtAt: newest?.builtAt ?? null,
    directory: RELEASE_DIR,
    releases: RELEASES_PAGE,
    latest: `${RELEASES_PAGE}/latest`,
    buildCommand: 'npm run appimage',
    reason: newest
      ? null
      : `No AppImage has been built in ${RELEASE_DIR} yet; the repository's release workflow publishes one when a version tag is pushed.`,
  };
}

/** The newest local AppImage, or null when nothing has been built here. */
export function appImageFile() {
  return candidates()[0] ?? null;
}
