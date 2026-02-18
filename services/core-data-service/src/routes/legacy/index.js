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

  // Alias for _d_del
  router.post('/:database/_deleteterm/:typeId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_del/${req.params.typeId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_req / _attributes - Add requisite to type
   * POST /:database/_d_req/:typeId
   * Parameters: t (requisite type ID)
   */
  router.post('/:database/_d_req/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const parentType = parseInt(typeId, 10);
      const reqType = parseInt(req.data.t, 10);
      const multi = req.data.multiselect === '1' || req.data.multi === '1';

      if (!reqType) {
        return res.status(400).json({ error: 'Requisite type (t) is required' });
      }

      const result = await typeService.addRequisites(database, parentType, [{
        name: '',  // Will be set from the requisite type
        type: reqType,
        multi,
      }]);

      logger.info('Requisite added via legacy route', { database, typeId: parentType, reqType });

      res.json({
        status: 'Ok',
        id: result[0],
        obj: parentType,
      });
    } catch (error) {
      logger.error('_d_req failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_req
  router.post('/:database/_attributes/:typeId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_req/${req.params.typeId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_save / _patchterm - Save/update type
   * POST /:database/_d_save/:typeId
   * Parameters: val (name), t (base type), unique (order)
   */
  router.post('/:database/_d_save/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const id = parseInt(typeId, 10);
      const name = req.data.val || req.data.name;
      const baseType = req.data.t ? parseInt(req.data.t, 10) : undefined;

      const updateData = {};
      if (name !== undefined) {
        updateData.name = name;
      }
      if (baseType !== undefined) {
        updateData.baseType = baseType;
      }

      const result = await typeService.updateType(database, id, updateData);

      logger.info('Type updated via legacy route', { database, id });

      res.json({
        status: 'Ok',
        id: result.id,
        obj: result.id,
      });
    } catch (error) {
      logger.error('_d_save failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_save
  router.post('/:database/_patchterm/:typeId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_save/${req.params.typeId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_alias / _setalias - Set type/requisite alias
   * POST /:database/_d_alias/:reqId
   * Parameters: val (alias value)
   */
  router.post('/:database/_d_alias/:reqId', async (req, res) => {
    try {
      const { database, reqId } = req.params;
      const id = parseInt(reqId, 10);
      const alias = req.data.val || '';

      await typeService.updateRequisite(database, id, { alias });

      logger.info('Alias set via legacy route', { database, id, alias });

      res.json({ status: 'Ok' });
    } catch (error) {
      logger.error('_d_alias failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_alias
  router.post('/:database/_setalias/:reqId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_alias/${req.params.reqId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_null / _setnull - Toggle NOT NULL flag on requisite
   * POST /:database/_d_null/:reqId
   */
  router.post('/:database/_d_null/:reqId', async (req, res) => {
    try {
      const { database, reqId } = req.params;
      const id = parseInt(reqId, 10);

      // Get current state and toggle
      const current = await typeService.getRequisite(database, id);
      if (!current) {
        return res.status(404).json({ error: 'Requisite not found' });
      }

      await typeService.updateRequisite(database, id, {
        required: !current.required,
      });

      logger.info('NOT NULL toggled via legacy route', { database, id, required: !current.required });

      res.json({ status: 'Ok', obj: current.parentTypeId });
    } catch (error) {
      logger.error('_d_null failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_null
  router.post('/:database/_setnull/:reqId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_null/${req.params.reqId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_multi / _setmulti - Toggle multi-select flag on requisite
   * POST /:database/_d_multi/:reqId
   */
  router.post('/:database/_d_multi/:reqId', async (req, res) => {
    try {
      const { database, reqId } = req.params;
      const id = parseInt(reqId, 10);

      // Get current state and toggle
      const current = await typeService.getRequisite(database, id);
      if (!current) {
        return res.status(404).json({ error: 'Requisite not found' });
      }

      await typeService.updateRequisite(database, id, {
        multi: !current.multi,
      });

      logger.info('Multi-select toggled via legacy route', { database, id, multi: !current.multi });

      res.json({ status: 'Ok', obj: current.parentTypeId });
    } catch (error) {
      logger.error('_d_multi failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_multi
  router.post('/:database/_setmulti/:reqId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_multi/${req.params.reqId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_up / _moveup - Move requisite up in order
   * POST /:database/_d_up/:reqId
   */
  router.post('/:database/_d_up/:reqId', async (req, res) => {
    try {
      const { database, reqId } = req.params;
      const id = parseInt(reqId, 10);

      // Get current requisite
      const current = await typeService.getRequisite(database, id);
      if (!current) {
        return res.status(404).json({ error: 'Requisite not found' });
      }

      // Swap with previous requisite (decrease order)
      const requisites = await typeService.getRequisites(database, current.parentTypeId);
      const currentIndex = requisites.findIndex(r => r.id === id);

      if (currentIndex > 0) {
        const prevReq = requisites[currentIndex - 1];
        // Swap orders
        await typeService.updateRequisite(database, id, { order: prevReq.order });
        await typeService.updateRequisite(database, prevReq.id, { order: current.order });
      }

      logger.info('Requisite moved up via legacy route', { database, id });

      res.json({ status: 'Ok', obj: current.parentTypeId });
    } catch (error) {
      logger.error('_d_up failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_up
  router.post('/:database/_moveup/:reqId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_up/${req.params.reqId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_ord / _setorder - Set exact order for requisite
   * POST /:database/_d_ord/:reqId
   * Parameters: order (new order value)
   */
  router.post('/:database/_d_ord/:reqId', async (req, res) => {
    try {
      const { database, reqId } = req.params;
      const id = parseInt(reqId, 10);
      const newOrder = parseInt(req.data.order, 10);

      if (!newOrder || newOrder < 1) {
        return res.status(400).json({ error: 'Invalid order value' });
      }

      const current = await typeService.getRequisite(database, id);
      if (!current) {
        return res.status(404).json({ error: 'Requisite not found' });
      }

      // Note: This is a simplified implementation - in production
      // we'd need to shift other requisites like PHP does
      await typeService.updateRequisite(database, id, { order: newOrder });

      logger.info('Requisite order set via legacy route', { database, id, newOrder });

      res.json({ status: 'Ok', obj: current.parentTypeId });
    } catch (error) {
      logger.error('_d_ord failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_ord
  router.post('/:database/_setorder/:reqId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_ord/${req.params.reqId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_del_req / _deletereq - Delete requisite
   * POST /:database/_d_del_req/:reqId
   */
  router.post('/:database/_d_del_req/:reqId', async (req, res) => {
    try {
      const { database, reqId } = req.params;
      const id = parseInt(reqId, 10);

      // Get parent type for response
      const current = await typeService.getRequisite(database, id);
      if (!current) {
        return res.status(404).json({ error: 'Requisite not found' });
      }

      const parentTypeId = current.parentTypeId;

      await typeService.deleteRequisite(database, id);

      logger.info('Requisite deleted via legacy route', { database, id });

      res.json({ status: 'Ok', obj: parentTypeId, id: parentTypeId });
    } catch (error) {
      logger.error('_d_del_req failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_del_req
  router.post('/:database/_deletereq/:reqId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_del_req/${req.params.reqId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_attrs / _modifiers - Set type/requisite modifiers
   * POST /:database/_d_attrs/:reqId
   * Parameters: val, alias, set_null, multi
   */
  router.post('/:database/_d_attrs/:reqId', async (req, res) => {
    try {
      const { database, reqId } = req.params;
      const id = parseInt(reqId, 10);

      const updateData = {
        name: req.data.val || undefined,
        alias: req.data.alias || undefined,
        required: req.data.set_null === '1',
        multi: req.data.multi === '1',
      };

      await typeService.updateRequisite(database, id, updateData);

      logger.info('Modifiers set via legacy route', { database, id });

      res.json({ status: 'Ok' });
    } catch (error) {
      logger.error('_d_attrs failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_attrs
  router.post('/:database/_modifiers/:reqId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_attrs/${req.params.reqId}`;
    router.handle(req, res, next);
  });

  /**
   * _d_ref / _references - Create reference type
   * POST /:database/_d_ref/:typeId
   */
  router.post('/:database/_d_ref/:typeId', async (req, res) => {
    try {
      const { database, typeId } = req.params;
      const id = parseInt(typeId, 10);

      // In Integram, a reference is created by inserting a record with up=0, t=typeId, val=''
      const result = await typeService.createType(database, {
        name: '',  // Empty value for reference
        baseType: id,  // The type being referenced
        parentId: 0,
      });

      logger.info('Reference created via legacy route', { database, typeId: id, newId: result.id });

      res.json({
        status: 'Ok',
        obj: result.id,
        id: result.id,
      });
    } catch (error) {
      logger.error('_d_ref failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for _d_ref
  router.post('/:database/_references/:typeId', async (req, res, next) => {
    req.url = `/${req.params.database}/_d_ref/${req.params.typeId}`;
    router.handle(req, res, next);
  });

  /**
   * exit - Logout / clear session
   * POST/GET /:database/exit
   */
  router.all('/:database/exit', async (req, res) => {
    try {
      const { database } = req.params;

      // Clear cookies
      res.clearCookie(database);
      res.clearCookie(`${database}_locale`);

      logger.info('User logged out via legacy route', { database });

      res.json({ status: 'Ok', message: 'Logged out' });
    } catch (error) {
      logger.error('exit failed', { error: error.message });
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
   * _ref_reqs - Get reference requisites for dropdown lists
   * GET /:database/_ref_reqs/:refId
   * Maps to PHP: case "_ref_reqs" in index.php (lines 8944-9086)
   * Parameters: q (search query), r (restrict to specific IDs)
   */
  router.get('/:database/_ref_reqs/:refId', async (req, res) => {
    try {
      const { database, refId } = req.params;
      const id = parseInt(refId, 10);
      const searchQuery = req.query.q || '';
      const restrictIds = req.query.r ? req.query.r.split(',').map(id => parseInt(id, 10)) : [];

      if (!id) {
        return res.status(400).json({ error: 'Invalid reference ID' });
      }

      // Get the reference type info
      const refQuery = queryService.createBuilder(database)
        .select('t', 'val')
        .whereId(id);

      const { rows: refRows } = await queryService.db.executeQuery(refQuery, 'Get ref type');

      if (refRows.length === 0) {
        return res.status(404).json({ error: 'Reference not found' });
      }

      const refTypeId = refRows[0].t;

      // Build query for dropdown list items
      let query = queryService.createBuilder(database)
        .select('id', 'val')
        .whereType(refTypeId)
        .limit(80); // DDLIST_ITEMS constant

      // Apply search filter
      if (searchQuery) {
        if (searchQuery.startsWith('@')) {
          // Search by ID
          const searchId = parseInt(searchQuery.substring(1), 10);
          if (!isNaN(searchId)) {
            query = query.where('id', '=', searchId);
          }
        } else if (searchQuery.includes('%')) {
          // LIKE search
          query = query.where('val', 'LIKE', searchQuery);
        } else {
          // Contains search
          query = query.where('val', 'LIKE', `%${searchQuery}%`);
        }
      }

      // Apply restriction filter
      if (restrictIds.length > 0) {
        query = query.where('id', 'IN', restrictIds);
      }

      query = query.orderBy('val', 'ASC');

      const { rows } = await queryService.db.executeQuery(query, 'Get ref list');

      // Format as key-value pairs (PHP-compatible format)
      const result = {};
      for (const row of rows) {
        result[row.id] = row.val;
      }

      res.json(result);
    } catch (error) {
      logger.error('_ref_reqs failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

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
