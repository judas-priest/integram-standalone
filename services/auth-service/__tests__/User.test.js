/**
 * @integram/auth-service - User Model Tests
 *
 * Tests for User model and repository.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { User, UserRepository } from '../src/models/User.js';

describe('User Model', () => {
  describe('constructor', () => {
    it('should create user with data', () => {
      const user = new User({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        roleId: 115,
        roleName: 'user',
      });

      expect(user.id).toBe(1);
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.roleId).toBe(115);
      expect(user.roleName).toBe('user');
    });

    it('should handle legacy field names', () => {
      const user = new User({
        id: 1,
        val: 'testuser', // PHP uses 'val' for username
        r: 115, // PHP uses 'r' for roleId
        role: 'user',
      });

      expect(user.username).toBe('testuser');
      expect(user.roleId).toBe(115);
    });

    it('should create empty user', () => {
      const user = new User();

      expect(user.id).toBeNull();
      expect(user.username).toBeNull();
      expect(user.oauthProviders).toEqual({});
    });
  });

  describe('role methods', () => {
    it('should check role by name', () => {
      const user = new User({ roleName: 'admin' });

      expect(user.hasRole('admin')).toBe(true);
      expect(user.hasRole('ADMIN')).toBe(true); // Case insensitive
      expect(user.hasRole('user')).toBe(false);
    });

    it('should check role by ID', () => {
      const user = new User({ roleId: 115 });

      expect(user.hasRole(115)).toBe(true);
      expect(user.hasRole(145)).toBe(false);
    });

    it('should detect admin', () => {
      expect(new User({ roleName: 'admin' }).isAdmin()).toBe(true);
      expect(new User({ roleId: 145 }).isAdmin()).toBe(true);
      expect(new User({ roleName: 'user' }).isAdmin()).toBe(false);
    });

    it('should detect guest', () => {
      expect(new User({ username: 'guest' }).isGuest()).toBe(true);
      expect(new User({ username: 'testuser' }).isGuest()).toBe(false);
    });
  });

  describe('OAuth methods', () => {
    it('should check OAuth provider', () => {
      const user = new User({
        oauthProviders: { google: { id: '123' } },
      });

      expect(user.hasOAuthProvider('google')).toBe(true);
      expect(user.hasOAuthProvider('github')).toBe(false);
    });

    it('should check password', () => {
      expect(new User({ passwordHash: 'abc123' }).hasPassword()).toBe(true);
      expect(new User({}).hasPassword()).toBe(false);
    });
  });

  describe('display methods', () => {
    it('should get display name', () => {
      expect(new User({ username: 'testuser' }).getDisplayName()).toBe('testuser');
      expect(new User({ email: 'test@example.com' }).getDisplayName()).toBe('test@example.com');
      expect(new User({ id: 123 }).getDisplayName()).toBe('User 123');
    });
  });

  describe('serialization', () => {
    it('should convert to safe JSON', () => {
      const user = new User({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'secret-hash',
        roleId: 115,
        roleName: 'user',
        oauthProviders: { google: { id: '123' } },
      });

      const json = user.toJSON();

      expect(json.id).toBe(1);
      expect(json.username).toBe('testuser');
      expect(json.passwordHash).toBeUndefined(); // Should not include password
      expect(json.oauthProviders).toEqual(['google']); // Only provider names
    });

    it('should convert to legacy format', () => {
      const user = new User({
        id: 1,
        username: 'testuser',
        roleId: 115,
        roleName: 'user',
        xsrf: 'test-xsrf',
      });

      const legacy = user.toLegacyFormat();

      expect(legacy.id).toBe(1);
      expect(legacy.val).toBe('testuser');
      expect(legacy.r).toBe(115);
      expect(legacy.role).toBe('user');
      expect(legacy.xsrf).toBe('test-xsrf');
    });
  });

  describe('static methods', () => {
    it('should create from database row', () => {
      const row = {
        id: 1,
        val: 'testuser',
        email: 'test@example.com',
        r: 115,
        role: 'user',
        tok: 'test-token',
        xsrf: 'test-xsrf',
      };

      const user = User.fromDatabaseRow(row);

      expect(user.id).toBe(1);
      expect(user.username).toBe('testuser');
      expect(user.roleId).toBe(115);
      expect(user.token).toBe('test-token');
    });

    it('should get type IDs', () => {
      const types = User.getTypeIds();

      // These values must match PHP constants in integram-server/index.php
      expect(types.USER).toBe(18);
      expect(types.EMAIL).toBe(41);
      expect(types.PASSWORD).toBe(20);
      expect(types.TOKEN).toBe(125);
      expect(types.XSRF).toBe(40);
      expect(types.ROLE).toBe(42);
      expect(types.ACTIVITY).toBe(124);
    });
  });
});

describe('UserRepository', () => {
  let repository;
  let mockDb;
  let mockLogger;

  beforeEach(() => {
    mockDb = {
      execSql: vi.fn(),
      insert: vi.fn().mockResolvedValue(1),
      updateVal: vi.fn().mockResolvedValue(true),
    };
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };
    repository = new UserRepository({
      database: mockDb,
      logger: mockLogger,
    });
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{
          id: 1,
          val: 'testuser',
          email: 'test@example.com',
          roleId: 115,
          role: 'user',
        }],
      });

      const user = await repository.findById('test', 1);

      expect(user).toBeInstanceOf(User);
      expect(user.id).toBe(1);
      expect(user.username).toBe('testuser');
    });

    it('should return null if not found', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [] });

      const user = await repository.findById('test', 999);

      expect(user).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 1, val: 'testuser' }],
      });

      const user = await repository.findByUsername('test', 'testuser');

      expect(user).toBeInstanceOf(User);
      expect(mockDb.execSql).toHaveBeenCalledWith(
        expect.stringContaining('u.val = ?'),
        expect.arrayContaining(['testuser']),
        expect.any(String)
      );
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 1, val: 'testuser', email: 'test@example.com' }],
      });

      const user = await repository.findByEmail('test', 'test@example.com');

      expect(user).toBeInstanceOf(User);
    });
  });

  describe('findByToken', () => {
    it('should find user by token', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 1, val: 'testuser' }],
      });

      const user = await repository.findByToken('test', 'test-token');

      expect(user).toBeInstanceOf(User);
      expect(mockDb.execSql).toHaveBeenCalledWith(
        expect.stringContaining('tok.val = ?'),
        expect.arrayContaining(['test-token']),
        expect.any(String)
      );
    });
  });

  describe('password operations', () => {
    it('should get password hash', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ val: 'hashed-password' }],
      });

      const hash = await repository.getPasswordHash('test', 1);

      expect(hash).toBe('hashed-password');
    });

    it('should update password', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 100 }], // Existing password record
      });

      await repository.updatePassword('test', 1, 'new-hash');

      expect(mockDb.updateVal).toHaveBeenCalledWith('test', 100, 'new-hash', expect.any(String));
    });

    it('should insert password if not exists', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [] }); // No existing password

      await repository.updatePassword('test', 1, 'new-hash');

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('activity', () => {
    it('should update existing activity record', async () => {
      mockDb.execSql.mockResolvedValue({
        rows: [{ id: 100 }],
      });

      await repository.updateActivity('test', 1);

      expect(mockDb.updateVal).toHaveBeenCalled();
    });

    it('should insert activity if not exists', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [] });

      await repository.updateActivity('test', 1);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create user with all fields', async () => {
      mockDb.insert.mockResolvedValue(123);

      const userId = await repository.create('test', {
        username: 'newuser',
        email: 'new@example.com',
        passwordHash: 'hashed-pass',
        roleId: 115,
      });

      expect(userId).toBe(123);
      // Should insert user, email, password, and role
      expect(mockDb.insert).toHaveBeenCalledTimes(4);
    });

    it('should skip email and password if not provided', async () => {
      mockDb.insert.mockResolvedValue(123);

      await repository.create('test', {
        username: 'newuser',
      });

      // Should insert user and role only
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('should delete user and children', async () => {
      await repository.delete('test', 1);

      expect(mockDb.execSql).toHaveBeenCalledTimes(2);
      expect(mockDb.execSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        [1],
        expect.stringContaining('children')
      );
      expect(mockDb.execSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        [1],
        expect.stringContaining('user')
      );
    });
  });
});
