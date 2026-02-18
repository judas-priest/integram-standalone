/**
 * @integram/auth-service - Auth Service
 *
 * Main authentication service that coordinates JWT, password, and permission services.
 * Maps to PHP functions: Validate_Token(), login(), newUser()
 */

import {
  USER,
  TOKEN,
  PASSWORD,
  EMAIL,
  ROLE,
  XSRF,
  ACTIVITY,
  validateEmail,
} from '@integram/common';

import {
  AuthenticationError,
  TokenError,
  UserNotFoundError,
  RegistrationError,
  EmailExistsError,
  RoleError,
} from '@integram/common';

import JWTService from './JWTService.js';
import PasswordService from './PasswordService.js';
import PermissionService from './PermissionService.js';

// ============================================================================
// Auth Service Class
// ============================================================================

/**
 * Main authentication service.
 */
export class AuthService {
  /**
   * Create auth service.
   *
   * @param {Object} options - Service options
   * @param {Object} options.database - Database service
   * @param {Object} [options.jwtService] - JWT service
   * @param {Object} [options.passwordService] - Password service
   * @param {Object} [options.permissionService] - Permission service
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this.db = options.database;
    this.jwt = options.jwtService || new JWTService({ secret: process.env.JWT_SECRET || 'dev-secret' });
    this.password = options.passwordService || new PasswordService();
    this.permissions = options.permissionService || new PermissionService({ database: this.db });
    this.logger = options.logger || console;
  }

  /**
   * Authenticate user with username/password.
   * Maps to PHP: login flow
   *
   * @param {string} database - Database name
   * @param {string} username - Username or email
   * @param {string} password - Password
   * @returns {Promise<Object>} Authentication result
   */
  async authenticate(database, username, password) {
    this.logger.debug?.('Attempting authentication', { database, username });

    // Find user
    const user = await this.findUserByUsername(database, username);
    if (!user) {
      throw new UserNotFoundError(username);
    }

    // Verify password
    const passwordHash = await this.getUserPassword(database, user.id);
    if (!passwordHash) {
      throw new AuthenticationError('No password set for user');
    }

    const isValid = this.password.verifyLegacy(username, password, passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Invalid password');
    }

    // Check user has role
    if (!user.roleId) {
      throw new RoleError(username);
    }

    // Generate tokens
    const token = this.jwt.generateToken({
      userId: user.id,
      username: user.val,
      roleId: user.roleId,
      role: user.role,
      database,
    });

    const xsrf = this.jwt.generateXsrf(token, database);

    // Update activity timestamp
    await this.updateActivity(database, user.id);

    // Load grants
    const grants = await this.permissions.loadGrants(database, user.roleId);

    return {
      success: true,
      token,
      xsrf,
      user: {
        id: user.id,
        username: user.val,
        email: user.email,
        role: user.role,
        roleId: user.roleId,
      },
      grants,
    };
  }

  /**
   * Validate a token (cookie-based or header-based).
   * Maps to PHP: Validate_Token()
   *
   * @param {string} database - Database name
   * @param {string} token - Auth token
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(database, token) {
    if (!token) {
      throw new TokenError('No token provided');
    }

    // Try JWT validation first
    try {
      const payload = this.jwt.verifyToken(token);
      if (payload.database && payload.database !== database) {
        throw new TokenError('Token not valid for this database');
      }

      // Load fresh grants
      const grants = await this.permissions.loadGrants(database, payload.roleId);

      return {
        valid: true,
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
        roleId: payload.roleId,
        grants,
      };
    } catch (jwtError) {
      // Fall back to legacy token validation
      this.logger.debug?.('JWT validation failed, trying legacy', { error: jwtError.message });
    }

    // Legacy token validation (stored in database)
    const user = await this.findUserByToken(database, token);
    if (!user) {
      throw new TokenError('Invalid token');
    }

    // Update activity
    await this.updateActivity(database, user.id);

    // Load grants
    const grants = await this.permissions.loadGrants(database, user.roleId);

    return {
      valid: true,
      userId: user.id,
      username: user.val,
      role: user.role,
      roleId: user.roleId,
      grants,
    };
  }

  /**
   * Register a new user.
   * Maps to PHP: newUser() + registration flow
   *
   * @param {string} database - Database name
   * @param {Object} data - Registration data
   * @param {string} data.email - User email
   * @param {string} data.password - Password
   * @param {string} [data.name] - Display name
   * @returns {Promise<Object>} Registration result
   */
  async register(database, data) {
    const { email, password, name } = data;

    // Validate email
    if (!validateEmail(email)) {
      throw new RegistrationError('Invalid email format');
    }

    // Validate password
    this.password.validateOrThrow(password);

    // Check if email exists
    const existing = await this.findUserByUsername(database, email);
    if (existing) {
      throw new EmailExistsError(email);
    }

    // Create user
    const userId = await this.createUser(database, {
      username: email,
      email,
      password,
      name,
    });

    this.logger.info?.('User registered', { database, userId, email });

    return {
      success: true,
      userId,
      message: 'Registration successful',
    };
  }

