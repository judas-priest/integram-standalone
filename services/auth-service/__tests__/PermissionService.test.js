/**
 * @integram/auth-service - Permission Service Tests
 *
 * Tests for permission checking and grant management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionService, createPermissionService } from '../src/services/PermissionService.js';

// Mock database service
const createMockDb = (rows = []) => ({
  execSql: vi.fn().mockResolvedValue({ rows }),
});

describe('@integram/auth-service PermissionService', () => {
  let permissionService;
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDb();
    permissionService = new PermissionService({
      database: mockDb,
    });
    permissionService.clearAllCache();
  });

  describe('Grant Checking', () => {
    describe('Admin user', () => {
      it('should grant admin full access', () => {
        const context = {
          username: 'admin',
          userGrants: {},
        };

        const result = permissionService.checkGrant(context, 123, 18, 'WRITE', false);

        expect(result).toBe(true);
      });

      it('should not throw for admin', () => {
        const context = {
          username: 'admin',
          userGrants: {},
        };

        expect(() => {
          permissionService.checkGrant(context, 123, 18, 'WRITE', true);
        }).not.toThrow();
      });
    });

    describe('Regular user with grants', () => {
      it('should grant READ when user has READ for type', () => {
        const context = {
          username: 'john',
          userGrants: {
            grants: { 18: 'READ' },
          },
        };

        const result = permissionService.checkGrant(context, 123, 18, 'READ', false);

        expect(result).toBe(true);
      });

      it('should grant READ when user has WRITE for type', () => {
        const context = {
          username: 'john',
          userGrants: {
            grants: { 18: 'WRITE' },
          },
        };

        const result = permissionService.checkGrant(context, 123, 18, 'READ', false);

        expect(result).toBe(true);
      });

      it('should deny WRITE when user only has READ', () => {
        const context = {
          username: 'john',
          userGrants: {
            grants: { 18: 'READ' },
          },
        };

        const result = permissionService.checkGrant(context, 123, 18, 'WRITE', false);

        expect(result).toBe(false);
      });

      it('should throw GrantError when fatal=true and no grant', () => {
        const context = {
          username: 'john',
          userGrants: {
            grants: {},
          },
        };

        expect(() => {
          permissionService.checkGrant(context, 123, 18, 'WRITE', true);
        }).toThrow();
      });

      it('should check object-level grants', () => {
        const context = {
          username: 'john',
          userGrants: {
            grants: { 100: 'WRITE' }, // Grant for object 100
          },
        };

        const result = permissionService.checkGrant(context, 100, 0, 'WRITE', false);

        expect(result).toBe(true);
      });

      it('should fall back to root grant', () => {
        const context = {
          username: 'john',
          userGrants: {
            grants: { 1: 'READ' }, // Root grant
          },
        };

        const result = permissionService.checkGrant(context, 999, 0, 'READ', false);

        expect(result).toBe(true);
      });
    });

    describe('User without grants', () => {
      it('should deny access when no grants', () => {
        const context = {
          username: 'john',
          userGrants: null,
        };

        const result = permissionService.checkGrant(context, 123, 18, 'READ', false);

        expect(result).toBe(false);
      });
    });
  });

  describe('First Level Grant Check', () => {
    it('should return WRITE for admin', () => {
      const context = {
        username: 'admin',
        userGrants: {},
      };

      const result = permissionService.checkGrant1Level(context, 100);

      expect(result).toBe('WRITE');
    });

    it('should return grant level for object', () => {
      const context = {
        username: 'john',
        userGrants: {
          grants: { 100: 'READ' },
        },
      };

      const result = permissionService.checkGrant1Level(context, 100);

      expect(result).toBe('READ');
    });

    it('should fall back to root grant', () => {
      const context = {
        username: 'john',
        userGrants: {
          grants: { 1: 'WRITE' },
        },
      };

      const result = permissionService.checkGrant1Level(context, 999);

      expect(result).toBe('WRITE');
    });

    it('should return false when no grants', () => {
      const context = {
        username: 'john',
        userGrants: null,
      };

      const result = permissionService.checkGrant1Level(context, 100);

      expect(result).toBe(false);
    });
  });

  describe('Types Grant Check', () => {
    it('should return WRITE for admin', () => {
      const context = {
        username: 'admin',
        userGrants: {},
      };

      const result = permissionService.checkTypesGrant(context, false);

      expect(result).toBe('WRITE');
    });

    it('should return grant for type 0 (metadata)', () => {
      const context = {
        username: 'john',
        userGrants: {
          grants: { 0: 'WRITE' },
        },
      };

      const result = permissionService.checkTypesGrant(context, false);

      expect(result).toBe('WRITE');
    });

    it('should return false when no types grant', () => {
      const context = {
        username: 'john',
        userGrants: {
          grants: { 18: 'WRITE' },
        },
      };

      const result = permissionService.checkTypesGrant(context, false);

      expect(result).toBe(false);
    });

    it('should throw when fatal=true and no grant', () => {
      const context = {
        username: 'john',
        userGrants: {
          grants: {},
        },
      };

      expect(() => {
        permissionService.checkTypesGrant(context, true);
      }).toThrow('No permission to edit types');
    });
  });

  describe('Mask Checking', () => {
    describe('matchesMask', () => {
      it('should match empty pattern against empty value', () => {
        expect(permissionService.matchesMask('', '%')).toBe(true);
        expect(permissionService.matchesMask(null, '%')).toBe(true);
        expect(permissionService.matchesMask(undefined, '%')).toBe(true);
      });

      it('should match exact value', () => {
        expect(permissionService.matchesMask('test', 'test')).toBe(true);
        expect(permissionService.matchesMask('test', 'other')).toBe(false);
      });

      it('should match wildcard patterns', () => {
        expect(permissionService.matchesMask('hello world', '%world')).toBe(true);
        expect(permissionService.matchesMask('hello world', 'hello%')).toBe(true);
        expect(permissionService.matchesMask('hello world', '%lo wo%')).toBe(true);
      });

      it('should handle negation', () => {
        expect(permissionService.matchesMask('test', '!test')).toBe(false);
        expect(permissionService.matchesMask('other', '!test')).toBe(true);
      });
    });

    describe('isValueBarredByMask', () => {
      it('should return false when no masks', () => {
        const context = {
          userGrants: { grants: {}, masks: {} },
        };

        const result = permissionService.isValueBarredByMask(context, 18, 'test');

        expect(result).toBe(false);
      });

      it('should return true when value matches BARRED mask', () => {
        const context = {
          userGrants: {
            grants: {},
            masks: {
              18: { 'secret%': 'BARRED' },
            },
          },
        };

        const result = permissionService.isValueBarredByMask(context, 18, 'secret123');

        expect(result).toBe(true);
      });

      it('should return false when value matches allowed mask', () => {
        const context = {
          userGrants: {
            grants: {},
            masks: {
              18: { 'public%': 'READ' },
            },
          },
        };

        const result = permissionService.isValueBarredByMask(context, 18, 'public123');

        expect(result).toBe(false);
      });
    });
  });

  describe('Grant Loading', () => {
    it('should load grants from database', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [
          { t: 18, val: 'READ', mask: null },
          { t: 42, val: 'WRITE', mask: null },
        ],
      });

      const result = await permissionService.loadGrants('mydb', 123);

      expect(result.grants[18]).toBe('READ');
      expect(result.grants[42]).toBe('WRITE');
    });

    it('should cache loaded grants', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ t: 18, val: 'READ', mask: null }],
      });

      await permissionService.loadGrants('mydb', 123);
      await permissionService.loadGrants('mydb', 123);

      // Should only call database once
      expect(mockDb.execSql).toHaveBeenCalledTimes(1);
    });

    it('should return empty grants on error', async () => {
      mockDb.execSql.mockRejectedValue(new Error('DB error'));

      const result = await permissionService.loadGrants('mydb', 123);

      expect(result.grants).toEqual({});
      expect(result.masks).toEqual({});
    });
  });

  describe('Cache Management', () => {
    it('should clear cache for specific role', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ t: 18, val: 'READ', mask: null }],
      });

      await permissionService.loadGrants('mydb', 123);
      permissionService.clearCache('mydb', 123);
      await permissionService.loadGrants('mydb', 123);

      expect(mockDb.execSql).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache for database', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ t: 18, val: 'READ', mask: null }],
      });

      await permissionService.loadGrants('mydb', 123);
      await permissionService.loadGrants('mydb', 456);
      permissionService.clearCache('mydb');

      // Both should be cleared
      await permissionService.loadGrants('mydb', 123);
      await permissionService.loadGrants('mydb', 456);

      expect(mockDb.execSql).toHaveBeenCalledTimes(4);
    });

    it('should clear entire cache', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ t: 18, val: 'READ', mask: null }],
      });

      await permissionService.loadGrants('db1', 123);
      await permissionService.loadGrants('db2', 456);
      permissionService.clearAllCache();

      await permissionService.loadGrants('db1', 123);
      await permissionService.loadGrants('db2', 456);

      expect(mockDb.execSql).toHaveBeenCalledTimes(4);
    });
  });

  describe('Factory Function', () => {
    it('should create service with options', () => {
      const service = createPermissionService({
        database: mockDb,
      });

      expect(service).toBeInstanceOf(PermissionService);
    });
  });
});
