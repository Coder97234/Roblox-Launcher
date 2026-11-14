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

- the UI is the same interface a **Tauri** window loads on Arch Linux (WebKitGTK, small native
  binary, no bundled browser), so the desktop shell can be added without rewriting screens;
- every privileged operation — process checks, filesystem access, dependency probes — lives in
  `server/`, outside the renderer;
- running it in a browser today keeps the project reviewable and testable end to end.

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
    cordial.js            drives the engine: detection, build store, launch, doctor
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

## What is real, and what is not

Real: system and graphics detection, engine detection and launch through Cordial, Cordial's own
doctor and diagnostic report, dependency validation with Arch package names, persistent settings,
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
