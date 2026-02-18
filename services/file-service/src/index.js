/**
 * @integram/file-service - Main Entry Point
 *
 * File upload and download service for Integram.
 * Provides file management with security checks matching PHP behavior.
 */

import express from 'express';

// ============================================================================
// Re-export Services
// ============================================================================

export * from './services/index.js';
export * from './routes/index.js';

// ============================================================================
// Import Services
// ============================================================================

import { FileService } from './services/FileService.js';
import { createUploadRoutes } from './routes/uploadRoutes.js';

// ============================================================================
// Package Information
// ============================================================================

export const PACKAGE_NAME = '@integram/file-service';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a file service instance.
 *
 * @param {Object} [options] - Service options
 * @returns {FileService} File service instance
 */
export function createFileService(options = {}) {
  return new FileService(options);
}

/**
 * Create an Express app for the file service.
 *
 * @param {Object} [options] - Service options
 * @param {string} [options.uploadDir] - Upload directory
 * @param {number} [options.maxFileSize] - Max file size
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Application} Express app
 */
export function createApp(options = {}) {
  const app = express();
  const logger = options.logger || console;
  const fileService = createFileService(options);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      uploadDir: fileService.uploadDir,
      maxFileSize: fileService.formatSize(fileService.maxFileSize),
      timestamp: new Date().toISOString(),
    });
  });

  // Mount routes
  app.use('/api', createUploadRoutes({ fileService, logger }));

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
      },
    });
  });

  return app;
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  // Classes
  FileService,

  // Factory functions
  createFileService,
  createApp,
  createUploadRoutes,

  // Package info
  PACKAGE_NAME,
  PACKAGE_VERSION,
};
