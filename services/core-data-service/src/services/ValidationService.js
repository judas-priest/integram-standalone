/**
 * @integram/core-data-service - ValidationService
 *
 * Validates data for CRUD operations.
 * Maps to PHP validation patterns for backward compatibility.
 */

import {
  ValidationError,
  InjectionError,
  DB_MASK,
  BASIC_TYPES,
  hasInjectionPattern,
  escapeString,
  validateDbName,
} from '@integram/common';

// ============================================================================
// ValidationService Class
// ============================================================================

/**
 * Service for validating Integram object data.
 * Provides validation for database names, type IDs, values, and requisites.
 */
export class ValidationService {
  /**
   * Create a new validation service.
   *
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   * @param {boolean} [options.strictMode=false] - Enable strict validation
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.strictMode = options.strictMode || false;
  }

  // ============================================================================
  // Database Validation
  // ============================================================================

  /**
   * Validate database name.
   *
   * @param {string} database - Database name to validate
   * @throws {ValidationError} If database name is invalid
   * @returns {string} Validated database name
   */
  validateDatabase(database) {
    if (!database || typeof database !== 'string') {
      throw new ValidationError('Database name is required');
    }

    const trimmed = database.trim();

    if (!validateDbName(trimmed)) {
      throw new ValidationError(`Invalid database name: ${trimmed}`);
    }

    // Check for SQL injection patterns
    if (hasInjectionPattern(trimmed)) {
      throw new InjectionError(trimmed);
    }

    return trimmed;
  }

  // ============================================================================
  // Object ID Validation
  // ============================================================================

  /**
   * Validate object ID.
   *
   * @param {*} id - Object ID to validate
   * @throws {ValidationError} If ID is invalid
   * @returns {number} Validated ID as integer
   */
  validateId(id) {
    const parsed = parseInt(id, 10);

    if (isNaN(parsed) || parsed < 0) {
      throw new ValidationError(`Invalid object ID: ${id}`);
    }

    return parsed;
  }

  /**
   * Validate parent ID.
   *
   * @param {*} parentId - Parent ID to validate
   * @throws {ValidationError} If parent ID is invalid
   * @returns {number} Validated parent ID as integer
   */
  validateParentId(parentId) {
    const parsed = parseInt(parentId, 10);

    if (isNaN(parsed) || parsed < 0) {
      throw new ValidationError(`Invalid parent ID: ${parentId}`);
    }

    return parsed;
  }

  // ============================================================================
  // Type Validation
  // ============================================================================

  /**
   * Validate type ID.
   *
   * @param {*} typeId - Type ID to validate
   * @throws {ValidationError} If type ID is invalid
   * @returns {number} Validated type ID as integer
   */
  validateTypeId(typeId) {
    const parsed = parseInt(typeId, 10);

    if (isNaN(parsed) || parsed <= 0) {
      throw new ValidationError(`Invalid type ID: ${typeId}`);
    }

    return parsed;
  }

  /**
   * Check if a type ID is a basic type.
   *
   * @param {number} typeId - Type ID to check
   * @returns {boolean} True if basic type
   */
  isBasicType(typeId) {
    return typeId in BASIC_TYPES;
  }

  /**
   * Get basic type name.
   *
   * @param {number} typeId - Type ID
   * @returns {string|null} Type name or null
   */
  getBasicTypeName(typeId) {
    return BASIC_TYPES[typeId] || null;
  }

  // ============================================================================
  // Value Validation
  // ============================================================================

  /**
   * Validate object value.
   *
   * @param {*} value - Value to validate
   * @param {Object} [options] - Validation options
   * @param {number} [options.maxLength] - Maximum length
   * @param {boolean} [options.allowEmpty=true] - Allow empty values
   * @param {boolean} [options.allowNull=true] - Allow null values
   * @throws {ValidationError} If value is invalid
   * @returns {string} Validated value
   */
  validateValue(value, options = {}) {
    const {
      maxLength = 65535,
      allowEmpty = true,
      allowNull = true,
    } = options;

    // Handle null
    if (value === null || value === undefined) {
      if (!allowNull) {
        throw new ValidationError('Value cannot be null');
      }
      return '';
    }

    // Convert to string
    const strValue = String(value);

    // Check empty
    if (!allowEmpty && strValue.trim() === '') {
      throw new ValidationError('Value cannot be empty');
    }

    // Check length
    if (maxLength && strValue.length > maxLength) {
      throw new ValidationError(`Value exceeds maximum length of ${maxLength}`);
    }

    // Check for injection patterns (only in strict mode)
    if (this.strictMode && hasInjectionPattern(strValue)) {
      this.logger.warn('Potential injection pattern detected in value', { value: strValue });
    }

    return strValue;
  }

  // ============================================================================
  // Order Validation
  // ============================================================================

  /**
   * Validate order value.
   *
   * @param {*} order - Order value to validate
   * @throws {ValidationError} If order is invalid
   * @returns {number} Validated order as integer
   */
  validateOrder(order) {
    const parsed = parseInt(order, 10);

    if (isNaN(parsed) || parsed < 0) {
      throw new ValidationError(`Invalid order value: ${order}`);
    }

    return parsed;
  }

  // ============================================================================
  // Requisites Validation
  // ============================================================================

