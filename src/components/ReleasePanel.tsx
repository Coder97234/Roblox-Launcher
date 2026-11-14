import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { bytes, relativeTime } from '../lib/format';
import type { AppImageRelease } from '../lib/types';
import { DownloadIcon, TerminalIcon } from './Icons';
import { KeyValue, Panel, Spinner, StatusPill } from './ui';

const REPOSITORY = 'https://github.com/Coder97234/Roblox-Launcher';
const WORKFLOW = `${REPOSITORY}/actions/workflows/release.yml`;

/**
 * How a person gets Xenity onto their own Arch machine. The AppImage is built by
 * the release workflow in this repository — the same source the preview runs —
 * and a build made next to this checkout is offered for download directly.
 */
export function ReleasePanel() {
  const [release, setRelease] = useState<AppImageRelease | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRelease(await api.release());
      } catch {
        setRelease(null);
      }
    })();
  }, []);

  const builtHere = Boolean(release?.available);

  return (
    <Panel
      title="Get Xenity for Linux"
      subtitle="One AppImage, no installer, no root"
      actions={<StatusPill tone="accent">AppImage</StatusPill>}
    >
      <p className="panel__text">
        Xenity ships as a single executable AppImage. Download it, make it executable and run it —
        the launcher starts, and the first time you press Play it fetches the Cordial engine into
        its own data directory.
      </p>

      <div className="kv-grid">
        <KeyValue label="Format" value="AppImage" hint="x86_64, self-contained" tone="accent" />
        <KeyValue label="Engine" value="Cordial" hint="downloaded on install, not baked in" />
        <KeyValue
          label="Build"
          value={builtHere ? (release?.size ? bytes(release.size) : 'ready') : 'not built here'}
          hint={builtHere ? relativeTime(release?.builtAt ?? null) : `run ${release?.buildCommand ?? 'npm run appimage'}`}
          tone={builtHere ? 'ok' : 'muted'}
        />
      </div>

      <div className="play-panel__actions">
        {builtHere ? (
          <a className="btn btn--primary btn--md" href="/api/release/appimage" download>
            <span className="btn__icon">
              <DownloadIcon size={14} />
            </span>
            Download {release?.file}
          </a>
        ) : release === null ? (
          <span className="panel__footnote">
            <Spinner size={12} /> Checking for a build…
          </span>
        ) : (
          <a
            className="btn btn--primary btn--md"
            href={release.latest}
            target="_blank"
            rel="noreferrer"
          >
            <span className="btn__icon">
              <DownloadIcon size={14} />
            </span>
            Download the latest AppImage
          </a>
        )}
        <a className="btn btn--secondary btn--md" href={WORKFLOW} target="_blank" rel="noreferrer">
          <span className="btn__icon">
            <TerminalIcon size={14} />
          </span>
          Build log
        </a>
      </div>

      <p className="panel__footnote">chmod +x Xenity-*.AppImage &amp;&amp; ./Xenity-*.AppImage</p>
      <p className="panel__footnote">
        {builtHere
          ? `Built in ${release?.directory}. The repository's release workflow publishes the same file on a version tag.`
          : `Nothing built in ${release?.directory ?? 'this checkout'} yet — push a version tag to run the release workflow, or run ${release?.buildCommand ?? 'npm run appimage'} here.`}
      </p>
    </Panel>
  );
}
