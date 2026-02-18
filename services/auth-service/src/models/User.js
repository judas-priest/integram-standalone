/**
 * @integram/auth-service - User Model
 *
 * Data model for user entities.
 * Maps to PHP user structure in Integram database.
 */

import {
  USER,
  EMAIL,
  PASSWORD,
  TOKEN,
  XSRF,
  ROLE,
  ACTIVITY,
} from '@integram/common';

// ============================================================================
// User Model Class
// ============================================================================

/**
 * User model representing an Integram user.
 */
export class User {
  /**
   * Create user instance.
   *
   * @param {Object} data - User data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.username = data.username || data.val || null;
    this.email = data.email || null;
    this.passwordHash = data.passwordHash || data.password || null;
    this.token = data.token || null;
    this.xsrf = data.xsrf || null;
    this.roleId = data.roleId || data.r || null;
    this.roleName = data.roleName || data.role || null;
    this.activity = data.activity || null;
    this.createdAt = data.createdAt || null;
    this.updatedAt = data.updatedAt || null;

    // OAuth links
    this.oauthProviders = data.oauthProviders || {};
  }

  /**
   * Check if user has a specific role.
   *
   * @param {string|number} role - Role name or ID
   * @returns {boolean} True if user has role
   */
  hasRole(role) {
    if (typeof role === 'number') {
      return this.roleId === role;
    }
    return this.roleName?.toLowerCase() === role?.toLowerCase();
  }

  /**
   * Check if user is admin.
   *
   * @returns {boolean} True if admin
   */
  isAdmin() {
    return this.hasRole('admin') || this.roleId === 145;
  }

  /**
   * Check if user is guest.
   *
   * @returns {boolean} True if guest
   */
  isGuest() {
    return this.username === 'guest';
  }

  /**
   * Check if user has password set.
   *
   * @returns {boolean} True if has password
   */
  hasPassword() {
    return Boolean(this.passwordHash);
  }

  /**
   * Check if user has OAuth provider linked.
   *
   * @param {string} provider - Provider name
   * @returns {boolean} True if linked
   */
  hasOAuthProvider(provider) {
    return Boolean(this.oauthProviders[provider]);
  }

  /**
   * Get user's display name.
   *
   * @returns {string} Display name
   */
  getDisplayName() {
    return this.username || this.email || `User ${this.id}`;
  }

  /**
   * Convert to safe JSON (no sensitive data).
   *
   * @returns {Object} Safe user object
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      roleId: this.roleId,
      roleName: this.roleName,
      activity: this.activity,
      oauthProviders: Object.keys(this.oauthProviders),
    };
  }

  /**
   * Convert to legacy format (for PHP compatibility).
   *
   * @returns {Object} Legacy format object
   */
  toLegacyFormat() {
    return {
      id: this.id,
      val: this.username,
      role: this.roleName,
      r: this.roleId,
      xsrf: this.xsrf,
    };
  }

  // ============================================================================
  // Static Methods
  // ============================================================================

  /**
   * Create user from database row.
   *
   * @param {Object} row - Database row
   * @returns {User} User instance
   */
  static fromDatabaseRow(row) {
    return new User({
      id: row.id,
      username: row.val,
      email: row.email,
      roleId: row.r || row.roleId,
      roleName: row.role,
      token: row.tok || row.token,
      xsrf: row.xsrf,
      activity: row.activity,
    });
  }

  /**
   * Get type IDs for user-related data.
   *
   * @returns {Object} Type IDs
   */
  static getTypeIds() {
    return {
      USER,
      EMAIL,
      PASSWORD,
      TOKEN,
      XSRF,
      ROLE,
      ACTIVITY,
    };
  }
}

// ============================================================================
// User Repository
// ============================================================================

/**
 * Repository for user database operations.
 */
export class UserRepository {
  /**
   * Create user repository.
   *
   * @param {Object} options - Repository options
   * @param {Object} options.database - Database service
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this.db = options.database;
    this.logger = options.logger || console;
  }

  /**
   * Find user by ID.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<User|null>} User or null
   */
  async findById(database, userId) {
    const { rows } = await this.db.execSql(
      `SELECT u.id, u.val, r.t as roleId, role.val as role, email.val as email
       FROM ${database} u
       LEFT JOIN ${database} r ON r.up = u.id AND r.t IN (SELECT id FROM ${database} WHERE t = ?)
       LEFT JOIN ${database} role ON role.id = r.t AND role.t = ?
       LEFT JOIN ${database} email ON email.up = u.id AND email.t = ?
       WHERE u.id = ? AND u.t = ?
       LIMIT 1`,
      [ROLE, ROLE, EMAIL, userId, USER],
      'Find user by ID'
    );

    return rows[0] ? User.fromDatabaseRow(rows[0]) : null;
  }

