/**
 * @integram/auth-service - OAuth Service
 *
 * Handles OAuth authentication with multiple providers.
 * Maps to PHP auth.php functionality (Yandex, VK, Mail.ru).
 */

import crypto from 'crypto';
import { AuthenticationError, ValidationError } from '@integram/common';

// ============================================================================
// OAuth Provider Configuration
// ============================================================================

/**
 * Default OAuth provider configurations.
 * These match the PHP auth.php configuration.
 */
const DEFAULT_PROVIDERS = {
  yandex: {
    name: 'Yandex',
    authEndpoint: 'https://oauth.yandex.ru/authorize',
    tokenEndpoint: 'https://oauth.yandex.ru/token',
    userInfoEndpoint: 'https://login.yandex.ru/info',
    scope: 'login:email login:info',
    userIdField: 'id',
    emailField: 'default_email',
    nameField: 'display_name',
  },
  vk: {
    name: 'VKontakte',
    authEndpoint: 'https://oauth.vk.com/authorize',
    tokenEndpoint: 'https://oauth.vk.com/access_token',
    userInfoEndpoint: 'https://api.vk.com/method/users.get',
    scope: 'email',
    userIdField: 'id',
    emailField: 'email',
    nameField: 'first_name',
    apiVersion: '5.131',
  },
  mailru: {
    name: 'Mail.ru',
    authEndpoint: 'https://connect.mail.ru/oauth/authorize',
    tokenEndpoint: 'https://connect.mail.ru/oauth/token',
    userInfoEndpoint: 'https://www.appsmail.ru/platform/api',
    scope: 'userinfo',
    userIdField: 'uid',
    emailField: 'email',
    nameField: 'nick',
  },
  google: {
    name: 'Google',
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    userIdField: 'sub',
    emailField: 'email',
    nameField: 'name',
  },
  github: {
    name: 'GitHub',
    authEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userInfoEndpoint: 'https://api.github.com/user',
    scope: 'user:email',
    userIdField: 'id',
    emailField: 'email',
    nameField: 'name',
  },
};

// ============================================================================
// OAuth Service Class
// ============================================================================

/**
 * Service for OAuth authentication.
 */
export class OAuthService {
  /**
   * Create OAuth service.
   *
   * @param {Object} options - Service options
   * @param {Object} options.database - Database service
   * @param {Object} [options.providers] - Provider configurations
   * @param {string} [options.redirectBase] - Base URL for redirects
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this.db = options.database;
    this.logger = options.logger || console;
    this.redirectBase = options.redirectBase || process.env.OAUTH_REDIRECT_BASE || '';

    // Merge default providers with custom configs
    this.providers = {};
    for (const [id, defaults] of Object.entries(DEFAULT_PROVIDERS)) {
      this.providers[id] = {
        ...defaults,
        clientId: process.env[`OAUTH_${id.toUpperCase()}_CLIENT_ID`],
        clientSecret: process.env[`OAUTH_${id.toUpperCase()}_CLIENT_SECRET`],
        redirectUri: process.env[`OAUTH_${id.toUpperCase()}_REDIRECT_URI`] ||
                     `${this.redirectBase}/oauth/${id}/callback`,
        ...(options.providers?.[id] || {}),
      };
    }
  }

  // ============================================================================
  // Provider Management
  // ============================================================================

  /**
   * Check if provider is supported.
   *
   * @param {string} provider - Provider name
   * @returns {boolean} True if supported
   */
  isProviderSupported(provider) {
    return Boolean(this.providers[provider.toLowerCase()]);
  }

  /**
   * Check if provider is enabled (has credentials).
   *
   * @param {string} provider - Provider name
   * @returns {boolean} True if enabled
   */
  isProviderEnabled(provider) {
    const p = this.providers[provider.toLowerCase()];
    return Boolean(p?.clientId && p?.clientSecret);
  }

  /**
   * Get list of supported providers.
   *
   * @returns {string[]} Provider names
   */
  getSupportedProviders() {
    return Object.keys(this.providers);
  }

  /**
   * Get provider display name.
   *
   * @param {string} provider - Provider ID
   * @returns {string} Display name
   */
  getProviderName(provider) {
    return this.providers[provider.toLowerCase()]?.name || provider;
  }

  /**
   * Get provider configuration.
   *
   * @param {string} provider - Provider name
   * @returns {Object} Provider config
   */
  getProviderConfig(provider) {
    const config = this.providers[provider.toLowerCase()];
    if (!config) {
      throw new ValidationError(`Unknown OAuth provider: ${provider}`);
    }
    return config;
  }

