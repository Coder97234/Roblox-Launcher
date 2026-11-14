import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { DependencyInstallState } from '../lib/types';
import { useNotifications } from '../state/notifications';
import { useSystem } from '../state/system';
import { CheckIcon, DownloadIcon, RefreshIcon } from './Icons';
import { Button, ErrorNotice, Panel, Spinner, StatusPill } from './ui';

/**
 * One button for the whole dependency set. The backend runs a single pacman
 * command through pkexec/sudo and streams its output back here, so the user can
 * see exactly which package is being installed and what failed.
 */
export function DependenciesPanel() {
  const { overview, refresh } = useSystem();
  const { notify } = useNotifications();
  const [state, setState] = useState<DependencyInstallState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api.dependenciesInstall());
    } catch {
      // The overview remains the source of truth if this endpoint is unavailable.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const job = state?.job;
  const running = job?.status === 'running';

  // A job that fails after it started (pacman exiting non-zero) reports here too.
  useEffect(() => {
    if (job?.status === 'failed' && job.error) {
      setError(
        new ApiError(
          'The dependencies could not be installed.',
          job.error,
          'Install the packages listed below by hand, then press Recheck.',
        ),
      );
    }
  }, [job?.status, job?.error]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.dependenciesInstall();
        setState(next);
        if (next.job.status !== 'running') await refresh();
      } catch {
        // A dropped poll is not an install failure; the next tick retries.
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const install = async () => {
    setStarting(true);
    setError(null);
    try {
      const next = await api.startDependencyInstall();
      setState(next);
      if (next.job.status === 'failed') {
        setError(
          new ApiError(
            'The dependencies could not be installed.',
            next.job.error ?? 'pacman did not run on this machine.',
            'Install the packages listed below by hand, then press Recheck.',
          ),
        );
      } else if (next.job.status === 'done') {
        notify({ title: 'Dependencies', description: next.job.message ?? 'Everything is installed.', tone: 'success' });
        await refresh();
      } else {
        notify({
          title: 'Installing dependencies',
          description: next.job.command ?? 'Starting the package manager…',
          tone: 'info',
        });
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError('The install could not start.', String(cause), 'Try again.'),
      );
    } finally {
      setStarting(false);
    }
  };

  const checks = state?.dependencies.checks ?? overview?.installation.dependencies.checks ?? [];
  const missing = checks.filter((check) => !check.present);
  const privilegeUnavailable = state ? !state.privilege.available : false;
  const lines = job?.lines.slice(-10) ?? [];

  return (
    <Panel
      title="System dependencies"
      subtitle="Wine and the tools Studio needs, installed in one go"
      actions={
        <StatusPill tone={missing.length === 0 ? 'ok' : 'warn'}>
          {missing.length === 0
            ? 'All installed'
            : `${missing.length} package${missing.length === 1 ? '' : 's'} missing`}
        </StatusPill>
      }
    >
      {checks.length > 0 ? (
        <ul className="dep-list">
          {checks.map((check) => (
            <li key={check.binary} className="dep">
              <span className={`dep__dot dep__dot--${check.present ? 'ok' : check.required ? 'danger' : 'warn'}`} />
              <span className="dep__binary">{check.binary}</span>
              <span className="dep__package">{check.package}</span>
              <span className="dep__state">
                {check.present ? 'present' : check.required ? 'missing (required)' : 'missing (optional)'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__text">Reading the dependency list…</p>
      )}

      {missing.length > 0 && (
        <p className="dep__install-hint">
          One pacman run installs{' '}
          <code>{missing.map((check) => check.package).join(' ')}</code> and asks for your password
          once.
        </p>
      )}

      {running && (
        <>
          <div className="progress" role="progressbar" aria-label="Dependency install">
            <span className="progress__bar progress__bar--indeterminate" />
          </div>
          <p className="panel__footnote">
            {job?.packages.length
              ? `Installing ${job.packages.join(', ')}…`
              : 'Starting the package manager…'}
          </p>
        </>
      )}

      {lines.length > 0 && (running || job?.status === 'failed' || job?.status === 'done') && (
        <div className="console">
          {lines.map((line, index) => (
            <div key={`${index}-${line}`} className="console__line console__line--info">
              <span className="console__message">{line}</span>
            </div>
          ))}
        </div>
      )}

      {job?.status === 'done' && !running && (
        <div className="notice notice--success">
          <span className="notice__icon">
            <CheckIcon size={18} />
          </span>
          <div className="notice__body">
            <p className="notice__what">Dependencies are in place.</p>
            <p className="notice__text">{job.message}</p>
          </div>
        </div>
      )}

      {error && <ErrorNotice error={{ what: error.what, why: error.why, next: error.next }} onDismiss={() => setError(null)} />}

      <div className="play-panel__actions">
        <Button
          variant={missing.length > 0 ? 'primary' : 'secondary'}
          icon={starting || running ? <Spinner size={14} /> : <DownloadIcon size={14} />}
          disabled={starting || running || privilegeUnavailable}
          onClick={() => void install()}
        >
          {running ? 'Installing…' : missing.length > 0 ? 'Install all dependencies' : 'Install / repair dependencies'}
        </Button>
        <Button variant="ghost" icon={<RefreshIcon size={14} />} disabled={running} onClick={() => void load()}>
          Recheck
        </Button>
      </div>

      {privilegeUnavailable && (
        <p className="panel__footnote">
          Installing needs a way to ask for root, and neither pkexec nor sudo is available on this
          machine. Install polkit, or allow your user to run pacman through sudo without a password.
        </p>
      )}
      {!privilegeUnavailable && (
        <p className="panel__footnote">
          Xenity never runs as root itself; only the package install is escalated.
        </p>
      )}
    </Panel>
  );
}
