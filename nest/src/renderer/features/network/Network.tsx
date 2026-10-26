import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { NetworkInterfaceInfo } from '@shared/types';

export function Network() {
  const queryClient = useQueryClient();
  const [selectedInterface, setSelectedInterface] = useState<string | null>(null);
  const [staleUrlWarning, setStaleUrlWarning] = useState<{
    appName: string;
    oldUrl: string;
    newUrl: string;
  } | null>(null);

  const {
    data: interfaces,
    isLoading,
    refetch,
  } = useQuery<NetworkInterfaceInfo[]>({
    queryKey: ['interfaces'],
    queryFn: async () => {
      const result = await nest.network.listInterfaces();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    refetchInterval: 5000,
  });

  const [selectingInterface, setSelectingInterface] = useState<string | null>(null);

  const selectInterfaceMutation = useMutation({
    mutationFn: (interfaceName: string) => nest.network.selectInterface(interfaceName),
    onMutate: (interfaceName) => {
      setSelectingInterface(interfaceName);
    },
    onSuccess: (result) => {
      if (result.ok) {
        setSelectedInterface(result.data.selected.name);
        queryClient.invalidateQueries({ queryKey: ['interfaces'] });
        queryClient.invalidateQueries({ queryKey: ['apps'] });
      }
      setSelectingInterface(null);
    },
    onError: () => {
      setSelectingInterface(null);
    },
  });

  // Listen for stale URL warnings from main process
  useEffect(() => {
    const unsubscribe = nest.on('network.staleUrl', (payload: any) => {
      setStaleUrlWarning({
        appName: payload.appName,
        oldUrl: payload.oldUrl,
        newUrl: payload.newUrl,
      });
    });
    return unsubscribe;
  }, []);

  const getProfileBadge = (profile: string) => {
    const styles: Record<string, string> = {
      Private: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      Public: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      DomainAuthenticated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      Unknown: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    };
    return styles[profile] || styles.Unknown;
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      Ethernet: '🔌',
      WiFi: '📶',
      VPN: '🔒',
      Virtual: '🖥️',
      Loopback: '🔄',
      Other: '❓',
    };
    return icons[type] || '❓';
  };

  const handleSelectInterface = (interfaceName: string, networkProfile: string) => {
    if (networkProfile === 'Public') {
      if (
        !window.confirm(
          'This interface is on a Public network profile. Using it for LAN access is not recommended ' +
            'for security reasons. Are you sure you want to continue?'
        )
      ) {
        return;
      }
    }
    selectInterfaceMutation.mutate(networkProfile === 'Public' ? networkProfile : networkProfile);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Network</h1>

      {/* Stale URL Warning Banner */}
      {staleUrlWarning && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-600 dark:text-amber-400 text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-medium text-amber-900 dark:text-amber-100">LAN URL Changed</h3>
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                The network interface IP changed. The LAN URL for{' '}
                <strong>{staleUrlWarning.appName}</strong> has changed.
              </p>
              <div className="mt-2 space-y-1 text-xs font-mono">
                <p>Old: {staleUrlWarning.oldUrl}</p>
                <p>New: {staleUrlWarning.newUrl}</p>
              </div>
              <button
                onClick={() => setStaleUrlWarning(null)}
                className="mt-3 px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Network Interfaces
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select an interface to use for LAN access. Only interfaces on <strong>Private</strong>{' '}
            networks are recommended for security.
          </p>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto"></div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {interfaces?.map((iface) => (
              <InterfaceRow
                key={iface.name}
                iface={iface}
                isSelected={selectedInterface === iface.name}
                isSelecting={selectInterfaceMutation.isPending && selectingInterface === iface.name}
                onSelect={() => handleSelectInterface(iface.name, iface.networkProfile)}
                getProfileBadge={getProfileBadge}
                getTypeIcon={getTypeIcon}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold mb-4">LAN Access Notes</h3>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li>
            • Only interfaces on <strong>Private</strong> network profiles can be used for LAN
            access
          </li>
          <li>• Public network profiles (coffee shops, airports) are blocked for security</li>
          <li>• The selected interface IP will be used to generate LAN URLs</li>
          <li>• Firewall rules will be scoped to the selected subnet only</li>
        </ul>
      </div>
    </div>
  );
}

function InterfaceRow({
  iface,
  isSelected,
  isSelecting,
  onSelect,
  getProfileBadge,
  getTypeIcon,
}: {
  iface: NetworkInterfaceInfo;
  isSelected: boolean;
  isSelecting: boolean;
  onSelect: () => void;
  getProfileBadge: (profile: string) => string;
  getTypeIcon: (type: string) => string;
}) {
  return (
    <div
      className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isSelected ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getTypeIcon(iface.type)}</span>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{iface.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{iface.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className="text-slate-500 dark:text-slate-400 font-mono">
            {iface.ipv4}/{iface.prefixLength}
          </span>
          <span className={`px-2 py-0.5 rounded ${getProfileBadge(iface.networkProfile)}`}>
            {iface.networkProfile}
          </span>
          {iface.gateway && (
            <span className="text-slate-500 dark:text-slate-400">Gateway: {iface.gateway}</span>
          )}
          {!iface.isUp && (
            <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded">
              Down
            </span>
          )}
          {!iface.isRecommended && iface.type !== 'Loopback' && (
            <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 rounded">
              Not recommended
            </span>
          )}
        </div>

        <button
          onClick={onSelect}
          disabled={isSelected || isSelecting}
          className={`px-3 py-1.5 text-sm rounded transition-colors ${
            isSelected
              ? 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400 cursor-not-allowed'
              : isSelecting
                ? 'bg-brand-400 text-white cursor-wait'
                : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          {isSelected ? 'Selected' : isSelecting ? 'Selecting...' : 'Use for LAN access'}
        </button>
      </div>
    </div>
  );
}

function getProfileBadge(profile: string) {
  const styles: Record<string, string> = {
    Private: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Public: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    DomainAuthenticated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    Unknown: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  };
  return styles[profile] || styles.Unknown;
}

function getTypeIcon(type: string) {
  const icons: Record<string, string> = {
    Ethernet: '🔌',
    WiFi: '📶',
    VPN: '🔒',
    Virtual: '🖥️',
    Loopback: '🔄',
    Other: '❓',
  };
  return icons[type] || '❓';
}
