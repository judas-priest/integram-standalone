/**
 * @integram/auth-service - Legacy Format Transformer
 *
 * Transforms between modern API formats and legacy PHP formats.
 * Ensures backward compatibility with existing clients.
 */

// ============================================================================
// Legacy Format Transformer Class
// ============================================================================

/**
 * Transformer for legacy PHP format compatibility.
 */
export class LegacyFormatTransformer {
  /**
   * Create transformer.
   *
   * @param {Object} [options] - Options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  // ============================================================================
  // Request Transformation
  // ============================================================================

  /**
   * Transform legacy login request to modern format.
   *
   * Legacy formats:
   * - login=xxx&pwd=xxx
   * - u=xxx&pwd=xxx
   * - email=xxx&password=xxx
   *
   * @param {Object} body - Request body
   * @returns {Object} Normalized request
   */
  transformLoginRequest(body) {
    return {
      username: body.username || body.login || body.u || body.email,
      password: body.password || body.pwd,
    };
  }

  /**
   * Transform legacy registration request to modern format.
   *
   * Legacy format:
   * - email=xxx&regpwd=xxx&regpwd1=xxx&agree=1
   *
   * @param {Object} body - Request body
   * @returns {Object} Normalized request
   */
  transformRegisterRequest(body) {
    return {
      email: body.email,
      password: body.password || body.regpwd,
      confirmPassword: body.confirmPassword || body.regpwd1,
      termsAccepted: this.normalizeBoolean(body.agree ?? body.termsAccepted),
      name: body.name,
    };
  }

  /**
   * Transform legacy token request.
   *
   * Legacy formats:
   * - secret=xxx (POST/GET)
   * - token=xxx (POST)
   * - Cookie: {db}=xxx
   * - Authorization: Basic xxx
   * - Authorization: Bearer xxx
   *
   * @param {Object} req - Express request
   * @param {string} database - Database name
   * @returns {Object} Normalized token info
   */
  transformTokenRequest(req, database) {
    // Check various token sources
    let token = null;
    let tokenType = 'bearer';

    // 1. Authorization header
    const authHeader = req.headers.authorization || req.headers['x-authorization'];
    if (authHeader) {
      if (authHeader.toLowerCase().startsWith('basic ')) {
        // Basic auth - decode and extract
        let value = authHeader.substring(6).trim();
        if (!value.includes(':')) {
          try {
            value = Buffer.from(value, 'base64').toString();
          } catch { /* ignore */ }
        }
        const [username, password] = value.split(':');
        return {
          type: 'basic',
          username,
          password,
        };
      } else if (authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.substring(7).trim();
        tokenType = 'bearer';
      } else {
        token = authHeader.trim();
        tokenType = 'token';
      }
    }

    // 2. POST body - secret (high priority in PHP)
    if (!token && req.body?.secret) {
      token = req.body.secret;
      tokenType = 'secret';
    }

    // 3. GET query - secret
    if (!token && req.query?.secret) {
      token = req.query.secret;
      tokenType = 'secret';
    }

    // 4. POST body - token
    if (!token && req.body?.token) {
      token = req.body.token;
      tokenType = 'token';
    }

    // 5. Cookie
    if (!token && req.cookies?.[database]) {
      token = req.cookies[database];
      tokenType = 'cookie';
    }

    return {
      type: tokenType,
      token,
    };
  }

  // ============================================================================
  // Response Transformation
  // ============================================================================

  /**
   * Transform modern login response to legacy format.
   *
   * @param {Object} result - Modern response
   * @param {string} format - Output format ('json', 'redirect', 'html')
   * @returns {Object} Legacy response
   */
  transformLoginResponse(result, format = 'json') {
    if (format === 'redirect') {
      return {
        redirect: true,
        location: '/',
      };
    }

    // JSON format - matches PHP response structure
    return {
      success: result.success,
      token: result.token,
      xsrf: result.xsrf,
      user: result.user ? {
        id: result.user.id,
        val: result.user.username,
        role: result.user.role,
        role_id: result.user.roleId,
      } : undefined,
      grants: result.grants,
    };
  }

