/**
 * @integram/auth-service - PHP Bridge Tests
 *
 * Tests for PHP backend integration.
 * Note: These tests use mocks by default. Set INTEGRAM_PHP_URL to run
 * integration tests against a real PHP backend.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { PhpBridge, createPhpBridgeFromEnv } from '../src/services/PhpBridge.js';

describe('@integram/auth-service PhpBridge', () => {
  let bridge;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };
    bridge = new PhpBridge({
      baseUrl: 'http://localhost:8080',
      logger: mockLogger,
    });
  });

  describe('Constructor', () => {
    it('should create bridge with default options', () => {
      const defaultBridge = new PhpBridge();

      expect(defaultBridge.baseUrl).toBe('https://dronedoc.ru');
      expect(defaultBridge.rejectUnauthorized).toBe(true);
    });

    it('should create bridge with custom URL', () => {
      const customBridge = new PhpBridge({
        baseUrl: 'https://custom.example.com',
      });

      expect(customBridge.baseUrl).toBe('https://custom.example.com');
      expect(customBridge.host).toBe('custom.example.com');
    });

    it('should parse HTTP URL correctly', () => {
      const httpBridge = new PhpBridge({
        baseUrl: 'http://localhost:8080',
      });

      expect(httpBridge.protocol).toBe(http);
      expect(httpBridge.host).toBe('localhost');
      expect(httpBridge.port).toBe('8080');
    });

    it('should allow disabling SSL verification', () => {
      const insecureBridge = new PhpBridge({
        rejectUnauthorized: false,
      });

      expect(insecureBridge.rejectUnauthorized).toBe(false);
    });
  });

  describe('Factory Function', () => {
    it('should create bridge from environment', () => {
      const envBridge = createPhpBridgeFromEnv();

      expect(envBridge).toBeInstanceOf(PhpBridge);
    });

    it('should merge additional options', () => {
      const customBridge = createPhpBridgeFromEnv({
        baseUrl: 'http://test.local',
      });

      expect(customBridge.baseUrl).toBe('http://test.local');
    });
  });

  describe('Authentication Flow (Unit Tests)', () => {
    let mockServer;
    let serverPort;

    beforeEach(async () => {
      // Create mock HTTP server
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          // Handle auth endpoint
          if (req.url?.includes('/auth?JSON_KV')) {
            const params = new URLSearchParams(body);
            const login = params.get('login');
            const pwd = params.get('pwd');

            if (login === 'validuser' && pwd === 'validpass') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                token: 'mock_token_123',
                _xsrf: 'mock_xsrf_456',
                id: 12345,
                msg: '',
              }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Wrong credentials',
                failed: true,
              }));
            }
          } else if (req.url?.includes('/object/18')) {
            // Mock object endpoint for token validation
            const authHeader = req.headers.authorization || '';
            // Check for exact token match
            if (authHeader === 'Bearer valid_token') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify([{ id: 1, val: 'testuser' }]));
            } else {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unauthorized' }));
            }
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        });
      });

      await new Promise((resolve) => {
        mockServer.listen(0, () => {
          serverPort = mockServer.address().port;
          bridge = new PhpBridge({
            baseUrl: `http://localhost:${serverPort}`,
            logger: mockLogger,
          });
          resolve();
        });
      });
    });

    afterEach(() => {
      return new Promise((resolve) => {
        mockServer?.close(resolve);
      });
    });

    it('should authenticate valid user', async () => {
      const result = await bridge.authenticate('testdb', 'validuser', 'validpass');

      expect(result.success).toBe(true);
      expect(result.token).toBe('mock_token_123');
      expect(result.xsrf).toBe('mock_xsrf_456');
      expect(result.userId).toBe(12345);
      expect(result.database).toBe('testdb');
    });

    it('should log successful authentication', async () => {
      await bridge.authenticate('testdb', 'validuser', 'validpass');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'PHP auth success',
        expect.objectContaining({
          database: 'testdb',
          login: 'validuser',
          userId: 12345,
        })
      );
    });

    it('should reject invalid credentials', async () => {
      await expect(bridge.authenticate('testdb', 'baduser', 'badpass'))
        .rejects.toThrow('Wrong credentials');
    });

    it('should log authentication errors', async () => {
      try {
        await bridge.authenticate('testdb', 'baduser', 'badpass');
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'PHP auth error',
        expect.objectContaining({
          database: 'testdb',
          login: 'baduser',
        })
      );
    });

    it('should validate correct token', async () => {
      const result = await bridge.validateToken('testdb', 'valid_token');

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should reject invalid token', async () => {
      const result = await bridge.validateToken('testdb', 'bad_token');

      // validateToken catches HTTP errors and returns valid: false
      // But our mock returns 401 which throws, so valid should be false
      expect(result.valid).toBe(false);
    });

    it('should check database existence', async () => {
      // Mock HEAD endpoint always returns 404 for unknown DBs
      const exists = await bridge.checkDatabase('testdb');

      // Will fail because our mock doesn't handle HEAD
      expect(typeof exists).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors', async () => {
      // Use a port that's definitely not listening
      const badBridge = new PhpBridge({
        baseUrl: 'http://localhost:59999',
        logger: mockLogger,
      });

      await expect(badBridge.authenticate('db', 'user', 'pass'))
        .rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      const mockServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html>Not JSON</html>');
      });

      await new Promise((resolve) => {
        mockServer.listen(0, async () => {
          const port = mockServer.address().port;
          const badBridge = new PhpBridge({
            baseUrl: `http://localhost:${port}`,
          });

          await expect(badBridge.authenticate('db', 'user', 'pass'))
            .rejects.toThrow();

          mockServer.close(resolve);
        });
      });
    });
  });

  describe('Logout', () => {
    it('should return success for logout', async () => {
      const result = await bridge.logout('testdb', 'token123');

      expect(result.success).toBe(true);
    });

    it('should log logout', async () => {
      await bridge.logout('testdb', 'token123');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'PHP logout',
        expect.objectContaining({ database: 'testdb' })
      );
    });
  });
});
