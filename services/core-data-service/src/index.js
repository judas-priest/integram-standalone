/**
 * @integram/core-data-service - Main Entry Point
 *
 * Core data service for Integram - handles CRUD operations, queries,
 * and data management with full PHP compatibility.
 */

import express from 'express';

// ============================================================================
// Re-export Services
// ============================================================================

export * from './services/index.js';
export * from './middleware/LegacyFormatTransformer.js';

// ============================================================================
// Import Services
// ============================================================================

import { ObjectService } from './services/ObjectService.js';
import { QueryService } from './services/QueryService.js';
import { TypeService } from './services/TypeService.js';
import { ValidationService } from './services/ValidationService.js';
import { LegacyFormatTransformer } from './middleware/LegacyFormatTransformer.js';
import { createV1Routes } from './routes/v1/index.js';
import { createV2Routes } from './routes/v2/index.js';
import { createLegacyActionRoutes } from './routes/legacy/index.js';

// ============================================================================
// Package Information
// ============================================================================

export const PACKAGE_NAME = '@integram/core-data-service';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// CoreDataService Class
// ============================================================================

/**
 * Core data service that coordinates all data operations.
 */
export class CoreDataService {
  /**
   * Create a new core data service.
   *
   * @param {Object} databaseService - Database service instance
   * @param {Object} [options] - Service options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(databaseService, options = {}) {
    this.logger = options.logger || console;

    // Create shared validation service
    const validationService = new ValidationService(options);

    // Initialize services
    this.objectService = new ObjectService(databaseService, {
      ...options,
      validationService,
    });

    this.queryService = new QueryService(databaseService, {
      ...options,
      validationService,
    });

    this.typeService = new TypeService(databaseService, {
      ...options,
      validationService,
    });

    this.validationService = validationService;
    this.transformer = new LegacyFormatTransformer(options);
  }

  /**
   * Get all services.
   *
   * @returns {Object} Service instances
   */
  getServices() {
    return {
      objectService: this.objectService,
      queryService: this.queryService,
      typeService: this.typeService,
      validationService: this.validationService,
    };
  }

  /**
   * Create Express router with all routes.
   *
   * @param {Object} [options] - Router options
   * @param {boolean} [options.enableV1=true] - Enable v1 routes
   * @param {boolean} [options.enableV2=true] - Enable v2 routes
   * @param {boolean} [options.enableLegacy=true] - Enable legacy action routes
   * @returns {express.Router} Express router
   */
  createRouter(options = {}) {
    const router = express.Router();
    const services = this.getServices();
    const routeOptions = { logger: this.logger };

    // Mount v1 legacy routes
    if (options.enableV1 !== false) {
      router.use('/v1', createV1Routes(services, routeOptions));
    }

    // Mount v2 modern routes
    if (options.enableV2 !== false) {
      router.use('/v2', createV2Routes(services, routeOptions));
    }

    // Mount legacy action routes (PHP-compatible _m_*, _d_* actions)
    if (options.enableLegacy !== false) {
      router.use('/', createLegacyActionRoutes(services, routeOptions));
    }

    return router;
  }

  // ============================================================================
  // Convenience Methods (delegates to services)
  // ============================================================================

  // Object operations
  async create(database, data) {
    return this.objectService.create(database, data);
  }

  async getById(database, id, options) {
    return this.objectService.getById(database, id, options);
  }

  async update(database, id, data) {
    return this.objectService.update(database, id, data);
  }

  async delete(database, id, options) {
    return this.objectService.delete(database, id, options);
  }

  // Query operations
  async query(database, filters) {
    return this.queryService.queryObjects(database, filters);
  }

  async search(database, term, options) {
    return this.queryService.searchObjects(database, term, options);
  }

  async count(database, filters) {
    return this.queryService.countObjects(database, filters);
  }

  // Type operations
  async getTypes(database, options) {
    return this.typeService.getAllTypes(database, options);
  }

  async getSchema(database, typeId) {
    return this.typeService.getSchema(database, typeId);
  }

  async createType(database, data) {
    return this.typeService.createType(database, data);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a core data service with database service.
 *
 * @param {Object} databaseService - Database service instance
 * @param {Object} [options] - Service options
 * @returns {CoreDataService} Core data service
 */
export function createCoreDataService(databaseService, options = {}) {
  return new CoreDataService(databaseService, options);
}

// ============================================================================
// Express App Factory
// ============================================================================

/**
 * Create an Express app for the core data service.
 *
 * @param {Object} databaseService - Database service instance
 * @param {Object} [options] - Service options
 * @returns {express.Application} Express app
 */
export function createApp(databaseService, options = {}) {
  const app = express();
  const coreDataService = createCoreDataService(databaseService, options);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount routes
  app.use('/api', coreDataService.createRouter(options));

  // Error handler
  app.use((err, req, res, next) => {
    const logger = options.logger || console;
    logger.error('Unhandled error', { error: err.message, stack: err.stack });

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
      },
    });
  });

  return app;
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  // Classes
  CoreDataService,
  ObjectService,
  QueryService,
  TypeService,
  ValidationService,
  LegacyFormatTransformer,

  // Factory functions
  createCoreDataService,
  createApp,
  createV1Routes,
  createV2Routes,
  createLegacyActionRoutes,

  // Package info
  PACKAGE_NAME,
  PACKAGE_VERSION,
};
