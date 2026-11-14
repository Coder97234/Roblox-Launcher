import { detectSystem } from './system_detection.js';
import { ENGINE_NAME, getEngineStatus, INSTALL_HINT } from './cordial.js';


/**
 * Runtime manager.
 *
 * There is exactly one backend in this build: Cordial, which runs Roblox's
 * official Android build natively on Linux. Xenity drives it through the
 * interfaces it publishes (`--profile … --play`, `--doctor`, `--diagnostics`)
 * and reads its build store. Nothing here patches Roblox or claims a launch
 * that did not happen.
 *
 * The state names say what is actually missing:
 *   engine-missing    Cordial is not installed on this machine.
 *   build-missing     Cordial is installed and its store holds no Roblox build.
 *   build-unverified  It holds builds, none of which Cordial would launch.
 *   ready             A verified build is in the store and a launch will run.
 */

function stateOf(engine) {
  if (!engine.present) return 'engine-missing';
  if (engine.runnable) return 'ready';
  return engine.store.builds.length ? 'build-unverified' : 'build-missing';
}

function explain(engine, state) {
  const version = engine.version ? `${ENGINE_NAME} ${engine.version}` : ENGINE_NAME;
  if (state === 'engine-missing') {
    return {
      reason: `${ENGINE_NAME} is the engine backend Xenity drives, and it is not installed on this machine.`,
      next: `Press Install on this page: Xenity downloads the official Cordial release into its own data directory. An existing install is used too (${INSTALL_HINT}).`,
    };
  }
  if (state === 'build-missing') {
    return {
      reason: `${version} is installed, but its build store holds no Roblox build yet.`,
      next: 'Open Cordial once and press its Download Roblox button. Xenity then launches through the build Cordial keeps — it never downloads or repackages Roblox itself.',
    };
  }
  if (state === 'build-unverified') {
    const count = engine.store.builds.length;
    return {
      reason: `${version} holds ${count} build${count === 1 ? '' : 's'} in ${engine.store.root}, but none is verified as launchable.`,
      next: 'A build must hold its own base.apk and a recorded signer before Cordial will run it. Open Cordial and let it finish or re-download the build.',
    };
  }
  return {
    reason: `${version} will run Roblox ${engine.build?.version ?? 'from its store'} from ${engine.store.root}.`,
    next: 'Press Play. Xenity starts Cordial with its own profile so a launcher you already have open is left alone.',
  };
}

function backendDetail(engine, state) {
  if (!engine.present) return `${ENGINE_NAME} was not found in PATH, as an XENITY_CORDIAL_BIN override, or as a Flatpak.`;
  const where = engine.command ?? ENGINE_NAME;
  if (state === 'ready') {
    return `${where} · Roblox ${engine.build?.version ?? 'unknown'} · ${engine.store.root}`;
  }
  if (state === 'build-unverified') {
    return `${where} · ${engine.store.builds.length} unverified build(s) in ${engine.store.root}`;
  }
  return `${where} · no Roblox build in its store`;
}

export function getRuntimeStatus() {
  const engine = getEngineStatus();
  const system = detectSystem();
  const state = stateOf(engine);
  const available = state === 'ready';
  const { reason, next } = explain(engine, state);

  return {
    implemented: true,
    available,
    present: engine.present,
    state,
    backend: 'cordial',
    backendName: ENGINE_NAME,
    backends: [
      {
        id: 'cordial',
        name: ENGINE_NAME,
        description:
          "Loads Roblox's official Android build in process through a ported bionic linker. Xenity drives it and reads its build store; it never patches the engine.",
        present: engine.present,
        running: engine.instances > 0,
        detail: backendDetail(engine, state),
        selectable: available,
      },
    ],
    engine,
    reason,
    next,
    graphics: system.graphics.backend,
    checkedAt: new Date().toISOString(),
  };
}
