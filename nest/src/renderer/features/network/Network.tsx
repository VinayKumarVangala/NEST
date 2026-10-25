import { useQuery } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { NetworkInterfaceInfo, Result } from '@shared/ipc-contract';

export function Network() {
  const { data: interfaces, isLoading } = useQuery<NetworkInterfaceInfo[]>({
    queryKey: ['interfaces'],
    queryFn: async () => {
      const result = await nest.network.listInterfaces();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Network</h1>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold">Network Interfaces</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select an interface to use for LAN access. Only interfaces on Private networks are
            recommended.
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
  getProfileBadge,
  getTypeIcon,
}: {
  iface: NetworkInterfaceInfo;
  getProfileBadge: (profile: string) => string;
  getTypeIcon: (type: string) => string;
}) {
  return (
    <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getTypeIcon(iface.type)}</span>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{iface.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{iface.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {iface.ipv4}/{iface.prefixLength}
          </span>
          <span className={`px-2 py-0.5 rounded ${getProfileBadge(iface.networkProfile)}`}>
            {iface.networkProfile}
          </span>
          {iface.gateway && (
            <span className="text-slate-500 dark:text-slate-400">Gateway: {iface.gateway}</span>
          )}
          {!iface.isRecommended && iface.type !== 'Loopback' && (
            <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 rounded">
              Not recommended
            </span>
          )}
        </div>

        <button className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors">
          Use for LAN access
        </button>
      </div>
    </div>
  );
}
