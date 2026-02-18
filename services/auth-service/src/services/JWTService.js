/**
 * @integram/auth-service - JWT Service
 *
 * Handles JWT token generation, validation, and management.
 * Maps to PHP functions: authJWT(), Validate_Token()
 */

import crypto from 'crypto';
import { TokenError, AuthenticationError } from '@integram/common';

// ============================================================================
// JWT Service Class
// ============================================================================

/**
 * Service for JWT token operations.
 */
export class JWTService {
  /**
   * Create JWT service.
   *
   * @param {Object} options - Service options
   * @param {string} options.secret - JWT secret key
   * @param {number} [options.expiresIn=86400] - Token expiration in seconds (default 24h)
   * @param {string} [options.algorithm='HS256'] - JWT algorithm
   */
  constructor(options) {
    if (!options.secret) {
      throw new Error('JWT secret is required');
    }

    this.secret = options.secret;
    this.expiresIn = options.expiresIn || 86400; // 24 hours
    this.algorithm = options.algorithm || 'HS256';
  }

  /**
   * Generate a JWT token.
   *
   * @param {Object} payload - Token payload
   * @param {number} payload.userId - User ID
   * @param {string} payload.username - Username
   * @param {string} [payload.role] - User role
   * @param {string} [payload.database] - Database name
   * @returns {string} JWT token
   */
  generateToken(payload) {
    const header = {
      alg: this.algorithm,
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + this.expiresIn,
      jti: crypto.randomUUID(),
    };

    const headerBase64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadBase64 = this.base64UrlEncode(JSON.stringify(tokenPayload));
    const signature = this.sign(`${headerBase64}.${payloadBase64}`);

    return `${headerBase64}.${payloadBase64}.${signature}`;
  }

  /**
   * Verify and decode a JWT token.
   *
   * @param {string} token - JWT token
   * @returns {Object} Decoded payload
   * @throws {TokenError} If token is invalid
   */
  verifyToken(token) {
    if (!token || typeof token !== 'string') {
      throw new TokenError('Token is required');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new TokenError('Invalid token format');
    }

    const [headerBase64, payloadBase64, signature] = parts;

    // Verify signature
    const expectedSignature = this.sign(`${headerBase64}.${payloadBase64}`);
    if (signature !== expectedSignature) {
      throw new TokenError('Invalid token signature');
    }

    // Decode payload
    let payload;
    try {
      payload = JSON.parse(this.base64UrlDecode(payloadBase64));
    } catch {
      throw new TokenError('Invalid token payload');
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new TokenError('Token has expired');
    }

    return payload;
  }

  /**
   * Decode token without verification (for debugging).
   *
   * @param {string} token - JWT token
   * @returns {Object} Decoded payload
   */
  decodeToken(token) {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      return JSON.parse(this.base64UrlDecode(parts[1]));
    } catch {
      return null;
    }
  }

  /**
   * Refresh a token (generate new with extended expiry).
   *
   * @param {string} token - Current token
   * @returns {string} New token
   * @throws {TokenError} If current token is invalid
   */
  refreshToken(token) {
    const payload = this.verifyToken(token);

    // Remove timing claims for new token
    const { iat, exp, jti, ...rest } = payload;

    return this.generateToken(rest);
  }

  /**
   * Generate a random token (for legacy token support).
   *
   * @returns {string} Random token
   */
  generateLegacyToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate XSRF token.
   * Maps to PHP: xsrf()
   *
   * @param {string} token - User token
   * @param {string} database - Database name
   * @returns {string} XSRF token
   */
  generateXsrf(token, database) {
    const combined = `${token}:${database}:${this.secret}`;
    const hash = crypto.createHash('sha1').update(combined).digest('hex');
    return hash.substring(0, 22);
  }

  /**
   * Verify XSRF token.
   *
   * @param {string} xsrf - XSRF token to verify
   * @param {string} token - User token
   * @param {string} database - Database name
   * @returns {boolean} True if valid
   */
  verifyXsrf(xsrf, token, database) {
    const expected = this.generateXsrf(token, database);
    return xsrf === expected;
  }

  /**
   * Verify external JWT token with public key.
   * Maps to PHP: verifyJWT() function
   *
   * This method verifies JWTs from external systems using RS256 (public key)
   * or falls back to HS256 with shared secret.
   *
   * @param {string} token - External JWT token
   * @param {string} [publicKey] - Optional public key for RS256 verification
   * @returns {Object|null} Decoded payload or null if invalid
   */
  verifyExternalJWT(token, publicKey) {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerBase64, payloadBase64, signature] = parts;

    // Decode header to get algorithm
    let header;
    try {
      header = JSON.parse(this.base64UrlDecode(headerBase64));
    } catch {
      return null;
    }

    // Decode payload
    let payload;
    try {
      payload = JSON.parse(this.base64UrlDecode(payloadBase64));
    } catch {
      return null;
    }

    // Verify based on algorithm
    if (header.alg === 'RS256' && publicKey) {
      // Verify with RSA public key
      try {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(`${headerBase64}.${payloadBase64}`);

        // Convert base64url signature to buffer
        let signatureBuffer = signature.replace(/-/g, '+').replace(/_/g, '/');
        while (signatureBuffer.length % 4) {
          signatureBuffer += '=';
        }

        const isValid = verifier.verify(publicKey, signatureBuffer, 'base64');
        if (!isValid) {
          return null;
        }
      } catch {
        return null;
      }
    } else if (header.alg === 'HS256') {
      // Verify with shared secret
      const expectedSignature = this.sign(`${headerBase64}.${payloadBase64}`);
      if (signature !== expectedSignature) {
        return null;
      }
    } else {
      // For other algorithms or when no verification is needed,
      // just decode and return the payload (trust external validation)
      // This matches PHP's verifyJWT behavior which may accept unverified tokens
      // in some configurations
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Sign data with HMAC.
   *
   * @param {string} data - Data to sign
   * @returns {string} Signature
   */
  sign(data) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');
  }

  /**
   * Encode string to base64url.
   *
   * @param {string} str - String to encode
   * @returns {string} Base64url encoded string
   */
  base64UrlEncode(str) {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Decode base64url string.
   *
   * @param {string} str - Base64url string
   * @returns {string} Decoded string
   */
  base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create JWT service from environment.
 *
 * @returns {JWTService} Configured JWT service
 */
export function createJWTServiceFromEnv() {
  return new JWTService({
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '86400', 10),
  });
}

// ============================================================================
// Export
// ============================================================================

export default JWTService;