  /**
   * Logout user (invalidate token if using legacy tokens).
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<void>}
   */
  async logout(database, userId) {
    // For legacy tokens, we could delete them from database
    // For JWT, client-side deletion is sufficient
    this.logger.info?.('User logged out', { database, userId });
  }

  // ============================================================================
  // JWT Authentication (Legacy PHP Compatibility)
  // Maps to PHP: case "jwt" in index.php
  // ============================================================================

  /**
   * Authenticate user with external JWT token.
   * Maps to PHP: case "jwt" - verifyJWT() and authJWT()
   *
   * @param {string} database - Database name
   * @param {string} jwtToken - External JWT token
   * @returns {Promise<Object>} Authentication result
   */
  async authenticateWithJWT(database, jwtToken) {
    this.logger.debug?.('JWT authentication attempt', { database });

    // Verify the JWT token
    const payload = this.jwt.verifyExternalJWT(jwtToken);
    if (!payload || !payload.data || !payload.data.userId) {
      throw new AuthenticationError('Invalid JWT payload');
    }

    const userId = payload.data.userId;

    // Find user by ID
    const { rows } = await this.db.execSql(
      `SELECT u.id, u.val, r.t as roleId, role.val as role, email.val as email
       FROM ${database} u
       LEFT JOIN ${database} r ON r.up = u.id AND r.t IN (SELECT id FROM ${database} WHERE t = ?)
       LEFT JOIN ${database} role ON role.id = r.t AND role.t = ?
       LEFT JOIN ${database} email ON email.up = u.id AND email.t = ?
       WHERE u.t = ? AND u.id = ?
       LIMIT 1`,
      [ROLE, ROLE, EMAIL, USER, userId],
      'Find user by ID for JWT auth'
    );

    const user = rows[0];
    if (!user) {
      throw new UserNotFoundError(`User ${userId}`);
    }

    // Generate tokens for session
    const token = this.jwt.generateToken({
      userId: user.id,
      username: user.val,
      roleId: user.roleId,
      role: user.role,
      database,
    });

    const xsrf = this.jwt.generateXsrf(token, database);

    // Update activity
    await this.updateActivity(database, user.id);

    // Load grants
    const grants = await this.permissions.loadGrants(database, user.roleId);

    return {
      success: true,
      token,
      xsrf,
      user: {
        id: user.id,
        username: user.val,
        email: user.email,
        role: user.role,
        roleId: user.roleId,
      },
      grants,
    };
  }

  /**
   * Confirm password change.
   * Maps to PHP: case "confirm" in index.php
   *
   * Verifies old password hash and updates to new password, then logs in.
   *
   * @param {string} database - Database name
   * @param {string} email - User email/username
   * @param {string} oldPasswordHash - Old password hash (for verification)
   * @param {string} newPasswordHash - New password hash
   * @returns {Promise<Object|null>} Login result or null if verification fails
   */
  async confirmPassword(database, email, oldPasswordHash, newPasswordHash) {
    this.logger.debug?.('Password confirmation attempt', { database, email });

    // PHP: SELECT pwd.id FROM $z pwd, $z u WHERE pwd.up=u.id AND pwd.t={PASSWORD}
    //      AND u.t={USER} AND u.val='...' AND pwd.val='...'
    const { rows } = await this.db.execSql(
      `SELECT pwd.id as pwdId, u.id as userId
       FROM ${database} pwd
       JOIN ${database} u ON pwd.up = u.id AND u.t = ?
       WHERE pwd.t = ? AND u.val = ? AND pwd.val = ?
       LIMIT 1`,
      [USER, PASSWORD, email, oldPasswordHash],
      'Verify old password for confirm'
    );

    if (!rows[0]) {
      // Old password doesn't match - return null (PHP redirects to login with obsolete)
      return null;
    }

    const { pwdId, userId } = rows[0];

    // Update password to new hash
    await this.db.updateVal(database, pwdId, newPasswordHash, 'Update password for confirm');

    // Log the user in (PHP: login($z, $_REQUEST["u"], "confirm"))
    // Find user to generate tokens
    const { rows: userRows } = await this.db.execSql(
      `SELECT u.id, u.val, r.t as roleId, role.val as role
       FROM ${database} u
       LEFT JOIN ${database} r ON r.up = u.id AND r.t IN (SELECT id FROM ${database} WHERE t = ?)
       LEFT JOIN ${database} role ON role.id = r.t AND role.t = ?
       WHERE u.id = ?
       LIMIT 1`,
      [ROLE, ROLE, userId],
      'Find user for confirm login'
    );

    const user = userRows[0];
    if (!user) {
      return null;
    }

    // Generate tokens
    const token = this.jwt.generateToken({
      userId: user.id,
      username: user.val,
      roleId: user.roleId,
      role: user.role,
      database,
    });

    const xsrf = this.jwt.generateXsrf(token, database);

    // Update activity
    await this.updateActivity(database, user.id);

    return {
      success: true,
      token,
      xsrf,
      userId: user.id,
      username: user.val,
    };
  }

