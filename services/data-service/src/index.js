/**
 * @integram/data-service - Main Entry Point
 *
 * Core Data Service for Integram - provides CRUD operations,
 * object management, value formatting, and input validation.
 *
 * Phase 3 of backend componentization.
 */

// ============================================================================
// Re-export all modules
// ============================================================================

export * from './services/index.js';

// ============================================================================
// Import defaults
// ============================================================================

import {
  ObjectService,
  FormatService,
  BuiltInService,
  ValidationService,
} from './services/index.js';

// ============================================================================
// Package information
// ============================================================================

export const PACKAGE_NAME = '@integram/data-service';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// Data Service Class (Facade)
// ============================================================================

/**
 * High-level data service that combines all data operations.
 * Provides a unified interface for object management, formatting,
 * validation, and built-in variable resolution.
 */
export class DataService {
  /**
   * Create a new DataService.
   *
   * @param {Object} databaseService - Database service instance
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.timezone=0] - Timezone offset in seconds
   * @param {Object} [options.context] - Request context
   */
  constructor(databaseService, options = {}) {
    this.db = databaseService;
    this.logger = options.logger || console;
    this.timezone = options.timezone || 0;

    // Initialize sub-services
    this.objects = new ObjectService(databaseService, {
      logger: this.logger,
      logQueries: options.logQueries,
    });

    this.format = new FormatService({
      timezone: this.timezone,
    });

    this.builtIn = new BuiltInService({
      context: options.context || {},
      timezone: this.timezone,
    });

    this.validation = new ValidationService();
  }

  /**
   * Set request context.
   *
   * @param {Object} context - Request context
   */
  setContext(context) {
    this.builtIn.setContext(context);
  }

  /**
   * Set timezone offset.
   *
   * @param {number} offset - Timezone offset in seconds
   */
  setTimezone(offset) {
    this.timezone = offset;
    this.format.setTimezone(offset);
    this.builtIn.setTimezone(offset);
  }

  // ============================================================================
  // Object Operations (delegated to ObjectService)
  // ============================================================================

  /**
   * Get object by ID.
   */
  async getById(database, id) {
    return this.objects.getById(database, id);
  }

  /**
   * Get objects by type.
   */
  async getByType(database, type, options) {
    return this.objects.getByType(database, type, options);
  }

  /**
   * Get children of an object.
   */
  async getChildren(database, parentId, type) {
    return this.objects.getChildren(database, parentId, type);
  }

  /**
   * Get object attribute.
   */
  async getAttribute(database, objectId, typeId) {
    return this.objects.getAttribute(database, objectId, typeId);
  }

  /**
   * Insert new object.
   */
  async insert(database, up, ord, t, val, label) {
    return this.objects.insert(database, up, ord, t, val, label);
  }

  /**
   * Update object value.
   */
  async updateValue(database, id, val, label) {
    return this.objects.updateValue(database, id, val, label);
  }

  /**
   * Delete object.
   */
  async delete(database, id, deleteChildren = true, label) {
    return this.objects.delete(database, id, deleteChildren, label);
  }

  /**
   * Check if object exists.
   */
  async exists(database, id) {
    return this.objects.exists(database, id);
  }

  // ============================================================================
  // Format Operations (delegated to FormatService)
  // ============================================================================

  /**
   * Format value for storage.
   */
  formatForStorage(type, value) {
    // First resolve any built-in placeholders
    const resolved = this.builtIn.hasPlaceholders(value)
      ? this.builtIn.replaceAll(value)
      : value;
    return this.format.formatForStorage(type, resolved);
  }

  /**
   * Format value for display.
   */
  formatForDisplay(type, value, id) {
    return this.format.formatForDisplay(type, value, id);
  }

  // ============================================================================
  // Validation Operations (delegated to ValidationService)
  // ============================================================================

  /**
   * Check for SQL injection.
   */
  checkInjection(value) {
    return this.validation.checkInjection(value);
  }

  /**
   * Validate database name.
   */
  validateDbName(name, isUserDb) {
    return this.validation.validateDbName(name, isUserDb);
  }

  /**
   * Validate email.
   */
  validateEmail(email) {
    return this.validation.validateEmail(email);
  }

  /**
   * Validate password.
   */
  validatePassword(password, options) {
    return this.validation.validatePassword(password, options);
  }

  // ============================================================================
  // Built-in Operations (delegated to BuiltInService)
  // ============================================================================

  /**
   * Resolve built-in placeholder.
   */
  resolveBuiltIn(placeholder) {
    return this.builtIn.resolve(placeholder);
  }

  /**
   * Replace all built-in placeholders.
   */
  replaceBuiltIns(text) {
    return this.builtIn.replaceAll(text);
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Check service health.
   */
  async healthCheck() {
    try {
      await this.db.healthCheck();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          objects: 'available',
          format: 'available',
          validation: 'available',
          builtIn: 'available',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a DataService from a database service.
 *
 * @param {Object} databaseService - Database service instance
 * @param {Object} [options] - Service options
 * @returns {DataService} Configured data service
 */
export function createDataService(databaseService, options = {}) {
  return new DataService(databaseService, options);
}

// ============================================================================
// Export default object
// ============================================================================

export default {
  // Main class
  DataService,

  // Sub-services
  ObjectService,
  FormatService,
  BuiltInService,
  ValidationService,

  // Factory
  createDataService,

  // Package info
  PACKAGE_NAME,
  PACKAGE_VERSION,
};
