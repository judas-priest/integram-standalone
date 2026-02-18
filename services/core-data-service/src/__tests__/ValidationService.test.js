/**
 * Unit tests for ValidationService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from '../services/ValidationService.js';

describe('ValidationService', () => {
  let service;

  beforeEach(() => {
    service = new ValidationService();
  });

  describe('validateDatabase', () => {
    it('should accept valid database names', () => {
      expect(service.validateDatabase('test')).toBe('test');
      expect(service.validateDatabase('mydb123')).toBe('mydb123');
      expect(service.validateDatabase('a2025')).toBe('a2025');
    });

    it('should trim whitespace', () => {
      expect(service.validateDatabase('  test  ')).toBe('test');
    });

    it('should reject empty database names', () => {
      expect(() => service.validateDatabase('')).toThrow('Database name is required');
      expect(() => service.validateDatabase(null)).toThrow('Database name is required');
      expect(() => service.validateDatabase(undefined)).toThrow('Database name is required');
    });

    it('should reject invalid database names', () => {
      // Must start with letter - '123abc' starts with number
      expect(() => service.validateDatabase('123abc')).toThrow('Invalid database name');
      // Single character is invalid (DB_MASK requires 2-15 chars)
      expect(() => service.validateDatabase('a')).toThrow('Invalid database name');
      // Note: 'ab' (2 chars) IS valid according to DB_MASK /^[a-z]\w{1,14}$/i
    });
  });

  describe('validateId', () => {
    it('should accept valid IDs', () => {
      expect(service.validateId(1)).toBe(1);
      expect(service.validateId(12345)).toBe(12345);
      expect(service.validateId('100')).toBe(100);
      expect(service.validateId(0)).toBe(0);
    });

    it('should reject invalid IDs', () => {
      expect(() => service.validateId(-1)).toThrow('Invalid object ID');
      expect(() => service.validateId('abc')).toThrow('Invalid object ID');
      expect(() => service.validateId(NaN)).toThrow('Invalid object ID');
    });
  });

  describe('validateParentId', () => {
    it('should accept valid parent IDs including 0', () => {
      expect(service.validateParentId(0)).toBe(0);
      expect(service.validateParentId(1)).toBe(1);
      expect(service.validateParentId('100')).toBe(100);
    });

    it('should reject negative parent IDs', () => {
      expect(() => service.validateParentId(-1)).toThrow('Invalid parent ID');
    });
  });

  describe('validateTypeId', () => {
    it('should accept valid type IDs', () => {
      expect(service.validateTypeId(3)).toBe(3);
      expect(service.validateTypeId(18)).toBe(18);
      expect(service.validateTypeId('42')).toBe(42);
    });

    it('should reject invalid type IDs', () => {
      expect(() => service.validateTypeId(0)).toThrow('Invalid type ID');
      expect(() => service.validateTypeId(-1)).toThrow('Invalid type ID');
      expect(() => service.validateTypeId('abc')).toThrow('Invalid type ID');
    });
  });

  describe('validateValue', () => {
    it('should accept valid values', () => {
      expect(service.validateValue('Hello')).toBe('Hello');
      expect(service.validateValue('')).toBe('');
      expect(service.validateValue(123)).toBe('123');
    });

    it('should handle null values', () => {
      expect(service.validateValue(null)).toBe('');
      expect(service.validateValue(undefined)).toBe('');
    });

    it('should reject null when not allowed', () => {
      expect(() => service.validateValue(null, { allowNull: false })).toThrow('Value cannot be null');
    });

    it('should reject empty values when not allowed', () => {
      expect(() => service.validateValue('', { allowEmpty: false })).toThrow('Value cannot be empty');
      expect(() => service.validateValue('   ', { allowEmpty: false })).toThrow('Value cannot be empty');
    });

    it('should enforce max length', () => {
      expect(() => service.validateValue('12345', { maxLength: 3 })).toThrow('Value exceeds maximum length');
    });
  });

  describe('validateOrder', () => {
    it('should accept valid order values', () => {
      expect(service.validateOrder(0)).toBe(0);
      expect(service.validateOrder(1)).toBe(1);
      expect(service.validateOrder(100)).toBe(100);
      expect(service.validateOrder('50')).toBe(50);
    });

    it('should reject invalid order values', () => {
      expect(() => service.validateOrder(-1)).toThrow('Invalid order value');
      expect(() => service.validateOrder('abc')).toThrow('Invalid order value');
    });
  });

  describe('validateRequisites', () => {
    it('should accept valid requisites object', () => {
      const requisites = {
        '20': 'password123',
        '30': '+1234567890',
      };
      const result = service.validateRequisites(requisites);
      expect(result[20]).toBe('password123');
      expect(result[30]).toBe('+1234567890');
    });

    it('should reject non-object requisites', () => {
      expect(() => service.validateRequisites(null)).toThrow('Requisites must be an object');
      expect(() => service.validateRequisites('string')).toThrow('Requisites must be an object');
    });

    it('should reject invalid requisite IDs', () => {
      expect(() => service.validateRequisites({ 'abc': 'value' })).toThrow('Invalid requisite ID');
      expect(() => service.validateRequisites({ '-1': 'value' })).toThrow('Invalid requisite ID');
    });
  });

  describe('validateFilters', () => {
    it('should accept valid filters', () => {
      const filters = {
        limit: '20',
        offset: '10',
        typeId: '18',
        parentId: '100',
      };
      const result = service.validateFilters(filters);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(10);
      expect(result.typeId).toBe(18);
      expect(result.parentId).toBe(100);
    });

    it('should return empty object for null/undefined', () => {
      expect(service.validateFilters(null)).toEqual({});
      expect(service.validateFilters(undefined)).toEqual({});
    });

    it('should reject invalid limit', () => {
      expect(() => service.validateFilters({ limit: -1 })).toThrow('Invalid limit value');
      expect(() => service.validateFilters({ limit: 'abc' })).toThrow('Invalid limit value');
      expect(() => service.validateFilters({ limit: 100000 })).toThrow('Invalid limit value');
    });

    it('should validate sort direction', () => {
      expect(service.validateFilters({ sortDir: 'asc' }).sortDir).toBe('ASC');
      expect(service.validateFilters({ sortDir: 'DESC' }).sortDir).toBe('DESC');
      expect(() => service.validateFilters({ sortDir: 'invalid' })).toThrow('Invalid sort direction');
    });
  });

  describe('validateDateTime', () => {
    it('should accept valid datetime strings', () => {
      const result = service.validateDateTime('2025-01-15T10:30:00');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should accept Date objects', () => {
      const date = new Date('2025-01-15T10:30:00Z');
      const result = service.validateDateTime(date);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should return null for empty values', () => {
      expect(service.validateDateTime(null)).toBeNull();
      expect(service.validateDateTime('')).toBeNull();
    });

    it('should reject invalid datetime', () => {
      expect(() => service.validateDateTime('not-a-date')).toThrow('Invalid datetime value');
    });
  });

  describe('validateBatch', () => {
    it('should validate batch objects', () => {
      const batch = [
        { value: 'Object 1', typeId: 18 },
        { val: 'Object 2', t: 18, up: 100 },
      ];
      const result = service.validateBatch(batch);
      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('Object 1');
      expect(result[1].value).toBe('Object 2');
      expect(result[1].parentId).toBe(100);
    });

    it('should reject empty batch', () => {
      expect(() => service.validateBatch([])).toThrow('Batch cannot be empty');
    });

    it('should reject non-array', () => {
      expect(() => service.validateBatch({})).toThrow('Batch must be an array');
    });

    it('should report index of invalid object', () => {
      const batch = [
        { value: 'Valid', typeId: 18 },
        { value: '   ', typeId: 18 }, // Invalid - whitespace-only value (treated as empty after trim)
      ];
      expect(() => service.validateBatch(batch)).toThrow('Invalid object at index 1');
    });
  });

  describe('isBasicType', () => {
    it('should recognize basic types', () => {
      expect(service.isBasicType(3)).toBe(true);  // SHORT
      expect(service.isBasicType(13)).toBe(true); // NUMBER
      expect(service.isBasicType(4)).toBe(true);  // DATETIME
    });

    it('should return false for non-basic types', () => {
      expect(service.isBasicType(100)).toBe(false);
      expect(service.isBasicType(999)).toBe(false);
    });
  });

  describe('getBasicTypeName', () => {
    it('should return type names', () => {
      expect(service.getBasicTypeName(3)).toBe('SHORT');
      expect(service.getBasicTypeName(13)).toBe('NUMBER');
      expect(service.getBasicTypeName(11)).toBe('BOOLEAN');
    });

    it('should return null for unknown types', () => {
      expect(service.getBasicTypeName(999)).toBeNull();
    });
  });

  describe('validateValueByType', () => {
    it('should validate NUMBER type', () => {
      expect(service.validateValueByType('123', { type: 'NUMBER' })).toBe(123);
      expect(service.validateValueByType(123.45, { type: 'NUMBER' })).toBe(123.45);
    });

    it('should reject invalid NUMBER', () => {
      expect(() => service.validateValueByType('abc', { type: 'NUMBER' })).toThrow('Invalid number value');
    });

    it('should validate BOOLEAN type', () => {
      expect(service.validateValueByType(true, { type: 'BOOLEAN' })).toBe(true);
      expect(service.validateValueByType(1, { type: 'BOOLEAN' })).toBe(true);
      expect(service.validateValueByType(0, { type: 'BOOLEAN' })).toBe(false);
    });

    it('should validate SHORT type with max length', () => {
      expect(service.validateValueByType('test', { type: 'SHORT' })).toBe('test');
      // SHORT type validates against maxLength - 'test' (4 chars) exceeds maxLength 2
      expect(service.validateValueByType('te', { type: 'SHORT', maxLength: 2 })).toBe('te');
    });

    it('should handle required fields', () => {
      expect(() => service.validateValueByType('', { type: 'SHORT', required: true })).toThrow('Required field is empty');
      expect(() => service.validateValueByType(null, { type: 'SHORT', required: true })).toThrow('Required field is empty');
    });
  });
});
