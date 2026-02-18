/**
 * @integram/core-data-service - V2 Routes (Modern JSON:API)
 *
 * Provides modern REST API following best practices.
 * Clean JSON responses with consistent structure.
 */

import { Router } from 'express';

/**
 * Create V2 modern routes.
 *
 * @param {Object} services - Service instances
 * @param {ObjectService} services.objectService - Object service
 * @param {QueryService} services.queryService - Query service
 * @param {TypeService} services.typeService - Type service
 * @param {Object} [options] - Route options
 * @returns {Router} Express router
 */
export function createV2Routes(services, options = {}) {
  const router = Router();
  const { objectService, queryService, typeService } = services;
  const logger = options.logger || console;

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Wrap response in standard format.
   */
  const wrapResponse = (data, meta = {}) => ({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });

  /**
   * Wrap error response.
   */
  const wrapError = (error, code = 'ERROR') => ({
    success: false,
    error: {
      code,
      message: error.message || 'Unknown error',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });

  // ============================================================================
  // Database Routes
  // ============================================================================

  // Get database info
  router.get('/databases/:database', async (req, res) => {
    try {
      const { database } = req.params;

      const types = await typeService.getAllTypes(database);
      const totalTypes = types.length;

      // Get total object count
      const counts = await queryService.countByType(database);
      const totalObjects = counts.reduce((sum, c) => sum + c.count, 0);

      res.json(wrapResponse({
        name: database,
        types: totalTypes,
        objects: totalObjects,
      }));
    } catch (error) {
      logger.error('GET database failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // ============================================================================
  // Type Routes
  // ============================================================================

  // List all types
  router.get('/databases/:database/types', async (req, res) => {
    try {
      const { database } = req.params;
      const includeSystem = req.query.includeSystem === 'true';

      const types = await typeService.getAllTypes(database, { includeSystem });
      res.json(wrapResponse(types, { count: types.length }));
    } catch (error) {
      logger.error('GET types failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Get type by ID
  router.get('/databases/:database/types/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;

      const type = await typeService.getType(database, parseInt(typeId, 10));
      if (!type) {
        return res.status(404).json(wrapError({ message: 'Type not found' }, 'NOT_FOUND'));
      }

      res.json(wrapResponse(type));
    } catch (error) {
      logger.error('GET type failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Get type schema (with requisites)
  router.get('/databases/:database/types/:typeId/schema', async (req, res) => {
    try {
      const { database, typeId } = req.params;

      const schema = await typeService.getSchema(database, parseInt(typeId, 10));
      res.json(wrapResponse(schema));
    } catch (error) {
      logger.error('GET schema failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json(wrapError(error, 'NOT_FOUND'));
      }
      res.status(500).json(wrapError(error));
    }
  });

  // Create type
  router.post('/databases/:database/types', async (req, res) => {
    try {
      const { database } = req.params;
      const { name, baseType, requisites } = req.body;

      if (!name) {
        return res.status(400).json(wrapError({ message: 'Name is required' }, 'VALIDATION'));
      }

      const type = await typeService.createType(database, { name, baseType, requisites });
      res.status(201).json(wrapResponse(type));
    } catch (error) {
      logger.error('POST type failed', { error: error.message });
      res.status(400).json(wrapError(error, 'VALIDATION'));
    }
  });

  // Update type
  router.patch('/databases/:database/types/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const { name, baseType } = req.body;

      const type = await typeService.updateType(database, parseInt(typeId, 10), { name, baseType });
      res.json(wrapResponse(type));
    } catch (error) {
      logger.error('PATCH type failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json(wrapError(error, 'NOT_FOUND'));
      }
      res.status(400).json(wrapError(error, 'VALIDATION'));
    }
  });

  // Delete type
  router.delete('/databases/:database/types/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const cascade = req.query.cascade === 'true';

      await typeService.deleteType(database, parseInt(typeId, 10), { cascade });
      res.status(204).send();
    } catch (error) {
      logger.error('DELETE type failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json(wrapError(error, 'NOT_FOUND'));
      }
      res.status(400).json(wrapError(error, 'VALIDATION'));
    }
  });

  // ============================================================================
  // Object Routes
  // ============================================================================

  // List objects by type
  router.get('/databases/:database/types/:typeId/objects', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const { parentId, limit, offset, orderBy, sortDir } = req.query;

      const filters = {
        typeId: parseInt(typeId, 10),
      };

      if (parentId !== undefined) filters.parentId = parseInt(parentId, 10);
      if (limit !== undefined) filters.limit = parseInt(limit, 10);
      if (offset !== undefined) filters.offset = parseInt(offset, 10);
      if (orderBy) filters.orderBy = orderBy;
      if (sortDir) filters.sortDir = sortDir;

      const objects = await queryService.queryObjects(database, filters);

      // Get total count
      const total = await queryService.countObjects(database, { typeId: filters.typeId, parentId: filters.parentId });

      res.json(wrapResponse(objects, {
        count: objects.length,
        total,
        limit: filters.limit || 20,
        offset: filters.offset || 0,
      }));
    } catch (error) {
      logger.error('GET objects failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Get object by ID
  router.get('/databases/:database/objects/:objectId', async (req, res) => {
    try {
      const { database, objectId } = req.params;
      const includeRequisites = req.query.includeRequisites === 'true';

      const object = await objectService.getById(database, parseInt(objectId, 10), { includeRequisites });

      if (!object) {
        return res.status(404).json(wrapError({ message: 'Object not found' }, 'NOT_FOUND'));
      }

      res.json(wrapResponse(object));
    } catch (error) {
      logger.error('GET object failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Create object
  router.post('/databases/:database/objects', async (req, res) => {
    try {
      const { database } = req.params;
      const { value, typeId, parentId, order, requisites } = req.body;

      if (!value || !typeId) {
        return res.status(400).json(wrapError({ message: 'value and typeId are required' }, 'VALIDATION'));
      }

      const object = await objectService.create(database, {
        value,
        typeId,
        parentId: parentId || 0,
        order,
        requisites,
      });

      res.status(201).json(wrapResponse(object));
    } catch (error) {
      logger.error('POST object failed', { error: error.message });
      res.status(400).json(wrapError(error, 'VALIDATION'));
    }
  });

  // Update object
  router.patch('/databases/:database/objects/:objectId', async (req, res) => {
    try {
      const { database, objectId } = req.params;
      const { value, typeId, parentId, order, requisites } = req.body;

      const object = await objectService.update(database, parseInt(objectId, 10), {
        value,
        typeId,
        parentId,
        order,
        requisites,
      });

      res.json(wrapResponse(object));
    } catch (error) {
      logger.error('PATCH object failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json(wrapError(error, 'NOT_FOUND'));
      }
      res.status(400).json(wrapError(error, 'VALIDATION'));
    }
  });

  // Delete object
  router.delete('/databases/:database/objects/:objectId', async (req, res) => {
    try {
      const { database, objectId } = req.params;
      const cascade = req.query.cascade === 'true';

      await objectService.delete(database, parseInt(objectId, 10), { cascade });
      res.status(204).send();
    } catch (error) {
      logger.error('DELETE object failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Get object children
  router.get('/databases/:database/objects/:objectId/children', async (req, res) => {
    try {
      const { database, objectId } = req.params;
      const { typeId, limit, offset } = req.query;

      const options = {};
      if (typeId !== undefined) options.typeId = parseInt(typeId, 10);
      if (limit !== undefined) options.limit = parseInt(limit, 10);
      if (offset !== undefined) options.offset = parseInt(offset, 10);

      const children = await objectService.getChildren(database, parseInt(objectId, 10), options);
      res.json(wrapResponse(children, { count: children.length }));
    } catch (error) {
      logger.error('GET children failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Get object tree
  router.get('/databases/:database/objects/:objectId/tree', async (req, res) => {
    try {
      const { database, objectId } = req.params;
      const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth, 10) : 10;

      const tree = await queryService.getTree(database, parseInt(objectId, 10), { maxDepth });

      if (!tree) {
        return res.status(404).json(wrapError({ message: 'Object not found' }, 'NOT_FOUND'));
      }

      res.json(wrapResponse(tree));
    } catch (error) {
      logger.error('GET tree failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Get object ancestors
  router.get('/databases/:database/objects/:objectId/ancestors', async (req, res) => {
    try {
      const { database, objectId } = req.params;

      const ancestors = await queryService.getAncestors(database, parseInt(objectId, 10));
      res.json(wrapResponse(ancestors, { count: ancestors.length }));
    } catch (error) {
      logger.error('GET ancestors failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // ============================================================================
  // Query Routes
  // ============================================================================

  // Search objects
  router.get('/databases/:database/search', async (req, res) => {
    try {
      const { database } = req.params;
      const { query, typeId, limit } = req.query;

      if (!query) {
        return res.status(400).json(wrapError({ message: 'Query parameter is required' }, 'VALIDATION'));
      }

      const options = {};
      if (typeId !== undefined) options.typeId = parseInt(typeId, 10);
      if (limit !== undefined) options.limit = parseInt(limit, 10);

      const results = await queryService.searchObjects(database, query, options);
      res.json(wrapResponse(results, { count: results.length }));
    } catch (error) {
      logger.error('Search failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // Advanced query
  router.post('/databases/:database/query', async (req, res) => {
    try {
      const { database } = req.params;
      const { typeId, parentId, value, ids, limit, offset, orderBy, sortDir } = req.body;

      const filters = {};
      if (typeId !== undefined) filters.typeId = typeId;
      if (parentId !== undefined) filters.parentId = parentId;
      if (value !== undefined) filters.value = value;
      if (ids !== undefined) filters.ids = ids;
      if (limit !== undefined) filters.limit = limit;
      if (offset !== undefined) filters.offset = offset;
      if (orderBy !== undefined) filters.orderBy = orderBy;
      if (sortDir !== undefined) filters.sortDir = sortDir;

      const objects = await queryService.queryObjects(database, filters);
      res.json(wrapResponse(objects, { count: objects.length }));
    } catch (error) {
      logger.error('Query failed', { error: error.message });
      res.status(400).json(wrapError(error, 'VALIDATION'));
    }
  });

  // ============================================================================
  // Batch Routes
  // ============================================================================

  // Batch create
  router.post('/databases/:database/objects/batch', async (req, res) => {
    try {
      const { database } = req.params;
      const { objects, typeId, parentId } = req.body;

      if (!Array.isArray(objects)) {
        return res.status(400).json(wrapError({ message: 'Objects array is required' }, 'VALIDATION'));
      }

      const options = {};
      if (typeId !== undefined) options.typeId = typeId;
      if (parentId !== undefined) options.parentId = parentId;

      const ids = await objectService.createBatch(database, objects, options);
      res.status(201).json(wrapResponse({ ids }, { count: ids.length }));
    } catch (error) {
      logger.error('Batch create failed', { error: error.message });
      res.status(400).json(wrapError(error, 'VALIDATION'));
    }
  });

  // Batch delete
  router.delete('/databases/:database/objects/batch', async (req, res) => {
    try {
      const { database } = req.params;
      const { ids } = req.body;

      if (!Array.isArray(ids)) {
        return res.status(400).json(wrapError({ message: 'IDs array is required' }, 'VALIDATION'));
      }

      const count = await objectService.deleteByIds(database, ids);
      res.json(wrapResponse({ deleted: count }));
    } catch (error) {
      logger.error('Batch delete failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  // ============================================================================
  // Statistics Routes
  // ============================================================================

  // Get statistics by type
  router.get('/databases/:database/stats', async (req, res) => {
    try {
      const { database } = req.params;

      const typeCounts = await queryService.countByType(database);
      const total = typeCounts.reduce((sum, c) => sum + c.count, 0);

      res.json(wrapResponse({
        total,
        byType: typeCounts,
      }));
    } catch (error) {
      logger.error('GET stats failed', { error: error.message });
      res.status(500).json(wrapError(error));
    }
  });

  return router;
}

export default createV2Routes;
