import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { bytes, percent, relativeTime, uptime } from '../lib/format';
import type { SystemInfo } from '../lib/types';
import { useLauncher } from '../state/launcher';
import { useNotifications } from '../state/notifications';
import { useSystem } from '../state/system';
import {
  ArrowRightIcon,
  DiagnosticsIcon,
  PlayIcon,
  RefreshIcon,
  SparkIcon,
  WrenchIcon,
} from '../components/Icons';
import { Button, ErrorNotice, KeyValue, Panel, Spinner, StatusPill } from '../components/ui';

function gpuLabel(system: SystemInfo) {
  if (!system.gpu.devices.length) return 'Not detected';
  return system.gpu.devices
    .map((device) => `${device.vendor}${device.deviceId ? ` ${device.deviceId}` : ''}`)
    .join(' · ');
}

export function HomePage() {
  const { overview, loading, error, refresh } = useSystem();
  const { run, running, result } = useLauncher();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  const system = overview?.system;
  const runtime = overview?.runtime;
  const installation = overview?.installation;
  const lastLaunch = overview?.lastLaunch;

  const checkUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const outcome = await api.checkUpdates();
      notify({
        title: outcome.status === 'update-available' ? 'Update available' : 'Update check finished',
        description: outcome.message,
        tone: outcome.status === 'failed' ? 'danger' : 'info',
      });
    } catch (cause) {
      notify({
        title: 'Update check failed',
        description: cause instanceof ApiError ? cause.what : 'The updater could not be reached.',
        tone: 'danger',
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="page-loading">
        <Spinner size={22} />
        <span>Reading this machine's capabilities…</span>
      </div>
    );
  }

  return (
    <div className="stack">
      {error && (
        <ErrorNotice
          error={{ what: error.what, why: error.why, next: error.next }}
          onDismiss={() => void refresh()}
        />
      )}

      <section className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__content">
          <span className="eyebrow">Xenity · Arch Linux</span>
          <h2 className="hero__title">
            Welcome to <span className="hero__wordmark">Xenity</span>
          </h2>
          <p className="hero__tagline">Redefine Your Roblox Experience.</p>
          <p className="hero__body">
            {system
              ? `Running on ${system.distribution.name}, kernel ${system.kernel}, ${system.cpu.cores} CPU threads.`
              : 'Collecting system information.'}
          </p>
          <div className="hero__chips">
            <StatusPill tone={runtime?.studio.wine.present ? 'ok' : 'warn'}>
              {runtime?.studio.wine.present
                ? `Wine ${runtime.studio.wine.version ?? 'detected'}`
                : 'Wine not installed'}
            </StatusPill>
            <StatusPill tone={runtime?.present ? 'ok' : 'warn'}>
              {runtime?.present
                ? `Roblox Studio ${runtime.studio.studio.version ?? ''}`.trim()
                : 'Roblox Studio not installed'}
            </StatusPill>
            <StatusPill tone={runtime?.available ? 'ok' : 'muted'}>
              {runtime?.available ? 'Studio ready' : 'Studio blocked'}
            </StatusPill>
          </div>
        </div>
        <div className="hero__aside">
          <div className="hero__stat">
            <span className="hero__stat-label">Session</span>
            <span className="hero__stat-value">{system?.graphics.sessionType ?? '—'}</span>
          </div>
          <div className="hero__stat">
            <span className="hero__stat-label">Uptime</span>
            <span className="hero__stat-value">{system ? uptime(system.uptimeSeconds) : '—'}</span>
          </div>
          <div className="hero__stat">
            <span className="hero__stat-label">Last launch</span>
            <span className="hero__stat-value">
              {lastLaunch ? relativeTime(lastLaunch.at) : 'Never'}
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid--main">
        <Panel className="launch-card" glow>
          <div className="launch-card__top">
            <div>
              <h2 className="launch-card__title">Roblox Studio</h2>
              <p className="launch-card__subtitle">
                {installation?.summary ?? 'Checking installation state.'}
              </p>
            </div>
            <StatusPill tone={runtime?.available ? 'ok' : 'warn'}>
              {runtime?.available ? 'Studio ready' : 'Studio blocked'}
            </StatusPill>
          </div>

          <button
            className="play-button"
            onClick={() => void run(null)}
            disabled={running}
            aria-label="Open Roblox Studio"
          >
            <span className="play-button__ring" aria-hidden="true" />
            {running ? <Spinner size={26} /> : <PlayIcon size={30} />}
            <span className="play-button__label">{running ? 'Checking…' : 'Open Studio'}</span>
          </button>

          <ul className="launch-card__facts">
            <li>
              <span>Installation</span>
              <strong>
                {installation ? installation.status.replace(/-/g, ' ') : 'unknown'}
              </strong>
            </li>
            <li>
              <span>Wine</span>
              <strong>
                {runtime?.studio.wine.present
                  ? runtime.studio.wine.version ?? 'present'
                  : 'not installed'}
              </strong>
            </li>
            <li>
              <span>Studio</span>
              <strong>
                {runtime?.present ? runtime.studio.studio.version ?? 'installed' : 'not installed'}
              </strong>
            </li>
          </ul>

          {(result?.error || error) && (
            <ErrorNotice
              error={
                result?.error
                  ? { what: result.error.what, why: result.error.why, next: result.error.next, code: result.error.code }
                  : { what: error!.what, why: error!.why, next: error!.next }
              }
            />
          )}

          <Link to="/play" className="text-link">
            Open the full launch console <ArrowRightIcon size={14} />
          </Link>
        </Panel>

        <Panel
          title="System information"
          subtitle="Detected from this machine, not simulated"
          actions={
            <Button variant="ghost" size="sm" icon={<RefreshIcon size={14} />} onClick={() => void refresh()}>
              Refresh
            </Button>
          }
        >
          {system ? (
            <div className="kv-grid">
              <KeyValue label="Distribution" value={system.distribution.name} hint={system.distribution.matchesTarget ? 'Arch target met' : 'Xenity targets Arch Linux'} tone={system.distribution.matchesTarget ? 'ok' : 'warn'} />
              <KeyValue label="Kernel" value={system.kernel} hint={system.architecture} />
              <KeyValue label="CPU" value={system.cpu.model} hint={`${system.cpu.cores} threads`} />
              <KeyValue label="GPU" value={gpuLabel(system)} hint={system.gpu.devices[0]?.driver ?? 'no DRM device visible'} tone={system.gpu.devices.length ? 'ok' : 'warn'} />
              <KeyValue label="RAM" value={`${bytes(system.memory.used)} / ${bytes(system.memory.total)}`} hint={`${percent(system.memory.usedPercent)} in use`} />
              <KeyValue label="Graphics backend" value={system.graphics.backend} hint={`${system.graphics.sessionType} session`} tone={system.graphics.vulkan.available ? 'ok' : 'warn'} />
              <KeyValue
                label="Vulkan"
                value={system.graphics.vulkan.available ? system.graphics.vulkan.device ?? 'available' : 'unavailable'}
                hint={system.graphics.vulkan.detail}
                tone={system.graphics.vulkan.available ? 'ok' : 'warn'}
              />
              <KeyValue
                label="OpenGL"
                value={system.graphics.opengl.available ? system.graphics.opengl.renderer ?? 'available' : 'unavailable'}
                hint={system.graphics.opengl.detail}
                tone={system.graphics.opengl.available ? 'ok' : 'warn'}
              />
            </div>
          ) : (
            <p className="muted">System information is unavailable.</p>
          )}
        </Panel>
      </div>

      <Panel title="Quick actions" subtitle="The tasks you reach for most">
        <div className="quick-actions">
          <button className="quick-action" onClick={() => void run(null)} disabled={running}>
            <span className="quick-action__icon">
              <PlayIcon size={18} />
            </span>
            <span className="quick-action__text">
              <span className="quick-action__title">Open Roblox Studio</span>
              <span className="quick-action__hint">Runs the full launch sequence</span>
            </span>
          </button>

          <button className="quick-action" onClick={() => void checkUpdates()} disabled={checkingUpdates}>
            <span className="quick-action__icon">
              {checkingUpdates ? <Spinner size={18} /> : <RefreshIcon size={18} />}
            </span>
            <span className="quick-action__text">
              <span className="quick-action__title">Check for updates</span>
              <span className="quick-action__hint">Queries the configured channel</span>
            </span>
          </button>

          <button className="quick-action" onClick={() => navigate('/diagnostics')}>
            <span className="quick-action__icon">
              <DiagnosticsIcon size={18} />
            </span>
            <span className="quick-action__text">
              <span className="quick-action__title">Open diagnostics</span>
              <span className="quick-action__hint">Hardware, runtime and errors</span>
            </span>
          </button>

          <button className="quick-action" onClick={() => navigate('/diagnostics')}>
            <span className="quick-action__icon">
              <WrenchIcon size={18} />
            </span>
            <span className="quick-action__text">
              <span className="quick-action__title">Manage installation</span>
              <span className="quick-action__hint">Verify, repair and dependencies</span>
            </span>
          </button>
        </div>
      </Panel>

      <Panel
        title="Recent activity"
        subtitle="Studio launches recorded by the launcher"
        actions={
          <Button variant="ghost" size="sm" icon={<SparkIcon size={14} />} onClick={() => navigate('/library')}>
            Places
          </Button>
        }
      >
        {lastLaunch ? (
          <div className="activity">
            <span className={`activity__dot activity__dot--${lastLaunch.outcome === 'succeeded' ? 'ok' : 'danger'}`} />
            <div className="activity__text">
              <p className="activity__title">
                {lastLaunch.placeName ?? 'Roblox Studio'} — {lastLaunch.outcome}
              </p>
              <p className="activity__hint">{lastLaunch.message}</p>
            </div>
            <span className="activity__time">{relativeTime(lastLaunch.at)}</span>
          </div>
        ) : (
          <p className="muted">No launch attempts yet. The Play page records every result.</p>
        )}
      </Panel>
    </div>
  );
}
