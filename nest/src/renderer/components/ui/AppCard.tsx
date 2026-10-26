'use client';

import { nest } from '@renderer/lib/ipc';
import type { ApplicationConfig, RuntimeState, AccessPolicy } from '@shared/types';
import { Button } from './Button';
import { CopyButton } from './CopyButton';
import { QRCodeModal } from './QRCodeModal';
import { EnableLANAccessDialog } from './EnableLANAccessDialog';
import { StaleURLBanner } from './StaleURLBanner';
import { cn } from '@renderer/lib/utils';
import { useState } from 'react';
import { useToast } from '@renderer/hooks/useToast';

interface AppCardProps {
  app: ApplicationConfig;
  runtimeState?: RuntimeState;
  accessPolicy?: AccessPolicy;
  bindingClass?: 'loopback_only' | 'all_interfaces' | 'specific_lan' | 'not_listening';
  lanUrl?: string;
  isLanEligible?: boolean;
  onStart: (id: string) => void;
  onStop: (id: string, force?: boolean) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onEnableLAN: (id: string) => void;
  onDisableLAN: (id: string) => void;
  onViewLogs: (id: string) => void;
  onOpenBrowser: (url: string) => void;
}

export function AppCard({
  app,
  runtimeState,
  accessPolicy,
  bindingClass,
  lanUrl,
  isLanEligible,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onOpenDetails,
  onEnableLAN,
  onDisableLAN,
  onViewLogs,
  onOpenBrowser,
}: AppCardProps) {
  const { toast } = useToast();
  const [showEnableDialog, setShowEnableDialog] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [staleUrl, setStaleUrl] = useState<{ oldUrl: string; newUrl: string } | null>(null);

  const processState = runtimeState?.processState || 'unknown';
  const healthState = runtimeState?.healthState || 'unknown';
  const portState = runtimeState?.portState || 'unknown';
  const lanEnabled = accessPolicy?.mode === 'lan_enabled';

  const getProcessIndicator = () => {
    switch (processState) {
      case 'running': return { label: 'Process', status: 'running', color: 'green' };
      case 'starting': return { label: 'Process', status: 'starting', color: 'blue' };
      case 'stopped': return { label: 'Process', status: 'stopped', color: 'slate' };
      case 'failed': return { label: 'Process', status: 'failed', color: 'red' };
      case 'stopping': return { label: 'Process', status: 'stopping', color: 'amber' };
      case 'external': return { label: 'Process', status: 'external', color: 'purple' };
      default: return { label: 'Process', status: 'unknown', color: 'slate' };
    }
  };

  const getPortIndicator = () => {
    switch (portState) {
      case 'listening_all': return { label: 'Port', status: 'listening', color: 'green', detail: '0.0.0.0' };
      case 'listening_lan': return { label: 'Port', status: 'listening', color: 'green', detail: 'LAN IP' };
      case 'listening_loopback': return { label: 'Port', status: 'loopback', color: 'amber', detail: '127.0.0.1' };
      case 'occupied_by_managed': return { label: 'Port', status: 'occupied', color: 'amber', detail: 'Managed' };
      case 'occupied_by_other': return { label: 'Port', status: 'occupied', color: 'red', detail: 'Other' };
      case 'free': return { label: 'Port', status: 'free', color: 'slate', detail: 'Free' };
      default: return { label: 'Port', status: 'unknown', color: 'slate', detail: '?' };
    }
  };

  const getLocalResponseIndicator = () => {
    switch (healthState) {
      case 'healthy': return { label: 'Local', status: 'healthy', color: 'green' };
      case 'unhealthy': return { label: 'Local', status: 'unhealthy', color: 'red' };
      case 'checking': return { label: 'Local', status: 'checking', color: 'blue' };
      case 'not_applicable': return { label: 'Local', status: 'N/A', color: 'slate' };
      default: return { label: 'Local', status: 'unknown', color: 'slate' };
    }
  };

  const getLanIndicator = () => {
    if (!lanEnabled) {
      return { label: 'LAN', status: 'disabled', color: 'slate', detail: 'Local only' };
    }
    const verification = accessPolicy?.lastVerification || 'unverified';
    switch (verification) {
      case 'remote_user_confirmed': return { label: 'LAN', status: 'verified', color: 'green', detail: 'User confirmed' };
      case 'local_ok': return { label: 'LAN', status: 'local_ok', color: 'blue', detail: 'Local OK' };
      case 'failed': return { label: 'LAN', status: 'failed', color: 'red', detail: 'Failed' };
      default: return { label: 'LAN', status: 'unverified', color: 'amber', detail: 'Unverified' };
    }
  };

  const processIndicator = getProcessIndicator();
  const portIndicator = getPortIndicator();
  const localIndicator = getLocalResponseIndicator();
  const lanIndicator = getLanIndicator();

  const statusColors: Record<string, string> = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    slate: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  const statusIcons: Record<string, string> = {
    running: '●',
    starting: '◐',
    stopped: '○',
    failed: '✗',
    stopping: '◑',
    external: '◆',
    unknown: '?',
    listening: '◉',
    loopback: '◌',
    occupied: '◉',
    free: '○',
    healthy: '✓',
    unhealthy: '✗',
    checking: '⟳',
    'N/A': '−',
    verified: '✓',
    local_ok: '◑',
    unverified: '○',
    disabled: '−',
  };

  const copyLanUrl = async () => {
    if (lanUrl) {
      await navigator.clipboard.writeText(lanUrl);
      toast({ title: 'Copied', message: 'LAN URL copied to clipboard', variant: 'success' });
    }
  };

  const handleOpenBrowser = (url: string) => {
    onOpenBrowser(url);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Stale URL Banner */}
      {staleUrl && (
        <StaleURLBanner
          oldUrl={staleUrl.oldUrl}
          newUrl={staleUrl.newUrl}
          onDismiss={() => setStaleUrl(null)}
          onUpdate={() => { onEnableLAN(app.id); setStaleUrl(null); }}
        />
      )}

      {/* Card Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white truncate">{app.name}</h3>
              {app.runtimeLabel && (
                <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                  {app.runtimeLabel}
                </span>
              )}
              {app.lifecycleMode === 'external' && (
                <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                  External
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">{app.projectPath}</p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenDetails(app.id)}>Details</Button>
            <Button variant="ghost" size="sm" onClick={() => onViewLogs(app.id)}>Logs</Button>
          </div>
        </div>
      </div>

      {/* Four Indicators */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
        <div className="grid grid-cols-4 gap-3">
          <Indicator
            label={processIndicator.label}
            status={processIndicator.status}
            color={processIndicator.color}
            icon={statusIcons[processIndicator.status]}
          />
          <Indicator
            label={portIndicator.label}
            status={portIndicator.status}
            color={portIndicator.color}
            icon={statusIcons[portIndicator.status]}
            detail={portIndicator.detail}
          />
          <Indicator
            label={localIndicator.label}
            status={localIndicator.status}
            color={localIndicator.color}
            icon={statusIcons[localIndicator.status]}
          />
          <Indicator
            label={lanIndicator.label}
            status={lanIndicator.status}
            color={lanIndicator.color}
            icon={statusIcons[lanIndicator.status]}
            detail={lanIndicator.detail}
          />
        </div>
      </div>

      {/* URLs */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0">Local</span>
          <span className="font-mono text-sm text-slate-900 dark:text-white flex-1 break-all">
            {app.protocol}://localhost:{app.port}
          </span>
          <Button variant="ghost" size="sm" onClick={() => handleOpenBrowser(`${app.protocol}://localhost:${app.port}`)}>
            Open
          </Button>
        </div>
        {lanUrl && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0">LAN</span>
            <span className="font-mono text-sm text-slate-900 dark:text-white flex-1 break-all">{lanUrl}</span>
            <CopyButton text={lanUrl} onCopy={copyLanUrl} label="Copy" size="sm" variant="ghost" />
            <Button variant="ghost" size="sm" onClick={() => handleOpenBrowser(lanUrl)}>Open</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowQR(true)}>QR</Button>
          </div>
        )}
        {!lanUrl && lanEnabled && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0">LAN</span>
            <span className="text-sm text-amber-600 dark:text-amber-400 flex-1">Waiting for verification...</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 space-y-2">
        {processState === 'running' ? (
          <>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => onStop(app.id)} className="flex-1">Stop</Button>
              <Button variant="outline" size="sm" onClick={() => onRestart(app.id)} className="flex-1">Restart</Button>
            </div>
            {!lanEnabled && isLanEligible && (
              <Button variant="primary" size="sm" onClick={() => setShowEnableDialog(true)} className="w-full">
                Enable LAN Access
              </Button>
            )}
            {lanEnabled && (
              <Button variant="outline" size="sm" onClick={() => onDisableLAN(app.id)} className="w-full">
                Disable LAN Access
              </Button>
            )}
            {!isLanEligible && !lanEnabled && bindingClass && (
              <Button variant="ghost" size="sm" disabled className="w-full">
                {bindingClass === 'loopback_only' ? 'Loopback Only' : bindingClass === 'not_listening' ? 'Not Listening' : 'Not Eligible'}
              </Button>
            )}
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={() => onStart(app.id)} className="w-full">
            Start
          </Button>
        )}
      </div>

      {/* Enable LAN Dialog */}
      <EnableLANAccessDialog
        isOpen={showEnableDialog}
        onClose={() => setShowEnableDialog(false)}
        app={app}
      />

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        data={lanUrl || ''}
        title={`${app.name} LAN Access`}
      />
    </div>
  );
}

interface IndicatorProps {
  label: string;
  status: string;
  color: string;
  icon: string;
  detail?: string;
}

function Indicator({ label, status, color, icon, detail }: IndicatorProps) {
  const statusColors: Record<string, string> = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    slate: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-1">
        <span className={cn('px-2 py-0.5 text-xs font-medium rounded', statusColors[color] || statusColors.slate)}>
          {icon} {status}
        </span>
      </div>
      {detail && (
        <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center">{detail}</span>
      )}
    </div>
  );
}