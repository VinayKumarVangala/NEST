import { ReactNode } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Projects', href: '/projects' },
  { name: 'Network', href: '/network' },
  { name: 'Logs', href: '/logs' },
  { name: 'Diagnostics', href: '/diagnostics' },
  { name: 'Settings', href: '/settings' },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-xl font-bold text-brand-600 dark:text-brand-400">NEST</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Host on your network</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center">v0.1.0</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 px-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {navigation.find((n) => n.href === location.pathname)?.name || 'NEST'}
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 dark:text-slate-400">Local only</span>
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
