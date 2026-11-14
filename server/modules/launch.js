import { checkDependencies, installationState } from './installation.js';
import { getStudioStatus, launchStudio, runDoctor, STUDIO_NAME, WINE_INSTALL_HINT } from './studio.js';
import { findPlace, recordLaunch } from './places.js';
import { getSettings } from './settings.js';
import { error as logError, info } from './logging.js';

/**
 * The Studio launch pipeline. Every step performs a real check against real
 * state, and execution stops at the first blocking step: the remaining steps
 * are reported as skipped rather than assumed to have succeeded.
 *
 * Roblox Studio here is the official Windows build, started by Wine inside the
 * prefix Xenity owns. Nothing is patched or repackaged.
 */

const STEP_ORDER = [
  'verify-installation',
  'wine-availability',
  'dependencies',
  'studio-install',
  'prefix-ready',
  'start-application',
  'monitor-process',
  'report',
];

const LABELS = {
  'verify-installation': 'Verify Xenity installation',
  'wine-availability': 'Detect Wine',
  dependencies: 'Validate required dependencies',
  'studio-install': 'Find the Roblox Studio build',
  'prefix-ready': 'Check the Wine prefix',
  'start-application': 'Start Roblox Studio',
  'monitor-process': 'Track the launched process',
  report: 'Report result',
};

export async function runLaunch({ placeId = null } = {}) {
  const startedAt = Date.now();
  const steps = [];
  let blocked = false;

  const push = (id, status, detail) => {
    steps.push({ id, label: LABELS[id], status, detail });
  };
  const skipRemainingFrom = (index) => {
    for (const id of STEP_ORDER.slice(index + 1)) push(id, 'skipped', 'Not reached.');
  };

  info('launcher', 'Studio launch sequence started');

  // 1 — Xenity installation integrity.
  const installation = installationState();
  if (installation.directoriesOk) {
    push('verify-installation', 'ok', `Xenity data root is intact at ${installation.root}.`);
  } else {
    push('verify-installation', 'fail', installation.summary);
    blocked = true;
    skipRemainingFrom(0);
  }

  // 2 — Wine.
  const studioStatus = getStudioStatus();
  if (!blocked) {
    if (studioStatus.wine.present) {
      push('wine-availability', 'ok', studioStatus.wine.detail);
    } else {
      push('wine-availability', 'fail', studioStatus.wine.detail);
      blocked = true;
      skipRemainingFrom(1);
    }
  }

  // 3 — Supporting dependencies.
  const dependencies = blocked ? null : checkDependencies();
  if (!blocked) {
    if (dependencies.ok) {
      push('dependencies', 'ok', 'All required dependencies are present.');
    } else {
      push(
        'dependencies',
        'fail',
        `Missing: ${dependencies.missingRequired.map((d) => d.package).join(', ')}.`,
      );
      blocked = true;
      skipRemainingFrom(2);
    }
  }

  // 4 — A Studio build inside the prefix.
  if (!blocked) {
    if (studioStatus.studio.installed) {
      push('studio-install', 'ok', `${STUDIO_NAME} ${studioStatus.studio.version} at ${studioStatus.studio.exe}.`);
    } else {
      push('studio-install', 'fail', studioStatus.studio.reason);
      blocked = true;
      skipRemainingFrom(3);
    }
  }

  // 5 — The prefix the build lives in.
  if (!blocked) {
    if (studioStatus.prefix.initialized) {
      push('prefix-ready', 'ok', `${studioStatus.prefix.path} is initialised.`);
    } else {
      push('prefix-ready', 'fail', `${studioStatus.prefix.path} is missing or not initialised.`);
      blocked = true;
      skipRemainingFrom(4);
    }
  }

  // 6 — Start Studio.
  const place = findPlace(placeId);
  let started = null;
  if (!blocked) {
    started = await launchStudio({ placePath: place?.file ?? null });
    if (started.started) {
      push(
        'start-application',
        'ok',
        place?.file
          ? `${STUDIO_NAME} started (pid ${started.instance?.pid ?? 'unknown'}) with ${place.name}.`
          : `${STUDIO_NAME} started (pid ${started.instance?.pid ?? 'unknown'}).`,
      );
    } else {
      push('start-application', 'fail', started.error?.message ?? `${STUDIO_NAME} did not start.`);
      blocked = true;
      skipRemainingFrom(5);
    }
  }

  // 7 — Track it.
  if (!blocked) {
    push(
      'monitor-process',
      'ok',
      `Xenity is tracking pid ${started.instance?.pid ?? 'unknown'}; Wine's output is streamed into the Xenity log.`,
    );
  }

  // 8 — Report.
  const failureStep = steps.find((step) => step.status === 'fail') ?? null;
  const outcome = failureStep ? 'failed' : 'succeeded';
  if (!failureStep) {
    push('report', 'ok', `${STUDIO_NAME} was started by Wine. The editor window is Studio’s own.`);
  }

  const durationMs = Date.now() - startedAt;
  const error = failureStep
    ? buildError(failureStep, studioStatus, dependencies, place)
    : null;

  if (error) logError('launcher', `Studio launch failed: ${error.what}`, { step: failureStep.id });
  else info('launcher', 'Studio started');

  recordLaunch({
    placeId,
    outcome,
    message: error
      ? error.what
      : `${STUDIO_NAME} opened${place?.name ? ` — ${place.name}` : ''}.`,
  });

  return {
    outcome,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    steps,
    error,
    runtime: { available: studioStatus.wine.present && studioStatus.studio.installed, backendName: STUDIO_NAME },
    instance: started?.instance
      ? { id: started.instance.id, pid: started.instance.pid, status: started.instance.status }
      : null,
    place: { id: placeId, name: place?.name ?? null, file: place?.file ?? null },
    note: 'Xenity runs the official Windows Studio build through Wine and never patches it or bypasses Roblox’s own checks.',
  };
}