  // ============================================================================
  // One-Time Password Methods (Legacy PHP Compatibility)
  // ============================================================================

  /**
   * Get one-time code for user.
   * Maps to PHP: case "getcode"
   *
   * Returns the first 4 characters of the user's token as a code.
   *
   * @param {string} database - Database name
   * @param {string} email - User email
   * @returns {Promise<Object|null>} Code info or null if user not found
   */
  async getOneTimeCode(database, email) {
    // Find user by email (as username or email field)
    const user = await this.findUserByUsername(database, email);
    if (!user) {
      // Also check email field
      const { rows } = await this.db.execSql(
        `SELECT u.id, u.val, tok.val as token
         FROM ${database} email
         JOIN ${database} u ON email.up = u.id AND u.t = ?
         LEFT JOIN ${database} tok ON tok.up = u.id AND tok.t = ?
         WHERE email.t = ? AND email.val = ?
         LIMIT 1`,
        [USER, TOKEN, EMAIL, email],
        'Find user by email'
      );

      if (!rows[0]) {
        return null;
      }

      // Return code (first 4 chars of token)
      const code = rows[0].token ? rows[0].token.substring(0, 4).toUpperCase() : null;
      return { userId: rows[0].id, code };
    }

    // Get user's token
    const { rows } = await this.db.execSql(
      `SELECT val FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
      [user.id, TOKEN],
      'Get user token for code'
    );

    if (!rows[0]) {
      return null;
    }

    // Return code (first 4 chars of token)
    const code = rows[0].val.substring(0, 4).toUpperCase();
    return { userId: user.id, code };
  }

  /**
   * Verify one-time code.
   * Maps to PHP: case "checkcode"
   *
   * Checks if the provided code matches the first 4 characters of the user's token.
   * If valid, generates new token and XSRF.
   *
   * @param {string} database - Database name
   * @param {string} email - User email
   * @param {string} code - 4-character code
   * @returns {Promise<Object|null>} New token/xsrf or null if invalid
   */
  async verifyOneTimeCode(database, email, code) {
    // PHP: tok.val LIKE '$c%' - token starts with code
    const { rows } = await this.db.execSql(
      `SELECT u.id, u.val, tok.id as tokId, xsrf.id as xsrfId, act.id as actId
       FROM ${database} tok
       JOIN ${database} u ON tok.up = u.id AND u.t = ?
       LEFT JOIN ${database} act ON act.up = u.id AND act.t = ?
       LEFT JOIN ${database} xsrf ON xsrf.up = u.id AND xsrf.t = ?
       WHERE tok.t = ? AND LOWER(tok.val) LIKE ?
       AND u.val = ?
       LIMIT 1`,
      [USER, ACTIVITY, XSRF, TOKEN, `${code}%`, email],
      'Verify one-time code'
    );

    if (!rows[0]) {
      // Also try finding by email field
      const { rows: emailRows } = await this.db.execSql(
        `SELECT u.id, u.val, tok.id as tokId, xsrf.id as xsrfId, act.id as actId
         FROM ${database} email
         JOIN ${database} u ON email.up = u.id AND u.t = ?
         JOIN ${database} tok ON tok.up = u.id AND tok.t = ?
         LEFT JOIN ${database} act ON act.up = u.id AND act.t = ?
         LEFT JOIN ${database} xsrf ON xsrf.up = u.id AND xsrf.t = ?
         WHERE email.t = ? AND email.val = ?
         AND LOWER(tok.val) LIKE ?
         LIMIT 1`,
        [USER, TOKEN, ACTIVITY, XSRF, EMAIL, email, `${code}%`],
        'Verify one-time code by email'
      );

      if (!emailRows[0]) {
        return null;
      }

      rows[0] = emailRows[0];
    }

    const user = rows[0];

    // Generate new token (PHP: md5(microtime(TRUE)))
    const newToken = this.jwt.generateLegacyToken();
    const newXsrf = this.jwt.generateXsrf(newToken, email);

    // Update token
    await this.db.updateVal(database, user.tokId, newToken, 'Update token for code auth');

    // Update or create XSRF
    if (user.xsrfId) {
      await this.db.updateVal(database, user.xsrfId, newXsrf, 'Update XSRF for code auth');
    } else {
      await this.db.insert(database, user.id, 1, XSRF, newXsrf, 'Insert XSRF for code auth');
    }

    // Update or create activity
    const timestamp = Date.now() / 1000;
    if (user.actId) {
      await this.db.updateVal(database, user.actId, String(timestamp), 'Update activity for code auth');
    } else {
      await this.db.insert(database, user.id, 1, ACTIVITY, String(timestamp), 'Insert activity for code auth');
    }

    return {
      token: newToken,
      xsrf: newXsrf,
      userId: user.id,
      username: user.val,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Find user by username.
   *
   * @param {string} database - Database name
   * @param {string} username - Username to find
   * @returns {Promise<Object|null>} User object or null
   */
  async findUserByUsername(database, username) {
    const { rows } = await this.db.execSql(
      `SELECT u.id, u.val, r.t as roleId, role.val as role, email.val as email
       FROM ${database} u
       LEFT JOIN ${database} r ON r.up = u.id AND r.t IN (SELECT id FROM ${database} WHERE t = ?)
       LEFT JOIN ${database} role ON role.id = r.t AND role.t = ?
       LEFT JOIN ${database} email ON email.up = u.id AND email.t = ?
       WHERE u.t = ? AND u.val = ?
       LIMIT 1`,
      [ROLE, ROLE, EMAIL, USER, username],
      'Find user by username'
    );

    return rows[0] || null;
  }

  /**
   * Find user by token.
   *
   * @param {string} database - Database name
   * @param {string} token - Token value
   * @returns {Promise<Object|null>} User object or null
   */
  async findUserByToken(database, token) {
    const { rows } = await this.db.execSql(
      `SELECT u.id, u.val, r.t as roleId, role.val as role, email.val as email
       FROM ${database} tok
       JOIN ${database} u ON tok.up = u.id AND u.t = ?
       LEFT JOIN ${database} r ON r.up = u.id AND r.t IN (SELECT id FROM ${database} WHERE t = ?)
       LEFT JOIN ${database} role ON role.id = r.t AND role.t = ?
       LEFT JOIN ${database} email ON email.up = u.id AND email.t = ?
       WHERE tok.t = ? AND tok.val = ?
       LIMIT 1`,
      [USER, ROLE, ROLE, EMAIL, TOKEN, token],
      'Find user by token'
    );

    return rows[0] || null;
  }

  /**
   * Get user's password hash.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<string|null>} Password hash or null
   */
  async getUserPassword(database, userId) {
    const { rows } = await this.db.execSql(
      `SELECT val FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
      [userId, PASSWORD],
      'Get user password'
    );

    return rows[0]?.val || null;
  }