  // ============================================================================
  // OAuth Flow
  // ============================================================================

  /**
   * Generate state parameter for CSRF protection.
   *
   * @param {string} database - Database name
   * @returns {string} State string
   */
  generateState(database) {
    const random = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return Buffer.from(JSON.stringify({ database, random, timestamp })).toString('base64url');
  }

  /**
   * Parse state parameter.
   *
   * @param {string} state - State string
   * @returns {Object} Parsed state
   */
  parseState(state) {
    try {
      return JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return null;
    }
  }

  /**
   * Get authorization URL.
   *
   * @param {string} provider - Provider name
   * @param {Object} [options] - Additional options
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(provider, options = {}) {
    const config = this.getProviderConfig(provider);

    if (!config.clientId) {
      throw new AuthenticationError(`OAuth provider ${provider} not configured`);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: options.redirectUri || config.redirectUri,
      response_type: 'code',
      scope: config.scope,
    });

    if (options.state) {
      params.set('state', options.state);
    }

    // Provider-specific parameters
    if (provider === 'vk' && config.apiVersion) {
      params.set('v', config.apiVersion);
    }

    return `${config.authEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens.
   *
   * @param {string} provider - Provider name
   * @param {string} code - Authorization code
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Token response
   */
  async exchangeCode(provider, code, options = {}) {
    const config = this.getProviderConfig(provider);

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: options.redirectUri || config.redirectUri,
      grant_type: 'authorization_code',
    });

    this.logger.debug?.('Exchanging OAuth code', { provider });

    try {
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (data.error) {
        throw new AuthenticationError(
          data.error_description || data.error,
          { code: 'OAUTH_TOKEN_ERROR', provider }
        );
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
        // VK returns email in token response
        email: data.email,
        // VK returns user_id in token response
        userId: data.user_id,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      this.logger.error?.('OAuth token exchange failed', { provider, error: error.message });
      throw new AuthenticationError(`OAuth token exchange failed: ${error.message}`);
    }
  }

  /**
   * Get user info from OAuth provider.
   *
   * @param {string} provider - Provider name
   * @param {string} accessToken - Access token
   * @param {Object} [tokenData] - Additional token data (for VK)
   * @returns {Promise<Object>} User info
   */
  async getUserInfo(provider, accessToken, tokenData = {}) {
    const config = this.getProviderConfig(provider);

    this.logger.debug?.('Getting OAuth user info', { provider });

    try {
      let data;

      if (provider === 'yandex') {
        const response = await fetch(config.userInfoEndpoint, {
          headers: {
            Authorization: `OAuth ${accessToken}`,
          },
        });
        data = await response.json();
      } else if (provider === 'vk') {
        const params = new URLSearchParams({
          access_token: accessToken,
          v: config.apiVersion,
          fields: 'first_name,last_name,email',
        });
        if (tokenData.userId) {
          params.set('user_ids', tokenData.userId);
        }
        const response = await fetch(`${config.userInfoEndpoint}?${params.toString()}`);
        const result = await response.json();
        data = result.response?.[0] || {};
        // VK returns email in token response, not user info
        data.email = tokenData.email;
      } else if (provider === 'mailru') {
        const sig = crypto.createHash('md5')
          .update(`app_id=${config.clientId}secure=1session_key=${accessToken}${config.clientSecret}`)
          .digest('hex');
        const params = new URLSearchParams({
          method: 'users.getInfo',
          app_id: config.clientId,
          session_key: accessToken,
          secure: '1',
          sig,
        });
        const response = await fetch(`${config.userInfoEndpoint}?${params.toString()}`);
        const result = await response.json();
        data = result[0] || {};
      } else if (provider === 'github') {
        const response = await fetch(config.userInfoEndpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });
        data = await response.json();

        // GitHub may not return email in user info, need to fetch separately
        if (!data.email) {
          const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          });
          const emails = await emailResponse.json();
          const primaryEmail = emails.find(e => e.primary) || emails[0];
          data.email = primaryEmail?.email;
        }
      } else {
        // Generic OAuth user info (Google, etc.)
        const response = await fetch(config.userInfoEndpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        data = await response.json();
      }

      if (data.error) {
        throw new AuthenticationError(
          data.error_description || data.error,
          { code: 'OAUTH_USER_INFO_ERROR', provider }
        );
      }

      // Normalize user info
      return {
        id: String(data[config.userIdField] || data.id),
        email: data[config.emailField] || data.email,
        name: data[config.nameField] || data.name ||
              (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : null),
        picture: data.picture || data.photo || data.avatar_url,
        raw: data,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      this.logger.error?.('OAuth user info failed', { provider, error: error.message });
      throw new AuthenticationError(`Failed to get user info: ${error.message}`);
    }
  }

  // ============================================================================
  // Account Linking
  // ============================================================================

  /**
   * Link OAuth account to user.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @param {string} provider - OAuth provider
   * @param {Object} oauthUser - OAuth user info
   * @returns {Promise<void>}
   */
  async linkAccount(database, userId, provider, oauthUser) {
    // Store OAuth link
    // Type ID for OAuth could be provider-specific or a general OAuth type
    const oauthTypeId = 200 + Object.keys(DEFAULT_PROVIDERS).indexOf(provider.toLowerCase());

    // Check if already linked
    const { rows } = await this.db.execSql(
      `SELECT id FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
      [userId, oauthTypeId],
      'Check OAuth link'
    );

    const value = JSON.stringify({
      id: oauthUser.id,
      email: oauthUser.email,
      name: oauthUser.name,
      linkedAt: Date.now(),
    });

    if (rows[0]) {
      await this.db.updateVal(database, rows[0].id, value, 'Update OAuth link');
    } else {
      await this.db.insert(database, userId, 1, oauthTypeId, value, 'Insert OAuth link');
    }

    this.logger.info?.('OAuth account linked', { database, userId, provider });
  }

  /**
   * Unlink OAuth account from user.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @param {string} provider - OAuth provider
   * @returns {Promise<void>}
   */
  async unlinkAccount(database, userId, provider) {
    const oauthTypeId = 200 + Object.keys(DEFAULT_PROVIDERS).indexOf(provider.toLowerCase());

    await this.db.execSql(
      `DELETE FROM ${database} WHERE up = ? AND t = ?`,
      [userId, oauthTypeId],
      'Delete OAuth link'
    );

    this.logger.info?.('OAuth account unlinked', { database, userId, provider });
  }

  /**
   * Find user by OAuth ID.
   *
   * @param {string} database - Database name
   * @param {string} provider - OAuth provider
   * @param {string} oauthId - OAuth user ID
   * @returns {Promise<Object|null>} User or null
   */
  async findUserByOAuthId(database, provider, oauthId) {
    const oauthTypeId = 200 + Object.keys(DEFAULT_PROVIDERS).indexOf(provider.toLowerCase());

    const { rows } = await this.db.execSql(
      `SELECT u.id, u.val, r.t as roleId, role.val as role, email.val as email
       FROM ${database} oauth
       JOIN ${database} u ON oauth.up = u.id AND u.t = 18
       LEFT JOIN ${database} r ON r.up = u.id AND r.t IN (SELECT id FROM ${database} WHERE t = 42)
       LEFT JOIN ${database} role ON role.id = r.t AND role.t = 42
       LEFT JOIN ${database} email ON email.up = u.id AND email.t = 25
       WHERE oauth.t = ? AND oauth.val LIKE ?
       LIMIT 1`,
      [oauthTypeId, `%"id":"${oauthId}"%`],
      'Find user by OAuth ID'
    );

    return rows[0] || null;
  }

  /**
   * Get user's linked OAuth accounts.
   *
   * @param {string} database - Database name
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Linked accounts by provider
   */
  async getLinkedAccounts(database, userId) {
    const accounts = {};

    for (const provider of Object.keys(DEFAULT_PROVIDERS)) {
      const oauthTypeId = 200 + Object.keys(DEFAULT_PROVIDERS).indexOf(provider);

      const { rows } = await this.db.execSql(
        `SELECT val FROM ${database} WHERE up = ? AND t = ? LIMIT 1`,
        [userId, oauthTypeId],
        `Check ${provider} link`
      );

      if (rows[0]) {
        try {
          accounts[provider] = JSON.parse(rows[0].val);
        } catch {
          accounts[provider] = { raw: rows[0].val };
        }
      }
    }

    return accounts;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create OAuth service.
 *
 * @param {Object} options - Service options
 * @returns {OAuthService} Configured service
 */
export function createOAuthService(options) {
  return new OAuthService(options);
}

// ============================================================================
// Export
// ============================================================================

export default OAuthService;