  /**
   * Validate requisites object.
   *
   * @param {Object} requisites - Requisites to validate
   * @param {Object} [schema] - Optional schema for validation
   * @throws {ValidationError} If requisites are invalid
   * @returns {Object} Validated requisites
   */
  validateRequisites(requisites, schema = null) {
    if (!requisites || typeof requisites !== 'object') {
      throw new ValidationError('Requisites must be an object');
    }

    const validated = {};

    for (const [key, value] of Object.entries(requisites)) {
      // Validate key is a valid requisite ID
      const reqId = parseInt(key, 10);
      if (isNaN(reqId) || reqId <= 0) {
        throw new ValidationError(`Invalid requisite ID: ${key}`);
      }

      // If schema is provided, validate against it
      if (schema && schema[reqId]) {
        validated[reqId] = this.validateValueByType(value, schema[reqId]);
      } else {
        // Basic validation
        validated[reqId] = this.validateValue(value);
      }
    }

    return validated;
  }

  /**
   * Validate value by type definition.
   *
   * @param {*} value - Value to validate
   * @param {Object} typeInfo - Type information
   * @returns {*} Validated value
   */
  validateValueByType(value, typeInfo) {
    const { type, required = false, maxLength } = typeInfo;

    // Check required
    if (required && (value === null || value === undefined || value === '')) {
      throw new ValidationError(`Required field is empty`);
    }

    // Handle null
    if (value === null || value === undefined) {
      return null;
    }

    // Type-specific validation
    switch (type) {
      case 'SHORT':
      case 'CHARS':
        return this.validateValue(value, { maxLength: maxLength || 255 });

      case 'NUMBER':
      case 'SIGNED':
        const num = parseFloat(value);
        if (isNaN(num)) {
          throw new ValidationError(`Invalid number value: ${value}`);
        }
        return num;

      case 'BOOLEAN':
        return Boolean(value);

      case 'DATE':
      case 'DATETIME':
        return this.validateDateTime(value);

      case 'MEMO':
      case 'HTML':
        return this.validateValue(value, { maxLength: maxLength || 65535 });

      default:
        return this.validateValue(value);
    }
  }

  // ============================================================================
  // DateTime Validation
  // ============================================================================

  /**
   * Validate datetime value.
   *
   * @param {*} value - DateTime value to validate
   * @throws {ValidationError} If datetime is invalid
   * @returns {string} Validated datetime string
   */
  validateDateTime(value) {
    if (!value) {
      return null;
    }

    // If already a Date object
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new ValidationError('Invalid date');
      }
      return value.toISOString().slice(0, 19).replace('T', ' ');
    }

    // Try to parse string
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ValidationError(`Invalid datetime value: ${value}`);
    }

    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  // ============================================================================
  // Batch Validation
  // ============================================================================

  /**
   * Validate a batch of objects for insert.
   *
   * @param {Array} objects - Array of objects to validate
   * @param {Object} [schema] - Optional schema
   * @throws {ValidationError} If any object is invalid
   * @returns {Array} Validated objects
   */
  validateBatch(objects, schema = null) {
    if (!Array.isArray(objects)) {
      throw new ValidationError('Batch must be an array');
    }

    if (objects.length === 0) {
      throw new ValidationError('Batch cannot be empty');
    }

    return objects.map((obj, index) => {
      try {
        return {
          value: this.validateValue(obj.value || obj.val, { allowEmpty: false }),
          typeId: obj.typeId || obj.t ? this.validateTypeId(obj.typeId || obj.t) : null,
          parentId: obj.parentId || obj.up !== undefined ? this.validateParentId(obj.parentId || obj.up) : 0,
          order: obj.order || obj.ord !== undefined ? this.validateOrder(obj.order || obj.ord) : null,
          requisites: obj.requisites ? this.validateRequisites(obj.requisites, schema) : {},
        };
      } catch (error) {
        throw new ValidationError(`Invalid object at index ${index}: ${error.message}`);
      }
    });
  }

  // ============================================================================
  // Filter Validation
  // ============================================================================

  /**
   * Validate filter parameters.
   *
   * @param {Object} filters - Filter parameters
   * @throws {ValidationError} If filters are invalid
   * @returns {Object} Validated filters
   */
  validateFilters(filters) {
    if (!filters || typeof filters !== 'object') {
      return {};
    }

    const validated = {};

    // Validate limit
    if (filters.limit !== undefined) {
      const limit = parseInt(filters.limit, 10);
      if (isNaN(limit) || limit < 0 || limit > 10000) {
        throw new ValidationError('Invalid limit value');
      }
      validated.limit = limit;
    }

    // Validate offset
    if (filters.offset !== undefined) {
      const offset = parseInt(filters.offset, 10);
      if (isNaN(offset) || offset < 0) {
        throw new ValidationError('Invalid offset value');
      }
      validated.offset = offset;
    }

    // Validate type filter
    if (filters.typeId !== undefined || filters.t !== undefined) {
      validated.typeId = this.validateTypeId(filters.typeId || filters.t);
    }

    // Validate parent filter
    if (filters.parentId !== undefined || filters.up !== undefined) {
      validated.parentId = this.validateParentId(filters.parentId || filters.up);
    }

    // Validate order by
    if (filters.orderBy) {
      if (hasInjectionPattern(filters.orderBy)) {
        throw new InjectionError(filters.orderBy);
      }
      validated.orderBy = filters.orderBy;
    }

    // Validate sort direction
    if (filters.sortDir) {
      const dir = filters.sortDir.toUpperCase();
      if (dir !== 'ASC' && dir !== 'DESC') {
        throw new ValidationError('Invalid sort direction');
      }
      validated.sortDir = dir;
    }

    return validated;
  }
}

// ============================================================================
// Export
// ============================================================================

export default ValidationService;
