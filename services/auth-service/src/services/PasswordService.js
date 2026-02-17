/**
 * @integram/auth-service - Password Service
 *
 * Handles password hashing, verification, and validation.
 * Maps to PHP functions: Salt(), sha1() password handling
 */

import crypto from 'crypto';
import { PasswordError, ValidationError } from '@integram/common';

// ============================================================================
// Password Service Class
// ============================================================================

/**
 * Service for password operations.
 */
export class PasswordService {
  /**
   * Create password service.
   *
   * @param {Object} [options] - Service options
   * @param {number} [options.minLength=6] - Minimum password length
   * @param {boolean} [options.requireUppercase=false] - Require uppercase
   * @param {boolean} [options.requireNumber=false] - Require number
   * @param {boolean} [options.requireSpecial=false] - Require special char
   */
  constructor(options = {}) {
    this.minLength = options.minLength || 6;
    this.requireUppercase = options.requireUppercase || false;
    this.requireNumber = options.requireNumber || false;
    this.requireSpecial = options.requireSpecial || false;
  }

  /**
   * Hash a password using the legacy PHP method.
   * Maps to PHP: sha1(Salt($u, $pwd))
   *
   * @param {string} username - Username (used as salt)
   * @param {string} password - Plain text password
   * @returns {string} Hashed password
   */
  hashLegacy(username, password) {
    const salted = this.salt(username, password);
    return crypto.createHash('sha1').update(salted).digest('hex');
  }

  /**
   * Verify a password against legacy hash.
   *
   * @param {string} username - Username
   * @param {string} password - Plain text password
   * @param {string} hash - Stored hash
   * @returns {boolean} True if password matches
   */
  verifyLegacy(username, password, hash) {
    const computed = this.hashLegacy(username, password);
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }

  /**
   * Hash a password using bcrypt (recommended for new passwords).
   *
   * @param {string} password - Plain text password
   * @param {number} [rounds=10] - Bcrypt rounds
   * @returns {Promise<string>} Hashed password
   */
  async hashModern(password, rounds = 10) {
    // Note: In production, use actual bcrypt
    // This is a placeholder that uses scrypt
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16);
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(salt.toString('hex') + ':' + derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Verify a password against modern hash.
   *
   * @param {string} password - Plain text password
   * @param {string} hash - Stored hash
   * @returns {Promise<boolean>} True if password matches
   */
  async verifyModern(password, hash) {
    return new Promise((resolve, reject) => {
      const [saltHex, keyHex] = hash.split(':');
      const salt = Buffer.from(saltHex, 'hex');
      const storedKey = Buffer.from(keyHex, 'hex');

      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(crypto.timingSafeEqual(derivedKey, storedKey));
      });
    });
  }

  /**
   * Generate a salt string.
   * Maps to PHP: Salt()
   *
   * @param {string} username - Username
   * @param {string} value - Value to salt
   * @returns {string} Salted string
   */
  salt(username, value) {
    // Match PHP Salt() behavior: simple concatenation
    return `${username}:${value}`;
  }

  /**
   * Validate password meets requirements.
   *
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with valid flag and errors
   */
  validate(password) {
    const errors = [];

    if (!password) {
      errors.push('Password is required');
      return { valid: false, errors };
    }

    if (password.length < this.minLength) {
      errors.push(`Password must be at least ${this.minLength} characters`);
    }

    if (this.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (this.requireNumber && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (this.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate password and throw if invalid.
   *
   * @param {string} password - Password to validate
   * @throws {PasswordError} If password is invalid
   */
  validateOrThrow(password) {
    const result = this.validate(password);
    if (!result.valid) {
      throw new PasswordError(result.errors.join('; '));
    }
  }

  /**
   * Generate a random password.
   *
   * @param {number} [length=12] - Password length
   * @returns {string} Random password
   */
  generateRandom(length = 12) {
    const charset =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const randomBytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Generate a password reset token.
   *
   * @returns {string} Reset token
   */
  generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash a reset token for storage.
   *
   * @param {string} token - Reset token
   * @returns {string} Hashed token
   */
  hashResetToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Determine if a hash is legacy format.
   *
   * @param {string} hash - Password hash
   * @returns {boolean} True if legacy SHA1 format
   */
  isLegacyHash(hash) {
    // Legacy SHA1 hashes are 40 hex characters
    return /^[a-f0-9]{40}$/i.test(hash);
  }

  /**
   * Check if a hash needs upgrade to modern format.
   *
   * @param {string} hash - Password hash
   * @returns {boolean} True if should upgrade
   */
  needsUpgrade(hash) {
    return this.isLegacyHash(hash);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create password service with default options.
 *
 * @param {Object} [options] - Service options
 * @returns {PasswordService} Configured password service
 */
export function createPasswordService(options = {}) {
  return new PasswordService(options);
}

// ============================================================================
// Export
// ============================================================================

export default PasswordService;
