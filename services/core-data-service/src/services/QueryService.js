/**
 * @integram/core-data-service - QueryService
 *
 * Advanced query operations for Integram data.
 * Maps to PHP functions: Exec_sql(), Construct_WHERE(), Compile_Report()
 */

import {
  ValidationError,
  InjectionError,
  hasInjectionPattern,
  DEFAULT_LIMIT,
  BASIC_TYPES,
} from '@integram/common';

import { QueryBuilder } from '@integram/database';
import { ValidationService } from './ValidationService.js';

// ============================================================================
// QueryService Class
// ============================================================================

/**
 * Service for executing complex queries on Integram data.
 * Provides parameterized query building and execution.
 */
export class QueryService {
  /**
   * Create a new query service.
   *
   * @param {Object} databaseService - Database service instance
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   * @param {ValidationService} [options.validationService] - Validation service
   */
  constructor(databaseService, options = {}) {
    this.db = databaseService;
    this.logger = options.logger || console;
    this.validation = options.validationService || new ValidationService(options);
  }

  // ============================================================================
  // Basic Query Execution
  // ============================================================================

  /**
   * Execute a raw SQL query.
   * Maps to PHP: Exec_sql()
   *
   * Note: SQL injection protection is handled by using parameterized queries.
   * The hasInjectionPattern check is for user input values, not SQL itself.
   *
   * @param {string} sql - SQL query
   * @param {Array} [params=[]] - Query parameters
   * @param {string} [label] - Query label for logging
   * @returns {Promise<Object>} Query result
   */
  async execute(sql, params = [], label = '') {
    // Note: We don't check the SQL itself for injection patterns as SELECT, FROM, TABLE
    // are legitimate SQL keywords. Injection protection comes from:
    // 1. Using parameterized queries (params array)
    // 2. ValidationService checking user input before it enters queries

    const startTime = Date.now();
    const result = await this.db.execSql(sql, params, label);
    const duration = Date.now() - startTime;

    this.logger.debug('Query executed', { label, duration, rowCount: result.rows?.length });

    return result;
  }

  /**
   * Execute a query and return rows only.
   *
   * @param {string} sql - SQL query
   * @param {Array} [params=[]] - Query parameters
   * @returns {Promise<Array>} Result rows
   */
  async executeRows(sql, params = []) {
    const result = await this.execute(sql, params);
    return result.rows || [];
  }

  /**
   * Execute a query and return first row.
   *
   * @param {string} sql - SQL query
   * @param {Array} [params=[]] - Query parameters
   * @returns {Promise<Object|null>} First row or null
   */
  async executeOne(sql, params = []) {
    const rows = await this.executeRows(sql, params);
    return rows[0] || null;
  }

  // ============================================================================
  // Query Builder Integration
  // ============================================================================

  /**
   * Create a query builder for a database.
   *
   * @param {string} database - Database name
   * @returns {QueryBuilder} Query builder instance
   */
  createBuilder(database) {
    const db = this.validation.validateDatabase(database);
    return QueryBuilder.from(db);
  }

  /**
   * Execute a query builder.
   *
   * @param {QueryBuilder} builder - Query builder
   * @param {string} [label] - Query label
   * @returns {Promise<Array>} Result rows
   */
  async executeBuilder(builder, label = '') {
    const { sql, params } = builder.buildSelect();
    return this.executeRows(sql, params);
  }

  // ============================================================================
  // Object Queries
  // ============================================================================

  /**
   * Query objects with filters.
   * Main query method with full filtering support.
   *
   * @param {string} database - Database name
   * @param {Object} [filters] - Query filters
   * @param {number} [filters.typeId] - Filter by type
   * @param {number} [filters.parentId] - Filter by parent
   * @param {string} [filters.value] - Filter by value (LIKE)
   * @param {Array<number>} [filters.ids] - Filter by IDs
   * @param {number} [filters.limit] - Limit results
   * @param {number} [filters.offset] - Offset results
   * @param {string} [filters.orderBy] - Order by field
   * @param {string} [filters.sortDir] - Sort direction
   * @returns {Promise<Array>} Result objects
   */
  async queryObjects(database, filters = {}) {
    const db = this.validation.validateDatabase(database);
    const builder = this.createBuilder(database)
      .select('id', 'val', 'up', 't', 'ord');

    // Apply type filter
    if (filters.typeId !== undefined) {
      builder.whereType(this.validation.validateTypeId(filters.typeId));
    }

    // Apply parent filter
    if (filters.parentId !== undefined) {
      builder.whereParent(this.validation.validateParentId(filters.parentId));
    }

    // Apply value filter
    if (filters.value !== undefined) {
      builder.where('val', 'LIKE', `%${filters.value}%`);
    }

    // Apply IDs filter
    if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
      const validIds = filters.ids.map(id => this.validation.validateId(id));
      builder.where('id', 'IN', validIds);
    }

