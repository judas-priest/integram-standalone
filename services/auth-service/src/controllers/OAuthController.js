/**
 * @integram/auth-service - OAuth Controller
 *
 * REST controller for OAuth authentication endpoints.
 * Maps PHP: auth.php OAuth flow (Yandex, VK, Mail.ru)
 */

// ============================================================================
// OAuth Controller Class
// ============================================================================

/**
 * Controller for OAuth authentication endpoints.
 */
export class OAuthController {
  /**
   * Create OAuth controller.
   *
   * @param {Object} options - Controller options
   * @param {Object} options.oauthService - OAuth service instance
   * @param {Object} options.authService - Auth service instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this.oauthService = options.oauthService;
    this.authService = options.authService;
    this.logger = options.logger || console;

    // Bind methods to preserve context
    this.initiateAuth = this.initiateAuth.bind(this);
    this.handleCallback = this.handleCallback.bind(this);
    this.getProviders = this.getProviders.bind(this);
    this.linkAccount = this.linkAccount.bind(this);
    this.unlinkAccount = this.unlinkAccount.bind(this);
  }

  /**
   * Initiate OAuth authentication flow.
   * Maps to PHP: auth.php startAuthentication()
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async initiateAuth(req, res) {
    try {
      const { db: database, provider } = req.params;
      const { redirect_uri, state } = req.query;

      if (!provider) {
        return res.status(400).json({
          error: 'Provider is required',
          code: 'MISSING_PROVIDER',
        });
      }

      this.logger.debug?.('Initiating OAuth', { database, provider });

      // Check if provider is supported
      if (!this.oauthService.isProviderSupported(provider)) {
        return res.status(400).json({
          error: 'Provider not supported',
          code: 'UNSUPPORTED_PROVIDER',
          supportedProviders: this.oauthService.getSupportedProviders(),
        });
      }

      // Generate state for CSRF protection
      const authState = state || this.oauthService.generateState(database);

      // Store state in session or cookie for verification
      res.cookie('oauth_state', authState, {
        maxAge: 10 * 60 * 1000, // 10 minutes
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      });

      // Get authorization URL
      const authUrl = this.oauthService.getAuthorizationUrl(provider, {
        state: authState,
        redirectUri: redirect_uri,
      });

      this.logger.info?.('OAuth redirect', { database, provider, authUrl });

      // Redirect to provider
      res.redirect(authUrl);
    } catch (error) {
      this.handleError(res, error, 'OAuth initiation failed');
    }
  }

  /**
   * Handle OAuth callback.
   * Maps to PHP: auth.php processCode()
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleCallback(req, res) {
    try {
      const { db: database, provider } = req.params;
      const { code, state, error: oauthError, error_description } = req.query;

      // Handle OAuth error
      if (oauthError) {
        this.logger.error?.('OAuth error from provider', {
          provider,
          error: oauthError,
          description: error_description,
        });

        // Redirect to login with error
        return res.redirect(
          `/login.html?r=oauth_error&provider=${provider}&error=${encodeURIComponent(oauthError)}`
        );
      }

      if (!code) {
        return res.status(400).json({
          error: 'Authorization code is required',
          code: 'MISSING_CODE',
        });
      }

      // Verify state to prevent CSRF
      const storedState = req.cookies?.oauth_state;
      if (state && storedState && state !== storedState) {
        this.logger.warn?.('OAuth state mismatch', { database, provider });
        return res.status(400).json({
          error: 'Invalid state parameter',
          code: 'STATE_MISMATCH',
        });
      }

      // Clear state cookie
      res.clearCookie('oauth_state', { path: '/' });

      this.logger.debug?.('Processing OAuth callback', { database, provider });

      // Exchange code for tokens
      const tokens = await this.oauthService.exchangeCode(provider, code);

      // Get user info from provider
      const oauthUser = await this.oauthService.getUserInfo(provider, tokens.accessToken);

      // Find or create user in database
      const authResult = await this.processOAuthUser(database, provider, oauthUser);

      // Set authentication cookies
      res.cookie(database, authResult.token, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      });

      res.cookie(`${database}_xsrf`, authResult.xsrf, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
        sameSite: 'lax',
      });

      this.logger.info?.('OAuth login successful', {
        database,
        provider,
        userId: authResult.user.id,
      });

      // Redirect to app or return JSON based on request type
      if (req.accepts('html')) {
        res.redirect(`/${database}/`);
      } else {
        res.json({
          success: true,
          message: 'OAuth authentication successful',
          token: authResult.token,
          xsrf: authResult.xsrf,
          user: authResult.user,
        });
      }
    } catch (error) {
      this.logger.error?.('OAuth callback failed', {
        error: error.message,
        provider: req.params.provider,
      });

      if (req.accepts('html')) {
        res.redirect(
          `/login.html?r=oauth_failed&error=${encodeURIComponent(error.message)}`
        );
      } else {
        this.handleError(res, error, 'OAuth callback failed');
      }
    }
  }

  /**
   * Get list of supported OAuth providers.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getProviders(req, res) {
    try {
      const providers = this.oauthService.getSupportedProviders();

      res.json({
        providers: providers.map(p => ({
          id: p,
          name: this.oauthService.getProviderName(p),
          enabled: this.oauthService.isProviderEnabled(p),
        })),
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to get providers');
    }
  }

  /**
   * Link OAuth account to existing user.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async linkAccount(req, res) {
    try {
      const { db: database, provider } = req.params;
      const { code } = req.body;

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      if (!code) {
        return res.status(400).json({
          error: 'Authorization code is required',
          code: 'MISSING_CODE',
        });
      }

      // Exchange code for tokens
      const tokens = await this.oauthService.exchangeCode(provider, code);

      // Get user info from provider
      const oauthUser = await this.oauthService.getUserInfo(provider, tokens.accessToken);

      // Link OAuth account to current user
      await this.oauthService.linkAccount(database, req.user.userId, provider, oauthUser);

      this.logger.info?.('OAuth account linked', {
        database,
        provider,
        userId: req.user.userId,
      });

      res.json({
        success: true,
        message: `${provider} account linked successfully`,
      });
    } catch (error) {
      this.handleError(res, error, 'Account linking failed');
    }
  }

  /**
   * Unlink OAuth account from user.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async unlinkAccount(req, res) {
    try {
      const { db: database, provider } = req.params;

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      // Unlink OAuth account
      await this.oauthService.unlinkAccount(database, req.user.userId, provider);

      this.logger.info?.('OAuth account unlinked', {
        database,
        provider,
        userId: req.user.userId,
      });

      res.json({
        success: true,
        message: `${provider} account unlinked successfully`,
      });
    } catch (error) {
      this.handleError(res, error, 'Account unlinking failed');
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Process OAuth user - find existing or create new user.
   *
   * @param {string} database - Database name
   * @param {string} provider - OAuth provider
   * @param {Object} oauthUser - User info from OAuth provider
   * @returns {Promise<Object>} Auth result with token and user
   */
  async processOAuthUser(database, provider, oauthUser) {
    // Try to find existing user by OAuth ID
    let user = await this.oauthService.findUserByOAuthId(
      database,
      provider,
      oauthUser.id
    );

    if (!user && oauthUser.email) {
      // Try to find user by email
      user = await this.authService.findUserByUsername(database, oauthUser.email);

      if (user) {
        // Link OAuth account to existing user
        await this.oauthService.linkAccount(database, user.id, provider, oauthUser);
      }
    }

    if (!user) {
      // Create new user
      const userId = await this.authService.createUser(database, {
        username: oauthUser.email || `${provider}_${oauthUser.id}`,
        email: oauthUser.email,
        password: null, // OAuth users don't have passwords initially
        name: oauthUser.name,
      });

      // Link OAuth account
      await this.oauthService.linkAccount(database, userId, provider, oauthUser);

      user = { id: userId, val: oauthUser.email || `${provider}_${oauthUser.id}` };
    }

    // Generate auth tokens
    const token = this.authService.jwt.generateToken({
      userId: user.id,
      username: user.val,
      roleId: user.roleId,
      role: user.role,
      database,
      provider, // Track OAuth provider
    });

    const xsrf = this.authService.jwt.generateXsrf(token, database);

    return {
      token,
      xsrf,
      user: {
        id: user.id,
        username: user.val,
        email: user.email,
        role: user.role,
        provider,
      },
    };
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
 * Create OAuth controller.
 *
 * @param {Object} options - Controller options
 * @returns {OAuthController} Configured controller
 */
export function createOAuthController(options) {
  return new OAuthController(options);
}

// ============================================================================
// Export
// ============================================================================

export default OAuthController;
