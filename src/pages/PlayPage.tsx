import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { clockTime, relativeTime } from '../lib/format';
import type { LogEntry } from '../lib/types';
import { useLauncher } from '../state/launcher';
import { useNotifications } from '../state/notifications';
import { useSystem } from '../state/system';
import { CheckIcon, CloseIcon, MinusIcon, PlayIcon, RefreshIcon, TerminalIcon } from '../components/Icons';
import { Button, EmptyState, ErrorNotice, Panel, Spinner, StatusPill } from '../components/ui';

function StepIcon({ status }: { status: 'ok' | 'fail' | 'skipped' | 'pending' | 'active' }) {
  if (status === 'ok')
    return (
      <span className="step__icon step__icon--ok">
        <CheckIcon size={13} />
      </span>
    );
  if (status === 'fail')
    return (
      <span className="step__icon step__icon--fail">
        <CloseIcon size={13} />
      </span>
    );
  if (status === 'active')
    return (
      <span className="step__icon step__icon--active">
        <Spinner size={12} />
      </span>
    );
  if (status === 'skipped')
    return (
      <span className="step__icon step__icon--skipped">
        <MinusIcon size={13} />
      </span>
    );
  return <span className="step__icon step__icon--pending" />;
}

const PIPELINE = [
  'Verify Xenity installation',
  'Check runtime availability',
  'Validate required dependencies',
  'Verify Roblox application availability',
  'Initialize the Android runtime',
  'Start the application',
  'Monitor the launched process',
  'Report result',
];

export function PlayPage() {
  const { overview, refresh } = useSystem();
  const { run, running, result, error: launchError, clear } = useLauncher();
  const { notify } = useNotifications();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const runtime = overview?.runtime;
  const installation = overview?.installation;

  const loadLogs = async () => {
    try {
      const response = await api.logs(60);
      setLogs(response.entries);
    } catch {
      setLogs([]);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  useEffect(() => {
    if (result) void loadLogs();
  }, [result]);

  const launch = async () => {
    await run(null);
    await refresh();
  };

  const steps = result?.steps ?? null;
  const stepsRendered = steps
    ? steps.map((step) => ({ label: step.label, status: step.status as 'ok' | 'fail' | 'skipped', detail: step.detail }))
    : PIPELINE.map((label, index) => ({
        label,
        status: (running && index === 0 ? 'active' : 'pending') as 'active' | 'pending',
        detail: running && index === 0 ? 'Running launch checks…' : 'Not run yet.',
      }));

  return (
    <div className="stack">
      <div className="grid grid--main">
        <Panel className="play-panel" glow>
          <div className="play-panel__head">
            <div>
              <h2 className="panel__title">Launch Roblox</h2>
              <p className="panel__subtitle">
                Xenity verifies every prerequisite before it starts anything.
              </p>
            </div>
            <StatusPill tone={result?.outcome === 'succeeded' ? 'ok' : result ? 'danger' : 'muted'}>
              {running ? 'Launching' : result ? `Last run: ${result.outcome}` : 'Idle'}
            </StatusPill>
          </div>

          <button className="play-button play-button--large" onClick={() => void launch()} disabled={running}>
            <span className="play-button__ring" aria-hidden="true" />
            {running ? <Spinner size={28} /> : <PlayIcon size={34} />}
            <span className="play-button__label">{running ? 'Working…' : 'Play'}</span>
          </button>

          <div className="play-panel__status">
            <div>
              <span className="micro-label">Installation</span>
              <span className="micro-value">{installation?.summary ?? 'Checking…'}</span>
            </div>
            <div>
              <span className="micro-label">Runtime</span>
              <span className="micro-value">
                {runtime?.available ? runtime.backendName : 'Unavailable'}
              </span>
            </div>
            <div>
              <span className="micro-label">Last attempt</span>
              <span className="micro-value">
                {result ? relativeTime(result.startedAt) : 'This session: none'}
              </span>
            </div>
          </div>

          {running && (
            <div className="progress" role="progressbar" aria-label="Launch progress">
              <span className="progress__bar progress__bar--indeterminate" />
            </div>
          )}

          {(result?.error || launchError) && (
            <ErrorNotice
              error={
                result?.error
                  ? {
                      what: result.error.what,
                      why: result.error.why,
                      next: result.error.next,
                      code: result.error.code,
                    }
                  : {
                      what: launchError!.what,
                      why: launchError!.why,
                      next: launchError!.next,
                    }
              }
            />
          )}

          {result?.outcome === 'succeeded' && (
            <div className="notice notice--success">
              <span className="notice__icon">
                <CheckIcon size={18} />
              </span>
              <div className="notice__body">
                <p className="notice__what">Launch completed.</p>
                <p className="notice__text">{result.note}</p>
              </div>
            </div>
          )}

          <div className="play-panel__actions">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshIcon size={14} />}
              onClick={() => void refresh()}
            >
              Recheck environment
            </Button>
            {(result || launchError) && (
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear result
              </Button>
            )}
          </div>
        </Panel>

        <Panel
          title="Launch sequence"
          subtitle={result ? `Finished in ${result.durationMs} ms` : 'Eight checks, in order'}
        >
          <ol className="steps">
            {stepsRendered.map((step, index) => (
              <li key={`${step.label}-${index}`} className={`step step--${step.status}`}>
                <StepIcon status={step.status} />
                <div className="step__text">
                  <span className="step__label">
                    {index + 1}. {step.label}
                  </span>
                  <span className="step__detail">{step.detail}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="panel__footnote">{result?.note}</p>
        </Panel>
      </div>

      <Panel
        title="Launch logs"
        subtitle="Live backend log stream"
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<TerminalIcon size={14} />}
            onClick={async () => {
              try {
                const text = await api.logsExport();
                const blob = new Blob([text], { type: 'text/plain' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'xenity.log';
                link.click();
                URL.revokeObjectURL(link.href);
                notify({ title: 'Logs exported', description: 'xenity.log was downloaded.', tone: 'success' });
              } catch (cause) {
                notify({
                  title: 'Export failed',
                  description: cause instanceof ApiError ? cause.what : 'The log file could not be read.',
                  tone: 'danger',
                });
              }
            }}
          >
            Export logs
          </Button>
        }
      >
        {logs.length === 0 ? (
          <EmptyState
            title="No log entries yet"
            description="Logging starts the moment the launcher backend handles its first action."
          />
        ) : (
          <div className="console">
            {logs.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className={`console__line console__line--${entry.level}`}>
                <span className="console__time">{clockTime(entry.at)}</span>
                <span className="console__module">{entry.module}</span>
                <span className="console__message">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
