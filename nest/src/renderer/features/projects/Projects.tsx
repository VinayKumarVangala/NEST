import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig, RuntimeState, AccessPolicy } from '@shared/types';
import { ConfirmDialog } from '@renderer/components/ConfirmDialog';
import { RegistrationWizard } from '@renderer/components/RegistrationWizard';
import { AppCard } from '@renderer/components/ui/AppCard';
import { Button } from '@renderer/components/ui/Button';
import { useToast } from '@renderer/hooks/useToast';

export function Projects() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [selectedAppForRemoval, setSelectedAppForRemoval] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

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

  const startMutation = useMutation({
    mutationFn: (id: string) => nest.apps.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps', 'runtime'] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => nest.apps.stop(id, false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps', 'runtime'] }),
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => nest.apps.restart(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps', 'runtime'] }),
  });

  const enableLANMutation = useMutation({
    mutationFn: (id: string) => nest.access.enable(id, 'I understand the risks'),
    onSuccess: (result, id) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ['apps', 'access', id] });
        toast({ title: 'LAN Access Enabled', message: `LAN access enabled for application`, variant: 'success' });
      } else {
        toast({ title: 'Failed', message: result.error.message, variant: 'destructive' });
      }
    },
    onError: (err) => toast({ title: 'Error', message: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' }),
  });

  const disableLANMutation = useMutation({
    mutationFn: (id: string) => nest.access.disable(id, true),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ['apps', 'access'] });
        toast({ title: 'LAN Access Disabled', message: 'LAN access has been disabled', variant: 'success' });
      } else {
        toast({ title: 'Failed', message: result.error.message, variant: 'destructive' });
      }
    },
    onError: (err) => toast({ title: 'Error', message: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' }),
  });

  const handleViewDetails = (appId: string) => {
    navigate(`/projects/${appId}`);
  };

  const handleOpenBrowser = (url: string) => {
    window.open(url, '_blank');
  };

  // Fetch runtime states and access policies for all apps
  const { data: runtimeStates } = useQuery({
    queryKey: ['apps', 'runtime'],
    queryFn: async () => {
      const results: Record<string, RuntimeState> = {};
      if (!apps) return results;
      for (const app of apps) {
        // Runtime state would be fetched from a separate endpoint or embedded in the app list
        // For now, use a default state
        results[app.id] = {
          appId: app.id,
          processState: 'unknown',
          healthState: 'unknown',
          portState: 'unknown',
          updatedAt: Date.now(),
        };
      }
      return results;
    },
    enabled: !!apps && apps.length > 0,
    refetchInterval: 5000,
  });

  const { data: accessPolicies } = useQuery({
    queryKey: ['apps', 'access'],
    queryFn: async () => {
      const results: Record<string, { policy: AccessPolicy; bindingClass: string; lanUrl?: string; isLanEligible: boolean }> = {};
      if (!apps) return results;
      for (const app of apps) {
        const result = await nest.access.getStatus(app.id);
        if (result.ok) {
          results[app.id] = result.data;
        }
      }
      return results;
    },
    enabled: !!apps && apps.length > 0,
    refetchInterval: 10000,
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
        <Button onClick={() => setShowWizard(true)} variant="primary">
          Register Application
        </Button>
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

      {apps?.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="text-4xl mb-4">📦</div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
            No applications registered
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Click 'Register Application' to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {apps?.map((app) => {
            const runtimeState = runtimeStates?.[app.id];
            const accessData = accessPolicies?.[app.id];
            const bindingClass = accessData?.bindingClass as
              | 'loopback_only'
              | 'all_interfaces'
              | 'specific_lan'
              | 'not_listening'
              | undefined;
            return (
              <AppCard
                key={app.id}
                app={app}
                runtimeState={runtimeState}
                accessPolicy={accessData?.policy}
                bindingClass={bindingClass}
                lanUrl={accessData?.lanUrl}
                isLanEligible={accessData?.isLanEligible}
                onStart={startMutation.mutate}
                onStop={(id) => stopMutation.mutate(id)}
                onRestart={(id) => restartMutation.mutate(id)}
                onRemove={setSelectedAppForRemoval}
                onOpenDetails={handleViewDetails}
                onEnableLAN={enableLANMutation.mutate}
                onDisableLAN={disableLANMutation.mutate}
                onViewLogs={() => navigate(`/projects/${app.id}?tab=logs`)}
                onOpenBrowser={handleOpenBrowser}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}