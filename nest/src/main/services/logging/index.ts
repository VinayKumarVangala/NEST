/**
 * Logging Service - Structured logging and log management
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { eventBus } from '../../events';
import { ActivityLogRepository } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import type { ActivityLogEntry } from '@shared/types';

// Configuration
let logRetentionDays = 30;
let maxLinesPerApp = 5000;
let enableFileLogging = false;
let maxFileSizeBytes = 10 * 1024 * 1024; // 10MB default
let maxFilesPerApp = 5;

// In-memory ring buffers (bounded)
const logBuffers: Map<string, string[]> = new Map();

// Batch emission queue
const emissionQueue: ActivityLogEntry[] = [];
let emissionTimer: NodeJS.Timeout | null = null;
const EMISSION_BATCH_MS = 100;

// File handles for rolling logs
const fileHandles: Map<string, fs.WriteStream> = new Map();
const fileSizes: Map<string, number> = new Map();

// Secret keys that should be redacted from env values
const SECRET_ENV_KEYS: ReadonlySet<string> = new Set([
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'auth_token',
  'bearer',
  'authorization',
]);

/**
 * Initialize the logging service
 */
export function initializeLogging(): void {
  // Ensure log directory exists
  if (enableFileLogging) {
    ensureLogDirectory();
  }

  // Start retention job (daily)
  setInterval(
    () => {
      pruneOldLogs();
    },
    24 * 60 * 60 * 1000
  );

  // Run once on startup
  pruneOldLogs();
}

/**
 * Configure logging settings
 */
export function configureLogging(settings: {
  logRetentionDays: number;
  logMaxLinesPerApp: number;
  enableFileLogging?: boolean;
  logMaxFileSizeMB?: number;
  logMaxFilesPerApp?: number;
}): void {
  logRetentionDays = settings.logRetentionDays;
  maxLinesPerApp = settings.logMaxLinesPerApp;
  enableFileLogging = settings.enableFileLogging ?? false;
  maxFileSizeBytes = (settings.logMaxFileSizeMB ?? 10) * 1024 * 1024;
  maxFilesPerApp = settings.logMaxFilesPerApp ?? 5;

  if (enableFileLogging) {
    ensureLogDirectory();
  }
}

/**
 * Ensure log directory exists
 */
function ensureLogDirectory(): void {
  const logDir = getLogDirectory();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Get the base log directory
 */
function getLogDirectory(): string {
  return path.join(app.getPath('userData'), 'logs');
}

/**
 * Get the log directory for a specific app
 */
function getAppLogDirectory(appId: string): string {
  return path.join(getLogDirectory(), appId);
}

/**
 * Log an application event (structured event)
 */
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

  const entry: ActivityLogEntry = {
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
    addToRingBuffer(appId, entry);
  }

  // Queue for batched emission to renderer
  queueForEmission(entry);
}

/**
 * Log raw process output (stdout/stderr) from an app
 */
export function logProcessOutput(appId: string, stream: 'stdout' | 'stderr', data: string): void {
  const lines = data.split('\n').filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Redact secrets from process output
    const redactedLine = redactSecrets(line);

    const entry: ActivityLogEntry = {
      id: uuidv4(),
      appId,
      eventType: 'info',
      severity: stream === 'stderr' ? 'warn' : 'info',
      message: `[${stream}] ${redactedLine}`,
      details: { stream },
      timestamp: Date.now(),
    };

    // Add to ring buffer (not persisted to DB for high-volume output)
    addToRingBuffer(appId, entry);

    // Write to file if enabled
    if (enableFileLogging) {
      writeToFile(appId, entry);
    }

    // Queue for batched emission
    queueForEmission(entry);
  }
}

/**
 * Add entry to ring buffer (bounded)
 */
function addToRingBuffer(appId: string, entry: ActivityLogEntry): void {
  const buffer = logBuffers.get(appId) || [];
  buffer.push(JSON.stringify(entry));

  // Maintain bounded size
  if (buffer.length > maxLinesPerApp) {
    buffer.shift();
  }

  logBuffers.set(appId, buffer);
}

/**
 * Write entry to rolling log file
 */
