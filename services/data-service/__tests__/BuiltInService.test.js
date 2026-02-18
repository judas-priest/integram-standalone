/**
 * BuiltInService Tests
 *
 * Tests for built-in variable substitution.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BuiltInService } from '../src/services/BuiltInService.js';

describe('BuiltInService', () => {
  let builtInService;

  beforeEach(() => {
    // Mock date to have consistent tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:30:00Z'));

    builtInService = new BuiltInService({
      context: {
        user: 'testuser',
        userId: 123,
        role: 'admin',
        roleId: 42,
        remoteAddr: '192.168.1.1',
        remoteHost: 'localhost',
        userAgent: 'TestBrowser/1.0',
        referer: 'https://example.com',
        host: 'api.example.com',
        requestUri: '/api/test',
      },
      timezone: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('date placeholders', () => {
    it('should resolve [TODAY]', () => {
      const result = builtInService.resolve('[TODAY]');
      expect(result).toBe('15.01.2024');
    });

    it('should resolve [NOW]', () => {
      const result = builtInService.resolve('[NOW]');
      expect(result).toBe('15.01.2024 12:30:00');
    });

    it('should resolve [YESTERDAY]', () => {
      const result = builtInService.resolve('[YESTERDAY]');
      expect(result).toBe('14.01.2024');
    });

    it('should resolve [TOMORROW]', () => {
      const result = builtInService.resolve('[TOMORROW]');
      expect(result).toBe('16.01.2024');
    });

    it('should resolve [MONTH_AGO]', () => {
      const result = builtInService.resolve('[MONTH_AGO]');
      // 30 days before Jan 15 is Dec 16
      expect(result).toBe('16.12.2023');
    });

    it('should resolve [WEEK_AGO]', () => {
      const result = builtInService.resolve('[WEEK_AGO]');
      // 7 days before Jan 15 is Jan 8
      expect(result).toBe('08.01.2024');
    });

    it('should resolve [MONTH_PLUS]', () => {
      const result = builtInService.resolve('[MONTH_PLUS]');
      // 30 days after Jan 15 is Feb 14
      expect(result).toBe('14.02.2024');
    });
  });

  describe('user placeholders', () => {
    it('should resolve [USER]', () => {
      expect(builtInService.resolve('[USER]')).toBe('testuser');
    });

    it('should resolve [USER_ID]', () => {
      expect(builtInService.resolve('[USER_ID]')).toBe('123');
    });

    it('should resolve [ROLE]', () => {
      expect(builtInService.resolve('[ROLE]')).toBe('admin');
    });

    it('should resolve [ROLE_ID]', () => {
      expect(builtInService.resolve('[ROLE_ID]')).toBe('42');
    });

    it('should return empty string when user not set', () => {
      const emptyService = new BuiltInService();
      expect(emptyService.resolve('[USER]')).toBe('');
      expect(emptyService.resolve('[USER_ID]')).toBe('0');
    });
  });

  describe('system placeholders', () => {
    it('should resolve [TSHIFT]', () => {
      expect(builtInService.resolve('[TSHIFT]')).toBe('0');
    });

    it('should resolve [REMOTE_ADDR]', () => {
      expect(builtInService.resolve('[REMOTE_ADDR]')).toBe('192.168.1.1');
    });

    it('should resolve [REMOTE_HOST]', () => {
      expect(builtInService.resolve('[REMOTE_HOST]')).toBe('localhost');
    });

    it('should resolve [HTTP_USER_AGENT]', () => {
      expect(builtInService.resolve('[HTTP_USER_AGENT]')).toBe('TestBrowser/1.0');
    });

    it('should resolve [HTTP_REFERER]', () => {
      expect(builtInService.resolve('[HTTP_REFERER]')).toBe('https://example.com');
    });

    it('should resolve [HTTP_HOST]', () => {
      expect(builtInService.resolve('[HTTP_HOST]')).toBe('api.example.com');
    });

    it('should resolve [REQUEST_URI]', () => {
      expect(builtInService.resolve('[REQUEST_URI]')).toBe('/api/test');
    });
  });

  describe('unknown placeholders', () => {
    it('should return original placeholder for unknown', () => {
      expect(builtInService.resolve('[UNKNOWN]')).toBe('[UNKNOWN]');
    });

    it('should return non-placeholder values unchanged', () => {
      expect(builtInService.resolve('regular text')).toBe('regular text');
    });
  });

  describe('replaceAll', () => {
    it('should replace all placeholders in text', () => {
      const text = 'User [USER] logged in at [NOW] from [REMOTE_ADDR]';
      const result = builtInService.replaceAll(text);

      expect(result).toContain('testuser');
      expect(result).toContain('15.01.2024 12:30:00');
      expect(result).toContain('192.168.1.1');
      expect(result).not.toContain('[USER]');
      expect(result).not.toContain('[NOW]');
      expect(result).not.toContain('[REMOTE_ADDR]');
    });

    it('should handle text with no placeholders', () => {
      const text = 'No placeholders here';
      expect(builtInService.replaceAll(text)).toBe(text);
    });

    it('should handle empty text', () => {
      expect(builtInService.replaceAll('')).toBe('');
    });

    it('should handle null text', () => {
      expect(builtInService.replaceAll(null)).toBeNull();
    });

    it('should preserve unknown placeholders', () => {
      const text = 'Date: [TODAY], Custom: [CUSTOM_FIELD]';
      const result = builtInService.replaceAll(text);

      expect(result).toContain('15.01.2024');
      expect(result).toContain('[CUSTOM_FIELD]');
    });
  });

  describe('hasPlaceholders', () => {
    it('should return true when text has placeholders', () => {
      expect(builtInService.hasPlaceholders('[TODAY]')).toBe(true);
      expect(builtInService.hasPlaceholders('Date: [TODAY]')).toBe(true);
    });

    it('should return false when text has no placeholders', () => {
      expect(builtInService.hasPlaceholders('regular text')).toBe(false);
      expect(builtInService.hasPlaceholders('')).toBe(false);
    });

    it('should return false for lowercase placeholders', () => {
      expect(builtInService.hasPlaceholders('[today]')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(builtInService.hasPlaceholders(null)).toBe(false);
      expect(builtInService.hasPlaceholders(undefined)).toBe(false);
    });
  });

  describe('extractPlaceholders', () => {
    it('should extract all placeholders from text', () => {
      const text = 'User [USER] (ID: [USER_ID]) logged in at [NOW]';
      const placeholders = builtInService.extractPlaceholders(text);

      expect(placeholders).toContain('USER');
      expect(placeholders).toContain('USER_ID');
      expect(placeholders).toContain('NOW');
      expect(placeholders).toHaveLength(3);
    });

    it('should return empty array for text without placeholders', () => {
      expect(builtInService.extractPlaceholders('no placeholders')).toEqual([]);
    });

    it('should handle null text', () => {
      expect(builtInService.extractPlaceholders(null)).toEqual([]);
    });
  });

  describe('getAvailablePlaceholders', () => {
    it('should return all available placeholder names', () => {
      const placeholders = builtInService.getAvailablePlaceholders();

      expect(placeholders).toContain('TODAY');
      expect(placeholders).toContain('NOW');
      expect(placeholders).toContain('USER');
      expect(placeholders).toContain('ROLE');
      expect(placeholders).toContain('REMOTE_ADDR');
      expect(placeholders.length).toBeGreaterThan(10);
    });
  });

  describe('setContext', () => {
    it('should update context', () => {
      builtInService.setContext({
        user: 'newuser',
        userId: 456,
      });

      expect(builtInService.resolve('[USER]')).toBe('newuser');
      expect(builtInService.resolve('[USER_ID]')).toBe('456');
    });
  });

  describe('setTimezone', () => {
    it('should update timezone', () => {
      builtInService.setTimezone(3600);
      expect(builtInService.resolve('[TSHIFT]')).toBe('3600');
    });
  });

  describe('timezone handling', () => {
    it('should apply timezone offset to dates', () => {
      const serviceWithTz = new BuiltInService({ timezone: -86400 }); // -1 day

      // With -24h timezone, "today" should appear as yesterday
      const result = serviceWithTz.resolve('[TODAY]');
      expect(result).toBe('14.01.2024');
    });
  });
});
