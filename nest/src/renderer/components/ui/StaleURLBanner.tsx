'use client';

import { cn } from '@renderer/lib/utils';
import { Button } from './Button';

interface StaleURLBannerProps {
  oldUrl: string;
  newUrl: string;
  onDismiss: () => void;
  onUpdate: () => void;
}

export function StaleURLBanner({ oldUrl, newUrl, onDismiss, onUpdate }: StaleURLBannerProps) {
  return (
    <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-t-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium text-amber-800 dark:text-amber-300">LAN URL Changed</span>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
            The network interface IP has changed. The previous LAN URL is no longer valid.
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-amber-600 dark:text-amber-400">Old:</span>
              <span className="font-mono text-amber-700 dark:text-amber-300 break-all">{oldUrl}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-green-600 dark:text-green-400">New:</span>
              <span className="font-mono text-green-700 dark:text-green-300 break-all">{newUrl}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 ml-2">
          <Button variant="primary" size="sm" onClick={onUpdate}>
            Re-run LAN Access
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}