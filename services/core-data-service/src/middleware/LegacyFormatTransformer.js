/**
 * @integram/core-data-service - LegacyFormatTransformer
 *
 * Transforms requests and responses between legacy PHP formats and modern API formats.
 * Ensures backward compatibility with existing clients.
 */

// ============================================================================
// LegacyFormatTransformer Class
// ============================================================================

/**
 * Transforms between legacy and modern formats.
 */
export class LegacyFormatTransformer {
  /**
   * Create a new transformer.
   *
   * @param {Object} [options] - Transformer options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  // ============================================================================
  // Request Transformation
  // ============================================================================

  /**
   * Transform legacy request parameters to modern format.
   *
   * @param {Object} params - Request parameters
   * @returns {Object} Transformed request
   */
  transformRequest(params) {
    const result = {
      format: this.detectFormat(params),
      data: null,
      filters: {},
    };

    // Parse JSON_DATA format
    if (params.JSON_DATA) {
      result.data = this.parseJsonData(params.JSON_DATA);
    }

    // Parse JSON_KV format
    if (params.JSON_KV) {
      result.data = this.parseJsonKv(params.JSON_KV);
    }

    // Parse JSON_CR format
    if (params.JSON_CR) {
      result.data = this.parseJsonCr(params.JSON_CR);
    }

    // Parse filters
    if (params.t) {
      result.filters.typeId = parseInt(params.t, 10);
    }
    if (params.up) {
      result.filters.parentId = parseInt(params.up, 10);
    }
    if (params.LIMIT) {
      result.filters.limit = parseInt(params.LIMIT, 10);
    }
    if (params.F) {
      result.filters.offset = parseInt(params.F, 10);
    }
    if (params.filter) {
      result.filters.customFilter = params.filter;
    }
    if (params.ord) {
      result.filters.orderBy = params.ord;
    }

    return result;
  }

  /**
   * Detect the format from request parameters.
   *
   * @param {Object} params - Request parameters
   * @returns {string} Detected format
   */
  detectFormat(params) {
    if (params.JSON_DATA !== undefined) return 'JSON_DATA';
    if (params.JSON_KV !== undefined) return 'JSON_KV';
    if (params.JSON_CR !== undefined) return 'JSON_CR';
    if (params.JSON_HR !== undefined) return 'JSON_HR';
    return 'DEFAULT';
  }

