/**
 * @integram/auth-service - Permission Service
 *
 * Handles user permissions, grants, and access control.
 * Maps to PHP functions: Check_Grant(), Grant_1level(), getGrants(), Check_Val_granted()
 */

import {
  GRANTS,
  ROLE,
  USER,
  ROLE_OBJECT,
} from '@integram/common';
import { GrantError, AuthorizationError } from '@integram/common';

// ============================================================================
// Permission Service Class
// ============================================================================

/**
 * Service for permission and grant management.
 */
export class PermissionService {
  /**
   * Create permission service.
   *
   * @param {Object} options - Service options
   * @param {Object} options.database - Database service
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this.db = options.database;
    this.logger = options.logger || console;
    this.grantCache = new Map();
  }

  /**
   * Load user grants from database.
   * Maps to PHP: getGrants()
   *
   * @param {string} database - Database name
   * @param {number} roleId - User's role ID
   * @returns {Promise<Object>} Grants object mapping type/object IDs to grant levels
   */
  async loadGrants(database, roleId) {
    const cacheKey = `${database}:${roleId}`;

    // Check cache
    if (this.grantCache.has(cacheKey)) {
      return this.grantCache.get(cacheKey);
    }

    const grants = {};
    const masks = {};

    try {
      // Query role objects (grants)
      const { rows } = await this.db.execSql(
        `SELECT ro.t, ro.val, m.val mask
         FROM ${database} ro
         LEFT JOIN ${database} m ON m.up = ro.id AND m.t = ?
         WHERE ro.up = ? AND ro.t IN (SELECT id FROM ${database} WHERE up = 0)`,
        [49, roleId], // 49 = MASK type
        'Load grants'
      );

      for (const row of rows) {
        const typeId = row.t;
        const grantLevel = row.val?.toUpperCase();

        if (grantLevel === 'READ' || grantLevel === 'WRITE') {
          grants[typeId] = grantLevel;
        }

        // Handle masks
        if (row.mask) {
          if (!masks[typeId]) {
            masks[typeId] = {};
          }
          masks[typeId][row.mask] = grantLevel;
        }
      }

      const result = { grants, masks };
      this.grantCache.set(cacheKey, result);

      return result;
    } catch (error) {
      this.logger.error?.('Failed to load grants', { error: error.message, roleId });
      return { grants: {}, masks: {} };
    }
  }

  /**
   * Check if user has grant for an object.
   * Maps to PHP: Check_Grant()
   *
   * @param {Object} context - Request context
   * @param {string} context.database - Database name
   * @param {string} context.username - Username
   * @param {Object} context.userGrants - User's grants
   * @param {number} objectId - Object ID
   * @param {number} [typeId=0] - Type ID
   * @param {string} [requiredGrant='WRITE'] - Required grant level
   * @param {boolean} [fatal=true] - Throw on failure
   * @returns {boolean} True if granted
   * @throws {GrantError} If not granted and fatal is true
   */
  checkGrant(context, objectId, typeId = 0, requiredGrant = 'WRITE', fatal = true) {
    const { username, userGrants } = context;

    // Admin has all access
    if (username === 'admin') {
      return true;
    }

    const { grants } = userGrants || {};

    if (!grants) {
      if (fatal) {
        throw new GrantError(objectId, typeId, requiredGrant);
      }
      return false;
    }

    // Check explicit grant for type
    if (typeId !== 0 && grants[typeId]) {
      if (grants[typeId] === requiredGrant || grants[typeId] === 'WRITE') {
        return true;
      }
      if (fatal) {
        throw new GrantError(objectId, typeId, requiredGrant, {
          currentGrant: grants[typeId],
        });
      }
      return false;
    }

    // Check explicit grant for object
    if (grants[objectId]) {
      if (grants[objectId] === requiredGrant || grants[objectId] === 'WRITE') {
        return true;
      }
      if (fatal) {
        throw new GrantError(objectId, typeId, requiredGrant, {
          currentGrant: grants[objectId],
        });
      }
      return false;
    }

    // Check root grant (type 1)
    if (grants[1]) {
      if (grants[1] === requiredGrant || grants[1] === 'WRITE') {
        return true;
      }
    }

    if (fatal) {
      throw new GrantError(objectId, typeId, requiredGrant);
    }
    return false;
  }

