import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';
import type { LaunchResult } from '../lib/types';
import { useNotifications } from './notifications';

type LauncherContextValue = {
  running: boolean;
  result: LaunchResult | null;
  error: ApiError | null;
  run: (experienceId?: string | null, experienceName?: string | null) => Promise<LaunchResult | null>;
  clear: () => void;
};

const LauncherContext = createContext<LauncherContextValue | null>(null);

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const { notify } = useNotifications();

  const run = useCallback(
    async (experienceId: string | null = null, experienceName: string | null = null) => {
      setRunning(true);
      setError(null);
      try {
        const outcome = await api.launch(experienceId);
        setResult(outcome);
        if (outcome.outcome === 'succeeded') {
          notify({
            title: 'Roblox started',
            description: experienceName
              ? `Cordial is starting ${experienceName}.`
              : 'Cordial was asked to start Roblox; its output is in the Xenity log.',
            tone: 'success',
          });
        } else {
          notify({
            title: 'Launch failed',
            description: outcome.error?.what ?? 'The launch sequence stopped early.',
            tone: 'danger',
          });
        }
        return outcome;
      } catch (cause) {
        const apiError =
          cause instanceof ApiError
            ? cause
            : new ApiError(
                'The launch request failed.',
                String(cause),
                'Open Diagnostics and retry the launch.',
              );
        setError(apiError);
        notify({ title: 'Launch failed', description: apiError.what, tone: 'danger' });
        return null;
      } finally {
        setRunning(false);
      }
    },
    [notify],
  );

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const value = useMemo(() => ({ running, result, error, run, clear }), [running, result, error, run, clear]);

  return <LauncherContext.Provider value={value}>{children}</LauncherContext.Provider>;
}

export function useLauncher() {
  const context = useContext(LauncherContext);
  if (!context) throw new Error('useLauncher must be used inside LauncherProvider');
  return context;
}
