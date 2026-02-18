/**
 * @integram/auth-service - Legacy Format Transformer Tests
 *
 * Tests for PHP backward compatibility transformations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LegacyFormatTransformer } from '../src/compatibility/LegacyFormatTransformer.js';

describe('LegacyFormatTransformer', () => {
  let transformer;

  beforeEach(() => {
    transformer = new LegacyFormatTransformer();
  });

  describe('transformLoginRequest', () => {
    it('should transform modern format', () => {
      const body = {
        username: 'testuser',
        password: 'testpass',
      };

      const result = transformer.transformLoginRequest(body);

      expect(result.username).toBe('testuser');
      expect(result.password).toBe('testpass');
    });

    it('should transform legacy login/pwd format', () => {
      const body = {
        login: 'testuser',
        pwd: 'testpass',
      };

      const result = transformer.transformLoginRequest(body);

      expect(result.username).toBe('testuser');
      expect(result.password).toBe('testpass');
    });

    it('should transform legacy u/pwd format', () => {
      const body = {
        u: 'testuser',
        pwd: 'testpass',
      };

      const result = transformer.transformLoginRequest(body);

      expect(result.username).toBe('testuser');
      expect(result.password).toBe('testpass');
    });

    it('should prefer username over login', () => {
      const body = {
        username: 'preferred',
        login: 'fallback',
        password: 'testpass',
      };

      const result = transformer.transformLoginRequest(body);

      expect(result.username).toBe('preferred');
    });
  });

  describe('transformRegisterRequest', () => {
    it('should transform modern format', () => {
      const body = {
        email: 'test@example.com',
        password: 'testpass123',
        termsAccepted: true,
      };

      const result = transformer.transformRegisterRequest(body);

      expect(result.email).toBe('test@example.com');
      expect(result.password).toBe('testpass123');
      expect(result.termsAccepted).toBe(true);
    });

    it('should transform legacy regpwd format', () => {
      const body = {
        email: 'test@example.com',
        regpwd: 'testpass123',
        regpwd1: 'testpass123',
        agree: '1',
      };

      const result = transformer.transformRegisterRequest(body);

      expect(result.email).toBe('test@example.com');
      expect(result.password).toBe('testpass123');
      expect(result.confirmPassword).toBe('testpass123');
      expect(result.termsAccepted).toBe(true);
    });

    it('should handle agree=0 as false', () => {
      const body = {
        email: 'test@example.com',
        regpwd: 'testpass123',
        agree: '0',
      };

      const result = transformer.transformRegisterRequest(body);

      expect(result.termsAccepted).toBe(false);
    });
  });

  describe('transformTokenRequest', () => {
    it('should extract Bearer token from header', () => {
      const req = {
        headers: { authorization: 'Bearer test-token' },
        body: {},
        query: {},
        cookies: {},
      };

      const result = transformer.transformTokenRequest(req, 'test');

      expect(result.type).toBe('bearer');
      expect(result.token).toBe('test-token');
    });

    it('should extract Basic auth from header', () => {
      const req = {
        headers: {
          authorization: 'Basic ' + Buffer.from('user:pass').toString('base64'),
        },
        body: {},
        query: {},
        cookies: {},
      };

      const result = transformer.transformTokenRequest(req, 'test');

      expect(result.type).toBe('basic');
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass');
    });

    it('should extract secret from POST body', () => {
      const req = {
        headers: {},
        body: { secret: 'test-secret' },
        query: {},
        cookies: {},
      };

      const result = transformer.transformTokenRequest(req, 'test');

      expect(result.type).toBe('secret');
      expect(result.token).toBe('test-secret');
    });

    it('should extract secret from query', () => {
      const req = {
        headers: {},
        body: {},
        query: { secret: 'query-secret' },
        cookies: {},
      };

      const result = transformer.transformTokenRequest(req, 'test');

      expect(result.type).toBe('secret');
      expect(result.token).toBe('query-secret');
    });

    it('should extract token from cookie', () => {
      const req = {
        headers: {},
        body: {},
        query: {},
        cookies: { test: 'cookie-token' },
      };

      const result = transformer.transformTokenRequest(req, 'test');

      expect(result.type).toBe('cookie');
      expect(result.token).toBe('cookie-token');
    });

    it('should prioritize Authorization header over cookie', () => {
      const req = {
        headers: { authorization: 'Bearer header-token' },
        body: {},
        query: {},
        cookies: { test: 'cookie-token' },
      };

      const result = transformer.transformTokenRequest(req, 'test');

      expect(result.token).toBe('header-token');
    });
  });

  describe('transformLoginResponse', () => {
    it('should transform to JSON format', () => {
      const result = {
        success: true,
        token: 'test-token',
        xsrf: 'test-xsrf',
        user: { id: 1, username: 'testuser', role: 'user', roleId: 115 },
        grants: {},
      };

      const transformed = transformer.transformLoginResponse(result, 'json');

      expect(transformed.success).toBe(true);
      expect(transformed.token).toBe('test-token');
      expect(transformed.user.val).toBe('testuser');
      expect(transformed.user.role_id).toBe(115);
    });

    it('should return redirect info for redirect format', () => {
      const result = { success: true };

      const transformed = transformer.transformLoginResponse(result, 'redirect');

      expect(transformed.redirect).toBe(true);
      expect(transformed.location).toBe('/');
    });
  });

  describe('transformErrorResponse', () => {
    it('should transform NOT_AUTHENTICATED error', () => {
      const error = { code: 'NOT_AUTHENTICATED', message: 'No token' };

      const result = transformer.transformErrorResponse(error);

      expect(result).toBeInstanceOf(Array);
      expect(result[0].error).toContain('No authorization token');
    });

    it('should transform INVALID_CREDENTIALS error', () => {
      const error = { code: 'INVALID_CREDENTIALS', message: 'Wrong password' };

      const result = transformer.transformErrorResponse(error);

      expect(result[0].error).toContain('Invalid login/password');
    });

    it('should transform generic error', () => {
      const error = { code: 'UNKNOWN', message: 'Something went wrong' };

      const result = transformer.transformErrorResponse(error);

      expect(result[0].error).toBe('Something went wrong');
      expect(result[0].code).toBe('UNKNOWN');
    });
  });

  describe('transformValidationResponse', () => {
    it('should transform to legacy format', () => {
      const result = {
        userId: 1,
        username: 'TestUser',
        role: 'Admin',
        roleId: 145,
        xsrf: 'test-xsrf',
        grants: { read: true, write: true },
      };

      const transformed = transformer.transformValidationResponse(result);

      // PHP stores user/role lowercase
      expect(transformed.user).toBe('testuser');
      expect(transformed.role).toBe('admin');
      expect(transformed.role_id).toBe(145);
      expect(transformed.user_id).toBe(1);
      expect(transformed.xsrf).toBe('test-xsrf');
    });
  });

  describe('cookie options', () => {
    it('should return legacy cookie options', () => {
      const options = transformer.getLegacyCookieOptions('mydb');

      expect(options.name).toBe('mydb');
      expect(options.maxAge).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
      expect(options.path).toBe('/');
      expect(options.httpOnly).toBe(true);
    });

    it('should return session cookie options', () => {
      const options = transformer.getSessionCookieOptions('mydb');

      expect(options.name).toBe('mydb');
      expect(options.maxAge).toBeUndefined(); // Session cookie
      expect(options.path).toBe('/');
    });
  });

  describe('utility methods', () => {
    describe('normalizeBoolean', () => {
      it('should handle boolean values', () => {
        expect(transformer.normalizeBoolean(true)).toBe(true);
        expect(transformer.normalizeBoolean(false)).toBe(false);
      });

      it('should handle string values', () => {
        expect(transformer.normalizeBoolean('1')).toBe(true);
        expect(transformer.normalizeBoolean('true')).toBe(true);
        expect(transformer.normalizeBoolean('TRUE')).toBe(true);
        expect(transformer.normalizeBoolean('0')).toBe(false);
        expect(transformer.normalizeBoolean('false')).toBe(false);
      });

      it('should handle number values', () => {
        expect(transformer.normalizeBoolean(1)).toBe(true);
        expect(transformer.normalizeBoolean(0)).toBe(false);
      });
    });

    describe('sanitizeInput', () => {
      it('should encode HTML entities', () => {
        const result = transformer.sanitizeInput('<script>alert("xss")</script>');

        expect(result).not.toContain('<');
        expect(result).toContain('&lt;');
        expect(result).toContain('&gt;');
      });

      it('should handle non-string values', () => {
        expect(transformer.sanitizeInput(123)).toBe(123);
        expect(transformer.sanitizeInput(null)).toBe(null);
      });
    });

    describe('isApiRequest', () => {
      it('should detect JSON Accept header', () => {
        const req = { headers: { accept: 'application/json' }, query: {} };
        expect(transformer.isApiRequest(req)).toBe(true);
      });

      it('should detect XMLHttpRequest', () => {
        const req = { headers: { 'x-requested-with': 'XMLHttpRequest' }, query: {} };
        expect(transformer.isApiRequest(req)).toBe(true);
      });

      it('should detect JSON Content-Type', () => {
        const req = { headers: { 'content-type': 'application/json' }, query: {} };
        expect(transformer.isApiRequest(req)).toBe(true);
      });

      it('should detect format=json query param', () => {
        const req = { headers: {}, query: { format: 'json' } };
        expect(transformer.isApiRequest(req)).toBe(true);
      });

      it('should return false for regular requests', () => {
        const req = { headers: { accept: 'text/html' }, query: {} };
        expect(transformer.isApiRequest(req)).toBe(false);
      });
    });

    describe('detectResponseFormat', () => {
      it('should detect JSON for API requests', () => {
        const req = { headers: { accept: 'application/json' }, query: {} };
        expect(transformer.detectResponseFormat(req)).toBe('json');
      });

      it('should detect redirect for form submissions', () => {
        const req = {
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          query: {},
        };
        expect(transformer.detectResponseFormat(req)).toBe('redirect');
      });

      it('should default to HTML', () => {
        const req = { headers: {}, query: {} };
        expect(transformer.detectResponseFormat(req)).toBe('html');
      });
    });
  });
});
