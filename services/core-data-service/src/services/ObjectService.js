/**
 * @integram/core-data-service - ObjectService
 *
 * Handles CRUD operations on Integram objects.
 * Maps to PHP functions: Insert(), Update_Val(), Delete(), BatchDelete()
 */

import {
  ValidationError,
} from '@integram/common';

import { ValidationService } from './ValidationService.js';

// Local NotFoundError class
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
    this.statusCode = 404;
  }
}

// ============================================================================
// ObjectService Class
// ============================================================================

/**
 * Service for managing Integram objects (CRUD operations).
 * Provides full compatibility with PHP monolith behavior.
 */
export class ObjectService {
  /**
   * Create a new object service.
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
  // CREATE Operations
  // ============================================================================

  /**
   * Create a new object.
   * Maps to PHP: Insert()
   *
   * @param {string} database - Database name
   * @param {Object} data - Object data
   * @param {string} data.value - Object value (val)
   * @param {number} data.typeId - Type ID (t)
   * @param {number} [data.parentId=0] - Parent ID (up)
   * @param {number} [data.order] - Order value (ord), auto-calculated if not provided
   * @param {Object} [data.requisites] - Requisite values
   * @returns {Promise<Object>} Created object with ID
   */
  async create(database, data) {
    // Validate inputs
    const db = this.validation.validateDatabase(database);
    const typeId = this.validation.validateTypeId(data.typeId || data.t);
    const parentId = this.validation.validateParentId(data.parentId ?? data.up ?? 0);
    // Use ?? instead of || to properly handle empty string ''
    const value = this.validation.validateValue(data.value ?? data.val, { allowEmpty: false });

    // Calculate order if not provided
    let order = data.order ?? data.ord;
    if (order === undefined || order === null) {
      order = await this.db.getNextOrder(db, parentId, typeId);
    } else {
      order = this.validation.validateOrder(order);
    }

    // Insert the object
    const id = await this.db.insert(db, parentId, order, typeId, value, 'ObjectService.create');

    this.logger.info('Object created', { database: db, id, typeId, parentId });

    // If requisites are provided, save them
    if (data.requisites && Object.keys(data.requisites).length > 0) {
      await this.saveRequisites(database, id, data.requisites);
    }

    return {
      id,
      value,
      typeId,
      parentId,
      order,
    };
  }

  /**
   * Create multiple objects in batch.
   * Maps to PHP: Insert_batch()
   *
   * @param {string} database - Database name
   * @param {Array} objects - Array of object data
   * @param {Object} [options] - Batch options
   * @param {number} [options.parentId] - Common parent ID
   * @param {number} [options.typeId] - Common type ID
   * @returns {Promise<Array<number>>} Array of created IDs
   */
  async createBatch(database, objects, options = {}) {
    const db = this.validation.validateDatabase(database);
    const validated = this.validation.validateBatch(objects);
    const commonParentId = options.parentId !== undefined ? this.validation.validateParentId(options.parentId) : null;
    const commonTypeId = options.typeId !== undefined ? this.validation.validateTypeId(options.typeId) : null;

    const ids = [];

    for (const obj of validated) {
      const typeId = commonTypeId ?? obj.typeId;
      const parentId = commonParentId ?? obj.parentId ?? 0;

      if (!typeId) {
        throw new ValidationError('Type ID is required for batch insert');
      }

      const order = obj.order ?? await this.db.getNextOrder(db, parentId, typeId);

      const id = await this.db.insert(db, parentId, order, typeId, obj.value, 'ObjectService.createBatch');
      ids.push(id);

      // Save requisites if provided
      if (obj.requisites && Object.keys(obj.requisites).length > 0) {
        await this.saveRequisites(database, id, obj.requisites);
      }
    }

    this.logger.info('Batch objects created', { database: db, count: ids.length });

    return ids;
  }

  // ============================================================================
  // READ Operations
  // ============================================================================