  /**
   * Create a new user.
   *
   * @param {string} database - Database name
   * @param {Object} data - User data
   * @returns {Promise<number>} New user ID
   */
  async createUser(database, data) {
    const { username, email, password, name, roleId = 115 } = data;

    // Insert user
    const userId = await this.db.insert(database, 1, 0, USER, username, 'Insert new user');

    // Insert email
    await this.db.insert(database, userId, 1, EMAIL, email, 'Insert email');

    // Insert password hash
    const passwordHash = this.password.hashLegacy(username, password);
    await this.db.insert(database, userId, 1, PASSWORD, passwordHash, 'Insert password');

    // Insert role reference
    await this.db.insert(database, userId, 1, roleId, '', 'Insert role');

    // Insert name if provided
    if (name) {
      await this.db.insert(database, userId, 1, 33, name, 'Insert name');
    }

    // Generate and store token
    const token = this.jwt.generateLegacyToken();
    await this.db.insert(database, userId, 1, TOKEN, token, 'Insert token');

    // Generate and store XSRF
    const xsrf = this.jwt.generateXsrf(token, database);
    await this.db.insert(database, userId, 1, XSRF, xsrf, 'Insert XSRF');

    return userId;
  }

  /**
   * Update user activity timestamp.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<void>}
   */
  async updateActivity(database, userId) {
    const timestamp = Date.now() / 1000; // Unix timestamp

    // Check if activity record exists
    const { rows } = await this.db.execSql(
      `SELECT id FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
      [userId, ACTIVITY],
      'Check activity record'
    );

    if (rows[0]) {
      await this.db.updateVal(database, rows[0].id, String(timestamp), 'Update activity');
    } else {
      await this.db.insert(database, userId, 1, ACTIVITY, String(timestamp), 'Insert activity');
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create auth service.
 *
 * @param {Object} options - Service options
 * @returns {AuthService} Configured auth service
 */
export function createAuthService(options) {
  return new AuthService(options);
}

// ============================================================================
// Export
// ============================================================================

export default AuthService;
