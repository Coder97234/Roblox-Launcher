import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { bytes, relativeTime } from '../lib/format';
import type { SwapStatus } from '../lib/types';
import { useNotifications } from '../state/notifications';
import { CheckIcon, HardDriveIcon, RefreshIcon, TrashIcon } from './Icons';
import { Button, ErrorNotice, KeyValue, Panel, Select, Spinner, StatusPill } from './ui';

// The one file Xenity ever creates on the chosen drive.
const SWAP_FILE_LABEL = '.xenity-swap';

const PHASE_LABEL: Record<string, string> = {
  idle: 'Idle',
  checking: 'Checking the drive…',
  allocating: 'Writing the swap file…',
  formatting: 'Preparing the swap file…',
  activating: 'Turning swap on…',
  deactivating: 'Turning swap off…',
  deleting: 'Deleting the swap file…',
  done: 'Finished',
  failed: 'Failed',
};

function driveTitle(drive: SwapStatus['drives'][number]) {
  const name = drive.label || drive.model || drive.device;
  return `${name} · ${bytes(drive.freeBytes)} free · ${drive.mountPoint}`;
}

/**
 * External storage as extra RAM. "Swap" writes one Xenity-owned swap file that
 * fills the drive's free space and turns it on; "Delete" turns it off again and
 * removes that same file. Nothing else on the drive is ever touched.
 */
