/**
 * @integram/auth-service - Auth Controller Tests
 *
 * Tests for AuthController.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from '../src/controllers/AuthController.js';

// Mock auth service
const createMockAuthService = () => ({
  authenticate: vi.fn(),
  authenticateWithJWT: vi.fn(),
  confirmPassword: vi.fn(),
  register: vi.fn(),
  validateToken: vi.fn(),
  logout: vi.fn(),
  getOneTimeCode: vi.fn(),
  verifyOneTimeCode: vi.fn(),
  jwt: {
    refreshToken: vi.fn(),
  },
});

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

// Mock request/response
const createMockRequest = (options = {}) => ({
  params: options.params || { db: 'test' },
  body: options.body || {},
  query: options.query || {},
  headers: options.headers || {},
  cookies: options.cookies || {},
  user: options.user,
});

const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('AuthController', () => {
  let controller;
  let authService;
  let logger;

  beforeEach(() => {
    authService = createMockAuthService();
    logger = createMockLogger();
    controller = new AuthController({
      authService,
      logger,
    });
  });

  describe('login', () => {
    it('should authenticate with username and password', async () => {
      const req = createMockRequest({
        body: { username: 'testuser', password: 'testpass' },
      });
      const res = createMockResponse();

      authService.authenticate.mockResolvedValue({
        success: true,
        token: 'test-token',
        xsrf: 'test-xsrf',
        user: { id: 1, username: 'testuser', role: 'user' },
        grants: {},
      });

      await controller.login(req, res);

      expect(authService.authenticate).toHaveBeenCalledWith('test', 'testuser', 'testpass');
      expect(res.cookie).toHaveBeenCalledWith('test', 'test-token', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: 'test-token',
      }));
    });

    it('should support legacy login field names', async () => {
      const req = createMockRequest({
        body: { login: 'testuser', pwd: 'testpass' },
      });
      const res = createMockResponse();

      authService.authenticate.mockResolvedValue({
        success: true,
        token: 'test-token',
        xsrf: 'test-xsrf',
        user: { id: 1 },
        grants: {},
      });

      await controller.login(req, res);

      expect(authService.authenticate).toHaveBeenCalledWith('test', 'testuser', 'testpass');
    });

    it('should return 400 for missing credentials', async () => {
      const req = createMockRequest({
        body: { username: 'testuser' }, // Missing password
      });
      const res = createMockResponse();

      await controller.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_CREDENTIALS',
      }));
    });

    it('should handle authentication errors', async () => {
      const req = createMockRequest({
        body: { username: 'testuser', password: 'wrongpass' },
      });
      const res = createMockResponse();

      const error = new Error('Invalid password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      error.toJSON = () => ({ error: 'Invalid password', code: 'INVALID_CREDENTIALS' });
      authService.authenticate.mockRejectedValue(error);

      await controller.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('should register with email and password', async () => {
      const req = createMockRequest({
        body: { email: 'test@example.com', password: 'testpass123' },
      });
      const res = createMockResponse();

      authService.register.mockResolvedValue({
        success: true,
        userId: 123,
        message: 'Registration successful',
      });

      await controller.register(req, res);

      expect(authService.register).toHaveBeenCalledWith('test', {
        email: 'test@example.com',
        password: 'testpass123',
        name: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        userId: 123,
      }));
    });

    it('should support legacy registration field names', async () => {
      const req = createMockRequest({
        body: {
          email: 'test@example.com',
          regpwd: 'testpass123',
          regpwd1: 'testpass123',
          agree: '1',
        },
      });
      const res = createMockResponse();

      authService.register.mockResolvedValue({
        success: true,
        userId: 123,
      });

      await controller.register(req, res);

      expect(authService.register).toHaveBeenCalledWith('test', expect.objectContaining({
        email: 'test@example.com',
        password: 'testpass123',
      }));
    });

    it('should return 400 for password mismatch', async () => {
      const req = createMockRequest({
        body: {
          email: 'test@example.com',
          regpwd: 'testpass123',
          regpwd1: 'differentpass',
        },
      });
      const res = createMockResponse();

      await controller.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'PASSWORD_MISMATCH',
      }));
    });

    it('should return 400 for missing email', async () => {
      const req = createMockRequest({
        body: { password: 'testpass123' },
      });
      const res = createMockResponse();

      await controller.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_EMAIL',
      }));
    });
  });

  describe('logout', () => {
    it('should clear cookies on logout', async () => {
      const req = createMockRequest({
        user: { userId: 1 },
      });
      const res = createMockResponse();

      await controller.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('test', expect.any(Object));
      expect(res.clearCookie).toHaveBeenCalledWith('test_xsrf', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
      }));
    });
  });

  describe('validate', () => {
    it('should validate token from authorization header', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer test-token' },
      });
      const res = createMockResponse();

      authService.validateToken.mockResolvedValue({
        userId: 1,
        username: 'testuser',
        role: 'user',
        roleId: 115,
        grants: {},
      });

      await controller.validate(req, res);

      expect(authService.validateToken).toHaveBeenCalledWith('test', 'test-token');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        valid: true,
        user: expect.objectContaining({
          id: 1,
          username: 'testuser',
        }),
      }));
    });

    it('should validate token from cookie', async () => {
      const req = createMockRequest({
        cookies: { test: 'cookie-token' },
      });
      const res = createMockResponse();

      authService.validateToken.mockResolvedValue({
        userId: 1,
        username: 'testuser',
        role: 'user',
        roleId: 115,
        grants: {},
      });

      await controller.validate(req, res);

      expect(authService.validateToken).toHaveBeenCalledWith('test', 'cookie-token');
    });

    it('should return 401 for missing token', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.validate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        valid: false,
        code: 'NO_TOKEN',
      }));
    });

    it('should handle invalid token', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = createMockResponse();

      const error = new Error('Invalid token');
      error.code = 'INVALID_TOKEN';
      authService.validateToken.mockRejectedValue(error);

      await controller.validate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        valid: false,
      }));
    });
  });

  describe('refreshToken', () => {
    it('should refresh valid token', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer old-token' },
      });
      const res = createMockResponse();

      authService.jwt.refreshToken.mockReturnValue('new-token');

      await controller.refreshToken(req, res);

      expect(authService.jwt.refreshToken).toHaveBeenCalledWith('old-token');
      expect(res.cookie).toHaveBeenCalledWith('test', 'new-token', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: 'new-token',
      }));
    });
  });

  describe('jwtAuth', () => {
    it('should authenticate with external JWT token', async () => {
      const req = createMockRequest({
        body: { jwt: 'external-jwt-token' },
      });
      const res = createMockResponse();

      authService.authenticateWithJWT.mockResolvedValue({
        success: true,
        token: 'session-token',
        xsrf: 'xsrf-token',
        user: { id: 1, username: 'testuser' },
      });

      await controller.jwtAuth(req, res);

      expect(authService.authenticateWithJWT).toHaveBeenCalledWith('test', 'external-jwt-token');
      expect(res.cookie).toHaveBeenCalledWith('test', 'session-token', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: 'session-token',
      }));
    });

    it('should return 400 for missing JWT token', async () => {
      const req = createMockRequest({
        body: {},
      });
      const res = createMockResponse();

      await controller.jwtAuth(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_JWT',
      }));
    });

    it('should handle JWT verification failure', async () => {
      const req = createMockRequest({
        body: { jwt: 'invalid-jwt' },
      });
      const res = createMockResponse();

      authService.authenticateWithJWT.mockRejectedValue(new Error('JWT verification failed'));

      await controller.jwtAuth(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'JWT verification failed',
      }));
    });
  });

  describe('confirmPassword', () => {
    it('should confirm password change and login user', async () => {
      const req = createMockRequest({
        body: { u: 'user@test.com', o: 'old-hash', p: 'new-hash' },
      });
      const res = createMockResponse();

      authService.confirmPassword.mockResolvedValue({
        success: true,
        token: 'new-token',
        xsrf: 'new-xsrf',
      });

      await controller.confirmPassword(req, res);

      expect(authService.confirmPassword).toHaveBeenCalledWith(
        'test',
        'user@test.com',
        'old-hash',
        'new-hash'
      );
      expect(res.cookie).toHaveBeenCalledWith('test', 'new-token', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: 'new-token',
      }));
    });

    it('should return 400 for missing parameters', async () => {
      const req = createMockRequest({
        body: { u: 'user@test.com' }, // Missing o and p
      });
      const res = createMockResponse();

      await controller.confirmPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_PARAMS',
      }));
    });

    it('should handle obsolete password (old password does not match)', async () => {
      const req = createMockRequest({
        body: { u: 'user@test.com', o: 'wrong-hash', p: 'new-hash' },
      });
      const res = createMockResponse();

      authService.confirmPassword.mockResolvedValue(null);

      await controller.confirmPassword(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'obsolete',
      }));
    });

    it('should support query parameters', async () => {
      const req = createMockRequest({
        query: { u: 'user@test.com', o: 'old-hash', p: 'new-hash' },
        body: {},
      });
      const res = createMockResponse();

      authService.confirmPassword.mockResolvedValue({
        success: true,
        token: 'new-token',
        xsrf: 'new-xsrf',
      });

      await controller.confirmPassword(req, res);

      expect(authService.confirmPassword).toHaveBeenCalledWith(
        'test',
        'user@test.com',
        'old-hash',
        'new-hash'
      );
    });
  });
});
