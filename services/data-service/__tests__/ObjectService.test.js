/**
 * ObjectService Tests
 *
 * Tests for CRUD operations and object management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectService } from '../src/services/ObjectService.js';

describe('ObjectService', () => {
  let objectService;
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
    };

    objectService = new ObjectService(mockDbService, {
      logger: { info: vi.fn(), error: vi.fn() },
    });
  });

  describe('getById', () => {
    it('should return object when found', async () => {
      const mockRow = { id: 1, up: 0, ord: 1, t: 18, val: 'test' };
      mockDbService.execSql.mockResolvedValue({ rows: [mockRow] });

      const result = await objectService.getById('testdb', 1);

      expect(result).toEqual(mockRow);
      expect(mockDbService.execSql).toHaveBeenCalledWith(
        'SELECT id, up, ord, t, val FROM testdb WHERE id = ?',
        [1],
        'Get object by ID'
      );
    });

    it('should return null when not found', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      const result = await objectService.getById('testdb', 999);

      expect(result).toBeNull();
    });

    it('should parse string ID to integer', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      await objectService.getById('testdb', '123');

      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.any(String),
        [123],
        expect.any(String)
      );
    });
  });

  describe('getByType', () => {
    it('should return objects of specified type', async () => {
      const mockRows = [
        { id: 1, up: 0, ord: 1, t: 18, val: 'user1' },
        { id: 2, up: 0, ord: 2, t: 18, val: 'user2' },
      ];
      mockDbService.execSql.mockResolvedValue({ rows: mockRows });

      const result = await objectService.getByType('testdb', 18);

      expect(result).toEqual(mockRows);
      expect(result).toHaveLength(2);
    });

    it('should apply limit and offset', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      await objectService.getByType('testdb', 18, {
        limit: 10,
        offset: 5,
      });

      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([18, 10, 5]),
        expect.any(String)
      );
    });

    it('should apply custom ordering', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      await objectService.getByType('testdb', 18, {
        orderBy: 'val',
        orderDir: 'DESC',
      });

      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY val DESC'),
        expect.any(Array),
        expect.any(String)
      );
    });
  });

  describe('getChildren', () => {
    it('should return all children of a parent', async () => {
      const mockRows = [
        { id: 10, up: 1, ord: 1, t: 20, val: 'child1' },
        { id: 11, up: 1, ord: 2, t: 20, val: 'child2' },
      ];
      mockDbService.execSql.mockResolvedValue({ rows: mockRows });

      const result = await objectService.getChildren('testdb', 1);

      expect(result).toEqual(mockRows);
    });

    it('should filter children by type when specified', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      await objectService.getChildren('testdb', 1, 20);

      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.stringContaining('AND t = ?'),
        [1, 20],
        expect.any(String)
      );
    });
  });

  describe('getAttribute', () => {
    it('should return attribute when found', async () => {
      const mockAttr = { id: 100, up: 1, ord: 1, t: 41, val: 'test@email.com' };
      mockDbService.execSql.mockResolvedValue({ rows: [mockAttr] });

      const result = await objectService.getAttribute('testdb', 1, 41);

      expect(result).toEqual(mockAttr);
    });

    it('should return null when attribute not found', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      const result = await objectService.getAttribute('testdb', 1, 999);

      expect(result).toBeNull();
    });
  });

  describe('getAttributes', () => {
    it('should return multiple attributes as object', async () => {
      const mockRows = [
        { id: 100, up: 1, ord: 1, t: 41, val: 'test@email.com' },
        { id: 101, up: 1, ord: 2, t: 20, val: 'password_hash' },
      ];
      mockDbService.execSql.mockResolvedValue({ rows: mockRows });

      const result = await objectService.getAttributes('testdb', 1, [41, 20]);

      expect(result[41]).toEqual(mockRows[0]);
      expect(result[20]).toEqual(mockRows[1]);
    });
  });

  describe('insert', () => {
    it('should insert and return new ID', async () => {
      // Since ord is 0, it will auto-calculate, so we need to mock the getNextOrder call
      mockDbService.execSql.mockResolvedValue({ rows: [{ 'MAX(ord) + 1': 1 }] });
      mockConnectionManager.execute.mockResolvedValue({ insertId: 42 });

      const result = await objectService.insert('testdb', 1, 0, 18, 'newuser');

      expect(result).toBe(42);
    });

    it('should auto-calculate order when ord is 0', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ 'MAX(ord) + 1': 5 }] });
      mockConnectionManager.execute.mockResolvedValue({ insertId: 42 });

      await objectService.insert('testdb', 1, 0, 18, 'newuser');

      expect(mockConnectionManager.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([1, 5, 18, 'newuser']),
        expect.any(String)
      );
    });
  });

  describe('insertBatch', () => {
    it('should insert multiple objects', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 3 });

      const objects = [
        { up: 1, ord: 1, t: 18, val: 'user1' },
        { up: 1, ord: 2, t: 18, val: 'user2' },
        { up: 1, ord: 3, t: 18, val: 'user3' },
      ];

      const result = await objectService.insertBatch('testdb', objects);

      expect(result).toBe(3);
    });

    it('should return 0 for empty array', async () => {
      const result = await objectService.insertBatch('testdb', []);

      expect(result).toBe(0);
      expect(mockConnectionManager.execute).not.toHaveBeenCalled();
    });
  });

  describe('updateValue', () => {
    it('should update value and return true', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      const result = await objectService.updateValue('testdb', 1, 'newvalue');

      expect(result).toBe(true);
    });

    it('should return false when no rows affected', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 0 });

      const result = await objectService.updateValue('testdb', 999, 'newvalue');

      expect(result).toBe(false);
    });
  });

  describe('updateType', () => {
    it('should update type and return true', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      const result = await objectService.updateType('testdb', 1, 20);

      expect(result).toBe(true);
    });
  });

  describe('updateOrder', () => {
    it('should update order', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      const result = await objectService.updateOrder('testdb', 1, 5);

      expect(result).toBe(true);
      expect(mockConnectionManager.execute).toHaveBeenCalledWith(
        'UPDATE testdb SET ord = ? WHERE id = ?',
        [5, 1],
        'Update order'
      );
    });
  });

  describe('upsertAttribute', () => {
    it('should update existing attribute', async () => {
      const existingAttr = { id: 100, up: 1, ord: 1, t: 41, val: 'old@email.com' };
      mockDbService.execSql.mockResolvedValue({ rows: [existingAttr] });
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      const result = await objectService.upsertAttribute('testdb', 1, 41, 'new@email.com');

      expect(result).toBe(100);
    });

    it('should insert new attribute when not exists', async () => {
      mockDbService.execSql
        .mockResolvedValueOnce({ rows: [] }) // getAttribute returns null
        .mockResolvedValueOnce({ rows: [{ 'MAX(ord) + 1': 1 }] }); // getNextOrder
      mockConnectionManager.execute.mockResolvedValue({ insertId: 200 });

      const result = await objectService.upsertAttribute('testdb', 1, 41, 'new@email.com');

      expect(result).toBe(200);
    });
  });

  describe('delete', () => {
    it('should delete object and children', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      const result = await objectService.delete('testdb', 1);

      expect(result).toBe(true);
    });

    it('should skip children deletion when deleteChildren is false', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 1 });

      await objectService.delete('testdb', 1, false);

      // Should only call execute once (for the main delete)
      expect(mockConnectionManager.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteRecursive', () => {
    it('should delete children recursively', async () => {
      // First call returns children, second returns no children
      mockDbService.execSql
        .mockResolvedValueOnce({ rows: [{ id: 10 }, { id: 11 }] })
        .mockResolvedValueOnce({ rows: [] }) // Children of 10
        .mockResolvedValueOnce({ rows: [] }); // Children of 11

      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 2 });

      await objectService.deleteRecursive('testdb', 1);

      expect(mockConnectionManager.execute).toHaveBeenCalled();
    });
  });

  describe('batchDelete', () => {
    it('should delete multiple objects by ID', async () => {
      mockConnectionManager.execute.mockResolvedValue({ affectedRows: 3 });

      const result = await objectService.batchDelete('testdb', [1, 2, 3]);

      expect(result).toBe(3);
      expect(mockConnectionManager.execute).toHaveBeenCalledWith(
        'DELETE FROM testdb WHERE id IN (?,?,?)',
        [1, 2, 3],
        'Batch delete'
      );
    });

    it('should return 0 for empty array', async () => {
      const result = await objectService.batchDelete('testdb', []);

      expect(result).toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true when object exists', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ '1': 1 }] });

      const result = await objectService.exists('testdb', 1);

      expect(result).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      const result = await objectService.exists('testdb', 999);

      expect(result).toBe(false);
    });
  });

  describe('getNextOrder', () => {
    it('should return next order value', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ 'MAX(ord) + 1': 5 }] });

      const result = await objectService.getNextOrder('testdb', 1);

      expect(result).toBe(5);
    });

    it('should return 1 when no existing orders', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ 'MAX(ord) + 1': null }] });

      const result = await objectService.getNextOrder('testdb', 1);

      expect(result).toBe(1);
    });

    it('should filter by type when specified', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ 'MAX(ord) + 1': 3 }] });

      await objectService.getNextOrder('testdb', 1, 18);

      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.stringContaining('AND t = ?'),
        [1, 18],
        expect.any(String)
      );
    });
  });

  describe('countByType', () => {
    it('should return count of objects by type', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ count: 42 }] });

      const result = await objectService.countByType('testdb', 18);

      expect(result).toBe(42);
    });
  });

  describe('countChildren', () => {
    it('should return count of children', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ count: 5 }] });

      const result = await objectService.countChildren('testdb', 1);

      expect(result).toBe(5);
    });

    it('should filter by type when specified', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [{ count: 3 }] });

      const result = await objectService.countChildren('testdb', 1, 20);

      expect(result).toBe(3);
    });
  });

  describe('search', () => {
    it('should search objects by value with LIKE', async () => {
      mockDbService.execSql.mockResolvedValue({
        rows: [{ id: 1, up: 0, ord: 1, t: 18, val: 'testuser' }],
      });

      const result = await objectService.search('testdb', 'test');

      expect(result).toHaveLength(1);
      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.stringContaining('val LIKE ?'),
        ['%test%', 100],
        'Search objects'
      );
    });

    it('should use exact match when specified', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      await objectService.search('testdb', 'exact', { exact: true });

      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.stringContaining('val = ?'),
        ['exact', 100],
        'Search objects'
      );
    });

    it('should filter by type when specified', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      await objectService.search('testdb', 'test', { type: 18 });

      expect(mockDbService.execSql).toHaveBeenCalledWith(
        expect.stringContaining('AND t = ?'),
        expect.any(Array),
        'Search objects'
      );
    });
  });

  describe('getWithPath', () => {
    it('should return object with path to root', async () => {
      const obj = { id: 100, up: 10, ord: 1, t: 20, val: 'child' };
      const parent = { id: 10, up: 1, ord: 1, t: 18, val: 'parent' };
      const root = { id: 1, up: 0, ord: 1, t: 18, val: 'root' };

      mockDbService.execSql
        .mockResolvedValueOnce({ rows: [obj] })
        .mockResolvedValueOnce({ rows: [parent] })
        .mockResolvedValueOnce({ rows: [root] })
        .mockResolvedValueOnce({ rows: [] }); // No parent for root

      const result = await objectService.getWithPath('testdb', 100);

      expect(result.path).toHaveLength(3);
      expect(result.path[0].id).toBe(1);
      expect(result.path[1].id).toBe(10);
      expect(result.path[2].id).toBe(100);
      expect(result.depth).toBe(2);
    });

    it('should return null when object not found', async () => {
      mockDbService.execSql.mockResolvedValue({ rows: [] });

      const result = await objectService.getWithPath('testdb', 999);

      expect(result).toBeNull();
    });
  });
});
