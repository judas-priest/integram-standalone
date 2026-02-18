/**
 * @integram/auth-service - JWT Service Tests
 *
 * Tests for JWT token generation, validation, and XSRF handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JWTService, createJWTServiceFromEnv } from '../services/JWTService.js';

describe('@integram/auth-service JWTService', () => {
  let jwtService;

  beforeEach(() => {
    jwtService = new JWTService({
      secret: 'test-secret-key-for-testing',
      expiresIn: 3600, // 1 hour
    });
  });

  describe('constructor', () => {
    it('should require a secret', () => {
      expect(() => new JWTService({})).toThrow('JWT secret is required');
    });

    it('should set default expiration to 24 hours', () => {
      const service = new JWTService({ secret: 'test' });
      expect(service.expiresIn).toBe(86400);
    });

    it('should set default algorithm to HS256', () => {
      const service = new JWTService({ secret: 'test' });
      expect(service.algorithm).toBe('HS256');
    });

    it('should allow custom expiration', () => {
      const service = new JWTService({ secret: 'test', expiresIn: 7200 });
      expect(service.expiresIn).toBe(7200);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = jwtService.generateToken({
        userId: 123,
        username: 'testuser',
        role: 'admin',
        database: 'testdb',
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include payload data in token', () => {
      const payload = {
        userId: 123,
        username: 'testuser',
        role: 'admin',
        database: 'testdb',
      };

      const token = jwtService.generateToken(payload);
      const decoded = jwtService.decodeToken(token);

      expect(decoded.userId).toBe(123);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('admin');
      expect(decoded.database).toBe('testdb');
    });

    it('should include iat, exp, and jti claims', () => {
      const token = jwtService.generateToken({ userId: 1, username: 'test' });
      const decoded = jwtService.decodeToken(token);

      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.jti).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = jwtService.generateToken({
        userId: 123,
        username: 'testuser',
      });

      const payload = jwtService.verifyToken(token);

      expect(payload.userId).toBe(123);
      expect(payload.username).toBe('testuser');
    });

    it('should reject null token', () => {
      expect(() => jwtService.verifyToken(null)).toThrow('Token is required');
    });

    it('should reject non-string token', () => {
      expect(() => jwtService.verifyToken(123)).toThrow('Token is required');
    });

    it('should reject malformed token', () => {
      expect(() => jwtService.verifyToken('invalid')).toThrow('Invalid token format');
      expect(() => jwtService.verifyToken('a.b')).toThrow('Invalid token format');
      expect(() => jwtService.verifyToken('a.b.c.d')).toThrow('Invalid token format');
    });

    it('should reject token with invalid signature', () => {
      const token = jwtService.generateToken({ userId: 1, username: 'test' });
      const [header, payload] = token.split('.');
      const tamperedToken = `${header}.${payload}.invalid_signature`;

      expect(() => jwtService.verifyToken(tamperedToken)).toThrow('Invalid token signature');
    });

    it('should reject token signed with different secret', () => {
      const otherService = new JWTService({ secret: 'different-secret' });
      const token = otherService.generateToken({ userId: 1, username: 'test' });

      expect(() => jwtService.verifyToken(token)).toThrow('Invalid token signature');
    });

    it('should reject expired token', () => {
      // Create a service with very short expiration using the same secret as jwtService
      const shortExpiryService = new JWTService({
        secret: 'test-secret-key-for-testing', // Must match jwtService secret
        expiresIn: -1, // Already expired
      });

      const token = shortExpiryService.generateToken({ userId: 1, username: 'test' });

      expect(() => jwtService.verifyToken(token)).toThrow('Token has expired');
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const token = jwtService.generateToken({
        userId: 123,
        username: 'testuser',
      });

      const decoded = jwtService.decodeToken(token);

      expect(decoded.userId).toBe(123);
      expect(decoded.username).toBe('testuser');
    });

    it('should return null for invalid token', () => {
      expect(jwtService.decodeToken(null)).toBeNull();
      expect(jwtService.decodeToken('')).toBeNull();
      expect(jwtService.decodeToken('invalid')).toBeNull();
    });

    it('should decode token with invalid signature', () => {
      const token = jwtService.generateToken({ userId: 1, username: 'test' });
      const [header, payload] = token.split('.');
      const tamperedToken = `${header}.${payload}.invalid`;

      const decoded = jwtService.decodeToken(tamperedToken);
      expect(decoded.userId).toBe(1);
    });
  });

  describe('refreshToken', () => {
    it('should generate new token with same payload', () => {
      const originalToken = jwtService.generateToken({
        userId: 123,
        username: 'testuser',
        role: 'admin',
      });

      const newToken = jwtService.refreshToken(originalToken);

      expect(newToken).not.toBe(originalToken);

      const decoded = jwtService.verifyToken(newToken);
      expect(decoded.userId).toBe(123);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('admin');
    });

    it('should generate new jti', () => {
      const originalToken = jwtService.generateToken({ userId: 1, username: 'test' });
      const originalDecoded = jwtService.decodeToken(originalToken);

      const newToken = jwtService.refreshToken(originalToken);
      const newDecoded = jwtService.decodeToken(newToken);

      expect(newDecoded.jti).not.toBe(originalDecoded.jti);
    });

    it('should throw for invalid token', () => {
      expect(() => jwtService.refreshToken('invalid.token.here')).toThrow();
    });
  });

  describe('generateLegacyToken', () => {
    it('should generate 32 character hex token', () => {
      const token = jwtService.generateLegacyToken();

      expect(typeof token).toBe('string');
      expect(token).toHaveLength(32);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(jwtService.generateLegacyToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('generateXsrf', () => {
    it('should generate 22 character XSRF token', () => {
      const xsrf = jwtService.generateXsrf('user-token', 'testdb');

      expect(typeof xsrf).toBe('string');
      expect(xsrf).toHaveLength(22);
    });

    it('should generate consistent XSRF for same inputs', () => {
      const xsrf1 = jwtService.generateXsrf('user-token', 'testdb');
      const xsrf2 = jwtService.generateXsrf('user-token', 'testdb');

      expect(xsrf1).toBe(xsrf2);
    });

    it('should generate different XSRF for different tokens', () => {
      const xsrf1 = jwtService.generateXsrf('token-1', 'testdb');
      const xsrf2 = jwtService.generateXsrf('token-2', 'testdb');

      expect(xsrf1).not.toBe(xsrf2);
    });

    it('should generate different XSRF for different databases', () => {
      const xsrf1 = jwtService.generateXsrf('user-token', 'db1');
      const xsrf2 = jwtService.generateXsrf('user-token', 'db2');

      expect(xsrf1).not.toBe(xsrf2);
    });
  });

  describe('verifyXsrf', () => {
    it('should verify valid XSRF', () => {
      const token = 'user-token';
      const database = 'testdb';
      const xsrf = jwtService.generateXsrf(token, database);

      expect(jwtService.verifyXsrf(xsrf, token, database)).toBe(true);
    });

    it('should reject invalid XSRF', () => {
      expect(jwtService.verifyXsrf('invalid', 'token', 'db')).toBe(false);
    });

    it('should reject XSRF with wrong token', () => {
      const xsrf = jwtService.generateXsrf('token-1', 'testdb');
      expect(jwtService.verifyXsrf(xsrf, 'token-2', 'testdb')).toBe(false);
    });

    it('should reject XSRF with wrong database', () => {
      const xsrf = jwtService.generateXsrf('token', 'db1');
      expect(jwtService.verifyXsrf(xsrf, 'token', 'db2')).toBe(false);
    });
  });

  describe('createJWTServiceFromEnv', () => {
    it('should create service from environment variables', () => {
      const originalEnv = { ...process.env };

      process.env.JWT_SECRET = 'env-secret';
      process.env.JWT_EXPIRES_IN = '7200';

      const service = createJWTServiceFromEnv();

      expect(service.secret).toBe('env-secret');
      expect(service.expiresIn).toBe(7200);

      Object.assign(process.env, originalEnv);
    });

    it('should use defaults when env vars not set', () => {
      const originalSecret = process.env.JWT_SECRET;
      const originalExpires = process.env.JWT_EXPIRES_IN;

      delete process.env.JWT_SECRET;
      delete process.env.JWT_EXPIRES_IN;

      const service = createJWTServiceFromEnv();

      expect(service.secret).toBe('default-secret-change-me');
      expect(service.expiresIn).toBe(86400);

      process.env.JWT_SECRET = originalSecret;
      process.env.JWT_EXPIRES_IN = originalExpires;
    });
  });
});
