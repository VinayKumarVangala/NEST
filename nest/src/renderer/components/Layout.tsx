import { ReactNode, useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '@renderer/hooks/useTheme';
import { nest } from '@renderer/lib/ipc';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Projects', href: '/projects' },
  { name: 'Network', href: '/network' },
  { name: 'Logs', href: '/logs' },
  { name: 'Diagnostics', href: '/diagnostics' },
  { name: 'Audit', href: '/audit' },
  { name: 'Settings', href: '/settings' },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [lanIp, setLanIp] = useState<string>('—');
  const [networkProfile, setNetworkProfile] = useState<string>('—');

  // Subscribe to live events
  useEffect(() => {
    const unsubscribeState = nest.on('app.stateChanged', () => {
      // Invalidate queries will be handled by React Query's refetch
      // We just need to trigger a re-render for live badges
    });

    const unsubscribeLog = nest.on('app.log', () => {
      // Log events are handled by the Logs page
    });

    // Fetch system info for LAN IP and network profile
    const fetchSystemInfo = async () => {
      try {
        const result = await nest.system.info();
        if (result.ok) {
          setLanIp(result.data.lanIp || '—');
          setNetworkProfile(result.data.networkProfile || '—');
        }
      } catch {
        // Ignore
      }
    };

    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 30000);

    return () => {
      unsubscribeState();
      unsubscribeLog();
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className={`flex h-screen bg-slate-50 dark:bg-slate-900 ${theme === 'dark' ? 'dark' : ''}`}
    >
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-600 dark:text-brand-400">NEST</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Host on your network</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <nav
          className="flex-1 p-4 space-y-1 overflow-y-auto"
          role="navigation"
          aria-label="Main navigation"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
            <span>LAN IP: </span>
            <span className="font-mono">{lanIp}</span>
            <span className="mx-2">|</span>
            <span>Profile: </span>
            <span className="capitalize">{networkProfile}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center mt-1">v0.1.0</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 px-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {navigation.find((n) => n.href === location.pathname)?.name || 'NEST'}
          </h2>
          <div className="flex items-center gap-4">
            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded font-mono">
              Local only
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {children}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
