/**
 * @integram/auth-service - Password Service Tests
 *
 * Tests for password hashing, verification, and validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordService, createPasswordService } from '../src/services/PasswordService.js';

describe('@integram/auth-service PasswordService', () => {
  let passwordService;

  beforeEach(() => {
    passwordService = new PasswordService();
  });

  describe('Legacy Hashing (PHP compatibility)', () => {
    it('should hash password with username salt', () => {
      const hash = passwordService.hashLegacy('john', 'secret123');

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^[a-f0-9]{40}$/); // SHA1 produces 40 hex chars
    });

    it('should produce consistent hash for same inputs', () => {
      const hash1 = passwordService.hashLegacy('user1', 'password');
      const hash2 = passwordService.hashLegacy('user1', 'password');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different usernames', () => {
      const hash1 = passwordService.hashLegacy('user1', 'password');
      const hash2 = passwordService.hashLegacy('user2', 'password');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash for different passwords', () => {
      const hash1 = passwordService.hashLegacy('user', 'password1');
      const hash2 = passwordService.hashLegacy('user', 'password2');

      expect(hash1).not.toBe(hash2);
    });

    it('should verify correct password', () => {
      const hash = passwordService.hashLegacy('john', 'mypassword');
      const isValid = passwordService.verifyLegacy('john', 'mypassword', hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', () => {
      const hash = passwordService.hashLegacy('john', 'correct');
      const isValid = passwordService.verifyLegacy('john', 'wrong', hash);

      expect(isValid).toBe(false);
    });

    it('should reject with wrong username', () => {
      const hash = passwordService.hashLegacy('john', 'password');
      const isValid = passwordService.verifyLegacy('jane', 'password', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('Modern Hashing (scrypt)', () => {
    it('should hash password with modern algorithm', async () => {
      const hash = await passwordService.hashModern('secretpassword');

      expect(hash).toBeDefined();
      expect(hash).toContain(':'); // salt:hash format
    });

    it('should produce different hashes for same password', async () => {
      const hash1 = await passwordService.hashModern('password');
      const hash2 = await passwordService.hashModern('password');

      expect(hash1).not.toBe(hash2); // Different salt each time
    });

    it('should verify correct modern password', async () => {
      const hash = await passwordService.hashModern('mypassword');
      const isValid = await passwordService.verifyModern('mypassword', hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect modern password', async () => {
      const hash = await passwordService.hashModern('correct');
      const isValid = await passwordService.verifyModern('wrong', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('Salt Function', () => {
    it('should produce salted string', () => {
      const salted = passwordService.salt('username', 'value');

      expect(salted).toBe('username:value');
    });
  });

  describe('PHP Salt Compatibility', () => {
    it('should produce PHP-compatible salt', () => {
      // PHP: Salt($u, $val) = SALT + strtoupper($u) + $z + $val
      // With empty SALT prefix (default), Salt('user', 'pass', 'mydb') = 'USERmydbpass'
      const salted = passwordService.saltPhp('user', 'pass', 'mydb');

      expect(salted).toBe('USERmydbpass');
    });

    it('should uppercase username in PHP salt', () => {
      const salted = passwordService.saltPhp('JohnDoe', 'secret', 'testdb');

      expect(salted).toBe('JOHNDOEtestdbsecret');
    });

    it('should include salt prefix when configured', () => {
      const service = new PasswordService({ salt: 'MYSALT' });
      const salted = service.saltPhp('user', 'pass', 'db');

      expect(salted).toBe('MYSALTUSERdbpass');
    });

    it('should hash legacy password with database', () => {
      const hash = passwordService.hashLegacy('admin', 'password123', 'mydb');

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('should verify legacy password with database', () => {
      const hash = passwordService.hashLegacy('admin', 'secret', 'testdb');
      const isValid = passwordService.verifyLegacy('admin', 'secret', hash, 'testdb');

      expect(isValid).toBe(true);
    });

    it('should reject password with wrong database', () => {
      const hash = passwordService.hashLegacy('admin', 'secret', 'db1');
      const isValid = passwordService.verifyLegacy('admin', 'secret', hash, 'db2');

      expect(isValid).toBe(false);
    });
  });

  describe('XSRF Token Generation (PHP xsrf() compatibility)', () => {
    it('should generate 22-char XSRF token', () => {
      const xsrf = passwordService.generateXsrf('mytokenvalue', 'mydb');

      expect(xsrf).toBeDefined();
      expect(xsrf.length).toBe(22);
    });

    it('should produce consistent XSRF for same inputs', () => {
      const xsrf1 = passwordService.generateXsrf('token123', 'testdb');
      const xsrf2 = passwordService.generateXsrf('token123', 'testdb');

      expect(xsrf1).toBe(xsrf2);
    });

    it('should produce different XSRF for different tokens', () => {
      const xsrf1 = passwordService.generateXsrf('token1', 'db');
      const xsrf2 = passwordService.generateXsrf('token2', 'db');

      expect(xsrf1).not.toBe(xsrf2);
    });

    it('should produce different XSRF for different databases', () => {
      const xsrf1 = passwordService.generateXsrf('token', 'db1');
      const xsrf2 = passwordService.generateXsrf('token', 'db2');

      expect(xsrf1).not.toBe(xsrf2);
    });

    it('should verify valid XSRF token', () => {
      const xsrf = passwordService.generateXsrf('usertoken', 'mydb');
      const isValid = passwordService.verifyXsrf(xsrf, 'usertoken', 'mydb');

      expect(isValid).toBe(true);
    });

    it('should reject invalid XSRF token', () => {
      const xsrf = passwordService.generateXsrf('usertoken', 'mydb');
      const isValid = passwordService.verifyXsrf('wrongxsrf0000000000000', 'usertoken', 'mydb');

      expect(isValid).toBe(false);
    });

    it('should reject XSRF with wrong token', () => {
      const xsrf = passwordService.generateXsrf('token1', 'mydb');
      const isValid = passwordService.verifyXsrf(xsrf, 'token2', 'mydb');

      expect(isValid).toBe(false);
    });
  });

  describe('Password Validation', () => {
    describe('Default options', () => {
      it('should accept valid password', () => {
        const result = passwordService.validate('validpwd');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject empty password', () => {
        const result = passwordService.validate('');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password is required');
      });

      it('should reject short password', () => {
        const result = passwordService.validate('abc');

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('at least 6 characters');
      });

      it('should accept 6-char password by default', () => {
        const result = passwordService.validate('123456');

        expect(result.valid).toBe(true);
      });
    });

    describe('Custom options', () => {
      it('should require uppercase when configured', () => {
        const service = new PasswordService({ requireUppercase: true });
        const result = service.validate('lowercase');

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('uppercase');
      });

      it('should accept uppercase when present', () => {
        const service = new PasswordService({ requireUppercase: true });
        const result = service.validate('Uppercase');

        expect(result.valid).toBe(true);
      });

      it('should require number when configured', () => {
        const service = new PasswordService({ requireNumber: true });
        const result = service.validate('noNumbers');

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('number');
      });

      it('should accept number when present', () => {
        const service = new PasswordService({ requireNumber: true });
        const result = service.validate('has1number');

        expect(result.valid).toBe(true);
      });

      it('should require special char when configured', () => {
        const service = new PasswordService({ requireSpecial: true });
        const result = service.validate('nospecial');

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('special');
      });

      it('should accept special char when present', () => {
        const service = new PasswordService({ requireSpecial: true });
        const result = service.validate('has@special');

        expect(result.valid).toBe(true);
      });

      it('should allow custom min length', () => {
        const service = new PasswordService({ minLength: 10 });
        const result = service.validate('shortpwd');

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('10 characters');
      });

      it('should collect multiple errors', () => {
        const service = new PasswordService({
          minLength: 10,
          requireUppercase: true,
          requireNumber: true,
        });
        const result = service.validate('short');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });
    });

    describe('validateOrThrow', () => {
      it('should not throw for valid password', () => {
        expect(() => passwordService.validateOrThrow('validpassword')).not.toThrow();
      });

      it('should throw PasswordError for invalid password', () => {
        expect(() => passwordService.validateOrThrow('abc')).toThrow();
      });
    });
  });

  describe('Random Password Generation', () => {
    it('should generate password of default length', () => {
      const password = passwordService.generateRandom();

      expect(password.length).toBe(12);
    });

    it('should generate password of custom length', () => {
      const password = passwordService.generateRandom(20);

      expect(password.length).toBe(20);
    });

    it('should generate unique passwords', () => {
      const passwords = new Set();
      for (let i = 0; i < 100; i++) {
        passwords.add(passwordService.generateRandom());
      }
      expect(passwords.size).toBe(100);
    });
  });

  describe('Reset Token', () => {
    it('should generate 64-char hex reset token', () => {
      const token = passwordService.generateResetToken();

      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique reset tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(passwordService.generateResetToken());
      }
      expect(tokens.size).toBe(100);
    });

    it('should hash reset token', () => {
      const token = passwordService.generateResetToken();
      const hashed = passwordService.hashResetToken(token);

      expect(hashed).toMatch(/^[a-f0-9]{64}$/);
      expect(hashed).not.toBe(token);
    });
  });

  describe('Hash Format Detection', () => {
    it('should identify legacy SHA1 hash', () => {
      const legacyHash = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3';

      expect(passwordService.isLegacyHash(legacyHash)).toBe(true);
    });

    it('should not identify modern hash as legacy', () => {
      const modernHash = 'abc123:def456789...';

      expect(passwordService.isLegacyHash(modernHash)).toBe(false);
    });

    it('should indicate upgrade needed for legacy hash', () => {
      const legacyHash = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3';

      expect(passwordService.needsUpgrade(legacyHash)).toBe(true);
    });

    it('should not indicate upgrade for modern hash', () => {
      const modernHash = 'abc123:def456';

      expect(passwordService.needsUpgrade(modernHash)).toBe(false);
    });
  });

  describe('Factory Function', () => {
    it('should create service with default options', () => {
      const service = createPasswordService();

      expect(service).toBeInstanceOf(PasswordService);
      expect(service.minLength).toBe(6);
    });

    it('should create service with custom options', () => {
      const service = createPasswordService({ minLength: 8 });

      expect(service.minLength).toBe(8);
    });
  });
});
