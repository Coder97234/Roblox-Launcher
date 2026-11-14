export type GpuDevice = {
  card: string;
  vendor: string;
  deviceId: string | null;
  driver: string | null;
};

export type SystemInfo = {
  detectedAt: string;
  distribution: {
    name: string;
    id: string;
    version: string | null;
    target: string;
    matchesTarget: boolean;
  };
  kernel: string;
  architecture: string;
  hostname: string;
  uptimeSeconds: number;
  cpu: { model: string; cores: number };
  memory: { total: number; free: number; used: number; usedPercent: number };
  gpu: { devices: GpuDevice[]; renderNodes: string[]; status: string };
  graphics: {
    sessionType: string;
    vulkan: { available: boolean; device: string | null; apiVersion: string | null; detail: string };
    opengl: { available: boolean; renderer: string | null; version?: string | null; detail: string };
    backend: string;
  };
  desktopSession: { type: string; available: boolean };
};

export type RuntimeBackend = {
  id: string;
  name: string;
  description: string;
  present: boolean;
  running: boolean;
  detail: string;
  selectable: boolean;
};

export type StudioStatus = {
  name: string;
  installerUrl: string;
  installHint: string;
  wine: { present: boolean; binary: string | null; version: string | null; detail: string };
  prefix: { path: string; initialized: boolean; exists: boolean };
  studio: {
    installed: boolean;
    version: string | null;
    exe: string | null;
    dir: string | null;
    installedAt: string | null;
    bytes: number;
    versions: number;
    reason: string | null;
  };
  renderer: string;
  dxvk: boolean;
  instances: number;
  running: {
    id: string;
    pid: number | null;
    place: string | null;
    startedAt: string;
    status: string;
  }[];
  checkedAt: string;
};

