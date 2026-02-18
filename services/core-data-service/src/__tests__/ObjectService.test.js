/**
 * Unit tests for ObjectService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectService } from '../services/ObjectService.js';
import { ValidationService } from '../services/ValidationService.js';

describe('ObjectService', () => {
  let service;
  let mockDb;

  beforeEach(() => {
    // Create mock database service
    mockDb = {
      insert: vi.fn().mockResolvedValue(1001),
      updateVal: vi.fn().mockResolvedValue(true),
      updateType: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      batchDelete: vi.fn().mockResolvedValue(5),
      isOccupied: vi.fn().mockResolvedValue(true),
      getNextOrder: vi.fn().mockResolvedValue(10),
      execSql: vi.fn().mockResolvedValue({ rows: [], affectedRows: 1 }),
      query: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        whereId: vi.fn().mockReturnThis(),
        whereType: vi.fn().mockReturnThis(),
        whereParent: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        buildSelect: vi.fn().mockReturnValue({ sql: 'SELECT *', params: [] }),
      }),
      executeQuery: vi.fn().mockResolvedValue({ rows: [] }),
    };

    service = new ObjectService(mockDb, {
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
  });

  describe('create', () => {
    it('should create an object with minimal data', async () => {
      const result = await service.create('testdb', {
        value: 'Test Object',
        typeId: 18,
      });

      expect(result.id).toBe(1001);
      expect(result.value).toBe('Test Object');
      expect(result.typeId).toBe(18);
      expect(result.parentId).toBe(0);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should create an object with parent', async () => {
      const result = await service.create('testdb', {
        value: 'Child Object',
        typeId: 18,
        parentId: 100,
      });

      expect(result.parentId).toBe(100);
      expect(mockDb.insert).toHaveBeenCalledWith(
        'testdb',
        100,
        expect.any(Number),
        18,
        'Child Object',
        expect.any(String)
      );
    });

    it('should use provided order', async () => {
      const result = await service.create('testdb', {
        value: 'Test',
        typeId: 18,
        order: 5,
      });

      expect(result.order).toBe(5);
    });

    it('should auto-calculate order if not provided', async () => {
      mockDb.getNextOrder.mockResolvedValue(25);

      const result = await service.create('testdb', {
        value: 'Test',
        typeId: 18,
      });

      expect(result.order).toBe(25);
      expect(mockDb.getNextOrder).toHaveBeenCalled();
    });

    it('should reject missing type ID', async () => {
      await expect(service.create('testdb', {
        value: 'Test',
      })).rejects.toThrow('Invalid type ID');
    });

    it('should reject empty value', async () => {
      await expect(service.create('testdb', {
        value: '',
        typeId: 18,
      })).rejects.toThrow('Value cannot be empty');
    });
  });

  describe('createBatch', () => {
    it('should create multiple objects', async () => {
      mockDb.insert
        .mockResolvedValueOnce(1001)
        .mockResolvedValueOnce(1002)
        .mockResolvedValueOnce(1003);

      const objects = [
        { value: 'Object 1' },
        { value: 'Object 2' },
        { value: 'Object 3' },
      ];

      const ids = await service.createBatch('testdb', objects, { typeId: 18 });

      expect(ids).toEqual([1001, 1002, 1003]);
      expect(mockDb.insert).toHaveBeenCalledTimes(3);
    });

    it('should use common parent and type', async () => {
      mockDb.insert.mockResolvedValue(1001);

      await service.createBatch(
        'testdb',
        [{ value: 'Test' }],
        { typeId: 18, parentId: 100 }
      );

      expect(mockDb.insert).toHaveBeenCalledWith(
        'testdb',
        100,
        expect.any(Number),
        18,
        'Test',
        expect.any(String)
      );
    });
  });

  describe('getById', () => {
    it('should return object when found', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 1001, val: 'Test', up: 0, t: 18, ord: 1 }],
      });

      const result = await service.getById('testdb', 1001);

      expect(result).toEqual({
        id: 1001,
        value: 'Test',
        parentId: 0,
        typeId: 18,
        order: 1,
      });
    });

    it('should return null when not found', async () => {
      mockDb.executeQuery.mockResolvedValue({ rows: [] });

      const result = await service.getById('testdb', 9999);

      expect(result).toBeNull();
    });

    it('should include requisites when requested', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1001, val: 'Test', up: 0, t: 18, ord: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 2001, val: 'req1', t: 20 },
            { id: 2002, val: 'req2', t: 30 },
          ],
        });

      const result = await service.getById('testdb', 1001, { includeRequisites: true });

      expect(result.requisites).toBeDefined();
    });
  });

  describe('getByIds', () => {
    it('should return multiple objects', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [
          { id: 1001, val: 'Object 1', up: 0, t: 18, ord: 1 },
          { id: 1002, val: 'Object 2', up: 0, t: 18, ord: 2 },
        ],
      });

      const results = await service.getByIds('testdb', [1001, 1002]);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(1001);
      expect(results[1].id).toBe(1002);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.getByIds('testdb', []);
      expect(results).toEqual([]);
    });
  });

  describe('getByType', () => {
    it('should query objects by type', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [
          { id: 1001, val: 'User 1', up: 0, t: 18, ord: 1 },
          { id: 1002, val: 'User 2', up: 0, t: 18, ord: 2 },
        ],
      });

      const results = await service.getByType('testdb', 18);

      expect(results).toHaveLength(2);
      expect(results[0].typeId).toBe(18);
    });

    it('should apply parent filter', async () => {
      await service.getByType('testdb', 18, { parentId: 100 });

      const queryMock = mockDb.query();
      expect(queryMock.whereParent).toHaveBeenCalled();
    });

    it('should apply limit and offset', async () => {
      await service.getByType('testdb', 18, { limit: 10, offset: 20 });

      const queryMock = mockDb.query();
      expect(queryMock.limit).toHaveBeenCalledWith(10);
      expect(queryMock.offset).toHaveBeenCalledWith(20);
    });
  });

  describe('getChildren', () => {
    it('should return children of object', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [
          { id: 2001, val: 'Child 1', up: 1001, t: 18, ord: 1 },
          { id: 2002, val: 'Child 2', up: 1001, t: 18, ord: 2 },
        ],
      });

      const children = await service.getChildren('testdb', 1001);

      expect(children).toHaveLength(2);
      expect(children[0].parentId).toBe(1001);
    });
  });

  describe('countByType', () => {
    it('should return count', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ count: 42 }],
      });

      const count = await service.countByType('testdb', 18);

      expect(count).toBe(42);
    });
  });

  describe('updateValue', () => {
    it('should update object value', async () => {
      mockDb.updateVal.mockResolvedValue(true);

      const result = await service.updateValue('testdb', 1001, 'New Value');

      expect(result).toBe(true);
      expect(mockDb.updateVal).toHaveBeenCalledWith('testdb', 1001, 'New Value', expect.any(String));
    });

    it('should throw when object not found', async () => {
      mockDb.updateVal.mockResolvedValue(false);

      await expect(service.updateValue('testdb', 9999, 'Value')).rejects.toThrow('not found');
    });
  });

  describe('updateType', () => {
    it('should update object type', async () => {
      mockDb.updateType.mockResolvedValue(true);

      const result = await service.updateType('testdb', 1001, 42);

      expect(result).toBe(true);
      expect(mockDb.updateType).toHaveBeenCalledWith('testdb', 1001, 42, expect.any(String));
    });
  });

  describe('update', () => {
    it('should update multiple fields', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 1001, val: 'Original', up: 0, t: 18, ord: 1 }],
      });
      mockDb.updateVal.mockResolvedValue(true);
      mockDb.updateType.mockResolvedValue(true);

      const result = await service.update('testdb', 1001, {
        value: 'Updated',
        typeId: 42,
      });

      expect(mockDb.updateVal).toHaveBeenCalled();
      expect(mockDb.updateType).toHaveBeenCalled();
    });

    it('should throw when object not found', async () => {
      mockDb.executeQuery.mockResolvedValue({ rows: [] });

      await expect(service.update('testdb', 9999, { value: 'Test' })).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('should delete an object', async () => {
      mockDb.delete.mockResolvedValue(true);

      const result = await service.delete('testdb', 1001);

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalledWith('testdb', 1001, expect.any(String));
    });

    it('should cascade delete children', async () => {
      // First call to getChildren returns one child
      // Subsequent calls (for child's children) return empty array to prevent infinite recursion
      mockDb.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 2001, val: 'Child', up: 1001, t: 18, ord: 1 },
          ],
        })
        .mockResolvedValue({ rows: [] }); // No grandchildren
      mockDb.delete.mockResolvedValue(true);

      await service.delete('testdb', 1001, { cascade: true });

      // Should delete child first, then parent
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteChildren', () => {
    it('should delete all children', async () => {
      mockDb.batchDelete.mockResolvedValue(5);

      const count = await service.deleteChildren('testdb', 1001);

      expect(count).toBe(5);
      expect(mockDb.batchDelete).toHaveBeenCalledWith('testdb', 1001, expect.any(String));
    });
  });

  describe('deleteByIds', () => {
    it('should delete multiple objects', async () => {
      mockDb.execSql.mockResolvedValue({ affectedRows: 3 });

      const count = await service.deleteByIds('testdb', [1001, 1002, 1003]);

      expect(count).toBe(3);
    });

    it('should return 0 for empty array', async () => {
      const count = await service.deleteByIds('testdb', []);
      expect(count).toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true when object exists', async () => {
      mockDb.isOccupied.mockResolvedValue(true);

      const exists = await service.exists('testdb', 1001);

      expect(exists).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      mockDb.isOccupied.mockResolvedValue(false);

      const exists = await service.exists('testdb', 9999);

      expect(exists).toBe(false);
    });
  });

  describe('mapRowToObject', () => {
    it('should map database row to object structure', () => {
      const row = { id: 1001, val: 'Test', up: 100, t: 18, ord: 5 };
      const result = service.mapRowToObject(row);

      expect(result).toEqual({
        id: 1001,
        value: 'Test',
        parentId: 100,
        typeId: 18,
        order: 5,
      });
    });
  });

  describe('setId', () => {
    it('should change object ID and update references', async () => {
      // Mock: no existing object with new ID
      mockDb.execSql.mockResolvedValue({ rows: [], affectedRows: 1 });

      const result = await service.setId('testdb', 1001, 2001);

      expect(result).toBe(true);
      // Should have executed 4 SQL commands: check + 3 updates
      expect(mockDb.execSql).toHaveBeenCalledTimes(4);
    });

    it('should reject if new ID is already occupied', async () => {
      // Mock: existing object with the new ID
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 2001, up: 100 }],
        affectedRows: 0,
      });

      await expect(service.setId('testdb', 1001, 2001)).rejects.toThrow('already occupied');
    });

    it('should reject if object is metadata (up=0)', async () => {
      // Mock: the object being changed is metadata
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 1001, up: 0 }],
        affectedRows: 0,
      });

      await expect(service.setId('testdb', 1001, 2001)).rejects.toThrow('metadata');
    });

    it('should update parent references (up field)', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [], affectedRows: 1 });

      await service.setId('testdb', 1001, 2001);

      // Check that UPDATE for up field was called
      expect(mockDb.execSql).toHaveBeenCalledWith(
        expect.stringContaining('SET up = ?'),
        [2001, 1001],
        expect.any(String)
      );
    });

    it('should update type references (t field)', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [], affectedRows: 1 });

      await service.setId('testdb', 1001, 2001);

      // Check that UPDATE for t field was called
      expect(mockDb.execSql).toHaveBeenCalledWith(
        expect.stringContaining('SET t = ?'),
        [2001, 1001],
        expect.any(String)
      );
    });

    it('should validate invalid new ID (negative)', async () => {
      // -5 is invalid because validation rejects negative numbers
      await expect(service.setId('testdb', 1001, -5)).rejects.toThrow();
    });

    it('should validate invalid new ID (NaN)', async () => {
      // NaN should throw validation error
      await expect(service.setId('testdb', 1001, NaN)).rejects.toThrow();
    });
  });
});
