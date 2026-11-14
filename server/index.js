import express from 'express';
import { detectSystem } from './modules/system_detection.js';
import { getRuntimeStatus } from './modules/runtime_manager.js';
import {
  checkDependencies,
  installationState,
  repairInstallation,
} from './modules/installation.js';
import { getSettings, resetSettings, updateSettings, settingsFilePath } from './modules/settings.js';
import {
  addExperience,
  getLibrary,
  lastLaunch,
  removeExperience,
  toggleFavorite,
} from './modules/library.js';
import { runLaunch } from './modules/launch.js';
import { buildDiagnostics, buildReportText, logsForExport } from './modules/diagnostics.js';
import { clearCache, storageReport } from './modules/storage.js';
import { checkForUpdates, versionInfo } from './modules/updater.js';
import { recentLogs } from './modules/logging.js';

const app = express();
const PORT = Number(process.env.PORT || 8000);

app.use(express.json({ limit: '256kb' }));

const wrap = (handler) => async (req, res, next) => {
  try {
    res.json({ ok: true, data: await handler(req, res) });
  } catch (cause) {
    next(cause);
  }
};

app.get('/api/health', wrap(() => ({ status: 'ok', at: new Date().toISOString() })));

// Aggregated payload for the home dashboard.
app.get(
  '/api/overview',
  wrap(() => {
    const system = detectSystem();
    const runtime = getRuntimeStatus();
    const installation = installationState();
    const version = versionInfo();
    return {
      system,
      runtime,
      installation,
      version: { version: version.version, channel: version.channel },
      lastLaunch: lastLaunch(),
    };
  }),
);

app.get('/api/system', wrap(() => detectSystem()));
app.get('/api/runtime', wrap(() => getRuntimeStatus()));
app.get('/api/dependencies', wrap(() => checkDependencies()));
app.get('/api/installation', wrap(() => installationState()));
app.post('/api/installation/repair', wrap(() => repairInstallation()));

app.get('/api/settings', wrap(() => ({ settings: getSettings(), path: settingsFilePath() })));
app.put(
  '/api/settings',
  wrap((req) => ({ settings: updateSettings(req.body?.settings ?? req.body ?? {}) })),
);
app.post('/api/settings/reset', wrap(() => ({ settings: resetSettings() })));

app.get('/api/storage', wrap(() => storageReport()));
app.post('/api/storage/clear-cache', wrap(() => clearCache()));

app.get('/api/library', wrap(() => getLibrary()));
app.post(
  '/api/library',
  wrap((req) => ({ experience: addExperience(req.body ?? {}) })),
);
app.post(
  '/api/library/:id/favorite',
  wrap((req) => ({ experience: toggleFavorite(req.params.id) })),
);
app.delete(
  '/api/library/:id',
  wrap((req) => removeExperience(req.params.id)),
);

app.post(
  '/api/launch',
  wrap((req) => runLaunch({ experienceId: req.body?.experienceId ?? null })),
);

app.get('/api/diagnostics', wrap(() => buildDiagnostics()));
app.get('/api/diagnostics/report', (req, res) => {
  const format = req.query.format === 'json' ? 'json' : 'text';
  if (format === 'json') {
    res.json({ ok: true, data: { report: buildReportText() } });
    return;
  }
  res
    .type('text/plain; charset=utf-8')
    .setHeader('Content-Disposition', 'inline; filename="xenity-diagnostics.txt"')
    .send(buildReportText());
});
app.get('/api/logs', wrap((req) => ({ entries: recentLogs({ limit: Number(req.query.limit) || 150 }) })));
app.get('/api/logs/export', (req, res) => {
  res
    .type('text/plain; charset=utf-8')
    .setHeader('Content-Disposition', 'attachment; filename="xenity.log"')
    .send(logsForExport());
});

app.post('/api/updates/check', wrap(() => checkForUpdates()));
app.get('/api/version', wrap(() => versionInfo()));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      ok: false,
      error: {
        what: `No Xenity API endpoint matches ${req.method} ${req.path}.`,
        why: 'The launcher UI is newer or older than the backend it is talking to.',
        next: 'Reload the launcher; if it persists, check the API service logs.',
      },
    });
    return;
  }
  next();
});

// eslint-disable-next-line no-unused-vars
app.use((cause, req, res, next) => {
  const status = cause.status || 500;
  res.status(status).json({
    ok: false,
    error: {
      what: cause.message || 'The request could not be completed.',
      why: status === 400 ? 'The request contained invalid values.' : 'An unexpected error occurred in the Xenity backend.',
      next: status === 400 ? 'Correct the input and try again.' : 'Open Diagnostics to review recent errors and logs.',
    },
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Xenity backend listening on 0.0.0.0:${PORT}`);
});
