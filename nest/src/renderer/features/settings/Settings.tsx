import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import { Button } from '@renderer/components/ui/Button';
import { useToast } from '@renderer/hooks/useToast';

export function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const result = await nest.settings.get();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });

  const { data: interfaces, isLoading: interfacesLoading } = useQuery({
    queryKey: ['network', 'interfaces'],
    queryFn: async () => {
      const result = await nest.network.listInterfaces();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });

  const { data: selectedInterface } = useQuery({
    queryKey: ['network', 'selectedInterface'],
    queryFn: async () => {
      const result = await nest.network.listInterfaces();
      if (!result.ok) return null;
      const data = result.data;
      const selected = data.find((i: any) => i.isRecommended);
      return selected || data[0];
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: any) => nest.settings.update(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Saved', message: 'Settings updated', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' }),
  });

  const selectInterfaceMutation = useMutation({
    mutationFn: (interfaceName: string) => nest.network.selectInterface(interfaceName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network', 'interfaces'] });
      queryClient.invalidateQueries({ queryKey: ['network', 'selectedInterface'] });
      toast({ title: 'Interface Selected', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to select interface', variant: 'destructive' }),
  });

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  const confirmationOptions = [
    { key: 'lanAccess', label: 'LAN Access Confirmation', description: 'Require explicit confirmation before enabling LAN access' },
    { key: 'firewallChange', label: 'Firewall Changes', description: 'Confirm before creating or modifying firewall rules' },
    { key: 'appRemoval', label: 'Application Removal', description: 'Confirm before removing an application registration' },
    { key: 'appStop', label: 'Stop Applications', description: 'Confirm before stopping running applications' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>

      {/* Application Behavior */}
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Application Behavior
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings?.backgroundMode}
              onChange={(e) => updateMutation.mutate({ backgroundMode: e.target.checked })}
              className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
            />
            <div>
              <span className="text-slate-700 dark:text-slate-300">Run in background</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">Hide to system tray on close; keep apps running</p>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings?.startupAtLogin}
              onChange={(e) => updateMutation.mutate({ startupAtLogin: e.target.checked })}
              className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
            />
            <div>
              <span className="text-slate-700 dark:text-slate-300">Start at login</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">Automatically launch NEST when you sign in</p>
            </div>
          </label>
        </div>
      </section>

      {/* Shutdown Policy */}
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
          </svg>
          Shutdown Policy
        </h2>
        <div className="space-y-2">
          {(['stop_all', 'keep_running', 'ask'] as const).map((policy) => (
            <label key={policy} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <input
                type="radio"
                name="shutdownPolicy"
                value={policy}
                checked={settings?.shutdownPolicy === policy}
                onChange={() => updateMutation.mutate({ shutdownPolicy: policy })}
                className="w-4 h-4 text-brand-600 border-slate-300 focus:ring-brand-500"
              />
              <div>
                <span className="text-slate-700 dark:text-slate-300 capitalize font-medium">
                  {policy.replace('_', ' ')}
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {policy === 'stop_all' && 'Stop all managed applications when NEST exits'}
                  {policy === 'keep_running' && 'Leave applications running when NEST exits'}
                  {policy === 'ask' && 'Prompt to choose when NEST exits'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Network Settings */}
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12a7 7 0 1114 0 7 7 0 01-14 0" />
          </svg>
          Network
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Preferred Network Interface
            </label>
            <div className="flex items-center gap-2">
              <select
                value={settings?.preferredInterface || ''}
                onChange={(e) =>
                  updateMutation.mutate({ preferredInterface: e.target.value || undefined })
                }
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                disabled={interfacesLoading}
              >
                <option value="">Auto-detect (recommended)</option>
                {interfaces?.map((iface: any) => (
                  <option key={iface.name} value={iface.name}>
                    {iface.name} ({iface.ipv4}) - {iface.type} - {iface.networkProfile}
                    {iface.isRecommended && ' (recommended)'}
                  </option>
                ))}
              </select>
              {selectedInterface && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectInterfaceMutation.mutate(selectedInterface.name)}
                  disabled={interfacesLoading}
                >
                  Use This
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              This interface will be used for LAN access. Auto-detect selects the recommended interface.
            </p>
          </div>

          {selectedInterface && (
            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
              <h4 className="font-medium text-slate-900 dark:text-white mb-1">Current Selection</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500 dark:text-slate-400">Interface:</span> <span className="text-slate-900 dark:text-white ml-2">{selectedInterface.name}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">IPv4:</span> <span className="text-slate-900 dark:text-white ml-2">{selectedInterface.ipv4}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Type:</span> <span className="text-slate-900 dark:text-white ml-2">{selectedInterface.type}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Profile:</span> <span className="text-slate-900 dark:text-white ml-2">{selectedInterface.networkProfile}</span></div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Confirmation Preferences */}
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Confirmation Preferences
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Configure which actions require explicit confirmation dialogs.
        </p>
        <div className="space-y-3">
          {confirmationOptions.map((opt) => (
            <label key={opt.key} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <input
                type="checkbox"
                checked={settings?.confirmationPreferences?.[opt.key] ?? true}
                onChange={(e) =>
                  updateMutation.mutate({
                    confirmationPreferences: {
                      ...settings?.confirmationPreferences,
                      [opt.key]: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 mt-0.5"
              />
              <div className="flex-1">
                <span className="text-slate-700 dark:text-slate-300 font-medium">{opt.label}</span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Security - Default Access Policy */}
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Security
        </h2>
        <div className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-medium text-green-800 dark:text-green-300">Default Access Policy: Local Only</h4>
                <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
                  This setting is locked for security. LAN access must be explicitly enabled per application
                  with user confirmation. No application can be automatically exposed to the network.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h4 className="font-medium text-amber-800 dark:text-amber-300">Firewall Rules</h4>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                  NEST only creates narrowly-scoped inbound rules for the Private network profile.
                  Rules are automatically removed when LAN access is disabled. NEST never disables
                  Windows Firewall or modifies rules not owned by NEST.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-medium text-blue-800 dark:text-blue-300">Management Interface</h4>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
                  NEST's management interface is never exposed to the network. Only your registered
                  applications are accessible via LAN. Remote administration of NEST is not supported.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logging */}
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Logging
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Retention (days)
            </label>
            <input
              type="number"
              value={settings?.logRetentionDays || 30}
              onChange={(e) =>
                updateMutation.mutate({ logRetentionDays: parseInt(e.target.value) })
              }
              className="w-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              min="1"
              max="365"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">How long to keep activity logs</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Max lines per app
            </label>
            <input
              type="number"
              value={settings?.logMaxLinesPerApp || 5000}
              onChange={(e) =>
                updateMutation.mutate({ logMaxLinesPerApp: parseInt(e.target.value) })
              }
              className="w-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              min="100"
              max="100000"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Maximum log entries per application</p>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          About
        </h2>
        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-slate-500 dark:text-slate-400">Version</span>
            <p className="font-mono text-slate-900 dark:text-white mt-1">1.0.0-dev</p>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-slate-500 dark:text-slate-400">Electron</span>
            <p className="font-mono text-slate-900 dark:text-white mt-1">{process.versions.electron}</p>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-slate-500 dark:text-slate-400">Node.js</span>
            <p className="font-mono text-slate-900 dark:text-white mt-1">{process.versions.node}</p>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
            <span className="text-slate-500 dark:text-slate-400">Platform</span>
            <p className="font-mono text-slate-900 dark:text-white mt-1">{process.platform} ({process.arch})</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.open('https://github.com/VinayKumarVangala/NEST', '_blank')}>
          View on GitHub
        </Button>
      </section>
    </div>
  );
}