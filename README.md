# XENITY

**Developer:** Xen · **Platform:** Arch Linux · **Category:** Roblox Linux launcher
**Tagline:** _Redefine Your Roblox Experience._

Xenity is a Linux desktop Roblox launcher. This repository contains the launcher shell — window
layout, navigation, dashboards, persistent configuration, system detection, logging and the launch
pipeline — wired to the [Cordial](https://github.com/luohoa97/cordial) engine, which runs Roblox's
official Android build natively on Linux. Xenity has **no Roblox runtime of its own**, so it never
claims a launch it did not perform.

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
    engine_manager.js     installs and updates the Cordial engine from its official release
    cordial.js            drives the engine: detection, build store, launch, doctor
    release.js            the built AppImage, served for download
    runtime_manager.js    engine state as the launcher shows it
    installation.js       directories, dependency validation for Arch, engine state
    launch.js             eight-step launch pipeline
    diagnostics.js        redacted reports
    settings.js           validated, persisted configuration
    library.js            experiences and launch history
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

The launcher and its service are the only things in the AppImage. Roblox and the engine are not
baked in; both arrive on first run (below).

## The engine backend

Xenity does not implement an Android runtime. It drives [Cordial](https://github.com/luohoa97/cordial),
which loads Roblox's official Android build in process natively on Linux, through the command line
that project publishes:

| Cordial | Xenity uses it for |
|---|---|
| `cordial-shell --help` | reading the engine version |
| `cordial-shell --diagnostics` | which Cordial and Roblox build this machine has |
| `cordial-shell --doctor --offline` | the machine checks behind the Diagnostics button |
| `cordial-shell --profile P --play [--place-id N]` | starting Roblox, with no launcher window |
| `cordial-shell` | opening Cordial itself, whose **Download Roblox** button fetches a build |

Xenity only ever reads Cordial's build store (`$XDG_DATA_HOME/cordial/builds`, or the Flatpak's own
`~/.var/app/io.github.luohoa97.Cordial/data/cordial/builds`); Cordial owns its builds and performs the
download and signature check. `XENITY_CORDIAL_BIN` points Xenity at a non-standard binary and
`XENITY_CORDIAL_STORE` at a non-standard store. Cordial is **GPL-3.0-or-later**, so Xenity is too.

### The engine ships with the launcher

You do not have to install Cordial first. `server/modules/engine_manager.js` resolves the newest
official release from the project's GitHub releases, picks the AppImage for this architecture,
streams it into `<Xenity data>/runtime/engine/cordial.AppImage`, marks it executable and probes it.
That copy is the engine Xenity launches (`managed` in `/api/engine`), and the Play page installs,
reinstalls or removes it. A system Cordial (PATH, Flatpak or `XENITY_CORDIAL_BIN`) is still used when
Xenity has not installed its own. Nothing is patched or repackaged, and Roblox itself is still
downloaded by Cordial, not by Xenity.

On a machine without FUSE the AppImage is started with `--appimage-extract-and-run` automatically.

## What is real, and what is not

Real: downloading and managing the Cordial engine from its official release, the single-file
AppImage build (and its download from the launcher), system and graphics detection, engine detection
and launch through Cordial, Cordial's own doctor and diagnostic report, dependency validation with
Arch package names, persistent settings,
library and launch history, structured logging, redacted diagnostic reports, storage reporting,
cache cleanup, update checks, and the launch pipeline that stops at the first blocker with a
what/why/next explanation.

Not implemented: APK manifest/signature inspection inside Xenity (Cordial verifies what it keeps),
Xenity-side graphics and input configuration, deep-link launching from the browser and automatic
updates. The interface labels these as unavailable rather than faking them.

## Security posture

No anti-cheat bypass, no memory patching, no code injection, no modification of Roblox
binaries. Application bundles must come from sources you are authorised to use. Xenity never
runs privileged commands without explicit confirmation and never asks for root. Diagnostic
output is stripped of tokens, credentials and account identifiers before export.

## Roadmap

Runtime manager → APK validation → Android installation → graphics architecture → input
translation → window management → networking/storage → compatibility engine → crash management
→ launcher integration → testing and optimisation.
