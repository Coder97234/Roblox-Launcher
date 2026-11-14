import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { bytes, relativeTime } from '../lib/format';
import type { EngineInstallState, EngineRelease } from '../lib/types';
import { useNotifications } from '../state/notifications';
import { useSystem } from '../state/system';
import { CheckIcon, DownloadIcon, RefreshIcon, TrashIcon } from './Icons';
import { Button, ErrorNotice, KeyValue, Panel, Spinner, StatusPill } from './ui';

const PHASE_LABEL: Record<string, string> = {
  idle: 'Idle',
  resolving: 'Reading the Cordial release list…',
  downloading: 'Downloading the engine…',
  verifying: 'Checking that the engine starts…',
  done: 'Engine installed',
  failed: 'Install failed',
};

/**
 * The engine the launcher ships with. Xenity downloads the official Cordial
 * release for this machine and starts Roblox through it; the person never has
 * to install the runtime by hand first.
 */
export function EnginePanel() {
  const { overview, refresh } = useSystem();
  const { notify } = useNotifications();
  const [release, setRelease] = useState<EngineRelease | null>(null);
  const [job, setJob] = useState<EngineInstallState['job'] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const engine = overview?.runtime.engine;
  const managed = engine?.managed ?? null;

  const loadRelease = useCallback(async () => {
    try {
      setRelease(await api.engineRelease());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError('The engine release list could not be read.', String(cause), 'Try again.'),
      );
    }
  }, []);

  useEffect(() => {
    void loadRelease();
  }, [loadRelease]);

  // The engine may already be installed, or an install may be in flight from an
  // earlier visit to this page: read the service's own state on mount so the
  // panel never contradicts the disk.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await api.engineInstall();
        if (cancelled) return;
        setJob(state.job);
        if (state.engine.installed !== Boolean(managed?.installed)) await refresh();
      } catch {
        // The shared overview remains the source of truth if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [managed?.installed, refresh]);

  const running = job?.status === 'running';

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const state = await api.engineInstall();
        setJob(state.job);
        if (state.job.status === 'done') {
          await refresh();
        }
      } catch {
        // A dropped poll is not an install failure; the next tick retries.
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const install = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      const state = await api.startEngineInstall(force);
      setJob(state.job);
      notify({
        title: force ? 'Reinstalling the engine' : 'Installing the engine',
        description: state.job.release?.asset ?? 'Starting the download.',
        tone: 'info',
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError('The engine install could not start.', String(cause), 'Try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.removeEngine();
      await refresh();
      notify({ title: 'Engine removed', description: 'Xenity deleted the engine it installed.', tone: 'info' });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError('The engine could not be removed.', String(cause), 'Try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const present = Boolean(engine?.present);
  const failedJob = job?.status === 'failed' ? job : null;

  return (
    <Panel
      title="Engine"
      subtitle="Cordial runs Roblox's official Android build natively on Linux"
      actions={
        <StatusPill tone={present ? 'ok' : 'warn'}>
          {present
            ? `${engine?.engine ?? 'Cordial'} ${engine?.version ?? managed?.version ?? ''}`.trim()
            : 'Engine not installed'}
        </StatusPill>
      }
    >
      <p className="panel__text">
        Xenity ships the engine: it downloads the official Cordial release for{' '}
        <strong>{release?.arch ?? 'this machine'}</strong> into its own data directory and starts
        Roblox with <code>cordial --profile --play</code>. Cordial keeps Roblox's Android build in
        its own store — open the engine once to let it download Roblox.
      </p>

      <div className="kv-grid">
        <KeyValue
          label="Engine"
          value={managed?.installed ? (managed.version ?? 'unknown') : present ? 'system install' : 'not installed'}
          hint={managed?.installed ? 'installed by Xenity' : engine?.source ?? 'nothing found yet'}
          tone={present ? 'ok' : 'warn'}
        />
        <KeyValue
          label="Binary"
          value={managed?.path ?? engine?.command ?? '—'}
          hint={managed?.verified ? 'confirmed to start here' : managed?.installed ? 'not yet confirmed here' : 'no engine file'}
        />
        <KeyValue
          label="Roblox build"
          value={engine?.build?.version ?? 'none yet'}
          hint={engine?.runnable ? 'ready to launch' : 'Cordial has not downloaded Roblox yet'}
          tone={engine?.runnable ? 'ok' : 'warn'}
        />
        <KeyValue
          label="Installed"
          value={managed?.installedAt ? relativeTime(managed.installedAt) : '—'}
          hint={managed?.size ? bytes(managed.size) : release?.size ? `${bytes(release.size)} download` : undefined}
        />
      </div>

      {running && (
        <>
          <div className="progress" role="progressbar" aria-valuenow={job?.percent ?? 0} aria-label="Engine download">
            <span className="progress__bar" style={{ width: `${Math.max(job?.percent ?? 0, 4)}%` }} />
          </div>
          <p className="panel__footnote">
            {PHASE_LABEL[job?.phase ?? 'idle'] ?? job?.phase}
            {job?.total
              ? ` ${job.percent}% · ${bytes(job.received)} of ${bytes(job.total)}`
              : job?.received
                ? ` ${bytes(job.received)}`
                : ''}
          </p>
        </>
      )}

      {job?.status === 'done' && !running && (
        <div className="notice notice--success">
          <span className="notice__icon">
            <CheckIcon size={18} />
          </span>
          <div className="notice__body">
            <p className="notice__what">Engine ready.</p>
            <p className="notice__text">
              {managed?.verified
                ? 'Cordial answered on this machine. Press Play to start Roblox.'
                : 'The engine is in place. It needs a desktop session with the usual graphics libraries to start.'}
            </p>
          </div>
        </div>
      )}

      {(failedJob || error) && (
        <ErrorNotice
          error={
            failedJob
              ? {
                  what: 'The engine download did not finish.',
                  why: failedJob.error ?? 'The download stopped early.',
                  next: 'Check the network connection and try again; the Diagnostics page holds the log.',
                }
              : { what: error!.what, why: error!.why, next: error!.next }
          }
        />
      )}

      <div className="play-panel__actions">
        {!present && (
          <Button
            variant="primary"
            icon={busy || running ? <Spinner size={14} /> : <DownloadIcon size={14} />}
            disabled={busy || running || !release || !release.resolved}
            onClick={() => void install(false)}
          >
            {busy || running
              ? 'Installing…'
              : release?.version
                ? `Install Cordial ${release.version}`
                : 'Install Cordial engine'}
          </Button>
        )}
        {present && (
          <Button
            variant="secondary"
            icon={<DownloadIcon size={14} />}
            disabled={busy || running || !release?.resolved}
            onClick={() => void install(true)}
          >
            Reinstall engine
          </Button>
        )}
        {!release?.resolved && !running && (
          <Button variant="ghost" icon={<RefreshIcon size={14} />} onClick={() => void loadRelease()}>
            Recheck releases
          </Button>
        )}
        {managed?.installed && (
          <Button variant="ghost" icon={<TrashIcon size={14} />} disabled={busy || running} onClick={() => void remove()}>
            Remove engine
          </Button>
        )}
        {release?.resolved && release.asset && (
          <span className="panel__footnote">
            {release.asset}
            {release.size ? ` · ${bytes(release.size)}` : ''}
          </span>
        )}
      </div>

      {!release?.resolved && release?.reason && (
        <p className="panel__footnote">{release.reason}</p>
      )}
    </Panel>
  );
}
