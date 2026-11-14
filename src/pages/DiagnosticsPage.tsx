import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { bytes, clockTime, percent, uptime } from '../lib/format';
import type { Diagnostics, StudioDoctorResult } from '../lib/types';
import { useNotifications } from '../state/notifications';
import { CopyIcon, DownloadIcon, RefreshIcon, ShieldIcon, WrenchIcon } from '../components/Icons';
import { Button, ErrorNotice, KeyValue, Panel, Spinner, StatusPill } from '../components/ui';

export function DiagnosticsPage() {
  const { notify } = useNotifications();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ what: string; why: string; next: string } | null>(null);
  const [busy, setBusy] = useState<'copy' | 'export' | 'repair' | 'doctor' | 'open' | null>(null);
  const [doctor, setDoctor] = useState<StudioDoctorResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.diagnostics());
      setError(null);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : null;
      setError({
        what: apiError?.what ?? 'Diagnostics could not be collected.',
        why: apiError?.why ?? String(cause),
        next: apiError?.next ?? 'Try refreshing.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const copyReport = async () => {
    setBusy('copy');
    try {
      const report = await api.diagnosticsReport();
      await navigator.clipboard.writeText(report);
      notify({
        title: 'Diagnostic report copied',
        description: 'Credentials and tokens are stripped before export.',
        tone: 'success',
      });
    } catch {
      notify({
        title: 'Clipboard unavailable',
        description: 'The browser blocked clipboard access — export the report instead.',
        tone: 'warn',
      });
    } finally {
      setBusy(null);
    }
  };

  const exportLogs = async () => {
    setBusy('export');
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
    } finally {
      setBusy(null);
    }
  };

  const repair = async () => {
    setBusy('repair');
    try {
      const result = await api.repair();
      await load();
      notify({ title: 'Installation repaired', description: result.message, tone: 'success' });
    } catch (cause) {
      notify({
        title: 'Repair failed',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  const runStudioDoctor = async () => {
    setBusy('doctor');
    try {
      const result = await api.studioDoctor();
      setDoctor(result);
      notify({
        title: result.blocked ? 'Studio doctor found a blocker' : 'Studio doctor passed',
        description: result.reason ?? '',
        tone: result.blocked ? 'warn' : 'success',
      });
    } catch (cause) {
      notify({
        title: 'Doctor could not run',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  const openStudio = async () => {
    setBusy('open');
    try {
      const result = await api.studioOpen();
      notify({
        title: result.started ? 'Roblox Studio opened' : 'Roblox Studio did not open',
        description: result.started
          ? 'The editor window is Studio’s own, running through Wine.'
          : 'Check Wine’s output in the Xenity log.',
        tone: result.started ? 'success' : 'danger',
      });
    } catch (cause) {
      notify({
        title: 'Roblox Studio could not be opened',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  const system = data?.system;
  const runtime = data?.runtime;
  const installation = data?.installation;

  return (
    <div className="stack">
      {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}

      <Panel
        title="Diagnostic dashboard"
        subtitle={
          data
            ? `Snapshot generated ${clockTime(data.generatedAt)} · Xenity ${data.version.version}`
            : 'Collecting snapshot'
        }
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<RefreshIcon size={14} />} onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" icon={busy === 'copy' ? <Spinner size={13} /> : <CopyIcon size={14} />} onClick={() => void copyReport()} disabled={busy !== null}>
              Copy report
            </Button>
            <Button variant="secondary" size="sm" icon={busy === 'export' ? <Spinner size={13} /> : <DownloadIcon size={14} />} onClick={() => void exportLogs()} disabled={busy !== null}>
              Export logs
            </Button>
          </>
        }
      >
        {loading && !data ? (
          <div className="page-loading">
            <Spinner size={18} />
            <span>Probing hardware and runtime…</span>
          </div>
        ) : system ? (
          <div className="kv-grid kv-grid--wide">
            <KeyValue label="Operating system" value={system.distribution.name} hint={`id: ${system.distribution.id}`} />
            <KeyValue label="Kernel" value={system.kernel} hint={system.architecture} />
            <KeyValue label="Hostname" value={system.hostname} hint={`up ${uptime(system.uptimeSeconds)}`} />
            <KeyValue label="CPU" value={system.cpu.model} hint={`${system.cpu.cores} threads`} />
            <KeyValue
              label="GPU"
              value={system.gpu.devices.length ? system.gpu.devices.map((gpu) => `${gpu.vendor} ${gpu.deviceId ?? ''}`).join(' · ') : 'Not detected'}
              hint={system.gpu.renderNodes.length ? `render nodes: ${system.gpu.renderNodes.join(', ')}` : 'no render nodes visible'}
              tone={system.gpu.devices.length ? 'ok' : 'warn'}
            />
            <KeyValue
              label="Graphics driver"
              value={system.gpu.devices[0]?.driver ?? 'unknown'}
              hint={system.graphics.sessionType}
            />
            <KeyValue label="RAM" value={`${bytes(system.memory.used)} / ${bytes(system.memory.total)}`} hint={`${percent(system.memory.usedPercent)} used`} />
            <KeyValue
              label="Vulkan"
              value={system.graphics.vulkan.available ? system.graphics.vulkan.device ?? 'available' : 'unavailable'}
              hint={system.graphics.vulkan.detail}
              tone={system.graphics.vulkan.available ? 'ok' : 'warn'}
            />
          </div>
        ) : null}
      </Panel>

      <div className="grid grid--main">
        <Panel
          title="Studio & Wine"
          subtitle="Roblox Studio in Xenity’s Wine prefix, and the machine checks behind it"
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void openStudio()}
                disabled={busy !== null || !runtime?.present}
              >
                Open Studio
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={busy === 'doctor' ? <Spinner size={13} /> : <WrenchIcon size={14} />}
                onClick={() => void runStudioDoctor()}
                disabled={busy !== null}
              >
                Run doctor
              </Button>
            </>
          }
        >
          {runtime && (
            <>
              <div className="runtime-head">
                <StatusPill tone={runtime.available ? 'ok' : 'warn'}>
                  {runtime.available ? `${runtime.backendName} ready` : 'Studio blocked'}
                </StatusPill>
                <span className="muted">state: {runtime.state}</span>
              </div>
              <p className="panel__text">{runtime.reason}</p>
              <div className="kv-grid">
                <KeyValue
                  label="Wine"
                  value={runtime.studio.wine.present ? runtime.studio.wine.version ?? 'present' : 'not installed'}
                  hint={runtime.studio.wine.binary ?? runtime.studio.installHint}
                  tone={runtime.studio.wine.present ? 'ok' : 'warn'}
                />
                <KeyValue
                  label="Studio"
                  value={runtime.studio.studio.installed ? runtime.studio.studio.version ?? 'installed' : 'not installed'}
                  hint={runtime.studio.studio.exe ?? 'Roblox’s installer has not run yet'}
                  tone={runtime.studio.studio.installed ? 'ok' : 'warn'}
                />
                <KeyValue
                  label="Wine prefix"
                  value={runtime.studio.prefix.initialized ? 'initialised' : 'not initialised'}
                  hint={runtime.studio.prefix.path}
                  tone={runtime.studio.prefix.initialized ? 'ok' : 'warn'}
                />
                <KeyValue
                  label="Processes"
                  value={String(runtime.studio.instances)}
                  hint="started by Xenity"
                />
              </div>
              {doctor && (
                <>
                  <ul className="dep-list">
                    {doctor.checks.map((check) => (
                      <li key={check.id} className="dep">
                        <span
                          className={`dep__dot dep__dot--${check.status === 'ok' ? 'ok' : check.status === 'fail' ? 'danger' : 'warn'}`}
                        />
                        <span className="dep__binary">{check.label}</span>
                        <span className="dep__state">{check.detail}</span>
                      </li>
                    ))}
                  </ul>
                  <pre className="engine-doctor">
                    {doctor.lines.length ? doctor.lines.join('\n') : doctor.reason}
                  </pre>
                </>
              )}
            </>
          )}
        </Panel>

        <Panel
          title="Installation"
          subtitle="Directories, Studio build and dependencies"
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={busy === 'repair' ? <Spinner size={13} /> : <RefreshIcon size={14} />}
              onClick={() => void repair()}
              disabled={busy !== null}
            >
              Verify &amp; repair
            </Button>
          }
        >
          {installation && (
            <>
              <div className="runtime-head">
                <StatusPill tone={installation.dependencies.ok ? 'ok' : 'warn'}>
                  {installation.dependencies.ok ? 'Dependencies satisfied' : 'Dependencies missing'}
                </StatusPill>
                <span className="muted">
                  {installation.studio.present
                    ? `Roblox Studio ${installation.studio.version ?? ''} ready`.replace('  ', ' ').trim()
                    : 'Studio not installed'}
                </span>
              </div>
              <ul className="dep-list">
                {installation.dependencies.checks.map((check) => (
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
              {installation.dependencies.missingRequired.length > 0 && (
                <p className="dep__install-hint">
                  Install what Xenity requires on Arch with{' '}
                  <code>
                    sudo pacman -S{' '}
                    {installation.dependencies.missingRequired.map((check) => check.package).join(' ')}
                  </code>
                </p>
              )}
              {installation.studio.present ? null : (
                <p className="dep__install-hint">
                  Studio itself is installed separately: no build was found in{' '}
                  <code>{installation.studio.prefix}</code>. See the Studio panel on the Studio page
                  to run Roblox’s installer under Wine.
                </p>
              )}
            </>
          )}
        </Panel>
      </div>

      <Panel title="Recent errors" subtitle="Newest first, redacted before display">
        {data && data.errors.length > 0 ? (
          <ul className="error-list">
            {data.errors.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="error-row">
                <span className="error-row__time">{clockTime(entry.at)}</span>
                <span className="error-row__module">{entry.module}</span>
                <span className="error-row__message">{entry.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No errors recorded since the backend started.</p>
        )}
        <p className="privacy-note">
          <ShieldIcon size={14} /> {data?.privacyNote}
        </p>
      </Panel>
    </div>
  );
}
