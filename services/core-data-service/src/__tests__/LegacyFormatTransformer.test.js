/**
 * Unit tests for LegacyFormatTransformer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LegacyFormatTransformer } from '../middleware/LegacyFormatTransformer.js';

describe('LegacyFormatTransformer', () => {
  let transformer;

  beforeEach(() => {
    transformer = new LegacyFormatTransformer({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
  });

  describe('detectFormat', () => {
    it('should detect JSON_DATA format', () => {
      expect(transformer.detectFormat({ JSON_DATA: '1' })).toBe('JSON_DATA');
    });

    it('should detect JSON_KV format', () => {
      expect(transformer.detectFormat({ JSON_KV: '1' })).toBe('JSON_KV');
    });

    it('should detect JSON_CR format', () => {
      expect(transformer.detectFormat({ JSON_CR: '1' })).toBe('JSON_CR');
    });

    it('should detect JSON_HR format', () => {
      expect(transformer.detectFormat({ JSON_HR: '1' })).toBe('JSON_HR');
    });

    it('should return DEFAULT for unknown format', () => {
      expect(transformer.detectFormat({})).toBe('DEFAULT');
      expect(transformer.detectFormat({ other: 'param' })).toBe('DEFAULT');
    });
  });

  describe('parseJsonData', () => {
    it('should parse JSON_DATA array', () => {
      const data = [
        ['id', 'val', 'up'],
        ['1', 'Object 1', '0'],
        ['2', 'Object 2', '0'],
      ];

      const result = transformer.parseJsonData(data);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', val: 'Object 1', up: '0' });
      expect(result[1]).toEqual({ id: '2', val: 'Object 2', up: '0' });
    });

    it('should parse JSON_DATA string', () => {
      const data = '[["id","val"],["1","Test"]]';

      const result = transformer.parseJsonData(data);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: '1', val: 'Test' });
    });

    it('should return null for invalid JSON', () => {
      const result = transformer.parseJsonData('not valid json');
      expect(result).toBeNull();
    });

    it('should return null for empty array', () => {
      expect(transformer.parseJsonData([])).toBeNull();
    });
  });

  describe('parseJsonKv', () => {
    it('should parse JSON_KV object', () => {
      const data = { 1: 'Value 1', 2: 'Value 2' };

      const result = transformer.parseJsonKv(data);

      expect(result).toEqual({ 1: 'Value 1', 2: 'Value 2' });
    });

    it('should parse JSON_KV string', () => {
      const data = '{"1":"Value 1","2":"Value 2"}';

      const result = transformer.parseJsonKv(data);

      expect(result).toEqual({ 1: 'Value 1', 2: 'Value 2' });
    });

    it('should return empty object for invalid JSON', () => {
      const result = transformer.parseJsonKv('not valid');
      expect(result).toEqual({});
    });
  });

  describe('parseJsonCr', () => {
    it('should parse JSON_CR object', () => {
      const data = {
        columns: ['id', 'val'],
        rows: [{ id: 1, val: 'Test' }],
      };

      const result = transformer.parseJsonCr(data);

      expect(result).toEqual(data);
    });

    it('should parse JSON_CR string', () => {
      const data = '{"columns":["id"],"rows":[{"id":1}]}';

      const result = transformer.parseJsonCr(data);

      expect(result.columns).toEqual(['id']);
      expect(result.rows).toHaveLength(1);
    });

    it('should return empty structure for invalid JSON', () => {
      const result = transformer.parseJsonCr('invalid');
      expect(result).toEqual({ columns: [], rows: [] });
    });
  });

  describe('transformRequest', () => {
    it('should transform JSON_DATA request', () => {
      const params = {
        JSON_DATA: '[["id","val"],["1","Test"]]',
        t: '18',
        LIMIT: '20',
      };

      const result = transformer.transformRequest(params);

      expect(result.format).toBe('JSON_DATA');
      expect(result.data).toHaveLength(1);
      expect(result.filters.typeId).toBe(18);
      expect(result.filters.limit).toBe(20);
    });

    it('should parse filter parameters', () => {
      const params = {
        t: '18',
        up: '100',
        LIMIT: '50',
        F: '10',
        ord: 'val',
      };

      const result = transformer.transformRequest(params);

      expect(result.filters.typeId).toBe(18);
      expect(result.filters.parentId).toBe(100);
      expect(result.filters.limit).toBe(50);
      expect(result.filters.offset).toBe(10);
      expect(result.filters.orderBy).toBe('val');
    });
  });

  describe('toJsonData', () => {
    it('should convert array to JSON_DATA format', () => {
      const data = [
        { id: 1, value: 'Object 1', parentId: 0, typeId: 18, order: 1 },
        { id: 2, value: 'Object 2', parentId: 0, typeId: 18, order: 2 },
      ];

      const result = transformer.toJsonData(data);

      // First row is headers
      expect(result[0]).toContain('id');
      // Data rows follow
      expect(result[1][0]).toBe('1');
    });

    it('should return only headers for empty array', () => {
      const result = transformer.toJsonData([]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(['id', 'val', 'up', 't', 'ord']);
    });

    it('should use custom columns', () => {
      const data = [{ id: 1, value: 'Test' }];
      const columns = ['id', 'value'];

      const result = transformer.toJsonData(data, columns);

      // 'value' is mapped to legacy 'val' format
      expect(result[0]).toEqual(['id', 'val']);
    });
  });

  describe('toJsonKv', () => {
    it('should convert array to JSON_KV format', () => {
      const data = [
        { id: 1, value: 'Value 1' },
        { id: 2, value: 'Value 2' },
      ];

      const result = transformer.toJsonKv(data);

      expect(result).toEqual({
        1: 'Value 1',
        2: 'Value 2',
      });
    });

    it('should handle val field', () => {
      const data = [{ id: 1, val: 'Test' }];

      const result = transformer.toJsonKv(data);

      expect(result[1]).toBe('Test');
    });

    it('should return empty object for empty array', () => {
      expect(transformer.toJsonKv([])).toEqual({});
    });
  });

  describe('toJsonCr', () => {
    it('should convert array to JSON_CR format', () => {
      const data = [
        { id: 1, value: 'Object 1', parentId: 0, typeId: 18, order: 1 },
      ];

      const result = transformer.toJsonCr(data);

      expect(result.columns).toEqual(['id', 'val', 'up', 't', 'ord']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].val).toBe('Object 1');
    });

    it('should return empty structure for empty array', () => {
      const result = transformer.toJsonCr([]);

      expect(result.columns).toEqual(['id', 'val', 'up', 't', 'ord']);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('toJsonHr', () => {
    it('should convert tree to JSON_HR format', () => {
      const tree = {
        id: 1,
        value: 'Root',
        parentId: 0,
        typeId: 18,
        children: [
          {
            id: 2,
            value: 'Child',
            parentId: 1,
            typeId: 18,
            children: [],
          },
        ],
      };

      const result = transformer.toJsonHr(tree);

      expect(result.id).toBe(1);
      expect(result.val).toBe('Root');
      expect(result.children).toHaveLength(1);
      expect(result.children[0].val).toBe('Child');
    });

    it('should return empty object for null', () => {
      expect(transformer.toJsonHr(null)).toEqual({});
    });
  });

  describe('objectToLegacy', () => {
    it('should convert modern object to legacy format', () => {
      const obj = {
        id: 1,
        value: 'Test',
        parentId: 0,
        typeId: 18,
        order: 1,
      };

      const result = transformer.objectToLegacy(obj);

      expect(result).toEqual({
        id: 1,
        val: 'Test',
        up: 0,
        t: 18,
        ord: 1,
      });
    });
  });

  describe('objectToModern', () => {
    it('should convert legacy object to modern format', () => {
      const obj = {
        id: 1,
        val: 'Test',
        up: 0,
        t: 18,
        ord: 1,
      };

      const result = transformer.objectToModern(obj);

      expect(result).toEqual({
        id: 1,
        value: 'Test',
        parentId: 0,
        typeId: 18,
        order: 1,
      });
    });
  });

  describe('arrayToLegacy', () => {
    it('should convert array of modern objects to legacy', () => {
      const objects = [
        { id: 1, value: 'Obj 1', parentId: 0, typeId: 18, order: 1 },
        { id: 2, value: 'Obj 2', parentId: 0, typeId: 18, order: 2 },
      ];

      const result = transformer.arrayToLegacy(objects);

      expect(result).toHaveLength(2);
      expect(result[0].val).toBe('Obj 1');
      expect(result[1].val).toBe('Obj 2');
    });
  });

  describe('arrayToModern', () => {
    it('should convert array of legacy objects to modern', () => {
      const objects = [
        { id: 1, val: 'Obj 1', up: 0, t: 18, ord: 1 },
        { id: 2, val: 'Obj 2', up: 0, t: 18, ord: 2 },
      ];

      const result = transformer.arrayToModern(objects);

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('Obj 1');
      expect(result[1].value).toBe('Obj 2');
    });
  });

  describe('transformResponse', () => {
    it('should transform to JSON_DATA format', () => {
      const data = [{ id: 1, val: 'Test', up: 0, t: 18, ord: 1 }];

      const result = transformer.transformResponse(data, 'JSON_DATA');

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toContain('id');
    });

    it('should transform to JSON_KV format', () => {
      const data = [{ id: 1, val: 'Test' }];

      const result = transformer.transformResponse(data, 'JSON_KV');

      expect(result[1]).toBe('Test');
    });

    it('should transform to JSON_CR format', () => {
      const data = [{ id: 1, val: 'Test', up: 0, t: 18, ord: 1 }];

      const result = transformer.transformResponse(data, 'JSON_CR');

      expect(result.columns).toBeDefined();
      expect(result.rows).toBeDefined();
    });

    it('should return data unchanged for DEFAULT format', () => {
      const data = [{ id: 1 }];

      const result = transformer.transformResponse(data, 'DEFAULT');

      expect(result).toEqual(data);
    });
  });

  describe('middleware', () => {
    it('should create Express middleware', () => {
      const middleware = transformer.middleware();

      expect(typeof middleware).toBe('function');
    });

    it('should transform request body', () => {
      const middleware = transformer.middleware();

      const req = {
        query: { JSON_DATA: '1' },
        body: { val: 'Test' },
      };
      const res = { json: vi.fn() };
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.legacyFormat).toBe('JSON_DATA');
      expect(req.transformedBody).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it('should override res.json for response transformation', () => {
      const middleware = transformer.middleware();

      const req = { query: { JSON_KV: '1' }, body: null };
      const originalJson = vi.fn();
      const res = { json: originalJson };
      const next = vi.fn();

      middleware(req, res, next);

      // Call the overridden json method
      res.json([{ id: 1, val: 'Test' }]);

      expect(originalJson).toHaveBeenCalledWith({ 1: 'Test' });
    });
  });
});