    // Apply ordering
    if (filters.orderBy) {
      const sortDir = (filters.sortDir || 'ASC').toUpperCase();
      builder.orderBy(filters.orderBy, sortDir);
    } else {
      builder.orderBy('ord', 'ASC');
    }

    // Apply limit and offset
    const limit = filters.limit !== undefined ? parseInt(filters.limit, 10) : DEFAULT_LIMIT;
    builder.limit(limit);

    if (filters.offset !== undefined) {
      builder.offset(parseInt(filters.offset, 10));
    }

    return this.executeBuilder(builder, 'QueryService.queryObjects');
  }

  /**
   * Query objects with requisites (joined).
   *
   * @param {string} database - Database name
   * @param {Object} filters - Query filters
   * @param {Array<number>} [requisiteTypes] - Requisite types to include
   * @returns {Promise<Array>} Objects with requisites
   */
  async queryObjectsWithRequisites(database, filters = {}, requisiteTypes = []) {
    // First get the objects
    const objects = await this.queryObjects(database, filters);

    if (objects.length === 0) {
      return [];
    }

    // Get IDs
    const objectIds = objects.map(obj => obj.id);

    // Query requisites for these objects
    const requisitesBuilder = this.createBuilder(database)
      .select('id', 'val', 'up', 't')
      .where('up', 'IN', objectIds)
      .orderBy('up', 'ASC')
      .orderBy('ord', 'ASC');

    // Filter by requisite types if provided
    if (requisiteTypes.length > 0) {
      requisitesBuilder.where('t', 'IN', requisiteTypes);
    }

    const requisites = await this.executeBuilder(requisitesBuilder, 'QueryService.queryObjectsWithRequisites');

    // Group requisites by parent
    const requisitesByParent = {};
    for (const req of requisites) {
      if (!requisitesByParent[req.up]) {
        requisitesByParent[req.up] = {};
      }
      if (!requisitesByParent[req.up][req.t]) {
        requisitesByParent[req.up][req.t] = [];
      }
      requisitesByParent[req.up][req.t].push({
        id: req.id,
        value: req.val,
      });
    }

    // Merge requisites into objects
    return objects.map(obj => ({
      id: obj.id,
      value: obj.val,
      parentId: obj.up,
      typeId: obj.t,
      order: obj.ord,
      requisites: requisitesByParent[obj.id] || {},
    }));
  }

  /**
   * Search objects by value.
   *
   * @param {string} database - Database name
   * @param {string} searchTerm - Search term
   * @param {Object} [options] - Search options
   * @param {number} [options.typeId] - Limit to type
   * @param {number} [options.limit] - Limit results
   * @returns {Promise<Array>} Matching objects
   */
  async searchObjects(database, searchTerm, options = {}) {
    const db = this.validation.validateDatabase(database);
    const term = this.validation.validateValue(searchTerm);
    const limit = options.limit || DEFAULT_LIMIT;

    const builder = this.createBuilder(database)
      .select('id', 'val', 'up', 't', 'ord')
      .where('val', 'LIKE', `%${term}%`)
      .orderBy('val', 'ASC')
      .limit(limit);

    if (options.typeId !== undefined) {
      builder.whereType(this.validation.validateTypeId(options.typeId));
    }

    return this.executeBuilder(builder, 'QueryService.searchObjects');
  }

  // ============================================================================
  // Aggregation Queries
  // ============================================================================

  /**
   * Count objects by criteria.
   *
   * @param {string} database - Database name
   * @param {Object} [filters] - Filter criteria
   * @returns {Promise<number>} Object count
   */
  async countObjects(database, filters = {}) {
    const db = this.validation.validateDatabase(database);
    const builder = this.createBuilder(database)
      .select('COUNT(*) as count');

    if (filters.typeId !== undefined) {
      builder.whereType(this.validation.validateTypeId(filters.typeId));
    }

    if (filters.parentId !== undefined) {
      builder.whereParent(this.validation.validateParentId(filters.parentId));
    }

    const rows = await this.executeBuilder(builder, 'QueryService.countObjects');
    return rows[0]?.count || 0;
  }

  /**
   * Get max value for a column.
   *
   * @param {string} database - Database name
   * @param {string} column - Column name
   * @param {Object} [filters] - Filter criteria
   * @returns {Promise<*>} Max value
   */
  async getMax(database, column, filters = {}) {
    if (hasInjectionPattern(column)) {
      throw new InjectionError(column);
    }

    const db = this.validation.validateDatabase(database);
    const builder = this.createBuilder(database)
      .select(`MAX(${column}) as max_val`);

    if (filters.typeId !== undefined) {
      builder.whereType(this.validation.validateTypeId(filters.typeId));
    }

    if (filters.parentId !== undefined) {
      builder.whereParent(this.validation.validateParentId(filters.parentId));
    }

    const rows = await this.executeBuilder(builder, 'QueryService.getMax');
    return rows[0]?.max_val;
  }

  /**
   * Get min value for a column.
   *
   * @param {string} database - Database name
   * @param {string} column - Column name
   * @param {Object} [filters] - Filter criteria
   * @returns {Promise<*>} Min value
   */
  async getMin(database, column, filters = {}) {
    if (hasInjectionPattern(column)) {
      throw new InjectionError(column);
    }

    const db = this.validation.validateDatabase(database);
    const builder = this.createBuilder(database)
      .select(`MIN(${column}) as min_val`);

    if (filters.typeId !== undefined) {
      builder.whereType(this.validation.validateTypeId(filters.typeId));
    }

    const rows = await this.executeBuilder(builder, 'QueryService.getMin');
    return rows[0]?.min_val;
  }

  /**
   * Group and count objects by type.
   *
   * @param {string} database - Database name
   * @param {Object} [filters] - Filter criteria
   * @returns {Promise<Array>} Type counts
   */
  async countByType(database, filters = {}) {
    const db = this.validation.validateDatabase(database);
    const builder = this.createBuilder(database)
      .select('t', 'COUNT(*) as count')
      .groupBy('t')
      .orderBy('count', 'DESC');

    if (filters.parentId !== undefined) {
      builder.whereParent(this.validation.validateParentId(filters.parentId));
    }

    return this.executeBuilder(builder, 'QueryService.countByType');
  }

  // ============================================================================
  // Legacy Format Queries
  // ============================================================================

  /**
   * Query and return in JSON_DATA format (legacy).
   * Maps to PHP: JSON_DATA response format
   *
   * Format: [["column1", "column2", ...], ["val1", "val2", ...], ...]
   *
   * @param {string} database - Database name
   * @param {Object} [filters] - Query filters
   * @param {Array<string>} [columns] - Columns to include
   * @returns {Promise<Array>} JSON_DATA format array
   */
  async queryJsonData(database, filters = {}, columns = ['id', 'val', 'up', 't', 'ord']) {
    const objects = await this.queryObjects(database, filters);

    if (objects.length === 0) {
      return [columns];
    }

    // Create header row
    const result = [columns];

    // Add data rows
    for (const obj of objects) {
      const row = columns.map(col => {
        switch (col) {
          case 'id': return String(obj.id);
          case 'val': return obj.val || '';
          case 'up': return String(obj.up);
          case 't': return String(obj.t);
          case 'ord': return String(obj.ord);
          default: return '';
        }
      });
      result.push(row);
    }

    return result;
  }

  /**
   * Query and return in JSON_KV format (legacy).
   * Maps to PHP: JSON_KV response format
   *
   * Format: { id: value, id: value, ... }
   *
   * @param {string} database - Database name
   * @param {Object} [filters] - Query filters
   * @returns {Promise<Object>} JSON_KV format object
   */
  async queryJsonKv(database, filters = {}) {
    const objects = await this.queryObjects(database, filters);

    const result = {};
    for (const obj of objects) {
      result[obj.id] = obj.val;
    }

    return result;
  }

  /**
   * Query and return in JSON_CR format (legacy).
   * Maps to PHP: JSON_CR response format (object with columns and rows)
   *
   * @param {string} database - Database name
   * @param {Object} [filters] - Query filters
   * @returns {Promise<Object>} JSON_CR format object
   */
  async queryJsonCr(database, filters = {}) {
    const objects = await this.queryObjects(database, filters);

    return {
      columns: ['id', 'val', 'up', 't', 'ord'],
      rows: objects.map(obj => ({
        id: obj.id,
        val: obj.val,
        up: obj.up,
        t: obj.t,
        ord: obj.ord,
      })),
    };
  }

  // ============================================================================
  // Type Schema Queries
  // ============================================================================

  /**
   * Get type schema (requisites definition).
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @returns {Promise<Array>} Requisite definitions
   */
  async getTypeSchema(database, typeId) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);

    const builder = this.createBuilder(database)
      .select('id', 'val', 't', 'ord')
      .whereParent(type)
      .orderBy('ord', 'ASC');

    const requisites = await this.executeBuilder(builder, 'QueryService.getTypeSchema');

    return requisites.map(req => ({
      id: req.id,
      name: req.val,
      typeId: req.t,
      order: req.ord,
      basicType: BASIC_TYPES[req.t] || 'UNKNOWN',
    }));
  }

  /**
   * Get all types in database.
   *
   * @param {string} database - Database name
   * @returns {Promise<Array>} Type definitions
   */
  async getTypes(database) {
    const db = this.validation.validateDatabase(database);

    // Types are objects with up=0 (root level)
    const builder = this.createBuilder(database)
      .select('id', 'val', 't', 'ord')
      .whereParent(0)
      .orderBy('val', 'ASC');

    const types = await this.executeBuilder(builder, 'QueryService.getTypes');

    return types.map(type => ({
      id: type.id,
      name: type.val,
      baseType: type.t,
      order: type.ord,
    }));
  }

  // ============================================================================
  // Tree Queries
  // ============================================================================

  /**
   * Get object tree (object with all descendants).
   *
   * @param {string} database - Database name
   * @param {number} rootId - Root object ID
   * @param {Object} [options] - Query options
   * @param {number} [options.maxDepth=10] - Maximum depth
   * @returns {Promise<Object>} Tree structure
   */
  async getTree(database, rootId, options = {}) {
    const maxDepth = options.maxDepth || 10;

    const buildTree = async (parentId, depth = 0) => {
      if (depth >= maxDepth) {
        return [];
      }

      const children = await this.queryObjects(database, {
        parentId,
        orderBy: 'ord',
        sortDir: 'ASC',
      });

      return Promise.all(children.map(async child => ({
        id: child.id,
        value: child.val,
        typeId: child.t,
        order: child.ord,
        children: await buildTree(child.id, depth + 1),
      })));
    };

    // Get root object
    const root = await this.executeOne(
      `SELECT id, val, up, t, ord FROM ${database} WHERE id = ?`,
      [this.validation.validateId(rootId)]
    );

    if (!root) {
      return null;
    }

    return {
      id: root.id,
      value: root.val,
      parentId: root.up,
      typeId: root.t,
      order: root.ord,
      children: await buildTree(root.id),
    };
  }

  /**
   * Get ancestors (path to root).
   *
   * @param {string} database - Database name
   * @param {number} objectId - Object ID
   * @returns {Promise<Array>} Ancestor path
   */
  async getAncestors(database, objectId) {
    const db = this.validation.validateDatabase(database);
    let currentId = this.validation.validateId(objectId);
    const ancestors = [];
    const visited = new Set();

    while (currentId !== 0) {
      // Prevent infinite loops
      if (visited.has(currentId)) {
        this.logger.warn('Circular reference detected in ancestors', { objectId, currentId });
        break;
      }
      visited.add(currentId);

      const obj = await this.executeOne(
        `SELECT id, val, up, t, ord FROM ${db} WHERE id = ?`,
        [currentId]
      );

      if (!obj) {
        break;
      }

      ancestors.unshift({
        id: obj.id,
        value: obj.val,
        parentId: obj.up,
        typeId: obj.t,
      });

      currentId = obj.up;
    }

    return ancestors;
  }
}

// ============================================================================
// Export
// ============================================================================

export default QueryService;
