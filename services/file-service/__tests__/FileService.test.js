/**
 * @integram/file-service - FileService Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileService } from '../src/services/FileService.js';

// ============================================================================
// Test Setup
// ============================================================================

describe('FileService', () => {
  let fileService;
  let testUploadDir;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testUploadDir = path.join(os.tmpdir(), `integram-test-${Date.now()}`);
    fileService = new FileService({
      uploadDir: testUploadDir,
      logger: { info: () => {}, error: () => {} },
    });
  });

  afterEach(async () => {
    // Clean up test directory
    if (fs.existsSync(testUploadDir)) {
      await fs.promises.rm(testUploadDir, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create upload directory if it does not exist', () => {
      expect(fs.existsSync(testUploadDir)).toBe(true);
    });

    it('should set default options', () => {
      expect(fileService.uploadDir).toBe(testUploadDir);
      expect(fileService.maxFileSize).toBe(50 * 1024 * 1024);
    });

    it('should accept custom options', () => {
      const customService = new FileService({
        uploadDir: testUploadDir,
        maxFileSize: 10 * 1024 * 1024,
        logger: { info: () => {}, error: () => {} },
      });
      expect(customService.maxFileSize).toBe(10 * 1024 * 1024);
    });
  });

  // ============================================================================
  // Subdirectory Tests
  // ============================================================================

  describe('getSubdirectory', () => {
    it('should calculate subdirectory based on object ID', () => {
      expect(fileService.getSubdirectory(0)).toBe(path.join(testUploadDir, '0'));
      expect(fileService.getSubdirectory(999)).toBe(path.join(testUploadDir, '0'));
      expect(fileService.getSubdirectory(1000)).toBe(path.join(testUploadDir, '1'));
      expect(fileService.getSubdirectory(5500)).toBe(path.join(testUploadDir, '5'));
    });
  });

  describe('getSecureFilename', () => {
    it('should generate secure filename with object ID and extension', () => {
      expect(fileService.getSecureFilename(1, 'test.jpg')).toBe('000001.jpg');
      expect(fileService.getSecureFilename(123456, 'file.pdf')).toBe('123456.pdf');
    });

    it('should preserve file extension', () => {
      expect(fileService.getSecureFilename(1, 'test.PNG')).toBe('000001.png');
      expect(fileService.getSecureFilename(1, 'file.SQL')).toBe('000001.sql');
    });
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  describe('validateFile', () => {
    it('should reject missing file', () => {
      const result = fileService.validateFile(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No file provided');
    });

    it('should reject oversized files', () => {
      const file = {
        originalname: 'test.jpg',
        size: 100 * 1024 * 1024, // 100MB
      };
      const result = fileService.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should reject blacklisted extensions', () => {
      const file = {
        originalname: 'malware.php',
        size: 1024,
      };
      const result = fileService.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should accept valid files', () => {
      const file = {
        originalname: 'document.pdf',
        size: 1024,
        mimetype: 'application/pdf',
      };
      const result = fileService.validateFile(file);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Upload Tests
  // ============================================================================

  describe('uploadFile', () => {
    it('should upload file with buffer', async () => {
      const file = {
        originalname: 'test.txt',
        size: 5,
        buffer: Buffer.from('hello'),
        mimetype: 'text/plain',
      };

      const result = await fileService.uploadFile(file);

      expect(result.success).toBe(true);
      expect(result.originalName).toBe('test.txt');
      expect(fs.existsSync(result.path)).toBe(true);

      const content = await fs.promises.readFile(result.path, 'utf8');
      expect(content).toBe('hello');
    });

    it('should organize files by object ID', async () => {
      const file = {
        originalname: 'test.txt',
        size: 5,
        buffer: Buffer.from('hello'),
        mimetype: 'text/plain',
      };

      const result = await fileService.uploadFile(file, { objectId: 1234 });

      expect(result.success).toBe(true);
      expect(result.filename).toBe('001234.txt');
      expect(result.path).toContain('/1/'); // Subdirectory 1 for ID 1234
    });

    it('should reject blacklisted files', async () => {
      const file = {
        originalname: 'script.php',
        size: 5,
        buffer: Buffer.from('<?php'),
        mimetype: 'application/x-php',
      };

      await expect(fileService.uploadFile(file)).rejects.toThrow('not allowed');
    });
  });

  // ============================================================================
  // List Tests
  // ============================================================================

  describe('listFiles', () => {
    beforeEach(async () => {
      // Create some test files
      await fs.promises.writeFile(path.join(testUploadDir, 'file1.txt'), 'test1');
      await fs.promises.writeFile(path.join(testUploadDir, 'file2.txt'), 'test2');
      await fs.promises.mkdir(path.join(testUploadDir, 'subdir'));
      await fs.promises.writeFile(path.join(testUploadDir, 'subdir', 'file3.txt'), 'test3');
    });

    it('should list files in directory', async () => {
      const files = await fileService.listFiles();

      expect(files.length).toBe(3); // file1.txt, file2.txt, subdir
      expect(files.some(f => f.name === 'file1.txt')).toBe(true);
      expect(files.some(f => f.name === 'subdir' && f.isDirectory)).toBe(true);
    });

    it('should list files recursively', async () => {
      const files = await fileService.listFiles('', { recursive: true });

      expect(files.length).toBe(4); // file1.txt, file2.txt, subdir, subdir/file3.txt
      expect(files.some(f => f.name === 'file3.txt')).toBe(true);
    });

    it('should return empty array for non-existent directory', async () => {
      const files = await fileService.listFiles('nonexistent');
      expect(files).toEqual([]);
    });
  });

  // ============================================================================
  // Delete Tests
  // ============================================================================

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      const filePath = path.join(testUploadDir, 'delete-me.txt');
      await fs.promises.writeFile(filePath, 'test');

      const result = await fileService.deleteFile('delete-me.txt');

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should return false for non-existent file', async () => {
      const result = await fileService.deleteFile('nonexistent.txt');
      expect(result).toBe(false);
    });

    it('should prevent directory traversal', async () => {
      await expect(fileService.deleteFile('../../../etc/passwd'))
        .rejects.toThrow('Invalid file path');
    });
  });

  describe('deleteDirectory', () => {
    it('should delete directory recursively', async () => {
      const dirPath = path.join(testUploadDir, 'delete-dir');
      await fs.promises.mkdir(dirPath);
      await fs.promises.writeFile(path.join(dirPath, 'file.txt'), 'test');

      const result = await fileService.deleteDirectory('delete-dir');

      expect(result).toBe(true);
      expect(fs.existsSync(dirPath)).toBe(false);
    });

    it('should prevent deleting root upload directory', async () => {
      await expect(fileService.deleteDirectory(''))
        .rejects.toThrow('Invalid directory path');
    });
  });

  // ============================================================================
  // Utility Tests
  // ============================================================================

  describe('formatSize', () => {
    it('should format bytes correctly', () => {
      expect(fileService.formatSize(0)).toBe('0 B');
      expect(fileService.formatSize(512)).toBe('512 B');
    });

    it('should format kilobytes correctly', () => {
      expect(fileService.formatSize(1024)).toBe('1.00 KB');
      expect(fileService.formatSize(1536)).toBe('1.50 KB');
    });

    it('should format megabytes correctly', () => {
      expect(fileService.formatSize(1024 * 1024)).toBe('1.00 MB');
      expect(fileService.formatSize(5.5 * 1024 * 1024)).toBe('5.50 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(fileService.formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME types', () => {
      expect(fileService.getMimeType('file.txt')).toBe('text/plain');
      expect(fileService.getMimeType('file.pdf')).toBe('application/pdf');
      expect(fileService.getMimeType('file.jpg')).toBe('image/jpeg');
      expect(fileService.getMimeType('file.png')).toBe('image/png');
      expect(fileService.getMimeType('file.sql')).toBe('application/sql');
    });

    it('should return octet-stream for unknown types', () => {
      expect(fileService.getMimeType('file.xyz')).toBe('application/octet-stream');
    });
  });
});
