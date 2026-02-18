/**
 * ObjectService - Core CRUD operations for Integram objects
 *
 * Maps to PHP functions: Insert, Update_Val, UpdateTyp, Delete, BatchDelete
 * Provides object hierarchy management with parent-child relationships.
 */

import { ValidationError, NotFoundError, InjectionError } from '@integram/common';
import {
  buildInsert,
  buildUpdateVal,
  buildUpdateType,
  buildDelete,
  buildBatchDelete,
  buildCheckOccupied,
  buildGetMaxOrder,
  QueryBuilder,
} from '@integram/database';

/**
 * Service for managing Integram objects (CRUD operations).
 */
export class ObjectService {
  /**
   * Create a new ObjectService.
   *
   * @param {Object} databaseService - Database service instance
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   * @param {boolean} [options.logQueries=false] - Enable query logging
   */
  constructor(databaseService, options = {}) {
    this.db = databaseService;
    this.logger = options.logger || console;
    this.logQueries = options.logQueries || false;
  }

  /**
   * Get an object by ID.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @returns {Promise<Object|null>} Object data or null if not found
   */
  async getById(database, id) {
    const { rows } = await this.db.execSql(
      `SELECT id, up, ord, t, val FROM ${database} WHERE id = ?`,
      [parseInt(id, 10)],
      'Get object by ID'
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get objects by type.
   *
   * @param {string} database - Database name
   * @param {number} type - Type ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit] - Maximum rows
   * @param {number} [options.offset] - Skip rows
   * @param {string} [options.orderBy='ord'] - Order column
   * @param {string} [options.orderDir='ASC'] - Order direction
   * @returns {Promise<Array>} Array of objects
   */
  async getByType(database, type, options = {}) {
    const {
      limit = null,
      offset = null,
      orderBy = 'ord',
      orderDir = 'ASC',
    } = options;

    let sql = `SELECT id, up, ord, t, val FROM ${database} WHERE t = ?`;
    const params = [parseInt(type, 10)];

    sql += ` ORDER BY ${orderBy} ${orderDir}`;

    if (limit !== null) {
      sql += ` LIMIT ?`;
      params.push(parseInt(limit, 10));
    }

    if (offset !== null) {
      sql += ` OFFSET ?`;
      params.push(parseInt(offset, 10));
    }

    const { rows } = await this.db.execSql(sql, params, 'Get objects by type');
    return rows;
  }

  /**
   * Get children of an object.
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @param {number} [type] - Optional type filter
   * @returns {Promise<Array>} Array of child objects
   */
  async getChildren(database, parentId, type = null) {
    let sql = `SELECT id, up, ord, t, val FROM ${database} WHERE up = ?`;
    const params = [parseInt(parentId, 10)];

    if (type !== null) {
      sql += ` AND t = ?`;
      params.push(parseInt(type, 10));
    }

    sql += ` ORDER BY ord`;

    const { rows } = await this.db.execSql(sql, params, 'Get children');
    return rows;
  }

  /**
   * Get an attribute of an object.
   * Maps to PHP pattern: Get attribute from object.
   *
   * @param {string} database - Database name
   * @param {number} objectId - Object ID
   * @param {number} typeId - Attribute type ID
   * @returns {Promise<Object|null>} Attribute data or null
   */
  async getAttribute(database, objectId, typeId) {
    const { rows } = await this.db.execSql(
      `SELECT id, up, ord, t, val FROM ${database} WHERE up = ? AND t = ?`,
      [parseInt(objectId, 10), parseInt(typeId, 10)],
      'Get attribute'
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get multiple attributes of an object.
   *
   * @param {string} database - Database name
   * @param {number} objectId - Object ID
   * @param {Array<number>} typeIds - Array of attribute type IDs
   * @returns {Promise<Object>} Object with typeId as keys and attribute values
   */
  async getAttributes(database, objectId, typeIds) {
    const placeholders = typeIds.map(() => '?').join(',');
    const { rows } = await this.db.execSql(
      `SELECT id, up, ord, t, val FROM ${database} WHERE up = ? AND t IN (${placeholders})`,
      [parseInt(objectId, 10), ...typeIds.map((t) => parseInt(t, 10))],
      'Get attributes'
    );

    const result = {};
    for (const row of rows) {
      result[row.t] = row;
    }
    return result;
  }

  /**
   * Insert a new object.
   * Maps to PHP: Insert()
   *
   * @param {string} database - Database name
   * @param {number} up - Parent ID
   * @param {number} ord - Order value (0 for auto)
   * @param {number} t - Type ID
   * @param {string} val - Value
   * @param {string} [label='Insert'] - Query label for logging
   * @returns {Promise<number>} Inserted object ID
   */
  async insert(database, up, ord, t, val, label = 'Insert') {
    // Auto-calculate order if 0
    let finalOrd = ord;
    if (ord === 0) {
      finalOrd = await this.getNextOrder(database, up, t);
    }

    const { sql, params } = buildInsert(database, up, finalOrd, t, val);
    const result = await this.db.cm.execute(sql, params, label);

    if (this.logQueries) {
      this.logger.info(`[${label}] Inserted ID: ${result.insertId}`);
    }

    return result.insertId;
  }

  /**
   * Insert multiple objects in a batch.
   * Maps to PHP: Insert_batch()
   *
   * @param {string} database - Database name
   * @param {Array<Object>} objects - Array of {up, ord, t, val}
   * @param {string} [label='Batch insert'] - Query label
   * @returns {Promise<number>} Number of inserted rows
   */
  async insertBatch(database, objects, label = 'Batch insert') {
    if (objects.length === 0) return 0;

    const values = [];
    const params = [];

    for (const obj of objects) {
      values.push('(?, ?, ?, ?)');
      params.push(obj.up, obj.ord, obj.t, obj.val);
    }

    const sql = `INSERT INTO ${database} (up, ord, t, val) VALUES ${values.join(',')}`;
    const result = await this.db.cm.execute(sql, params, label);

    return result.affectedRows;
  }

  /**
   * Update object value.
   * Maps to PHP: Update_Val()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {string} val - New value
   * @param {string} [label='Update value'] - Query label
   * @returns {Promise<boolean>} True if updated
   */
  async updateValue(database, id, val, label = 'Update value') {
    const { sql, params } = buildUpdateVal(database, id, val);
    const result = await this.db.cm.execute(sql, params, label);
    return result.affectedRows > 0;
  }

  /**
   * Update object type.
   * Maps to PHP: UpdateTyp()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} t - New type ID
   * @param {string} [label='Update type'] - Query label
   * @returns {Promise<boolean>} True if updated
   */
  async updateType(database, id, t, label = 'Update type') {
    const { sql, params } = buildUpdateType(database, id, t);
    const result = await this.db.cm.execute(sql, params, label);
    return result.affectedRows > 0;
  }

  /**
   * Update object order.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} ord - New order value
   * @param {string} [label='Update order'] - Query label
   * @returns {Promise<boolean>} True if updated
   */
  async updateOrder(database, id, ord, label = 'Update order') {
    const sql = `UPDATE ${database} SET ord = ? WHERE id = ?`;
    const result = await this.db.cm.execute(sql, [ord, id], label);
    return result.affectedRows > 0;
  }

  /**
   * Update object parent.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} up - New parent ID
   * @param {string} [label='Update parent'] - Query label
   * @returns {Promise<boolean>} True if updated
   */
  async updateParent(database, id, up, label = 'Update parent') {
    const sql = `UPDATE ${database} SET up = ? WHERE id = ?`;
    const result = await this.db.cm.execute(sql, [up, id], label);
    return result.affectedRows > 0;
  }

  /**
   * Update or insert an attribute.
   * If attribute exists, update it; otherwise insert.
   *
   * @param {string} database - Database name
   * @param {number} objectId - Parent object ID
   * @param {number} typeId - Attribute type ID
   * @param {string} val - Value
   * @returns {Promise<number>} Attribute ID
   */
  async upsertAttribute(database, objectId, typeId, val) {
    const existing = await this.getAttribute(database, objectId, typeId);

    if (existing) {
      await this.updateValue(database, existing.id, val, 'Update attribute');
      return existing.id;
    } else {
      return this.insert(database, objectId, 1, typeId, val, 'Insert attribute');
    }
  }

  /**
   * Delete an object and optionally its children.
   * Maps to PHP: Delete()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {boolean} [deleteChildren=true] - Also delete children
   * @param {string} [label='Delete'] - Query label
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(database, id, deleteChildren = true, label = 'Delete') {
    if (deleteChildren) {
      await this.deleteRecursive(database, id);
    }

    const { sql, params } = buildDelete(database, id);
    const result = await this.db.cm.execute(sql, params, label);
    return result.affectedRows > 0;
  }

  /**
   * Delete children of an object recursively.
   * Maps to PHP: Delete() internal recursion
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @returns {Promise<void>}
   */
  async deleteRecursive(database, parentId) {
    // Get all children
    const { rows: children } = await this.db.execSql(
      `SELECT id FROM ${database} WHERE up = ?`,
      [parentId],
      'Get children for delete'
    );

    // Recursively delete each child's children
    for (const child of children) {
      await this.deleteRecursive(database, child.id);
    }

    // Delete all children
    if (children.length > 0) {
      const { sql, params } = buildBatchDelete(database, parentId);
      await this.db.cm.execute(sql, params, 'Delete children');
    }
  }

  /**
   * Batch delete objects by IDs.
   * Maps to PHP: BatchDelete()
   *
   * @param {string} database - Database name
   * @param {Array<number>} ids - Object IDs to delete
   * @param {string} [label='Batch delete'] - Query label
   * @returns {Promise<number>} Number of deleted rows
   */
  async batchDelete(database, ids, label = 'Batch delete') {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const sql = `DELETE FROM ${database} WHERE id IN (${placeholders})`;
    const result = await this.db.cm.execute(
      sql,
      ids.map((id) => parseInt(id, 10)),
      label
    );
    return result.affectedRows;
  }

  /**
   * Check if an ID exists.
   * Maps to PHP: IsOccupied()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @returns {Promise<boolean>} True if exists
   */
  async exists(database, id) {
    const { sql, params } = buildCheckOccupied(database, id);
    const { rows } = await this.db.execSql(sql, params, 'Check exists');
    return rows.length > 0;
  }

  /**
   * Get next order value for a parent.
   * Maps to PHP: Get_Ord() / Calc_Order()
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @param {number} [typeId] - Optional type filter
   * @returns {Promise<number>} Next order value
   */
  async getNextOrder(database, parentId, typeId = null) {
    const { sql, params } = buildGetMaxOrder(database, parentId, typeId);
    const { rows } = await this.db.execSql(sql, params, 'Get next order');

    const maxOrdPlusOne = rows[0]?.['MAX(ord) + 1'];
    return maxOrdPlusOne || 1;
  }

  /**
   * Count objects by type.
   *
   * @param {string} database - Database name
   * @param {number} type - Type ID
   * @returns {Promise<number>} Count
   */
  async countByType(database, type) {
    const { rows } = await this.db.execSql(
      `SELECT COUNT(*) as count FROM ${database} WHERE t = ?`,
      [parseInt(type, 10)],
      'Count by type'
    );
    return rows[0]?.count || 0;
  }

  /**
   * Count children of an object.
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @param {number} [type] - Optional type filter
   * @returns {Promise<number>} Count
   */
  async countChildren(database, parentId, type = null) {
    let sql = `SELECT COUNT(*) as count FROM ${database} WHERE up = ?`;
    const params = [parseInt(parentId, 10)];

    if (type !== null) {
      sql += ` AND t = ?`;
      params.push(parseInt(type, 10));
    }

    const { rows } = await this.db.execSql(sql, params, 'Count children');
    return rows[0]?.count || 0;
  }

  /**
   * Search objects by value.
   *
   * @param {string} database - Database name
   * @param {string} searchTerm - Search term
   * @param {Object} [options] - Search options
   * @param {number} [options.type] - Filter by type
   * @param {number} [options.limit=100] - Maximum results
   * @param {boolean} [options.exact=false] - Exact match instead of LIKE
   * @returns {Promise<Array>} Matching objects
   */
  async search(database, searchTerm, options = {}) {
    const { type = null, limit = 100, exact = false } = options;

    let sql = `SELECT id, up, ord, t, val FROM ${database} WHERE `;
    const params = [];

    if (exact) {
      sql += `val = ?`;
      params.push(searchTerm);
    } else {
      sql += `val LIKE ?`;
      params.push(`%${searchTerm}%`);
    }

    if (type !== null) {
      sql += ` AND t = ?`;
      params.push(parseInt(type, 10));
    }

    sql += ` ORDER BY val LIMIT ?`;
    params.push(parseInt(limit, 10));

    const { rows } = await this.db.execSql(sql, params, 'Search objects');
    return rows;
  }

  /**
   * Get object with full hierarchy path.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} [maxDepth=10] - Maximum depth to traverse
   * @returns {Promise<Object>} Object with path array
   */
  async getWithPath(database, id, maxDepth = 10) {
    const obj = await this.getById(database, id);
    if (!obj) return null;

    const path = [obj];
    let current = obj;
    let depth = 0;

    while (current.up > 0 && depth < maxDepth) {
      const parent = await this.getById(database, current.up);
      if (!parent) break;
      path.unshift(parent);
      current = parent;
      depth++;
    }

    return {
      ...obj,
      path,
      depth: path.length - 1,
    };
  }
}

export default ObjectService;
