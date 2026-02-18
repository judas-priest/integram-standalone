/**
 * @integram/auth-service - Routes Index
 *
 * Exports all route factories.
 */

export { createAuthRoutes } from './authRoutes.js';
export { createOAuthRoutes } from './oauthRoutes.js';
export { createTokenRoutes } from './tokenRoutes.js';

/**
 * Create all auth service routes.
 *
 * @param {Object} options - Route options
 * @returns {Object} Object containing all routers
 */
export function createAllRoutes(options) {
  const { createAuthRoutes: authRoutes } = require('./authRoutes.js');
  const { createOAuthRoutes: oauthRoutes } = require('./oauthRoutes.js');
  const { createTokenRoutes: tokenRoutes } = require('./tokenRoutes.js');

  return {
    auth: authRoutes(options),
    oauth: oauthRoutes(options),
    token: tokenRoutes(options),
  };
}