export function SwapPanel() {
  const { notify } = useNotifications();
  const [state, setState] = useState<SwapStatus | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api.swap());
    } catch {
      // Reported below through the job/error notices when an action runs.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const job = state?.job;
  const running = job?.status === 'running';
  const drives = state?.drives ?? [];
  const managed = state?.managed ?? null;
  const active = state?.active ?? [];

  useEffect(() => {
    if (!state) return;
    if (selected && drives.some((drive) => drive.mountPoint === selected)) return;
    const fallbackDrive = drives.find((drive) => drive.supportsSwap) ?? drives[0];
    setSelected(managed?.mountPoint ?? fallbackDrive?.mountPoint ?? '');
  }, [state, drives, managed, selected]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        setState(await api.swap());
      } catch {
        // A dropped poll is not a failure; the next tick retries.
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [running]);

  // A job that fails after it started (swapon refusing the file) reports here.
  useEffect(() => {
    if (job?.status !== 'failed' || !job.error) return;
    setError(
      new ApiError(
        job.action === 'remove' ? 'The swap file could not be deleted.' : 'The swap file could not be created.',
        job.error,
        job.action === 'remove'
          ? 'Unmount the drive and remove .xenity-swap by hand.'
          : 'Pick another drive, or reformat this one as ext4.',
      ),
    );
  }, [job?.status, job?.error, job?.action]);

  const drive = drives.find((entry) => entry.mountPoint === selected) ?? null;

  const createSwap = async () => {
    if (!drive) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.createSwap(drive.mountPoint);
      setState(next);
      if (next.job.status === 'failed') {
        setError(
          new ApiError(
            'The swap file could not be created.',
            next.job.error ?? 'The drive rejected the file.',
            'Pick another drive, or reformat this one as ext4.',
          ),
        );
      } else {
        notify({
          title: 'Turning the drive into swap',
          description: `Filling ${drive.mountPoint} with a ${bytes(drive.swapSizeBytes)} swap file.`,
          tone: 'info',
        });
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError('The swap file could not be created.', String(cause), 'Try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteSwap = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.deleteSwap();
      setState(next);
      if (next.job.status === 'failed') {
        setError(
          new ApiError(
            'The swap file could not be deleted.',
            next.job.error ?? 'The drive refused the removal.',
            'Unmount the drive and remove .xenity-swap by hand.',
          ),
        );
      } else if (next.job.message) {
        notify({ title: 'Swap removed', description: next.job.message, tone: 'success' });
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError('The swap file could not be deleted.', String(cause), 'Try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const tools = state?.tools;

  return (
    <Panel
      title="Use external storage as RAM"
      subtitle="A swap file on a microSD or USB drive, sized to fill it"
      actions={
        <StatusPill tone={managed?.active ? 'ok' : 'muted'}>
          {managed?.active ? 'Swap active' : 'No Xenity swap'}
        </StatusPill>
      }
    >
      <div className="kv-grid">
        <KeyValue
          label="Xenity swap"
          value={managed ? (managed.active ? bytes(managed.sizeBytes) : 'file missing') : 'none'}
          hint={managed?.file ?? 'nothing created yet'}
          tone={managed?.active ? 'ok' : 'muted'}
        />
        <KeyValue
          label="Swap in use"
          value={active.length ? bytes(active.reduce((sum, entry) => sum + entry.sizeBytes, 0)) : 'none'}
          hint={active.length ? active.map((entry) => entry.file).join(', ') : 'the kernel reports no active swap'}
          tone={active.length ? 'ok' : 'muted'}
        />
        <KeyValue
          label="Created"
          value={managed?.createdAt ? relativeTime(managed.createdAt) : '—'}
          hint={managed?.mountPoint ?? ''}
        />
      </div>

      {drives.length > 0 ? (
        <>
          <div className="field-stack">
            <Select
              label="Drive"
              description="Only mounted external drives appear here."
              value={selected}
              onChange={setSelected}
              options={drives.map((entry) => ({ value: entry.mountPoint, label: driveTitle(entry) }))}
            />
          </div>

          {drive && (
            <div className="play-panel__status">
              <div>
                <span className="micro-label">Swap file</span>
                <span className="micro-value">
                  {drive.supportsSwap ? bytes(drive.swapSizeBytes) : 'not possible'}
                </span>
              </div>
              <div>
                <span className="micro-label">Filesystem</span>
                <span className="micro-value">{drive.filesystem ?? 'unknown'}</span>
              </div>
              <div>
                <span className="micro-label">Drive size</span>
                <span className="micro-value">{drive.sizeBytes ? bytes(drive.sizeBytes) : 'unknown'}</span>
              </div>
            </div>
          )}

          {drive && !drive.supportsSwap && <p className="panel__footnote">{drive.reason}</p>}
        </>
      ) : (
        <p className="panel__text">
          No mounted external drive is visible. Plug the card in, mount it from your file manager,
          then press Refresh drives.
        </p>
      )}

      {running && (
        <>
          <div className="progress" role="progressbar" aria-valuenow={job?.percent ?? 0} aria-label="Swap operation">
            <span className="progress__bar" style={{ width: `${Math.max(job?.percent ?? 0, 4)}%` }} />
          </div>
          <p className="panel__footnote">
            {PHASE_LABEL[job?.phase ?? 'idle'] ?? job?.phase}
            {job?.sizeBytes
              ? ` ${job.percent}% · ${bytes(job.received)} of ${bytes(job.sizeBytes)}`
              : ''}
          </p>
        </>
      )}

      {job?.status === 'done' && !running && job.message && (
        <div className="notice notice--success">
          <span className="notice__icon">
            <CheckIcon size={18} />
          </span>
          <div className="notice__body">
            <p className="notice__what">{job.action === 'remove' ? 'Swap removed.' : 'Swap is on.'}</p>
            <p className="notice__text">{job.message}</p>
          </div>
        </div>
      )}

      {error && (
        <ErrorNotice error={{ what: error.what, why: error.why, next: error.next }} onDismiss={() => setError(null)} />
      )}

      <div className="play-panel__actions">
        <Button
          variant="primary"
          icon={busy && running ? <Spinner size={14} /> : <HardDriveIcon size={14} />}
          disabled={!drive?.supportsSwap || running || busy}
          onClick={() => void createSwap()}
          title="Create a swap file filling this drive and turn it on"
        >
          {running && job?.action === 'create' ? 'Creating…' : 'Swap'}
        </Button>
        <Button
          variant="danger"
          icon={<TrashIcon size={14} />}
          disabled={!managed || running || busy}
          onClick={() => void deleteSwap()}
          title="Turn the swap file off and delete it"
        >
          {running && job?.action === 'remove' ? 'Deleting…' : 'Delete'}
        </Button>
        <Button variant="ghost" size="sm" icon={<RefreshIcon size={14} />} disabled={running || busy} onClick={() => void load()}>
          Refresh drives
        </Button>
      </div>

      <p className="panel__footnote">
        Swap lives in <code>{SWAP_FILE_LABEL}</code> at the root of the drive you pick and stays on
        until you delete it or unplug the drive. Swap on a card is much slower than real RAM, and
        FAT/exFAT drives must be reformatted as ext4 first.
      </p>
      {tools && !tools.available && <p className="panel__footnote">{tools.detail}</p>}
      {tools?.available && <p className="panel__footnote">Swap actions ask for your password through {tools.privilege}.</p>}
    </Panel>
  );
}