export type StudioInstallState = {
  job: {
    status: 'idle' | 'running' | 'done' | 'failed';
    phase: string;
    installer: string | null;
    received: number;
    total: number | null;
    percent: number;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
  wine: StudioStatus['wine'];
  prefix: StudioStatus['prefix'];
  studio: StudioStatus['studio'];
};

export type StudioDoctorCheck = {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

export type StudioDoctorResult = {
  ran: boolean;
  blocked: boolean;
  exitCode: number | null;
  checks: StudioDoctorCheck[];
  lines: string[];
  reason: string | null;
  install?: string;
};

export type AppImageRelease = {
  available: boolean;
  file: string | null;
  size: number | null;
  builtAt: string | null;
  directory: string;
  releases: string;
  latest: string;
  buildCommand: string;
  reason: string | null;
};

export type RuntimeStatus = {
  implemented: boolean;
  available: boolean;
  present: boolean;
  winePresent: boolean;
  state: string;
  backend: string;
  backendName: string;
  backends: RuntimeBackend[];
  studio: StudioStatus;
  reason: string;
  next: string;
  graphics: string;
  checkedAt: string;
};

export type DependencyCheck = {
  binary: string;
  package: string;
  purpose: string;
  required: boolean;
  repo: string;
  present: boolean;
  path: string | null;
  installCommand: string;
};

export type DirectoryStatus = { label: string; path: string; exists: boolean };

export type InstallationState = {
  root: string;
  directories: DirectoryStatus[];
  configFile: string;
  directoriesOk: boolean;
  places: { directory: string; files: string[]; count: number; note: string };
  dependencies: {
    checks: DependencyCheck[];
    missingRequired: DependencyCheck[];
    ok: boolean;
    checkedAt: string;
  };
  studio: {
    name: string;
    present: boolean;
    version: string | null;
    exe: string | null;
    prefix: string;
    prefixReady: boolean;
    wine: string | null;
    running: number;
  };
  verified: boolean;
  status: string;
  summary: string;
  checkedAt: string;
};

export type Settings = {
  general: {
    launchOnStartup: boolean;
    minimizeToTray: boolean;
    language: string;
    theme: string;
    notifications: boolean;
  };
  graphics: { backend: string; vsync: boolean; resolution: string; fpsCap: string };
  studio: { prefixPath: string; renderer: string; dxvk: boolean; autoValidate: boolean };
  storage: { installationDirectory: string; cacheDirectory: string };
  updates: { channel: string; checkOnStartup: boolean };
};

export type LaunchStepStatus = 'ok' | 'fail' | 'skipped';

export type LaunchResult = {
  outcome: 'failed' | 'succeeded';
  startedAt: string;
  durationMs: number;
  steps: { id: string; label: string; status: LaunchStepStatus; detail: string }[];
  error: { what: string; why: string; next: string; code: string; step: string } | null;
  runtime: { available: boolean; backendName: string };
  instance: { id: string; pid: number | null; status: string } | null;
  place: { id: string | null; name: string | null; file: string | null };
  note: string;
};

export type OpenHistoryEntry = {
  id: string;
  at: string;
  placeId: string | null;
  placeName: string | null;
  outcome: 'failed' | 'succeeded';
  message: string;
};

export type Place = {
  id: string;
  name: string;
  file: string | null;
  favorite: boolean;
  addedAt: string;
  lastOpenedAt: string | null;
};

export type PlacesData = {
  places: Place[];
  favorites: Place[];
  recent: OpenHistoryEntry[];
  history: OpenHistoryEntry[];
  favoriteCount: number;
  empty: boolean;
};

export type Overview = {
  system: SystemInfo;
  runtime: RuntimeStatus;
  installation: InstallationState;
  version: { version: string; channel: string };
  lastLaunch: OpenHistoryEntry | null;
};

export type StorageReport = {
  root: string;
  areas: { id: string; label: string; dir: string; bytes: number; human: string }[];
  total: number;
  totalHuman: string;
  configuration: { installationDirectory: string; cacheDirectory: string };
};

export type LogEntry = {
  at: string;
  level: 'info' | 'warn' | 'error';
  module: string;
  message: string;
  detail: unknown;
};

export type VersionInfo = {
  version: string;
  name: string;
  channel: string;
  history: UpdateCheck[];
};

export type UpdateCheck = {
  status: string;
  currentVersion: string;
  channel: string;
  latestVersion: string | null;
  message: string;
  next: string;
  checkedAt: string;
};

export type DependencyInstallState = {
  job: {
    status: 'idle' | 'running' | 'done' | 'failed';
    phase: string;
    packages: string[];
    command: string | null;
    lines: string[];
    error: string | null;
    message: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
  dependencies: InstallationState['dependencies'];
  privilege: { command: string | null; args: string[]; label: string; available: boolean };
};

export type SwapDrive = {
  device: string;
  mountPoint: string;
  label: string | null;
  model: string | null;
  filesystem: string | null;
  sizeBytes: number;
  freeBytes: number;
  removable: boolean;
  transport: string | null;
  swapSizeBytes: number;
  supportsSwap: boolean;
  reason: string | null;
  managedSwap: boolean;
};

export type SwapStatus = {
  drives: SwapDrive[];
  managed: {
    file: string;
    mountPoint: string;
    device?: string;
    label?: string | null;
    sizeBytes: number;
    createdAt: string;
    active: boolean;
    missing?: boolean;
  } | null;
  active: { file: string; type: string; sizeBytes: number; usedBytes: number }[];
  tools: {
    available: boolean;
    missing: string[];
    optionalMissing: string[];
    privilege: string;
    privilegeAvailable: boolean;
    detail: string;
  };
  job: {
    status: 'idle' | 'running' | 'done' | 'failed';
    action: 'create' | 'remove' | null;
    phase: string;
    mountPoint: string | null;
    file: string | null;
    sizeBytes: number | null;
    received: number;
    percent: number;
    error: string | null;
    message: string | null;
    lines: string[];
    startedAt: string | null;
    finishedAt: string | null;
  };
  reserveBytes: number;
  checkedAt: string;
};

export type Diagnostics = {
  generatedAt: string;
  system: SystemInfo;
  runtime: RuntimeStatus;
  installation: InstallationState;
  version: { version: string; channel: string };
  errors: LogEntry[];
  storage: DirectoryStatus[];
  privacyNote: string;
};
