/**
 * @integram/common - Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateDbName,
  isDbNameReserved,
  isValidDbName,
  validateEmail,
  isBlacklistedExtension,
  hasInjectionPattern,
  translate,
  t9n,
  formatFileSize,
  formatValueForStorage,
  formatValueForDisplay,
  getAlignment,
  emailToDbName,
  maskCsvDelimiters,
  unmaskCsvDelimiters,
} from '../utils/index.js';

describe('@integram/common utilities', () => {
  describe('validateDbName', () => {
    it('should validate correct database names', () => {
      expect(validateDbName('mydb')).toBe(true);
      expect(validateDbName('test123')).toBe(true);
      expect(validateDbName('DB_name')).toBe(true);
    });

    it('should reject invalid database names', () => {
      expect(validateDbName('')).toBe(false);
      expect(validateDbName(null)).toBe(false);
      expect(validateDbName(123)).toBe(false);
      expect(validateDbName('1database')).toBe(false);
    });
  });

  describe('isDbNameReserved', () => {
    it('should detect reserved SQL words', () => {
      expect(isDbNameReserved('SELECT')).toBe(true);
      expect(isDbNameReserved('select')).toBe(true);
      expect(isDbNameReserved('TABLE')).toBe(true);
      expect(isDbNameReserved('DATABASE')).toBe(true);
    });

    it('should allow non-reserved words', () => {
      expect(isDbNameReserved('mydb')).toBe(false);
      expect(isDbNameReserved('test')).toBe(false);
    });
  });

  describe('isValidDbName', () => {
    it('should validate name and check reserved', () => {
      expect(isValidDbName('mydb')).toBe(true);
      expect(isValidDbName('SELECT')).toBe(false); // reserved
      expect(isValidDbName('')).toBe(false); // invalid
    });
  });

  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('no@domain')).toBe(false);
    });
  });

  describe('isBlacklistedExtension', () => {
    it('should detect blacklisted extensions', () => {
      expect(isBlacklistedExtension('php')).toBe(true);
      expect(isBlacklistedExtension('PHP')).toBe(true);
      expect(isBlacklistedExtension('asp')).toBe(true);
    });

    it('should allow safe extensions', () => {
      expect(isBlacklistedExtension('txt')).toBe(false);
      expect(isBlacklistedExtension('pdf')).toBe(false);
      expect(isBlacklistedExtension('jpg')).toBe(false);
    });
  });

  describe('hasInjectionPattern', () => {
    it('should detect SQL keywords', () => {
      expect(hasInjectionPattern('SELECT * FROM')).toBe(true);
      expect(hasInjectionPattern('DROP TABLE users')).toBe(true);
    });

    it('should allow safe strings', () => {
      expect(hasInjectionPattern('normal text')).toBe(false);
      expect(hasInjectionPattern('')).toBe(false);
    });
  });

  describe('translate / t9n', () => {
    it('should extract Russian text', () => {
      const msg = '[RU]Привет[EN]Hello';
      expect(translate(msg, 'RU')).toBe('Привет');
    });

    it('should extract English text', () => {
      const msg = '[RU]Привет[EN]Hello';
      expect(translate(msg, 'EN')).toBe('Hello');
    });

    it('should return original if locale not found', () => {
      const msg = 'No localization';
      expect(translate(msg, 'EN')).toBe('No localization');
    });

    it('t9n should be alias for translate', () => {
      expect(t9n).toBe(translate);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format KB', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB');
      expect(formatFileSize(2048)).toBe('2.00 KB');
    });

    it('should format MB', () => {
      expect(formatFileSize(1048576)).toBe('1.00 MB');
    });

    it('should format GB', () => {
      expect(formatFileSize(1073741824)).toBe('1.00 GB');
    });
  });

  describe('formatValueForStorage', () => {
    it('should format date to YYYYMMDD', () => {
      const date = new Date('2024-01-15');
      expect(formatValueForStorage(9, date)).toBe('20240115');
    });

    it('should format boolean to 1/0', () => {
      expect(formatValueForStorage(11, true)).toBe('1');
      expect(formatValueForStorage(11, false)).toBe('0');
    });

    it('should format numbers', () => {
      expect(formatValueForStorage(13, 123.45)).toBe('123.45');
    });

    it('should handle null/undefined', () => {
      expect(formatValueForStorage(3, null)).toBe('');
      expect(formatValueForStorage(3, undefined)).toBe('');
    });
  });

  describe('formatValueForDisplay', () => {
    it('should format YYYYMMDD date', () => {
      expect(formatValueForDisplay(9, '20240115')).toBe('15.01.2024');
    });

    it('should format boolean as checkmark', () => {
      expect(formatValueForDisplay(11, '1')).toBe('✓');
      expect(formatValueForDisplay(11, true)).toBe('✓');
      expect(formatValueForDisplay(11, '0')).toBe('');
    });

    it('should format password as stars', () => {
      expect(formatValueForDisplay(6, 'secret')).toBe('******');
    });
  });

  describe('getAlignment', () => {
    it('should return right for numbers', () => {
      expect(getAlignment(13)).toBe('right');
      expect(getAlignment(14)).toBe('right');
    });

    it('should return center for boolean', () => {
      expect(getAlignment(11)).toBe('center');
    });

    it('should return left for text', () => {
      expect(getAlignment(3)).toBe('left');
      expect(getAlignment(8)).toBe('left');
    });
  });

  describe('emailToDbName', () => {
    it('should convert email to database name', () => {
      expect(emailToDbName('john@example.com', 123)).toBe('john');
      expect(emailToDbName('test.user@domain.com', 456)).toBe('testuser');
    });

    it('should fallback to g+uid for invalid emails', () => {
      expect(emailToDbName('', 789)).toBe('g789');
      expect(emailToDbName(null, 999)).toBe('g999');
    });

    it('should handle reserved words', () => {
      expect(emailToDbName('select@example.com', 111)).toBe('g111');
    });
  });

  describe('CSV delimiter masking', () => {
    it('should mask delimiters', () => {
      expect(maskCsvDelimiters('a;b,c')).toContain('::SEMI::');
      expect(maskCsvDelimiters('a;b,c')).toContain('::COMMA::');
    });

    it('should unmask delimiters', () => {
      const masked = maskCsvDelimiters('a;b,c');
      expect(unmaskCsvDelimiters(masked)).toBe('a;b,c');
    });
  });
});
