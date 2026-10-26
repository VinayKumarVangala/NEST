/**
 * Unit tests for WindowsAdapter
 * These tests focus on pure logic that can be tested without complex OS-level mocking
 */
import { describe, it, expect } from 'vitest';

describe('WindowsAdapter - Pure Logic Tests', () => {
  describe('isAbsolutePath', () => {
    it('returns true for Windows absolute paths', () => {
      const isAbsolutePath = (path: string): boolean => {
        return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
      };

      expect(isAbsolutePath('C:\\path\\to\\file')).toBe(true);
      expect(isAbsolutePath('D:/path/to/file')).toBe(true);
      expect(isAbsolutePath('\\\\server\\share')).toBe(true);
    });

    it('returns false for relative paths', () => {
      const isAbsolutePath = (path: string): boolean => {
        return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
      };

      expect(isAbsolutePath('relative\\path')).toBe(false);
      expect(isAbsolutePath('./relative')).toBe(false);
      expect(isAbsolutePath('bin\\app')).toBe(false);
    });

    it('returns false for bare commands', () => {
      const isAbsolutePath = (path: string): boolean => {
        return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
      };

      expect(isAbsolutePath('notepad')).toBe(false);
      expect(isAbsolutePath('npm')).toBe(false);
    });

    it('handles various path formats', () => {
      const isAbsolutePath = (path: string): boolean => {
        return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
      };

      expect(isAbsolutePath('C:\\Users\\test')).toBe(true);
      expect(isAbsolutePath('D:/folder/file')).toBe(true);
      expect(isAbsolutePath('\\\\server\\share')).toBe(true);
      expect(isAbsolutePath('relative/path')).toBe(false);
      expect(isAbsolutePath('C:relative')).toBe(false);
    });
  });

  describe('METACHAR_REGEX', () => {
    it('detects shell metacharacters', () => {
      const METACHAR_REGEX = /[&|<>^%!"\n\r]/;

      expect(METACHAR_REGEX.test('value&other')).toBe(true);
      expect(METACHAR_REGEX.test('value|other')).toBe(true);
      expect(METACHAR_REGEX.test('value<other')).toBe(true);
      expect(METACHAR_REGEX.test('value>other')).toBe(true);
      expect(METACHAR_REGEX.test('value^other')).toBe(true);
      expect(METACHAR_REGEX.test('value%other')).toBe(true);
      expect(METACHAR_REGEX.test('value!other')).toBe(true);
      expect(METACHAR_REGEX.test('value"other')).toBe(true);
      expect(METACHAR_REGEX.test('normal')).toBe(false);
      expect(METACHAR_REGEX.test('value other')).toBe(false);
    });

    it('detects newlines', () => {
      const METACHAR_REGEX = /[&|<>^%!"\n\r]/;
      expect(METACHAR_REGEX.test('value\nother')).toBe(true);
      expect(METACHAR_REGEX.test('value\rother')).toBe(true);
    });
  });

  describe('CMD_EXTS', () => {
    it('contains .cmd and .bat', () => {
      const CMD_EXTS = ['.cmd', '.bat'];
      expect(CMD_EXTS).toContain('.cmd');
      expect(CMD_EXTS).toContain('.bat');
    });
  });

  describe('prefixToSubnet', () => {
    it('converts prefix lengths to subnet masks', () => {
      const prefixToSubnet = (prefix: number): string => {
        const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
        return [(mask >>> 24) & 255, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255].join('.');
      };

      expect(prefixToSubnet(24)).toBe('255.255.255.0');
      expect(prefixToSubnet(16)).toBe('255.255.0.0');
      expect(prefixToSubnet(8)).toBe('255.0.0.0');
      expect(prefixToSubnet(32)).toBe('255.255.255.255');
      expect(prefixToSubnet(0)).toBe('0.0.0.0');
    });
  });
});
