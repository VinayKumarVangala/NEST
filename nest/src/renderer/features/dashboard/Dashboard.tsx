import { useQuery } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig, RuntimeState } from '@shared/types';

interface AppWithState extends ApplicationConfig {
  runtimeState?: RuntimeState;
}

export function Dashboard() {
  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: async () => {
      const result = await nest.apps.list();
      if (!result.ok) throw new Error(result.error.message);
      return result.data as AppWithState[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  const runningCount = apps?.filter((a) => a.runtimeState?.processState === 'running').length || 0;
  const stoppedCount = apps?.filter((a) => a.runtimeState?.processState === 'stopped').length || 0;
  const errorCount = apps?.filter((a) => a.runtimeState?.processState === 'failed').length || 0;

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryTile title="Total Apps" value={apps?.length || 0} icon="📦" />
        <SummaryTile title="Running" value={runningCount} icon="▶️" color="text-green-600" />
        <SummaryTile title="Stopped" value={stoppedCount} icon="⏹️" color="text-slate-600" />
        <SummaryTile title="Errors" value={errorCount} icon="⚠️" color="text-red-600" />
      </div>

      {/* App cards */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Applications</h2>
        </div>

        {apps?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No applications registered
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              Get started by registering your first application
            </p>
            <a
              href="/projects"
              className="inline-flex items-center px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              Register Application
            </a>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {apps?.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  title,
  value,
  icon,
  color = 'text-brand-600',
}: {
  title: string;
  value: number;
  icon: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={`text-3xl ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

function AppCard({ app }: { app: AppWithState }) {
  const state = app.runtimeState;
  const processState = state?.processState || 'unknown';
  const healthState = state?.healthState || 'unknown';

  const getStateBadge = (state: string) => {
    const styles: Record<string, string> = {
      running: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      starting: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      stopped: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      external: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      registered: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      unknown: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    };
    return styles[state] || styles.unknown;
  };

  const getHealthBadge = (state: string) => {
    const styles: Record<string, string> = {
      healthy: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      unhealthy: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      checking: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      unknown: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      not_applicable: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    };
    return styles[state] || styles.unknown;
  };

  return (
    <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-slate-900 dark:text-white">{app.name}</h3>
            {app.runtimeLabel && (
              <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded">
                {app.runtimeLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 dark:text-slate-400">
            <span>Port: {app.port}</span>
            <span>
              {app.protocol}://localhost:{app.port}
            </span>
            {app.lifecycleMode === 'external' && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                External
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded ${getStateBadge(processState)}`}>
            {processState}
          </span>
          <span className={`px-2 py-1 text-xs font-medium rounded ${getHealthBadge(healthState)}`}>
            {healthState}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {processState === 'running' ? (
          <>
            <button className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
              Stop
            </button>
            <button className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors">
              Restart
            </button>
          </>
        ) : processState === 'starting' ? (
          <button
            className="px-3 py-1.5 text-sm bg-slate-300 text-slate-600 rounded cursor-not-allowed"
            disabled
          >
            Starting...
          </button>
        ) : (
          <button className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
            Start
          </button>
        )}

        <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
          Logs
        </button>
        <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
          Details
        </button>
      </div>
    </div>
  );
}
