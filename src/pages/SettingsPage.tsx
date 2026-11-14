import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { Settings, StorageReport, UpdateCheck } from '../lib/types';
import { useNotifications } from '../state/notifications';
import { useSystem } from '../state/system';
import { RefreshIcon, TrashIcon, WrenchIcon } from '../components/Icons';
import { Button, KeyValue, Panel, Select, Spinner, TextField, Toggle } from '../components/ui';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'studio', label: 'Studio' },
  { id: 'storage', label: 'Storage' },
  { id: 'updates', label: 'Updates' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function SettingsPage() {
  const { settings, applySettings, refresh, overview } = useSystem();
  const { notify } = useNotifications();
  const [section, setSection] = useState<SectionId>('general');
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheck | null>(null);
  const [updateHistory, setUpdateHistory] = useState<UpdateCheck[]>([]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    void api
      .storage()
      .then(setStorage)
      .catch(() => setStorage(null));
  }, [draft?.storage.cacheDirectory]);

  const dirty = useMemo(
    () => Boolean(draft && settings && JSON.stringify(draft) !== JSON.stringify(settings)),
    [draft, settings],
  );

  const patch = <K extends keyof Settings>(key: K, value: Partial<Settings[K]>) => {
    setDraft((current) => (current ? { ...current, [key]: { ...current[key], ...value } } : current));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await api.saveSettings(draft);
      applySettings(response.settings);
      notify({
        title: 'Configuration saved',
        description: 'Written to the Xenity configuration directory.',
        tone: 'success',
      });
    } catch (cause) {
      notify({
        title: 'Configuration could not be saved',
        description: cause instanceof ApiError ? cause.what : 'The backend rejected the change.',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const clearCache = async () => {
    setClearing(true);
    try {
      const result = await api.clearCache();
      setStorage(await api.storage());
      notify({ title: 'Cache cleared', description: result.message, tone: 'success' });
    } catch (cause) {
      notify({
        title: 'Cache could not be cleared',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    } finally {
      setClearing(false);
    }
  };

  const resetConfiguration = async () => {
    setConfirmReset(false);
    try {
      const response = await api.resetSettings();
      applySettings(response.settings);
      notify({ title: 'Configuration reset', description: 'Every preference is back to its default.', tone: 'warn' });
    } catch (cause) {
      notify({
        title: 'Reset failed',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    }
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const result = await api.checkUpdates();
      setUpdateResult(result);
      setUpdateHistory(result.history);
      notify({
        title: result.status === 'update-available' ? 'Update available' : 'Update check finished',
        description: result.message,
        tone: result.status === 'failed' ? 'danger' : 'info',
      });
    } catch (cause) {
      notify({
        title: 'Update check failed',
        description: cause instanceof ApiError ? cause.what : 'The updater is unreachable.',
        tone: 'danger',
      });
    } finally {
      setChecking(false);
    }
  };

  if (!draft) {
    return (
      <div className="page-loading">
        <Spinner size={18} />
        <span>Loading configuration…</span>
      </div>
    );
  }

  const runtime = overview?.runtime;

  return (
    <div className="settings">
      <nav className="settings__nav" aria-label="Settings sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            className={`settings__nav-item ${section === item.id ? 'settings__nav-item--active' : ''}`}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="settings__body stack">
        {section === 'general' && (
          <Panel title="General" subtitle="Startup, tray and appearance">
            <div className="field-stack">
              <Toggle
                label="Launch on startup"
                description="Start Xenity when your desktop session begins."
                checked={draft.general.launchOnStartup}
                onChange={(value) => patch('general', { launchOnStartup: value })}
              />
              <Toggle
                label="Minimize to tray"
                description="Keep Xenity running in the system tray when the window closes."
                checked={draft.general.minimizeToTray}
                onChange={(value) => patch('general', { minimizeToTray: value })}
              />
              <Select
                label="Language"
                description="Interface language."
                value={draft.general.language}
                onChange={(value) => patch('general', { language: value })}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'Deutsch' },
                  { value: 'fr', label: 'Français' },
                  { value: 'es', label: 'Español' },
                  { value: 'pt-BR', label: 'Português (Brasil)' },
                ]}
              />
              <Select
                label="Theme"
                description="Applied immediately."
                value={draft.general.theme}
                onChange={(value) => patch('general', { theme: value })}
                options={[
                  { value: 'xenity-dark', label: 'Xenity dark' },
                  { value: 'charcoal', label: 'Charcoal' },
                  { value: 'midnight', label: 'Midnight violet' },
                ]}
              />
              <Toggle
                label="Notifications"
                description="Show in-app notifications for launches, updates and errors."
                checked={draft.general.notifications}
                onChange={(value) => patch('general', { notifications: value })}
              />
            </div>
            <p className="panel__footnote">
              Preferences are written to the Xenity configuration file. Session autostart and tray
              integration are applied by the native desktop shell, which is not part of this build.
            </p>
          </Panel>
        )}

        {section === 'graphics' && (
          <Panel title="Graphics" subtitle="Backend and presentation preferences">
            <div className="field-stack">
              <Select
                label="Graphics backend"
                description="Automatic picks Vulkan when a device supports it."
                value={draft.graphics.backend}
                onChange={(value) => patch('graphics', { backend: value })}
                options={[
                  { value: 'auto', label: 'Automatic' },
                  { value: 'vulkan', label: 'Vulkan' },
                  { value: 'opengl', label: 'OpenGL' },
                ]}
              />
              <Toggle
                label="VSync"
                description="Synchronise presentation with the display refresh rate."
                checked={draft.graphics.vsync}
                onChange={(value) => patch('graphics', { vsync: value })}
              />
              <Select
                label="Resolution"
                description="Preferred render resolution."
                value={draft.graphics.resolution}
                onChange={(value) => patch('graphics', { resolution: value })}
                options={[
                  { value: 'auto', label: 'Automatic' },
                  { value: 'native', label: 'Native display' },
                  { value: '1600x900', label: '1600 × 900' },
                  { value: '1920x1080', label: '1920 × 1080' },
                  { value: '2560x1440', label: '2560 × 1440' },
                ]}
              />
              <Select
                label="Frame rate cap"
                description="Applied where the runtime supports it."
                value={draft.graphics.fpsCap}
                onChange={(value) => patch('graphics', { fpsCap: value })}
                options={[
                  { value: 'auto', label: 'Automatic' },
                  { value: '30', label: '30 fps' },
                  { value: '60', label: '60 fps' },
                  { value: '120', label: '120 fps' },
                  { value: '144', label: '144 fps' },
                  { value: 'unlimited', label: 'Unlimited' },
                ]}
              />
            </div>
            <p className="panel__footnote">
              These values are stored and will be handed to the graphics backend once the runtime
              exists. No renderer is active in this build, so nothing is applied to a running game.
            </p>
          </Panel>
        )}

        {section === 'studio' && (
          <Panel title="Studio" subtitle="Wine prefix and the build Xenity launches">
            <div className="kv-grid kv-grid--wide">
              <KeyValue
                label="Wine"
                value={runtime?.studio.wine.present ? runtime.studio.wine.version ?? 'present' : 'not installed'}
                hint={runtime?.studio.wine.binary ?? runtime?.studio.installHint ?? ''}
                tone={runtime?.studio.wine.present ? 'ok' : 'warn'}
              />
              <KeyValue
                label="Studio build"
                value={runtime?.present ? runtime.studio.studio.version ?? 'installed' : 'not installed'}
                hint={runtime?.studio.studio.exe ?? 'run Roblox’s installer from the Studio page'}
                tone={runtime?.present ? 'ok' : 'warn'}
              />
              <KeyValue
                label="Prefix"
                value={runtime?.studio.prefix.initialized ? 'initialised' : 'not initialised'}
                hint={runtime?.studio.prefix.path ?? ''}
                tone={runtime?.studio.prefix.initialized ? 'ok' : 'warn'}
              />
              <KeyValue
                label="Status"
                value={runtime?.available ? 'studio ready' : runtime?.state ?? 'unknown'}
                hint={runtime?.checkedAt ? relativeTime(runtime.checkedAt) : ''}
              />
            </div>
            <div className="field-stack">
              <TextField
                label="Wine prefix"
                description="Leave blank to use Xenity’s own prefix under its data directory. An absolute path uses an existing prefix instead."
                value={draft.studio.prefixPath}
                onChange={(value) => patch('studio', { prefixPath: value })}
              />
              <Select
                label="Direct3D backend"
                description="DXVK translates Direct3D to Vulkan and is what Studio’s viewport expects."
                value={draft.studio.renderer}
                onChange={(value) => patch('studio', { renderer: value })}
                options={[
                  { value: 'auto', label: 'Automatic (DXVK when present)' },
                  { value: 'vulkan', label: 'Vulkan (DXVK)' },
                  { value: 'opengl', label: 'OpenGL (Wine’s built-in Direct3D)' },
                ]}
              />
              <Toggle
                label="Use DXVK"
                description="Run Studio’s Direct3D 11 through DXVK inside the prefix."
                checked={draft.studio.dxvk}
                onChange={(value) => patch('studio', { dxvk: value })}
              />
              <Toggle
                label="Validate on start"
                description="Re-check Wine, the prefix and the Studio build before every launch."
                checked={draft.studio.autoValidate}
                onChange={(value) => patch('studio', { autoValidate: value })}
              />
            </div>
            <div className="inline-actions">
              <Button variant="secondary" size="sm" icon={<RefreshIcon size={14} />} onClick={() => void refresh()}>
                Re-run validation
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<WrenchIcon size={14} />}
                onClick={() =>
                  notify({
                    title: runtime?.studio.instances
                      ? `${runtime.studio.instances} Studio process${runtime.studio.instances === 1 ? '' : 'es'} running`
                      : 'No Studio process running',
                    description:
                      runtime?.studio.instances
                        ? 'Started by Xenity in this session; Wine’s output is in the Xenity log.'
                        : runtime?.reason ?? 'Xenity has not started Studio in this session.',
                    tone: runtime?.studio.instances ? 'info' : 'warn',
                  })
                }
              >
                Running processes
              </Button>
            </div>
            <p className="panel__text">{runtime?.next}</p>
          </Panel>
        )}

        {section === 'storage' && (
          <Panel title="Storage" subtitle="Xenity-owned directories only">
            <div className="storage">
              <div className="storage__head">
                <span className="micro-label">Total</span>
                <span className="storage__total">{storage?.totalHuman ?? '—'}</span>
                <span className="micro-label">{storage?.root ?? ''}</span>
              </div>
              <ul className="storage__areas">
                {(storage?.areas ?? []).map((area) => {
                  const max = Math.max(1, ...(storage?.areas ?? []).map((entry) => entry.bytes));
                  return (
                    <li key={area.id} className="storage__area">
                      <span className="storage__area-label">{area.label}</span>
                      <span className="storage__bar">
                        <span className="storage__fill" style={{ width: `${Math.max(2, (area.bytes / max) * 100)}%` }} />
                      </span>
                      <span className="storage__size">{area.human}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="field-stack">
              <TextField
                label="Installation directory"
                description="Where application bundles and runtime images are stored."
                value={draft.storage.installationDirectory}
                onChange={(value) => patch('storage', { installationDirectory: value })}
              />
              <TextField
                label="Cache location"
                description="Safe to clear at any time."
                value={draft.storage.cacheDirectory}
                onChange={(value) => patch('storage', { cacheDirectory: value })}
              />
            </div>

            <div className="inline-actions">
              <Button variant="secondary" size="sm" icon={clearing ? <Spinner size={13} /> : <TrashIcon size={14} />} onClick={() => void clearCache()} disabled={clearing}>
                Clear Xenity cache
              </Button>
              {confirmReset ? (
                <div className="confirm">
                  <span>Reset every preference to its default?</span>
                  <Button variant="danger" size="sm" onClick={() => void resetConfiguration()}>
                    Reset configuration
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
                  Reset configuration
                </Button>
              )}
            </div>
            <p className="panel__footnote">
              Cleanup is restricted to Xenity-owned directories. No unrelated user files are touched.
            </p>
          </Panel>
        )}

        {section === 'updates' && (
          <Panel title="Updates" subtitle="Launcher version and channel">
            <div className="kv-grid">
              <KeyValue label="Current version" value={`Xenity ${overview?.version.version ?? '0.1.0'}`} hint="this build" />
              <KeyValue label="Channel" value={draft.updates.channel} hint="applied on the next check" />
              <KeyValue
                label="Latest known"
                value={updateResult?.latestVersion ?? 'unknown'}
                hint={updateResult ? updateResult.status : 'no check yet'}
                tone={updateResult?.status === 'update-available' ? 'warn' : 'muted'}
              />
            </div>
            <div className="field-stack">
              <Select
                label="Update channel"
                value={draft.updates.channel}
                onChange={(value) => patch('updates', { channel: value })}
                options={[
                  { value: 'stable', label: 'Stable' },
                  { value: 'beta', label: 'Beta' },
                  { value: 'nightly', label: 'Nightly' },
                ]}
              />
              <Toggle
                label="Check on startup"
                description="Look for a newer build when Xenity opens."
                checked={draft.updates.checkOnStartup}
                onChange={(value) => patch('updates', { checkOnStartup: value })}
              />
            </div>
            <div className="inline-actions">
              <Button variant="secondary" size="sm" icon={checking ? <Spinner size={13} /> : <RefreshIcon size={14} />} onClick={() => void checkUpdates()} disabled={checking}>
                Check for updates
              </Button>
            </div>
            {updateResult && <p className="panel__text">{updateResult.message} {updateResult.next}</p>}
            {updateHistory.length > 0 && (
              <ul className="history">
                {updateHistory.map((entry, index) => (
                  <li key={`${entry.checkedAt}-${index}`} className="history__row">
                    <span className="history__name">{entry.status}</span>
                    <span className="history__message">{entry.message}</span>
                    <span className="history__time">{relativeTime(entry.checkedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <div className={`settings__footer ${dirty ? 'settings__footer--dirty' : ''}`}>
          <span className="settings__footer-text">
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <div className="inline-actions">
            <Button variant="ghost" size="sm" onClick={() => setDraft(settings)} disabled={!dirty}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
