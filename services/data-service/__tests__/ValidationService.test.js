/**
 * ValidationService Tests
 *
 * Tests for input validation and security checks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from '../src/services/ValidationService.js';

describe('ValidationService', () => {
  let validationService;

  beforeEach(() => {
    validationService = new ValidationService();
  });

  describe('checkInjection', () => {
    it('should allow safe strings', () => {
      expect(validationService.checkInjection('hello world')).toBe('hello world');
      expect(validationService.checkInjection('user123')).toBe('user123');
      expect(validationService.checkInjection('test@email.com')).toBe('test@email.com');
    });

    it('should detect SELECT injection', () => {
      expect(() => {
        validationService.checkInjection('admin; SELECT * FROM users');
      }).toThrow();
    });

    it('should detect FROM injection', () => {
      expect(() => {
        validationService.checkInjection("' OR '1'='1' FROM users");
      }).toThrow();
    });

    it('should detect TABLE keyword', () => {
      expect(() => {
        validationService.checkInjection('DROP TABLE users');
      }).toThrow();
    });

    it('should detect UNION injection', () => {
      expect(() => {
        validationService.checkInjection("1 UNION SELECT password");
      }).toThrow();
    });

    it('should detect SQL comments', () => {
      expect(() => {
        validationService.checkInjection("admin'--");
      }).toThrow();
    });

    it('should handle null and undefined', () => {
      expect(validationService.checkInjection(null)).toBeNull();
      expect(validationService.checkInjection(undefined)).toBeUndefined();
    });
  });

  describe('hasInjectionPattern', () => {
    it('should return true for dangerous patterns', () => {
      expect(validationService.hasInjectionPattern('SELECT * FROM users')).toBe(true);
      expect(validationService.hasInjectionPattern('DROP TABLE')).toBe(true);
    });

    it('should return false for safe strings', () => {
      expect(validationService.hasInjectionPattern('hello world')).toBe(false);
      expect(validationService.hasInjectionPattern('user@email.com')).toBe(false);
    });
  });

  describe('validateFileExtension', () => {
    it('should allow safe extensions', () => {
      expect(validationService.validateFileExtension('pdf')).toBe(true);
      expect(validationService.validateFileExtension('.jpg')).toBe(true);
      expect(validationService.validateFileExtension('docx')).toBe(true);
    });

    it('should reject PHP extensions', () => {
      expect(() => validationService.validateFileExtension('php')).toThrow();
      expect(() => validationService.validateFileExtension('PHP')).toThrow();
      expect(() => validationService.validateFileExtension('.php')).toThrow();
    });

    it('should reject other dangerous extensions', () => {
      expect(() => validationService.validateFileExtension('cgi')).toThrow();
      expect(() => validationService.validateFileExtension('asp')).toThrow();
      expect(() => validationService.validateFileExtension('jsp')).toThrow();
      expect(() => validationService.validateFileExtension('phtml')).toThrow();
    });

    it('should handle empty extension', () => {
      expect(validationService.validateFileExtension('')).toBe(true);
      expect(validationService.validateFileExtension(null)).toBe(true);
    });
  });

  describe('validateDbName', () => {
    it('should allow valid database names', () => {
      expect(validationService.validateDbName('mydb')).toBe(true);
      expect(validationService.validateDbName('test123')).toBe(true);
      expect(validationService.validateDbName('a12345')).toBe(true);
    });

    it('should reject names starting with number', () => {
      expect(() => validationService.validateDbName('123db')).toThrow();
    });

    it('should reject too short names', () => {
      expect(() => validationService.validateDbName('a')).toThrow();
    });

    it('should reject too long names', () => {
      expect(() => validationService.validateDbName('abcdefghijklmnopqrstuvwxyz')).toThrow();
    });

    it('should reject reserved words', () => {
      expect(() => validationService.validateDbName('SELECT')).toThrow();
      expect(() => validationService.validateDbName('table')).toThrow();
      expect(() => validationService.validateDbName('DATABASE')).toThrow();
    });

    it('should reject empty names', () => {
      expect(() => validationService.validateDbName('')).toThrow();
      expect(() => validationService.validateDbName(null)).toThrow();
    });

    it('should use stricter rules for user database names', () => {
      expect(validationService.validateDbName('abc', true)).toBe(true);
      expect(() => validationService.validateDbName('ab', true)).toThrow();
    });
  });

  describe('isReservedWord', () => {
    it('should identify MySQL reserved words', () => {
      expect(validationService.isReservedWord('SELECT')).toBe(true);
      expect(validationService.isReservedWord('FROM')).toBe(true);
      expect(validationService.isReservedWord('TABLE')).toBe(true);
      expect(validationService.isReservedWord('CREATE')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(validationService.isReservedWord('select')).toBe(true);
      expect(validationService.isReservedWord('Select')).toBe(true);
    });

    it('should return false for non-reserved words', () => {
      expect(validationService.isReservedWord('mydata')).toBe(false);
      expect(validationService.isReservedWord('username')).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should allow valid emails', () => {
      expect(validationService.validateEmail('test@example.com')).toBe(true);
      expect(validationService.validateEmail('user.name@domain.org')).toBe(true);
      expect(validationService.validateEmail('user+tag@example.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(() => validationService.validateEmail('invalid')).toThrow();
      expect(() => validationService.validateEmail('no@domain')).toThrow();
      expect(() => validationService.validateEmail('@domain.com')).toThrow();
    });

    it('should reject empty email', () => {
      expect(() => validationService.validateEmail('')).toThrow();
      expect(() => validationService.validateEmail(null)).toThrow();
    });
  });

  describe('validateDirName', () => {
    it('should allow valid directory names', () => {
      expect(validationService.validateDirName('mydir')).toBe(true);
      expect(validationService.validateDirName('dir_123')).toBe(true);
      expect(validationService.validateDirName('abc123')).toBe(true);
    });

    it('should reject names with special characters', () => {
      expect(() => validationService.validateDirName('my-dir')).toThrow();
      expect(() => validationService.validateDirName('my dir')).toThrow();
      expect(() => validationService.validateDirName('my/dir')).toThrow();
    });

    it('should reject empty names', () => {
      expect(() => validationService.validateDirName('')).toThrow();
    });
  });

  describe('validateFileName', () => {
    it('should allow valid file names', () => {
      expect(validationService.validateFileName('document.pdf')).toBe(true);
      expect(validationService.validateFileName('file_123.txt')).toBe(true);
    });

    it('should reject dangerous extensions', () => {
      expect(() => validationService.validateFileName('script.php')).toThrow();
      expect(() => validationService.validateFileName('hack.cgi')).toThrow();
    });

    it('should reject special characters', () => {
      expect(() => validationService.validateFileName('file name.txt')).toThrow();
      expect(() => validationService.validateFileName('file/name.txt')).toThrow();
    });
  });

  describe('validatePassword', () => {
    it('should allow valid passwords', () => {
      expect(validationService.validatePassword('password123')).toBe(true);
      expect(validationService.validatePassword('StrongPass!')).toBe(true);
    });

    it('should reject short passwords', () => {
      expect(() => validationService.validatePassword('short')).toThrow();
      expect(() => validationService.validatePassword('12345')).toThrow();
    });

    it('should allow custom minimum length', () => {
      expect(validationService.validatePassword('12345678', { minLength: 8 })).toBe(true);
      expect(() => validationService.validatePassword('1234567', { minLength: 8 })).toThrow();
    });

    it('should reject empty password', () => {
      expect(() => validationService.validatePassword('')).toThrow();
      expect(() => validationService.validatePassword(null)).toThrow();
    });
  });

  describe('validatePasswordMatch', () => {
    it('should return true for matching passwords', () => {
      expect(validationService.validatePasswordMatch('password', 'password')).toBe(true);
    });

    it('should throw for mismatched passwords', () => {
      expect(() => validationService.validatePasswordMatch('password', 'different')).toThrow();
    });
  });

  describe('sanitize', () => {
    it('should trim whitespace by default', () => {
      expect(validationService.sanitize('  hello  ')).toBe('hello');
    });

    it('should convert to lowercase when specified', () => {
      expect(validationService.sanitize('HELLO', { lowercase: true })).toBe('hello');
    });

    it('should truncate to max length', () => {
      expect(validationService.sanitize('hello world', { maxLength: 5 })).toBe('hello');
    });

    it('should handle empty values', () => {
      expect(validationService.sanitize('')).toBe('');
      expect(validationService.sanitize(null)).toBe('');
    });

    it('should apply all options together', () => {
      const result = validationService.sanitize('  HELLO WORLD  ', {
        trim: true,
        lowercase: true,
        maxLength: 5,
      });
      expect(result).toBe('hello');
    });
  });

  describe('escapeString', () => {
    it('should escape backslashes', () => {
      expect(validationService.escapeString('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should escape single quotes', () => {
      expect(validationService.escapeString("it's")).toBe("it\\'s");
    });

    it('should escape double quotes', () => {
      expect(validationService.escapeString('say "hello"')).toBe('say \\"hello\\"');
    });

    it('should escape newlines', () => {
      expect(validationService.escapeString('line1\nline2')).toBe('line1\\nline2');
    });

    it('should handle empty values', () => {
      expect(validationService.escapeString('')).toBe('');
      expect(validationService.escapeString(null)).toBe('');
    });
  });

  describe('validateId', () => {
    it('should parse valid integer IDs', () => {
      expect(validationService.validateId(123)).toBe(123);
      expect(validationService.validateId('456')).toBe(456);
    });

    it('should reject negative IDs', () => {
      expect(() => validationService.validateId(-1)).toThrow();
    });

    it('should reject non-numeric IDs', () => {
      expect(() => validationService.validateId('abc')).toThrow();
      expect(() => validationService.validateId(NaN)).toThrow();
    });

    it('should use custom field name in error', () => {
      try {
        validationService.validateId('abc', 'User ID');
      } catch (e) {
        expect(e.message).toContain('User ID');
      }
    });
  });

  describe('validateDate', () => {
    it('should allow valid dates', () => {
      expect(validationService.validateDate('20240115')).toBe(true);
      expect(validationService.validateDate('2024-01-15')).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(() => validationService.validateDate('invalid')).toThrow();
      expect(() => validationService.validateDate('20241315')).toThrow(); // Invalid month
    });

    it('should reject future dates when not allowed', () => {
      const futureDate = '20990101';
      expect(() => {
        validationService.validateDate(futureDate, { allowFuture: false });
      }).toThrow();
    });

    it('should reject past dates when not allowed', () => {
      const pastDate = '20000101';
      expect(() => {
        validationService.validateDate(pastDate, { allowPast: false });
      }).toThrow();
    });

    it('should reject empty dates', () => {
      expect(() => validationService.validateDate('')).toThrow();
      expect(() => validationService.validateDate(null)).toThrow();
    });
  });
});
