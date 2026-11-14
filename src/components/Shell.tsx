import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BellIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, MinusIcon, SettingsIcon, SquareIcon } from './Icons';
import { StatusDot } from './ui';
import { NAV, ROUTE_META } from '../lib/navigation';
import { useNotifications } from '../state/notifications';
import { useSystem } from '../state/system';
import { relativeTime } from '../lib/format';

const COLLAPSE_KEY = 'xenity.sidebar.collapsed';

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { overview } = useSystem();
  const runtimeReady = overview?.runtime.available ?? false;
  const version = overview?.version.version ?? '0.1.0';

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
            <path d="M6 6l10 10L6 26" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M18 6l8 20" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="sidebar__brand-text">
          <span className="sidebar__wordmark">Xenity</span>
          <span className="sidebar__tagline">Redefine your experience</span>
        </span>
      </div>

      <nav className="sidebar__nav" aria-label="Primary">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-item__icon">
                <Icon size={18} />
              </span>
              <span className="nav-item__label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__status" title={overview?.runtime.reason ?? 'Runtime status'}>
          <StatusDot tone={runtimeReady ? 'ok' : 'warn'} />
          <span className="sidebar__status-text">
            {runtimeReady ? 'Runtime ready' : 'Runtime unavailable'}
          </span>
        </div>
        <div className="sidebar__meta">
          <span>v{version}</span>
          <span className="sidebar__meta-sep">·</span>
          <span>Arch Linux</span>
        </div>
        <button className="sidebar__collapse" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
          <span className="sidebar__collapse-label">{collapsed ? '' : 'Collapse'}</span>
        </button>
      </div>
    </aside>
  );
}

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const location = useLocation();
  const meta = ROUTE_META[location.pathname] ?? { title: 'Xenity', subtitle: '' };
  const { overview } = useSystem();
  const { items, notify, dismiss, clear } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    setPanelOpen(false);
  }, [location.pathname]);

  const runtime = overview?.runtime;
  const unread = items.length;

  return (
    <header className="topbar">
      <button className="topbar__menu" onClick={onOpenMenu} aria-label="Open navigation">
        <span />
        <span />
        <span />
      </button>

      <div className="topbar__titles">
        <h1 className="topbar__title">{meta.title}</h1>
        <p className="topbar__subtitle">{meta.subtitle}</p>
      </div>

      <div className="topbar__actions">
        <span
          className={`runtime-chip ${runtime?.available ? 'runtime-chip--ok' : 'runtime-chip--warn'}`}
          title={runtime?.reason ?? 'Checking runtime status'}
        >
          <StatusDot tone={runtime?.available ? 'ok' : 'warn'} />
          <span className="runtime-chip__label">
            {runtime?.available ? runtime.backendName : 'Runtime unavailable'}
          </span>
        </span>

        <div className="topbar__group">
          <button
            className={`icon-btn ${panelOpen ? 'icon-btn--active' : ''}`}
            onClick={() => setPanelOpen((open) => !open)}
            aria-label="Notifications"
            aria-expanded={panelOpen}
          >
            <BellIcon size={17} />
            {unread > 0 && <span className="icon-btn__badge">{unread > 9 ? '9+' : unread}</span>}
          </button>

          <NavLink to="/settings" className="icon-btn" aria-label="Open settings">
            <SettingsIcon size={17} />
          </NavLink>

          <div className="window-controls">
            <button
              className="window-controls__btn"
              aria-label="Minimise window"
              onClick={() =>
                notify({
                  title: 'Window controls live in the desktop shell',
                  description:
                    'Xenity runs as a native window; this browser preview has no window to minimise.',
                  tone: 'info',
                })
              }
            >
              <MinusIcon size={14} />
            </button>
            <button
              className="window-controls__btn"
              aria-label="Maximise window"
              onClick={() =>
                notify({
                  title: 'Window controls live in the desktop shell',
                  description:
                    'Xenity runs as a native window; this browser preview has no window to maximise.',
                  tone: 'info',
                })
              }
            >
              <SquareIcon size={12} />
            </button>
            <button
              className="window-controls__btn window-controls__btn--close"
              aria-label="Close window"
              onClick={() =>
                notify({
                  title: 'Window controls live in the desktop shell',
                  description:
                    'Closing the window is handled by the desktop shell, not the browser preview.',
                  tone: 'info',
                })
              }
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {panelOpen && (
        <>
          <div className="popover-scrim" onClick={() => setPanelOpen(false)} />
          <div className="popover" role="dialog" aria-label="Notifications">
            <header className="popover__head">
              <span>Notifications</span>
              {items.length > 0 && (
                <button className="link-btn" onClick={clear}>
                  Clear all
                </button>
              )}
            </header>
            <div className="popover__body">
              {items.length === 0 ? (
                <p className="popover__empty">No notifications in this session.</p>
              ) : (
                items.map((item) => (
                  <article key={item.id} className={`popover__item popover__item--${item.tone}`}>
                    <div className="popover__item-main">
                      <p className="popover__item-title">{item.title}</p>
                      {item.description && <p className="popover__item-text">{item.description}</p>}
                      <span className="popover__item-time">{relativeTime(item.at)}</span>
                    </div>
                    <button
                      className="popover__dismiss"
                      onClick={() => dismiss(item.id)}
                      aria-label="Dismiss notification"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </article>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  return { collapsed, toggle: () => setCollapsed((value) => !value) };
}
