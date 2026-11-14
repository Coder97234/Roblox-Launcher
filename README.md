# XENITY

**Developer:** Xen · **Platform:** Arch Linux · **Category:** Roblox Linux launcher
**Tagline:** _Redefine Your Roblox Experience._

Xenity brings **Roblox Studio** to Linux. Roblox publishes Studio for Windows only, so Xenity
installs Roblox's own Studio installer and runs that build through [Wine](https://www.winehq.org/)
inside a prefix it owns. This repository contains the launcher shell — window layout, navigation,
dashboards, persistent configuration, system detection, logging and the launch pipeline — plus the
Wine prefix management that installs, detects and starts Studio. Xenity does **not** redistribute
Studio, patch it, or claim a launch it did not perform.

## Why this shape

The interface is React + TypeScript behind a small Node service. That split is deliberate:

- the shipped artifact is one **AppImage** that wraps exactly that: the compiled interface and the
  service in a single executable, the service bound to loopback and the window loading it from the
  same origin;
- every privileged operation — process checks, filesystem access, dependency probes — lives in
  `server/`, outside the renderer;
- running it in a browser during development keeps the project reviewable and testable end to end.

## Layout

```
src/                 launcher UI
  components/        shell, icon set, panels, fields, notices
  pages/             home, play, library, diagnostics, settings, about
  state/             system, launcher and notification providers
  styles/app.css     design system (dark charcoal, violet accents)
server/
  index.js           HTTP API
  modules/
    system_detection.js   distribution, kernel, CPU, GPU, RAM, session, Vulkan/OpenGL
    studio.js             Wine detection, Studio install/launch, prefix and doctor checks
    release.js            the built AppImage, served for download
    runtime_manager.js    Studio and Wine state as the launcher shows it
    installation.js       directories, dependency validation for Arch, Studio state
    launch.js             eight-step launch pipeline
    diagnostics.js        redacted reports
    settings.js           validated, persisted configuration
    places.js             place files you opened, favorites and history
    storage.js            usage reporting and Xenity-scoped cleanup
    updater.js            version and channel checks
    logging.js            structured log with rotation
    store.js              Xenity-owned storage paths and JSON helpers
```

## Run it

```bash
npm ci
npm run dev        # UI on http://localhost:3000
npm run dev:api    # backend on http://localhost:8000 (proxied at /api)
```

`XENITY_DATA_DIR` selects where Xenity keeps its configuration, library, logs and cache
(default `/data`). In development the Base44 environment mounts that as a named volume.

## Install the launcher

Xenity ships as a single AppImage:

```bash
npm run appimage              # builds release/Xenity-<version>-$(uname -m).AppImage
chmod +x Xenity-*.AppImage
./Xenity-*.AppImage
```

The build runs in a scratch copy (`.appimage/`) so the checkout is untouched, and takes a few
minutes: it builds the UI, installs Electron in that scratch directory (the AppImage's window and
its own Node runtime), and packages the AppDir with `appimagetool`. Pushing a `v*` tag runs
`.github/workflows/release.yml`, which builds the same file on CI and attaches it — with its
`.sha256` — to a GitHub release. The launcher's **About** page offers the locally built file for
download as well (`/api/release/appimage`).

The launcher and its service are the only things in the AppImage. Roblox Studio is not baked in:
Roblox's own installer runs under Wine on first use (below).

## Roblox Studio through Wine

Roblox ships Studio for Windows and macOS only. Xenity runs the **Windows Studio build** with Wine
inside a prefix it owns:

```
<Xenity data>/runtime/wineprefix            WINEPREFIX (win64)
.../drive_c/users/<user>/AppData/Local/Roblox/Versions/<version>/RobloxStudioBeta.exe
```

| Step | What Xenity actually does |
|---|---|
| Install | Downloads `https://setup.rbxcdn.com/RobloxStudioInstaller.exe` and runs it with `wine` |
| Prefix | Creates the prefix with `wineboot -u` before the installer runs |
| Detect | Scans the prefix for `RobloxStudioBeta.exe` and reads its version folder |
| Open | Starts `wine <RobloxStudioBeta.exe> [place]` and tracks the process |
| Doctor | Checks Wine, the prefix, the Studio build, the display session, the graphics driver and DXVK |

Requirements on Arch:

```bash
sudo pacman -S wine winetricks     # winetricks installs DXVK into the prefix
```

Roblox does not support Studio on Linux, and Xenity does not pretend it does: the 3D viewport depends
on your GPU driver and on DXVK, and Diagnostics reports what is missing instead of guessing. Studio's
files are Roblox's own and are fetched by Roblox's installer, never bundled here. Settings can point
Xenity at an existing prefix (`XENITY_WINE_PREFIX` or the Studio section) or a non-standard Wine
binary (`XENITY_WINE_BIN`).

## What is real, and what is not

Real: running Roblox's own Studio installer under Wine, creating and detecting the prefix and the
Studio build inside it, opening Studio (with or without a place file) and tracking the process, the
Wine/prefix/display/DXVK doctor checks, the single-file AppImage build (and its download from the
launcher), system and graphics detection, dependency validation with Arch package names, persistent
settings, place entries with favorites and launch history, structured logging, redacted diagnostic
reports, storage reporting, cache cleanup, update checks, and the launch pipeline that stops at the
first blocker with a what/why/next explanation.

Not implemented: bundling Roblox Studio or a DXVK build, per-place prefix overrides, automatic Studio
updates inside the prefix, account sign-in helpers, prefix sandboxing, deep-link launching from the
browser and automatic updates. The interface labels these as unavailable rather than faking them.

## Security posture

No anti-cheat bypass, no memory patching, no code injection, no modification of Roblox
binaries. Application bundles must come from sources you are authorised to use. Xenity never
runs privileged commands without explicit confirmation and never asks for root. Diagnostic
output is stripped of tokens, credentials and account identifiers before export.

## Roadmap

Runtime manager → APK validation → Android installation → graphics architecture → input
translation → window management → networking/storage → compatibility engine → crash management
→ launcher integration → testing and optimisation.
