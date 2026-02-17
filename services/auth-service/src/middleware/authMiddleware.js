/**
 * @integram/auth-service - Auth Middleware
 *
 * Express middleware for authentication and authorization.
 * Provides backward-compatible auth handling for legacy requests.
 */

import { AuthenticationError, TokenError, XsrfError } from '@integram/common';

// ============================================================================
// Auth Middleware Factory
// ============================================================================

/**
 * Create authentication middleware.
 *
 * @param {Object} options - Middleware options
 * @param {Object} options.authService - Auth service instance
 * @param {Object} [options.logger] - Logger instance
 * @param {boolean} [options.optional=false] - If true, don't fail on missing token
 * @returns {Function} Express middleware
 */
export function createAuthMiddleware(options) {
  const { authService, logger = console, optional = false } = options;

  return async (req, res, next) => {
    try {
      // Extract database from URL
      const database = extractDatabase(req);
      if (!database) {
        if (optional) {
          return next();
        }
        throw new AuthenticationError('No database specified');
      }

      // Extract token from various sources
      const token = extractToken(req, database);

      if (!token) {
        if (optional) {
          return next();
        }
        throw new TokenError('No authorization token provided');
      }

      // Validate token
      const validation = await authService.validateToken(database, token);

      // Attach user info to request
      req.user = {
        id: validation.userId,
        username: validation.username,
        role: validation.role,
        roleId: validation.roleId,
      };
      req.userGrants = validation.grants;
      req.database = database;

      logger.debug?.('User authenticated', {
        database,
        userId: validation.userId,
        username: validation.username,
      });

      next();
    } catch (error) {
      logger.warn?.('Authentication failed', { error: error.message });

      if (error instanceof TokenError || error instanceof AuthenticationError) {
        return res.status(401).json({
          error: error.message,
          code: error.code,
        });
      }

      next(error);
    }
  };
}

/**
 * Create XSRF verification middleware.
 *
 * @param {Object} options - Middleware options
 * @param {Object} options.jwtService - JWT service for XSRF verification
 * @param {Object} [options.logger] - Logger instance
 * @returns {Function} Express middleware
 */
export function createXsrfMiddleware(options) {
  const { jwtService, logger = console } = options;

  return (req, res, next) => {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    try {
      const database = req.database || extractDatabase(req);
      const token = extractToken(req, database);

      // Get XSRF from header or body
      const xsrf = req.headers['x-xsrf-token'] ||
                   req.headers['x-csrf-token'] ||
                   req.body?.xsrf ||
                   req.body?._xsrf;

      if (!xsrf) {
        throw new XsrfError('XSRF token required');
      }

      // Verify XSRF
      if (!jwtService.verifyXsrf(xsrf, token, database)) {
        throw new XsrfError('Invalid XSRF token');
      }

      next();
    } catch (error) {
      logger.warn?.('XSRF verification failed', { error: error.message });

      if (error instanceof XsrfError) {
        return res.status(403).json({
          error: error.message,
          code: error.code,
        });
      }

      next(error);
    }
  };
}

/**
 * Create permission check middleware.
 *
 * @param {Object} options - Middleware options
 * @param {Object} options.permissionService - Permission service
 * @param {number} [options.typeId] - Required type ID
 * @param {string} [options.grant='READ'] - Required grant level
 * @returns {Function} Express middleware
 */
export function createPermissionMiddleware(options) {
  const { permissionService, typeId, grant = 'READ' } = options;

  return (req, res, next) => {
    try {
      const context = {
        database: req.database,
        username: req.user?.username,
        userGrants: req.userGrants,
      };

      // Determine what to check
      const objectId = req.params.id || req.params.objectId || 0;
      const checkTypeId = typeId || req.params.typeId || 0;

      // Check grant
      permissionService.checkGrant(context, parseInt(objectId, 10), parseInt(checkTypeId, 10), grant, true);

      next();
    } catch (error) {
      return res.status(403).json({
        error: error.message,
        code: error.code,
      });
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract database name from request.
 *
 * @param {Object} req - Express request
 * @returns {string|null} Database name
 */
function extractDatabase(req) {
  // From URL path: /{database}/...
  const pathParts = req.path.split('/').filter(Boolean);
  if (pathParts.length > 0 && /^[a-z]\w{1,14}$/i.test(pathParts[0])) {
    return pathParts[0].toLowerCase();
  }

  // From query parameter
  if (req.query.db) {
    return req.query.db.toLowerCase();
  }

  // From header
  if (req.headers['x-database']) {
    return req.headers['x-database'].toLowerCase();
  }

  return null;
}

/**
 * Extract auth token from request.
 *
 * @param {Object} req - Express request
 * @param {string} database - Database name
 * @returns {string|null} Token
 */
function extractToken(req, database) {
  // From Authorization header
  const authHeader = req.headers.authorization || req.headers['x-authorization'];
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.substring(7).trim();
    }
    if (authHeader.toLowerCase().startsWith('basic ')) {
      // Basic auth is handled by auth service
      return authHeader;
    }
    return authHeader.trim();
  }

  // From POST body
  if (req.body?.token) {
    return req.body.token;
  }

  // From secret (one-time)
  if (req.body?.secret || req.query?.secret) {
    return req.body?.secret || req.query?.secret;
  }

  // From cookie
  if (req.cookies?.[database]) {
    return req.cookies[database];
  }

  return null;
}

// ============================================================================
// Export
// ============================================================================

export {
  extractDatabase,
  extractToken,
};

export default {
  createAuthMiddleware,
  createXsrfMiddleware,
  createPermissionMiddleware,
  extractDatabase,
  extractToken,
};
