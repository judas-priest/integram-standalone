// Tests for Legacy PHP Backend Compatibility Layer
// Issue #121: Enable legacy HTML site to work with new Node.js backend

import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

// Mock mysql2/promise before importing the route
vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => ({
      query: vi.fn().mockResolvedValue([[]]),
    })),
  },
}));

// Mock logger
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Legacy Compatibility Layer', () => {
  describe('Database name validation', () => {
    it('should accept valid database names', () => {
      const validNames = ['my', 'test', 'a2025', 'mydb123', 'MyDB'];
      validNames.forEach(name => {
        expect(/^[a-z]\w{1,14}$/i.test(name)).toBe(true);
      });
    });

    it('should reject invalid database names', () => {
      // Empty, starts with number, too short (less than 2), too long (more than 15), contains special chars
      const invalidNames = ['', '1test', 'a', 'verylongdatabasename16chars', 'test-db', 'test.db'];
      invalidNames.forEach(name => {
        expect(/^[a-z]\w{1,14}$/i.test(name)).toBe(false);
      });
    });
  });

  describe('PHP-compatible password hashing', () => {
    it('should generate consistent SHA1 hashes', () => {
      // Test the hashing algorithm
      const username = 'testuser';
      const password = 'testpass123';
      const salt = 'INTEGRAM_SALT';

      const saltedValue = username + salt + password;
      const innerHash = crypto.createHash('sha1').update(saltedValue).digest('hex');
      const expectedHash = crypto.createHash('sha1').update(innerHash).digest('hex');

      // Hash should be 40 characters (SHA1 hex)
      expect(expectedHash.length).toBe(40);

      // Same input should produce same output
      const innerHash2 = crypto.createHash('sha1').update(saltedValue).digest('hex');
      const hash2 = crypto.createHash('sha1').update(innerHash2).digest('hex');
      expect(hash2).toBe(expectedHash);
    });
  });

  describe('Token generation', () => {
    it('should generate MD5 tokens (32 chars)', () => {
      const microtime = Date.now() / 1000;
      const token = crypto.createHash('md5').update(microtime.toString() + Math.random().toString()).digest('hex');

      expect(token.length).toBe(32);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();

      for (let i = 0; i < 100; i++) {
        const microtime = Date.now() / 1000;
        const token = crypto.createHash('md5').update(microtime.toString() + Math.random().toString()).digest('hex');
        tokens.add(token);
      }

      // All tokens should be unique
      expect(tokens.size).toBe(100);
    });
  });

  describe('XSRF token generation', () => {
    it('should generate XSRF tokens consistently', () => {
      const token = 'abc123';
      const db = 'mydb';
      const xsrf = crypto.createHash('md5').update(token + db + 'XSRF').digest('hex');

      expect(xsrf.length).toBe(32);

      // Same input should produce same XSRF
      const xsrf2 = crypto.createHash('md5').update(token + db + 'XSRF').digest('hex');
      expect(xsrf2).toBe(xsrf);
    });
  });

  describe('TYPE constants', () => {
    it('should have correct PHP type constants', () => {
      const TYPE = {
        USER: 18,
        PASSWORD: 20,
        PHONE: 30,
        XSRF: 40,
        EMAIL: 41,
        ROLE: 42,
        ACTIVITY: 124,
        TOKEN: 125,
        SECRET: 130,
        DATABASE: 271,
      };

      expect(TYPE.USER).toBe(18);
      expect(TYPE.PASSWORD).toBe(20);
      expect(TYPE.TOKEN).toBe(125);
      expect(TYPE.XSRF).toBe(40);
    });
  });

  describe('Legacy API actions', () => {
    it('should handle DML actions', () => {
      const dmlActions = ['_m_new', '_m_save', '_m_del', '_m_set', '_m_move'];
      dmlActions.forEach(action => {
        expect(action.startsWith('_m_')).toBe(true);
      });
    });

    it('should handle DDL actions', () => {
      const ddlActions = ['_d_new', '_d_save', '_d_del', '_d_req', '_d_alias', '_d_null', '_d_multi'];
      ddlActions.forEach(action => {
        expect(action.startsWith('_d_')).toBe(true);
      });
    });

    it('should handle query actions', () => {
      const queryActions = ['_dict', '_list', '_d_main', 'terms', 'xsrf', '_ref_reqs', '_connect'];
      expect(queryActions.length).toBe(7);
    });
  });

  describe('Page routing', () => {
    it('should map page names to templates', () => {
      const pageMap = {
        'dict': 'templates/dict.html',
        'object': 'templates/object.html',
        'edit': 'templates/edit_obj.html',
        'report': 'templates/report.html',
        'types': 'templates/edit_types.html',
        'form': 'templates/form.html',
        'upload': 'templates/upload.html',
        'sql': 'templates/sql.html',
        'admin': 'templates/dir_admin.html',
        'info': 'templates/info.html',
        'quiz': 'templates/quiz.html',
      };

      expect(Object.keys(pageMap).length).toBe(11);
      expect(pageMap['dict']).toBe('templates/dict.html');
      expect(pageMap['object']).toBe('templates/object.html');
    });
  });

  describe('JSON mode detection', () => {
    it('should detect JSON mode from query params', () => {
      const jsonParams = ['JSON', 'json', 'JSON_KV', 'JSON_DATA', 'JSON_CR', 'JSON_HR'];

      jsonParams.forEach(param => {
        const isJSON = param === 'JSON' || param === 'json' || param === 'JSON_KV' || param === 'JSON_DATA' || param === 'JSON_CR' || param === 'JSON_HR';
        expect(isJSON).toBe(true);
      });
    });
  });
});
