/**
 * FormatService Tests
 *
 * Tests for value formatting and type conversions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormatService } from '../src/services/FormatService.js';

describe('FormatService', () => {
  let formatService;

  beforeEach(() => {
    formatService = new FormatService({ timezone: 0 });
  });

  describe('constructor', () => {
    it('should initialize with default basic types', () => {
      expect(formatService.getTypeName(9)).toBe('DATE');
      expect(formatService.getTypeName(13)).toBe('NUMBER');
      expect(formatService.getTypeName(14)).toBe('SIGNED');
      expect(formatService.getTypeName(11)).toBe('BOOLEAN');
    });

    it('should initialize reverse type mapping', () => {
      expect(formatService.getTypeId('DATE')).toBe(9);
      expect(formatService.getTypeId('NUMBER')).toBe(13);
      expect(formatService.getTypeId('SIGNED')).toBe(14);
    });

    it('should return SHORT for unknown type ID', () => {
      expect(formatService.getTypeName(999)).toBe('SHORT');
    });

    it('should return 3 for unknown type name', () => {
      expect(formatService.getTypeId('UNKNOWN')).toBe(3);
    });
  });

  describe('formatForStorage', () => {
    describe('DATE formatting', () => {
      it('should format ISO date YYYY-MM-DD to YYYYMMDD', () => {
        expect(formatService.formatForStorage('DATE', '2024-01-15')).toBe('20240115');
      });

      it('should format European date DD.MM.YYYY to YYYYMMDD', () => {
        expect(formatService.formatForStorage('DATE', '15.01.2024')).toBe('20240115');
      });

      it('should format date with slashes DD/MM/YYYY', () => {
        expect(formatService.formatForStorage('DATE', '15/01/2024')).toBe('20240115');
      });

      it('should handle two-digit year', () => {
        expect(formatService.formatForStorage('DATE', '15.01.24')).toBe('20240115');
      });

      it('should handle date without year (use current year)', () => {
        const currentYear = new Date().getFullYear();
        const result = formatService.formatForStorage('DATE', '15.01');
        expect(result).toMatch(new RegExp(`^${currentYear}0115$`));
      });

      it('should preserve built-in placeholders', () => {
        expect(formatService.formatForStorage('DATE', '[TODAY]')).toBe('[TODAY]');
      });

      it('should preserve _request_ prefix', () => {
        expect(formatService.formatForStorage('DATE', '_request_.date')).toBe('_request_.date');
      });
    });

    describe('DATETIME formatting', () => {
      it('should convert datetime string to timestamp', () => {
        const result = formatService.formatForStorage('DATETIME', '15.01.2024 12:30:00');
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThan(0);
      });

      it('should preserve existing timestamp', () => {
        const timestamp = 1705320600; // Some Unix timestamp
        const result = formatService.formatForStorage('DATETIME', String(timestamp));
        expect(result).toBe(timestamp);
      });

      it('should handle ISO datetime', () => {
        const result = formatService.formatForStorage('DATETIME', '2024-01-15T12:30:00');
        expect(typeof result).toBe('number');
      });
    });

    describe('NUMBER formatting', () => {
      it('should parse integer', () => {
        expect(formatService.formatForStorage('NUMBER', '123')).toBe(123);
      });

      it('should remove spaces from number', () => {
        expect(formatService.formatForStorage('NUMBER', '1 234 567')).toBe(1234567);
      });

      it('should remove commas from number', () => {
        expect(formatService.formatForStorage('NUMBER', '1,234,567')).toBe(1234567);
      });

      it('should return original value for non-numeric', () => {
        expect(formatService.formatForStorage('NUMBER', 'abc')).toBe('abc');
      });
    });

    describe('SIGNED formatting', () => {
      it('should parse decimal number', () => {
        expect(formatService.formatForStorage('SIGNED', '123.45')).toBe(123.45);
      });

      it('should handle comma as decimal separator', () => {
        expect(formatService.formatForStorage('SIGNED', '123,45')).toBe(123.45);
      });

      it('should remove spaces', () => {
        expect(formatService.formatForStorage('SIGNED', '1 234.56')).toBe(1234.56);
      });

      it('should handle negative numbers', () => {
        expect(formatService.formatForStorage('SIGNED', '-123.45')).toBe(-123.45);
      });
    });

    describe('BOOLEAN formatting', () => {
      it('should return "1" for truthy values', () => {
        expect(formatService.formatForStorage('BOOLEAN', '1')).toBe('1');
        expect(formatService.formatForStorage('BOOLEAN', 'yes')).toBe('1');
        expect(formatService.formatForStorage('BOOLEAN', 'true')).toBe('1');
      });

      it('should return "" for falsy values', () => {
        expect(formatService.formatForStorage('BOOLEAN', '')).toBe('');
        expect(formatService.formatForStorage('BOOLEAN', 'false')).toBe('');
        expect(formatService.formatForStorage('BOOLEAN', '-1')).toBe('');
        expect(formatService.formatForStorage('BOOLEAN', ' ')).toBe('');
      });
    });

    describe('NULL handling', () => {
      it('should preserve NULL string', () => {
        expect(formatService.formatForStorage('DATE', 'NULL')).toBe('NULL');
        expect(formatService.formatForStorage('NUMBER', 'NULL')).toBe('NULL');
      });

      it('should preserve null value', () => {
        expect(formatService.formatForStorage('DATE', null)).toBe('NULL');
      });
    });

    describe('SHORT/default formatting', () => {
      it('should return value unchanged', () => {
        expect(formatService.formatForStorage('SHORT', 'test value')).toBe('test value');
        expect(formatService.formatForStorage(3, 'test value')).toBe('test value');
      });
    });
  });

  describe('formatForDisplay', () => {
    describe('DATE formatting', () => {
      it('should format YYYYMMDD to DD.MM.YYYY', () => {
        expect(formatService.formatForDisplay('DATE', '20240115')).toBe('15.01.2024');
      });

      it('should handle empty value', () => {
        expect(formatService.formatForDisplay('DATE', '')).toBe('');
      });

      it('should handle null value', () => {
        expect(formatService.formatForDisplay('DATE', null)).toBe('');
      });
    });

    describe('DATETIME formatting', () => {
      it('should format timestamp to DD.MM.YYYY HH:mm:ss', () => {
        // Use a known timestamp
        const timestamp = 1705320600; // 2024-01-15 12:30:00 UTC
        const result = formatService.formatForDisplay('DATETIME', timestamp);
        expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
      });
    });

    describe('BOOLEAN formatting', () => {
      it('should return X for truthy value', () => {
        expect(formatService.formatForDisplay('BOOLEAN', '1')).toBe('X');
        expect(formatService.formatForDisplay('BOOLEAN', 'yes')).toBe('X');
      });

      it('should return empty for empty value', () => {
        expect(formatService.formatForDisplay('BOOLEAN', '')).toBe('');
      });
    });

    describe('NUMBER formatting', () => {
      it('should format with thousands separator', () => {
        const result = formatService.formatForDisplay('NUMBER', '1234567');
        // Russian locale uses space as thousands separator
        expect(result).toMatch(/1[\s\xa0]?234[\s\xa0]?567/);
      });
    });

    describe('SIGNED formatting', () => {
      it('should format with two decimal places', () => {
        const result = formatService.formatForDisplay('SIGNED', '1234.5');
        expect(result).toMatch(/1[\s\xa0]?234\.50/);
      });

      it('should handle integer values', () => {
        const result = formatService.formatForDisplay('SIGNED', '100');
        expect(result).toBe('100.00');
      });
    });

    describe('PWD formatting', () => {
      it('should return stars for password', () => {
        expect(formatService.formatForDisplay('PWD', 'secret123')).toBe('******');
      });

      it('should return empty for empty password', () => {
        expect(formatService.formatForDisplay('PWD', '')).toBe('');
      });
    });

    describe('FILE formatting', () => {
      it('should return HTML link for file', () => {
        const result = formatService.formatForDisplay('FILE', 'document.pdf', 1234);
        expect(result).toContain('<a');
        expect(result).toContain('document.pdf');
        expect(result).toContain('target="_blank"');
      });

      it('should handle id:filename format', () => {
        const result = formatService.formatForDisplay('FILE', '5678:document.pdf', 1234);
        expect(result).toContain('<a');
        expect(result).toContain('document.pdf');
      });
    });
  });

  describe('getAlignment', () => {
    it('should return CENTER for PWD', () => {
      expect(formatService.getAlignment('PWD')).toBe('CENTER');
    });

    it('should return CENTER for DATE', () => {
      expect(formatService.getAlignment('DATE')).toBe('CENTER');
    });

    it('should return CENTER for BOOLEAN', () => {
      expect(formatService.getAlignment('BOOLEAN')).toBe('CENTER');
    });

    it('should return RIGHT for NUMBER', () => {
      expect(formatService.getAlignment('NUMBER')).toBe('RIGHT');
    });

    it('should return RIGHT for SIGNED', () => {
      expect(formatService.getAlignment('SIGNED')).toBe('RIGHT');
    });

    it('should return LEFT for other types', () => {
      expect(formatService.getAlignment('SHORT')).toBe('LEFT');
      expect(formatService.getAlignment('CHARS')).toBe('LEFT');
      expect(formatService.getAlignment('MEMO')).toBe('LEFT');
    });

    it('should accept type ID', () => {
      expect(formatService.getAlignment(9)).toBe('CENTER'); // DATE
      expect(formatService.getAlignment(13)).toBe('RIGHT'); // NUMBER
      expect(formatService.getAlignment(3)).toBe('LEFT'); // SHORT
    });
  });

  describe('timezone handling', () => {
    it('should apply timezone to datetime', () => {
      const serviceWithTz = new FormatService({ timezone: 3600 }); // +1 hour
      const timestamp = 1705320600;

      const resultNoTz = formatService.formatForDisplay('DATETIME', timestamp);
      const resultWithTz = serviceWithTz.formatForDisplay('DATETIME', timestamp);

      // Results should be different due to timezone offset
      expect(resultNoTz).not.toBe(resultWithTz);
    });

    it('should allow timezone update', () => {
      formatService.setTimezone(3600);
      expect(formatService.timezone).toBe(3600);
    });
  });
});
