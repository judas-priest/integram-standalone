/**
 * @integram/auth-service - PHP Bridge Service
 *
 * Provides integration between Node.js auth-service and PHP monolith.
 * Allows proxying authentication requests to the PHP backend and
 * maintaining session compatibility.
 *
 * PHP Auth Endpoint: POST /{database}/auth?JSON_KV
 *   - Body: login=...&pwd=... (form-urlencoded)
 *   - Response: { _xsrf, token, id, msg }
 */

import https from 'https';
import http from 'http';

// ============================================================================
// PHP Bridge Service
// ============================================================================

/**
 * Service for integrating with PHP backend.
 */
export class PhpBridge {
  /**
   * Create PHP bridge.
   *
   * @param {Object} [options] - Configuration options
   * @param {string} [options.baseUrl] - PHP backend URL (e.g., https://dronedoc.ru)
   * @param {Object} [options.logger] - Logger instance
   * @param {boolean} [options.rejectUnauthorized] - Verify SSL (default: true)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.INTEGRAM_PHP_URL || 'https://dronedoc.ru';
    this.logger = options.logger;
    this.rejectUnauthorized = options.rejectUnauthorized !== false;

    // Parse base URL
    const url = new URL(this.baseUrl);
    this.protocol = url.protocol === 'https:' ? https : http;
    this.host = url.hostname;
    this.port = url.port || (url.protocol === 'https:' ? 443 : 80);
  }

  /**
   * Authenticate user against PHP backend.
   *
   * @param {string} database - Database name (e.g., 'my', 'a2025')
   * @param {string} login - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Auth result with token, xsrf, id
   */
  async authenticate(database, login, password) {
    const path = `/${encodeURIComponent(database)}/auth?JSON_KV`;

    // Form-urlencoded body (PHP expects 'pwd' not 'password')
    const body = new URLSearchParams({
      login,
      pwd: password,
    }).toString();

    this.logger?.debug?.('PHP auth request', { database, login, path });

    try {
      const response = await this._request({
        method: 'POST',
        path,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        body,
      });

      // Parse JSON response
      const data = JSON.parse(response);

      // Check for PHP error response
      if (data.failed || data.error) {
        const error = new Error(data.error || data.failed || 'Authentication failed');
        error.code = 'AUTH_FAILED';
        throw error;
      }

      // Validate required fields
      if (!data.token || !data._xsrf) {
        const error = new Error('Invalid response from PHP backend: missing token or _xsrf');
        error.code = 'INVALID_RESPONSE';
        throw error;
      }

      this.logger?.info?.('PHP auth success', {
        database,
        login,
        userId: data.id,
      });

      return {
        success: true,
        token: data.token,
        xsrf: data._xsrf,
        userId: data.id,
        database,
        message: data.msg || '',
      };
    } catch (error) {
      this.logger?.error?.('PHP auth error', {
        database,
        login,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate a token against PHP backend.
   *
   * @param {string} database - Database name
   * @param {string} token - Token to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(database, token) {
    // PHP validates tokens via Validate_Token() which checks the cookie/header
    const path = `/${encodeURIComponent(database)}/object/18?JSON_KV&LIMIT=1`;

    this.logger?.debug?.('PHP token validation', { database });

    try {
      const response = await this._request({
        method: 'GET',
        path,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = JSON.parse(response);

      // If we get an error response, token is invalid
      if (data.error || data.failed) {
        return { valid: false, error: data.error || data.failed };
      }

      return { valid: true, data };
    } catch (error) {
      // Network/parse errors indicate invalid token
      return { valid: false, error: error.message };
    }
  }

  /**
   * Check database exists and is accessible.
   *
   * @param {string} database - Database name to check
   * @returns {Promise<boolean>} True if database exists
   */
  async checkDatabase(database) {
    const path = `/${encodeURIComponent(database)}`;

    try {
      await this._request({
        method: 'HEAD',
        path,
      });
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get user info from PHP backend.
   *
   * @param {string} database - Database name
   * @param {string} token - Auth token
   * @param {number} userId - User ID
   * @returns {Promise<Object>} User data
   */
  async getUserInfo(database, token, userId) {
    const path = `/${encodeURIComponent(database)}/object/18/${userId}?JSON_KV`;

    try {
      const response = await this._request({
        method: 'GET',
        path,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return JSON.parse(response);
    } catch (error) {
      this.logger?.error?.('PHP get user error', {
        database,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Logout user from PHP backend.
   *
   * @param {string} database - Database name
   * @param {string} token - Auth token to invalidate
   * @returns {Promise<Object>} Logout result
   */
  async logout(database, token) {
    // PHP doesn't have a dedicated logout endpoint
    // Logout is handled client-side by clearing cookies
    // This is a no-op for compatibility
    this.logger?.info?.('PHP logout', { database });
    return { success: true };
  }

  /**
   * Make HTTP request to PHP backend.
   *
   * @private
   * @param {Object} options - Request options
   * @returns {Promise<string>} Response body
   */
  _request(options) {
    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: this.host,
        port: this.port,
        path: options.path,
        method: options.method,
        headers: options.headers || {},
        rejectUnauthorized: this.rejectUnauthorized,
      };

      const req = this.protocol.request(reqOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 400) {
            const error = new Error(`HTTP ${res.statusCode}: ${data}`);
            error.statusCode = res.statusCode;
            reject(error);
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create PHP bridge from environment.
 *
 * @param {Object} [options] - Additional options
 * @returns {PhpBridge} Configured PHP bridge
 */
export function createPhpBridgeFromEnv(options = {}) {
  return new PhpBridge({
    baseUrl: process.env.INTEGRAM_PHP_URL,
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    ...options,
  });
}

// ============================================================================
// Export
// ============================================================================

export default PhpBridge;
