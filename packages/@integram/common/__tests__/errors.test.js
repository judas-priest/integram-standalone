/**
 * @integram/common - Errors Tests
 */

import { describe, it, expect } from 'vitest';
import {
  IntegramError,
  AuthenticationError,
  TokenError,
  AuthorizationError,
  GrantError,
  ValidationError,
  InvalidDbNameError,
  DatabaseError,
  DatabaseNotFoundError,
  ObjectNotFoundError,
  DuplicateError,
  EmailExistsError,
  PasswordError,
} from '../errors/index.js';

describe('@integram/common errors', () => {
  describe('IntegramError', () => {
    it('should create error with message', () => {
      const error = new IntegramError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('INTEGRAM_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should create error with custom code and status', () => {
      const error = new IntegramError('Test', 'CUSTOM_CODE', 400);
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(400);
    });

    it('should have toJSON method', () => {
      const error = new IntegramError('Test');
      const json = error.toJSON();
      expect(json.error).toBe('Test');
      expect(json.code).toBe('INTEGRAM_ERROR');
      expect(json.timestamp).toBeDefined();
    });

    it('should have toLegacyFormat method', () => {
      const error = new IntegramError('Test');
      const legacy = error.toLegacyFormat();
      expect(legacy).toEqual([{ error: 'Test' }]);
    });
  });

  describe('AuthenticationError', () => {
    it('should have correct status code', () => {
      const error = new AuthenticationError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTH_ERROR');
    });
  });

  describe('TokenError', () => {
    it('should have correct properties', () => {
      const error = new TokenError('Invalid token');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('TOKEN_ERROR');
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should have correct status code', () => {
      const error = new AuthorizationError();
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHZ_ERROR');
    });
  });

  describe('GrantError', () => {
    it('should include object and type info', () => {
      const error = new GrantError(123, 18, 'WRITE');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('GRANT_ERROR');
      expect(error.details.objectId).toBe(123);
      expect(error.details.typeId).toBe(18);
      expect(error.details.requiredGrant).toBe('WRITE');
    });
  });

  describe('ValidationError', () => {
    it('should have correct status code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('InvalidDbNameError', () => {
    it('should include database name', () => {
      const error = new InvalidDbNameError('bad-db');
      expect(error.details.fields.dbName).toBe('bad-db');
      expect(error.code).toBe('INVALID_DB_NAME');
    });
  });

  describe('DatabaseError', () => {
    it('should include query info', () => {
      const error = new DatabaseError('Query failed', 'SELECT * FROM test');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DB_ERROR');
      expect(error.details.query).toBe('SELECT * FROM test');
    });
  });

  describe('DatabaseNotFoundError', () => {
    it('should have correct status code', () => {
      const error = new DatabaseNotFoundError('mydb');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('DB_NOT_FOUND');
      expect(error.details.dbName).toBe('mydb');
    });
  });

  describe('ObjectNotFoundError', () => {
    it('should include object info', () => {
      const error = new ObjectNotFoundError(123, 18);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('OBJECT_NOT_FOUND');
      expect(error.details.objectId).toBe(123);
      expect(error.details.typeId).toBe(18);
    });
  });

  describe('DuplicateError', () => {
    it('should include field info', () => {
      const error = new DuplicateError('email', 'test@example.com');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('DUPLICATE_ERROR');
      expect(error.details.field).toBe('email');
      expect(error.details.value).toBe('test@example.com');
    });
  });

  describe('EmailExistsError', () => {
    it('should have correct message', () => {
      const error = new EmailExistsError('test@example.com');
      expect(error.message).toContain('already registered');
      expect(error.code).toBe('EMAIL_EXISTS');
    });
  });

  describe('PasswordError', () => {
    it('should have correct code', () => {
      const error = new PasswordError('Too short');
      expect(error.code).toBe('PASSWORD_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });
});
