/**
 * @integram/database - Connection Manager
 *
 * Database connection management with pooling, health checks, and metrics.
 * This wraps the underlying MySQL connection to provide a unified interface.
 */

import { DatabaseError, DatabaseNotFoundError } from '@integram/common';

// ============================================================================
// Connection Manager Class
// ============================================================================

/**
 * Manages database connections with pooling and health monitoring.
 */
export class ConnectionManager {
  /**
   * Create a new connection manager.
   *
   * @param {Object} config - Database configuration
   * @param {string} config.host - Database host
   * @param {number} [config.port=3306] - Database port
   * @param {string} config.user - Database user
   * @param {string} config.password - Database password
   * @param {string} [config.database] - Default database
   * @param {number} [config.connectionLimit=10] - Pool connection limit
   * @param {Object} [options] - Additional options
   * @param {Object} [options.logger] - Logger instance
   * @param {boolean} [options.enableMetrics=false] - Enable query metrics
   */
  constructor(config, options = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.connectionLimit || 10,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    };

    this.logger = options.logger || console;
    this.enableMetrics = options.enableMetrics || false;

    this.pool = null;
    this.isConnected = false;

    // Metrics
    this.metrics = {
      totalQueries: 0,
      totalTime: 0,
      errors: 0,
      lastQueryTime: null,
    };
  }

  /**
   * Initialize the connection pool.
   *
   * @param {Object} mysql - mysql2/promise module
   * @returns {Promise<void>}
   */
  async initialize(mysql) {
    if (this.pool) {
      return;
    }

    try {
      this.pool = mysql.createPool(this.config);
      this.isConnected = true;
      this.logger.info?.('Database connection pool initialized', {
        host: this.config.host,
        database: this.config.database,
      });
    } catch (error) {
      this.isConnected = false;
      throw new DatabaseError(
        `Failed to initialize database pool: ${error.message}`,
        null,
        error
      );
    }
  }

  /**
   * Get a connection from the pool.
   *
   * @returns {Promise<Object>} Database connection
   */
  async getConnection() {
    if (!this.pool) {
      throw new DatabaseError('Connection pool not initialized');
    }

    try {
      const connection = await this.pool.getConnection();
      return connection;
    } catch (error) {
      this.metrics.errors++;
      throw new DatabaseError(
        `Failed to get database connection: ${error.message}`,
        null,
        error
      );
    }
  }

  /**
   * Execute a query with metrics tracking.
   *
   * @param {string} sql - SQL query
   * @param {Array} [params=[]] - Query parameters
   * @param {string} [label] - Query label for logging
   * @returns {Promise<Object>} Query result
   */
  async query(sql, params = [], label = '') {
    if (!this.pool) {
      throw new DatabaseError('Connection pool not initialized');
    }

    const startTime = process.hrtime.bigint();

    try {
      const [rows, fields] = await this.pool.query(sql, params);

      // Track metrics
      if (this.enableMetrics) {
        const duration = Number(process.hrtime.bigint() - startTime) / 1e6; // ms
        this.metrics.totalQueries++;
        this.metrics.totalTime += duration;
        this.metrics.lastQueryTime = duration;

        // Log slow queries
        if (duration > 1000) {
          this.logger.warn?.('Slow query detected', {
            duration,
            sql: sql.substring(0, 200),
            label,
          });
        }
      }

      return { rows, fields };
    } catch (error) {
      this.metrics.errors++;

      // Handle specific MySQL errors
      if (error.errno === 1146) {
        // Table/database doesn't exist
        throw new DatabaseNotFoundError(this.config.database);
      }

      throw new DatabaseError(
        `Query failed [${label}]: ${error.message}`,
        sql.substring(0, 500),
        error
      );
    }
  }

  /**
   * Execute a query that modifies data (INSERT, UPDATE, DELETE).
   *
   * @param {string} sql - SQL query
   * @param {Array} [params=[]] - Query parameters
   * @param {string} [label] - Query label for logging
   * @returns {Promise<Object>} Result with affectedRows, insertId, etc.
   */
  async execute(sql, params = [], label = '') {
    const { rows: result } = await this.query(sql, params, label);
    return result;
  }

  /**
   * Begin a transaction.
   *
   * @returns {Promise<Object>} Connection with transaction
   */
  async beginTransaction() {
    const connection = await this.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  /**
   * Execute multiple queries in a transaction.
   *
   * @param {Function} callback - Async function receiving connection
   * @returns {Promise<*>} Result of callback
   */
  async transaction(callback) {
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Check if database connection is healthy.
   *
   * @returns {Promise<boolean>} True if healthy
   */
  async healthCheck() {
    try {
      await this.query('SELECT 1', [], 'health-check');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current metrics.
   *
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageQueryTime:
        this.metrics.totalQueries > 0
          ? this.metrics.totalTime / this.metrics.totalQueries
          : 0,
      isConnected: this.isConnected,
    };
  }

  /**
   * Reset metrics.
   */
  resetMetrics() {
    this.metrics = {
      totalQueries: 0,
      totalTime: 0,
      errors: 0,
      lastQueryTime: null,
    };
  }

  /**
   * Close all connections.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      this.logger.info?.('Database connection pool closed');
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a connection manager from environment variables.
 *
 * @param {Object} [options] - Additional options
 * @returns {ConnectionManager} Configured connection manager
 */
export function createConnectionFromEnv(options = {}) {
  return new ConnectionManager(
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'integram',
      connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    },
    options
  );
}

// ============================================================================
// Export
// ============================================================================

export default ConnectionManager;
