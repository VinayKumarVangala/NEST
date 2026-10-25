/**
 * Integration tests for database (better-sqlite3)
 * These test the main process database functionality
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Mock Electron app for testing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/tmp/nest-test-data';
      return `/mock/${name}`;
    }),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
  safeStorage: {
    encryptString: vi.fn((s: string) => Buffer.from(s).toString('base64')),
    decryptString: vi.fn((s: string) => Buffer.from(s, 'base64').toString()),
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
  },
}));

// Import after mocking
import { initializeDatabase, getDatabase, closeDatabase, ApplicationRepository, RuntimeStateRepository, AccessPolicyRepository, ActivityLogRepository, SettingsRepository } from '../../src/main/db';

const TEST_DB_DIR = '/tmp/nest-test-data';
const TEST_DB_PATH = '/tmp/nest-test-data/nest.db';

describe('better-sqlite3 Integration', () => {
  let db: Database.Database;

  beforeAll(() => {
    // Clean up any existing test data
    if (existsSync(TEST_DB_DIR)) {
      rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterAll(() => {
    closeDatabase();
    if (existsSync(TEST_DB_DIR)) {
      rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Re-initialize database for each test
    closeDatabase();
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH, { force: true });
    }
    await initializeDatabase();
    db = getDatabase();
  });

  describe('Database initialization', () => {
    it('should open an in-memory database', () => {
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
    });

    it('should have WAL mode enabled', () => {
      const mode = db.pragma('journal_mode');
      expect(mode).toBe('wal');
    });

    it('should have foreign keys enabled', () => {
      const fk = db.pragma('foreign_keys');
      expect(fk).toBe(1);
    });

    it('should have all required tables', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as { name: string }[];
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('applications');
      expect(tableNames).toContain('runtime_state');
      expect(tableNames).toContain('access_policies');
      expect(tableNames).toContain('activity_logs');
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('schema_migrations');
    });

    it('should have migration version 1 applied', () => {
      const migrations = db.prepare('SELECT * FROM schema_migrations').all() as { version: number }[];
      expect(migrations.length).toBe(1);
      expect(migrations[0].version).toBe(1);
    });
  });

  describe('ApplicationRepository', () => {
    const createTestApp = (overrides: Partial<any> = {}) => ({
      id: 'test-app-' + Date.now(),
      name: 'Test App',
      projectPath: '/tmp/test',
      executable: 'node',
      args: ['server.js'],
      workingDirectory: '/tmp/test',
      env: [
        { key: 'NODE_ENV', value: 'development', secret: false },
        { key: 'API_KEY', value: 'secret123', secret: true },
      ],
      protocol: 'http' as const,
      port: 3000,
      expectedListenAddress: 'loopback' as const,
      lifecycleMode: 'managed' as const,
      startupTimeoutMs: 30000,
      healthCheck: { type: 'none' as const, intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    });

    it('should create and retrieve an application', () => {
      const app = createTestApp();
      ApplicationRepository.create(app);
      const retrieved = ApplicationRepository.get(app.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe(app.name);
      expect(retrieved!.port).toBe(app.port);
    });

    it('should encrypt secret env values in storage', () => {
      const app = createTestApp();
      ApplicationRepository.create(app);
      
      // Check raw database - secret should be encrypted
      const row = db.prepare('SELECT env FROM applications WHERE id = ?').get(app.id) as { env: string };
      const env = JSON.parse(row.env);
      const secretEnv = env.find((e: any) => e.key === 'API_KEY');
      expect(secretEnv.value).not.toBe('secret123');
      expect(secretEnv.value).toMatch(/^[A-Za-z0-9+/=]+$/); // base64
      expect(secretEnv.secret).toBe(true);
    });

    it('should redact secrets when retrieving for renderer', () => {
      const app = createTestApp();
      ApplicationRepository.create(app);
      
      const retrieved = ApplicationRepository.get(app.id);
      const secretEnv = retrieved!.env.find(e => e.key === 'API_KEY');
      expect(secretEnv!.value).toBe('••••');
    });

    it('should decrypt secrets for ApplicationManager launch path', () => {
      const app = createTestApp();
      ApplicationRepository.create(app);
      
      const retrieved = ApplicationRepository.getForLaunch(app.id);
      const secretEnv = retrieved!.env.find(e => e.key === 'API_KEY');
      expect(secretEnv!.value).toBe('secret123');
    });

    it('should update application', () => {
      const app = createTestApp();
      ApplicationRepository.create(app);
      
      ApplicationRepository.update(app.id, { name: 'Updated Name', port: 4000 });
      const retrieved = ApplicationRepository.get(app.id);
      expect(retrieved!.name).toBe('Updated Name');
      expect(retrieved!.port).toBe(4000);
    });

    it('should delete application and cascade delete runtime_state and access_policies', () => {
      const app = createTestApp();
      ApplicationRepository.create(app);
      
      // Verify related records exist
      expect(RuntimeStateRepository.get(app.id)).not.toBeNull();
      expect(AccessPolicyRepository.get(app.id)).not.toBeNull();
      
      ApplicationRepository.delete(app.id);
      
      // Verify cascaded deletes
      expect(ApplicationRepository.get(app.id)).toBeNull();
      expect(RuntimeStateRepository.get(app.id)).toBeNull();
      expect(AccessPolicyRepository.get(app.id)).toBeNull();
    });

    it('should list applications', () => {
      const app1 = createTestApp({ id: 'app-1', name: 'App 1' });
      const app2 = createTestApp({ id: 'app-2', name: 'App 2' });
      ApplicationRepository.create(app1);
      ApplicationRepository.create(app2);
      
      const apps = ApplicationRepository.list();
      expect(apps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('RuntimeStateRepository', () => {
    it('should upsert runtime state', () => {
      const state = {
        appId: 'test-app-1',
        processState: 'running' as const,
        healthState: 'healthy' as const,
        pid: 12345,
        processStartTime: Date.now(),
        portState: 'listening_loopback' as const,
        listenerAddress: '127.0.0.1',
        lastHealthCheck: { timestamp: Date.now(), processAlive: true, portListening: true, localResponding: true },
        lastError: undefined,
        startedAt: Date.now(),
        stoppedAt: undefined,
        updatedAt: Date.now(),
      };
      
      RuntimeStateRepository.upsert(state);
      const retrieved = RuntimeStateRepository.get('test-app-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.processState).toBe('running');
      expect(retrieved!.pid).toBe(12345);
    });

    it('should update existing state', () => {
      RuntimeStateRepository.upsert({
        appId: 'test-app-2',
        processState: 'starting',
        healthState: 'checking',
        portState: 'free',
        updatedAt: Date.now(),
      });
      
      RuntimeStateRepository.upsert({
        appId: 'test-app-2',
        processState: 'running',
        healthState: 'healthy',
        portState: 'listening_loopback',
        updatedAt: Date.now(),
      });
      
      const retrieved = RuntimeStateRepository.get('test-app-2');
      expect(retrieved!.processState).toBe('running');
      expect(retrieved!.healthState).toBe('healthy');
    });
  });

  describe('AccessPolicyRepository', () => {
    it('should create default local_only policy on app creation', () => {
      const app = {
        id: 'policy-test-app',
        name: 'Policy Test',
        projectPath: '/tmp/test',
        executable: 'node',
        args: [],
        workingDirectory: '/tmp/test',
        env: [],
        protocol: 'http' as const,
        port: 3000,
        expectedListenAddress: 'loopback' as const,
        lifecycleMode: 'managed' as const,
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none' as const, intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      ApplicationRepository.create(app);
      const policy = AccessPolicyRepository.get(app.id);
      expect(policy).not.toBeNull();
      expect(policy!.mode).toBe('local_only');
    });

    it('should upsert access policy', () => {
      AccessPolicyRepository.upsert({
        appId: 'policy-test-2',
        mode: 'lan_enabled',
        selectedInterface: 'eth0',
        firewallRuleRef: 'NEST-123',
        lastVerification: 'local_ok',
        lastVerificationAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      let policy = AccessPolicyRepository.get('policy-test-2');
      expect(policy!.mode).toBe('lan_enabled');
      
      AccessPolicyRepository.upsert({
        appId: 'policy-test-2',
        mode: 'lan_disabled',
        updatedAt: Date.now(),
      });
      
      policy = AccessPolicyRepository.get('policy-test-2');
      expect(policy!.mode).toBe('lan_disabled');
    });
  });

  describe('ActivityLogRepository', () => {
    it('should insert and query logs', () => {
      ActivityLogRepository.insert({
        id: 'log-1',
        appId: 'app-1',
        eventType: 'start',
        severity: 'info',
        message: 'Application started',
        details: { pid: 123 },
        timestamp: Date.now(),
      });
      
      const result = ActivityLogRepository.query({ limit: 10, offset: 0 });
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].message).toBe('Application started');
      expect(result.total).toBeGreaterThan(0);
    });

    it('should filter logs by appId', () => {
      ActivityLogRepository.insert({
        id: 'log-2',
        appId: 'app-2',
        eventType: 'start',
        severity: 'info',
        message: 'App 2 started',
        timestamp: Date.now(),
      });
      
      const result = ActivityLogRepository.query({ appId: 'app-1', limit: 10, offset: 0 });
      expect(result.entries.every(e => e.appId === 'app-1')).toBe(true);
    });

    it('should filter logs by severity', () => {
      ActivityLogRepository.insert({
        id: 'log-3',
        appId: 'app-1',
        eventType: 'error',
        severity: 'error',
        message: 'Something failed',
        timestamp: Date.now(),
      });
      
      const result = ActivityLogRepository.query({ severity: ['error'], limit: 10, offset: 0 });
      expect(result.entries.every(e => e.severity === 'error')).toBe(true);
    });
  });

  describe('SettingsRepository', () => {
    it('should get and set settings', () => {
      SettingsRepository.set('testKey', { foo: 'bar' });
      const settings = SettingsRepository.get();
      expect(settings.testKey).toEqual({ foo: 'bar' });
    });

    it('should load default settings', () => {
      const settings = SettingsRepository.get();
      expect(settings.backgroundMode).toBe(true);
      expect(settings.shutdownPolicy).toBe('ask');
      expect(settings.defaultAccessPolicy).toBe('local_only');
    });
  });

  describe('Secret handling security', () => {
    it('should not store plaintext secrets in database file', () => {
      const app = {
        id: 'secret-test-' + Date.now(),
        name: 'Secret Test',
        projectPath: '/tmp/test',
        executable: 'node',
        args: [],
        workingDirectory: '/tmp/test',
        env: [
          { key: 'PASSWORD', value: 'supersecret', secret: true },
          { key: 'TOKEN', value: 'mytoken123', secret: true },
        ],
        protocol: 'http' as const,
        port: 3000,
        expectedListenAddress: 'loopback' as const,
        lifecycleMode: 'managed' as const,
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none' as const, intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      ApplicationRepository.create(app);
      
      // Read raw database file
      const dbContent = require('node:fs').readFileSync('/tmp/nest-test-data/nest.db', 'utf8');
      
      // Secrets should not appear in plaintext
      expect(dbContent).not.toContain('supersecret');
      expect(dbContent).not.toContain('mytoken123');
    });
  });
});