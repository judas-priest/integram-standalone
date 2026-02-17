/**
 * @integram/common - Constants Tests
 */

import { describe, it, expect } from 'vitest';
import {
  USER,
  DATABASE,
  TOKEN,
  PASSWORD,
  EMAIL,
  ROLE,
  XSRF,
  DB_MASK,
  USER_DB_MASK,
  MAIL_MASK,
  BASIC_TYPES,
  BASIC_TYPE_IDS,
  GRANTS,
  BLACKLISTED_EXTENSIONS,
  SQL_RESERVED_WORDS_SET,
} from '../constants/index.js';

describe('@integram/common constants', () => {
  describe('Data Type Constants', () => {
    it('should have correct USER type ID', () => {
      expect(USER).toBe(18);
    });

    it('should have correct DATABASE type ID', () => {
      expect(DATABASE).toBe(271);
    });

    it('should have correct TOKEN type ID', () => {
      expect(TOKEN).toBe(125);
    });

    it('should have correct PASSWORD type ID', () => {
      expect(PASSWORD).toBe(20);
    });

    it('should have correct EMAIL type ID', () => {
      expect(EMAIL).toBe(41);
    });

    it('should have correct ROLE type ID', () => {
      expect(ROLE).toBe(42);
    });

    it('should have correct XSRF type ID', () => {
      expect(XSRF).toBe(40);
    });
  });

  describe('Validation Patterns', () => {
    describe('DB_MASK', () => {
      it('should match valid database names', () => {
        expect(DB_MASK.test('my')).toBe(true);
        expect(DB_MASK.test('test123')).toBe(true);
        expect(DB_MASK.test('MyDatabase')).toBe(true);
        expect(DB_MASK.test('db_name')).toBe(true);
      });

      it('should reject invalid database names', () => {
        expect(DB_MASK.test('')).toBe(false);
        expect(DB_MASK.test('1database')).toBe(false); // starts with number
        expect(DB_MASK.test('a')).toBe(false); // too short
        expect(DB_MASK.test('toolongdatabasename123')).toBe(false); // too long
        expect(DB_MASK.test('db-name')).toBe(false); // has hyphen
      });
    });

    describe('USER_DB_MASK', () => {
      it('should match valid user database names', () => {
        expect(USER_DB_MASK.test('abc')).toBe(true);
        expect(USER_DB_MASK.test('test123')).toBe(true);
      });

      it('should reject too short names', () => {
        expect(USER_DB_MASK.test('ab')).toBe(false);
      });
    });

    describe('MAIL_MASK', () => {
      it('should match valid emails', () => {
        expect(MAIL_MASK.test('user@example.com')).toBe(true);
        expect(MAIL_MASK.test('test@test.co.uk')).toBe(true);
      });

      it('should reject invalid emails', () => {
        expect(MAIL_MASK.test('invalid')).toBe(false);
        expect(MAIL_MASK.test('no@domain')).toBe(false);
      });
    });
  });

  describe('BASIC_TYPES', () => {
    it('should have SHORT type', () => {
      expect(BASIC_TYPES[3]).toBe('SHORT');
    });

    it('should have DATE type', () => {
      expect(BASIC_TYPES[9]).toBe('DATE');
    });

    it('should have NUMBER type', () => {
      expect(BASIC_TYPES[13]).toBe('NUMBER');
    });

    it('should have BOOLEAN type', () => {
      expect(BASIC_TYPES[11]).toBe('BOOLEAN');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(BASIC_TYPES)).toBe(true);
    });
  });

  describe('BASIC_TYPE_IDS', () => {
    it('should have reverse mapping', () => {
      expect(BASIC_TYPE_IDS['SHORT']).toBe(3);
      expect(BASIC_TYPE_IDS['DATE']).toBe(9);
      expect(BASIC_TYPE_IDS['NUMBER']).toBe(13);
    });
  });

  describe('GRANTS', () => {
    it('should have all grant levels', () => {
      expect(GRANTS.READ).toBe('READ');
      expect(GRANTS.WRITE).toBe('WRITE');
      expect(GRANTS.BARRED).toBe('BARRED');
    });
  });

  describe('BLACKLISTED_EXTENSIONS', () => {
    it('should include dangerous extensions', () => {
      expect(BLACKLISTED_EXTENSIONS).toContain('php');
      expect(BLACKLISTED_EXTENSIONS).toContain('asp');
      expect(BLACKLISTED_EXTENSIONS).toContain('jsp');
    });
  });

  describe('SQL_RESERVED_WORDS_SET', () => {
    it('should contain SELECT', () => {
      expect(SQL_RESERVED_WORDS_SET.has('SELECT')).toBe(true);
    });

    it('should contain TABLE', () => {
      expect(SQL_RESERVED_WORDS_SET.has('TABLE')).toBe(true);
    });

    it('should not contain random words', () => {
      expect(SQL_RESERVED_WORDS_SET.has('RANDOMWORD')).toBe(false);
    });
  });
});
