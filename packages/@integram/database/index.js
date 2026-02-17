/**
 * @integram/database - Main Entry Point
 *
 * Database abstraction layer for Integram services.
 * Provides connection management, query building, and metrics tracking.
 */

// ============================================================================
// Re-export all modules
// ============================================================================

export * from './connection.js';
export * from './query-builder.js';

// ============================================================================
// Import defaults
// ============================================================================

import ConnectionManager, { createConnectionFromEnv } from './connection.js';
import QueryBuilder, {
  buildInsert,
  buildUpdateVal,
  buildUpdateType,
  buildDelete,
  buildBatchDelete,
  buildCheckOccupied,
  buildGetMaxOrder,
  buildCalcOrder,
} from './query-builder.js';

// ============================================================================
// Package information
// ============================================================================

export const PACKAGE_NAME = '@integram/database';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// Database Service Class
// ============================================================================

/**
 * High-level database service that combines connection management
 * and query building for Integram operations.
 *
 * Maps to PHP: Exec_sql(), Insert(), Update_Val(), Delete(), etc.
 */
export class DatabaseService {
  /**
   * Create a new database service.
   *
   * @param {ConnectionManager} connectionManager - Connection manager instance
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(connectionManager, options = {}) {
    this.cm = connectionManager;
    this.logger = options.logger || console;
  }

  /**
   * Execute a raw SQL query.
   * Maps to PHP: Exec_sql()
   *
   * @param {string} sql - SQL query
   * @param {Array} [params=[]] - Query parameters
   * @param {string} [label] - Query label for logging
   * @returns {Promise<Object>} Query result
   */
  async execSql(sql, params = [], label = '') {
    return this.cm.query(sql, params, label);
  }

  /**
   * Insert a new object.
   * Maps to PHP: Insert()
   *
   * @param {string} database - Database name
   * @param {number} up - Parent ID
   * @param {number} ord - Order value
   * @param {number} t - Type ID
   * @param {string} val - Value
   * @param {string} [label] - Query label
   * @returns {Promise<number>} Inserted ID
   */
  async insert(database, up, ord, t, val, label = 'Insert') {
    const { sql, params } = buildInsert(database, up, ord, t, val);
    const result = await this.cm.execute(sql, params, label);
    return result.insertId;
  }

  /**
   * Update object value.
   * Maps to PHP: Update_Val()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {string} val - New value
   * @param {string} [label] - Query label
   * @returns {Promise<boolean>} Success
   */
  async updateVal(database, id, val, label = 'Update value') {
    const { sql, params } = buildUpdateVal(database, id, val);
    const result = await this.cm.execute(sql, params, label);
    return result.affectedRows > 0;
  }

  /**
   * Update object type.
   * Maps to PHP: UpdateTyp()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} t - New type ID
   * @param {string} [label] - Query label
   * @returns {Promise<boolean>} Success
   */
  async updateType(database, id, t, label = 'Update type') {
    const { sql, params } = buildUpdateType(database, id, t);
    const result = await this.cm.execute(sql, params, label);
    return result.affectedRows > 0;
  }

  /**
   * Delete an object.
   * Maps to PHP: Delete()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {string} [label] - Query label
   * @returns {Promise<boolean>} Success
   */
  async delete(database, id, label = 'Delete') {
    const { sql, params } = buildDelete(database, id);
    const result = await this.cm.execute(sql, params, label);
    return result.affectedRows > 0;
  }

  /**
   * Delete all children of an object.
   * Maps to PHP: BatchDelete()
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @param {string} [label] - Query label
   * @returns {Promise<number>} Number of deleted rows
   */
  async batchDelete(database, parentId, label = 'Batch delete') {
    const { sql, params } = buildBatchDelete(database, parentId);
    const result = await this.cm.execute(sql, params, label);
    return result.affectedRows;
  }

  /**
   * Check if an ID is occupied.
   * Maps to PHP: IsOccupied()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @returns {Promise<boolean>} True if occupied
   */
  async isOccupied(database, id) {
    const { sql, params } = buildCheckOccupied(database, id);
    const { rows } = await this.cm.query(sql, params, 'Check occupied');
    return rows.length > 0;
  }

  /**
   * Get next order value for a parent.
   * Maps to PHP: Get_Ord()
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @param {number} [typeId] - Optional type filter
   * @returns {Promise<number>} Next order value
   */
  async getNextOrder(database, parentId, typeId = null) {
    const { sql, params } = buildGetMaxOrder(database, parentId, typeId);
    const { rows } = await this.cm.query(sql, params, 'Get order');
    return rows[0]?.['MAX(ord) + 1'] || 1;
  }

  /**
   * Create a query builder for a database.
   *
   * @param {string} database - Database name
   * @returns {QueryBuilder} Query builder
   */
  query(database) {
    return QueryBuilder.from(database);
  }

  /**
   * Execute a query builder.
   *
   * @param {QueryBuilder} queryBuilder - Query builder
   * @param {string} [label] - Query label
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(queryBuilder, label = '') {
    const { sql, params } = queryBuilder.buildSelect();
    return this.cm.query(sql, params, label);
  }

  /**
   * Check database connection health.
   *
   * @returns {Promise<boolean>} True if healthy
   */
  async healthCheck() {
    return this.cm.healthCheck();
  }

  /**
   * Get connection metrics.
   *
   * @returns {Object} Metrics
   */
  getMetrics() {
    return this.cm.getMetrics();
  }

  /**
   * Close database connections.
   *
   * @returns {Promise<void>}
   */
  async close() {
    return this.cm.close();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a database service from environment variables.
 *
 * @param {Object} [options] - Service options
 * @returns {DatabaseService} Configured database service
 */
export function createDatabaseServiceFromEnv(options = {}) {
  const cm = createConnectionFromEnv(options);
  return new DatabaseService(cm, options);
}

// ============================================================================
// Export default object
// ============================================================================

export default {
  // Classes
  ConnectionManager,
  QueryBuilder,
  DatabaseService,

  // Factory functions
  createConnectionFromEnv,
  createDatabaseServiceFromEnv,

  // Query builders
  buildInsert,
  buildUpdateVal,
  buildUpdateType,
  buildDelete,
  buildBatchDelete,
  buildCheckOccupied,
  buildGetMaxOrder,
  buildCalcOrder,

  // Package info
  PACKAGE_NAME,
  PACKAGE_VERSION,
};