  /**
   * Find user by username.
   *
   * @param {string} database - Database name
   * @param {string} username - Username
   * @returns {Promise<User|null>} User or null
   */
  async findByUsername(database, username) {
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

    return rows[0] ? User.fromDatabaseRow(rows[0]) : null;
  }

  /**
   * Find user by email.
   *
   * @param {string} database - Database name
   * @param {string} email - Email address
   * @returns {Promise<User|null>} User or null
   */
  async findByEmail(database, email) {
    const { rows } = await this.db.execSql(
      `SELECT u.id, u.val, r.t as roleId, role.val as role, email.val as email
       FROM ${database} u
       JOIN ${database} email ON email.up = u.id AND email.t = ? AND email.val = ?
       LEFT JOIN ${database} r ON r.up = u.id AND r.t IN (SELECT id FROM ${database} WHERE t = ?)
       LEFT JOIN ${database} role ON role.id = r.t AND role.t = ?
       WHERE u.t = ?
       LIMIT 1`,
      [EMAIL, email, ROLE, ROLE, USER],
      'Find user by email'
    );

    return rows[0] ? User.fromDatabaseRow(rows[0]) : null;
  }

  /**
   * Find user by token.
   *
   * @param {string} database - Database name
   * @param {string} token - Auth token
   * @returns {Promise<User|null>} User or null
   */
  async findByToken(database, token) {
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

    return rows[0] ? User.fromDatabaseRow(rows[0]) : null;
  }

  /**
   * Get user's password hash.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<string|null>} Password hash or null
   */
  async getPasswordHash(database, userId) {
    const { rows } = await this.db.execSql(
      `SELECT val FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
      [userId, PASSWORD],
      'Get user password'
    );

    return rows[0]?.val || null;
  }

  /**
   * Update user's password.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @param {string} passwordHash - New password hash
   * @returns {Promise<void>}
   */
  async updatePassword(database, userId, passwordHash) {
    const { rows } = await this.db.execSql(
      `SELECT id FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
      [userId, PASSWORD],
      'Check password record'
    );

    if (rows[0]) {
      await this.db.updateVal(database, rows[0].id, passwordHash, 'Update password');
    } else {
      await this.db.insert(database, userId, 1, PASSWORD, passwordHash, 'Insert password');
    }
  }

  /**
   * Update user's activity timestamp.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<void>}
   */
  async updateActivity(database, userId) {
    const timestamp = String(Date.now() / 1000);

    const { rows } = await this.db.execSql(
      `SELECT id FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
      [userId, ACTIVITY],
      'Check activity record'
    );

    if (rows[0]) {
      await this.db.updateVal(database, rows[0].id, timestamp, 'Update activity');
    } else {
      await this.db.insert(database, userId, 1, ACTIVITY, timestamp, 'Insert activity');
    }
  }

  /**
   * Create a new user.
   *
   * @param {string} database - Database name
   * @param {Object} userData - User data
   * @returns {Promise<number>} New user ID
   */
  async create(database, userData) {
    const { username, email, passwordHash, roleId = 115 } = userData;

    // Insert user
    const userId = await this.db.insert(database, 1, 0, USER, username, 'Insert new user');

    // Insert email
    if (email) {
      await this.db.insert(database, userId, 1, EMAIL, email, 'Insert email');
    }

    // Insert password hash
    if (passwordHash) {
      await this.db.insert(database, userId, 1, PASSWORD, passwordHash, 'Insert password');
    }

    // Insert role reference
    await this.db.insert(database, userId, 1, roleId, '', 'Insert role');

    return userId;
  }

  /**
   * Delete a user.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<void>}
   */
  async delete(database, userId) {
    // Delete all user's child records first
    await this.db.execSql(
      `DELETE FROM ${database} WHERE up = ?`,
      [userId],
      'Delete user children'
    );

    // Delete user record
    await this.db.execSql(
      `DELETE FROM ${database} WHERE id = ?`,
      [userId],
      'Delete user'
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create user repository.
 *
 * @param {Object} options - Repository options
 * @returns {UserRepository} Configured repository
 */
export function createUserRepository(options) {
  return new UserRepository(options);
}

// ============================================================================
// Export
// ============================================================================

export default User;
