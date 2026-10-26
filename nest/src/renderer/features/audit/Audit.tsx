import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type { AuditEntry, AuditQueryParams, PrivilegedOperationType, PrivilegedOperationOutcome } from '@shared/types';
import { cn } from '@renderer/lib/utils';
import { format } from 'date-fns';

const OPERATION_LABELS: Record<PrivilegedOperationType, string> = {
  firewall_add: 'Firewall Add',
  firewall_remove: 'Firewall Remove',
  firewall_reconcile: 'Firewall Reconcile',
  process_terminate: 'Process Terminate',
  lan_enable: 'LAN Enable',
  lan_disable: 'LAN Disable',
  elevation_request: 'Elevation Request',
};

const OUTCOME_LABELS: Record<PrivilegedOperationOutcome, { label: string; color: string; icon: string }> = {
  success: { label: 'Success', color: 'text-green-700 bg-green-100', icon: '✓' },
  failed: { label: 'Failed', color: 'text-red-700 bg-red-100', icon: '✗' },
  elevation_denied: { label: 'Elevation Denied', color: 'text-orange-700 bg-orange-100', icon: '⚠' },
  policy_blocked: { label: 'Policy Blocked', color: 'text-red-700 bg-red-100', icon: '🚫' },
  execution_policy_restricted: { label: 'Execution Policy', color: 'text-red-700 bg-red-100', icon: '📜' },
  hash_mismatch: { label: 'Hash Mismatch', color: 'text-red-700 bg-red-100', icon: '🔐' },
  rule_disabled_by_admin: { label: 'Disabled by Admin', color: 'text-amber-700 bg-amber-100', icon: '🔧' },
  rule_exists_disabled: { label: 'Exists but Disabled', color: 'text-amber-700 bg-amber-100', icon: '⏸' },
  internal_error: { label: 'Internal Error', color: 'text-red-700 bg-red-100', icon: '💥' },
};

