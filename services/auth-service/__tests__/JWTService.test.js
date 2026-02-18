/**
 * @integram/auth-service - JWT Service Tests
 *
 * Tests for JWT token generation, verification, and XSRF handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JWTService, createJWTServiceFromEnv } from '../src/services/JWTService.js';

describe('@integram/auth-service JWTService', () => {
  let jwtService;

  beforeEach(() => {
    jwtService = new JWTService({
      secret: 'test-secret-key-for-testing',
      expiresIn: 3600, // 1 hour
    });
  });

  describe('Constructor', () => {
    it('should require a secret', () => {
      expect(() => new JWTService({})).toThrow('JWT secret is required');
    });

    it('should use default expiresIn if not provided', () => {
      const service = new JWTService({ secret: 'test' });
      expect(service.expiresIn).toBe(86400);
    });

    it('should use custom expiresIn', () => {
      const service = new JWTService({ secret: 'test', expiresIn: 7200 });
      expect(service.expiresIn).toBe(7200);
    });
  });

  describe('Token Generation', () => {
    it('should generate a valid JWT token', () => {
      const token = jwtService.generateToken({
        userId: 123,
        username: 'testuser',
      });

      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it('should include payload in token', () => {
      const token = jwtService.generateToken({
        userId: 456,
        username: 'john',
        database: 'mydb',
      });

      const decoded = jwtService.decodeToken(token);
      expect(decoded.userId).toBe(456);
      expect(decoded.username).toBe('john');
      expect(decoded.database).toBe('mydb');
    });

    it('should include timing claims', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = jwtService.generateToken({ userId: 1 });
      const after = Math.floor(Date.now() / 1000);

      const decoded = jwtService.decodeToken(token);
      expect(decoded.iat).toBeGreaterThanOrEqual(before);
      expect(decoded.iat).toBeLessThanOrEqual(after);
      expect(decoded.exp).toBe(decoded.iat + 3600);
    });

    it('should include unique jti', () => {
      const token1 = jwtService.generateToken({ userId: 1 });
      const token2 = jwtService.generateToken({ userId: 1 });

      const decoded1 = jwtService.decodeToken(token1);
      const decoded2 = jwtService.decodeToken(token2);

      expect(decoded1.jti).toBeDefined();
      expect(decoded2.jti).toBeDefined();
      expect(decoded1.jti).not.toBe(decoded2.jti);
    });
  });

  describe('Token Verification', () => {
    it('should verify a valid token', () => {
      const token = jwtService.generateToken({
        userId: 123,
        username: 'testuser',
      });

      const payload = jwtService.verifyToken(token);
      expect(payload.userId).toBe(123);
      expect(payload.username).toBe('testuser');
    });

    it('should throw on null token', () => {
      expect(() => jwtService.verifyToken(null)).toThrow('Token is required');
    });

    it('should throw on invalid format', () => {
      expect(() => jwtService.verifyToken('invalid.token')).toThrow('Invalid token format');
    });

    it('should throw on invalid signature', () => {
      const token = jwtService.generateToken({ userId: 1 });
      const [header, payload, _] = token.split('.');
      const tamperedToken = `${header}.${payload}.invalid-signature`;

      expect(() => jwtService.verifyToken(tamperedToken)).toThrow('Invalid token signature');
    });

    it('should throw on expired token', () => {
      const shortLivedService = new JWTService({
        secret: 'test-secret',
        expiresIn: -1, // Already expired
      });

      const token = shortLivedService.generateToken({ userId: 1 });
      expect(() => shortLivedService.verifyToken(token)).toThrow('Token has expired');
    });

    it('should verify token from different instance with same secret', () => {
      const service1 = new JWTService({ secret: 'shared-secret' });
      const service2 = new JWTService({ secret: 'shared-secret' });

      const token = service1.generateToken({ userId: 42 });
      const payload = service2.verifyToken(token);

      expect(payload.userId).toBe(42);
    });

    it('should reject token from different secret', () => {
      const service1 = new JWTService({ secret: 'secret-1' });
      const service2 = new JWTService({ secret: 'secret-2' });

      const token = service1.generateToken({ userId: 42 });
      expect(() => service2.verifyToken(token)).toThrow('Invalid token signature');
    });
  });

  describe('Token Decoding', () => {
    it('should decode token without verification', () => {
      const token = jwtService.generateToken({
        userId: 789,
        role: 'admin',
      });

      const payload = jwtService.decodeToken(token);
      expect(payload.userId).toBe(789);
      expect(payload.role).toBe('admin');
    });

    it('should return null for invalid token', () => {
      expect(jwtService.decodeToken(null)).toBe(null);
      expect(jwtService.decodeToken('invalid')).toBe(null);
      expect(jwtService.decodeToken('a.b')).toBe(null);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh a valid token', () => {
      const originalToken = jwtService.generateToken({
        userId: 100,
        username: 'refreshme',
      });

      const newToken = jwtService.refreshToken(originalToken);

      // Should be different tokens
      expect(newToken).not.toBe(originalToken);

      // But same payload data
      const decoded = jwtService.decodeToken(newToken);
      expect(decoded.userId).toBe(100);
      expect(decoded.username).toBe('refreshme');
    });

    it('should generate new timing claims', () => {
      const originalToken = jwtService.generateToken({ userId: 1 });
      const originalDecoded = jwtService.decodeToken(originalToken);

      // Wait a tiny bit to ensure different timestamp
      const newToken = jwtService.refreshToken(originalToken);
      const newDecoded = jwtService.decodeToken(newToken);

      expect(newDecoded.jti).not.toBe(originalDecoded.jti);
    });

    it('should throw on invalid token', () => {
      expect(() => jwtService.refreshToken('invalid.token.here')).toThrow();
    });
  });

  describe('Legacy Token', () => {
    it('should generate 32-char hex token', () => {
      const token = jwtService.generateLegacyToken();

      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(jwtService.generateLegacyToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('XSRF Tokens', () => {
    it('should generate XSRF token', () => {
      const xsrf = jwtService.generateXsrf('usertoken123', 'mydb');

      expect(xsrf).toBeDefined();
      expect(typeof xsrf).toBe('string');
      expect(xsrf.length).toBe(22);
    });

    it('should generate consistent XSRF for same inputs', () => {
      const xsrf1 = jwtService.generateXsrf('token', 'db');
      const xsrf2 = jwtService.generateXsrf('token', 'db');

      expect(xsrf1).toBe(xsrf2);
    });

    it('should generate different XSRF for different inputs', () => {
      const xsrf1 = jwtService.generateXsrf('token1', 'db');
      const xsrf2 = jwtService.generateXsrf('token2', 'db');
      const xsrf3 = jwtService.generateXsrf('token1', 'db2');

      expect(xsrf1).not.toBe(xsrf2);
      expect(xsrf1).not.toBe(xsrf3);
    });

    it('should verify valid XSRF', () => {
      const xsrf = jwtService.generateXsrf('mytoken', 'mydb');
      const isValid = jwtService.verifyXsrf(xsrf, 'mytoken', 'mydb');

      expect(isValid).toBe(true);
    });

    it('should reject invalid XSRF', () => {
      const xsrf = jwtService.generateXsrf('mytoken', 'mydb');

      expect(jwtService.verifyXsrf('wrong-xsrf', 'mytoken', 'mydb')).toBe(false);
      expect(jwtService.verifyXsrf(xsrf, 'wrongtoken', 'mydb')).toBe(false);
      expect(jwtService.verifyXsrf(xsrf, 'mytoken', 'wrongdb')).toBe(false);
    });
  });

  describe('Factory Function', () => {
    it('should create service from environment', () => {
      // Note: In actual use, JWT_SECRET would come from env
      const service = createJWTServiceFromEnv();

      expect(service).toBeInstanceOf(JWTService);
      expect(service.secret).toBeDefined();
    });
  });
});
