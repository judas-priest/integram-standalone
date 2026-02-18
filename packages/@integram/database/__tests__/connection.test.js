/**
 * @integram/database - Connection Manager Tests
 *
 * Unit tests for the database connection manager with mock database.
 * These tests verify the connection pooling, metrics, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionManager, createConnectionFromEnv } from '../connection.js';

describe('@integram/database ConnectionManager', () => {
  describe('constructor', () => {
    it('should create with default config values', () => {
      const cm = new ConnectionManager({
        user: 'testuser',
        password: 'testpass',
      });

      expect(cm.config.host).toBe('localhost');
      expect(cm.config.port).toBe(3306);
      expect(cm.config.connectionLimit).toBe(10);
    });

    it('should override default config values', () => {
      const cm = new ConnectionManager({
        host: 'db.example.com',
        port: 3307,
        user: 'testuser',
        password: 'testpass',
        database: 'mydb',
        connectionLimit: 20,
      });

      expect(cm.config.host).toBe('db.example.com');
      expect(cm.config.port).toBe(3307);
      expect(cm.config.connectionLimit).toBe(20);
      expect(cm.config.database).toBe('mydb');
    });

    it('should initialize metrics', () => {
      const cm = new ConnectionManager({ user: 'test', password: 'test' });

      expect(cm.metrics.totalQueries).toBe(0);
      expect(cm.metrics.totalTime).toBe(0);
      expect(cm.metrics.errors).toBe(0);
      expect(cm.metrics.lastQueryTime).toBeNull();
    });

    it('should start disconnected', () => {
      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      expect(cm.isConnected).toBe(false);
      expect(cm.pool).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should create pool from mysql module', async () => {
      const mockPool = { query: vi.fn() };
      const mockMysql = {
        createPool: vi.fn().mockReturnValue(mockPool),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize(mockMysql);

      expect(mockMysql.createPool).toHaveBeenCalledWith(cm.config);
      expect(cm.pool).toBe(mockPool);
      expect(cm.isConnected).toBe(true);
    });

    it('should not re-initialize if already connected', async () => {
      const mockMysql = {
        createPool: vi.fn().mockReturnValue({ query: vi.fn() }),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize(mockMysql);
      await cm.initialize(mockMysql);

      expect(mockMysql.createPool).toHaveBeenCalledTimes(1);
    });

    it('should throw on connection failure', async () => {
      const mockMysql = {
        createPool: vi.fn().mockImplementation(() => {
          throw new Error('Connection refused');
        }),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });

      await expect(cm.initialize(mockMysql)).rejects.toThrow('Failed to initialize database pool');
      expect(cm.isConnected).toBe(false);
    });
  });

  describe('query', () => {
    let cm;
    let mockPool;

    beforeEach(async () => {
      mockPool = {
        query: vi.fn().mockResolvedValue([
          [{ id: 1, val: 'test' }],
          [{ name: 'id' }, { name: 'val' }],
        ]),
        getConnection: vi.fn(),
        end: vi.fn(),
      };

      cm = new ConnectionManager(
        { user: 'test', password: 'test' },
        { enableMetrics: true }
      );
      await cm.initialize({ createPool: () => mockPool });
    });

    it('should execute query and return rows and fields', async () => {
      const result = await cm.query('SELECT * FROM testdb WHERE id = ?', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM testdb WHERE id = ?', [1]);
      expect(result.rows).toEqual([{ id: 1, val: 'test' }]);
      expect(result.fields).toEqual([{ name: 'id' }, { name: 'val' }]);
    });

    it('should track metrics when enabled', async () => {
      await cm.query('SELECT 1', []);

      expect(cm.metrics.totalQueries).toBe(1);
      expect(cm.metrics.totalTime).toBeGreaterThanOrEqual(0);
      expect(cm.metrics.lastQueryTime).toBeGreaterThanOrEqual(0);
    });

    it('should throw when pool not initialized', async () => {
      const uninitCm = new ConnectionManager({ user: 'test', password: 'test' });

      await expect(uninitCm.query('SELECT 1', [])).rejects.toThrow('Connection pool not initialized');
    });

    it('should track errors on failure', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Query failed'));

      await expect(cm.query('SELECT 1', [])).rejects.toThrow();
      expect(cm.metrics.errors).toBe(1);
    });
  });

  describe('execute', () => {
    it('should return result object from query', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue([
          { affectedRows: 1, insertId: 42 },
          [],
        ]),
        end: vi.fn(),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize({ createPool: () => mockPool });

      const result = await cm.execute('INSERT INTO testdb VALUES (?)', ['test']);

      expect(result.affectedRows).toBe(1);
      expect(result.insertId).toBe(42);
    });
  });

  describe('transaction', () => {
    it('should commit on success', async () => {
      const mockConnection = {
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue(mockConnection),
        end: vi.fn(),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize({ createPool: () => mockPool });

      const callback = vi.fn().mockResolvedValue('success');
      const result = await cm.transaction(callback);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(mockConnection);
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should rollback on failure', async () => {
      const mockConnection = {
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue(mockConnection),
        end: vi.fn(),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize({ createPool: () => mockPool });

      const error = new Error('Transaction failed');
      const callback = vi.fn().mockRejectedValue(error);

      await expect(cm.transaction(callback)).rejects.toThrow('Transaction failed');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return true when healthy', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue([[{ 1: 1 }], []]),
        end: vi.fn(),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize({ createPool: () => mockPool });

      expect(await cm.healthCheck()).toBe(true);
    });

    it('should return false when unhealthy', async () => {
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('Connection lost')),
        end: vi.fn(),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize({ createPool: () => mockPool });

      expect(await cm.healthCheck()).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics with averageQueryTime', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue([[], []]),
        end: vi.fn(),
      };

      const cm = new ConnectionManager(
        { user: 'test', password: 'test' },
        { enableMetrics: true }
      );
      await cm.initialize({ createPool: () => mockPool });

      await cm.query('SELECT 1');
      await cm.query('SELECT 2');

      const metrics = cm.getMetrics();

      expect(metrics.totalQueries).toBe(2);
      expect(metrics.averageQueryTime).toBeGreaterThanOrEqual(0);
      expect(metrics.isConnected).toBe(true);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial values', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue([[], []]),
        end: vi.fn(),
      };

      const cm = new ConnectionManager(
        { user: 'test', password: 'test' },
        { enableMetrics: true }
      );
      await cm.initialize({ createPool: () => mockPool });

      await cm.query('SELECT 1');
      cm.resetMetrics();

      expect(cm.metrics.totalQueries).toBe(0);
      expect(cm.metrics.totalTime).toBe(0);
      expect(cm.metrics.errors).toBe(0);
    });
  });

  describe('close', () => {
    it('should close pool and reset state', async () => {
      const mockPool = {
        query: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
      };

      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.initialize({ createPool: () => mockPool });
      await cm.close();

      expect(mockPool.end).toHaveBeenCalled();
      expect(cm.pool).toBeNull();
      expect(cm.isConnected).toBe(false);
    });

    it('should do nothing if not connected', async () => {
      const cm = new ConnectionManager({ user: 'test', password: 'test' });
      await cm.close(); // Should not throw
    });
  });

  describe('createConnectionFromEnv', () => {
    it('should create connection manager from environment variables', () => {
      // Save original env
      const originalEnv = { ...process.env };

      process.env.DB_HOST = 'testhost';
      process.env.DB_PORT = '3307';
      process.env.DB_USER = 'envuser';
      process.env.DB_PASSWORD = 'envpass';
      process.env.DB_DATABASE = 'envdb';
      process.env.DB_POOL_SIZE = '5';

      const cm = createConnectionFromEnv();

      expect(cm.config.host).toBe('testhost');
      expect(cm.config.port).toBe(3307);
      expect(cm.config.user).toBe('envuser');
      expect(cm.config.password).toBe('envpass');
      expect(cm.config.database).toBe('envdb');
      expect(cm.config.connectionLimit).toBe(5);

      // Restore original env
      Object.assign(process.env, originalEnv);
    });
  });
});
