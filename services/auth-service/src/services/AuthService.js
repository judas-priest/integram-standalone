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
