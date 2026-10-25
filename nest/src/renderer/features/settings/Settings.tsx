import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';

export function Settings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const result = await nest.settings.get();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: any) => nest.settings.update(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-4">Application Behavior</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings?.backgroundMode}
                onChange={(e) => updateMutation.mutate({ backgroundMode: e.target.checked })}
                className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
              />
              <span className="text-slate-700 dark:text-slate-300">
                Run in background (hide to tray on close)
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings?.startupAtLogin}
                onChange={(e) => updateMutation.mutate({ startupAtLogin: e.target.checked })}
                className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
              />
              <span className="text-slate-700 dark:text-slate-300">Start at login</span>
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Shutdown Policy</h2>
          <div className="space-y-2">
            {(['stop_all', 'keep_running', 'ask'] as const).map((policy) => (
              <label key={policy} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="shutdownPolicy"
                  value={policy}
                  checked={settings?.shutdownPolicy === policy}
                  onChange={() => updateMutation.mutate({ shutdownPolicy: policy })}
                  className="w-4 h-4 text-brand-600 border-slate-300 focus:ring-brand-500"
                />
                <span className="text-slate-700 dark:text-slate-300 capitalize">
                  {policy.replace('_', ' ')}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Network</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Preferred Interface
              </label>
              <select
                value={settings?.preferredInterface || ''}
                onChange={(e) =>
                  updateMutation.mutate({ preferredInterface: e.target.value || undefined })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="">Auto-detect</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Logging</h2>
          <div className="space-y-4">
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
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Security</h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Default access policy is locked to <strong>Local only</strong> for security. LAN
              access must be explicitly enabled per application with user confirmation.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
