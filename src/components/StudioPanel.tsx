import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { bytes, relativeTime } from '../lib/format';
import type { StudioInstallState } from '../lib/types';
import { useNotifications } from '../state/notifications';
import { useSystem } from '../state/system';
import { CheckIcon, DownloadIcon, RefreshIcon, TerminalIcon } from './Icons';
import { Button, ErrorNotice, KeyValue, Panel, Spinner, StatusPill, TextField } from './ui';

const PHASE_LABEL: Record<string, string> = {
  idle: 'Idle',
  preparing: 'Preparing the Wine prefix…',
  downloading: 'Downloading Roblox’s Studio installer…',
  installing: 'Running the installer under Wine…',
  waiting: 'Waiting for Studio to appear in the prefix…',
  done: 'Studio installed',
  failed: 'Install failed',
};

/**
 * Roblox Studio itself, installed by Roblox's own Windows installer and run by
 * Wine inside the prefix Xenity owns. Nothing here is patched or repackaged.
 */
export function StudioPanel() {
  const { overview, refresh } = useSystem();
  const { notify } = useNotifications();
  const [job, setJob] = useState<StudioInstallState['job'] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [installerPath, setInstallerPath] = useState('');

  const runtime = overview?.runtime;
  const studio = runtime?.studio;

  const loadInstall = useCallback(async () => {
    try {
      const state = await api.studioInstall();
      setJob(state.job);
    } catch {
      // The shared overview remains the source of truth if this fails.
    }
  }, []);

  useEffect(() => {
    void loadInstall();
  }, [loadInstall]);

  const running = job?.status === 'running';

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const state = await api.studioInstall();
        setJob(state.job);
        if (state.job.status === 'done' || state.job.status === 'failed') await refresh();
      } catch {
        // A dropped poll is not an install failure; the next tick retries.
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const install = async (path: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const state = await api.startStudioInstall(path);
      setJob(state.job);
      notify({
        title: 'Installing Roblox Studio',
        description: path ?? 'Downloading Roblox’s official Studio installer.',
        tone: 'info',
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError('The Studio install could not start.', String(cause), 'Try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const installed = Boolean(studio?.studio.installed);
  const wine = studio?.wine;
  const failedJob = job?.status === 'failed' ? job : null;

  return (
    <Panel
      title="Roblox Studio"
      subtitle="Roblox’s official Windows build, run by Wine in Xenity’s prefix"
      actions={
        <StatusPill tone={installed ? 'ok' : 'warn'}>
          {installed
            ? `Studio ${studio?.studio.version ?? ''}`.trim()
            : wine?.present
              ? 'Studio not installed'
              : 'Wine not installed'}
        </StatusPill>
      }
    >
      <p className="panel__text">
        Roblox publishes Studio for Windows only, so Xenity runs that build through{' '}
        <strong>Wine</strong>. The installer is Roblox’s own, downloaded from{' '}
        <code>setup.rbxcdn.com</code>; the prefix lives at <code>{studio?.prefix.path ?? '…'}</code>.
      </p>

      <div className="kv-grid">
        <KeyValue
          label="Wine"
          value={wine?.present ? wine.version ?? 'present' : 'not installed'}
          hint={wine?.binary ?? 'install with sudo pacman -S wine'}
          tone={wine?.present ? 'ok' : 'warn'}
        />
        <KeyValue
          label="Studio build"
          value={installed ? studio?.studio.version ?? 'installed' : 'not installed'}
          hint={installed ? studio?.studio.exe ?? '' : 'Roblox’s installer has not run yet'}
          tone={installed ? 'ok' : 'warn'}
        />
        <KeyValue
          label="Prefix"
          value={studio?.prefix.initialized ? 'initialised' : studio?.prefix.exists ? 'partial' : 'absent'}
          hint={studio?.prefix.path ?? ''}
          tone={studio?.prefix.initialized ? 'ok' : 'warn'}
        />
        <KeyValue
          label="Installed"
          value={studio?.studio.installedAt ? relativeTime(studio.studio.installedAt) : '—'}
          hint={studio?.studio.bytes ? bytes(studio.studio.bytes) : undefined}
        />
      </div>

      {running && (
        <>
          <div className="progress" role="progressbar" aria-valuenow={job?.percent ?? 0} aria-label="Studio install">
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
            <p className="notice__what">Studio is installed.</p>
            <p className="notice__text">Press Open Studio to start the editor through Wine.</p>
          </div>
        </div>
      )}

      {(failedJob || error) && (
        <ErrorNotice
          error={
            failedJob
              ? {
                  what: 'The Studio install did not finish.',
                  why: failedJob.error ?? 'The installer stopped early.',
                  next: 'Check Wine’s output in the Xenity log, or point Xenity at an installer you already downloaded.',
                }
              : { what: error!.what, why: error!.why, next: error!.next }
          }
        />
      )}

      <div className="play-panel__actions">
        <Button
          variant={installed ? 'secondary' : 'primary'}
          icon={busy || running ? <Spinner size={14} /> : <DownloadIcon size={14} />}
          disabled={busy || running || !wine?.present}
          onClick={() => void install(null)}
        >
          {busy || running ? 'Installing…' : installed ? 'Reinstall Studio' : 'Install Studio'}
        </Button>
        <Button variant="ghost" icon={<RefreshIcon size={14} />} disabled={busy || running} onClick={() => void refresh()}>
          Recheck
        </Button>
        {!wine?.present && (
          <span className="panel__footnote">
            Wine is required first: <code>sudo pacman -S wine winetricks</code>
          </span>
        )}
      </div>

      <div className="field-stack studio-installer">
        <TextField
          label="Installer file (optional)"
          description="Already have RobloxStudioInstaller.exe? Point Xenity at it instead of downloading it again."
          value={installerPath}
          onChange={setInstallerPath}
        />
        <div className="inline-actions">
          <Button
            variant="ghost"
            size="sm"
            icon={<TerminalIcon size={14} />}
            disabled={busy || running || !wine?.present || !installerPath.trim()}
            onClick={() => void install(installerPath.trim())}
          >
            Run installer file
          </Button>
        </div>
      </div>
    </Panel>
  );
}
