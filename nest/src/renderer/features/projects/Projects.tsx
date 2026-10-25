import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig, Result } from '@shared/ipc-contract';

export function Projects() {
  const queryClient = useQueryClient();
  const [showWizard, setShowWizard] = useState(false);

  const { data: apps, isLoading } = useQuery<ApplicationConfig[]>({
    queryKey: ['apps'],
    queryFn: async () => {
      const result = await nest.apps.list();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (config: Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt'>) =>
      nest.apps.create(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setShowWizard(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => nest.apps.remove(id, false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Projects</h1>
        <button
          onClick={() => setShowWizard(true)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
        >
          Register Application
        </button>
      </div>

      {showWizard && (
        <RegistrationWizard onClose={() => setShowWizard(false)} onSubmit={createMutation.mutate} />
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {apps?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No applications registered
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              Click &apos;Register Application&apos; to get started
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {apps?.map((app) => (
              <ProjectRow key={app.id} app={app} onRemove={removeMutation.mutate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ app, onRemove }: { app: ApplicationConfig; onRemove: (id: string) => void }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex-1">
        <h3 className="font-medium text-slate-900 dark:text-white">{app.name}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {app.executable} {app.args.join(' ')}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Port: {app.port} • {app.protocol}://localhost:{app.port}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {confirmRemove ? (
          <>
            <button
              onClick={() => onRemove(app.id)}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function RegistrationWizard({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (config: any) => void;
}) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    projectPath: '',
    executable: '',
    args: '',
    workingDirectory: '',
    port: 3000,
    protocol: 'http' as 'http' | 'https',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      args: formData.args.split(' ').filter(Boolean),
      workingDirectory: formData.workingDirectory || formData.projectPath,
      env: [],
      expectedListenAddress: 'loopback',
      lifecycleMode: 'managed',
      startupTimeoutMs: 30000,
      healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
    });
  };

  const steps = [
    { title: 'Basics', fields: ['name', 'projectPath'] },
    { title: 'Launch', fields: ['executable', 'args', 'workingDirectory'] },
    { title: 'Port & Protocol', fields: ['port', 'protocol'] },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Register Application - Step {step} of {steps.length}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex gap-2 mb-4">
            {steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setStep(i + 1)}
                disabled={i + 1 > step + 1}
                className={`px-3 py-1 text-sm rounded ${
                  i + 1 === step
                    ? 'bg-brand-600 text-white'
                    : i + 1 < step
                      ? 'bg-green-100 text-green-800'
                      : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>

          {steps[step - 1].fields.map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {field}
              </label>
              <input
                type={field === 'port' ? 'number' : 'text'}
                value={formData[field as keyof typeof formData] || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    [field]: field === 'port' ? parseInt(e.target.value) || 0 : e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                required
              />
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
            >
              Cancel
            </button>
            {step < steps.length ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700"
              >
                Register
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
