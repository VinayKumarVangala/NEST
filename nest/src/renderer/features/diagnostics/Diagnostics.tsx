import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { DiagnosticReport, DiagnosticStep } from '@shared/types';

export function Diagnostics() {
  const queryClient = useQueryClient();
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);

  const { data: apps, isLoading: appsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: async () => {
      const result = await nest.apps.list();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });

  const runDiagnostics = useMutation({
    mutationFn: (appId: string) => nest.diagnostics.run(appId),
    onSuccess: (result) => {
      if (result.ok) setReport(result.data);
    },
  });

  if (appsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  const getStepStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      fail: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      skipped: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      not_performed: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    };
    return styles[status] || styles.not_performed;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Diagnostics</h1>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Select Application
        </label>
        <select
          value={selectedAppId || ''}
          onChange={(e) => setSelectedAppId(e.target.value || null)}
          className="w-full md:w-64 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
        >
          <option value="">-- Choose an application --</option>
          {apps?.map((app: any) => (
            <option key={app.id} value={app.id}>
              {app.name} (port {app.port})
            </option>
          ))}
        </select>
      </div>

      {selectedAppId && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Diagnostic Report</h2>
            <button
              onClick={() => runDiagnostics.mutate(selectedAppId!)}
              disabled={runDiagnostics.isPending}
              className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {runDiagnostics.isPending ? 'Running...' : 'Run Diagnostics'}
            </button>
          </div>

          {report && (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              <div className="p-4 grid grid-cols-4 gap-4 text-center">
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

              <div className="p-4 space-y-3">
                {report.steps.map((step) => (
                  <DiagnosticStepRow
                    key={step.id}
                    step={step}
                    getStepStatusBadge={getStepStatusBadge}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticStepRow({
  step,
  getStepStatusBadge,
}: {
  step: DiagnosticStep;
  getStepStatusBadge: (status: string) => string;
}) {
  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
      <div className="flex items-start gap-4">
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
  );
}
