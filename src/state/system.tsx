import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';
import type { Overview, Settings } from '../lib/types';

type SystemContextValue = {
  overview: Overview | null;
  settings: Settings | null;
  loading: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  applySettings: (next: Settings) => void;
  reloadSettings: () => Promise<Settings | null>;
};

const SystemContext = createContext<SystemContextValue | null>(null);

export function SystemProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextOverview, nextSettings] = await Promise.all([api.overview(), api.settings()]);
      setOverview(nextOverview);
      setSettings(nextSettings.settings);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError(
              'Xenity could not read system information.',
              String(cause),
              'Retry from Diagnostics.',
            ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (settings?.general.theme) {
      document.documentElement.dataset.theme = settings.general.theme;
    }
  }, [settings?.general.theme]);

  const applySettings = useCallback((next: Settings) => setSettings(next), []);

  const reloadSettings = useCallback(async () => {
    try {
      const response = await api.settings();
      setSettings(response.settings);
      return response.settings;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ overview, settings, loading, error, refresh, applySettings, reloadSettings }),
    [overview, settings, loading, error, refresh, applySettings, reloadSettings],
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (!context) throw new Error('useSystem must be used inside SystemProvider');
  return context;
}
