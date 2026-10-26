import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type {
  ApplicationConfig,
  RuntimeState,
  HealthCheckResult,
  ActivityLogEntry,
} from '@shared/types';
import { ConfirmDialog } from '@renderer/components/ConfirmDialog';
import { CopyToClipboard } from '@renderer/components/CopyToClipboard';

interface HealthHistoryEntry {
  timestamp: number;
  processAlive: boolean;
  portListening: boolean;
  localResponding: boolean;
  latencyMs?: number;
}

export function ProjectDetails() {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<
    'overview' | 'timeline' | 'health' | 'port' | 'diagnostics'
  >('overview');
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [healthHistory, setHealthHistory] = useState<HealthHistoryEntry[]>([]);

  // Early return if appId is not available
  if (!appId) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        Application ID not found
      </div>
    );
  }

  const { data: app, isLoading: appLoading } = useQuery<ApplicationConfig>({
    queryKey: ['apps', appId],
    queryFn: async () => {
      const result = await nest.apps.get(appId);
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!appId,
  });

  const { data: runtimeState, isLoading: stateLoading } = useQuery<RuntimeState>({
    queryKey: ['runtimeState', appId],
    queryFn: async () => {
      const result = await nest.apps.get(appId);
      if (!result.ok) throw new Error(result.error.message);
      return (result.data as any).runtimeState;
    },
    enabled: !!appId,
    refetchInterval: 5000,
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['logs', { appId, limit: 100 }],
    queryFn: async () => {
      const result = await nest.logs.query({ appId, limit: 100 });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!appId,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => nest.apps.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runtimeState', appId] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => nest.apps.stop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runtimeState', appId] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => nest.apps.restart(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runtimeState', appId] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => nest.apps.remove(id, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setShowRemoveDialog(false);
    },
  });

  const diagnosticsMutation = useMutation({
    mutationFn: (id: string) => nest.diagnostics.run(id),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.setQueryData(['diagnostics', appId], result.data);
      }
    },
  });

  const checkNowMutation = useMutation({
    mutationFn: (id: string) => nest.health.checkNow(id),
    onSuccess: (result) => {
      if (result.ok) {
        const entry = {
          timestamp: Date.now(),
          processAlive: result.data.processAlive,
          portListening: result.data.portListening,
          localResponding: result.data.localResponding,
          latencyMs: result.data.latencyMs,
        };
        setHealthHistory((prev) => [entry, ...prev.slice(0, 99)]);
      }
    },
  });

  useEffect(() => {
    const unsubscribe = nest.on('health.changed', (payload: any) => {
      if (payload.appId === appId && payload.result) {
        const entry = {
          timestamp: payload.timestamp,
          processAlive: payload.result.processAlive,
          portListening: payload.result.portListening,
          localResponding: payload.result.localResponding,
          latencyMs: payload.result.latencyMs,
        };
        setHealthHistory((prev) => [entry, ...prev.slice(0, 99)]);
      }
    });
    return unsubscribe;
  }, [appId]);

  useEffect(() => {
    if (logs?.entries) {
      const healthEntries: HealthHistoryEntry[] = logs.entries
        .filter((e) => e.eventType === 'health_change')
        .slice(0, 100)
        .map((e): HealthHistoryEntry => ({
          timestamp: e.timestamp,
          processAlive: Boolean(e.details?.processAlive),
          portListening: Boolean(e.details?.portListening),
          localResponding: Boolean(e.details?.localResponding),
          latencyMs: typeof e.details?.latencyMs === 'number' ? e.details.latencyMs : undefined,
        }));
      setHealthHistory(healthEntries);
    }
  }, [logs]);

  if (appLoading || stateLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        Application not found
      </div>
    );
  }

  const processState = runtimeState?.processState || 'unknown';
  const healthState = runtimeState?.healthState || 'unknown';
  const portState = runtimeState?.portState || 'unknown';
  const isRunning = processState === 'running';
  const isExternal = app.lifecycleMode === 'external';
  const localUrl = `${app.protocol}://localhost:${app.port}`;

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

  const getPortStateBadge = (state: string) => {
    const styles: Record<string, string> = {
      free: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      occupied_by_managed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      occupied_by_other: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      listening_loopback: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      listening_all: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      listening_lan: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      unknown: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    };
    return styles[state] || styles.unknown;
  };

  const getPortStateLabel = (state: string) => {
    const labels: Record<string, string> = {
      free: 'Free',
      occupied_by_managed: 'Managed',
      occupied_by_other: 'Conflict',
      listening_loopback: 'Loopback',
      listening_all: 'All Interfaces',
      listening_lan: 'LAN',
      unknown: 'Unknown',
    };
    return labels[state] || state;
  };

  const handleStart = () => startMutation.mutate(appId);
  const handleStop = () => stopMutation.mutate(appId);
  const handleRestart = () => restartMutation.mutate(appId);
  const handleRemove = () => setShowRemoveDialog(true);
  const handleRunDiagnostics = () => diagnosticsMutation.mutate(appId);
  const handleCheckNow = () => checkNowMutation.mutate(appId);

  const tabs: Array<{
    id: 'overview' | 'timeline' | 'health' | 'port' | 'diagnostics';
    label: string;
  }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'health', label: 'Health History' },
    { id: 'port', label: 'Port State' },
    { id: 'diagnostics', label: 'Diagnostics' },
  ];

  if (!app) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{app.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${getStateBadge(processState)}`}
            >
              {processState}
            </span>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${getHealthBadge(healthState)}`}
            >
              {healthState}
            </span>
            {isExternal && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                External
              </span>
            )}
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${getPortStateBadge(portState)}`}
            >
              Port: {getPortStateLabel(portState)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyToClipboard text={localUrl} label="Local URL copied">
            <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1">
              [link] {localUrl}
            </button>
          </CopyToClipboard>
          {!isExternal && (
            <>
              {isRunning ? (
                <>
                  <button
                    onClick={handleStop}
                    disabled={stopMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    Stop
                  </button>
                  <button
                    onClick={handleRestart}
                    disabled={restartMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                  >
                    Restart
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={startMutation.isPending}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Start
                </button>
              )}
              <button
                onClick={handleRunDiagnostics}
                disabled={diagnosticsMutation.isPending}
                className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {diagnosticsMutation.isPending ? 'Running...' : 'Diagnostics'}
              </button>
              <button
                onClick={handleCheckNow}
                disabled={checkNowMutation.isPending}
                className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Check Now
              </button>
              <button
                onClick={handleRemove}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-4 -mb-px" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selectedTab === tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                selectedTab === tab.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {selectedTab === 'overview' && (
          <OverviewTab
            app={app}
            runtimeState={runtimeState}
            isExternal={isExternal}
            localUrl={localUrl}
          />
        )}
        {selectedTab === 'timeline' && (
          <TimelineTab
            runtimeState={runtimeState}
            logs={logs?.entries || []}
            isLoading={logsLoading}
          />
        )}
        {selectedTab === 'health' && (
          <HealthHistoryTab
            healthHistory={healthHistory}
            onCheckNow={handleCheckNow}
            isChecking={checkNowMutation.isPending}
          />
        )}
        {selectedTab === 'port' && <PortStateTab runtimeState={runtimeState} app={app} />}
        {selectedTab === 'diagnostics' && (
          <DiagnosticsTab
            appId={appId}
            onRun={handleRunDiagnostics}
            isRunning={diagnosticsMutation.isPending}
          />
        )}
      </div>

      {showRemoveDialog && (
        <ConfirmDialog
          title="Remove Application"
          message={`Are you sure you want to remove "${app.name}"?`}
          details="Source files are NOT deleted. Only the NEST registration will be removed."
          onConfirm={() => removeMutation.mutate(appId)}
          onCancel={() => setShowRemoveDialog(false)}
          isPending={removeMutation.isPending}
        />
      )}
    </div>
  );
}

function OverviewTab({
  app,
  runtimeState,
  isExternal,
  localUrl,
}: {
  app: ApplicationConfig;
  runtimeState: RuntimeState | undefined;
  isExternal: boolean;
  localUrl: string;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <ConfigRow label="Name" value={app.name} />
          <ConfigRow label="Runtime" value={app.runtimeLabel || 'Custom'} />
          <ConfigRow label="Executable" value={app.executable} monospace />
          <ConfigRow label="Arguments" value={app.args.join(' ') || '—'} monospace />
          <ConfigRow label="Working Directory" value={app.workingDirectory} monospace />
          <ConfigRow label="Protocol" value={app.protocol.toUpperCase()} />
          <ConfigRow label="Port" value={app.port.toString()} />
          <ConfigRow label="Listen Address" value={app.expectedListenAddress} />
          <ConfigRow label="Mode" value={app.lifecycleMode} />
          <ConfigRow label="Health Check" value={app.healthCheck.type} />
          <ConfigRow label="Startup Timeout" value={`${app.startupTimeoutMs}ms`} />
          <ConfigRow label="Local URL" value={localUrl} monospace />
          {app.autoRestartPolicy?.enabled && (
            <>
              <ConfigRow label="Auto-Restart" value="Enabled" />
              <ConfigRow
                label="Max Restarts"
                value={app.autoRestartPolicy.maxRestarts.toString()}
              />
              <ConfigRow label="Window" value={`${app.autoRestartPolicy.windowMs / 1000}s`} />
              <ConfigRow label="Backoff Base" value={`${app.autoRestartPolicy.backoffBaseMs}ms`} />
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Environment Variables
        </h2>
        {app.env.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No environment variables configured</p>
        ) : (
          <div className="space-y-2">
            {app.env.map((env, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded"
              >
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-white min-w-[150px] truncate">
                  {env.key}
                </span>
                <span className="font-mono text-sm text-slate-600 dark:text-slate-400 flex-1 truncate">
                  {env.secret ? '****' : env.value}
                </span>
                {env.secret && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                    Secret
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Runtime State</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <StateCard label="Process State" value={runtimeState?.processState || 'unknown'} />
          <StateCard label="Health State" value={runtimeState?.healthState || 'unknown'} />
          <StateCard label="Port State" value={runtimeState?.portState || 'unknown'} />
          <StateCard label="PID" value={runtimeState?.pid?.toString() || '—'} />
          <StateCard
            label="Process Start"
            value={
              runtimeState?.processStartTime
                ? new Date(runtimeState.processStartTime).toLocaleString()
                : '—'
            }
          />
          <StateCard label="Listener" value={runtimeState?.listenerAddress || '—'} />
          <StateCard
            label="Last Health Check"
            value={
              runtimeState?.lastHealthCheck
                ? new Date(runtimeState.lastHealthCheck.timestamp).toLocaleString()
                : '—'
            }
          />
          <StateCard label="Last Error" value={runtimeState?.lastError || '—'} />
        </div>
      </div>
    </div>
  );
}

function TimelineTab({
  runtimeState,
  logs,
  isLoading,
}: {
  runtimeState: RuntimeState | undefined;
  logs: ActivityLogEntry[];
  isLoading: boolean;
}) {
  const events = logs
    .filter((log) => ['start', 'stop', 'restart', 'crash', 'health_change'].includes(log.eventType))
    .slice(0, 50);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">State Timeline</h2>
      </div>
      {events.length === 0 ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400">
          No timeline events
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {events.map((event) => (
            <TimelineEvent key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineEvent({ event }: { event: ActivityLogEntry }) {
  const time = new Date(event.timestamp).toLocaleString();
  const icons: Record<string, string> = {
    start: '[play]',
    stop: '[stop]',
    restart: '[restart]',
    crash: '[crash]',
    health_change: '[health]',
  };

  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      debug: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return styles[severity] || styles.info;
  };

  return (
    <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <div className="flex items-start gap-4">
        <span className="text-slate-500 dark:text-slate-400 font-mono text-sm whitespace-nowrap min-w-[150px]">
          {time}
        </span>
        <span className="text-2xl">{icons[event.eventType] || '[memo]'}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-slate-900 dark:text-white capitalize">
              {event.eventType.replace('_', ' ')}
            </h4>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${getSeverityBadge(event.severity)}`}
            >
              {event.severity}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{event.message}</p>
          {event.details && (
            <div className="mt-2 ml-10 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <pre>{JSON.stringify(event.details, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthHistoryTab({
  healthHistory,
  onCheckNow,
  isChecking,
}: {
  healthHistory: any[];
  onCheckNow: () => void;
  isChecking: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Health History</h2>
        <button
          onClick={onCheckNow}
          disabled={isChecking}
          className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {isChecking ? 'Checking...' : 'Check Now'}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {healthHistory.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            No health history available. Run a health check to start recording.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr className="text-left text-sm text-slate-500 dark:text-slate-400">
                  <th className="p-3">Time</th>
                  <th className="p-3">Process</th>
                  <th className="p-3">Port</th>
                  <th className="p-3">HTTP</th>
                  <th className="p-3">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {healthHistory.slice(0, 50).map((entry, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="p-3 text-sm font-mono text-slate-500 dark:text-slate-400">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${entry.processAlive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}
                      >
                        {entry.processAlive ? 'Alive' : 'Dead'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${entry.portListening ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}
                      >
                        {entry.portListening ? 'Listening' : 'Closed'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${entry.localResponding ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}
                      >
                        {entry.localResponding ? 'OK' : 'Failed'}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-slate-500 dark:text-slate-400 font-mono">
                      {entry.latencyMs !== undefined ? `${entry.latencyMs}ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PortStateTab({ runtimeState, app }: { runtimeState: RuntimeState | undefined; app: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Port Binding</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StateCard label="Port" value={app.port.toString()} monospace />
          <StateCard label="Bound Address" value={runtimeState?.listenerAddress || '—'} monospace />
          <StateCard label="Port State" value={runtimeState?.portState || 'unknown'} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Binding Class Reference
        </h2>
        <div className="space-y-2 text-sm">
          <BindingClassRow className="free" label="Free" description="Port not in use" />
          <BindingClassRow
            className="occupied_by_managed"
            label="Occupied by Managed"
            description="Port used by a NEST-managed app"
          />
          <BindingClassRow
            className="occupied_by_other"
            label="Occupied by Other"
            description="Port used by another process"
          />
          <BindingClassRow
            className="listening_loopback"
            label="Loopback Only (127.0.0.1)"
            description="Only accessible locally"
          />
          <BindingClassRow
            className="listening_all"
            label="All Interfaces (0.0.0.0)"
            description="Accessible on all network interfaces"
          />
          <BindingClassRow
            className="listening_lan"
            label="LAN Interface"
            description="Bound to specific LAN IP"
          />
        </div>
      </div>
    </div>
  );
}

function DiagnosticsTab({
  appId,
  onRun,
  isRunning,
}: {
  appId: string;
  onRun: () => void;
  isRunning: boolean;
}) {
  const [report, setReport] = useState<any>(null);

  const runDiagnostics = useMutation({
    mutationFn: (id: string) => nest.diagnostics.run(id),
    onSuccess: (result) => {
      if (result.ok) setReport(result.data);
    },
  });

  const getStepStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      fail: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      skipped: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      not_performed: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    };
    return styles[status] || styles.not_performed;
  };

  const renderReport = () => {
    if (!report) return null;
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 grid grid-cols-4 gap-4 text-center border-b border-slate-200 dark:border-slate-700">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {report.summary.passed}
            </p>
            <p className="text-xs text-green-800 dark:text-green-300">Passed</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {report.summary.failed}
            </p>
            <p className="text-xs text-red-800 dark:text-red-300">Failed</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/20 rounded-lg p-3">
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">
              {report.summary.skipped}
            </p>
            <p className="text-xs text-slate-800 dark:text-slate-300">Skipped</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/20 rounded-lg p-3">
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">
              {report.summary.notPerformed}
            </p>
            <p className="text-xs text-slate-800 dark:text-slate-300">Not Performed</p>
          </div>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {report.steps.map((step: any) => (
            <div key={step.id} className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${getStepStatusBadge(step.status)}`}
                >
                  {step.status}
                </span>
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900 dark:text-white">{step.name}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{step.detail}</p>
                  {step.suggestedAction && (
                    <p className="text-sm text-brand-600 dark:text-brand-400 mt-1">
                      → {step.suggestedAction}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <button
          onClick={onRun}
          disabled={isRunning}
          className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {isRunning ? 'Running...' : 'Run Diagnostics'}
        </button>
      </div>

      {renderReport()}
    </div>
  );
}

function ConfigRow({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <span className="text-slate-500 dark:text-slate-400 text-sm w-full sm:w-40">{label}</span>
      <span
        className={`text-sm text-slate-900 dark:text-white ${monospace ? 'font-mono' : ''} truncate`}
      >
        {value}
      </span>
    </div>
  );
}

function StateCard({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`text-sm font-medium text-slate-900 dark:text-white ${monospace ? 'font-mono' : ''} truncate`}
      >
        {value}
      </p>
    </div>
  );
}

function BindingClassRow({
  className,
  label,
  description,
}: {
  className: string;
  label: string;
  description: string;
}) {
  const styles: Record<string, string> = {
    free: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    occupied_by_managed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    occupied_by_other: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    listening_loopback: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    listening_all: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    listening_lan: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    not_listening: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  };
  return (
    <div className="flex items-center gap-3">
      <span
        className={`px-2 py-1 text-xs font-medium rounded ${styles[className] || styles.not_listening}`}
      >
        {label}
      </span>
      <span className="text-sm text-slate-600 dark:text-slate-400">{description}</span>
    </div>
  );
}
