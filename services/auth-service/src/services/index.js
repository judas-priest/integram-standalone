/**
 * @integram/auth-service - Services Index
 *
 * Export all auth service modules.
 */

export { default as AuthService, createAuthService } from './AuthService.js';
export { default as JWTService, createJWTServiceFromEnv } from './JWTService.js';
export { default as PasswordService, createPasswordService } from './PasswordService.js';
export { default as PermissionService, createPermissionService } from './PermissionService.js';
export { default as PhpBridge, createPhpBridgeFromEnv } from './PhpBridge.js';
export { default as OAuthService, createOAuthService } from './OAuthService.js';

export default {
  AuthService,
  JWTService,
  PasswordService,
  PermissionService,
  PhpBridge,
  OAuthService,
};
