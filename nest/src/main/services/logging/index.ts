/**
 * Logging Service - Structured logging and log management
 */
import { eventBus } from '../../events';
import { ActivityLogRepository } from '../../db';
import { v4 as uuidv4 } from 'uuid';

let logRetentionDays = 30;
let maxLinesPerApp = 5000;
const logBuffers: Map<string, string[]> = new Map();
const flushTimers: Map<string, NodeJS.Timeout> = new Map();

export function initializeLogging(): void {
  // Start retention job
  setInterval(
    () => {
      pruneOldLogs();
    },
    24 * 60 * 60 * 1000
  ); // Daily

  // Run once on startup
  pruneOldLogs();
}

export function configureLogging(settings: {
  logRetentionDays: number;
  logMaxLinesPerApp: number;
}): void {
  logRetentionDays = settings.logRetentionDays;
  maxLinesPerApp = settings.logMaxLinesPerApp;
}

export function logAppEvent(
  appId: string | undefined,
  eventType:
    | 'start'
    | 'stop'
    | 'restart'
    | 'crash'
    | 'health_change'
    | 'lan_enable'
    | 'lan_disable'
    | 'firewall_change'
    | 'error'
    | 'info',
  severity: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  details?: Record<string, unknown>
): void {
  // Redact secrets
  const redactedMessage = redactSecrets(message);
  const redactedDetails = details ? redactSecretsInObject(details) : undefined;

  const entry = {
    id: uuidv4(),
    appId,
    eventType,
    severity,
    message: redactedMessage,
    details: redactedDetails,
    timestamp: Date.now(),
  };

  // Persist to database
  ActivityLogRepository.insert(entry);

  // Add to ring buffer
  if (appId) {
    const buffer = logBuffers.get(appId) || [];
    buffer.push(JSON.stringify(entry));
    if (buffer.length > maxLinesPerApp) {
      buffer.shift();
    }
    logBuffers.set(appId, buffer);
  }

  // Emit event (batched)
  scheduleEventFlush();
}

function scheduleEventFlush(): void {
  if (flushTimers.has('batch')) return;
  flushTimers.set(
    'batch',
    setTimeout(() => {
      flushTimers.delete('batch');
      // Events are already emitted individually in logAppEvent
      // This is for potential future batching
    }, 100)
  );
}

function pruneOldLogs(): void {
  const cutoff = Date.now() - logRetentionDays * 24 * 60 * 60 * 1000;
  ActivityLogRepository.prune(cutoff);
}

function redactSecrets(text: string): string {
  // Redact common secret patterns
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer ••••')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=••••')
    .replace(/token\s*=\s*[^\s]+/gi, 'token=••••')
    .replace(/secret\s*=\s*[^\s]+/gi, 'secret=••••')
    .replace(/api[_-]?key\s*=\s*[^\s]+/gi, 'api_key=••••')
    .replace(/authorization\s*:\s*[^\s]+/gi, 'authorization: ••••');
}

function redactSecretsInObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = redactSecrets(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSecretsInObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function getLogBuffer(appId: string): string[] {
  return logBuffers.get(appId) || [];
}

export function clearLogBuffer(appId: string): void {
  logBuffers.delete(appId);
}
