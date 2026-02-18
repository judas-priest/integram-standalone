/**
 * @integram/auth-service - Auth Routes
 *
 * Defines routes for authentication endpoints.
 * Maintains backward compatibility with PHP endpoints.
 */

import { Router } from 'express';

// ============================================================================
// Create Auth Routes
// ============================================================================

/**
 * Create authentication routes.
 *
 * @param {Object} options - Route options
 * @param {Object} options.authController - Auth controller instance
 * @param {Object} [options.authMiddleware] - Auth middleware
 * @param {Object} [options.rateLimiter] - Rate limiter middleware
 * @returns {Router} Express router
 */
export function createAuthRoutes(options) {
  const router = Router();
  const { authController, authMiddleware, rateLimiter } = options;

  // Apply rate limiting if provided
  const loginRateLimit = rateLimiter?.login || ((req, res, next) => next());
  const registerRateLimit = rateLimiter?.register || ((req, res, next) => next());

  // ============================================================================
  // Public Routes (no authentication required)
  // ============================================================================

  /**
   * POST /:db/login - User login
   * Legacy compatible: login=xxx&pwd=xxx
   * Modern: { username: "xxx", password: "xxx" }
   */
  router.post('/:db/login', loginRateLimit, authController.login);

  /**
   * POST /:db/auth - User login (Legacy PHP action)
   * Maps to PHP: case "auth" in index.php
   * Legacy compatible: login=xxx&pwd=xxx
   */
  router.post('/:db/auth', loginRateLimit, authController.login);

  /**
   * POST /:db/register - User registration
   * Legacy compatible: email=xxx&regpwd=xxx&regpwd1=xxx&agree=1
   * Modern: { email: "xxx", password: "xxx" }
   */
  router.post('/:db/register', registerRateLimit, authController.register);

  /**
   * GET /:db/validate - Validate token
   * Returns user info if token is valid
   */
  router.get('/:db/validate', authController.validate);

  /**
   * POST /:db/validate - Validate token (POST version)
   * For legacy compatibility
   */
  router.post('/:db/validate', authController.validate);

  /**
   * POST /:db/password-reset - Request password reset
   */
  router.post('/:db/password-reset', rateLimiter?.passwordReset || ((req, res, next) => next()), authController.passwordReset);

  /**
   * POST /:db/password-reset/confirm - Confirm password reset
   */
  router.post('/:db/password-reset/confirm', authController.passwordResetConfirm);

  // ============================================================================
  // One-Time Password Routes (Legacy PHP Compatibility)
  // Maps to PHP: getcode and checkcode actions
  // ============================================================================

  /**
   * GET /:db/getcode - Request one-time password
   * Legacy compatible: u=email
   * Returns: {"msg":"ok"} if user exists, {"msg":"new"} if new user
   */
  router.get('/:db/getcode', authController.getCode);

  /**
   * POST /:db/getcode - Request one-time password (POST version)
   */
  router.post('/:db/getcode', authController.getCode);

  /**
   * GET /:db/checkcode - Verify one-time password
   * Legacy compatible: u=email&c=code
   * Returns: {"token":"...", "_xsrf":"..."} on success
   */
  router.get('/:db/checkcode', authController.checkCode);

  /**
   * POST /:db/checkcode - Verify one-time password (POST version)
   */
  router.post('/:db/checkcode', authController.checkCode);

  // ============================================================================
  // JWT Authentication (Legacy PHP Compatibility)
  // Maps to PHP: case "jwt" in index.php
  // ============================================================================

  /**
   * POST /:db/jwt - JWT-based authentication
   * Maps to PHP: case "jwt" in index.php (lines 7608-7616)
   * Legacy compatible: jwt=<jwt_token>
   * Verifies JWT and authenticates the user
   */
  router.post('/:db/jwt', authController.jwtAuth);

  /**
   * POST /:db/confirm - Password confirmation
   * Maps to PHP: case "confirm" in index.php (lines 7704-7713)
   * Legacy compatible: u=email&o=old_password_hash&p=new_password_hash
   * Confirms password change and logs in the user
   */
  router.post('/:db/confirm', authController.confirmPassword);

  /**
   * GET /:db/confirm - Password confirmation (GET version for legacy compatibility)
   */
  router.get('/:db/confirm', authController.confirmPassword);

  // ============================================================================
  // Protected Routes (authentication required)
  // ============================================================================

  /**
   * POST /:db/logout - User logout
   */
  router.post('/:db/logout', authController.logout);

  /**
   * POST /:db/refresh - Refresh token
   */
  router.post('/:db/refresh', authController.refreshToken);

  // ============================================================================
  // Legacy PHP Route Compatibility
  // ============================================================================

  /**
   * POST /:db/ with action parameter - Legacy action handling
   * Maps various PHP form submissions
   */
  router.post('/:db/', (req, res, next) => {
    const { action } = req.body;

    switch (action) {
      case 'login':
        return authController.login(req, res);
      case 'register':
        return authController.register(req, res);
      case 'logout':
        return authController.logout(req, res);
      case 'validate':
        return authController.validate(req, res);
      default:
        next();
    }
  });

  return router;
}

// ============================================================================
// Export
// ============================================================================

export default createAuthRoutes;
