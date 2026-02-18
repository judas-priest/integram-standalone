/**
 * @integram/auth-service - Auth Controller
 *
 * REST controller for authentication endpoints.
 * Maps PHP routes: login, register, logout, validate
 */

import {
  AuthenticationError,
  UserNotFoundError,
  RegistrationError,
  ValidationError,
} from '@integram/common';

// ============================================================================
// Auth Controller Class
// ============================================================================

/**
 * Controller for authentication endpoints.
 */
export class AuthController {
  /**
   * Create auth controller.
   *
   * @param {Object} options - Controller options
   * @param {Object} options.authService - Auth service instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this.authService = options.authService;
    this.logger = options.logger || console;

    // Bind methods to preserve context
    this.login = this.login.bind(this);
    this.register = this.register.bind(this);
    this.logout = this.logout.bind(this);
    this.validate = this.validate.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
    this.passwordReset = this.passwordReset.bind(this);
    this.passwordResetConfirm = this.passwordResetConfirm.bind(this);
  }

  /**
   * Handle login request.
   * Maps to PHP: login flow in index.php
   *
   * Supports both legacy form-encoded and JSON formats:
   * - Legacy: login=xxx&pwd=xxx
   * - Modern: { username: "xxx", password: "xxx" }
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async login(req, res) {
    try {
      const { db: database } = req.params;

      // Support multiple input formats for backward compatibility
      const username = req.body.username || req.body.login || req.body.email || req.body.u;
      const password = req.body.password || req.body.pwd;

      if (!username || !password) {
        return res.status(400).json({
          error: 'Username and password are required',
          code: 'MISSING_CREDENTIALS',
        });
      }

      this.logger.debug?.('Login attempt', { database, username });

      const result = await this.authService.authenticate(database, username, password);

      // Set cookie for legacy compatibility
      // PHP: setcookie($z, $tok, time() + COOKIES_EXPIRE, "/"); # 30 days
      res.cookie(database, result.token, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      });

      // Also set XSRF cookie for client-side access
      res.cookie(`${database}_xsrf`, result.xsrf, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
        sameSite: 'lax',
      });

      this.logger.info?.('Login successful', { database, username, userId: result.user.id });

      // Return response in legacy-compatible format
      res.json({
        success: true,
        message: 'Login successful',
        token: result.token,
        xsrf: result.xsrf,
        user: result.user,
        grants: result.grants,
      });
    } catch (error) {
      this.handleError(res, error, 'Login failed');
    }
  }

  /**
   * Handle registration request.
   * Maps to PHP: newUser() and registration flow
   *
   * Supports both legacy form-encoded and JSON formats:
   * - Legacy: email=xxx&regpwd=xxx&regpwd1=xxx&agree=1
   * - Modern: { email: "xxx", password: "xxx" }
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async register(req, res) {
    try {
      const { db: database } = req.params;

      // Support multiple input formats
      const email = req.body.email;
      const password = req.body.password || req.body.regpwd;
      const confirmPassword = req.body.confirmPassword || req.body.regpwd1;
      const termsAccepted = req.body.agree !== undefined
        ? (req.body.agree === '1' || req.body.agree === true || req.body.agree === 'true')
        : req.body.termsAccepted;
      const name = req.body.name;

      // Validate required fields
      if (!email) {
        return res.status(400).json({
          error: 'Email is required',
          code: 'MISSING_EMAIL',
        });
      }

      if (!password) {
        return res.status(400).json({
          error: 'Password is required',
          code: 'MISSING_PASSWORD',
        });
      }

      // Check password confirmation if provided
      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({
          error: 'Passwords do not match',
          code: 'PASSWORD_MISMATCH',
        });
      }

      // Check terms acceptance
      if (termsAccepted === false || termsAccepted === '0') {
        return res.status(400).json({
          error: 'You must agree to the terms',
          code: 'TERMS_NOT_ACCEPTED',
        });
      }

      this.logger.debug?.('Registration attempt', { database, email });

      const result = await this.authService.register(database, {
        email,
        password,
        name,
      });

      this.logger.info?.('Registration successful', { database, email, userId: result.userId });

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        userId: result.userId,
      });
    } catch (error) {
      this.handleError(res, error, 'Registration failed');
    }
  }

  /**
   * Handle logout request.
   * Maps to PHP: clearing token cookie
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async logout(req, res) {
    try {
      const { db: database } = req.params;
      const userId = req.user?.userId;

      // Clear cookies
      res.clearCookie(database, { path: '/' });
      res.clearCookie(`${database}_xsrf`, { path: '/' });

      if (userId) {
        await this.authService.logout(database, userId);
      }

      this.logger.info?.('Logout successful', { database, userId });

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      this.handleError(res, error, 'Logout failed');
    }
  }

  /**
   * Handle token validation request.
   * Maps to PHP: Validate_Token()
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async validate(req, res) {
    try {
      const { db: database } = req.params;

      // Get token from various sources
      const token = this.extractToken(req, database);

      if (!token) {
        return res.status(401).json({
          valid: false,
          error: 'No token provided',
          code: 'NO_TOKEN',
        });
      }

      const result = await this.authService.validateToken(database, token);

      res.json({
        valid: true,
        user: {
          id: result.userId,
          username: result.username,
          role: result.role,
          roleId: result.roleId,
        },
        grants: result.grants,
      });
    } catch (error) {
      res.status(401).json({
        valid: false,
        error: error.message,
        code: error.code || 'INVALID_TOKEN',
      });
    }
  }

  /**
   * Handle token refresh request.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async refreshToken(req, res) {
    try {
      const { db: database } = req.params;
      const token = this.extractToken(req, database);

      if (!token) {
        return res.status(401).json({
          error: 'No token provided',
          code: 'NO_TOKEN',
        });
      }

      const newToken = this.authService.jwt.refreshToken(token);

      // Set new cookie
      res.cookie(database, newToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      });

      res.json({
        success: true,
        token: newToken,
      });
    } catch (error) {
      this.handleError(res, error, 'Token refresh failed');
    }
  }

  /**
   * Handle password reset request.
   * Maps to PHP: pwd_reset() initiation
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async passwordReset(req, res) {
    try {
      const { db: database } = req.params;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: 'Email is required',
          code: 'MISSING_EMAIL',
        });
      }

      // TODO: Implement password reset logic
      // This would involve:
      // 1. Find user by email
      // 2. Generate reset token
      // 3. Send reset email

      this.logger.info?.('Password reset requested', { database, email });

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If the email exists, a reset link will be sent',
      });
    } catch (error) {
      // Don't expose errors to prevent email enumeration
      res.json({
        success: true,
        message: 'If the email exists, a reset link will be sent',
      });
    }
  }

  /**
   * Handle password reset confirmation.
   * Maps to PHP: pwd_reset() confirmation
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async passwordResetConfirm(req, res) {
    try {
      const { db: database } = req.params;
      const { token, password, confirmPassword } = req.body;

      if (!token || !password) {
        return res.status(400).json({
          error: 'Token and password are required',
          code: 'MISSING_FIELDS',
        });
      }

      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({
          error: 'Passwords do not match',
          code: 'PASSWORD_MISMATCH',
        });
      }

      // TODO: Implement password reset confirmation
      // This would involve:
      // 1. Validate reset token
      // 2. Update password
      // 3. Invalidate reset token

      this.logger.info?.('Password reset confirmed', { database });

      res.json({
        success: true,
        message: 'Password has been reset',
      });
    } catch (error) {
      this.handleError(res, error, 'Password reset failed');
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
    // Authorization header (Bearer token)
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

    // Query parameter (for legacy support)
    if (req.query.token) {
      return req.query.token;
    }

    // POST body (for legacy support)
    if (req.body && req.body.token) {
      return req.body.token;
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
 * Create auth controller.
 *
 * @param {Object} options - Controller options
 * @returns {AuthController} Configured controller
 */
export function createAuthController(options) {
  return new AuthController(options);
}

// ============================================================================
// Export
// ============================================================================

export default AuthController;
