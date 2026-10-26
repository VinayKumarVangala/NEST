import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { DiagnosticReport, DiagnosticStep, ApplicationConfig } from '@shared/types';
import { Button, CopyButton, QRCodeModal } from '@renderer/components/ui';
import { useToast } from '@renderer/hooks/useToast';

export function Diagnostics() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationConfig | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [lanUrl, setLanUrl] = useState('');

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
      else toast({ title: 'Diagnostics failed', message: result.error.message, variant: 'destructive' });
    },
    onError: (err) => toast({ title: 'Error', message: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' }),
  });

  // Update selected app when selection changes
  if (selectedAppId && apps) {
    const app = apps.find((a: any) => a.id === selectedAppId);
    if (app && app !== selectedApp) setSelectedApp(app);
  }

  // Build LAN URL for QR code
  if (selectedApp && selectedAppId && !lanUrl) {
    const selectedInterface = queryClient.getQueryData<{ selected: any }>(['network', 'selectedInterface']);
    const interfaces = queryClient.getQueryData<any[]>(['network', 'interfaces']);
    if (selectedInterface?.selected && interfaces) {
      const selected = interfaces.find((i: any) => i.name === selectedInterface.selected.name);
      if (selected) {
        setLanUrl(`${selectedApp.protocol}://${selected.ipv4}:${selectedApp.port}`);
      }
    }
  }

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

  const copyLanUrl = async () => {
    if (lanUrl) {
      await navigator.clipboard.writeText(lanUrl);
      toast({ title: 'Copied', message: 'LAN URL copied to clipboard', variant: 'success' });
    }
  };

  const copyReport = async () => {
    if (report && selectedApp) {
      const lines = [
        `Application: ${selectedApp.name}`,
        `Process: ${report.steps.find(s => s.id === 'process')?.detail || 'Unknown'}`,
        `Port ${selectedApp.port}: ${report.steps.find(s => s.id === 'port')?.detail || 'Unknown'}`,
        `Local HTTP check: ${report.steps.find(s => s.id === 'local_http')?.detail || 'N/A'}`,
        `LAN binding: ${report.steps.find(s => s.id === 'binding')?.detail || 'Unknown'}`,
        `Firewall rule: ${report.steps.find(s => s.id === 'firewall')?.detail || 'N/A'}`,
        `Remote device check: ${report.steps.find(s => s.id === 'remote_check')?.detail || 'N/A'}`,
        '',
        'Result:',
        report.summary.failed === 0
          ? 'The application is configured for LAN access. Verify connectivity from a second device on the same network.'
          : 'The application has connectivity issues. Review failed steps above.',
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({ title: 'Copied', message: 'Diagnostic report copied to clipboard', variant: 'success' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Diagnostics</h1>
        <div className="flex gap-2">
          {lanUrl && (
            <>
              <CopyButton text={lanUrl} onCopy={copyLanUrl} label="Copy LAN URL" />
              <Button variant="outline" onClick={() => setShowQR(true)}>
                QR Code
              </Button>
            </>
          )}
          {report && <Button variant="outline" onClick={copyReport}>Copy Report</Button>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Select Application
        </label>
        <select
          value={selectedAppId || ''}
          onChange={(e) => {
            setSelectedAppId(e.target.value || null);
            setReport(null);
            setLanUrl('');
          }}
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
            <Button
              onClick={() => runDiagnostics.mutate(selectedAppId!)}
              disabled={runDiagnostics.isPending}
              variant={runDiagnostics.isPending ? 'secondary' : 'primary'}
            >
              {runDiagnostics.isPending ? 'Running...' : 'Run Diagnostics'}
            </Button>
          </div>

          {report && (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
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

              {/* Brief-style summary output */}
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Brief-Style Summary</h3>
                <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded text-sm font-mono text-slate-900 dark:text-slate-100 overflow-x-auto">
                  {selectedApp && report && (
                    <>
                      Application: {selectedApp.name}\n
                      Process: {report.steps.find(s => s.id === 'process')?.detail || 'Unknown'}\n
                      Port {selectedApp.port}: {report.steps.find(s => s.id === 'port')?.detail || 'Unknown'}\n
                      Local HTTP check: {report.steps.find(s => s.id === 'local_http')?.detail || 'N/A'}\n
                      LAN binding: {report.steps.find(s => s.id === 'binding')?.detail || 'Unknown'}\n
                      Firewall rule: {report.steps.find(s => s.id === 'firewall')?.detail || 'N/A'}\n
                      Remote device check: {report.steps.find(s => s.id === 'remote_check')?.detail || 'N/A'}\n
                      \n
                      Result:\n
                      {report.summary.failed === 0
                        ? 'The application is configured for LAN access.\nVerify connectivity from a second device on the same network.'
                        : 'The application has connectivity issues.\nReview failed steps above.'}
                    </>
                  )}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        data={lanUrl}
        title={`${selectedApp?.name} LAN Access`}
      />
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
  const statusIcons: Record<string, string> = {
    pass: '✓',
    fail: '✗',
    skipped: '⊘',
    not_performed: '○',
  };

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
      <div className="flex items-start gap-4">
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded ${getStepStatusBadge(step.status)} flex items-center gap-1`}
        >
          {statusIcons[step.status]} {step.status}
        </span>
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 dark:text-white">{step.name}</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">{step.detail}</p>
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