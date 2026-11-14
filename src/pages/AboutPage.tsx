import { useSystem } from '../state/system';
import { CheckIcon, CloseIcon, ShieldIcon } from '../components/Icons';
import { KeyValue, Panel, StatusPill } from '../components/ui';
import { ReleasePanel } from '../components/ReleasePanel';

const IMPLEMENTED = [
  'Main application window shell with persistent navigation',
  'Home dashboard, Studio, Places, Settings, Diagnostics and About screens',
  'Persistent configuration in the Xenity config directory',
  'System information detection (distribution, kernel, CPU, GPU, RAM, session)',
  'Graphics probing for Vulkan and OpenGL availability',
  'Dependency validation with exact Arch package names',
  'Structured logging with rotation and redacted export',
  'Eight-step launch sequence that stops honestly at the first blocker',
  'Roblox Studio installed by Roblox’s own Windows installer',
  'Studio run by Wine inside a prefix Xenity owns, detected by its real build folder',
  'Place files handed to Studio, plus favorites and launch history',
  'A single-file AppImage built by the release workflow in this repository',
  'Wine/prefix/display/DXVK doctor checks, surfaced in Diagnostics',
  'Storage reporting and Xenity-scoped cache cleanup',
];

const PLANNED = [
  'Bundle a curated DXVK build with the launcher',
  'Per-place Wine prefix overrides and graphics flags',
  'Automatic Studio updates inside the prefix',
  'Roblox account sign-in helpers for the Studio client',
  'Sandboxing the prefix with bubblewrap',
  'Automatic updates with signature verification',
  'Crash management and safe recovery mode',
  'Additional distribution support beyond Arch Linux',
];

export function AboutPage() {
  const { overview } = useSystem();
  const runtime = overview?.runtime;

  return (
    <div className="stack">
      <section className="about-hero">
        <div className="about-hero__glow" aria-hidden="true" />
        <div className="about-hero__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="44" height="44" fill="none">
            <path d="M6 6l10 10L6 26" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M18 6l8 20" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h2 className="about-hero__name">XENITY</h2>
          <p className="about-hero__tagline">Redefine Your Roblox Experience.</p>
          <div className="about-hero__chips">
            <StatusPill tone="accent">Developer: Xen</StatusPill>
            <StatusPill tone="muted">Platform: Arch Linux</StatusPill>
            <StatusPill tone={runtime?.present ? 'ok' : 'warn'}>
              {runtime?.present
                ? `Studio ${runtime.studio.studio.version ?? ''}`.replace('  ', ' ').trim()
                : 'Studio not installed'}
            </StatusPill>
          </div>
        </div>
      </section>

      <ReleasePanel />

      <div className="grid grid--main">
        <Panel title="What this build is" subtitle="Milestone one of the launcher">
          <p className="panel__text">
            Xenity brings Roblox Studio to Linux. Roblox publishes Studio for Windows only, so Xenity
            runs that official Windows build through{' '}
            <a className="text-link" href="https://www.winehq.org/" target="_blank" rel="noreferrer">
              Wine
            </a>{' '}
            inside a prefix it owns: Roblox&rsquo;s own installer is downloaded from{' '}
            <code>setup.rbxcdn.com</code>, run under Wine, and the Studio build it leaves behind is
            what Xenity launches. Nothing is patched, repackaged or reverse engineered, and Roblox
            does not support Studio on Linux — Wine is the compatibility layer, and some machines
            will still hit driver limits.
          </p>
          <p className="panel__text">
            The interface is written in React and TypeScript behind a thin Node service that owns
            every privileged operation. The AppImage wraps exactly that: the compiled interface and
            the service in one executable, with the service bound to loopback and the window loading
            it from the same origin. Filesystem, process and detection code stay out of the renderer.
          </p>
          <div className="kv-grid">
            <KeyValue label="Version" value={`Xenity ${overview?.version.version ?? '0.1.0'}`} hint={`${overview?.version.channel ?? 'stable'} channel`} />
            <KeyValue label="Target" value="Arch Linux" hint={overview?.system.distribution.name ?? ''} />
            <KeyValue
              label="Studio"
              value={runtime?.present ? runtime.studio.studio.version ?? 'installed' : 'not installed'}
              hint={runtime?.studio.wine.version ? `Wine ${runtime.studio.wine.version}` : 'Wine not installed'}
              tone={runtime?.present ? 'ok' : 'warn'}
            />
          </div>
          <p className="panel__footnote">
            Roblox Studio is Roblox Corporation’s proprietary software and is not distributed with
            Xenity; the installer is fetched from Roblox and run locally under Wine. Xenity is
            GPL-3.0-or-later.
          </p>
        </Panel>

        <Panel title="Security commitments" subtitle="Non-negotiable">
          <ul className="checklist">
            {[
              'No anti-cheat bypass, memory patching or code injection.',
              'No modification of Roblox executable code or integrity checks.',
              'Application bundles come only from authorized sources you provide.',
              'No credential, token or account data is logged or exported.',
              'No destructive command runs without explicit confirmation.',
              'Least privilege: Xenity never asks to run as root.',
            ].map((item) => (
              <li key={item} className="checklist__item">
                <span className="checklist__icon">
                  <ShieldIcon size={14} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid grid--main">
        <Panel title="Implemented in this build" subtitle="Verified behaviour, not roadmap">
          <ul className="checklist checklist--ok">
            {IMPLEMENTED.map((item) => (
              <li key={item} className="checklist__item">
                <span className="checklist__icon checklist__icon--ok">
                  <CheckIcon size={14} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Not implemented yet" subtitle="Shown as unavailable in the interface">
          <ul className="checklist checklist--pending">
            {PLANNED.map((item) => (
              <li key={item} className="checklist__item">
                <span className="checklist__icon checklist__icon--muted">
                  <CloseIcon size={14} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
