/**
 * Unit tests for TypeService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TypeService } from '../services/TypeService.js';

describe('TypeService', () => {
  let service;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      insert: vi.fn().mockResolvedValue(1001),
      updateVal: vi.fn().mockResolvedValue(true),
      updateType: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      batchDelete: vi.fn().mockResolvedValue(5),
      getNextOrder: vi.fn().mockResolvedValue(10),
      execSql: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0 }),
      query: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        whereId: vi.fn().mockReturnThis(),
        whereType: vi.fn().mockReturnThis(),
        whereParent: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        buildSelect: vi.fn().mockReturnValue({ sql: 'SELECT *', params: [] }),
      }),
      executeQuery: vi.fn().mockResolvedValue({ rows: [] }),
    };

    service = new TypeService(mockDb, {
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
  });

  describe('getType', () => {
    it('should return type when found', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 18, val: 'User', up: 0, t: 3, ord: 1 }],
      });

      const type = await service.getType('testdb', 18);

      expect(type).toEqual({
        id: 18,
        name: 'User',
        parentId: 0,
        baseType: 3,
        order: 1,
      });
    });

    it('should return null when not found', async () => {
      mockDb.executeQuery.mockResolvedValue({ rows: [] });

      const type = await service.getType('testdb', 9999);

      expect(type).toBeNull();
    });
  });

  describe('getAllTypes', () => {
    it('should return all types', async () => {
      // Use IDs >= 50 since system types (id < 50) are filtered by default
      mockDb.executeQuery.mockResolvedValue({
        rows: [
          { id: 100, val: 'User', up: 0, t: 3, ord: 1 },
          { id: 101, val: 'Role', up: 0, t: 3, ord: 2 },
        ],
      });

      const types = await service.getAllTypes('testdb');

      expect(types).toHaveLength(2);
      expect(types[0].name).toBe('User');
      expect(types[0].isBasic).toBe(true);
      expect(types[0].basicTypeName).toBe('SHORT');
    });

    it('should filter system types by default', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [
          { id: 3, val: 'SHORT', up: 0, t: 3, ord: 1 }, // System type
          { id: 100, val: 'Custom', up: 0, t: 3, ord: 2 },
        ],
      });

      const types = await service.getAllTypes('testdb', { includeSystem: false });

      // Should only include non-system types
      expect(types.some(t => t.id < 50)).toBe(false);
    });

    it('should include system types when requested', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [
          { id: 3, val: 'SHORT', up: 0, t: 3, ord: 1 },
          { id: 18, val: 'User', up: 0, t: 3, ord: 2 },
        ],
      });

      const types = await service.getAllTypes('testdb', { includeSystem: true });

      expect(types).toHaveLength(2);
    });
  });

  describe('createType', () => {
    it('should create a new type', async () => {
      mockDb.insert.mockResolvedValue(1001);

      const type = await service.createType('testdb', {
        name: 'NewType',
        baseType: 3,
      });

      expect(type.id).toBe(1001);
      expect(type.name).toBe('NewType');
      expect(type.parentId).toBe(0);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should use default base type (SHORT)', async () => {
      mockDb.insert.mockResolvedValue(1001);

      await service.createType('testdb', { name: 'NewType' });

      expect(mockDb.insert).toHaveBeenCalledWith(
        'testdb',
        0,
        expect.any(Number),
        3, // SHORT = 3
        'NewType',
        expect.any(String)
      );
    });

    it('should create requisites if provided', async () => {
      mockDb.insert
        .mockResolvedValueOnce(1001) // Type
        .mockResolvedValueOnce(2001) // Requisite 1
        .mockResolvedValueOnce(2002); // Requisite 2

      await service.createType('testdb', {
        name: 'NewType',
        requisites: [
          { name: 'Field 1', type: 'SHORT' },
          { name: 'Field 2', type: 'NUMBER' },
        ],
      });

      expect(mockDb.insert).toHaveBeenCalledTimes(3);
    });
  });

  describe('updateType', () => {
    it('should update type name', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 18, val: 'OldName', up: 0, t: 3, ord: 1 }],
      });

      await service.updateType('testdb', 18, { name: 'NewName' });

      expect(mockDb.updateVal).toHaveBeenCalledWith('testdb', 18, 'NewName', expect.any(String));
    });

    it('should update base type', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 18, val: 'Type', up: 0, t: 3, ord: 1 }],
      });

      await service.updateType('testdb', 18, { baseType: 13 });

      expect(mockDb.updateType).toHaveBeenCalledWith('testdb', 18, 13, expect.any(String));
    });

    it('should throw when type not found', async () => {
      mockDb.executeQuery.mockResolvedValue({ rows: [] });

      await expect(service.updateType('testdb', 9999, { name: 'Test' })).rejects.toThrow('not found');
    });
  });

  describe('deleteType', () => {
    it('should delete type', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 18, val: 'Type', up: 0, t: 3, ord: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // No objects using type

      await service.deleteType('testdb', 18);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw when type is in use', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 18, val: 'Type', up: 0, t: 3, ord: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] }); // 10 objects using type

      await expect(service.deleteType('testdb', 18)).rejects.toThrow('in use');
    });

    it('should cascade delete when requested', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 18, val: 'Type', up: 0, t: 3, ord: 1 }],
      });

      await service.deleteType('testdb', 18, { cascade: true });

      expect(mockDb.execSql).toHaveBeenCalled(); // CASCADE delete
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('getRequisites', () => {
    it('should return parsed requisites', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [
          { id: 20, val: ':!NULL:Password', t: 6, ord: 1, up: 18 },
          { id: 30, val: ':ALIAS=Tel:Phone', t: 3, ord: 2, up: 18 },
          { id: 40, val: ':MULTI:Tags', t: 3, ord: 3, up: 18 },
        ],
      });

      const requisites = await service.getRequisites('testdb', 18);

      expect(requisites).toHaveLength(3);
      expect(requisites[0].name).toBe('Password');
      expect(requisites[0].required).toBe(true);
      expect(requisites[1].alias).toBe('Tel');
      expect(requisites[1].name).toBe('Phone');
      expect(requisites[2].multi).toBe(true);
    });

    it('should use cache on subsequent calls', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 20, val: 'Field', t: 3, ord: 1, up: 18 }],
      });

      await service.getRequisites('testdb', 18);
      await service.getRequisites('testdb', 18);

      // Should only query once due to caching
      expect(mockDb.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache when requested', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 20, val: 'Field', t: 3, ord: 1, up: 18 }],
      });

      await service.getRequisites('testdb', 18);
      await service.getRequisites('testdb', 18, { useCache: false });

      expect(mockDb.executeQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('addRequisites', () => {
    it('should add requisites to type', async () => {
      mockDb.insert
        .mockResolvedValueOnce(2001)
        .mockResolvedValueOnce(2002);

      const ids = await service.addRequisites('testdb', 18, [
        { name: 'Field 1', type: 'SHORT' },
        { name: 'Field 2', type: 'NUMBER', required: true },
      ]);

      expect(ids).toEqual([2001, 2002]);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('should include modifiers in value', async () => {
      mockDb.insert.mockResolvedValue(2001);

      await service.addRequisites('testdb', 18, [
        { name: 'Field', alias: 'Alias', required: true, multi: true },
      ]);

      // Value should include modifiers
      expect(mockDb.insert).toHaveBeenCalledWith(
        'testdb',
        18,
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining(':MULTI:'),
        expect.any(String)
      );
    });
  });

  describe('updateRequisite', () => {
    it('should update requisite', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 20, val: 'OldName', up: 18, t: 3, ord: 1 }],
      });

      await service.updateRequisite('testdb', 20, { name: 'NewName' });

      expect(mockDb.updateVal).toHaveBeenCalled();
    });

    it('should preserve existing modifiers', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 20, val: ':!NULL::ALIAS=A:Name', up: 18, t: 3, ord: 1 }],
      });

      await service.updateRequisite('testdb', 20, { name: 'NewName' });

      // Should preserve :!NULL: and :ALIAS=A:
      expect(mockDb.updateVal).toHaveBeenCalledWith(
        'testdb',
        20,
        expect.stringContaining(':!NULL:'),
        expect.any(String)
      );
    });
  });

  describe('deleteRequisite', () => {
    it('should delete requisite', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ up: 18 }],
      });

      await service.deleteRequisite('testdb', 20);

      expect(mockDb.delete).toHaveBeenCalledWith('testdb', 20, expect.any(String));
    });

    it('should throw when not found', async () => {
      mockDb.executeQuery.mockResolvedValue({ rows: [] });

      await expect(service.deleteRequisite('testdb', 9999)).rejects.toThrow('not found');
    });
  });

  describe('getSchema', () => {
    it('should return full schema', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: 18, val: 'User', up: 0, t: 3, ord: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 20, val: 'Password', t: 6, ord: 1, up: 18 },
            { id: 30, val: 'Email', t: 3, ord: 2, up: 18 },
          ],
        });

      const schema = await service.getSchema('testdb', 18);

      expect(schema.id).toBe(18);
      expect(schema.name).toBe('User');
      expect(schema.requisites).toHaveLength(2);
    });

    it('should throw when type not found', async () => {
      mockDb.executeQuery.mockResolvedValue({ rows: [] });

      await expect(service.getSchema('testdb', 9999)).rejects.toThrow('not found');
    });
  });

  describe('cloneType', () => {
    it('should clone type with requisites', async () => {
      // Mock getSchema
      mockDb.executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: 18, val: 'Original', up: 0, t: 3, ord: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 20, val: 'Field', t: 3, ord: 1, up: 18 }],
        });

      // Mock createType
      mockDb.insert
        .mockResolvedValueOnce(1001) // New type
        .mockResolvedValueOnce(2001); // New requisite

      const cloned = await service.cloneType('testdb', 18, 'ClonedType');

      expect(cloned.id).toBe(1001);
      expect(cloned.name).toBe('ClonedType');
    });
  });

  describe('isBasicType', () => {
    it('should identify basic types', () => {
      expect(service.isBasicType(3)).toBe(true);  // SHORT
      expect(service.isBasicType(13)).toBe(true); // NUMBER
      expect(service.isBasicType(4)).toBe(true);  // DATETIME
      expect(service.isBasicType(100)).toBe(false);
    });
  });

  describe('isSystemType', () => {
    it('should identify system types', () => {
      expect(service.isSystemType(3)).toBe(true);  // LOW ID
      expect(service.isSystemType(18)).toBe(true); // USER
      expect(service.isSystemType(49)).toBe(true); // Just under threshold
      expect(service.isSystemType(50)).toBe(false);
      expect(service.isSystemType(100)).toBe(false);
    });
  });

  describe('resolveTypeId', () => {
    it('should return numeric type ID unchanged', () => {
      expect(service.resolveTypeId(3)).toBe(3);
      expect(service.resolveTypeId(13)).toBe(13);
    });

    it('should resolve type name to ID', () => {
      expect(service.resolveTypeId('SHORT')).toBe(3);
      expect(service.resolveTypeId('number')).toBe(13);
      expect(service.resolveTypeId('DATETIME')).toBe(4);
    });

    it('should parse numeric string', () => {
      expect(service.resolveTypeId('13')).toBe(13);
    });

    it('should throw for invalid type', () => {
      expect(() => service.resolveTypeId('INVALID_TYPE')).toThrow('Invalid type');
    });
  });

  describe('parseRequisite', () => {
    it('should parse requisite with all modifiers', () => {
      const row = {
        id: 20,
        val: ':!NULL::MULTI::ALIAS=Tel:Phone',
        t: 3,
        ord: 1,
        up: 18,
      };

      const parsed = service.parseRequisite(row);

      expect(parsed.name).toBe('Phone');
      expect(parsed.alias).toBe('Tel');
      expect(parsed.required).toBe(true);
      expect(parsed.multi).toBe(true);
      expect(parsed.typeId).toBe(3);
      expect(parsed.basicType).toBe('SHORT');
    });

    it('should handle requisite without modifiers', () => {
      const row = {
        id: 20,
        val: 'SimpleName',
        t: 13,
        ord: 1,
        up: 18,
      };

      const parsed = service.parseRequisite(row);

      expect(parsed.name).toBe('SimpleName');
      expect(parsed.alias).toBeNull();
      expect(parsed.required).toBe(false);
      expect(parsed.multi).toBe(false);
      expect(parsed.basicType).toBe('NUMBER');
    });
  });

  describe('clearCache', () => {
    it('should clear all cache', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 20, val: 'Field', t: 3, ord: 1, up: 18 }],
      });

      await service.getRequisites('testdb', 18);
      await service.getRequisites('testdb', 42);

      service.clearCache();

      await service.getRequisites('testdb', 18);
      await service.getRequisites('testdb', 42);

      // Should query 4 times (2 original + 2 after clear)
      expect(mockDb.executeQuery).toHaveBeenCalledTimes(4);
    });

    it('should clear cache for specific database', async () => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{ id: 20, val: 'Field', t: 3, ord: 1, up: 18 }],
      });

      await service.getRequisites('db1', 18);
      await service.getRequisites('db2', 18);

      service.clearCache('db1');

      await service.getRequisites('db1', 18); // Should query
      await service.getRequisites('db2', 18); // Should use cache

      expect(mockDb.executeQuery).toHaveBeenCalledTimes(3);
    });
  });
});
