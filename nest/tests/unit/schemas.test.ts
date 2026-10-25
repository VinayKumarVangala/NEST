/**
 * Unit tests for Zod schemas
 */
import { describe, it, expect } from 'vitest';
import {
  ApplicationConfigSchema,
  EnvVarSchema,
  HealthCheckConfigSchema,
  portSchema,
  uuidSchema,
  lintLaunchConfig,
  AppErrorSchema,
  ProcessStateSchema,
  HealthStateSchema,
  PortStateSchema,
  AccessModeSchema,
  LanVerificationSchema,
} from '@shared/schemas';
import type { ApplicationConfig } from '@shared/types';

describe('Zod Schemas', () => {
  describe('ApplicationConfigSchema', () => {
    it('validates a valid application config', () => {
      const validConfig: ApplicationConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test App',
        projectPath: '/path/to/project',
        executable: 'node',
        args: ['server.js'],
        workingDirectory: '/path/to/project',
        env: [{ key: 'NODE_ENV', value: 'development', secret: false }],
        protocol: 'http',
        port: 3000,
        expectedListenAddress: 'loopback',
        lifecycleMode: 'managed',
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = ApplicationConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('rejects invalid port', () => {
      const config = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test App',
        projectPath: '/path/to/project',
        executable: 'node',
        args: ['server.js'],
        workingDirectory: '/path/to/project',
        env: [],
        protocol: 'http',
        port: 70000, // Invalid
        expectedListenAddress: 'loopback',
        lifecycleMode: 'managed',
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = ApplicationConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects invalid protocol', () => {
      const config = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test App',
        projectPath: '/path/to/project',
        executable: 'node',
        args: ['server.js'],
        workingDirectory: '/path/to/project',
        env: [],
        protocol: 'ftp', // Invalid
        port: 3000,
        expectedListenAddress: 'loopback',
        lifecycleMode: 'managed',
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = ApplicationConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects invalid env key', () => {
      const config = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test App',
        projectPath: '/path/to/project',
        executable: 'node',
        args: ['server.js'],
        workingDirectory: '/path/to/project',
        env: [{ key: '123INVALID', value: 'test', secret: false }], // Invalid key
        protocol: 'http',
        port: 3000,
        expectedListenAddress: 'loopback',
        lifecycleMode: 'managed',
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = ApplicationConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('EnvVarSchema', () => {
    it('validates valid env var', () => {
      const result = EnvVarSchema.safeParse({ key: 'VALID_KEY', value: 'value', secret: false });
      expect(result.success).toBe(true);
    });

    it('rejects invalid env key', () => {
      const result = EnvVarSchema.safeParse({ key: '123INVALID', value: 'value', secret: false });
      expect(result.success).toBe(false);
    });
  });

  describe('HealthCheckConfigSchema', () => {
    it('uses defaults for optional fields', () => {
      const result = HealthCheckConfigSchema.safeParse({ type: 'http' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.intervalMs).toBe(30000);
        expect(result.data.timeoutMs).toBe(5000);
        expect(result.data.failureThreshold).toBe(3);
      }
    });
  });

  describe('portSchema', () => {
    it('validates valid ports', () => {
      expect(portSchema.safeParse(80).success).toBe(true);
      expect(portSchema.safeParse(3000).success).toBe(true);
      expect(portSchema.safeParse(65535).success).toBe(true);
    });

    it('rejects invalid ports', () => {
      expect(portSchema.safeParse(0).success).toBe(false);
      expect(portSchema.safeParse(65536).success).toBe(false);
      expect(portSchema.safeParse(-1).success).toBe(false);
    });
  });

  describe('uuidSchema', () => {
    it('validates valid UUID', () => {
      expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      expect(uuidSchema.safeParse('invalid-uuid').success).toBe(false);
    });
  });

  describe('lintLaunchConfig', () => {
    it('warns about privileged ports', () => {
      const config: ApplicationConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test App',
        projectPath: '/path/to/project',
        executable: 'node',
        args: ['server.js'],
        workingDirectory: '/path/to/project',
        env: [],
        protocol: 'http',
        port: 80, // Privileged
        expectedListenAddress: 'loopback',
        lifecycleMode: 'managed',
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const warnings = lintLaunchConfig(config);
      expect(warnings.some((w) => w.type === 'privileged_port')).toBe(true);
    });

    it('warns about shell metacharacters in args', () => {
      const config: ApplicationConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test App',
        projectPath: '/path/to/project',
        executable: 'node',
        args: ['server.js', '&', 'echo hack'], // Metacharacters
        workingDirectory: '/path/to/project',
        env: [],
        protocol: 'http',
        port: 3000,
        expectedListenAddress: 'loopback',
        lifecycleMode: 'managed',
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const warnings = lintLaunchConfig(config);
      expect(warnings.some((w) => w.type === 'metacharacter')).toBe(true);
    });

    it('warns about .cmd with args', () => {
      const config: ApplicationConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test App',
        projectPath: '/path/to/project',
        executable: 'npm.cmd',
        args: ['run', 'dev'],
        workingDirectory: '/path/to/project',
        env: [],
        protocol: 'http',
        port: 3000,
        expectedListenAddress: 'loopback',
        lifecycleMode: 'managed',
        startupTimeoutMs: 30000,
        healthCheck: { type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const warnings = lintLaunchConfig(config);
      expect(warnings.some((w) => w.type === 'cmd_with_args')).toBe(true);
    });
  });

  describe('AppErrorSchema', () => {
    it('validates valid error', () => {
      const result = AppErrorSchema.safeParse({
        code: 'VALIDATION',
        message: 'Invalid input',
        details: { field: 'port' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid error code', () => {
      const result = AppErrorSchema.safeParse({
        code: 'INVALID_CODE',
        message: 'Invalid input',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('State enums', () => {
    it('validates ProcessState', () => {
      expect(ProcessStateSchema.safeParse('running').success).toBe(true);
      expect(ProcessStateSchema.safeParse('invalid').success).toBe(false);
    });

    it('validates HealthState', () => {
      expect(HealthStateSchema.safeParse('healthy').success).toBe(true);
      expect(HealthStateSchema.safeParse('invalid').success).toBe(false);
    });

    it('validates PortState', () => {
      expect(PortStateSchema.safeParse('free').success).toBe(true);
      expect(PortStateSchema.safeParse('invalid').success).toBe(false);
    });

    it('validates AccessMode', () => {
      expect(AccessModeSchema.safeParse('local_only').success).toBe(true);
      expect(AccessModeSchema.safeParse('invalid').success).toBe(false);
    });

    it('validates LanVerification', () => {
      expect(LanVerificationSchema.safeParse('unverified').success).toBe(true);
      expect(LanVerificationSchema.safeParse('verified').success).toBe(false); // Not allowed!
    });
  });
});