  /**
   * Parse JSON_DATA format.
   * Format: [["col1", "col2"], ["val1", "val2"], ...]
   *
   * @param {string|Array} data - JSON_DATA input
   * @returns {Array} Parsed data
   */
  parseJsonData(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        this.logger.warn('Failed to parse JSON_DATA', { error: e.message });
        return null;
      }
    }

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const headers = data[0];
    const rows = data.slice(1);

    return rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
  }

  /**
   * Parse JSON_KV format.
   * Format: { id: value, id: value, ... }
   *
   * @param {string|Object} data - JSON_KV input
   * @returns {Object} Parsed data
   */
  parseJsonKv(data) {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        this.logger.warn('Failed to parse JSON_KV', { error: e.message });
        return {};
      }
    }
    return data || {};
  }

  /**
   * Parse JSON_CR format.
   * Format: { columns: [], rows: [] }
   *
   * @param {string|Object} data - JSON_CR input
   * @returns {Object} Parsed data
   */
  parseJsonCr(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        this.logger.warn('Failed to parse JSON_CR', { error: e.message });
        return { columns: [], rows: [] };
      }
    }
    return data || { columns: [], rows: [] };
  }

  // ============================================================================
  // Response Transformation
  // ============================================================================

  /**
   * Transform modern response to legacy format.
   *
   * @param {Object|Array} data - Modern format data
   * @param {string} format - Target legacy format
   * @returns {*} Transformed response
   */
  transformResponse(data, format) {
    switch (format) {
      case 'JSON_DATA':
        return this.toJsonData(data);
      case 'JSON_KV':
        return this.toJsonKv(data);
      case 'JSON_CR':
        return this.toJsonCr(data);
      case 'JSON_HR':
        return this.toJsonHr(data);
      default:
        return data;
    }
  }

  /**
   * Convert to JSON_DATA format.
   *
   * @param {Array} data - Array of objects
   * @param {Array} [columns] - Column names to include
   * @returns {Array} JSON_DATA format
   */
  toJsonData(data, columns = null) {
    if (!Array.isArray(data) || data.length === 0) {
      return columns ? [columns] : [['id', 'val', 'up', 't', 'ord']];
    }

    // Determine columns from first object or use provided
    const cols = columns || Object.keys(data[0]);

    // Map internal field names to legacy names
    const legacyColumns = cols.map(col => {
      switch (col) {
        case 'value': return 'val';
        case 'parentId': return 'up';
        case 'typeId': return 't';
        case 'order': return 'ord';
        default: return col;
      }
    });

    // Create result with header row
    const result = [legacyColumns];

    // Add data rows
    for (const row of data) {
      const values = cols.map(col => {
        const value = row[col];
        return value !== null && value !== undefined ? String(value) : '';
      });
      result.push(values);
    }

    return result;
  }

  /**
   * Convert to JSON_KV format.
   *
   * @param {Array} data - Array of objects
   * @returns {Object} JSON_KV format
   */
  toJsonKv(data) {
    const result = {};

    if (!Array.isArray(data)) {
      return result;
    }

    for (const row of data) {
      const id = row.id;
      const value = row.value || row.val || '';
      result[id] = value;
    }

    return result;
  }

  /**
   * Convert to JSON_CR format.
   *
   * @param {Array} data - Array of objects
   * @returns {Object} JSON_CR format
   */
  toJsonCr(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return { columns: ['id', 'val', 'up', 't', 'ord'], rows: [] };
    }

    const columns = ['id', 'val', 'up', 't', 'ord'];
    const rows = data.map(row => ({
      id: row.id,
      val: row.value || row.val || '',
      up: row.parentId || row.up || 0,
      t: row.typeId || row.t,
      ord: row.order || row.ord || 0,
    }));

    return { columns, rows };
  }

  /**
   * Convert to JSON_HR format (hierarchical).
   *
   * @param {Object} tree - Tree structure
   * @returns {Object} JSON_HR format
   */
  toJsonHr(tree) {
    if (!tree) {
      return {};
    }

    const transform = (node) => ({
      id: node.id,
      val: node.value || node.val,
      up: node.parentId || node.up || 0,
      t: node.typeId || node.t,
      children: node.children ? node.children.map(transform) : [],
    });

    return transform(tree);
  }

  // ============================================================================
  // Object Transformation
  // ============================================================================

  /**
   * Convert modern object to legacy format.
   *
   * @param {Object} obj - Modern object
   * @returns {Object} Legacy format object
   */
  objectToLegacy(obj) {
    return {
      id: obj.id,
      val: obj.value,
      up: obj.parentId,
      t: obj.typeId,
      ord: obj.order,
    };
  }

  /**
   * Convert legacy object to modern format.
   *
   * @param {Object} obj - Legacy object
   * @returns {Object} Modern format object
   */
  objectToModern(obj) {
    return {
      id: obj.id,
      value: obj.val,
      parentId: obj.up,
      typeId: obj.t,
      order: obj.ord,
    };
  }

  /**
   * Convert array of objects to legacy format.
   *
   * @param {Array} objects - Array of modern objects
   * @returns {Array} Array of legacy objects
   */
  arrayToLegacy(objects) {
    return objects.map(obj => this.objectToLegacy(obj));
  }

  /**
   * Convert array of objects to modern format.
   *
   * @param {Array} objects - Array of legacy objects
   * @returns {Array} Array of modern objects
   */
  arrayToModern(objects) {
    return objects.map(obj => this.objectToModern(obj));
  }

  // ============================================================================
  // Express Middleware
  // ============================================================================

  /**
   * Create Express middleware for legacy format handling.
   *
   * @returns {Function} Express middleware
   */
  middleware() {
    return (req, res, next) => {
      // Store original json method
      const originalJson = res.json.bind(res);

      // Detect format from query params
      const format = this.detectFormat(req.query);

      // Transform request
      if (req.body) {
        req.legacyFormat = format;
        req.transformedBody = this.transformRequest(req.body);
      }

      // Override json method to transform response
      res.json = (data) => {
        // Transform to legacy format if requested
        if (format !== 'DEFAULT' && format !== 'JSON') {
          data = this.transformResponse(data, format);
        }
        return originalJson(data);
      };

      next();
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default LegacyFormatTransformer;
