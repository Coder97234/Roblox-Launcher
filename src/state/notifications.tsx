import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CloseIcon } from '../components/Icons';

export type NotificationTone = 'info' | 'success' | 'warn' | 'danger';

export type Notification = {
  id: string;
  title: string;
  description?: string;
  tone: NotificationTone;
  at: string;
};

type NotificationContextValue = {
  items: Notification[];
  notify: (input: { title: string; description?: string; tone?: NotificationTone }) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

let counter = 0;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    ({
      title,
      description,
      tone = 'info',
    }: {
      title: string;
      description?: string;
      tone?: NotificationTone;
    }) => {
      counter += 1;
      const entry: Notification = {
        id: `note_${counter}`,
        title,
        description,
        tone,
        at: new Date().toISOString(),
      };
      setItems((current) => [entry, ...current].slice(0, 12));
    },
    [],
  );

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({ items, notify, dismiss, clear }), [items, notify, dismiss, clear]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="toaster" aria-live="polite">
        {items.slice(0, 4).map((item) => (
          <div key={item.id} className={`toast toast--${item.tone}`}>
            <span className="toast__bar" aria-hidden="true" />
            <div className="toast__body">
              <p className="toast__title">{item.title}</p>
              {item.description && <p className="toast__description">{item.description}</p>}
            </div>
            <button className="toast__close" onClick={() => dismiss(item.id)} aria-label="Dismiss">
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider');
  return context;
}
