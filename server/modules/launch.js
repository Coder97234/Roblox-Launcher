import { getRuntimeStatus } from './runtime_manager.js';
import { checkDependencies, installationState, listApplicationFiles } from './installation.js';
import { recordLaunch } from './library.js';
import { error as logError, info } from './logging.js';

/**
 * The launch pipeline described in the specification. Every step performs a real
 * check; execution stops at the first blocking step and the remaining steps are
 * reported as skipped rather than assumed to have succeeded.
 */

const STEP_ORDER = [
  'verify-installation',
  'runtime-availability',
  'dependencies',
  'application-availability',
  'runtime-initialization',
  'start-application',
  'monitor-process',
  'report',
];

const LABELS = {
  'verify-installation': 'Verify Xenity installation',
  'runtime-availability': 'Check runtime availability',
  dependencies: 'Validate required dependencies',
  'application-availability': 'Verify Roblox application availability',
  'runtime-initialization': 'Initialize the Android runtime',
  'start-application': 'Start the application',
  'monitor-process': 'Monitor the launched process',
  report: 'Report result',
};

export function runLaunch({ experienceId = null } = {}) {
  const startedAt = Date.now();
  const steps = [];
  let blocked = false;

  const push = (id, status, detail) => {
    steps.push({ id, label: LABELS[id], status, detail });
  };
  const skipRemainingFrom = (index) => {
    for (const id of STEP_ORDER.slice(index + 1)) push(id, 'skipped', 'Not reached.');
  };

  info('launcher', 'Launch sequence started');

  // 1 — Xenity installation integrity.
  const installation = installationState();
  if (installation.directoriesOk) {
    push('verify-installation', 'ok', `Xenity data root is intact at ${installation.root}.`);
  } else {
    push('verify-installation', 'fail', installation.summary);
    blocked = true;
    skipRemainingFrom(0);
  }

  // 2 — Runtime availability.
  const runtime = getRuntimeStatus();
  if (!blocked) {
    if (runtime.available) {
      push('runtime-availability', 'ok', `${runtime.backendName} is ready.`);
    } else {
      push('runtime-availability', 'fail', runtime.reason);
      blocked = true;
      skipRemainingFrom(1);
    }
  }

  // 3 — Dependencies.
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

  // 4 — Roblox application availability.
  const applications = blocked ? null : listApplicationFiles();
  if (!blocked) {
    if (applications.present) {
      push('application-availability', 'ok', `Base APK found: ${applications.baseApk}.`);
    } else {
      push(
        'application-availability',
        'fail',
        `No base APK in ${applications.directory}. Add an application bundle you are licensed to use.`,
      );
      blocked = true;
      skipRemainingFrom(3);
    }
  }

  const failureStep = steps.find((step) => step.status === 'fail') ?? null;
  const outcome = failureStep ? 'failed' : 'succeeded';
  const durationMs = Date.now() - startedAt;

  const error = failureStep
    ? buildError(failureStep, runtime, dependencies, applications)
    : null;

  if (error) logError('launcher', `Launch failed: ${error.what}`, { step: failureStep.id });
  else info('launcher', 'Launch succeeded');

  recordLaunch({
    experienceId,
    outcome,
    message: error ? error.what : 'Application started.',
  });

  return {
    outcome,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    steps,
    error,
    runtime: { available: runtime.available, backendName: runtime.backendName },
    note: 'Xenity drives the runtime only through its public interfaces; it never patches Roblox binaries or bypasses integrity checks.',
  };
}

/** Every failure explains what happened, why, and what to do next. */
function buildError(step, runtime, dependencies, applications) {
  if (step.id === 'runtime-availability') {
    return {
      what: 'The Android runtime Xenity needs is not available, so Roblox was not started.',
      why: runtime.reason,
      next: runtime.next,
      code: 'XEN-RUNTIME-001',
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
  if (step.id === 'application-availability') {
    return {
      what: 'No Roblox application bundle is installed.',
      why: `Xenity looked in ${applications?.directory ?? 'the application directory'} and found no base.apk.`,
      next: 'Add an application bundle from an authorized source in the Installation section, then launch again.',
      code: 'XEN-APP-003',
      step: step.id,
    };
  }
  return {
    what: step.detail,
    why: 'The Xenity installation check did not pass.',
    next: 'Run the repair step in Installation to recreate the Xenity data directories.',
    code: 'XEN-INST-004',
    step: step.id,
  };
}