  /**
   * Get an object by ID.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {Object} [options] - Query options
   * @param {boolean} [options.includeRequisites=false] - Include requisite values
   * @returns {Promise<Object|null>} Object data or null
   */
  async getById(database, id, options = {}) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);

    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .whereId(objId);

    const { rows } = await this.db.executeQuery(query, 'ObjectService.getById');

    if (rows.length === 0) {
      return null;
    }

    const obj = this.mapRowToObject(rows[0]);

    // Include requisites if requested
    if (options.includeRequisites) {
      obj.requisites = await this.getRequisites(database, objId);
    }

    return obj;
  }

  /**
   * Get multiple objects by IDs.
   *
   * @param {string} database - Database name
   * @param {Array<number>} ids - Object IDs
   * @returns {Promise<Array>} Array of objects
   */
  async getByIds(database, ids) {
    if (!ids || ids.length === 0) {
      return [];
    }

    const db = this.validation.validateDatabase(database);
    const validIds = ids.map(id => this.validation.validateId(id));

    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .where('id', 'IN', validIds);

    const { rows } = await this.db.executeQuery(query, 'ObjectService.getByIds');

    return rows.map(row => this.mapRowToObject(row));
  }

  /**
   * Get objects by type.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @param {Object} [options] - Query options
   * @param {number} [options.parentId] - Filter by parent
   * @param {number} [options.limit] - Limit results
   * @param {number} [options.offset] - Offset results
   * @param {string} [options.orderBy='ord'] - Order by field
   * @param {string} [options.sortDir='ASC'] - Sort direction
   * @returns {Promise<Array>} Array of objects
   */
  async getByType(database, typeId, options = {}) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);
    const filters = this.validation.validateFilters(options);

    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .whereType(type);

    // Apply parent filter
    if (filters.parentId !== undefined) {
      query.whereParent(filters.parentId);
    }

    // Apply ordering
    const orderField = filters.orderBy || 'ord';
    const sortDir = filters.sortDir || 'ASC';
    query.orderBy(orderField, sortDir);

    // Apply limit and offset
    if (filters.limit) {
      query.limit(filters.limit);
    }
    if (filters.offset) {
      query.offset(filters.offset);
    }

    const { rows } = await this.db.executeQuery(query, 'ObjectService.getByType');

    return rows.map(row => this.mapRowToObject(row));
  }

  /**
   * Get children of an object.
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @param {Object} [options] - Query options
   * @param {number} [options.typeId] - Filter by type
   * @param {number} [options.limit] - Limit results
   * @param {number} [options.offset] - Offset results
   * @returns {Promise<Array>} Array of child objects
   */
  async getChildren(database, parentId, options = {}) {
    const db = this.validation.validateDatabase(database);
    const parent = this.validation.validateParentId(parentId);
    const filters = this.validation.validateFilters(options);

    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .whereParent(parent)
      .orderBy('ord', 'ASC');

    // Apply type filter
    if (filters.typeId !== undefined) {
      query.whereType(filters.typeId);
    }

    // Apply limit and offset
    if (filters.limit) {
      query.limit(filters.limit);
    }
    if (filters.offset) {
      query.offset(filters.offset);
    }

    const { rows } = await this.db.executeQuery(query, 'ObjectService.getChildren');

    return rows.map(row => this.mapRowToObject(row));
  }

  /**
   * Count objects by type.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @param {Object} [options] - Query options
   * @param {number} [options.parentId] - Filter by parent
   * @returns {Promise<number>} Object count
   */
  async countByType(database, typeId, options = {}) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);

    const query = this.db.query(db)
      .select('COUNT(*) as count')
      .whereType(type);

    if (options.parentId !== undefined) {
      query.whereParent(this.validation.validateParentId(options.parentId));
    }

    const { rows } = await this.db.executeQuery(query, 'ObjectService.countByType');

    return rows[0]?.count || 0;
  }

  // ============================================================================
  // UPDATE Operations
  // ============================================================================

  /**
   * Update object value.
   * Maps to PHP: Update_Val()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {string} value - New value
   * @returns {Promise<boolean>} Success status
   */
  async updateValue(database, id, value) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);
    const val = this.validation.validateValue(value);

    const success = await this.db.updateVal(db, objId, val, 'ObjectService.updateValue');

    if (!success) {
      throw new NotFoundError(`Object ${id} not found`);
    }

    this.logger.info('Object value updated', { database: db, id: objId });

    return true;
  }

  /**
   * Update object type.
   * Maps to PHP: UpdateTyp()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} typeId - New type ID
   * @returns {Promise<boolean>} Success status
   */
  async updateType(database, id, typeId) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);
    const type = this.validation.validateTypeId(typeId);

    const success = await this.db.updateType(db, objId, type, 'ObjectService.updateType');

    if (!success) {
      throw new NotFoundError(`Object ${id} not found`);
    }

    this.logger.info('Object type updated', { database: db, id: objId, typeId: type });

    return true;
  }

  /**
   * Update object with all fields.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {Object} data - Update data
   * @param {string} [data.value] - New value
   * @param {number} [data.typeId] - New type
   * @param {number} [data.parentId] - New parent
   * @param {number} [data.order] - New order
   * @param {Object} [data.requisites] - Requisite updates
   * @returns {Promise<Object>} Updated object
   */
  async update(database, id, data) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);

    // Get current object
    const current = await this.getById(database, id);
    if (!current) {
      throw new NotFoundError(`Object ${id} not found`);
    }

    // Update value if provided
    if (data.value !== undefined || data.val !== undefined) {
      await this.updateValue(database, id, data.value || data.val);
    }

    // Update type if provided
    if (data.typeId !== undefined || data.t !== undefined) {
      await this.updateType(database, id, data.typeId || data.t);
    }

    // Update parent if provided (requires special handling)
    if (data.parentId !== undefined || data.up !== undefined) {
      await this.moveToParent(database, id, data.parentId || data.up);
    }

    // Update order if provided
    if (data.order !== undefined || data.ord !== undefined) {
      await this.updateOrder(database, id, data.order || data.ord);
    }

    // Update requisites if provided
    if (data.requisites && Object.keys(data.requisites).length > 0) {
      await this.saveRequisites(database, id, data.requisites);
    }

    // Return updated object
    return this.getById(database, id, { includeRequisites: !!data.requisites });
  }

  /**
   * Update object order.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} order - New order value
   * @returns {Promise<boolean>} Success status
   */
  async updateOrder(database, id, order) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);
    const ord = this.validation.validateOrder(order);

    const sql = `UPDATE ${db} SET ord = ? WHERE id = ?`;
    const result = await this.db.execSql(sql, [ord, objId], 'ObjectService.updateOrder');

    return result.affectedRows > 0;
  }

  /**
   * Set a specific ID for an object.
   * Maps to PHP: _m_id action
   * This operation updates the object's ID and all references to it.
   *
   * @param {string} database - Database name
   * @param {number} currentId - Current object ID
   * @param {number} newId - New ID to set
   * @returns {Promise<boolean>} Success status
   * @throws {ValidationError} If new ID is invalid or occupied
   */
  async setId(database, currentId, newId) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(currentId);
    const newObjId = this.validation.validateId(newId);

    // Check if the new ID is occupied or belongs to metadata (up=0)
    const checkSql = `SELECT id, up FROM ${db} WHERE id = ? OR (id = ? AND up = 0)`;
    const checkResult = await this.db.execSql(checkSql, [newObjId, objId], 'ObjectService.setId.check');

    if (checkResult.rows && checkResult.rows.length > 0) {
      for (const row of checkResult.rows) {
        if (row.id === newObjId) {
          throw new ValidationError('The new ID is already occupied');
        }
        if (row.id === objId && row.up === 0) {
          throw new ValidationError('Cannot change ID of metadata object');
        }
      }
    }

    // Update the object ID and all references to it
    // 1. Update the object's own ID
    const updateIdSql = `UPDATE ${db} SET id = ? WHERE id = ?`;
    await this.db.execSql(updateIdSql, [newObjId, objId], 'ObjectService.setId.updateId');

    // 2. Update parent references (up field)
    const updateUpSql = `UPDATE ${db} SET up = ? WHERE up = ?`;
    await this.db.execSql(updateUpSql, [newObjId, objId], 'ObjectService.setId.updateUp');

    // 3. Update type references (t field)
    const updateTypeSql = `UPDATE ${db} SET t = ? WHERE t = ?`;
    await this.db.execSql(updateTypeSql, [newObjId, objId], 'ObjectService.setId.updateType');

    this.logger.info('Object ID changed', { database: db, oldId: objId, newId: newObjId });

    return true;
  }

  /**
   * Move object to a new parent.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {number} newParentId - New parent ID
   * @returns {Promise<boolean>} Success status
   */
  async moveToParent(database, id, newParentId) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);
    const parentId = this.validation.validateParentId(newParentId);

    // Get new order value
    const newOrder = await this.db.getNextOrder(db, parentId);

    const sql = `UPDATE ${db} SET up = ?, ord = ? WHERE id = ?`;
    const result = await this.db.execSql(sql, [parentId, newOrder, objId], 'ObjectService.moveToParent');

    this.logger.info('Object moved to new parent', { database: db, id: objId, parentId });

    return result.affectedRows > 0;
  }

  // ============================================================================
  // DELETE Operations
  // ============================================================================

  /**
   * Delete an object.
   * Maps to PHP: Delete()
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @param {Object} [options] - Delete options
   * @param {boolean} [options.cascade=false] - Delete children recursively
   * @returns {Promise<boolean>} Success status
   */
  async delete(database, id, options = {}) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);

    // Cascade delete children first if requested
    if (options.cascade) {
      await this.deleteChildren(database, id, { cascade: true });
    }

    const success = await this.db.delete(db, objId, 'ObjectService.delete');

    this.logger.info('Object deleted', { database: db, id: objId, cascade: options.cascade });

    return success;
  }

  /**
   * Delete all children of an object.
   * Maps to PHP: BatchDelete()
   *
   * @param {string} database - Database name
   * @param {number} parentId - Parent object ID
   * @param {Object} [options] - Delete options
   * @param {boolean} [options.cascade=false] - Delete grandchildren recursively
   * @returns {Promise<number>} Number of deleted objects
   */
  async deleteChildren(database, parentId, options = {}) {
    const db = this.validation.validateDatabase(database);
    const parent = this.validation.validateParentId(parentId);

    // Get children if cascade is needed
    if (options.cascade) {
      const children = await this.getChildren(database, parent);
      for (const child of children) {
        await this.delete(database, child.id, { cascade: true });
      }
      return children.length;
    }

    const count = await this.db.batchDelete(db, parent, 'ObjectService.deleteChildren');

    this.logger.info('Children deleted', { database: db, parentId: parent, count });

    return count;
  }

  /**
   * Delete multiple objects by IDs.
   *
   * @param {string} database - Database name
   * @param {Array<number>} ids - Object IDs to delete
   * @returns {Promise<number>} Number of deleted objects
   */
  async deleteByIds(database, ids) {
    if (!ids || ids.length === 0) {
      return 0;
    }

    const db = this.validation.validateDatabase(database);
    const validIds = ids.map(id => this.validation.validateId(id));

    const sql = `DELETE FROM ${db} WHERE id IN (${validIds.map(() => '?').join(', ')})`;
    const result = await this.db.execSql(sql, validIds, 'ObjectService.deleteByIds');

    this.logger.info('Multiple objects deleted', { database: db, count: result.affectedRows });

    return result.affectedRows;
  }

  // ============================================================================
  // Requisite Operations
  // ============================================================================

  /**
   * Get requisites for an object.
   *
   * @param {string} database - Database name
   * @param {number} objectId - Object ID
   * @returns {Promise<Object>} Requisite values keyed by type ID
   */
  async getRequisites(database, objectId) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(objectId);

    const query = this.db.query(db)
      .select('id', 'val', 't')
      .whereParent(objId)
      .orderBy('ord', 'ASC');

    const { rows } = await this.db.executeQuery(query, 'ObjectService.getRequisites');

    // Group by type
    const requisites = {};
    for (const row of rows) {
      const typeId = row.t;
      if (!requisites[typeId]) {
        requisites[typeId] = [];
      }
      requisites[typeId].push({
        id: row.id,
        value: row.val,
      });
    }

    return requisites;
  }

  /**
   * Save requisites for an object.
   *
   * @param {string} database - Database name
   * @param {number} objectId - Object ID
   * @param {Object} requisites - Requisite values keyed by type ID
   * @returns {Promise<void>}
   */
  async saveRequisites(database, objectId, requisites) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(objectId);
    const validated = this.validation.validateRequisites(requisites);

    for (const [typeId, value] of Object.entries(validated)) {
      // Check if requisite already exists
      const existing = await this.getRequisiteByType(database, objectId, parseInt(typeId, 10));

      if (existing) {
        // Update existing
        await this.db.updateVal(db, existing.id, String(value), 'ObjectService.saveRequisites');
      } else {
        // Create new
        const order = await this.db.getNextOrder(db, objId, parseInt(typeId, 10));
        await this.db.insert(db, objId, order, parseInt(typeId, 10), String(value), 'ObjectService.saveRequisites');
      }
    }
  }

  /**
   * Get a single requisite by type.
   *
   * @param {string} database - Database name
   * @param {number} objectId - Object ID
   * @param {number} typeId - Requisite type ID
   * @returns {Promise<Object|null>} Requisite or null
   */
  async getRequisiteByType(database, objectId, typeId) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(objectId);
    const type = this.validation.validateTypeId(typeId);

    const query = this.db.query(db)
      .select('id', 'val', 't')
      .whereParent(objId)
      .whereType(type)
      .limit(1);

    const { rows } = await this.db.executeQuery(query, 'ObjectService.getRequisiteByType');

    if (rows.length === 0) {
      return null;
    }

    return {
      id: rows[0].id,
      value: rows[0].val,
      typeId: rows[0].t,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Map database row to object structure.
   *
   * @param {Object} row - Database row
   * @returns {Object} Object structure
   */
  mapRowToObject(row) {
    return {
      id: row.id,
      value: row.val,
      parentId: row.up,
      typeId: row.t,
      order: row.ord,
    };
  }

  /**
   * Check if an object exists.
   *
   * @param {string} database - Database name
   * @param {number} id - Object ID
   * @returns {Promise<boolean>} True if exists
   */
  async exists(database, id) {
    const db = this.validation.validateDatabase(database);
    const objId = this.validation.validateId(id);

    return this.db.isOccupied(db, objId);
  }
}

// ============================================================================
// Export
// ============================================================================

export default ObjectService;
