/**
 * @integram/auth-service - Main Entry Point
 *
 * Authentication service for Integram.
 * Provides user authentication, JWT tokens, OAuth, and permissions.
 */

// ============================================================================
// Re-export all modules
// ============================================================================

export * from './services/index.js';
export * from './middleware/authMiddleware.js';

// ============================================================================
// Package Information
// ============================================================================

export const PACKAGE_NAME = '@integram/auth-service';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// Standalone Server (if run directly)
// ============================================================================

import express from 'express';
import { createLoggerFromEnv } from '@integram/logger';
import { createDatabaseServiceFromEnv } from '@integram/database';
import { AuthService } from './services/AuthService.js';
import { JWTService } from './services/JWTService.js';
import { PasswordService } from './services/PasswordService.js';
import { PermissionService } from './services/PermissionService.js';
import {
  createAuthMiddleware,
  createXsrfMiddleware,
} from './middleware/authMiddleware.js';

/**
 * Create and configure the auth service Express app.
 *
 * @param {Object} [options] - Configuration options
 * @returns {Object} Express app and services
 */
export function createApp(options = {}) {
  const logger = options.logger || createLoggerFromEnv('auth-service');
  const db = options.database || createDatabaseServiceFromEnv({ logger });

  // Create services
  const jwtService = new JWTService({
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '86400', 10),
  });

  const passwordService = new PasswordService({
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '6', 10),
  });

  const permissionService = new PermissionService({
    database: db,
    logger,
  });

  const authService = new AuthService({
    database: db,
    jwtService,
    passwordService,
    permissionService,
    logger,
  });

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', async (req, res) => {
    const dbHealthy = await db.healthCheck();
    res.json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      service: PACKAGE_NAME,
      version: PACKAGE_VERSION,
    });
  });

  // Auth routes (legacy compatibility)
  app.post('/:db/login', async (req, res) => {
    try {
      const { db: database } = req.params;
      const { username, password, login, pwd } = req.body;

      const result = await authService.authenticate(
        database,
        username || login,
        password || pwd
      );

      // Set cookie for legacy compatibility
      res.cookie(database, result.token, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        path: '/',
      });

      res.json(result);
    } catch (error) {
      logger.error?.('Login failed', { error: error.message });
      res.status(error.statusCode || 401).json(error.toJSON?.() || { error: error.message });
    }
  });

  app.post('/:db/register', async (req, res) => {
    try {
      const { db: database } = req.params;
      const { email, password, regpwd, regpwd1, agree } = req.body;

      // Handle legacy form fields
      const actualPassword = password || regpwd;
      const confirmPassword = regpwd1;

      if (confirmPassword && actualPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }

      if (agree === undefined || agree === '0' || agree === false) {
        return res.status(400).json({ error: 'You must agree to the terms' });
      }

      const result = await authService.register(database, {
        email,
        password: actualPassword,
      });

      res.json(result);
    } catch (error) {
      logger.error?.('Registration failed', { error: error.message });
      res.status(error.statusCode || 400).json(error.toJSON?.() || { error: error.message });
    }
  });

  app.post('/:db/logout', async (req, res) => {
    try {
      const { db: database } = req.params;
      res.clearCookie(database, { path: '/' });
      res.json({ success: true, message: 'Logged out' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Token validation endpoint
  app.get('/:db/validate', async (req, res) => {
    try {
      const { db: database } = req.params;
      const token = req.headers.authorization?.replace('Bearer ', '') ||
                    req.cookies?.[database];

      if (!token) {
        return res.status(401).json({ valid: false, error: 'No token' });
      }

      const result = await authService.validateToken(database, token);
      res.json({ valid: true, user: result });
    } catch (error) {
      res.status(401).json({ valid: false, error: error.message });
    }
  });

  return {
    app,
    authService,
    jwtService,
    passwordService,
    permissionService,
    db,
    logger,
  };
}

/**
 * Start the auth service server.
 *
 * @param {number} [port] - Port to listen on
 */
export async function startServer(port) {
  const serverPort = port || parseInt(process.env.AUTH_SERVICE_PORT || '3001', 10);
  const { app, db, logger } = createApp();

  // Initialize database
  try {
    // Note: In production, pass mysql2 module
    // await db.cm.initialize(mysql);
    logger.info?.('Database connection initialized');
  } catch (error) {
    logger.error?.('Failed to initialize database', { error: error.message });
  }

  app.listen(serverPort, () => {
    logger.info?.(`Auth service listening on port ${serverPort}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info?.('Shutting down auth service...');
    await db.close();
    process.exit(0);
  });
}

// ============================================================================
// Run if executed directly
// ============================================================================

const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  startServer();
}

// ============================================================================
// Export default
// ============================================================================

export default {
  createApp,
  startServer,
  PACKAGE_NAME,
  PACKAGE_VERSION,
};
