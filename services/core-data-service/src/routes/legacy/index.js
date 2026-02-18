/**
 * @integram/core-data-service - Legacy Action Routes
 *
 * These routes provide backward compatibility with PHP monolith action endpoints.
 * URL format: /{database}/{action}/{id}?params
 *
 * Actions supported:
 * - _m_* (Data Manipulation): _m_new, _m_save, _m_del, _m_move, _m_up, _m_ord
 * - _d_* (Data Definition): _d_new, _d_del, _d_alias, etc.
 * - metadata, terms, xsrf
 */

import { Router } from 'express';

/**
 * Create legacy action routes for PHP compatibility.
 *
 * @param {Object} services - Service instances
 * @param {Object} options - Route options
 * @returns {Router} Express router
 */
export function createLegacyActionRoutes(services, options = {}) {
  const router = Router();
  const { objectService, queryService, typeService, validationService } = services;
  const logger = options.logger || console;

  // ============================================================================
  // Middleware to parse legacy request format
  // ============================================================================

  router.use((req, res, next) => {
    // Merge POST and GET parameters (PHP-like behavior)
    req.params = { ...req.params };
    req.data = { ...req.query, ...req.body };

    // Extract type attributes (t{id}=value)
    req.attributes = {};
    for (const [key, value] of Object.entries(req.data)) {
      if (key.startsWith('t') && /^t\d+$/.test(key)) {
        const typeId = parseInt(key.substring(1), 10);
        req.attributes[typeId] = value;
      }
    }

    next();
  });

  // ============================================================================
  // Data Manipulation Actions (_m_*)
  // ============================================================================

  /**
   * _m_new - Create new object
   * POST /:database/_m_new/:up
   * Parameters: up (parent ID), t (type ID), val, t{id}=value (attributes)
   */
  router.post('/:database/_m_new/:up?', async (req, res) => {
    try {
      const { database, up } = req.params;
      const parentId = parseInt(up || req.data.up || '0', 10);
      const typeId = parseInt(req.data.t, 10);
      const value = req.data.val || '';

      if (!typeId) {
        return res.status(400).json({ error: 'Type ID (t) is required' });
      }

      const result = await objectService.create(database, {
        parentId,
        typeId,
        value,
        requisites: req.attributes,
      });

      logger.info('Object created via legacy route', { database, id: result.id });

      res.json({
        status: 'Ok',
        id: result.id,
        val: result.value,
        up: result.parentId,
        t: result.typeId,
        ord: result.order,
      });
    } catch (error) {
      logger.error('_m_new failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * _m_save - Save/update object attributes
   * POST /:database/_m_save/:id
   * Parameters: t{id}=value (attributes to update)
   */
  router.post('/:database/_m_save/:id', async (req, res) => {
    try {
      const { database, id } = req.params;
      const objectId = parseInt(id, 10);

      // Update value if provided
      const updates = {};
      if (req.data.val !== undefined) {
        updates.value = req.data.val;
      }
      if (Object.keys(req.attributes).length > 0) {
        updates.requisites = req.attributes;
      }

      const result = await objectService.update(database, objectId, updates);

      logger.info('Object saved via legacy route', { database, id: objectId });

      res.json({
        status: 'Ok',
        id: result.id,
        val: result.value,
      });
    } catch (error) {
      logger.error('_m_save failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * _m_del - Delete object
   * POST /:database/_m_del/:id
   */
  router.post('/:database/_m_del/:id', async (req, res) => {
    try {
      const { database, id } = req.params;
      const objectId = parseInt(id, 10);
      const cascade = req.data.cascade === '1' || req.data.cascade === true;

      await objectService.delete(database, objectId, { cascade });

      logger.info('Object deleted via legacy route', { database, id: objectId });

      res.json({ status: 'Ok' });
    } catch (error) {
      logger.error('_m_del failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * _m_move - Move object to new parent
   * POST /:database/_m_move/:id
   * Parameters: up (new parent ID)
   */
  router.post('/:database/_m_move/:id', async (req, res) => {
    try {
      const { database, id } = req.params;
      const objectId = parseInt(id, 10);
      const newParentId = parseInt(req.data.up, 10);

      await objectService.moveToParent(database, objectId, newParentId);

      logger.info('Object moved via legacy route', { database, id: objectId, newParentId });

      res.json({ status: 'Ok' });
    } catch (error) {
      logger.error('_m_move failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * _m_up - Move object up in order (decrease order number)
   * POST /:database/_m_up/:id
   */
  router.post('/:database/_m_up/:id', async (req, res) => {
    try {
      const { database, id } = req.params;
      const objectId = parseInt(id, 10);

      // Get current object
      const obj = await objectService.getById(database, objectId);
      if (!obj) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Decrease order (move up)
      const newOrder = Math.max(1, obj.order - 1);
      await objectService.updateOrder(database, objectId, newOrder);

      logger.info('Object moved up via legacy route', { database, id: objectId });

      res.json({ status: 'Ok', ord: newOrder });
    } catch (error) {
      logger.error('_m_up failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * _m_ord - Set exact order value
   * POST /:database/_m_ord/:id
   * Parameters: order (new order value)
   */
  router.post('/:database/_m_ord/:id', async (req, res) => {
    try {
      const { database, id } = req.params;
      const objectId = parseInt(id, 10);
      const order = parseInt(req.data.order || req.data.ord, 10);

      await objectService.updateOrder(database, objectId, order);

      logger.info('Object order set via legacy route', { database, id: objectId, order });

      res.json({ status: 'Ok', ord: order });
    } catch (error) {
      logger.error('_m_ord failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * _m_id - Set specific ID for an object
   * POST /:database/_m_id/:id
   * Parameters: new_id (the new ID to set)
   * Maps to PHP: case "_m_id" in index.php (lines 7841-7857)
   */
  router.post('/:database/_m_id/:id', async (req, res) => {
    try {
      const { database, id } = req.params;
      const objectId = parseInt(id, 10);
      const newId = parseInt(req.data.new_id, 10);

      if (!newId || newId < 1) {
        return res.status(400).json({ error: 'Invalid ID' });
      }

      await objectService.setId(database, objectId, newId);

      logger.info('Object ID set via legacy route', { database, oldId: objectId, newId });

      res.json({ status: 'Ok', id: newId });
    } catch (error) {
      logger.error('_m_id failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * _m_set - Set object attributes
   * POST /:database/_m_set/:id
   * Parameters: t{id}=value (attributes to set)
   */
  router.post('/:database/_m_set/:id', async (req, res) => {
    try {
      const { database, id } = req.params;
      const objectId = parseInt(id, 10);

      if (Object.keys(req.attributes).length === 0) {
        return res.status(400).json({ error: 'No attributes provided' });
      }

      await objectService.saveRequisites(database, objectId, req.attributes);

      logger.info('Object attributes set via legacy route', { database, id: objectId });

      res.json({ status: 'Ok' });
    } catch (error) {
      logger.error('_m_set failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================================================
  // Data Definition Actions (_d_*)
  // ============================================================================

  /**
   * _d_new / _terms - Create new term/type
   * POST /:database/_d_new/:parentTypeId
   */
  router.post('/:database/_d_new/:parentTypeId?', async (req, res) => {
    try {
      const { database, parentTypeId } = req.params;
      const name = req.data.name || req.data.val || '';
      const parent = parseInt(parentTypeId || req.data.up || '0', 10);

      const result = await typeService.createType(database, {
        name,
        parentId: parent,
      });

      logger.info('Type created via legacy route', { database, id: result.id });

      res.json({
        status: 'Ok',
        id: result.id,
        name: result.name,
      });
    } catch (error) {
      logger.error('_d_new failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_new
  router.post('/:database/_terms', (req, res, next) => {
    req.params.parentTypeId = req.data.up;
    router.handle(req, res, next);
  });

  /**
   * _d_del / _deleteterm - Delete term/type
   * POST /:database/_d_del/:typeId
   */
  router.post('/:database/_d_del/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const id = parseInt(typeId, 10);

      await typeService.deleteType(database, id);

      logger.info('Type deleted via legacy route', { database, id });

      res.json({ status: 'Ok' });
    } catch (error) {
      logger.error('_d_del failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================================================
  // Query Actions
  // ============================================================================

  /**
   * metadata - Get object metadata
   * GET /:database/metadata/:id
   */
  router.get('/:database/metadata/:id?', async (req, res) => {
    try {
      const { database, id } = req.params;

      if (id) {
        const objectId = parseInt(id, 10);
        const obj = await objectService.getById(database, objectId, {
          includeRequisites: true,
        });

        if (!obj) {
          return res.status(404).json({ error: 'Object not found' });
        }

        res.json({
          id: obj.id,
          up: obj.parentId,
          t: obj.typeId,
          val: obj.value,
          ord: obj.order,
          reqs: obj.requisites || {},
        });
      } else {
        // Return schema/types if no ID
        const types = await typeService.getAllTypes(database);
        res.json(types);
      }
    } catch (error) {
      logger.error('metadata failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Also support obj_meta (alias)
  router.get('/:database/obj_meta/:id', (req, res, next) => {
    req.url = `/${req.params.database}/metadata/${req.params.id}`;
    router.handle(req, res, next);
  });

  /**
   * terms - List all terms/types
   * GET /:database/terms
   */
  router.get('/:database/terms', async (req, res) => {
    try {
      const { database } = req.params;
      const includeSystem = req.query.system === '1';

      const types = await typeService.getAllTypes(database, { includeSystem });

      // Format as PHP-compatible array
      const result = types.map(t => ({
        id: t.id,
        type: t.typeId,
        name: t.name,
        val: t.value,
      }));

      res.json(result);
    } catch (error) {
      logger.error('terms failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * xsrf - Get XSRF token and user info
   * GET /:database/xsrf
   */
  router.get('/:database/xsrf', async (req, res) => {
    try {
      const { database } = req.params;
      const user = req.user || {};

      // Generate XSRF token (simplified - in production use crypto)
      const timestamp = Date.now().toString(36);
      const xsrf = `${timestamp}-${Math.random().toString(36).substring(2, 15)}`.substring(0, 22);

      res.json({
        _xsrf: xsrf,
        token: user.token || null,
        user: user.username || null,
        role: user.role || null,
        id: user.userId || null,
      });
    } catch (error) {
      logger.error('xsrf failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Object Query Actions
  // ============================================================================

  /**
   * object - Get object data
   * GET /:database/object/:typeId
   * Parameters: up (parent), LIMIT, F (offset)
   */
  router.get('/:database/object/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const type = parseInt(typeId, 10);
      const parentId = req.query.up !== undefined ? parseInt(req.query.up, 10) : undefined;
      const limit = req.query.LIMIT ? parseInt(req.query.LIMIT, 10) : 20;
      const offset = req.query.F ? parseInt(req.query.F, 10) : 0;

      const options = { limit, offset };
      if (parentId !== undefined) {
        options.parentId = parentId;
      }

      const objects = await objectService.getByType(database, type, options);

      res.json(objects.map(obj => ({
        id: obj.id,
        val: obj.value,
        up: obj.parentId,
        t: obj.typeId,
        ord: obj.order,
      })));
    } catch (error) {
      logger.error('object query failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ============================================================================
// Export
// ============================================================================

export default createLegacyActionRoutes;
