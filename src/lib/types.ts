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

export type EngineBuild = {
  version: string;
  dir: string;
  root: string;
  engine: boolean;
  baseApk: boolean;
  signer: boolean;
  launchable: boolean;
};

export type EngineInstance = {
  id: string;
  pid: number | null;
  kind: string;
  profile: string | null;
  placeId: number | null;
  startedAt: string;
  status: string;
};

export type EngineStatus = {
  engine: string;
  project: string;
  licence: string;
  install: string;
  present: boolean;
  kind: string | null;
  command: string | null;
  source: string | null;
  version: string | null;
  store: {
    roots: { path: string; exists: boolean; builds: number }[];
    root: string | null;
    builds: EngineBuild[];
    newest: EngineBuild | null;
    runnableBuild: EngineBuild | null;
  };
  build: EngineBuild | null;
  runnable: boolean;
  instances: number;
  running: EngineInstance[];
  checkedAt: string;
};

export type EngineDoctorResult = {
  ran: boolean;
  blocked: boolean;
  exitCode: number | null;
  command?: string;
  lines: string[];
  reason: string | null;
  install?: string;
};

export type RuntimeStatus = {
  implemented: boolean;
  available: boolean;
  present: boolean;
  state: string;
  backend: string;
  backendName: string;
  backends: RuntimeBackend[];
  engine: EngineStatus;
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
  applications: {
    directory: string;
    baseApk: string | null;
    splits: string[];
    files: string[];
    present: boolean;
    note: string;
  };
  dependencies: {
    checks: DependencyCheck[];
    missingRequired: DependencyCheck[];
    ok: boolean;
    checkedAt: string;
  };
  engine: {
    name: string;
    present: boolean;
    version: string | null;
    command: string | null;
    kind: string | null;
    runnable: boolean;
    store: string | null;
    build: { version: string; path: string } | null;
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
  runtime: { profile: string; autoValidate: boolean; restartPolicy: string };
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
  experience: { id: string | null; name: string | null; placeId: number | null };
  note: string;
};

export type LaunchHistoryEntry = {
  id: string;
  at: string;
  experienceId: string | null;
  experienceName: string | null;
  outcome: 'failed' | 'succeeded';
  message: string;
};

export type Experience = {
  id: string;
  name: string;
  url: string | null;
  favorite: boolean;
  addedAt: string;
  lastLaunchedAt: string | null;
};

export type LibraryData = {
  experiences: Experience[];
  favorites: Experience[];
  recent: LaunchHistoryEntry[];
  history: LaunchHistoryEntry[];
  favoriteCount: number;
  empty: boolean;
};

export type Overview = {
  system: SystemInfo;
  runtime: RuntimeStatus;
  installation: InstallationState;
  version: { version: string; channel: string };
  lastLaunch: LaunchHistoryEntry | null;
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
