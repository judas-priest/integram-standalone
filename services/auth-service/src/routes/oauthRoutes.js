/**
 * @integram/auth-service - OAuth Routes
 *
 * Defines routes for OAuth authentication endpoints.
 * Maps to PHP auth.php functionality.
 */

import { Router } from 'express';

// ============================================================================
// Create OAuth Routes
// ============================================================================

/**
 * Create OAuth routes.
 *
 * @param {Object} options - Route options
 * @param {Object} options.oauthController - OAuth controller instance
 * @param {Object} [options.authMiddleware] - Auth middleware
 * @returns {Router} Express router
 */
export function createOAuthRoutes(options) {
  const router = Router();
  const { oauthController, authMiddleware } = options;

  // ============================================================================
  // Public Routes
  // ============================================================================

  /**
   * GET /oauth/providers - List available OAuth providers
   */
  router.get('/oauth/providers', oauthController.getProviders);

  /**
   * GET /:db/oauth/:provider - Initiate OAuth flow
   * Redirects to provider's authorization page
   */
  router.get('/:db/oauth/:provider', oauthController.initiateAuth);

  /**
   * GET /:db/oauth/:provider/callback - OAuth callback
   * Handles response from OAuth provider
   */
  router.get('/:db/oauth/:provider/callback', oauthController.handleCallback);

  /**
   * POST /:db/oauth/:provider/callback - OAuth callback (POST)
   * Some providers use POST for callback
   */
  router.post('/:db/oauth/:provider/callback', oauthController.handleCallback);

  // ============================================================================
  // Legacy PHP Route Compatibility
  // ============================================================================

  /**
   * GET /auth.php - Legacy auth.php compatibility
   * Maps: /auth.php?provider=yandex -> /:db/oauth/yandex
   */
  router.get('/auth.php', (req, res, next) => {
    const { provider, code, db } = req.query;

    if (!provider) {
      return res.status(400).json({
        error: 'Provider is required',
        code: 'MISSING_PROVIDER',
      });
    }

    // Determine database from referer or default
    const database = db || 'my';

    if (code) {
      // This is a callback
      req.params = { db: database, provider };
      return oauthController.handleCallback(req, res);
    }

    // Redirect to OAuth flow
    res.redirect(`/${database}/oauth/${provider}`);
  });

  // ============================================================================
  // Protected Routes (authentication required)
  // ============================================================================

  /**
   * POST /:db/oauth/:provider/link - Link OAuth account to current user
   */
  router.post('/:db/oauth/:provider/link',
    authMiddleware?.authenticate || ((req, res, next) => next()),
    oauthController.linkAccount
  );

  /**
   * DELETE /:db/oauth/:provider/link - Unlink OAuth account from current user
   */
  router.delete('/:db/oauth/:provider/link',
    authMiddleware?.authenticate || ((req, res, next) => next()),
    oauthController.unlinkAccount
  );

  /**
   * POST /:db/oauth/:provider/unlink - Unlink OAuth account (POST version)
   * For legacy compatibility
   */
  router.post('/:db/oauth/:provider/unlink',
    authMiddleware?.authenticate || ((req, res, next) => next()),
    oauthController.unlinkAccount
  );

  return router;
}

// ============================================================================
// Export
// ============================================================================

export default createOAuthRoutes;
