/**
 * @integram/core-data-service - V1 Routes (Legacy Compatibility)
 *
 * Provides backward-compatible endpoints that match the PHP monolith API.
 * These routes handle legacy formats: JSON_DATA, JSON_KV, JSON_CR, JSON_HR
 */

import { Router } from 'express';
import { LegacyFormatTransformer } from '../../middleware/LegacyFormatTransformer.js';

/**
 * Create V1 legacy-compatible routes.
 *
 * @param {Object} services - Service instances
 * @param {ObjectService} services.objectService - Object service
 * @param {QueryService} services.queryService - Query service
 * @param {TypeService} services.typeService - Type service
 * @param {Object} [options] - Route options
 * @returns {Router} Express router
 */
export function createV1Routes(services, options = {}) {
  const router = Router();
  const { objectService, queryService, typeService } = services;
  const logger = options.logger || console;
  const transformer = new LegacyFormatTransformer({ logger });

  // Apply legacy format middleware
  router.use(transformer.middleware());

  // ============================================================================
  // Object List (GET /:database/object/:type)
  // Maps to PHP: JSON_DATA queries
  // ============================================================================

  router.get('/:database/object/:type', async (req, res) => {
    try {
      const { database, type } = req.params;
      const { up, LIMIT, F, ord, filter } = req.query;

      const filters = {
        typeId: parseInt(type, 10),
        limit: LIMIT ? parseInt(LIMIT, 10) : 20,
        offset: F ? parseInt(F, 10) : 0,
      };

      if (up !== undefined) {
        filters.parentId = parseInt(up, 10);
      }

      if (ord) {
        filters.orderBy = ord;
      }

      const objects = await queryService.queryObjects(database, filters);
      res.json(objects);
    } catch (error) {
      logger.error('GET object list failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Get Single Object (GET /:database/:id)
  // Maps to PHP: JSON_KV single object
  // ============================================================================

  router.get('/:database/:id(\\d+)', async (req, res) => {
    try {
      const { database, id } = req.params;

      const object = await objectService.getById(database, parseInt(id, 10), {
        includeRequisites: req.query.reqs === '1',
      });

      if (!object) {
        return res.status(404).json({ error: 'Object not found' });
      }

      res.json(transformer.objectToLegacy(object));
    } catch (error) {
      logger.error('GET object failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Create Object (POST /:database)
  // Maps to PHP: Insert() with JSON_DATA
  // ============================================================================

  router.post('/:database', async (req, res) => {
    try {
      const { database } = req.params;
      const { t, up, val, ord, ...requisites } = req.body;

      const data = {
        typeId: t ? parseInt(t, 10) : undefined,
        parentId: up !== undefined ? parseInt(up, 10) : 0,
        value: val || '',
        order: ord !== undefined ? parseInt(ord, 10) : undefined,
      };

      // Extract requisites (keys that are numeric)
      const reqData = {};
      for (const [key, value] of Object.entries(requisites)) {
        const numKey = parseInt(key, 10);
        if (!isNaN(numKey)) {
          reqData[numKey] = value;
        }
      }
      if (Object.keys(reqData).length > 0) {
        data.requisites = reqData;
      }

      const created = await objectService.create(database, data);
      res.status(201).json({
        id: created.id,
        val: created.value,
        up: created.parentId,
        t: created.typeId,
        ord: created.order,
      });
    } catch (error) {
      logger.error('POST object failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================================================
  // Update Object Value (PUT /:database/:id)
  // Maps to PHP: Update_Val()
  // ============================================================================

  router.put('/:database/:id(\\d+)', async (req, res) => {
    try {
      const { database, id } = req.params;
      const { val, t, up, ord, ...requisites } = req.body;

      const data = {};
      if (val !== undefined) data.value = val;
      if (t !== undefined) data.typeId = parseInt(t, 10);
      if (up !== undefined) data.parentId = parseInt(up, 10);
      if (ord !== undefined) data.order = parseInt(ord, 10);

      // Extract requisites
      const reqData = {};
      for (const [key, value] of Object.entries(requisites)) {
        const numKey = parseInt(key, 10);
        if (!isNaN(numKey)) {
          reqData[numKey] = value;
        }
      }
      if (Object.keys(reqData).length > 0) {
        data.requisites = reqData;
      }

      const updated = await objectService.update(database, parseInt(id, 10), data);
      res.json(transformer.objectToLegacy(updated));
    } catch (error) {
      logger.error('PUT object failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json({ error: error.message });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================================================
  // Delete Object (DELETE /:database/:id)
  // Maps to PHP: Delete()
  // ============================================================================

  router.delete('/:database/:id(\\d+)', async (req, res) => {
    try {
      const { database, id } = req.params;
      const cascade = req.query.cascade === '1';

      await objectService.delete(database, parseInt(id, 10), { cascade });
      res.status(204).send();
    } catch (error) {
      logger.error('DELETE object failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Get Children (GET /:database/:parentId/children)
  // ============================================================================

  router.get('/:database/:parentId(\\d+)/children', async (req, res) => {
    try {
      const { database, parentId } = req.params;
      const { t, LIMIT, F } = req.query;

      const options = {};
      if (t !== undefined) options.typeId = parseInt(t, 10);
      if (LIMIT !== undefined) options.limit = parseInt(LIMIT, 10);
      if (F !== undefined) options.offset = parseInt(F, 10);

      const children = await objectService.getChildren(database, parseInt(parentId, 10), options);
      res.json(transformer.arrayToLegacy(children));
    } catch (error) {
      logger.error('GET children failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Type Operations
  // ============================================================================

  // Get all types
  router.get('/:database/types', async (req, res) => {
    try {
      const { database } = req.params;
      const includeSystem = req.query.system === '1';

      const types = await typeService.getAllTypes(database, { includeSystem });
      res.json(types);
    } catch (error) {
      logger.error('GET types failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Get type schema
  router.get('/:database/types/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;

      const schema = await typeService.getSchema(database, parseInt(typeId, 10));
      res.json(schema);
    } catch (error) {
      logger.error('GET type schema failed', { error: error.message });
      if (error.name === 'NotFoundError') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Get type requisites
  router.get('/:database/types/:typeId/requisites', async (req, res) => {
    try {
      const { database, typeId } = req.params;

      const requisites = await typeService.getRequisites(database, parseInt(typeId, 10));
      res.json(requisites);
    } catch (error) {
      logger.error('GET requisites failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Query Operations
  // ============================================================================

  // Search objects
  router.get('/:database/search', async (req, res) => {
    try {
      const { database } = req.params;
      const { q, t, LIMIT } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Search query (q) is required' });
      }

      const options = {};
      if (t !== undefined) options.typeId = parseInt(t, 10);
      if (LIMIT !== undefined) options.limit = parseInt(LIMIT, 10);

      const results = await queryService.searchObjects(database, q, options);
      res.json(transformer.arrayToLegacy(results));
    } catch (error) {
      logger.error('Search failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Count objects
  router.get('/:database/count', async (req, res) => {
    try {
      const { database } = req.params;
      const { t, up } = req.query;

      const filters = {};
      if (t !== undefined) filters.typeId = parseInt(t, 10);
      if (up !== undefined) filters.parentId = parseInt(up, 10);

      const count = await queryService.countObjects(database, filters);
      res.json({ count });
    } catch (error) {
      logger.error('Count failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Get tree structure
  router.get('/:database/:id(\\d+)/tree', async (req, res) => {
    try {
      const { database, id } = req.params;
      const maxDepth = req.query.depth ? parseInt(req.query.depth, 10) : 10;

      const tree = await queryService.getTree(database, parseInt(id, 10), { maxDepth });

      if (!tree) {
        return res.status(404).json({ error: 'Object not found' });
      }

      res.json(transformer.toJsonHr(tree));
    } catch (error) {
      logger.error('GET tree failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Batch Operations
  // ============================================================================

  // Batch create
  router.post('/:database/batch', async (req, res) => {
    try {
      const { database } = req.params;
      const { objects, t, up } = req.body;

      if (!Array.isArray(objects)) {
        return res.status(400).json({ error: 'Objects array is required' });
      }

      const options = {};
      if (t !== undefined) options.typeId = parseInt(t, 10);
      if (up !== undefined) options.parentId = parseInt(up, 10);

      const ids = await objectService.createBatch(database, objects, options);
      res.status(201).json({ ids });
    } catch (error) {
      logger.error('Batch create failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Batch delete
  router.delete('/:database/batch', async (req, res) => {
    try {
      const { database } = req.params;
      const { ids } = req.body;

      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs array is required' });
      }

      const count = await objectService.deleteByIds(database, ids);
      res.json({ deleted: count });
    } catch (error) {
      logger.error('Batch delete failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createV1Routes;
