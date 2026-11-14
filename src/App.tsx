import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar, TopBar, useSidebarState } from './components/Shell';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';
import { PlacesPage } from './pages/PlacesPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { AboutPage } from './pages/AboutPage';
import { NotificationsProvider } from './state/notifications';
import { LauncherProvider } from './state/launcher';
import { SystemProvider } from './state/system';
import { useSystem } from './state/system';
import { ErrorNotice } from './components/ui';

function Workspace() {
  const { collapsed, toggle } = useSidebarState();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { error, loading } = useSystem();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className={`shell ${collapsed ? 'shell--collapsed' : ''} ${menuOpen ? 'shell--menu-open' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      {menuOpen && <div className="mobile-scrim" onClick={() => setMenuOpen(false)} />}

      <div className="workspace">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <main className="workspace__main">
          {error && !loading && (
            <div className="workspace__alert">
              <ErrorNotice error={{ what: error.what, why: error.why, next: error.next }} />
            </div>
          )}
          <div className="page" key={location.pathname}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/play" element={<PlayPage />} />
              <Route path="/library" element={<PlacesPage />} />
              <Route path="/diagnostics" element={<DiagnosticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SystemProvider>
        <NotificationsProvider>
          <LauncherProvider>
            <Workspace />
          </LauncherProvider>
        </NotificationsProvider>
      </SystemProvider>
    </BrowserRouter>
  );
}
