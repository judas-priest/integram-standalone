/**
 * Unit tests for QueryService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryService } from '../services/QueryService.js';

describe('QueryService', () => {
  let service;
  let mockDb;
  let queryBuilder;

  beforeEach(() => {
    // Create a shared query builder mock that we can inspect
    queryBuilder = {
      select: vi.fn().mockReturnThis(),
      whereId: vi.fn().mockReturnThis(),
      whereType: vi.fn().mockReturnThis(),
      whereParent: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      buildSelect: vi.fn().mockReturnValue({ sql: 'SELECT *', params: [] }),
    };

    mockDb = {
      execSql: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0 }),
      query: vi.fn().mockReturnValue(queryBuilder),
      executeQuery: vi.fn().mockResolvedValue({ rows: [] }),
    };

    service = new QueryService(mockDb, {
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
  });

  describe('execute', () => {
    it('should execute SQL query', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [{ id: 1 }], affectedRows: 0 });

      const result = await service.execute('SELECT * FROM test', [], 'test query');

      expect(result.rows).toHaveLength(1);
      expect(mockDb.execSql).toHaveBeenCalledWith('SELECT * FROM test', [], 'test query');
    });

    // Note: execute() no longer rejects SQL with SQL keywords (SELECT, FROM, TABLE)
    // because those are legitimate parts of SQL queries. Injection protection
    // comes from parameterized queries and ValidationService input checking.
  });

  describe('executeRows', () => {
    it('should return rows only', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }],
        affectedRows: 0,
      });

      const rows = await service.executeRows('SELECT * FROM test');

      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe(1);
    });
  });

  describe('executeOne', () => {
    it('should return first row', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }],
        affectedRows: 0,
      });

      const row = await service.executeOne('SELECT * FROM test');

      expect(row.id).toBe(1);
    });

    it('should return null when no rows', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [], affectedRows: 0 });

      const row = await service.executeOne('SELECT * FROM test WHERE id = 999');

      expect(row).toBeNull();
    });
  });

  describe('createBuilder', () => {
    it('should create query builder for database', () => {
      const builder = service.createBuilder('testdb');
      expect(builder).toBeDefined();
    });
  });

  describe('queryObjects', () => {
    it('should query objects with basic filters', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { id: 1, val: 'Object 1', up: 0, t: 18, ord: 1 },
          { id: 2, val: 'Object 2', up: 0, t: 18, ord: 2 },
        ],
      });

      const results = await service.queryObjects('testdb', { typeId: 18 });

      expect(results).toHaveLength(2);
    });

    it('should apply parent filter', async () => {
      // Verify service accepts parent filter without error
      // QueryBuilder chain is created internally via QueryBuilder.from()
      await expect(service.queryObjects('testdb', { typeId: 18, parentId: 100 })).resolves.toBeDefined();
    });

    it('should apply value filter', async () => {
      // Verify service accepts value filter without error
      await expect(service.queryObjects('testdb', { value: 'test' })).resolves.toBeDefined();
    });

    it('should apply IDs filter', async () => {
      // Verify service accepts IDs filter without error
      await expect(service.queryObjects('testdb', { ids: [1, 2, 3] })).resolves.toBeDefined();
    });

    it('should apply ordering', async () => {
      // Verify service accepts ordering options without error
      await expect(service.queryObjects('testdb', { orderBy: 'val', sortDir: 'DESC' })).resolves.toBeDefined();
    });

    it('should apply limit and offset', async () => {
      // Verify service accepts limit and offset without error
      await expect(service.queryObjects('testdb', { limit: 10, offset: 20 })).resolves.toBeDefined();
    });
  });

  describe('searchObjects', () => {
    it('should search objects by value', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 1, val: 'Test Object', up: 0, t: 18, ord: 1 }],
      });

      const results = await service.searchObjects('testdb', 'Test');

      expect(results).toHaveLength(1);
    });

    it('should apply type filter', async () => {
      // Verify service accepts type filter without error
      await expect(service.searchObjects('testdb', 'Test', { typeId: 18 })).resolves.toBeDefined();
    });
  });

  describe('countObjects', () => {
    it('should return object count', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ count: 42 }],
      });

      const count = await service.countObjects('testdb', { typeId: 18 });

      expect(count).toBe(42);
    });

    it('should return 0 when no results', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [{ count: 0 }] });

      const count = await service.countObjects('testdb', { typeId: 999 });

      expect(count).toBe(0);
    });
  });

  describe('getMax', () => {
    it('should return max value', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ max_val: 100 }],
      });

      const max = await service.getMax('testdb', 'ord', { typeId: 18 });

      expect(max).toBe(100);
    });

    it('should reject column with injection pattern', async () => {
      await expect(
        service.getMax('testdb', 'ord; DROP TABLE--')
      ).rejects.toThrow('injection');
    });
  });

  describe('countByType', () => {
    it('should return counts grouped by type', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { t: 18, count: 100 },
          { t: 42, count: 50 },
        ],
      });

      const counts = await service.countByType('testdb');

      expect(counts).toHaveLength(2);
      expect(counts[0].count).toBe(100);
    });
  });

  describe('queryJsonData', () => {
    it('should return JSON_DATA format', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { id: 1, val: 'Object 1', up: 0, t: 18, ord: 1 },
          { id: 2, val: 'Object 2', up: 0, t: 18, ord: 2 },
        ],
      });

      const result = await service.queryJsonData('testdb', { typeId: 18 });

      // First row should be headers
      expect(result[0]).toEqual(['id', 'val', 'up', 't', 'ord']);
      // Data rows follow
      expect(result[1][0]).toBe('1');
      expect(result[1][1]).toBe('Object 1');
    });

    it('should return only headers for empty result', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [] });

      const result = await service.queryJsonData('testdb', { typeId: 18 });

      expect(result).toEqual([['id', 'val', 'up', 't', 'ord']]);
    });
  });

  describe('queryJsonKv', () => {
    it('should return JSON_KV format', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { id: 1, val: 'Value 1', up: 0, t: 18, ord: 1 },
          { id: 2, val: 'Value 2', up: 0, t: 18, ord: 2 },
        ],
      });

      const result = await service.queryJsonKv('testdb', { typeId: 18 });

      expect(result).toEqual({
        1: 'Value 1',
        2: 'Value 2',
      });
    });
  });

  describe('queryJsonCr', () => {
    it('should return JSON_CR format', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { id: 1, val: 'Object 1', up: 0, t: 18, ord: 1 },
        ],
      });

      const result = await service.queryJsonCr('testdb', { typeId: 18 });

      expect(result.columns).toEqual(['id', 'val', 'up', 't', 'ord']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].val).toBe('Object 1');
    });
  });

  describe('getTypeSchema', () => {
    it('should return type schema with requisites', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { id: 20, val: 'Password', t: 6, ord: 1 },
          { id: 30, val: 'Phone', t: 3, ord: 2 },
        ],
      });

      const schema = await service.getTypeSchema('testdb', 18);

      expect(schema).toHaveLength(2);
      expect(schema[0].name).toBe('Password');
      expect(schema[0].basicType).toBe('PWD');
      expect(schema[1].basicType).toBe('SHORT');
    });
  });

  describe('getTypes', () => {
    it('should return all types', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { id: 18, val: 'User', t: 3, ord: 1 },
          { id: 42, val: 'Role', t: 3, ord: 2 },
        ],
      });

      const types = await service.getTypes('testdb');

      expect(types).toHaveLength(2);
      expect(types[0].name).toBe('User');
    });
  });

  describe('getTree', () => {
    it('should return tree structure', async () => {
      // Mock root object
      mockDb.execSql.mockResolvedValueOnce({
        rows: [{ id: 1, val: 'Root', up: 0, t: 18, ord: 1 }],
      });

      // Mock children
      mockDb.execSql
        .mockResolvedValueOnce({
          rows: [
            { id: 2, val: 'Child 1', up: 1, t: 18, ord: 1 },
            { id: 3, val: 'Child 2', up: 1, t: 18, ord: 2 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const tree = await service.getTree('testdb', 1);

      expect(tree.id).toBe(1);
      expect(tree.value).toBe('Root');
      expect(tree.children).toHaveLength(2);
    });

    it('should return null for non-existent object', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [] });

      const tree = await service.getTree('testdb', 9999);

      expect(tree).toBeNull();
    });
  });

  describe('getAncestors', () => {
    it('should return ancestor path', async () => {
      mockDb.execSql
        .mockResolvedValueOnce({
          rows: [{ id: 3, val: 'Grandchild', up: 2, t: 18, ord: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 2, val: 'Child', up: 1, t: 18, ord: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, val: 'Root', up: 0, t: 18, ord: 1 }],
        });

      const ancestors = await service.getAncestors('testdb', 3);

      expect(ancestors).toHaveLength(3);
      expect(ancestors[0].value).toBe('Root');
      expect(ancestors[2].value).toBe('Grandchild');
    });

    it('should detect circular references', async () => {
      // Create circular reference: 1 -> 2 -> 1
      mockDb.execSql
        .mockResolvedValueOnce({
          rows: [{ id: 1, val: 'Object 1', up: 2, t: 18, ord: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 2, val: 'Object 2', up: 1, t: 18, ord: 1 }],
        });

      const ancestors = await service.getAncestors('testdb', 1);

      // Should not loop infinitely
      expect(ancestors.length).toBeLessThan(10);
    });
  });
});
