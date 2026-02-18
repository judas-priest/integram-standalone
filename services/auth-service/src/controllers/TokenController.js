/**
 * @integram/auth-service - Token Controller
 *
 * REST controller for token management endpoints.
 * Maps PHP: token-related operations in Validate_Token()
 */

import { TokenError } from '@integram/common';

// ============================================================================
// Token Controller Class
// ============================================================================

/**
 * Controller for token management endpoints.
 */
export class TokenController {
  /**
   * Create token controller.
   *
   * @param {Object} options - Controller options
   * @param {Object} options.jwtService - JWT service instance
   * @param {Object} options.authService - Auth service instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this.jwtService = options.jwtService;
    this.authService = options.authService;
    this.logger = options.logger || console;

    // Bind methods to preserve context
    this.create = this.create.bind(this);
    this.verify = this.verify.bind(this);
    this.refresh = this.refresh.bind(this);
    this.revoke = this.revoke.bind(this);
    this.introspect = this.introspect.bind(this);
    this.generateXsrf = this.generateXsrf.bind(this);
    this.verifyXsrf = this.verifyXsrf.bind(this);
  }

  /**
   * Create a new token.
   * Requires authentication.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async create(req, res) {
    try {
      const { db: database } = req.params;
      const { expiresIn, scopes } = req.body;

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      const payload = {
        userId: req.user.userId,
        username: req.user.username,
        roleId: req.user.roleId,
        role: req.user.role,
        database,
        scopes: scopes || ['*'],
      };

      // Create custom JWT service with different expiry if needed
      let token;
      if (expiresIn) {
        const customJwt = this.jwtService.constructor
          ? new this.jwtService.constructor({
              secret: this.jwtService.secret,
              expiresIn: parseInt(expiresIn, 10),
            })
          : this.jwtService;
        token = customJwt.generateToken(payload);
      } else {
        token = this.jwtService.generateToken(payload);
      }

      const xsrf = this.jwtService.generateXsrf(token, database);

      this.logger.info?.('Token created', {
        database,
        userId: req.user.userId,
        expiresIn,
      });

      res.json({
        success: true,
        token,
        xsrf,
        expiresIn: expiresIn || this.jwtService.expiresIn,
      });
    } catch (error) {
      this.handleError(res, error, 'Token creation failed');
    }
  }

  /**
   * Verify a token.
   * Public endpoint for token validation.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async verify(req, res) {
    try {
      const { db: database } = req.params;
      const token = this.extractToken(req, database);

      if (!token) {
        return res.status(400).json({
          valid: false,
          error: 'Token is required',
          code: 'MISSING_TOKEN',
        });
      }

      // Try JWT verification first
      try {
        const payload = this.jwtService.verifyToken(token);

        // Check database scope
        if (payload.database && payload.database !== database) {
          return res.json({
            valid: false,
            error: 'Token not valid for this database',
            code: 'DATABASE_MISMATCH',
          });
        }

        return res.json({
          valid: true,
          payload: {
            userId: payload.userId,
            username: payload.username,
            role: payload.role,
            roleId: payload.roleId,
            database: payload.database,
            scopes: payload.scopes,
            issuedAt: payload.iat,
            expiresAt: payload.exp,
          },
        });
      } catch {
        // Try legacy token validation
        const user = await this.authService.findUserByToken(database, token);

        if (user) {
          return res.json({
            valid: true,
            legacy: true,
            payload: {
              userId: user.id,
              username: user.val,
              role: user.role,
              roleId: user.roleId,
            },
          });
        }

        return res.json({
          valid: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
      }
    } catch (error) {
      this.handleError(res, error, 'Token verification failed');
    }
  }

  /**
   * Refresh a token.
   * Extends token validity.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async refresh(req, res) {
    try {
      const { db: database } = req.params;
      const token = this.extractToken(req, database);

      if (!token) {
        return res.status(400).json({
          error: 'Token is required',
          code: 'MISSING_TOKEN',
        });
      }

      const newToken = this.jwtService.refreshToken(token);
      const xsrf = this.jwtService.generateXsrf(newToken, database);

      // Set new cookie
      res.cookie(database, newToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      });

      res.cookie(`${database}_xsrf`, xsrf, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
        sameSite: 'lax',
      });

      this.logger.debug?.('Token refreshed', { database });

      res.json({
        success: true,
        token: newToken,
        xsrf,
      });
    } catch (error) {
      if (error instanceof TokenError) {
        return res.status(401).json({
          error: error.message,
          code: error.code || 'TOKEN_ERROR',
        });
      }
      this.handleError(res, error, 'Token refresh failed');
    }
  }

  /**
   * Revoke a token.
   * For JWT, this requires a token blacklist (optional).
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async revoke(req, res) {
    try {
      const { db: database } = req.params;
      const token = this.extractToken(req, database);

      if (!token) {
        return res.status(400).json({
          error: 'Token is required',
          code: 'MISSING_TOKEN',
        });
      }

      // Clear cookies
      res.clearCookie(database, { path: '/' });
      res.clearCookie(`${database}_xsrf`, { path: '/' });

      // TODO: Add token to blacklist if implemented
      // await this.tokenBlacklist.add(token);

      this.logger.info?.('Token revoked', { database });

      res.json({
        success: true,
        message: 'Token revoked',
      });
    } catch (error) {
      this.handleError(res, error, 'Token revocation failed');
    }
  }

  /**
   * Introspect a token (RFC 7662).
   * Returns detailed token information.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async introspect(req, res) {
    try {
      const { db: database } = req.params;
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          active: false,
          error: 'Token is required',
        });
      }

      try {
        const payload = this.jwtService.verifyToken(token);

        res.json({
          active: true,
          sub: String(payload.userId),
          username: payload.username,
          client_id: database,
          scope: payload.scopes?.join(' ') || '*',
          token_type: 'bearer',
          exp: payload.exp,
          iat: payload.iat,
          jti: payload.jti,
          iss: '@integram/auth-service',
        });
      } catch {
        res.json({ active: false });
      }
    } catch (error) {
      this.handleError(res, error, 'Token introspection failed');
    }
  }

  /**
   * Generate XSRF token.
   * Maps to PHP: xsrf()
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async generateXsrf(req, res) {
    try {
      const { db: database } = req.params;
      const token = this.extractToken(req, database);

      if (!token) {
        return res.status(401).json({
          error: 'Authentication token required',
          code: 'MISSING_TOKEN',
        });
      }

      const xsrf = this.jwtService.generateXsrf(token, database);

      // Set XSRF cookie
      res.cookie(`${database}_xsrf`, xsrf, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
        sameSite: 'lax',
      });

      res.json({
        success: true,
        xsrf,
      });
    } catch (error) {
      this.handleError(res, error, 'XSRF generation failed');
    }
  }

  /**
   * Verify XSRF token.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async verifyXsrf(req, res) {
    try {
      const { db: database } = req.params;
      const { xsrf } = req.body;
      const token = this.extractToken(req, database);

      if (!xsrf || !token) {
        return res.status(400).json({
          valid: false,
          error: 'XSRF token and auth token required',
          code: 'MISSING_TOKENS',
        });
      }

      const isValid = this.jwtService.verifyXsrf(xsrf, token, database);

      res.json({
        valid: isValid,
      });
    } catch (error) {
      this.handleError(res, error, 'XSRF verification failed');
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Extract token from request.
   *
   * @param {Object} req - Express request
   * @param {string} database - Database name
   * @returns {string|null} Token or null
   */
  extractToken(req, database) {
    // Authorization header
    const authHeader = req.headers.authorization || req.headers['x-authorization'];
    if (authHeader) {
      if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.substring(7);
      }
      return authHeader;
    }

    // Cookie
    if (req.cookies && req.cookies[database]) {
      return req.cookies[database];
    }

    // Body
    if (req.body && req.body.token) {
      return req.body.token;
    }

    // Query
    if (req.query && req.query.token) {
      return req.query.token;
    }

    return null;
  }

  /**
   * Handle error and send appropriate response.
   *
   * @param {Object} res - Express response
   * @param {Error} error - Error object
   * @param {string} context - Error context
   */
  handleError(res, error, context) {
    this.logger.error?.(context, { error: error.message, code: error.code });

    const statusCode = error.statusCode || 500;
    const response = error.toJSON?.() || {
      error: error.message,
      code: error.code || 'INTERNAL_ERROR',
    };

    res.status(statusCode).json(response);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create token controller.
 *
 * @param {Object} options - Controller options
 * @returns {TokenController} Configured controller
 */
export function createTokenController(options) {
  return new TokenController(options);
}

// ============================================================================
// Export
// ============================================================================

export default TokenController;
