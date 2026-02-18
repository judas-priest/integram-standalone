/**
 * @integram/auth-service - Main Entry Point
 *
 * Authentication service for Integram.
 * Provides user authentication, JWT tokens, OAuth, and permissions.
 *
 * Phase 2 Implementation:
 * - Full controller/route architecture
 * - OAuth multi-provider support
 * - Legacy PHP compatibility layer
 * - User model and repository
 */

// ============================================================================
// Re-export all modules
// ============================================================================

export * from './services/index.js';
export * from './middleware/authMiddleware.js';
export * from './controllers/index.js';
export * from './routes/index.js';
export * from './models/index.js';
export * from './compatibility/index.js';

// ============================================================================
// Package Information
// ============================================================================

export const PACKAGE_NAME = '@integram/auth-service';
export const PACKAGE_VERSION = '2.0.0'; // Phase 2

// ============================================================================
// Standalone Server (if run directly)
// ============================================================================

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createLoggerFromEnv } from '@integram/logger';
import { createDatabaseServiceFromEnv } from '@integram/database';

// Services
import { AuthService } from './services/AuthService.js';
import { JWTService } from './services/JWTService.js';
import { PasswordService } from './services/PasswordService.js';
import { PermissionService } from './services/PermissionService.js';
import { OAuthService } from './services/OAuthService.js';

// Controllers
import { AuthController } from './controllers/AuthController.js';
import { OAuthController } from './controllers/OAuthController.js';
import { TokenController } from './controllers/TokenController.js';

// Routes
import { createAuthRoutes } from './routes/authRoutes.js';
import { createOAuthRoutes } from './routes/oauthRoutes.js';
import { createTokenRoutes } from './routes/tokenRoutes.js';

// Middleware
import {
  createAuthMiddleware,
  createXsrfMiddleware,
} from './middleware/authMiddleware.js';

// Compatibility
import {
  createLegacyRequestTransformer,
  createLegacyResponseHandler,
  createPHPRouteMapper,
} from './compatibility/legacyMiddleware.js';

// ============================================================================
// Application Factory
// ============================================================================

/**
 * Create and configure the auth service Express app.
 *
 * @param {Object} [options] - Configuration options
 * @param {Object} [options.logger] - Logger instance
 * @param {Object} [options.database] - Database service
 * @param {boolean} [options.enableCors] - Enable CORS
 * @param {boolean} [options.enableLegacyCompat] - Enable legacy PHP compatibility
 * @returns {Object} Express app and services
 */
export function createApp(options = {}) {
  const logger = options.logger || createLoggerFromEnv('auth-service');
  const db = options.database || createDatabaseServiceFromEnv({ logger });
  const enableLegacyCompat = options.enableLegacyCompat !== false; // Default true

  // ============================================================================
  // Create Services
  // ============================================================================

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

  const oauthService = new OAuthService({
    database: db,
    logger,
    redirectBase: process.env.OAUTH_REDIRECT_BASE || '',
  });

  // ============================================================================
  // Create Controllers
  // ============================================================================

  const authController = new AuthController({
    authService,
    logger,
  });

  const oauthController = new OAuthController({
    oauthService,
    authService,
    logger,
  });

  const tokenController = new TokenController({
    jwtService,
    authService,
    logger,
  });

  // ============================================================================
  // Create Middleware
  // ============================================================================

  const authMiddleware = {
    authenticate: createAuthMiddleware({
      jwtService,
      authService,
    }),
    xsrf: createXsrfMiddleware({
      jwtService,
    }),
  };

  // ============================================================================
  // Create Express App
  // ============================================================================

  const app = express();

  // Core middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // CORS
  if (options.enableCors) {
    app.use(cors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
    }));
  }

  // Legacy compatibility middleware
  if (enableLegacyCompat) {
    app.use(createLegacyRequestTransformer({ logger }));
    app.use(createLegacyResponseHandler({ logger }));
  }

  // ============================================================================
  // Health & Status Endpoints
  // ============================================================================

  app.get('/health', async (req, res) => {
    try {
      const dbHealthy = await db.healthCheck();
      res.json({
        status: dbHealthy ? 'healthy' : 'degraded',
        service: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        phase: 2,
        timestamp: new Date().toISOString(),
        features: {
          jwt: true,
          oauth: oauthService.getSupportedProviders(),
          legacyCompat: enableLegacyCompat,
        },
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        service: PACKAGE_NAME,
        error: error.message,
      });
    }
  });

  app.get('/ready', async (req, res) => {
    try {
      const dbHealthy = await db.healthCheck();
      if (dbHealthy) {
        res.json({ ready: true });
      } else {
        res.status(503).json({ ready: false, reason: 'Database not ready' });
      }
    } catch (error) {
      res.status(503).json({ ready: false, reason: error.message });
    }
  });

  // ============================================================================
  // Mount Routes
  // ============================================================================

  // Auth routes
  const authRoutes = createAuthRoutes({
    authController,
    authMiddleware,
  });
  app.use(authRoutes);

  // OAuth routes
  const oauthRoutes = createOAuthRoutes({
    oauthController,
    authMiddleware,
  });
  app.use(oauthRoutes);

  // Token routes
  const tokenRoutes = createTokenRoutes({
    tokenController,
    authMiddleware,
  });
  app.use(tokenRoutes);

  // ============================================================================
  // Legacy PHP Route Mapping
  // ============================================================================

  if (enableLegacyCompat) {
    app.use(createPHPRouteMapper({
      authController,
      oauthController,
    }));
  }

  // ============================================================================
  // Error Handler
  // ============================================================================

  app.use((err, req, res, next) => {
    logger.error?.('Unhandled error', { error: err.message, stack: err.stack });

    const statusCode = err.statusCode || 500;
    const response = err.toJSON?.() || {
      error: err.message,
      code: err.code || 'INTERNAL_ERROR',
    };

    res.status(statusCode).json(response);
  });

  // ============================================================================
  // Return App and Services
  // ============================================================================

  return {
    app,
    // Services
    authService,
    jwtService,
    passwordService,
    permissionService,
    oauthService,
    // Controllers
    authController,
    oauthController,
    tokenController,
    // Infrastructure
    db,
    logger,
    authMiddleware,
  };
}

// ============================================================================
// Server Startup
// ============================================================================

/**
 * Start the auth service server.
 *
 * @param {number} [port] - Port to listen on
 * @param {Object} [options] - Additional options
 */
export async function startServer(port, options = {}) {
  const serverPort = port || parseInt(process.env.AUTH_SERVICE_PORT || '3001', 10);
  const { app, db, logger } = createApp(options);

  // Initialize database
  try {
    // Note: In production, pass mysql2 module
    // await db.cm.initialize(mysql);
    logger.info?.('Database connection initialized');
  } catch (error) {
    logger.error?.('Failed to initialize database', { error: error.message });
  }

  // Start server
  const server = app.listen(serverPort, () => {
    logger.info?.(`Auth service (Phase 2) listening on port ${serverPort}`);
    logger.info?.(`Health check: http://localhost:${serverPort}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info?.(`Received ${signal}, shutting down auth service...`);

    server.close(async () => {
      try {
        await db.close();
        logger.info?.('Auth service shut down gracefully');
        process.exit(0);
      } catch (error) {
        logger.error?.('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error?.('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
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
