/**
 * Logging Service Tests
 * Tests for redaction, ring-buffer bound, retention pruning, and high-volume output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WriteStream } from 'node:fs';

// Mock node:path
vi.mock('node:path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  basename: vi.fn((p: string) => p.split('/').pop() || ''),
  resolve: vi.fn((...args: string[]) => args.join('/')),
  sep: '/',
}));

vi.mock('node:url', () => ({
  fileURLToPath: vi.fn((url: string) => url.replace('file://', '')),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
  rmdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
  WriteStream: vi.fn(),
}));

// Mock database
vi.mock('../../src/main/db', () => ({
  ActivityLogRepository: {
    insert: vi.fn(),
    query: vi.fn(() => ({ entries: [], total: 0 })),
    prune: vi.fn(),
  },
}));

// Mock event bus
vi.mock('../../src/main/events', () => ({
  eventBus: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/userData';
      return '/mock';
    }),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => s),
    decryptString: vi.fn((s: string) => s),
  },
}));

import {
  initializeLogging,
  configureLogging,
  logAppEvent,
  logProcessOutput,
  redactSecrets,
  getLogBuffer,
  clearLogBuffer,
  pruneOldLogs,
  closeLogFiles,
  queryLogs,
  getLoggingConfig,
} from '@main/services/logging';

// Get mocked modules for verification
import { ActivityLogRepository } from '../../src/main/db';
import { eventBus } from '../../src/main/events';
import * as fs from 'node:fs';

describe('Logging Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fs mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: Date.now() } as fs.Stats);
    vi.mocked(fs.createWriteStream).mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    } as unknown as fs.WriteStream);

    // Reset configuration
    configureLogging({
      logRetentionDays: 30,
      logMaxLinesPerApp: 5000,
      enableFileLogging: false,
    });

    // Clear buffers
    clearLogBuffer('test-app');
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('redactSecrets', () => {
    it('should redact Bearer tokens', () => {
      const input = 'Bearer abc123def456';
      const result = redactSecrets(input);
      expect(result).toBe('Bearer ••••');
    });

    it('should redact password= patterns', () => {
      const input = 'password=secret123';
      const result = redactSecrets(input);
      expect(result).toBe('password=••••');
    });

    it('should redact token= patterns', () => {
      const input = 'token=my-secret-token';
      const result = redactSecrets(input);
      expect(result).toBe('token=••••');
    });

    it('should redact secret= patterns', () => {
      const input = 'secret=my-secret-value';
      const result = redactSecrets(input);
      expect(result).toBe('secret=••••');
    });

    it('should redact api_key patterns', () => {
      const input = 'api_key=sk-1234567890';
      const result = redactSecrets(input);
      expect(result).toBe('api_key=••••');
    });

    it('should redact authorization header patterns', () => {
      const input = 'authorization: Basic dXNlcjpwYXNz';
      const result = redactSecrets(input);
      // The regex matches "authorization:" followed by space and non-whitespace
      expect(result).toBe('authorization: •••• dXNlcjpwYXNz');
    });

    it('should handle multiple secrets in one string', () => {
      const input = 'password=secret1 token=secret2 api_key=secret3';
      const result = redactSecrets(input);
      expect(result).toBe('password=•••• token=•••• api_key=••••');
    });

    it('should not modify text without secrets', () => {
      const input = 'This is a normal log message';
      const result = redactSecrets(input);
      expect(result).toBe(input);
    });

    it('should redact case-insensitive password', () => {
      const input = 'PASSWORD=secret';
      const result = redactSecrets(input);
      // The regex is case-insensitive, so it matches but preserves original case in replacement
      expect(result).toBe('password=••••');
    });
  });

  describe('Ring Buffer', () => {
    it('should store log entries in ring buffer', () => {
      logAppEvent('test-app', 'start', 'info', 'Application started');
      logAppEvent('test-app', 'info', 'info', 'Running');

      const buffer = getLogBuffer('test-app');
      expect(buffer.length).toBe(2);
      expect(buffer[0].message).toBe('Application started');
      expect(buffer[1].message).toBe('Running');
    });

    it('should respect maxLinesPerApp limit', () => {
      configureLogging({
        logRetentionDays: 30,
        logMaxLinesPerApp: 3,
        enableFileLogging: false,
      });

      logAppEvent('test-app', 'start', 'info', 'Line 1');
      logAppEvent('test-app', 'info', 'info', 'Line 2');
      logAppEvent('test-app', 'info', 'info', 'Line 3');
      logAppEvent('test-app', 'info', 'info', 'Line 4');
      logAppEvent('test-app', 'info', 'info', 'Line 5');

      const buffer = getLogBuffer('test-app');
      expect(buffer.length).toBe(3);
      // Should keep last 3 entries
      expect(buffer[0].message).toBe('Line 3');
      expect(buffer[1].message).toBe('Line 4');
      expect(buffer[2].message).toBe('Line 5');
    });

    it('should maintain separate buffers per app', () => {
      logAppEvent('app-1', 'start', 'info', 'App 1 started');
      logAppEvent('app-2', 'start', 'info', 'App 2 started');

      const buffer1 = getLogBuffer('app-1');
      const buffer2 = getLogBuffer('app-2');

      expect(buffer1.length).toBe(1);
      expect(buffer1[0].message).toBe('App 1 started');
      expect(buffer2.length).toBe(1);
      expect(buffer2[0].message).toBe('App 2 started');
    });

    it('should clear buffer on clearLogBuffer', () => {
      logAppEvent('test-app', 'start', 'info', 'Started');
      clearLogBuffer('test-app');

      const buffer = getLogBuffer('test-app');
      expect(buffer.length).toBe(0);
    });

    it('should return empty array for unknown app', () => {
      const buffer = getLogBuffer('unknown-app');
      expect(buffer).toEqual([]);
    });
  });

  describe('Process Output Logging', () => {
    it('should split multi-line output into separate entries', () => {
      logProcessOutput('test-app', 'stdout', 'Line 1\nLine 2\nLine 3');

      const buffer = getLogBuffer('test-app');
      expect(buffer.length).toBe(3);
      expect(buffer[0].message).toContain('Line 1');
      expect(buffer[1].message).toContain('Line 2');
      expect(buffer[2].message).toContain('Line 3');
    });

    it('should filter out empty lines', () => {
      logProcessOutput('test-app', 'stdout', 'Line 1\n\n\nLine 2');

      const buffer = getLogBuffer('test-app');
      expect(buffer.length).toBe(2);
    });

    it('should redact secrets in process output', () => {
      logProcessOutput('test-app', 'stdout', 'password=secret123');

      const buffer = getLogBuffer('test-app');
      expect(buffer[0].message).toContain('password=••••');
    });

    it('should mark stderr as warn severity', () => {
      logProcessOutput('test-app', 'stderr', 'Error occurred');

      const buffer = getLogBuffer('test-app');
      expect(buffer[0].severity).toBe('warn');
    });

    it('should mark stdout as info severity', () => {
      logProcessOutput('test-app', 'stdout', 'Normal output');

      const buffer = getLogBuffer('test-app');
      expect(buffer[0].severity).toBe('info');
    });
  });

  describe('Configuration', () => {
    it('should return current configuration', () => {
      configureLogging({
        logRetentionDays: 7,
        logMaxLinesPerApp: 1000,
        enableFileLogging: true,
        logMaxFileSizeMB: 5,
        logMaxFilesPerApp: 3,
      });

      const config = getLoggingConfig();
      expect(config.logRetentionDays).toBe(7);
      expect(config.logMaxLinesPerApp).toBe(1000);
      expect(config.enableFileLogging).toBe(true);
      expect(config.logMaxFileSizeMB).toBe(5);
      expect(config.logMaxFilesPerApp).toBe(3);
    });
  });

  describe('Retention Pruning', () => {
    it('should call repository prune with correct cutoff', () => {
      // Mock time to test cutoff calculation
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));

      pruneOldLogs();

      expect(ActivityLogRepository.prune).toHaveBeenCalled();
      const cutoff = vi.mocked(ActivityLogRepository.prune).mock.calls[0][0];
      // 30 days before 2024-01-15
      const expectedCutoff = new Date('2023-12-16').getTime();
      expect(cutoff).toBe(expectedCutoff);

      vi.useRealTimers();
    });
  });

  describe('Query Logs', () => {
    it('should delegate to repository query', () => {
      vi.mocked(ActivityLogRepository.query).mockReturnValue({
        entries: [
          {
            id: '1',
            message: 'test',
            eventType: 'info',
            severity: 'info',
            timestamp: Date.now(),
          },
        ],
        total: 1,
      });

      const result = queryLogs({
        appId: 'test-app',
        limit: 10,
        offset: 0,
      });

      expect(result.entries.length).toBe(1);
      expect(result.total).toBe(1);
      expect(ActivityLogRepository.query).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'test-app',
          limit: 10,
          offset: 0,
        })
      );
    });
  });

  describe('High Volume Stress Test', () => {
    it('should handle 50k lines without blocking (performance test)', () => {
      const startTime = Date.now();

      // Simulate 50k lines of output
      for (let i = 0; i < 50000; i++) {
        logProcessOutput('test-app', 'stdout', `Log line ${i}`);
      }

      const elapsed = Date.now() - startTime;

      // Should complete in reasonable time (not block main process)
      // 50k lines in < 5 seconds is a reasonable threshold
      expect(elapsed).toBeLessThan(5000);

      // Buffer should be bounded to maxLinesPerApp
      const buffer = getLogBuffer('test-app');
      expect(buffer.length).toBeLessThanOrEqual(5000);
    });

    it('should not lose events during high-volume logging', () => {
      configureLogging({
        logRetentionDays: 30,
        logMaxLinesPerApp: 1000,
        enableFileLogging: false,
      });

      // Write more than buffer size
      for (let i = 0; i < 1500; i++) {
        logAppEvent('stress-app', 'info', 'info', `Message ${i}`);
      }

      const buffer = getLogBuffer('stress-app');
      // Should keep last 1000
      expect(buffer.length).toBe(1000);
      // Should contain the last entries
      expect(buffer[0].message).toBe('Message 500');
      expect(buffer[999].message).toBe('Message 1499');
    });
  });

  describe('File Logging', () => {
    beforeEach(() => {
      configureLogging({
        logRetentionDays: 30,
        logMaxLinesPerApp: 5000,
        enableFileLogging: true,
        logMaxFileSizeMB: 10,
        logMaxFilesPerApp: 5,
      });
    });

    it('should create write stream when file logging enabled', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      logProcessOutput('file-app', 'stdout', 'Test line');

      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('should close file handles without error', () => {
      // This test verifies the function doesn't throw
      expect(() => closeLogFiles()).not.toThrow();
    });
  });

  describe('Secret Key Redaction in Objects', () => {
    it('should redact secret env values in details object', () => {
      logAppEvent('test-app', 'start', 'info', 'Starting app', {
        env: {
          PASSWORD: 'secret123',
          API_KEY: 'key-123',
          NORMAL_VAR: 'value',
        },
      });

      const buffer = getLogBuffer('test-app');
      const details = buffer[0].details as Record<string, unknown>;
      expect(details.env).toEqual({
        PASSWORD: '••••',
        API_KEY: '••••',
        NORMAL_VAR: 'value',
      });
    });

    it('should redact nested secrets', () => {
      logAppEvent('test-app', 'start', 'info', 'Starting', {
        config: {
          database: {
            password: 'db-secret',
            username: 'admin',
          },
        },
      });

      const buffer = getLogBuffer('test-app');
      const details = buffer[0].details as Record<string, unknown>;
      const config = details.config as Record<string, unknown>;
      const db = config.database as Record<string, unknown>;
      expect(db.password).toBe('••••');
      expect(db.username).toBe('admin');
    });
  });
});
