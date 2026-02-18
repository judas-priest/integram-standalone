/**
 * @integram/auth-service - Token Routes
 *
 * Defines routes for token management endpoints.
 */

import { Router } from 'express';

// ============================================================================
// Create Token Routes
// ============================================================================

/**
 * Create token management routes.
 *
 * @param {Object} options - Route options
 * @param {Object} options.tokenController - Token controller instance
 * @param {Object} [options.authMiddleware] - Auth middleware
 * @returns {Router} Express router
 */
export function createTokenRoutes(options) {
  const router = Router();
  const { tokenController, authMiddleware } = options;

  const authenticate = authMiddleware?.authenticate || ((req, res, next) => next());

  // ============================================================================
  // Public Routes
  // ============================================================================

  /**
   * POST /:db/token/verify - Verify a token
   */
  router.post('/:db/token/verify', tokenController.verify);

  /**
   * GET /:db/token/verify - Verify a token (GET version)
   */
  router.get('/:db/token/verify', tokenController.verify);

  /**
   * POST /:db/token/introspect - Token introspection (RFC 7662)
   */
  router.post('/:db/token/introspect', tokenController.introspect);

  // ============================================================================
  // Protected Routes (authentication required)
  // ============================================================================

  /**
   * POST /:db/token - Create a new token
   */
  router.post('/:db/token', authenticate, tokenController.create);

  /**
   * POST /:db/token/refresh - Refresh current token
   */
  router.post('/:db/token/refresh', tokenController.refresh);

  /**
   * POST /:db/token/revoke - Revoke current token
   */
  router.post('/:db/token/revoke', tokenController.revoke);

  /**
   * DELETE /:db/token - Revoke token (DELETE version)
   */
  router.delete('/:db/token', tokenController.revoke);

  // ============================================================================
  // XSRF Routes
  // ============================================================================

  /**
   * GET /:db/xsrf - Generate XSRF token
   */
  router.get('/:db/xsrf', tokenController.generateXsrf);

  /**
   * POST /:db/xsrf - Generate XSRF token (POST version)
   */
  router.post('/:db/xsrf', tokenController.generateXsrf);

  /**
   * POST /:db/xsrf/verify - Verify XSRF token
   */
  router.post('/:db/xsrf/verify', tokenController.verifyXsrf);

  return router;
}

// ============================================================================
// Export
// ============================================================================

export default createTokenRoutes;