export function Audit() {
  const [filters, setFilters] = useState<AuditQueryParams>({
    limit: 100,
    offset: 0,
  });
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', filters],
    queryFn: async () => {
      const result = await nest.audit.query(filters);
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });

  const handleFilterChange = (newFilters: Partial<AuditQueryParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, offset: 0 }));
  };

  const handleOperationTypeChange = (value: string) => {
    handleFilterChange({ operationType: value as PrivilegedOperationType | undefined });
  };

  const handleOutcomeChange = (value: string) => {
    handleFilterChange({ outcome: value as PrivilegedOperationOutcome | undefined });
  };

  const handlePageChange = (newOffset: number) => {
    setFilters((prev) => ({ ...prev, offset: newOffset }));
  };

  const formatTimestamp = (timestamp: number) => {
    return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss.SSS');
  };

  const getOutcomeInfo = (outcome: PrivilegedOperationOutcome) => {
    return OUTCOME_LABELS[outcome] || { label: outcome, color: 'text-slate-700 bg-slate-100', icon: '?' };
  };

  const copyDetails = (entry: AuditEntry) => {
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        Failed to load audit entries: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Log</h1>
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-600 dark:text-slate-400">
            Show:
            <select
              value={filters.limit}
              onChange={(e) => handleFilterChange({ limit: parseInt(e.target.value) })}
              className="ml-2 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Operation Type
            </label>
            <select
              value={filters.operationType || ''}
              onChange={(e) => handleOperationTypeChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            >
              <option value="">All Types</option>
              {Object.entries(OPERATION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Outcome
            </label>
            <select
              value={filters.outcome || ''}
              onChange={(e) => handleOutcomeChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            >
              <option value="">All Outcomes</option>
              {Object.entries(OUTCOME_LABELS).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              App ID (optional)
            </label>
            <input
              type="text"
              value={filters.appId || ''}
              onChange={(e) => handleFilterChange({ appId: e.target.value || undefined })}
              placeholder="Filter by app ID"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Time Range
            </label>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={filters.from ? new Date(filters.from).toISOString().slice(0, 16) : ''}
                onChange={(e) => handleFilterChange({ from: e.target.value ? new Date(e.target.value).getTime() : undefined })}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="datetime-local"
                value={filters.to ? new Date(filters.to).toISOString().slice(0, 16) : ''}
                onChange={(e) => handleFilterChange({ to: e.target.value ? new Date(e.target.value).getTime() : undefined })}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setFilters({ limit: 100, offset: 0 })}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Showing {data?.entries.length || 0} of {data?.total || 0} entries
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handlePageChange(Math.max(0, (filters.offset || 0) - (filters.limit || 100)))}
            disabled={(filters.offset || 0) === 0}
            className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => handlePageChange((filters.offset || 0) + (filters.limit || 100))}
            disabled={(data?.entries.length || 0) < (filters.limit || 100)}
            className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Audit Entries Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Operation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  App
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Outcome
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Elevation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  OS Error
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {data?.entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={cn(
                    'hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors',
                    selectedEntry?.id === entry.id && 'bg-brand-50 dark:bg-brand-900/20'
                  )}
                  onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                >
                  <td className="px-4 py-3 text-sm font-mono text-slate-900 dark:text-white">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">
                    {OPERATION_LABELS[entry.operationType as PrivilegedOperationType] || entry.operationType}
                  </td>
                  <td className="px-4 py-3">
                    {entry.appName && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{entry.appName}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{entry.appId?.slice(0, 8)}...</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const info = getOutcomeInfo(entry.outcome);
                      return (
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', info.color)}>
                          {info.icon} {info.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                    {entry.requiresElevation ? (
                      <span className={cn('inline-flex items-center gap-1', entry.wasElevated ? 'text-green-700' : 'text-red-700')}>
                        {entry.wasElevated ? '✓ Elevated' : '✗ Denied'}
                      </span>
                    ) : (
                      <span className="text-slate-400">Not Required</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">
                    {entry.osErrorText || (entry.outcome === 'success' ? '—' : 'No OS error text')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyDetails(entry);
                      }}
                      className="px-2 py-1 text-xs text-brand-600 hover:text-brand-700 dark:hover:text-brand-400"
                    >
                      Copy JSON
                    </button>
                  </td>
                </tr>
              ))}
              {(!data?.entries.length || data.entries.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    No audit entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedEntry(null)}>
          <div
            className="bg-white dark:bg-slate-800 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Audit Entry Details</h2>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <DetailRow label="ID" value={selectedEntry.id} />
                <DetailRow label="Timestamp" value={formatTimestamp(selectedEntry.timestamp)} />
                <DetailRow label="Operation" value={OPERATION_LABELS[selectedEntry.operationType] || selectedEntry.operationType} />
                <DetailRow
                  label="Outcome"
                  value={
                    <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', getOutcomeInfo(selectedEntry.outcome).color)}>
                      {getOutcomeInfo(selectedEntry.outcome).icon} {getOutcomeInfo(selectedEntry.outcome).label}
                    </span>
                  }
                />
                <DetailRow label="App ID" value={selectedEntry.appId || '—'} />
                <DetailRow label="App Name" value={selectedEntry.appName || '—'} />
                <DetailRow
                  label="Elevation Required"
                  value={selectedEntry.requiresElevation ? 'Yes' : 'No'}
                />
                <DetailRow
                  label="Was Elevated"
                  value={selectedEntry.wasElevated ? 'Yes' : 'No'}
                />
                <DetailRow label="OS Error Text" value={selectedEntry.osErrorText || '—'} />
              </div>
              <div>
                <h3 className="font-medium text-slate-900 dark:text-white mb-2">Details (JSON)</h3>
                <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded text-xs overflow-auto max-h-64">
                  {JSON.stringify(selectedEntry.details, null, 2)}
                </pre>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(selectedEntry, null, 2));
                  }}
                  className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Copy Full JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
      <div className="text-sm text-slate-900 dark:text-white font-mono break-all">{value}</div>
    </div>
  );
}