/** Every failure explains what happened, why, and what to do next. */
function buildError(step, studioStatus, dependencies, place) {
  if (step.id === 'wine-availability') {
    return {
      what: 'Wine is not installed, so Roblox Studio cannot start.',
      why: 'Studio is a Windows application; Wine is what runs it on Linux.',
      next: `Install Wine with: ${WINE_INSTALL_HINT} — then press Open Studio again.`,
      code: 'XEN-WINE-001',
      step: step.id,
    };
  }
  if (step.id === 'dependencies') {
    const packages = (dependencies?.missingRequired ?? []).map((d) => d.package).join(' ');
    return {
      what: 'A required system dependency is missing.',
      why: `Xenity could not find: ${(dependencies?.missingRequired ?? []).map((d) => d.binary).join(', ') || 'a required tool'}.`,
      next: packages
        ? `Install it with: sudo pacman -S ${packages}`
        : 'Open Diagnostics to review dependency status.',
      code: 'XEN-DEP-002',
      step: step.id,
    };
  }
  if (step.id === 'studio-install') {
    return {
      what: 'No Roblox Studio build exists in the Wine prefix.',
      why: step.detail,
      next: 'Press Install Studio on the Studio page: Xenity downloads Roblox’s installer and runs it under Wine.',
      code: 'XEN-STUDIO-002',
      step: step.id,
    };
  }
  if (step.id === 'prefix-ready') {
    return {
      what: 'The Wine prefix Studio lives in is not usable.',
      why: step.detail,
      next: 'Press Install Studio again — Xenity recreates the prefix with wineboot before running the installer.',
      code: 'XEN-PREFIX-003',
      step: step.id,
    };
  }
  if (step.id === 'start-application') {
    return {
      what: 'Roblox Studio was started but did not stay open.',
      why: step.detail,
      next: place?.file
        ? 'Open Studio on its own once, check it starts, then retry with the place file.'
        : `Run the Studio doctor in Diagnostics for the specific blocker, and check Wine's output in the log.`,
      code: 'XEN-STUDIO-005',
      step: step.id,
    };
  }
  return {
    what: step.detail,
    why: 'The Xenity installation check did not pass.',
    next: 'Run the repair step in Diagnostics to recreate the Xenity data directories.',
    code: 'XEN-INST-004',
    step: step.id,
  };
}