  /**
   * Check grant for first-level objects.
   * Maps to PHP: Grant_1level()
   *
   * @param {Object} context - Request context
   * @param {number} objectId - Object ID
   * @returns {string|false} Grant level or false
   */
  checkGrant1Level(context, objectId) {
    const { username, userGrants } = context;

    // Admin has WRITE access
    if (username === 'admin') {
      return 'WRITE';
    }

    const { grants } = userGrants || {};

    if (!grants) {
      return false;
    }

    // Check explicit grant
    if (grants[objectId]) {
      if (grants[objectId] === 'READ' || grants[objectId] === 'WRITE') {
        return grants[objectId];
      }
    }

    // Check root grant
    if (grants[1]) {
      if (grants[1] === 'READ' || grants[1] === 'WRITE') {
        return grants[1];
      }
    }

    return false;
  }

  /**
   * Check grant for type editing.
   * Maps to PHP: Check_Types_Grant()
   *
   * @param {Object} context - Request context
   * @param {boolean} [fatal=true] - Throw on failure
   * @returns {string|false} Grant level or false
   * @throws {AuthorizationError} If not granted and fatal is true
   */
  checkTypesGrant(context, fatal = true) {
    const { username, userGrants } = context;

    // Admin has WRITE access
    if (username === 'admin') {
      return 'WRITE';
    }

    const { grants } = userGrants || {};

    // Check grant for type 0 (metadata)
    if (grants && grants[0]) {
      if (grants[0] === 'READ' || grants[0] === 'WRITE') {
        return grants[0];
      }
    }

    if (fatal) {
      throw new AuthorizationError('No permission to edit types');
    }
    return false;
  }

  /**
   * Check if value is allowed by mask.
   * Maps to PHP: Val_barred_by_mask()
   *
   * @param {Object} context - Request context
   * @param {number} typeId - Type ID
   * @param {string} value - Value to check
   * @returns {boolean} True if barred (not allowed)
   */
  isValueBarredByMask(context, typeId, value) {
    const { userGrants } = context;
    const { masks } = userGrants || {};

    if (!masks || !masks[typeId]) {
      return false;
    }

    // Check each mask for this type
    for (const [pattern, level] of Object.entries(masks[typeId])) {
      const matches = this.matchesMask(value, pattern);

      if (matches) {
        return level === 'BARRED';
      }
    }

    return false;
  }

  /**
   * Check if value matches a mask pattern.
   *
   * @param {string} value - Value to check
   * @param {string} pattern - Mask pattern
   * @returns {boolean} True if matches
   */
  matchesMask(value, pattern) {
    if (pattern === '%') {
      return value === null || value === undefined || value === '';
    }

    if (pattern.startsWith('!')) {
      return !this.matchesMask(value, pattern.substring(1));
    }

    if (pattern.includes('%')) {
      // Convert SQL LIKE pattern to regex
      const regex = new RegExp(
        '^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$',
        'i'
      );
      return regex.test(value);
    }

    return value === pattern;
  }

  /**
   * Clear grant cache for a role.
   *
   * @param {string} database - Database name
   * @param {number} [roleId] - Role ID (all if not specified)
   */
  clearCache(database, roleId = null) {
    if (roleId) {
      this.grantCache.delete(`${database}:${roleId}`);
    } else {
      // Clear all cache entries for this database
      for (const key of this.grantCache.keys()) {
        if (key.startsWith(`${database}:`)) {
          this.grantCache.delete(key);
        }
      }
    }
  }

  /**
   * Clear entire cache.
   */
  clearAllCache() {
    this.grantCache.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create permission service.
 *
 * @param {Object} options - Service options
 * @returns {PermissionService} Configured permission service
 */
export function createPermissionService(options) {
  return new PermissionService(options);
}

// ============================================================================
// Export
// ============================================================================

export default PermissionService;
