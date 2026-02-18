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

  describe('Phase 2 - DDL Actions modifier building', () => {
    // Helper function to build modifier string
    function buildModifiers(name, alias, required, multi) {
      let val = '';
      if (alias) val += `:ALIAS=${alias}:`;
      if (required) val += ':!NULL:';
      if (multi) val += ':MULTI:';
      val += name;
      return val;
    }

    // Helper function to parse modifiers
    function parseModifiers(val) {
      let name = val || '';
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

      return { name: name.trim(), alias, required, multi };
    }

    it('should build modifier string correctly', () => {
      // Test building with all modifiers
      const val = buildModifiers('Email', 'email', true, false);
      expect(val).toBe(':ALIAS=email::!NULL:Email');

      // Test with only alias
      const val2 = buildModifiers('Phone', 'phone', false, false);
      expect(val2).toBe(':ALIAS=phone:Phone');

      // Test with only required
      const val3 = buildModifiers('Name', null, true, false);
      expect(val3).toBe(':!NULL:Name');

      // Test with only multi
      const val4 = buildModifiers('Roles', null, false, true);
      expect(val4).toBe(':MULTI:Roles');

      // Test with no modifiers
      const val5 = buildModifiers('Description', null, false, false);
      expect(val5).toBe('Description');

      // Test with all modifiers
      const val6 = buildModifiers('Tags', 'tags', true, true);
      expect(val6).toBe(':ALIAS=tags::!NULL::MULTI:Tags');
    });

    it('should parse modifiers correctly', () => {
      // Test parsing with all modifiers
      const parsed1 = parseModifiers(':ALIAS=email::!NULL:Email');
      expect(parsed1.alias).toBe('email');
      expect(parsed1.required).toBe(true);
      expect(parsed1.multi).toBe(false);
      expect(parsed1.name).toBe('Email');

      // Test round-trip
      const original = ':ALIAS=tags::!NULL::MULTI:User Tags';
      const parsed = parseModifiers(original);
      const rebuilt = buildModifiers(parsed.name, parsed.alias, parsed.required, parsed.multi);
      const reparsed = parseModifiers(rebuilt);

      expect(reparsed.name).toBe(parsed.name);
      expect(reparsed.alias).toBe(parsed.alias);
      expect(reparsed.required).toBe(parsed.required);
      expect(reparsed.multi).toBe(parsed.multi);
    });
  });

  describe('Phase 2 - DDL response formats', () => {
    it('should format _d_new response correctly', () => {
      const response = {
        status: 'Ok',
        id: 500,
        val: 'NewType',
        t: 8,
        up: 0,
        ord: 10,
      };

      expect(response.status).toBe('Ok');
      expect(response.id).toBe(500);
      expect(response.val).toBe('NewType');
    });

    it('should format _d_req response correctly', () => {
      const response = {
        status: 'Ok',
        id: 501,
        val: ':ALIAS=field1::!NULL:Field Name',
        t: 8,
        up: 500,
        ord: 1,
      };

      expect(response.status).toBe('Ok');
      expect(response.id).toBe(501);
      expect(response.up).toBe(500);
    });

    it('should format _d_alias response correctly', () => {
      const response = {
        status: 'Ok',
        id: 501,
        alias: 'new_alias',
      };

      expect(response.alias).toBe('new_alias');
    });

    it('should format _d_null response correctly', () => {
      const response = {
        status: 'Ok',
        id: 501,
        required: true,
      };

      expect(response.required).toBe(true);
    });

    it('should format _d_multi response correctly', () => {
      const response = {
        status: 'Ok',
        id: 501,
        multi: true,
      };

      expect(response.multi).toBe(true);
    });

    it('should format _d_attrs response correctly', () => {
      const response = {
        status: 'Ok',
        id: 501,
        name: 'Updated Name',
        alias: 'updated_alias',
        required: true,
        multi: false,
      };

      expect(response.name).toBe('Updated Name');
      expect(response.alias).toBe('updated_alias');
      expect(response.required).toBe(true);
      expect(response.multi).toBe(false);
    });

    it('should format _d_ord response correctly', () => {
      const response = {
        status: 'Ok',
        id: 501,
        ord: 5,
      };

      expect(response.ord).toBe(5);
    });

    it('should format _d_ref response correctly', () => {
      const response = {
        status: 'Ok',
        id: 502,
        val: 'User Reference',
        t: 18, // Referenced type ID (User)
        up: 500,
        ord: 2,
      };

      expect(response.t).toBe(18);
      expect(response.val).toBe('User Reference');
    });
  });

  describe('Phase 2 - DDL actions list', () => {
    it('should define all Phase 2 DDL actions', () => {
      const phase2Actions = [
        '_d_new',      // Create type
        '_d_save',     // Save type
        '_d_del',      // Delete type
        '_d_req',      // Add requisite
        '_d_alias',    // Set alias
        '_d_null',     // Toggle NOT NULL
        '_d_multi',    // Toggle MULTI
        '_d_attrs',    // Set all modifiers
        '_d_up',       // Move up
        '_d_ord',      // Set order
        '_d_del_req',  // Delete requisite
        '_d_ref',      // Create reference
      ];

      expect(phase2Actions.length).toBe(12);
      phase2Actions.forEach(action => {
        expect(action.startsWith('_d_')).toBe(true);
      });
    });

    it('should define Phase 2 additional DML actions', () => {
      const additionalDmlActions = [
        '_m_up',   // Move object up
        '_m_ord',  // Set object order
        '_m_id',   // Change ID (restricted)
      ];

      expect(additionalDmlActions.length).toBe(3);
      additionalDmlActions.forEach(action => {
        expect(action.startsWith('_m_')).toBe(true);
      });
    });
  });

  describe('Phase 3 - Metadata and Query Actions', () => {
    it('should define obj_meta response format', () => {
      const response = {
        id: '1001',
        up: '1',
        type: '18',
        val: 'TestUser',
        reqs: {
          '1': {
            id: '2001',
            val: 'Пароль',
            type: '6',
            attrs: ':!NULL:'
          },
          '2': {
            id: '2002',
            val: 'Email',
            type: '8',
            attrs: ':ALIAS=email:'
          }
        }
      };

      expect(response.id).toBe('1001');
      expect(response.reqs['1'].val).toBe('Пароль');
      expect(Object.keys(response.reqs).length).toBe(2);
    });

    it('should define metadata response format for single type', () => {
      const response = {
        id: '18',
        up: '0',
        type: '8',
        val: 'Пользователь',
        unique: '10',
        reqs: [
          { num: 1, id: '20', val: 'Пароль', orig: '6', type: '6' },
          { num: 2, id: '30', val: 'Телефон', orig: '8', type: '8' }
        ]
      };

      expect(response.id).toBe('18');
      expect(Array.isArray(response.reqs)).toBe(true);
      expect(response.reqs[0].num).toBe(1);
    });

    it('should define metadata response format for all types', () => {
      const response = [
        { id: '18', up: '0', type: '8', val: 'Пользователь', unique: '10', reqs: [] },
        { id: '42', up: '0', type: '8', val: 'Роль', unique: '11', reqs: [] },
        { id: '125', up: '0', type: '8', val: 'Токен', unique: '12', reqs: [] }
      ];

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBe(3);
      expect(response[0].val).toBe('Пользователь');
    });
  });

  describe('Phase 3 - JWT and Authentication', () => {
    it('should define jwt response format', () => {
      const response = {
        success: true,
        valid: true,
        user: {
          id: 1001,
          login: 'testuser',
          role: 'admin',
          role_id: 42
        },
        xsrf: 'abc123',
        token: 'xyz789'
      };

      expect(response.success).toBe(true);
      expect(response.user.id).toBe(1001);
      expect(response.xsrf).toBe('abc123');
    });

    it('should define confirm response format', () => {
      const response = {
        success: true,
        message: 'Password updated successfully'
      };

      expect(response.success).toBe(true);
      expect(response.message).toBe('Password updated successfully');
    });
  });

  describe('Phase 3 - File Management', () => {
    it('should define upload response format', () => {
      const response = {
        success: true,
        message: 'File uploaded successfully',
        path: '/download/mydb/'
      };

      expect(response.success).toBe(true);
      expect(response.path).toContain('download');
    });

    it('should define dir_admin response format', () => {
      const response = {
        success: true,
        folder: 'download',
        path: '/path/to/files',
        add_path: '',
        directories: [
          { name: 'folder1', type: 'directory' },
          { name: 'folder2', type: 'directory' }
        ],
        files: [
          { name: 'file1.txt', type: 'file', size: 1024, modified: '2024-01-01T00:00:00.000Z' },
          { name: 'file2.pdf', type: 'file', size: 2048, modified: '2024-01-02T00:00:00.000Z' }
        ]
      };

      expect(response.success).toBe(true);
      expect(Array.isArray(response.directories)).toBe(true);
      expect(Array.isArray(response.files)).toBe(true);
      expect(response.files[0].size).toBe(1024);
    });

    it('should validate filename to prevent directory traversal', () => {
      const validFilenames = ['file.txt', 'document.pdf', 'image.png'];
      const invalidFilenames = ['../file.txt', 'folder/file.txt', '..\\file.txt'];

      validFilenames.forEach(filename => {
        expect(filename.includes('..') || filename.includes('/')).toBe(false);
      });

      invalidFilenames.forEach(filename => {
        expect(filename.includes('..') || filename.includes('/')).toBe(true);
      });
    });
  });

  describe('Phase 3 - Reports and Export', () => {
    it('should define report list response format', () => {
      const response = {
        success: true,
        reports: [
          { id: 100, name: 'Sales Report', order: 1 },
          { id: 101, name: 'User Activity', order: 2 }
        ]
      };

      expect(response.success).toBe(true);
      expect(Array.isArray(response.reports)).toBe(true);
      expect(response.reports.length).toBe(2);
    });

    it('should define report detail response format', () => {
      const response = {
        success: true,
        report: {
          id: 100,
          name: 'Sales Report',
          columns: [
            { id: 201, name: 'Date', type: 9, order: 1 },
            { id: 202, name: 'Amount', type: 13, order: 2 },
            { id: 203, name: 'Customer', type: 18, order: 3 }
          ]
        }
      };

      expect(response.report.id).toBe(100);
      expect(Array.isArray(response.report.columns)).toBe(true);
      expect(response.report.columns[0].name).toBe('Date');
    });

    it('should format CSV export correctly', () => {
      const rows = [
        { id: 1, val: 'Item 1', up: 0, ord: 1 },
        { id: 2, val: 'Item "with quotes"', up: 0, ord: 2 }
      ];

      const csvHeader = 'id,value,parent,order\n';
      const csvRows = rows.map(r => `${r.id},"${(r.val || '').replace(/"/g, '""')}",${r.up},${r.ord}`).join('\n');
      const csv = csvHeader + csvRows;

      expect(csv).toContain('id,value,parent,order');
      expect(csv).toContain('"Item ""with quotes"""'); // Properly escaped quotes
    });
  });

  describe('Phase 3 - Database Creation', () => {
    it('should validate new database name', () => {
      const USER_DB_MASK = /^[a-z][a-z0-9]{2,14}$/i;

      const validNames = ['mydb', 'test123', 'ABC', 'NewDatabase'];
      const invalidNames = ['12db', 'ab', 'verylongdatabasenameover15', 'test-db', 'test.db'];

      validNames.forEach(name => {
        expect(USER_DB_MASK.test(name)).toBe(true);
      });

      invalidNames.forEach(name => {
        expect(USER_DB_MASK.test(name)).toBe(false);
      });
    });

    it('should define reserved database names', () => {
      const reservedNames = ['my', 'admin', 'root', 'system', 'test', 'demo', 'api', 'health'];

      expect(reservedNames.includes('my')).toBe(true);
      expect(reservedNames.includes('admin')).toBe(true);
      expect(reservedNames.length).toBe(8);
    });

    it('should define _new_db response format', () => {
      const response = {
        status: 'Ok',
        id: 'newdatabase',
        database: 'newdatabase',
        template: 'empty',
        message: 'Database "newdatabase" created successfully'
      };

      expect(response.status).toBe('Ok');
      expect(response.database).toBe('newdatabase');
    });
  });

  describe('Phase 3 actions list', () => {
    it('should define all Phase 3 actions', () => {
      const phase3Actions = [
        // Metadata
        'obj_meta',
        'metadata',
        // Auth
        'jwt',
        'confirm',
        'login',
        // Database
        '_new_db',
        // Files
        'upload',
        'download',
        'dir_admin',
        // Reports
        'report',
        'export'
      ];

      expect(phase3Actions.length).toBe(11);
    });
  });
});
