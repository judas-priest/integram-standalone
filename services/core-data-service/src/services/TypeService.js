/**
 * @integram/core-data-service - TypeService
 *
 * Manages type definitions (schemas) in Integram.
 * Types define the structure of objects and their requisites.
 */

import {
  ValidationError,
  BASIC_TYPES,
  BASIC_TYPE_IDS,
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
// TypeService Class
// ============================================================================

/**
 * Service for managing Integram type definitions.
 * Types are schema definitions that control object structure.
 */
export class TypeService {
  /**
   * Create a new type service.
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

    // Cache for type schemas
    this._schemaCache = new Map();
    this._cacheTimeout = options.cacheTimeout || 60000; // 1 minute
  }

  // ============================================================================
  // Type Management
  // ============================================================================

  /**
   * Get a type by ID.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @returns {Promise<Object|null>} Type definition or null
   */
  async getType(database, typeId) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);

    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .whereId(type);

    const { rows } = await this.db.executeQuery(query, 'TypeService.getType');

    if (rows.length === 0) {
      return null;
    }

    return {
      id: rows[0].id,
      name: rows[0].val,
      parentId: rows[0].up,
      baseType: rows[0].t,
      order: rows[0].ord,
    };
  }

  /**
   * Get all types in a database.
   *
   * @param {string} database - Database name
   * @param {Object} [options] - Query options
   * @param {boolean} [options.includeSystem=false] - Include system types
   * @returns {Promise<Array>} Array of type definitions
   */
  async getAllTypes(database, options = {}) {
    const db = this.validation.validateDatabase(database);

    // Types are root-level objects (up=0)
    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .whereParent(0)
      .orderBy('val', 'ASC');

    const { rows } = await this.db.executeQuery(query, 'TypeService.getAllTypes');

    const types = rows.map(row => ({
      id: row.id,
      name: row.val,
      parentId: row.up,
      baseType: row.t,
      order: row.ord,
      isBasic: this.isBasicType(row.t),
      basicTypeName: BASIC_TYPES[row.t] || null,
    }));

    // Filter system types if needed
    if (!options.includeSystem) {
      return types.filter(t => !this.isSystemType(t.id));
    }

    return types;
  }

  /**
   * Create a new type.
   *
   * @param {string} database - Database name
   * @param {Object} data - Type data
   * @param {string} data.name - Type name
   * @param {number} [data.baseType=3] - Base type ID (default: SHORT)
   * @param {Array} [data.requisites] - Initial requisites
   * @returns {Promise<Object>} Created type
   */
  async createType(database, data) {
    const db = this.validation.validateDatabase(database);
    const name = this.validation.validateValue(data.name, { allowEmpty: false });
    const baseType = data.baseType !== undefined
      ? this.validation.validateTypeId(data.baseType)
      : BASIC_TYPE_IDS.SHORT; // Default to SHORT

    // Get next order
    const order = await this.db.getNextOrder(db, 0);

    // Create type (root object)
    const id = await this.db.insert(db, 0, order, baseType, name, 'TypeService.createType');

    this.logger.info('Type created', { database: db, id, name });

    // Create requisites if provided
    if (data.requisites && Array.isArray(data.requisites)) {
      await this.addRequisites(database, id, data.requisites);
    }

    // Clear cache
    this.clearCache(database, id);

    return {
      id,
      name,
      parentId: 0,
      baseType,
      order,
    };
  }

  /**
   * Update a type.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @param {Object} data - Update data
   * @param {string} [data.name] - New name
   * @param {number} [data.baseType] - New base type
   * @returns {Promise<Object>} Updated type
   */
  async updateType(database, typeId, data) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);

    // Verify type exists
    const existing = await this.getType(database, typeId);
    if (!existing) {
      throw new NotFoundError(`Type ${typeId} not found`);
    }

    // Update name if provided
    if (data.name !== undefined) {
      const name = this.validation.validateValue(data.name, { allowEmpty: false });
      await this.db.updateVal(db, type, name, 'TypeService.updateType');
    }

    // Update base type if provided
    if (data.baseType !== undefined) {
      const baseType = this.validation.validateTypeId(data.baseType);
      await this.db.updateType(db, type, baseType, 'TypeService.updateType');
    }

    // Clear cache
    this.clearCache(database, typeId);

    return this.getType(database, typeId);
  }

  /**
   * Delete a type.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @param {Object} [options] - Delete options
   * @param {boolean} [options.cascade=false] - Delete all objects of this type
   * @returns {Promise<boolean>} Success status
   */
  async deleteType(database, typeId, options = {}) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);

    // Check if type exists
    const existing = await this.getType(database, typeId);
    if (!existing) {
      throw new NotFoundError(`Type ${typeId} not found`);
    }

    // Check if type is in use
    if (!options.cascade) {
      const count = await this.getObjectCount(database, typeId);
      if (count > 0) {
        throw new ValidationError(`Type ${typeId} is in use by ${count} objects. Use cascade=true to delete.`);
      }
    }

    // Delete all objects of this type if cascade
    if (options.cascade) {
      const deleteQuery = `DELETE FROM ${db} WHERE t = ?`;
      await this.db.execSql(deleteQuery, [type], 'TypeService.deleteType.cascade');
    }

    // Delete requisites
    await this.db.batchDelete(db, type, 'TypeService.deleteType.requisites');

    // Delete type
    const success = await this.db.delete(db, type, 'TypeService.deleteType');

    this.logger.info('Type deleted', { database: db, typeId: type, cascade: options.cascade });

    // Clear cache
    this.clearCache(database, typeId);

    return success;
  }

  // ============================================================================
  // Requisite Management
  // ============================================================================

  /**
   * Get requisites (columns) for a type.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @param {Object} [options] - Query options
   * @param {boolean} [options.useCache=true] - Use cached schema
   * @returns {Promise<Array>} Array of requisite definitions
   */
  async getRequisites(database, typeId, options = {}) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);
    const useCache = options.useCache !== false;

    // Check cache
    const cacheKey = `${db}:${type}`;
    if (useCache && this._schemaCache.has(cacheKey)) {
      const cached = this._schemaCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this._cacheTimeout) {
        return cached.requisites;
      }
    }

    // Query requisites
    const query = this.db.query(db)
      .select('id', 'val', 't', 'ord')
      .whereParent(type)
      .orderBy('ord', 'ASC');

    const { rows } = await this.db.executeQuery(query, 'TypeService.getRequisites');

    const requisites = rows.map(row => this.parseRequisite(row));

    // Cache result
    this._schemaCache.set(cacheKey, {
      requisites,
      timestamp: Date.now(),
    });

    return requisites;
  }

  /**
   * Add requisites to a type.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @param {Array} requisites - Requisite definitions
   * @returns {Promise<Array>} Created requisite IDs
   */
  async addRequisites(database, typeId, requisites) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);

    if (!Array.isArray(requisites) || requisites.length === 0) {
      return [];
    }

    const ids = [];

    for (const req of requisites) {
      const name = this.validation.validateValue(req.name || req.val, { allowEmpty: false });
      const reqType = req.type ? this.resolveTypeId(req.type) : BASIC_TYPE_IDS.SHORT;
      const order = await this.db.getNextOrder(db, type);

      // Build value with modifiers
      let value = name;
      if (req.alias) {
        value = `:ALIAS=${req.alias}:${name}`;
      }
      if (req.required || req.notNull) {
        value = `:!NULL:${value}`;
      }
      if (req.multi) {
        value = `:MULTI:${value}`;
      }

      const id = await this.db.insert(db, type, order, reqType, value, 'TypeService.addRequisites');
      ids.push(id);
    }

    // Clear cache
    this.clearCache(database, typeId);

    this.logger.info('Requisites added', { database: db, typeId: type, count: ids.length });

    return ids;
  }

  /**
   * Update a requisite.
   *
   * @param {string} database - Database name
   * @param {number} requisiteId - Requisite ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated requisite
   */
  async updateRequisite(database, requisiteId, data) {
    const db = this.validation.validateDatabase(database);
    const reqId = this.validation.validateId(requisiteId);

    // Get current requisite
    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .whereId(reqId);

    const { rows } = await this.db.executeQuery(query, 'TypeService.updateRequisite');

    if (rows.length === 0) {
      throw new NotFoundError(`Requisite ${requisiteId} not found`);
    }

    const current = this.parseRequisite(rows[0]);

    // Build new value
    let newName = data.name !== undefined ? data.name : current.name;
    let newValue = newName;

    const alias = data.alias !== undefined ? data.alias : current.alias;
    const required = data.required !== undefined ? data.required : current.required;
    const multi = data.multi !== undefined ? data.multi : current.multi;

    if (alias) {
      newValue = `:ALIAS=${alias}:${newValue}`;
    }
    if (required) {
      newValue = `:!NULL:${newValue}`;
    }
    if (multi) {
      newValue = `:MULTI:${newValue}`;
    }

    // Update value
    await this.db.updateVal(db, reqId, newValue, 'TypeService.updateRequisite');

    // Update type if provided
    if (data.type !== undefined) {
      const reqType = this.resolveTypeId(data.type);
      await this.db.updateType(db, reqId, reqType, 'TypeService.updateRequisite');
    }

    // Clear cache
    this.clearCache(database, rows[0].up);

    return this.getRequisite(database, requisiteId);
  }

  /**
   * Delete a requisite.
   *
   * @param {string} database - Database name
   * @param {number} requisiteId - Requisite ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteRequisite(database, requisiteId) {
    const db = this.validation.validateDatabase(database);
    const reqId = this.validation.validateId(requisiteId);

    // Get requisite to find parent type
    const query = this.db.query(db)
      .select('up')
      .whereId(reqId);

    const { rows } = await this.db.executeQuery(query, 'TypeService.deleteRequisite');

    if (rows.length === 0) {
      throw new NotFoundError(`Requisite ${requisiteId} not found`);
    }

    const typeId = rows[0].up;

    // Delete requisite
    const success = await this.db.delete(db, reqId, 'TypeService.deleteRequisite');

    // Clear cache
    this.clearCache(database, typeId);

    return success;
  }

  /**
   * Get a single requisite.
   *
   * @param {string} database - Database name
   * @param {number} requisiteId - Requisite ID
   * @returns {Promise<Object|null>} Requisite definition or null
   */
  async getRequisite(database, requisiteId) {
    const db = this.validation.validateDatabase(database);
    const reqId = this.validation.validateId(requisiteId);

    const query = this.db.query(db)
      .select('id', 'val', 'up', 't', 'ord')
      .whereId(reqId);

    const { rows } = await this.db.executeQuery(query, 'TypeService.getRequisite');

    if (rows.length === 0) {
      return null;
    }

    return this.parseRequisite(rows[0]);
  }

  // ============================================================================
  // Schema Operations
  // ============================================================================

  /**
   * Get full schema for a type (type + all requisites).
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @returns {Promise<Object>} Full schema
   */
  async getSchema(database, typeId) {
    const type = await this.getType(database, typeId);
    if (!type) {
      throw new NotFoundError(`Type ${typeId} not found`);
    }

    const requisites = await this.getRequisites(database, typeId);

    return {
      ...type,
      requisites,
    };
  }

  /**
   * Clone a type with all requisites.
   *
   * @param {string} database - Database name
   * @param {number} sourceTypeId - Source type ID
   * @param {string} newName - New type name
   * @returns {Promise<Object>} New type
   */
  async cloneType(database, sourceTypeId, newName) {
    // Get source schema
    const schema = await this.getSchema(database, sourceTypeId);

    // Create new type
    const newType = await this.createType(database, {
      name: newName,
      baseType: schema.baseType,
      requisites: schema.requisites.map(req => ({
        name: req.name,
        type: req.typeId,
        alias: req.alias,
        required: req.required,
        multi: req.multi,
      })),
    });

    this.logger.info('Type cloned', { database, sourceTypeId, newTypeId: newType.id });

    return newType;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get count of objects using a type.
   *
   * @param {string} database - Database name
   * @param {number} typeId - Type ID
   * @returns {Promise<number>} Object count
   */
  async getObjectCount(database, typeId) {
    const db = this.validation.validateDatabase(database);
    const type = this.validation.validateTypeId(typeId);

    const query = this.db.query(db)
      .select('COUNT(*) as count')
      .whereType(type);

    const { rows } = await this.db.executeQuery(query, 'TypeService.getObjectCount');

    return rows[0]?.count || 0;
  }

  /**
   * Check if a type ID is a basic type.
   *
   * @param {number} typeId - Type ID
   * @returns {boolean} True if basic type
   */
  isBasicType(typeId) {
    return typeId in BASIC_TYPES;
  }

  /**
   * Check if a type ID is a system type.
   *
   * @param {number} typeId - Type ID
   * @returns {boolean} True if system type
   */
  isSystemType(typeId) {
    // System types are typically in the low ID range
    return typeId < 50;
  }

  /**
   * Resolve type name to ID.
   *
   * @param {string|number} type - Type name or ID
   * @returns {number} Type ID
   */
  resolveTypeId(type) {
    if (typeof type === 'number') {
      return type;
    }

    const upperType = String(type).toUpperCase();
    if (BASIC_TYPE_IDS[upperType]) {
      return BASIC_TYPE_IDS[upperType];
    }

    const parsed = parseInt(type, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    throw new ValidationError(`Invalid type: ${type}`);
  }

  /**
   * Parse requisite value to extract modifiers.
   *
   * @param {Object} row - Database row
   * @returns {Object} Parsed requisite
   */
  parseRequisite(row) {
    let value = row.val || '';
    let alias = null;
    let required = false;
    let multi = false;

    // Extract alias
    const aliasMatch = value.match(/:ALIAS=(.*?):/);
    if (aliasMatch) {
      alias = aliasMatch[1];
      value = value.replace(aliasMatch[0], '');
    }

    // Extract NOT NULL
    if (value.includes(':!NULL:')) {
      required = true;
      value = value.replace(':!NULL:', '');
    }

    // Extract MULTI
    if (value.includes(':MULTI:')) {
      multi = true;
      value = value.replace(':MULTI:', '');
    }

    return {
      id: row.id,
      name: value.trim(),
      alias,
      typeId: row.t,
      basicType: BASIC_TYPES[row.t] || 'UNKNOWN',
      order: row.ord,
      required,
      multi,
      parentTypeId: row.up,
    };
  }

  /**
   * Clear schema cache.
   *
   * @param {string} [database] - Database name (clears all if omitted)
   * @param {number} [typeId] - Type ID (clears all for database if omitted)
   */
  clearCache(database, typeId) {
    if (!database) {
      this._schemaCache.clear();
      return;
    }

    if (!typeId) {
      // Clear all for database
      for (const key of this._schemaCache.keys()) {
        if (key.startsWith(`${database}:`)) {
          this._schemaCache.delete(key);
        }
      }
      return;
    }

    this._schemaCache.delete(`${database}:${typeId}`);
  }
}

// ============================================================================
// Export
// ============================================================================

export default TypeService;
