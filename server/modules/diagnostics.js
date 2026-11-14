import { detectSystem } from './system_detection.js';
import { getRuntimeStatus } from './runtime_manager.js';
import { installationState } from './installation.js';
import { errorsOnly, tail } from './logging.js';
import { versionInfo } from './updater.js';
import { humanBytes } from './store.js';

const SECRET_PATTERNS = [
  /(token|secret|password|passwd|api[_-]?key|authorization|cookie|session)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

/**
 * Diagnostic output must never carry credentials. Values are stripped before a
 * report leaves the process, regardless of where they came from.
 */
export function redact(text) {
  let output = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match, key, separator) =>
      separator !== undefined ? `${key}${separator}[redacted]` : '[redacted]',
    );
  }
  return output;
}

export function buildDiagnostics() {
  const system = detectSystem();
  const runtime = getRuntimeStatus();
  const installation = installationState();
  const version = versionInfo();
  const errors = errorsOnly(8).map((entry) => ({ ...entry }));

  return {
    generatedAt: new Date().toISOString(),
    system,
    runtime,
    installation,
    version: { version: version.version, channel: version.channel },
    errors,
    storage: installation.directories,
    privacyNote:
      'Reports contain hardware and status data only. Credentials, tokens, cookies and account identifiers are removed before export.',
  };
}

export function buildReportText() {
  const { system, runtime, installation, version, errors } = buildDiagnostics();
  const lines = [];

  lines.push('XENITY — DIAGNOSTIC REPORT');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Xenity version: ${version.version} (${version.channel})`);
  lines.push('');

  lines.push('[SYSTEM]');
  lines.push(`Distribution: ${system.distribution.name}`);
  lines.push(`Distribution id: ${system.distribution.id}${system.distribution.version ? ` ${system.distribution.version}` : ''}`);
  lines.push(`Target platform: ${system.distribution.target} (matches: ${system.distribution.matchesTarget ? 'yes' : 'no'})`);
  lines.push(`Kernel: ${system.kernel}`);
  lines.push(`Architecture: ${system.architecture}`);
  lines.push(`CPU: ${system.cpu.model} — ${system.cpu.cores} threads`);
  lines.push(`RAM: ${humanBytes(system.memory.total)} total, ${humanBytes(system.memory.used)} used (${system.memory.usedPercent}%)`);
  lines.push(
    `GPU: ${
      system.gpu.devices.length
        ? system.gpu.devices.map((gpu) => `${gpu.vendor} ${gpu.deviceId ?? ''} (${gpu.driver ?? 'driver unknown'})`).join(', ')
        : 'not detected'
    }`,
  );
  lines.push(`Session: ${system.graphics.sessionType}`);
  lines.push(`Graphics backend: ${system.graphics.backend}`);
  lines.push(`Vulkan: ${system.graphics.vulkan.available ? system.graphics.vulkan.device : 'unavailable'} — ${system.graphics.vulkan.detail}`);
  lines.push(`OpenGL: ${system.graphics.opengl.available ? system.graphics.opengl.renderer : 'unavailable'} — ${system.graphics.opengl.detail}`);
  lines.push('');

  lines.push('[RUNTIME]');
  lines.push(`Implemented: ${runtime.implemented ? 'yes' : 'no'}`);
  lines.push(`State: ${runtime.state}`);
  lines.push(`Reason: ${runtime.reason}`);
  for (const backend of runtime.backends) {
    lines.push(
      `Backend ${backend.name}: present=${backend.present} running=${backend.running} — ${backend.detail}`,
    );
  }
  lines.push('');

  lines.push('[ENGINE]');
  const engine = runtime.engine;
  lines.push(`Engine: ${engine.engine} (${engine.licence}) — ${engine.present ? 'installed' : 'not installed'}`);
  if (engine.command) lines.push(`Command: ${engine.command}`);
  lines.push(`Engine version: ${engine.version ?? 'unknown'}`);
  lines.push(`Install method: ${engine.kind ?? 'unknown'}`);
  lines.push(
    `Build store: ${engine.store.root ?? 'none'} — ${engine.store.builds.length} build(s)`,
  );
  lines.push(`Runnable build: ${engine.runnable ? engine.build?.version : 'none'}`);
  lines.push(`Running engine processes: ${engine.instances}`);
  lines.push('');

  lines.push('[INSTALLATION]');
  lines.push(`Data root: ${installation.root}`);
  lines.push(`Status: ${installation.status} — ${installation.summary}`);
  for (const check of installation.dependencies.checks) {
    lines.push(
      `Dependency ${check.binary} (${check.package}): ${check.present ? 'present' : 'missing'}${check.required ? ' [required]' : ''}`,
    );
  }
  lines.push(`Application bundle: ${installation.applications.present ? installation.applications.baseApk : 'none'}`);
  lines.push('');

  lines.push('[RECENT ERRORS]');
  if (!errors.length) lines.push('None recorded since this process started.');
  for (const entry of errors) {
    lines.push(`${entry.at} ${entry.module}: ${entry.message}`);
  }
  lines.push('');
  lines.push('This report contains no passwords, tokens or account data.');

  return redact(lines.join('\n'));
}

export function logsForExport() {
  return redact(tail(undefined, 2000));
}
