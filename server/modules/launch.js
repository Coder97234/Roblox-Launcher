import { checkDependencies, installationState } from './installation.js';
import { getEngineStatus, launchEngine, readEngineReport, INSTALL_HINT } from './cordial.js';
import { getLibrary, recordLaunch } from './library.js';
import { getSettings } from './settings.js';
import { error as logError, info } from './logging.js';

/**
 * The launch pipeline. Every step performs a real check against real state, and
 * execution stops at the first blocking step: the remaining steps are reported
 * as skipped rather than assumed to have succeeded.
 *
 * Roblox is started by Cordial, which runs the official Android build natively.
 * Xenity passes Cordial a profile and, when the library entry carries one, a
 * place id; it never patches or repackages anything.
 */

const STEP_ORDER = [
  'verify-installation',
  'engine-availability',
  'dependencies',
  'roblox-build',
  'engine-report',
  'start-application',
  'monitor-process',
  'report',
];

const LABELS = {
  'verify-installation': 'Verify Xenity installation',
  'engine-availability': 'Detect the Cordial engine',
  dependencies: 'Validate required dependencies',
  'roblox-build': 'Find a launchable Roblox build',
  'engine-report': 'Ask Cordial what it will run',
  'start-application': 'Start Roblox through Cordial',
  'monitor-process': 'Track the launched process',
  report: 'Report result',
};

/** The place id a library entry points at, when its URL carries one. */
function resolveExperience(experienceId) {
  if (!experienceId) return { name: null, placeId: null, url: null };
  const { experiences } = getLibrary();
  const experience = experiences.find((entry) => entry.id === experienceId) ?? null;
  const url = experience?.url ?? '';
  const match = url.match(/(?:\/games\/|[?&]placeId=)(\d{3,})/i);
  return { name: experience?.name ?? null, placeId: match ? Number(match[1]) : null, url };
}

export async function runLaunch({ experienceId = null } = {}) {
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

  // 2 — Is the engine backend on this machine?
  const engine = getEngineStatus();
  if (!blocked) {
    if (engine.present) {
      push(
        'engine-availability',
        'ok',
        `${engine.engine} ${engine.version ?? '(version unreadable)'} found via ${engine.source}.`,
      );
    } else {
      push('engine-availability', 'fail', engine.engine + ' is not installed.');
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

  // 4 — A build Cordial would actually launch.
  const build = blocked ? null : engine.store.runnableBuild;
  if (!blocked) {
    if (build) {
      push('roblox-build', 'ok', `Roblox ${build.version} is verified in ${build.dir}.`);
    } else {
      push(
        'roblox-build',
        'fail',
        engine.store.builds.length
          ? `Cordial holds ${engine.store.builds.length} build(s) in ${engine.store.root}, but none is verified as launchable.`
          : `Cordial's build store holds no Roblox build at ${engine.store.root ?? 'an unknown path'}.`,
      );
      blocked = true;
      skipRemainingFrom(3);
    }
  }

  // 5 — Let Cordial say what it is about to run.
  const report = blocked ? null : readEngineReport();
  if (!blocked) {
    if (report.ran) {
      push(
        'engine-report',
        'ok',
        `Cordial reports Roblox ${report.fields.roblox ?? 'unknown'}, installed as ${report.fields.install ?? 'unknown'}.`,
      );
    } else {
      push('engine-report', 'fail', report.reason ?? 'Cordial did not answer.');
      blocked = true;
      skipRemainingFrom(4);
    }
  }

  // 6 — Start it, through Cordial's own headless launcher.
  const settings = getSettings();
  const experience = resolveExperience(experienceId);
  let started = null;
  if (!blocked) {
    started = await launchEngine({
      placeId: experience.placeId,
      profile: settings.runtime.profile,
      fullscreen: false,
    });
    if (started.started) {
      push(
        'start-application',
        'ok',
        experience.placeId
          ? `Cordial started (pid ${started.instance?.pid ?? 'unknown'}) and was asked to join place ${experience.placeId}.`
          : `Cordial started (pid ${started.instance?.pid ?? 'unknown'}) on profile ${settings.runtime.profile}.`,
      );
    } else {
      push('start-application', 'fail', started.error?.message ?? 'Cordial did not start.');
      blocked = true;
      skipRemainingFrom(5);
    }
  }

  // 7 — Track it.
  if (!blocked) {
    push(
      'monitor-process',
      'ok',
      `Xenity is tracking pid ${started.instance?.pid ?? 'unknown'}; Cordial's output is streamed into the Xenity log.`,
    );
  }

  // 8 — Report.
  const failureStep = steps.find((step) => step.status === 'fail') ?? null;
  const outcome = failureStep ? 'failed' : 'succeeded';
  if (!failureStep) {
    push('report', 'ok', 'Cordial was asked to start Roblox and answered. The game window is Cordial’s.');
  }

  const durationMs = Date.now() - startedAt;
  const error = failureStep ? buildError(failureStep, engine, dependencies, report, started) : null;

  if (error) logError('launcher', `Launch failed: ${error.what}`, { step: failureStep.id });
  else info('launcher', 'Launch handed to Cordial');

  recordLaunch({
    experienceId,
    outcome,
    message: error
      ? error.what
      : `Cordial started Roblox${experience.name ? ` — ${experience.name}` : ''}${experience.placeId ? ` (place ${experience.placeId})` : ''}.`,
  });

  return {
    outcome,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    steps,
    error,
    runtime: { available: engine.present && engine.runnable, backendName: engine.engine },
    instance: started?.instance
      ? { id: started.instance.id, pid: started.instance.pid, status: started.instance.status }
      : null,
    experience: { id: experienceId, name: experience.name, placeId: experience.placeId },
    note: 'Xenity starts Roblox through Cordial’s published command line and never patches the engine or bypasses its integrity checks.',
  };
}

/** Every failure explains what happened, why, and what to do next. */
function buildError(step, engine, dependencies, report, started) {
  if (step.id === 'engine-availability') {
    return {
      what: 'The engine backend Xenity drives is not installed, so Roblox was not started.',
      why: `${engine.engine} runs Roblox's official Android build natively on Linux; without it there is nothing to launch.`,
      next: `Install it with: ${INSTALL_HINT} — then launch again.`,
      code: 'XEN-ENGINE-001',
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
  if (step.id === 'roblox-build') {
    return {
      what: 'Cordial has no verified Roblox build to run.',
      why: step.detail,
      next: 'Open Cordial (the Engine panel in Diagnostics can do it) and use its Download Roblox button, then launch again.',
      code: 'XEN-BUILD-002',
      step: step.id,
    };
  }
  if (step.id === 'engine-report') {
    return {
      what: 'Cordial did not answer its own diagnostics request.',
      why: report?.reason ?? step.detail,
      next: 'Run Cordial on its own once to confirm it starts, then check the Xenity log for the engine output.',
      code: 'XEN-ENGINE-003',
      step: step.id,
    };
  }
  if (step.id === 'start-application') {
    return {
      what: 'Cordial was asked to start Roblox and did not.',
      why: started?.error?.message ?? step.detail,
      next:
        'Check that a display session is available to the Xenity service, then run the Cordial doctor in Diagnostics for the specific blocker.',
      code: 'XEN-START-005',
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
