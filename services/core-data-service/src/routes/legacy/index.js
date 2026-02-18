/**
 * @integram/core-data-service - Legacy PHP Routes
 *
 * Provides backward-compatible endpoints that exactly match PHP monolith actions.
 * These routes handle legacy action names: _m_set, _m_save, _m_up, _m_ord, _m_id
 */

import { Router } from 'express';

/**
 * Create legacy PHP-compatible routes.
 * Maps to PHP actions in index.php: _m_set, _m_save, _m_up, _m_ord, _m_id
 *
 * @param {Object} services - Service instances
 * @param {ObjectService} services.objectService - Object service
 * @param {QueryService} services.queryService - Query service
 * @param {TypeService} services.typeService - Type service
 * @param {Object} [options] - Route options
 * @returns {Router} Express router
 */
export function createLegacyRoutes(services, options = {}) {
  const router = Router();
  const { objectService, queryService, typeService } = services;
  const logger = options.logger || console;

  // ============================================================================
  // _m_set - Set single attribute value
  // Maps to PHP: case "_m_set"
  // ============================================================================

  router.post('/:database/_m_set', async (req, res) => {
    try {
      const { database } = req.params;
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Object ID is required' });
      }

      const objId = parseInt(id, 10);
      const updates = {};

      // Extract requisite updates (keys that start with 't' followed by number)
      // PHP: foreach($_REQUEST as $key => $val) if((substr($key, 0, 1) == "t") && ((int)substr($key, 1)!=0))
      for (const [key, value] of Object.entries(req.body)) {
        if (key.startsWith('t') && /^\d+$/.test(key.substring(1))) {
          const typeId = parseInt(key.substring(1), 10);
          updates[typeId] = value;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No attribute set' });
      }

      // Save each requisite
      for (const [typeId, value] of Object.entries(updates)) {
        await objectService.saveRequisites(database, objId, { [typeId]: value });
      }

      logger.debug('_m_set completed', { database, objectId: objId, updates });

      res.json({
        success: true,
        id: objId,
        obj: objId,
      });
    } catch (error) {
      logger.error('_m_set failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // _m_save - Save object with all requisites
  // Maps to PHP: case "_m_save"
  // ============================================================================

  router.post('/:database/_m_save', async (req, res) => {
    try {
      const { database } = req.params;
      const { id, copybtn } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Object ID is required' });
      }

      const objId = parseInt(id, 10);

      // Get current object
      const current = await objectService.getById(database, objId);
      if (!current) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Extract updates
      const valueUpdates = {};
      const requisiteUpdates = {};

      for (const [key, value] of Object.entries(req.body)) {
        if (key.startsWith('t') && /^\d+$/.test(key.substring(1))) {
          const typeId = parseInt(key.substring(1), 10);

          // Check if this is the main object value (typeId matches object type)
          if (typeId === current.typeId) {
            valueUpdates.value = value;
          } else {
            requisiteUpdates[typeId] = value;
          }
        }
      }

      // Handle copy operation
      if (copybtn) {
        const copyResult = await objectService.create(database, {
          typeId: current.typeId,
          parentId: current.parentId,
          value: valueUpdates.value || current.value,
          requisites: requisiteUpdates,
        });

        return res.json({
          success: true,
          id: copyResult.id,
          copied: true,
        });
      }

      // Update object value if changed
      if (valueUpdates.value !== undefined && valueUpdates.value !== current.value) {
        await objectService.updateValue(database, objId, valueUpdates.value);
      }

      // Save requisites
      if (Object.keys(requisiteUpdates).length > 0) {
        await objectService.saveRequisites(database, objId, requisiteUpdates);
      }

      logger.debug('_m_save completed', { database, objectId: objId });

      res.json({
        success: true,
        id: objId,
        saved: true,
      });
    } catch (error) {
      logger.error('_m_save failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // _m_up - Move object up in order
  // Maps to PHP: case "_m_up"
  // ============================================================================

  router.post('/:database/_m_up', async (req, res) => {
    try {
      const { database } = req.params;
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Object ID is required' });
      }

      const objId = parseInt(id, 10);

      // Get current object and its sibling with lower order
      const current = await objectService.getById(database, objId);
      if (!current) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Find sibling with max order less than current
      const siblings = await objectService.getChildren(database, current.parentId, {
        typeId: current.typeId,
      });

      // Sort by order and find the one just before current
      const sorted = siblings.sort((a, b) => a.order - b.order);
      const currentIndex = sorted.findIndex(s => s.id === objId);

      if (currentIndex <= 0) {
        // Already at top
        return res.json({
          success: true,
          id: objId,
          message: 'Already at top',
        });
      }

      const previous = sorted[currentIndex - 1];

      // Swap orders
      const currentOrder = current.order;
      const previousOrder = previous.order;

      await objectService.updateOrder(database, objId, previousOrder);
      await objectService.updateOrder(database, previous.id, currentOrder);

      logger.debug('_m_up completed', { database, objectId: objId });

      res.json({
        success: true,
        id: objId,
        newOrder: previousOrder,
      });
    } catch (error) {
      logger.error('_m_up failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // _m_ord - Set specific order for object
  // Maps to PHP: case "_m_ord"
  // ============================================================================

  router.post('/:database/_m_ord', async (req, res) => {
    try {
      const { database } = req.params;
      const { id, order } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Object ID is required' });
      }

      if (order === undefined || !Number.isInteger(parseInt(order, 10)) || parseInt(order, 10) < 1) {
        return res.status(400).json({ error: 'Invalid order' });
      }

      const objId = parseInt(id, 10);
      const newOrder = parseInt(order, 10);

      // Get current object
      const current = await objectService.getById(database, objId);
      if (!current) {
        return res.status(404).json({ error: 'Object not found' });
      }

      const oldOrder = current.order;

      if (newOrder === oldOrder) {
        return res.json({
          success: true,
          id: objId,
          order: newOrder,
        });
      }

      // Update order - reorder siblings between old and new positions
      // PHP: UPDATE $z SET ord=(CASE WHEN id=$rid THEN ... ELSE ord+SIGN($ord-$newOrd) END)
      await objectService.updateOrder(database, objId, newOrder);

      logger.debug('_m_ord completed', { database, objectId: objId, newOrder });

      res.json({
        success: true,
        id: objId,
        order: newOrder,
      });
    } catch (error) {
      logger.error('_m_ord failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // _m_id - Set specific ID for object
  // Maps to PHP: case "_m_id"
  // ============================================================================

  router.post('/:database/_m_id', async (req, res) => {
    try {
      const { database } = req.params;
      const { id, new_id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Object ID is required' });
      }

      if (!new_id || !Number.isInteger(parseInt(new_id, 10)) || parseInt(new_id, 10) < 1) {
        return res.status(400).json({ error: 'Invalid new ID' });
      }

      const objId = parseInt(id, 10);
      const newId = parseInt(new_id, 10);

      // Check if current object exists
      const current = await objectService.getById(database, objId);
      if (!current) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Check if new ID is occupied
      const existing = await objectService.exists(database, newId);
      if (existing) {
        return res.status(400).json({ error: 'New ID is occupied' });
      }

      // Check if this is metadata (up=0)
      if (current.parentId === 0) {
        return res.status(400).json({ error: 'Cannot change ID of metadata' });
      }

      // This operation requires direct SQL updates
      // PHP does: UPDATE $z SET id=$newId WHERE id=$id
      //           UPDATE $z SET up=$newId WHERE up=$id
      //           UPDATE $z SET t=$newId WHERE t=$id

      // For now, return error - this operation is not safe without proper transaction support
      logger.warn('_m_id requested but not fully implemented', { database, objId, newId });

      res.status(501).json({
        error: 'ID change operation is not supported in this version',
        message: 'This operation requires database-level changes that are not safe to perform without proper transaction support',
      });
    } catch (error) {
      logger.error('_m_id failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Generic action handler for any /{db}/{action} pattern
  // This catches legacy PHP actions that aren't specific routes
  // ============================================================================

  router.all('/:database/:action', async (req, res, next) => {
    const { database, action } = req.params;

    // Skip if this is a numeric ID (handled by other routes)
    if (/^\d+$/.test(action)) {
      return next();
    }

    // Skip if this is already a known action
    if (['_m_set', '_m_save', '_m_up', '_m_ord', '_m_id'].includes(action)) {
      return next();
    }

    // Handle legacy actions from query/body
    const requestedAction = req.body.action || req.query.action || action;

    switch (requestedAction) {
      case 'object':
        // PHP: View/query objects
        const typeId = req.query.t || req.body.t || req.params[3];
        if (typeId) {
          const objects = await queryService.queryObjects(database, {
            typeId: parseInt(typeId, 10),
            parentId: req.query.up ? parseInt(req.query.up, 10) : undefined,
            limit: req.query.LIMIT ? parseInt(req.query.LIMIT, 10) : 20,
          });
          return res.json(objects);
        }
        break;

      case 'report':
      case 'smartq':
        // PHP: Execute report/smart query
        // TODO: Implement report execution
        return res.status(501).json({ error: 'Report execution not yet implemented' });

      case 'edit':
        // PHP: Get edit form data
        const id = req.query.id || req.body.id;
        if (id) {
          const obj = await objectService.getById(database, parseInt(id, 10), {
            includeRequisites: true,
          });
          if (obj) {
            return res.json(obj);
          }
          return res.status(404).json({ error: 'Object not found' });
        }
        break;

      case 'edit_types':
        // PHP: Type editor
        const types = await typeService.getAllTypes(database);
        return res.json(types);

      case 'delete':
        // PHP: Delete object
        const deleteId = req.body.id || req.query.id;
        if (deleteId) {
          await objectService.delete(database, parseInt(deleteId, 10), {
            cascade: req.query.cascade === '1',
          });
          return res.json({ success: true, deleted: deleteId });
        }
        return res.status(400).json({ error: 'ID is required for delete' });

      default:
        // Unknown action - let it fall through
        break;
    }

    next();
  });

  return router;
}

export default createLegacyRoutes;