  /**
   * Transform modern error to legacy format.
   *
   * @param {Error} error - Error object
   * @returns {Object} Legacy error response
   */
  transformErrorResponse(error) {
    // PHP returns errors as JSON array with single object
    if (error.code === 'NOT_AUTHENTICATED') {
      return [{
        error: 'No authorization token provided',
      }];
    }

    if (error.code === 'INVALID_CREDENTIALS' || error.code === 'USER_NOT_FOUND') {
      return [{
        error: 'Basic auth: Invalid login/password',
      }];
    }

    return [{
      error: error.message || 'Unknown error',
      code: error.code,
    }];
  }

  /**
   * Transform validation result to legacy format.
   *
   * PHP Validate_Token() sets GLOBAL_VARS:
   * - user (lowercase username)
   * - role (lowercase role name)
   * - role_id
   * - user_id
   * - xsrf
   *
   * @param {Object} result - Validation result
   * @returns {Object} Legacy format
   */
  transformValidationResponse(result) {
    return {
      user: result.username?.toLowerCase(),
      role: result.role?.toLowerCase(),
      role_id: result.roleId,
      user_id: result.userId,
      xsrf: result.xsrf,
      grants: result.grants,
    };
  }

  // ============================================================================
  // Cookie Handling
  // ============================================================================

  /**
   * Get legacy cookie settings.
   *
   * PHP: setcookie($z, $tok, time() + COOKIES_EXPIRE, "/")
   * COOKIES_EXPIRE = 2592000 (30 days)
   *
   * @param {string} database - Database name
   * @returns {Object} Cookie options
   */
  getLegacyCookieOptions(database) {
    return {
      name: database,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    };
  }

  /**
   * Get session cookie settings (expires on session close).
   *
   * PHP: setcookie($z, $tok, 0, "/")
   *
   * @param {string} database - Database name
   * @returns {Object} Cookie options
   */
  getSessionCookieOptions(database) {
    return {
      name: database,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // No maxAge = session cookie
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Normalize boolean value from various formats.
   *
   * @param {any} value - Value to normalize
   * @returns {boolean} Boolean value
   */
  normalizeBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value === '1' || value.toLowerCase() === 'true';
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    return Boolean(value);
  }

  /**
   * Sanitize input (matches PHP htmlentities/addslashes).
   *
   * @param {string} value - Value to sanitize
   * @returns {string} Sanitized value
   */
  sanitizeInput(value) {
    if (typeof value !== 'string') {
      return value;
    }

    // Basic HTML entity encoding
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Check if request is API request.
   * Maps to PHP isApi() function.
   *
   * @param {Object} req - Express request
   * @returns {boolean} True if API request
   */
  isApiRequest(req) {
    // Check Accept header
    const accept = req.headers.accept || '';
    if (accept.includes('application/json')) {
      return true;
    }

    // Check X-Requested-With header
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return true;
    }

    // Check Content-Type
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      return true;
    }

    // Check query parameter
    if (req.query.format === 'json' || req.query.api === '1') {
      return true;
    }

    return false;
  }

  /**
   * Detect response format from request.
   *
   * @param {Object} req - Express request
   * @returns {string} Format: 'json', 'html', or 'redirect'
   */
  detectResponseFormat(req) {
    if (this.isApiRequest(req)) {
      return 'json';
    }

    // Form submissions typically expect redirect
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return 'redirect';
    }

    return 'html';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create legacy format transformer.
 *
 * @param {Object} [options] - Options
 * @returns {LegacyFormatTransformer} Configured transformer
 */
export function createLegacyFormatTransformer(options) {
  return new LegacyFormatTransformer(options);
}

// ============================================================================
// Export
// ============================================================================

export default LegacyFormatTransformer;
