/**
 * @integram/file-service - FileService
 *
 * Service for handling file uploads, downloads, and management.
 * Maps to PHP: upload.php and file handling in index.php
 */

import fs from 'fs';
import path from 'path';
import { isBlacklistedExtension } from '@integram/common';

// ============================================================================
// FileService Class
// ============================================================================

/**
 * Service for file management operations.
 * Provides upload, download, and file manipulation capabilities
 * with security checks matching PHP behavior.
 */
export class FileService {
  /**
   * Create a new file service.
   *
   * @param {Object} [options] - Service options
   * @param {string} [options.uploadDir='/tmp/uploads'] - Upload directory
   * @param {number} [options.maxFileSize=50*1024*1024] - Max file size in bytes (50MB)
   * @param {string[]} [options.allowedTypes] - Allowed MIME types
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.uploadDir = options.uploadDir || '/tmp/uploads';
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.allowedTypes = options.allowedTypes || null; // null = allow all
    this.logger = options.logger || console;

    // Ensure upload directory exists
    this.ensureDir(this.uploadDir);
  }

  // ============================================================================
  // Directory Management
  // ============================================================================

  /**
   * Ensure a directory exists, creating it if necessary.
   *
   * @param {string} dirPath - Directory path
   */
  ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
      this.logger.info('Created directory', { path: dirPath });
    }
  }

  /**
   * Get subdirectory for file storage based on object ID.
   * Maps to PHP: GetSubdir()
   *
   * @param {number} objectId - Object ID
   * @returns {string} Subdirectory path
   */
  getSubdirectory(objectId) {
    const subDir = Math.floor(objectId / 1000);
    return path.join(this.uploadDir, String(subDir));
  }

  /**
   * Get secure filename based on object ID.
   * Maps to PHP: GetFilename()
   *
   * @param {number} objectId - Object ID
   * @param {string} originalName - Original filename
   * @returns {string} Secure filename
   */
  getSecureFilename(objectId, originalName) {
    const extension = path.extname(originalName).toLowerCase();
    const idPart = String(objectId).padStart(6, '0');
    return `${idPart}${extension}`;
  }

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Validate file before upload.
   * Maps to PHP: BlackList() and file validation
   *
   * @param {Object} file - File object from multer
   * @returns {{ valid: boolean, error?: string }} Validation result
   */
  validateFile(file) {
    // Check if file exists
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File too large. Maximum size is ${Math.round(this.maxFileSize / 1024 / 1024)}MB`,
      };
    }

    // Check extension against blacklist
    const extension = path.extname(file.originalname).toLowerCase().slice(1);
    if (isBlacklistedExtension(extension)) {
      return {
        valid: false,
        error: `File type '${extension}' is not allowed for security reasons`,
      };
    }

    // Check MIME type if allowedTypes is specified
    if (this.allowedTypes && !this.allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type '${file.mimetype}' is not allowed`,
      };
    }

    return { valid: true };
  }

  // ============================================================================
  // Upload Operations
  // ============================================================================

  /**
   * Upload a file.
   * Maps to PHP: upload.php
   *
   * @param {Object} file - File object from multer
   * @param {Object} [options] - Upload options
   * @param {number} [options.objectId] - Object ID for storage organization
   * @param {string} [options.customPath] - Custom storage path
   * @returns {Promise<Object>} Upload result with file info
   */
  async uploadFile(file, options = {}) {
    // Validate file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Determine storage path
    let targetDir = this.uploadDir;
    let filename = file.originalname;

    if (options.objectId) {
      targetDir = this.getSubdirectory(options.objectId);
      filename = this.getSecureFilename(options.objectId, file.originalname);
    } else if (options.customPath) {
      targetDir = path.join(this.uploadDir, options.customPath);
    }

    // Ensure target directory exists
    this.ensureDir(targetDir);

    // Move file to target location
    const targetPath = path.join(targetDir, filename);

    // If file was uploaded via multer with buffer
    if (file.buffer) {
      await fs.promises.writeFile(targetPath, file.buffer);
    }
    // If file was uploaded to temp location
    else if (file.path) {
      await fs.promises.rename(file.path, targetPath);
    }

    this.logger.info('File uploaded', {
      filename,
      path: targetPath,
      size: file.size,
      mimetype: file.mimetype,
    });

    return {
      success: true,
      filename,
      originalName: file.originalname,
      path: targetPath,
      relativePath: path.relative(this.uploadDir, targetPath),
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  // ============================================================================
  // Download Operations
  // ============================================================================

  /**
   * Get file path for download.
   * Maps to PHP: Get_file()
   *
   * @param {string} relativePath - Relative file path
   * @returns {Promise<Object>} File info or null if not found
   */
  async getFile(relativePath) {
    const fullPath = path.join(this.uploadDir, relativePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error('Invalid file path');
    }

    try {
      const stats = await fs.promises.stat(fullPath);

      if (!stats.isFile()) {
        return null;
      }

      return {
        path: fullPath,
        filename: path.basename(fullPath),
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get file by object ID.
   *
   * @param {number} objectId - Object ID
   * @param {string} extension - File extension
   * @returns {Promise<Object|null>} File info or null
   */
  async getFileByObjectId(objectId, extension) {
    const subDir = this.getSubdirectory(objectId);
    const filename = this.getSecureFilename(objectId, `file${extension}`);
    const fullPath = path.join(subDir, filename);

    return this.getFile(path.relative(this.uploadDir, fullPath));
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Delete a file.
   *
   * @param {string} relativePath - Relative file path
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteFile(relativePath) {
    const fullPath = path.join(this.uploadDir, relativePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error('Invalid file path');
    }

    try {
      await fs.promises.unlink(fullPath);
      this.logger.info('File deleted', { path: fullPath });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete directory recursively.
   * Maps to PHP: RemoveDir()
   *
   * @param {string} relativePath - Relative directory path
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteDirectory(relativePath) {
    const fullPath = path.join(this.uploadDir, relativePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(this.uploadDir) || fullPath === this.uploadDir) {
      throw new Error('Invalid directory path');
    }

    try {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
      this.logger.info('Directory deleted', { path: fullPath });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  // ============================================================================
  // List Operations
  // ============================================================================

  /**
   * List files in a directory.
   *
   * @param {string} [relativePath=''] - Relative directory path
   * @param {Object} [options] - List options
   * @param {boolean} [options.recursive=false] - Include subdirectories
   * @returns {Promise<Array>} List of file info objects
   */
  async listFiles(relativePath = '', options = {}) {
    const fullPath = path.join(this.uploadDir, relativePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error('Invalid directory path');
    }

    try {
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      const files = [];

      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        const relPath = path.relative(this.uploadDir, entryPath);

        if (entry.isFile()) {
          const stats = await fs.promises.stat(entryPath);
          files.push({
            name: entry.name,
            path: relPath,
            isDirectory: false,
            size: stats.size,
            mtime: stats.mtime,
          });
        } else if (entry.isDirectory()) {
          files.push({
            name: entry.name,
            path: relPath,
            isDirectory: true,
          });

          if (options.recursive) {
            const subFiles = await this.listFiles(relPath, options);
            files.push(...subFiles);
          }
        }
      }

      return files;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Format file size for display.
   * Maps to PHP: NormalSize()
   *
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
  }

  /**
   * Get MIME type from extension.
   *
   * @param {string} filename - Filename
   * @returns {string} MIME type
   */
  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.gz': 'application/gzip',
      '.tar': 'application/x-tar',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.sql': 'application/sql',
      '.csv': 'text/csv',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}

// ============================================================================
// Export
// ============================================================================

export default FileService;
