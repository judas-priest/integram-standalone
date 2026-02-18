/**
 * DataService Tests
 *
 * Tests for the main DataService facade.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataService, createDataService } from '../src/index.js';

describe('DataService', () => {
  let dataService;
  let mockDbService;
  let mockConnectionManager;

  beforeEach(() => {
    mockConnectionManager = {
      query: vi.fn(),
      execute: vi.fn(),
    };

    mockDbService = {
      cm: mockConnectionManager,
      execSql: vi.fn(),
      healthCheck: vi.fn(),
    };

    dataService = new DataService(mockDbService, {
      logger: { info: vi.fn(), error: vi.fn() },
      timezone: 0,
      context: {
        user: 'testuser',
        userId: 123,
      },
    });
  });

  describe('constructor', () => {
    it('should initialize all sub-services', () => {
      expect(dataService.objects).toBeDefined();
      expect(dataService.format).toBeDefined();
      expect(dataService.builtIn).toBeDefined();
      expect(dataService.validation).toBeDefined();
    });
  });

  describe('setContext', () => {
    it('should update built-in service context', () => {
      dataService.setContext({
        user: 'newuser',
        userId: 456,
      });

      expect(dataService.resolveBuiltIn('[USER]')).toBe('newuser');
    });
  });

  describe('setTimezone', () => {
    it('should update timezone on all services', () => {
      dataService.setTimezone(3600);

      expect(dataService.timezone).toBe(3600);
      expect(dataService.format.timezone).toBe(3600);
      expect(dataService.builtIn.timezone).toBe(3600);
    });
  });

  describe('delegated object operations', () => {
    it('should delegate getById', async () => {
      mockDbService.execSql.mockResolvedValue({
        rows: [{ id: 1, up: 0, ord: 1, t: 18, val: 'test' }],
      });

      const result = await dataService.getById('testdb', 1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should delegate getByType', async () => {
      mockDbService.execSql.mockResolvedValue({
        rows: [{ id: 1, up: 0, ord: 1, t: 18, val: 'test' }],
      });

      const result = await dataService.getByType('testdb', 18);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should delegate getChildren', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      const result = await dataService.getChildren('testdb', 1);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should delegate getAttribute', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      const result = await dataService.getAttribute('testdb', 1, 41);

      expect(result).toBeNull();
    });

    it('should delegate insert', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ 'MAX(ord) + 1': 1 }] });
      mockConnectionManager.execute.mockResolvedValue({ insertId: 42 });

      const result = await dataService.insert('testdb', 1, 0, 18, 'newuser');

      expect(result).toBe(42);
    });

    it('should delegate updateValue', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      const result = await dataService.updateValue('testdb', 1, 'newvalue');

      expect(result).toBe(true);
    });

    it('should delegate delete', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      const result = await dataService.delete('testdb', 1);

      expect(result).toBe(true);
    });

    it('should delegate exists', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ '1': 1 }] });

      const result = await dataService.exists('testdb', 1);

      expect(result).toBe(true);
    });
  });

  describe('format operations', () => {
    it('should format for storage with built-in resolution', async () => {
      // Mock the system time
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      const result = dataService.formatForStorage('DATE', '[TODAY]');

      expect(result).toBe('20240115');

      vi.useRealTimers();
    });

    it('should format for storage without built-ins', () => {
      const result = dataService.formatForStorage('NUMBER', '1234');

      expect(result).toBe(1234);
    });

    it('should format for display', () => {
      const result = dataService.formatForDisplay('DATE', '20240115');

      expect(result).toBe('15.01.2024');
    });
  });

  describe('validation operations', () => {
    it('should delegate checkInjection', () => {
      expect(() => {
        dataService.checkInjection('SELECT * FROM users');
      }).toThrow();
    });

    it('should delegate validateDbName', () => {
      expect(dataService.validateDbName('validdb')).toBe(true);
      expect(() => dataService.validateDbName('123invalid')).toThrow();
    });

    it('should delegate validateEmail', () => {
      expect(dataService.validateEmail('test@example.com')).toBe(true);
      expect(() => dataService.validateEmail('invalid')).toThrow();
    });

    it('should delegate validatePassword', () => {
      expect(dataService.validatePassword('strongpassword')).toBe(true);
      expect(() => dataService.validatePassword('weak')).toThrow();
    });
  });

  describe('built-in operations', () => {
    it('should resolve built-in placeholder', () => {
      const result = dataService.resolveBuiltIn('[USER]');
      expect(result).toBe('testuser');
    });

    it('should replace all built-ins in text', () => {
      const result = dataService.replaceBuiltIns('Hello [USER]!');
      expect(result).toBe('Hello testuser!');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is ok', async () => {
      mockDbService.healthCheck.mockResolvedValue(true);

      const result = await dataService.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.services.objects).toBe('available');
      expect(result.services.format).toBe('available');
      expect(result.services.validation).toBe('available');
      expect(result.services.builtIn).toBe('available');
    });

    it('should return unhealthy status when database fails', async () => {
      mockDbService.healthCheck.mockRejectedValue(new Error('Connection failed'));

      const result = await dataService.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection failed');
    });
  });
});

describe('createDataService', () => {
  it('should create a DataService instance', () => {
    const mockDbService = {
      cm: { query: vi.fn(), execute: vi.fn() },
      execSql: vi.fn(),
    };

    const service = createDataService(mockDbService);

    expect(service).toBeInstanceOf(DataService);
  });

  it('should pass options to DataService', () => {
    const mockDbService = {
      cm: { query: vi.fn(), execute: vi.fn() },
      execSql: vi.fn(),
    };

    const service = createDataService(mockDbService, {
      timezone: 3600,
      context: { user: 'testuser' },
    });

    expect(service.timezone).toBe(3600);
    expect(service.resolveBuiltIn('[USER]')).toBe('testuser');
  });
});
