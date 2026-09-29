/**
 * API v2 Authentication Routes
 * POST /api/v2/auth - Authenticate user and get session
 */

const express = require('express');
const router = express.Router();
const { createResource } = require('../middleware/jsonapi.cjs');
const { IntegramAuthService } = require('../../../services/IntegramAuthService.cjs');

/**
 * POST /api/v2/auth
 * Authenticate user with Integram
 *
 * Request body:
 * {
 *   "data": {
 *     "type": "auth",
 *     "attributes": {
 *       "login": "admin",
 *       "password": "password",
 *       "database": "my"
 *     }
 *   }
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || data.type !== 'auth') {
      return res.jsonApi.error({
        status: 400,
        code: 'INVALID_REQUEST',
        title: 'Invalid request format',
        detail: 'Request data must have type "auth"'
      }, 400);
    }

    const { login, password, database } = data.attributes || {};

    if (!login || !password) {
      return res.jsonApi.error({
        status: 422,
        code: 'VALIDATION_ERROR',
        title: 'Validation error',
        detail: 'Login and password are required',
        source: { pointer: '/data/attributes' }
      }, 422);
    }

    // Create auth service instance
    // Используем фиксированный URL для старого API Integram
    const baseURL = process.env.INTEGRAM_BASE_URL || 'https://YOUR_SERVER_IP';

    const authService = new IntegramAuthService({
      baseURL: baseURL
    });

    const dbName = database || process.env.INTEGRAM_DATABASE || 'my';

    // Authenticate
    console.log(`🔐 [Auth] Authenticating user: ${login} with database: ${dbName}`);
    const authResult = await authService.authenticate(login, password, dbName);

    if (!authResult || !authResult.success) {
      return res.jsonApi.error({
        status: 401,
        code: 'AUTHENTICATION_FAILED',
        title: 'Authentication failed',
        detail: 'Invalid credentials or database'
      }, 401);
    }

    // Create response with session info
    const authData = {
      userId: authResult.userId,
      username: login,
      database: authResult.database,
      session: authResult.session,
      token: authResult.token,
      expiresAt: authResult.expiresAt
    };

    const responseData = createResource('auth-session', authResult.session, authData, {
      meta: {
        authenticatedAt: new Date().toISOString()
      }
    });

    res.jsonApi.success(responseData, {
      meta: {
        message: 'Authentication successful',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [Auth] Authentication error:', error.message);

    res.jsonApi.error({
      status: 500,
      code: 'AUTHENTICATION_ERROR',
      title: 'Authentication error',
      detail: error.message
    }, 500);
  }
});

/**
 * DELETE /api/v2/auth
 * Logout / invalidate session
 */
router.delete('/', async (req, res) => {
  try {
    // For now, just return success
    // In future, can implement session invalidation

    res.jsonApi.success({
      type: 'auth-logout',
      id: 'logout',
      attributes: {
        message: 'Logged out successfully'
      }
    });

  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'LOGOUT_ERROR',
      title: 'Logout error',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/auth/verify
 * Verify current session
 */
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.jsonApi.error({
        status: 401,
        code: 'NO_AUTHORIZATION',
        title: 'No authorization header',
        detail: 'Authorization header is required'
      }, 401);
    }

    // Extract session/token from header
    const session = authHeader.replace('Bearer ', '');

    res.jsonApi.success({
      type: 'auth-verify',
      id: 'verify',
      attributes: {
        valid: true,
        session: session,
        verifiedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    res.jsonApi.error({
      status: 500,
      code: 'VERIFICATION_ERROR',
      title: 'Verification error',
      detail: error.message
    }, 500);
  }
});

module.exports = router;
