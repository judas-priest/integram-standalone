/**
 * @integram/file-service - Upload Routes
 *
 * Routes for file upload operations.
 * Maps to PHP: upload.php
 */

import { Router } from 'express';
import multer from 'multer';

// ============================================================================
// Create Upload Routes
// ============================================================================

/**
 * Create file upload routes.
 *
 * @param {Object} options - Route options
 * @param {FileService} options.fileService - File service instance
 * @param {Object} [options.logger] - Logger instance
 * @returns {Router} Express router
 */
export function createUploadRoutes(options) {
  const router = Router();
  const { fileService, logger = console } = options;

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: fileService.maxFileSize,
    },
  });

  // ============================================================================
  // Upload Single File
  // POST /upload
  // ============================================================================

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      const result = await fileService.uploadFile(file, {
        objectId: req.body.objectId ? parseInt(req.body.objectId, 10) : undefined,
        customPath: req.body.path,
      });

      logger.info('File uploaded via API', { filename: result.filename });

      res.json({
        success: true,
        message: `File ${result.originalName} uploaded successfully`,
        file: {
          filename: result.filename,
          originalName: result.originalName,
          path: result.relativePath,
          size: result.size,
          sizeFormatted: fileService.formatSize(result.size),
          mimetype: result.mimetype,
        },
      });
    } catch (error) {
      logger.error('Upload failed', { error: error.message });
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  // ============================================================================
  // Upload Multiple Files
  // POST /upload/multiple
  // ============================================================================

  router.post('/upload/multiple', upload.array('files', 10), async (req, res) => {
    try {
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded',
        });
      }

      const results = [];
      const errors = [];

      for (const file of files) {
        try {
          const result = await fileService.uploadFile(file, {
            customPath: req.body.path,
          });
          results.push({
            filename: result.filename,
            originalName: result.originalName,
            path: result.relativePath,
            size: result.size,
          });
        } catch (error) {
          errors.push({
            originalName: file.originalname,
            error: error.message,
          });
        }
      }

      res.json({
        success: errors.length === 0,
        message: `${results.length} files uploaded, ${errors.length} failed`,
        files: results,
        errors,
      });
    } catch (error) {
      logger.error('Multiple upload failed', { error: error.message });
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  // ============================================================================
  // Download File
  // GET /download/:path(*)
  // ============================================================================

  router.get('/download/*', async (req, res) => {
    try {
      const filePath = req.params[0];
      const fileInfo = await fileService.getFile(filePath);

      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          message: 'File not found',
        });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
      res.setHeader('Content-Type', fileService.getMimeType(fileInfo.filename));
      res.setHeader('Content-Length', fileInfo.size);

      res.sendFile(fileInfo.path);
    } catch (error) {
      logger.error('Download failed', { error: error.message });
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  // ============================================================================
  // List Files
  // GET /files/:path(*)
  // ============================================================================

  router.get('/files', async (req, res) => {
    try {
      const { recursive } = req.query;
      const files = await fileService.listFiles('', { recursive: recursive === 'true' });

      res.json({
        success: true,
        files,
        count: files.length,
      });
    } catch (error) {
      logger.error('List files failed', { error: error.message });
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  router.get('/files/*', async (req, res) => {
    try {
      const dirPath = req.params[0];
      const { recursive } = req.query;
      const files = await fileService.listFiles(dirPath, { recursive: recursive === 'true' });

      res.json({
        success: true,
        path: dirPath,
        files,
        count: files.length,
      });
    } catch (error) {
      logger.error('List files failed', { error: error.message });
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  // ============================================================================
  // Delete File
  // DELETE /files/:path(*)
  // ============================================================================

  router.delete('/files/*', async (req, res) => {
    try {
      const filePath = req.params[0];
      const deleted = await fileService.deleteFile(filePath);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'File not found',
        });
      }

      res.json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error) {
      logger.error('Delete failed', { error: error.message });
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  return router;
}

// ============================================================================
// Export
// ============================================================================

export default createUploadRoutes;
