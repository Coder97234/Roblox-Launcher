import { detectSystem, probe, which } from './system_detection.js';

/**
 * Runtime manager.
 *
 * The Android execution runtime is NOT implemented in this build. This module
 * only detects which backends exist on the machine and reports their honest
 * state, so the launcher can explain why a launch cannot proceed instead of
 * pretending one happened.
 *
 * Backend interface (stable for future implementations):
 *   isPresent(): boolean         — is the backend installed on this machine?
 *   isRunning(): boolean         — is it currently up?
 *   launch(appId): Promise<...>  — start an application (not implemented yet)
 */

const BACKENDS = [
  {
    id: 'waydroid',
    name: 'Waydroid',
    description:
      'Container-based Android (LineageOS) running on the host kernel with Wayland surfaces.',
    detect: () => {
      const binary = which('waydroid');
      if (!binary) {
        return { present: false, running: false, detail: 'waydroid binary not found in PATH.' };
      }
      const status = probe('waydroid', ['status'], 6000);
      const running = Boolean(status.output && /Session:\s*RUNNING/i.test(status.output));
      return {
        present: true,
        running,
        detail: running
          ? 'Waydroid session reports RUNNING.'
          : 'Waydroid is installed but no session is running.',
      };
    },
  },
  {
    id: 'android-container',
    name: 'Android container backend',
    description: 'Xenity-managed Android container with graphics translation. Not implemented.',
    detect: () => ({
      present: false,
      running: false,
      detail: 'Not implemented in this build.',
    }),
  },
  {
    id: 'virtualization',
    name: 'Android VM backend',
    description: 'Full Android virtual machine with a virtual GPU. Not implemented.',
    detect: () => ({
      present: false,
      running: false,
      detail: 'Not implemented in this build.',
    }),
  },
];

export function getRuntimeStatus() {
  const backends = BACKENDS.map((backend) => {
    let detection;
    try {
      detection = backend.detect();
    } catch (cause) {
      detection = { present: false, running: false, detail: `Detection failed: ${String(cause)}` };
    }
    return {
      id: backend.id,
      name: backend.name,
      description: backend.description,
      ...detection,
      selectable: detection.present,
    };
  });

  const selected = backends.find((backend) => backend.id === 'waydroid') || backends[0];
  const system = detectSystem();

  return {
    implemented: false,
    available: false,
    state: selected.present ? 'detected-not-integrated' : 'unavailable',
    backend: selected.id,
    backendName: selected.name,
    backends,
    reason: selected.present
      ? 'A Waydroid installation was detected, but Xenity does not yet provision or launch Roblox inside it.'
      : 'No Android runtime backend is installed, and Xenity does not ship one in this build.',
    next: selected.present
      ? 'Runtime integration is on the Phase 2 roadmap; the launcher will refuse to start Roblox until it lands.'
      : 'Install Waydroid (sudo pacman -S waydroid) once runtime integration ships. The launcher will then validate it here.',
    graphics: system.graphics.backend,
    checkedAt: new Date().toISOString(),
  };
}
