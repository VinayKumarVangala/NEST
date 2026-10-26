import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nest } from '@renderer/lib/ipc';
import type {
  ApplicationConfig,
  RuntimeState,
  HealthCheckResult,
  ActivityLogEntry,
} from '@shared/types';
import { ConfirmDialog } from '@renderer/components/ConfirmDialog';
import { CopyToClipboard } from '@renderer/components/CopyToClipboard';

const checkNowMutation = useMutation({
  mutationFn: (id: string) => nest.health.checkNow(id),
  onSuccess: (result) => {
    if (result.ok) {
      const entry = {
        timestamp: Date.now(),
        processAlive: result.data.processAlive,
        portListening: result.data.portListening,
        localResponding: result.data.localResponding,
        latencyMs: result.data.latencyMs,
      };
      setHealthHistory((prev) => [entry, ...prev.slice(0, 99)]);
    }
  },
});
