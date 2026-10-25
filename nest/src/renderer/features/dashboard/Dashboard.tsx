import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig, RuntimeState, AccessPolicy, SystemInfo } from '@shared/types';
import { ConfirmDialog } from '@renderer/components/ConfirmDialog';
import { CopyToClipboard } from '@renderer/components/CopyToClipboard';

interface AppWithState extends ApplicationConfig {
  runtimeState?: RuntimeState;
  accessPolicy?: AccessPolicy;
}

interface SummaryData {
  total: number;
  running: number;
  stopped: number;
  errors: number;
  lanEnabled: number;
  lanIp: string;
  networkProfile: string;
  conflicts: number;
  warnings: number;
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedAppForRemoval, setSelectedAppForRemoval] = useState<string | null>(null);
  const [lanIp, setLanIp] = useState<string>('');

  const {
    data: apps,
    isLoading,
    refetch,
  } = useQuery<AppWithState[]>({
    queryKey: ['apps'],
    queryFn: async () => {
      const result = await nest.apps.list();
      if (!result.ok) throw new Error(result.error.message);
      return result.data as AppWithState[];
    },
    refetchInterval: 5000,
  });

  // Fetch LAN IP from system info
  useEffect(() => {
    const fetchLanIp = async () => {
      try {
        const result = await nest.system.info();
        if (result.ok && result.data.lanIp) {
          setLanIp(result.data.lanIp);
        }
      } catch {
        // Ignore
      }
    };

    fetchLanIp();
    const interval = setInterval(fetchLanIp, 30000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to live state changes
  useEffect(() => {
    const unsubscribe = nest.on('app.stateChanged', () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    });
    return unsubscribe;
  }, [queryClient]);

  const startMutation = useMutation({
    mutationFn: (id: string) => nest.apps.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => nest.apps.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => nest.apps.restart(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => nest.apps.remove(id, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setSelectedAppForRemoval(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  // Calculate summary
  const runningCount = apps?.filter((a) => a.runtimeState?.processState === 'running').length || 0;
  const stoppedCount = apps?.filter((a) => a.runtimeState?.processState === 'stopped').length || 0;
  const errorCount = apps?.filter((a) => a.runtimeState?.processState === 'failed').length || 0;
  const lanEnabledCount = apps?.filter((a) => a.accessPolicy?.mode === 'lan_enabled').length || 0;
  const conflicts =
    apps?.filter((a) => a.runtimeState?.portState === 'occupied_by_other').length || 0;

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <SummaryTile title="Total Apps" value={apps?.length || 0} icon="📦" />
        <SummaryTile title="Running" value={runningCount} icon="▶️" color="text-green-600" />
        <SummaryTile title="Stopped" value={stoppedCount} icon="⏹️" color="text-slate-600" />
        <SummaryTile title="Errors" value={errorCount} icon="⚠️" color="text-red-600" />
        <SummaryTile title="LAN Enabled" value={lanEnabledCount} icon="🌐" color="text-blue-600" />
        <SummaryTile title="Conflicts" value={conflicts} icon="⚡" color="text-amber-600" />
      </div>

      {/* System info tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoTile label="LAN IP" value="—" description="Detected LAN IP" />
        <InfoTile label="Network Profile" value="—" description="Active network profile" />
      </div>

      {/* App cards */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Applications</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {apps?.length || 0} application{apps?.length !== 1 ? 's' : ''}
          </span>
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
              <AppCard
                key={app.id}
                app={app}
                onStart={startMutation.mutate}
                onStop={stopMutation.mutate}
                onRestart={restartMutation.mutate}
                onRemove={setSelectedAppForRemoval}
                lanIp={lanIp}
              />
            ))}
          </div>
        )}
      </div>

      {selectedAppForRemoval && (
        <ConfirmDialog
          title="Remove Application"
          message={`Are you sure you want to remove "${apps?.find((a) => a.id === selectedAppForRemoval)?.name}"?`}
          details="Source files are NOT deleted. Only the NEST registration will be removed."
          onConfirm={() => removeMutation.mutate(selectedAppForRemoval!)}
          onCancel={() => setSelectedAppForRemoval(null)}
          isPending={removeMutation.isPending}
        />
      )}
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

function InfoTile({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>
    </div>
  );
}

function AppCard({
  app,
  onStart,
  onStop,
  onRestart,
  onRemove,
  lanIp,
}: {
  app: AppWithState;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string) => void;
  lanIp: string;
}) {
  const state = app.runtimeState;
  const processState = state?.processState || 'unknown';
  const healthState = state?.healthState || 'unknown';
  const portState = state?.portState || 'unknown';

  const isRunning = processState === 'running';
  const isStarting = processState === 'starting';
  const isStopping = processState === 'stopping';

  const localUrl = `${app.protocol}://localhost:${app.port}`;
  const lanUrl =
    lanIp && app.accessPolicy?.mode === 'lan_enabled'
      ? `${app.protocol}://${lanIp}:${app.port}`
      : undefined;

  const getStateBadge = (state: string) => {
    const styles: Record<string, string> = {
      running: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      starting: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      stopping: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
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

  const getReachableBadge = () => {
    // Reachable = process running + port listening + (health check passed if configured)
    if (processState === 'running' && healthState === 'healthy') {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    }
    if (processState === 'running' && healthState === 'checking') {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    if (processState === 'running' && healthState === 'unhealthy') {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  };

  const getPortStateBadge = () => {
    const styles: Record<string, string> = {
      free: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      occupied_by_managed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      occupied_by_other: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      listening_loopback: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      listening_all: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      listening_lan: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      unknown: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    };
    return styles[portState] || styles.unknown;
  };

  const lastHealthCheck = state?.lastHealthCheck
    ? new Date(state.lastHealthCheck.timestamp).toLocaleTimeString()
    : '—';

  return (
    <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-medium text-slate-900 dark:text-white truncate">{app.name}</h3>
            {app.runtimeLabel && (
              <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded">
                {app.runtimeLabel}
              </span>
            )}
            {app.lifecycleMode === 'external' && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                External
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-500 dark:text-slate-400">
            <span>Port: {app.port}</span>
            <CopyToClipboard text={localUrl} label="Local URL">
              <span className="font-mono text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer underline">
                {localUrl}
              </span>
            </CopyToClipboard>
            {lanUrl && (
              <CopyToClipboard text={lanUrl} label="LAN URL">
                <span className="font-mono text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer underline">
                  {lanUrl}
                </span>
              </CopyToClipboard>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Process State Badge */}
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${getStateBadge(processState)}`}
            title="Process State"
          >
            {processState}
          </span>

          {/* Health State Badge */}
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${getHealthBadge(healthState)}`}
            title="Health State"
          >
            {healthState}
          </span>

          {/* Reachable Badge */}
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${getReachableBadge()}`}
            title="Reachable (Running + Healthy)"
          >
            {processState === 'running' && healthState === 'healthy'
              ? 'Reachable'
              : processState === 'running'
                ? 'Checking...'
                : 'Unreachable'}
          </span>

          {/* Port State Badge */}
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${getPortStateBadge()}`}
            title="Port State"
          >
            {portState.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isRunning ? (
          <>
            <button
              onClick={() => onStop(app.id)}
              disabled={isStopping}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
            <button
              onClick={() => onRestart(app.id)}
              disabled={isStopping}
              className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors"
            >
              Restart
            </button>
          </>
        ) : isStarting ? (
          <button
            className="px-3 py-1.5 text-sm bg-slate-300 text-slate-600 rounded cursor-not-allowed"
            disabled
          >
            Starting...
          </button>
        ) : (
          <button
            onClick={() => onStart(app.id)}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            Start
          </button>
        )}

        <button
          className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          title="Open in browser"
        >
          🌐 Open
        </button>
        <CopyToClipboard text={localUrl} label="Local URL" showToast>
          <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            📋 Copy URL
          </button>
        </CopyToClipboard>
        <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
          Details
        </button>
        <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
          Logs
        </button>
        <button
          onClick={() => onRemove(app.id)}
          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
        >
          Remove
        </button>
      </div>

      {/* Last health check info */}
      {state?.lastHealthCheck && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
          Last health check: {lastHealthCheck} • Process:{' '}
          {state.lastHealthCheck.processAlive ? 'alive' : 'dead'}• Port:{' '}
          {state.lastHealthCheck.portListening ? 'listening' : 'closed'}• Local:{' '}
          {state.lastHealthCheck.localResponding ? 'responding' : 'no response'}
        </div>
      )}
    </div>
  );
}
