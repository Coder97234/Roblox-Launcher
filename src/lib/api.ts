import type {
  AppImageRelease,
  Diagnostics,
  InstallationState,
  LaunchResult,
  LogEntry,
  Overview,
  PlacesData,
  Settings,
  StorageReport,
  StudioDoctorResult,
  StudioInstallState,
  StudioStatus,
  SystemInfo,
  UpdateCheck,
  RuntimeStatus,
  VersionInfo,
} from './types';

export class ApiError extends Error {
  what: string;
  why: string;
  next: string;

  constructor(what: string, why: string, next: string) {
    super(what);
    this.name = 'ApiError';
    this.what = what;
    this.why = why;
    this.next = next;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError(
      'The Xenity backend could not be reached.',
      'The launcher could not open a connection to its local service.',
      'Reload the launcher. If it keeps happening, check that the Xenity service is running.',
    );
  }

  let body: { ok?: boolean; data?: T; error?: { what?: string; why?: string; next?: string } } = {};
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      'The Xenity backend returned an unreadable response.',
      `The service answered with HTTP ${response.status} and no valid payload.`,
      'Try again, then review the backend logs if it repeats.',
    );
  }

  if (!response.ok || body.ok === false) {
    const detail = body.error ?? {};
    throw new ApiError(
      detail.what || `Request failed with HTTP ${response.status}.`,
      detail.why || 'The Xenity backend rejected the request.',
      detail.next || 'Try again, or open Diagnostics for details.',
    );
  }

  return body.data as T;
}

async function requestText(path: string): Promise<string> {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(String(response.status));
    return await response.text();
  } catch {
    throw new ApiError(
      'The report could not be generated.',
      'The Xenity backend did not return the requested text.',
      'Try again in a moment.',
    );
  }
}

export const api = {
  overview: () => request<Overview>('/api/overview'),
  system: () => request<SystemInfo>('/api/system'),
  runtime: () => request<RuntimeStatus>('/api/runtime'),
  studio: () => request<StudioStatus>('/api/studio'),
  studioDoctor: () => request<StudioDoctorResult>('/api/studio/doctor', { method: 'POST' }),
  studioOpen: () =>
    request<{ started: boolean; instance: { pid: number | null } | null }>('/api/studio/open', {
      method: 'POST',
    }),
  studioInstall: () => request<StudioInstallState>('/api/studio/install'),
  startStudioInstall: (installerPath: string | null = null) =>
    request<StudioInstallState>('/api/studio/install', {
      method: 'POST',
      body: JSON.stringify({ installerPath }),
    }),
  installation: () => request<InstallationState>('/api/installation'),
  repair: () => request<{ created: string[]; message: string }>('/api/installation/repair', { method: 'POST' }),
  settings: () => request<{ settings: Settings; path: string }>('/api/settings'),
  saveSettings: (settings: Settings) =>
    request<{ settings: Settings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }),
  resetSettings: () => request<{ settings: Settings }>('/api/settings/reset', { method: 'POST' }),
  storage: () => request<StorageReport>('/api/storage'),
  clearCache: () =>
    request<{ removed: number; directory: string; message: string }>('/api/storage/clear-cache', {
      method: 'POST',
    }),
  places: () => request<PlacesData>('/api/places'),
  addPlace: (name: string, file: string) =>
    request<{ place: { id: string } }>('/api/places', {
      method: 'POST',
      body: JSON.stringify({ name, file }),
    }),
  favoritePlace: (id: string) =>
    request<{ place: { id: string; favorite: boolean } }>(`/api/places/${id}/favorite`, {
      method: 'POST',
    }),
  removePlace: (id: string) => request<{ removed: boolean }>(`/api/places/${id}`, { method: 'DELETE' }),
  launch: (placeId: string | null = null) =>
    request<LaunchResult>('/api/launch', {
      method: 'POST',
      body: JSON.stringify({ placeId }),
    }),
  diagnostics: () => request<Diagnostics>('/api/diagnostics'),
  diagnosticsReport: () => requestText('/api/diagnostics/report'),
  logs: (limit = 150) => request<{ entries: LogEntry[] }>(`/api/logs?limit=${limit}`),
  logsExport: () => requestText('/api/logs/export'),
  checkUpdates: () => request<UpdateCheck & { history: UpdateCheck[] }>('/api/updates/check', { method: 'POST' }),
  version: () => request<VersionInfo>('/api/version'),
  release: () => request<AppImageRelease>('/api/release'),
};