function writeToFile(appId: string, entry: ActivityLogEntry): void {
  const appLogDir = getAppLogDirectory(appId);
  if (!fs.existsSync(appLogDir)) {
    fs.mkdirSync(appLogDir, { recursive: true });
  }

  const logFile = path.join(appLogDir, 'app.log');
  const line = JSON.stringify(entry) + '\n';
  const lineBytes = Buffer.byteLength(line, 'utf8');

  // Check if we need to rotate
  let currentSize = fileSizes.get(appId) || 0;
  if (currentSize + lineBytes > maxFileSizeBytes) {
    rotateLogFile(appId);
    currentSize = 0;
  }

  // Get or create write stream
  let stream = fileHandles.get(appId);
  if (!stream) {
    stream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' });
    fileHandles.set(appId, stream);
  }

  stream.write(line);
  fileSizes.set(appId, currentSize + lineBytes);
}

/**
 * Rotate log file (rename current, create new)
 */
function rotateLogFile(appId: string): void {
  const appLogDir = getAppLogDirectory(appId);
  const logFile = path.join(appLogDir, 'app.log');

  // Close existing stream
  const stream = fileHandles.get(appId);
  if (stream) {
    stream.end();
    fileHandles.delete(appId);
  }

  // Rotate existing files
  for (let i = maxFilesPerApp - 1; i >= 1; i--) {
    const oldFile = path.join(appLogDir, `app.log.${i}`);
    const newFile = path.join(appLogDir, `app.log.${i + 1}`);

    if (fs.existsSync(oldFile)) {
      if (i === maxFilesPerApp - 1) {
        fs.unlinkSync(oldFile); // Delete oldest
      } else {
        fs.renameSync(oldFile, newFile);
      }
    }
  }

  // Rename current to .1
  if (fs.existsSync(logFile)) {
    fs.renameSync(logFile, path.join(appLogDir, 'app.log.1'));
  }

  // Reset size tracking
  fileSizes.set(appId, 0);
}

/**
 * Queue entry for batched emission to renderer
 */
function queueForEmission(entry: ActivityLogEntry): void {
  emissionQueue.push(entry);

  if (!emissionTimer) {
    emissionTimer = setTimeout(flushEmissionQueue, EMISSION_BATCH_MS);
  }
}

/**
 * Flush emission queue to renderer
 */
function flushEmissionQueue(): void {
  emissionTimer = null;

  if (emissionQueue.length === 0) return;

  // Emit all queued events
  for (const entry of emissionQueue) {
    eventBus.emit('app.log', entry);
  }

  emissionQueue.length = 0;
}

/**
 * Prune old logs from database and files
 */
export function pruneOldLogs(): void {
  const cutoff = Date.now() - logRetentionDays * 24 * 60 * 60 * 1000;

  // Prune database
  ActivityLogRepository.prune(cutoff);

  // Prune old log files
  if (enableFileLogging) {
    pruneOldLogFiles(cutoff);
  }
}

/**
 * Prune old log files based on retention
 */
function pruneOldLogFiles(cutoff: number): void {
  const logDir = getLogDirectory();
  if (!fs.existsSync(logDir)) return;

  const appDirs = fs.readdirSync(logDir);

  for (const appDir of appDirs) {
    const appLogDir = path.join(logDir, appDir);
    if (!fs.statSync(appLogDir).isDirectory()) continue;

    const files = fs.readdirSync(appLogDir);

    for (const file of files) {
      const filePath = path.join(appLogDir, file);
      const stats = fs.statSync(filePath);

      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }

    // Clean up empty directories
    const remaining = fs.readdirSync(appLogDir);
    if (remaining.length === 0) {
      fs.rmdirSync(appLogDir);
    }
  }
}

/**
 * Redact secrets from text
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer ••••')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=••••')
    .replace(/token\s*=\s*[^\s]+/gi, 'token=••••')
    .replace(/secret\s*=\s*[^\s]+/gi, 'secret=••••')
    .replace(/api[_-]?key\s*=\s*[^\s]+/gi, 'api_key=••••')
    .replace(/authorization\s*:\s*[^\s]+/gi, 'authorization: ••••');
}

/**
 * Redact secrets from object (including env values flagged as secret)
 */
function redactSecretsInObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Check if this is a secret env value
    if (isSecretKey(lowerKey) && typeof value === 'string') {
      result[key] = '••••';
    } else if (typeof value === 'string') {
      result[key] = redactSecrets(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSecretsInObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a key name indicates a secret value
 */
function isSecretKey(key: string): boolean {
  return Array.from(SECRET_ENV_KEYS).some((secret: string) => key.includes(secret));
}

/**
 * Get the in-memory ring buffer for an app
 */
export function getLogBuffer(appId: string): ActivityLogEntry[] {
  const buffer = logBuffers.get(appId) || [];
  return buffer.map((line) => JSON.parse(line));
}

/**
 * Clear the in-memory ring buffer for an app
 */
export function clearLogBuffer(appId: string): void {
  logBuffers.delete(appId);
}

/**
 * Get log file path for an app (for external access)
 */
export function getLogFilePath(appId: string): string {
  return path.join(getAppLogDirectory(appId), 'app.log');
}

/**
 * Get all log files for an app (including rotated)
 */
export function getLogFiles(appId: string): string[] {
  const appLogDir = getAppLogDirectory(appId);
  if (!fs.existsSync(appLogDir)) return [];

  return fs
    .readdirSync(appLogDir)
    .filter((f) => f.startsWith('app.log'))
    .sort()
    .map((f) => path.join(appLogDir, f));
}

/**
 * Close all file handles (for graceful shutdown)
 */
export function closeLogFiles(): void {
  fileHandles.forEach((stream) => {
    stream.end();
  });
  fileHandles.clear();
  fileSizes.clear();
}

/**
 * Query logs from database with filters
 */
export function queryLogs(params: {
  appId?: string;
  eventType?: string[];
  severity?: string[];
  from?: number;
  to?: number;
  text?: string;
  limit: number;
  offset: number;
}): { entries: ActivityLogEntry[]; total: number } {
  return ActivityLogRepository.query(params);
}

/**
 * Get logging configuration
 */
export function getLoggingConfig(): {
  logRetentionDays: number;
  logMaxLinesPerApp: number;
  enableFileLogging: boolean;
  logMaxFileSizeMB: number;
  logMaxFilesPerApp: number;
} {
  return {
    logRetentionDays,
    logMaxLinesPerApp: maxLinesPerApp,
    enableFileLogging,
    logMaxFileSizeMB: maxFileSizeBytes / (1024 * 1024),
    logMaxFilesPerApp: maxFilesPerApp,
  };
}

// ============================================================================
// Audit Logging
// ============================================================================

// In-memory ring buffer for audit entries (bounded)
const auditBuffer: string[] = [];
const AUDIT_BUFFER_MAX = 10000;

/**
 * Log a privileged operation audit entry
 */
export function logAuditEvent(
  operationType: 'firewall_add' | 'firewall_remove' | 'firewall_reconcile' | 'process_terminate' | 'lan_enable' | 'lan_disable' | 'elevation_request',
  outcome: 'success' | 'failed' | 'elevation_denied' | 'policy_blocked' | 'execution_policy_restricted' | 'hash_mismatch' | 'rule_disabled_by_admin' | 'rule_exists_disabled' | 'internal_error',
  details: Record<string, unknown>,
  osErrorText?: string,
  requiresElevation: boolean = false,
  wasElevated: boolean = false,
  appId?: string,
  appName?: string
): void {
  const { AuditEntrySchema } = require('@shared/schemas');
  const { v4: uuidv4 } = require('uuid');

  const entry = {
    id: uuidv4(),
    timestamp: Date.now(),
    operationType,
    outcome,
    osErrorText,
    details,
    requiresElevation,
    wasElevated,
    appId,
    appName,
  };

  // Validate against schema (in development)
  if (process.env.NODE_ENV === 'development') {
    const result = AuditEntrySchema.safeParse(entry);
    if (!result.success) {
      console.error('[Audit] Invalid audit entry:', result.error);
    }
  }

  // Add to ring buffer
  auditBuffer.push(JSON.stringify(entry));
  if (auditBuffer.length > AUDIT_BUFFER_MAX) {
    auditBuffer.shift();
  }

  // Emit to renderer for real-time updates
  const { eventBus } = require('../../events');
  eventBus.emit('audit.entry', entry);
}

/**
 * Get the in-memory audit ring buffer
 */
export function getAuditBuffer(): string[] {
  return [...auditBuffer];
}

/**
 * Clear the audit buffer
 */
export function clearAuditBuffer(): void {
  auditBuffer.length = 0;
}
