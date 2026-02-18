/**
 * @integram/auth-service - Legacy Middleware
 *
 * Express middleware for PHP backward compatibility.
 */

import { LegacyFormatTransformer } from './LegacyFormatTransformer.js';

// ============================================================================
// Legacy Request Transformer Middleware
// ============================================================================

/**
 * Create middleware that transforms legacy request formats.
 *
 * @param {Object} [options] - Options
 * @returns {Function} Express middleware
 */
export function createLegacyRequestTransformer(options = {}) {
  const transformer = new LegacyFormatTransformer(options);

  return (req, res, next) => {
    // Store original body
    req.originalBody = { ...req.body };

    // Detect if this is a legacy request
    const isLegacy = Boolean(
      req.body.login ||
      req.body.u ||
      req.body.pwd ||
      req.body.regpwd ||
      req.body.secret
    );

    req.isLegacyRequest = isLegacy;
    req.responseFormat = transformer.detectResponseFormat(req);

    next();
  };
}

// ============================================================================
// Legacy Response Handler Middleware
// ============================================================================

/**
 * Create middleware that handles legacy response formats.
 *
 * @param {Object} [options] - Options
 * @returns {Function} Express middleware
 */
export function createLegacyResponseHandler(options = {}) {
  const transformer = new LegacyFormatTransformer(options);

  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to transform responses for legacy clients
    res.json = function(data) {
      // Only transform for legacy requests
      if (!req.isLegacyRequest) {
        return originalJson(data);
      }

      // Transform error responses
      if (data.error) {
        const legacyError = transformer.transformErrorResponse(data);
        return originalJson(legacyError);
      }

      // Transform success responses based on endpoint
      let transformedData = data;

      if (req.path.includes('/login') && data.success) {
        transformedData = transformer.transformLoginResponse(data, req.responseFormat);

        if (req.responseFormat === 'redirect' && data.success) {
          return res.redirect('/');
        }
      }

      if (req.path.includes('/validate') && data.valid) {
        transformedData = transformer.transformValidationResponse(data);
      }

      return originalJson(transformedData);
    };

    next();
  };
}

// ============================================================================
// PHP Route Compatibility Middleware
// ============================================================================

/**
 * Create middleware for PHP route mapping.
 * Maps legacy PHP URLs to new service endpoints.
 *
 * @param {Object} options - Options
 * @param {Object} options.authController - Auth controller
 * @param {Object} options.oauthController - OAuth controller
 * @returns {Function} Express middleware
 */
export function createPHPRouteMapper(options) {
  const { authController, oauthController } = options;

  return (req, res, next) => {
    // Map auth.php to OAuth controller
    if (req.path === '/auth.php' || req.path.endsWith('/auth.php')) {
      const { provider, code, db } = req.query;

      if (!provider) {
        return res.status(400).json({ error: 'Provider is required' });
      }

      req.params = {
        db: db || 'my',
        provider,
      };

      if (code) {
        return oauthController.handleCallback(req, res);
      }
      return oauthController.initiateAuth(req, res);
    }

    // Map legacy login form submission
    // PHP: POST /{db}/ with action=login or login field
    if (req.method === 'POST' && req.body.login !== undefined && req.body.pwd !== undefined) {
      // Extract database from URL
      const match = req.path.match(/^\/([^/]+)\/?$/);
      if (match) {
        req.params = { db: match[1] };
        return authController.login(req, res);
      }
    }

    // Map legacy registration form submission
    if (req.method === 'POST' && req.body.regpwd !== undefined) {
      const match = req.path.match(/^\/([^/]+)\/?$/);
      if (match) {
        req.params = { db: match[1] };
        return authController.register(req, res);
      }
    }

    next();
  };
}

// ============================================================================
// XSRF Verification Middleware (Legacy Compatible)
// ============================================================================

/**
 * Create XSRF verification middleware.
 * Maps to PHP XSRF checking behavior.
 *
 * @param {Object} options - Options
 * @param {Object} options.jwtService - JWT service for XSRF verification
 * @param {string[]} [options.excludePaths] - Paths to exclude from XSRF check
 * @returns {Function} Express middleware
 */
export function createLegacyXsrfMiddleware(options) {
  const { jwtService, excludePaths = [] } = options;

  const defaultExcludes = [
    '/login',
    '/register',
    '/oauth',
    '/health',
    '/validate',
  ];

  const allExcludes = [...defaultExcludes, ...excludePaths];

  return (req, res, next) => {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip for excluded paths
    if (allExcludes.some(path => req.path.includes(path))) {
      return next();
    }

    // Get XSRF token
    const xsrf = req.headers['x-xsrf-token'] ||
                 req.headers['x-csrf-token'] ||
                 req.body.xsrf ||
                 req.body._xsrf;

    // Get auth token
    const database = req.params.db || req.path.split('/')[1];
    const token = req.cookies?.[database] ||
                  req.headers.authorization?.replace('Bearer ', '');

    if (!xsrf || !token) {
      // In PHP, missing XSRF might be okay for some operations
      // Log warning but don't block
      if (options.strict) {
        return res.status(403).json({
          error: 'XSRF verification failed',
          code: 'XSRF_REQUIRED',
        });
      }
      return next();
    }

    // Verify XSRF
    const isValid = jwtService.verifyXsrf(xsrf, token, database);

    if (!isValid && options.strict) {
      return res.status(403).json({
        error: 'XSRF verification failed',
        code: 'XSRF_INVALID',
      });
    }

    next();
  };
}

// ============================================================================
// Combined Legacy Compatibility Middleware
// ============================================================================

/**
 * Create combined legacy compatibility middleware.
 *
 * @param {Object} options - Options
 * @returns {Function[]} Array of middleware functions
 */
export function createLegacyCompatibilityMiddleware(options = {}) {
  return [
    createLegacyRequestTransformer(options),
    createLegacyResponseHandler(options),
  ];
}

// ============================================================================
// Export
// ============================================================================

export default {
  createLegacyRequestTransformer,
  createLegacyResponseHandler,
  createPHPRouteMapper,
  createLegacyXsrfMiddleware,
  createLegacyCompatibilityMiddleware,
};
