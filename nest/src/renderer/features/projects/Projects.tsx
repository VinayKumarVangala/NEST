import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig } from '@shared/types';
import { ConfirmDialog } from '@renderer/components/ConfirmDialog';
import { RegistrationWizard } from '@renderer/components/RegistrationWizard';
import { FolderPicker } from '@renderer/components/FolderPicker';

export function Projects() {
  const queryClient = useQueryClient();
  const [showWizard, setShowWizard] = useState(false);
  const [selectedAppForRemoval, setSelectedAppForRemoval] = useState<string | null>(null);

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

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {apps?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No applications registered
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              Click 'Register Application' to get started
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {apps?.map((app) => (
              <ProjectRow key={app.id} app={app} onRemove={setSelectedAppForRemoval} />
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
