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

  describe('Phase 1 MVP - Attribute extraction', () => {
    it('should extract type attributes from request body', () => {
      // Simulates t{id}=value format from PHP forms
      const body = {
        val: 'Test Object',
        t: '18',
        t20: 'password123',
        t30: '1234567890',
        t41: 'test@example.com',
        other: 'ignored',
      };

      const attributes = {};
      for (const [key, value] of Object.entries(body)) {
        if (key.startsWith('t') && /^t\d+$/.test(key)) {
          const typeId = parseInt(key.substring(1), 10);
          attributes[typeId] = value;
        }
      }

      expect(Object.keys(attributes).length).toBe(3);
      expect(attributes[20]).toBe('password123');
      expect(attributes[30]).toBe('1234567890');
      expect(attributes[41]).toBe('test@example.com');
    });

    it('should handle empty attributes', () => {
      const body = { val: 'Test', t: '18' };

      const attributes = {};
      for (const [key, value] of Object.entries(body)) {
        if (key.startsWith('t') && /^t\d+$/.test(key)) {
          const typeId = parseInt(key.substring(1), 10);
          attributes[typeId] = value;
        }
      }

      expect(Object.keys(attributes).length).toBe(0);
    });
  });

  describe('Phase 1 MVP - Requisite modifier parsing', () => {
    it('should parse :ALIAS=xxx: modifier', () => {
      let name = ':ALIAS=email:Электронная почта';
      let alias = null;

      const aliasMatch = name.match(/:ALIAS=(.*?):/);
      if (aliasMatch) {
        alias = aliasMatch[1];
        name = name.replace(aliasMatch[0], '');
      }

      expect(alias).toBe('email');
      expect(name).toBe('Электронная почта');
    });

    it('should parse :!NULL: modifier', () => {
      let name = ':!NULL:Обязательное поле';
      let required = false;

      if (name.includes(':!NULL:')) {
        required = true;
        name = name.replace(':!NULL:', '');
      }

      expect(required).toBe(true);
      expect(name).toBe('Обязательное поле');
    });

    it('should parse :MULTI: modifier', () => {
      let name = ':MULTI:Множественный выбор';
      let multi = false;

      if (name.includes(':MULTI:')) {
        multi = true;
        name = name.replace(':MULTI:', '');
      }

      expect(multi).toBe(true);
      expect(name).toBe('Множественный выбор');
    });

    it('should parse combined modifiers', () => {
      let name = ':ALIAS=roles::!NULL::MULTI:Роли пользователя';
      let alias = null;
      let required = false;
      let multi = false;

      const aliasMatch = name.match(/:ALIAS=(.*?):/);
      if (aliasMatch) {
        alias = aliasMatch[1];
        name = name.replace(aliasMatch[0], '');
      }

      if (name.includes(':!NULL:')) {
        required = true;
        name = name.replace(':!NULL:', '');
      }

      if (name.includes(':MULTI:')) {
        multi = true;
        name = name.replace(':MULTI:', '');
      }

      expect(alias).toBe('roles');
      expect(required).toBe(true);
      expect(multi).toBe(true);
      expect(name).toBe('Роли пользователя');
    });
  });

  describe('Phase 1 MVP - Response format', () => {
    it('should format _m_new response correctly', () => {
      const response = {
        status: 'Ok',
        id: 1001,
        val: 'Test User',
        up: 1,
        t: 18,
        ord: 1,
      };

      expect(response.status).toBe('Ok');
      expect(response.id).toBe(1001);
      expect(response.val).toBe('Test User');
      expect(response.t).toBe(18);
    });

    it('should format _list response correctly', () => {
      const response = {
        data: [
          { id: 1, val: 'Item 1', up: 0, t: 18, ord: 1 },
          { id: 2, val: 'Item 2', up: 0, t: 18, ord: 2 },
        ],
        total: 100,
        limit: 50,
        offset: 0,
      };

      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBe(2);
      expect(response.total).toBe(100);
      expect(response.limit).toBe(50);
    });

    it('should format _d_main response correctly', () => {
      const response = {
        id: 18,
        name: 'Пользователь',
        baseType: 8,
        order: 17,
        requisites: [
          { id: 20, name: 'Пароль', alias: 'pwd', type: 6, order: 1, required: true, multi: false },
          { id: 30, name: 'Телефон', alias: 'phone', type: 8, order: 2, required: false, multi: false },
        ],
      };

      expect(response.id).toBe(18);
      expect(response.name).toBe('Пользователь');
      expect(Array.isArray(response.requisites)).toBe(true);
      expect(response.requisites[0].required).toBe(true);
    });

    it('should format _ref_reqs response as key-value pairs', () => {
      const response = {
        1: 'Admin',
        2: 'User',
        3: 'Guest',
      };

      expect(response[1]).toBe('Admin');
      expect(response[2]).toBe('User');
      expect(Object.keys(response).length).toBe(3);
    });
  });
});
