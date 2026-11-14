import { useSystem } from '../state/system';
import { CheckIcon, CloseIcon, ShieldIcon } from '../components/Icons';
import { KeyValue, Panel, StatusPill } from '../components/ui';

const IMPLEMENTED = [
  'Main application window shell with persistent navigation',
  'Home dashboard, Play, Library, Settings, Diagnostics and About screens',
  'Persistent configuration in the Xenity config directory',
  'System information detection (distribution, kernel, CPU, GPU, RAM, session)',
  'Graphics probing for Vulkan and OpenGL availability',
  'Dependency validation with exact Arch package names',
  'Structured logging with rotation and redacted export',
  'Eight-step launch sequence that stops honestly at the first blocker',
  'Storage reporting and Xenity-scoped cache cleanup',
];

const PLANNED = [
  'Android runtime integration (Waydroid backend first)',
  'APK split validation: manifest, ABI and signature checks',
  'Graphics backend, shader cache and frame pacing',
  'Input translation for keyboard, mouse and controllers',
  'Deep-link launching through official Roblox mechanisms',
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
            <StatusPill tone={runtime?.implemented ? 'ok' : 'warn'}>
              {runtime?.implemented ? 'Runtime integrated' : 'Runtime not implemented'}
            </StatusPill>
          </div>
        </div>
      </section>

      <div className="grid grid--main">
        <Panel title="What this build is" subtitle="Milestone one of the launcher">
          <p className="panel__text">
            Xenity is a Linux Roblox launcher. This build is the launcher shell: window layout,
            navigation, dashboards, persisted configuration, system detection, logging and the launch
            pipeline. It deliberately contains no Roblox runtime, so it never claims a launch it did
            not perform.
          </p>
          <p className="panel__text">
            The interface is written in React and TypeScript behind a thin Node service that owns
            every privileged operation. That split is deliberate: the same interface loads unchanged
            inside a Tauri window (WebKitGTK on Arch), while the service layer keeps filesystem,
            process and detection code out of the renderer. Tauri is the chosen shell because it
            ships a small native binary, uses the system WebKit runtime instead of bundling Chromium,
            and integrates cleanly with Arch packaging.
          </p>
          <div className="kv-grid">
            <KeyValue label="Version" value={`Xenity ${overview?.version.version ?? '0.1.0'}`} hint={`${overview?.version.channel ?? 'stable'} channel`} />
            <KeyValue label="Target" value="Arch Linux" hint={overview?.system.distribution.name ?? ''} />
            <KeyValue label="Runtime" value={runtime?.backendName ?? 'none'} hint={runtime?.state ?? ''} />
          </div>
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
