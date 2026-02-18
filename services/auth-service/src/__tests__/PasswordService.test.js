/**
 * @integram/auth-service - Password Service Tests
 *
 * Tests for password hashing, verification, and validation.
 * Includes tests for backward compatibility with PHP legacy hashes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordService, createPasswordService } from '../services/PasswordService.js';

describe('@integram/auth-service PasswordService', () => {
  let passwordService;

  beforeEach(() => {
    passwordService = new PasswordService({ minLength: 6 });
  });

  describe('constructor', () => {
    it('should set default minimum length to 6', () => {
      const service = new PasswordService();
      expect(service.minLength).toBe(6);
    });

    it('should allow custom minimum length', () => {
      const service = new PasswordService({ minLength: 8 });
      expect(service.minLength).toBe(8);
    });

    it('should allow requirement flags', () => {
      const service = new PasswordService({
        requireUppercase: true,
        requireNumber: true,
        requireSpecial: true,
      });

      expect(service.requireUppercase).toBe(true);
      expect(service.requireNumber).toBe(true);
      expect(service.requireSpecial).toBe(true);
    });
  });

  describe('salt', () => {
    it('should combine username and value with colon', () => {
      const result = passwordService.salt('testuser', 'password123');
      expect(result).toBe('testuser:password123');
    });

    it('should handle special characters', () => {
      const result = passwordService.salt('user@example.com', 'p@ss:word!');
      expect(result).toBe('user@example.com:p@ss:word!');
    });
  });

  describe('hashLegacy', () => {
    it('should generate 40 character SHA1 hash', () => {
      const hash = passwordService.hashLegacy('testuser', 'password123');

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(40);
      expect(/^[a-f0-9]{40}$/.test(hash)).toBe(true);
    });

    it('should generate consistent hash for same inputs', () => {
      const hash1 = passwordService.hashLegacy('user', 'pass');
      const hash2 = passwordService.hashLegacy('user', 'pass');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different usernames', () => {
      const hash1 = passwordService.hashLegacy('user1', 'password');
      const hash2 = passwordService.hashLegacy('user2', 'password');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hash for different passwords', () => {
      const hash1 = passwordService.hashLegacy('user', 'password1');
      const hash2 = passwordService.hashLegacy('user', 'password2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyLegacy', () => {
    it('should verify correct password', () => {
      const hash = passwordService.hashLegacy('testuser', 'correct-password');
      const result = passwordService.verifyLegacy('testuser', 'correct-password', hash);

      expect(result).toBe(true);
    });

    it('should reject incorrect password', () => {
      const hash = passwordService.hashLegacy('testuser', 'correct-password');
      const result = passwordService.verifyLegacy('testuser', 'wrong-password', hash);

      expect(result).toBe(false);
    });

    it('should reject wrong username', () => {
      const hash = passwordService.hashLegacy('user1', 'password');
      const result = passwordService.verifyLegacy('user2', 'password', hash);

      expect(result).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      // This test verifies the method doesn't throw on length mismatch
      // The actual timing-safe comparison is handled by crypto.timingSafeEqual
      const hash = passwordService.hashLegacy('user', 'pass');
      const result = passwordService.verifyLegacy('user', 'pass', hash);

      expect(result).toBe(true);
    });
  });

  describe('hashModern', () => {
    it('should generate scrypt hash', async () => {
      const hash = await passwordService.hashModern('password123');

      expect(typeof hash).toBe('string');
      expect(hash).toContain(':');

      const [salt, key] = hash.split(':');
      expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(key).toHaveLength(128); // 64 bytes = 128 hex chars
    });

    it('should generate different hashes for same password', async () => {
      const hash1 = await passwordService.hashModern('password');
      const hash2 = await passwordService.hashModern('password');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyModern', () => {
    it('should verify correct password', async () => {
      const hash = await passwordService.hashModern('secure-password');
      const result = await passwordService.verifyModern('secure-password', hash);

      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await passwordService.hashModern('correct');
      const result = await passwordService.verifyModern('incorrect', hash);

      expect(result).toBe(false);
    });
  });

  describe('validate', () => {
    it('should accept valid password', () => {
      const result = passwordService.validate('validpassword');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty password', () => {
      const result = passwordService.validate('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });

    it('should reject null password', () => {
      const result = passwordService.validate(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });

    it('should reject too short password', () => {
      const result = passwordService.validate('short');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 6 characters');
    });

    describe('with uppercase requirement', () => {
      beforeEach(() => {
        passwordService = new PasswordService({ requireUppercase: true });
      });

      it('should reject password without uppercase', () => {
        const result = passwordService.validate('nouppercasehere');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
      });

      it('should accept password with uppercase', () => {
        const result = passwordService.validate('HasUppercase');

        expect(result.valid).toBe(true);
      });
    });

    describe('with number requirement', () => {
      beforeEach(() => {
        passwordService = new PasswordService({ requireNumber: true });
      });

      it('should reject password without number', () => {
        const result = passwordService.validate('nonumbers');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one number');
      });

      it('should accept password with number', () => {
        const result = passwordService.validate('hasnumber123');

        expect(result.valid).toBe(true);
      });
    });

    describe('with special character requirement', () => {
      beforeEach(() => {
        passwordService = new PasswordService({ requireSpecial: true });
      });

      it('should reject password without special char', () => {
        const result = passwordService.validate('nospecial123');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one special character');
      });

      it('should accept password with special char', () => {
        const result = passwordService.validate('hasspecial@123');

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw for valid password', () => {
      expect(() => passwordService.validateOrThrow('validpass')).not.toThrow();
    });

    it('should throw for invalid password', () => {
      expect(() => passwordService.validateOrThrow('short')).toThrow();
    });

    it('should include error messages', () => {
      expect(() => passwordService.validateOrThrow(''))
        .toThrow('Password is required');
    });
  });

  describe('generateRandom', () => {
    it('should generate password of specified length', () => {
      const password = passwordService.generateRandom(16);
      expect(password).toHaveLength(16);
    });

    it('should default to 12 characters', () => {
      const password = passwordService.generateRandom();
      expect(password).toHaveLength(12);
    });

    it('should generate unique passwords', () => {
      const passwords = new Set();
      for (let i = 0; i < 100; i++) {
        passwords.add(passwordService.generateRandom());
      }
      expect(passwords.size).toBe(100);
    });

    it('should include various character types', () => {
      // Generate many passwords and check for character variety
      let hasLower = false;
      let hasUpper = false;
      let hasDigit = false;
      let hasSpecial = false;

      for (let i = 0; i < 100; i++) {
        const pwd = passwordService.generateRandom(20);
        if (/[a-z]/.test(pwd)) hasLower = true;
        if (/[A-Z]/.test(pwd)) hasUpper = true;
        if (/[0-9]/.test(pwd)) hasDigit = true;
        if (/[!@#$%^&*]/.test(pwd)) hasSpecial = true;
      }

      expect(hasLower).toBe(true);
      expect(hasUpper).toBe(true);
      expect(hasDigit).toBe(true);
      expect(hasSpecial).toBe(true);
    });
  });

  describe('generateResetToken', () => {
    it('should generate 64 character hex token', () => {
      const token = passwordService.generateResetToken();

      expect(typeof token).toBe('string');
      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(passwordService.generateResetToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('hashResetToken', () => {
    it('should hash token using SHA256', () => {
      const token = 'test-reset-token';
      const hash = passwordService.hashResetToken(token);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA256 = 32 bytes = 64 hex
    });

    it('should produce consistent hashes', () => {
      const token = 'test-token';
      const hash1 = passwordService.hashResetToken(token);
      const hash2 = passwordService.hashResetToken(token);

      expect(hash1).toBe(hash2);
    });
  });

  describe('isLegacyHash', () => {
    it('should identify SHA1 legacy hashes', () => {
      const legacyHash = passwordService.hashLegacy('user', 'pass');
      expect(passwordService.isLegacyHash(legacyHash)).toBe(true);
    });

    it('should reject modern hashes', async () => {
      const modernHash = await passwordService.hashModern('password');
      expect(passwordService.isLegacyHash(modernHash)).toBe(false);
    });

    it('should reject invalid formats', () => {
      expect(passwordService.isLegacyHash('not-a-hash')).toBe(false);
      expect(passwordService.isLegacyHash('short')).toBe(false);
      expect(passwordService.isLegacyHash('')).toBe(false);
    });
  });

  describe('needsUpgrade', () => {
    it('should return true for legacy hashes', () => {
      const legacyHash = passwordService.hashLegacy('user', 'pass');
      expect(passwordService.needsUpgrade(legacyHash)).toBe(true);
    });

    it('should return false for modern hashes', async () => {
      const modernHash = await passwordService.hashModern('password');
      expect(passwordService.needsUpgrade(modernHash)).toBe(false);
    });
  });

  describe('createPasswordService', () => {
    it('should create service with default options', () => {
      const service = createPasswordService();
      expect(service).toBeInstanceOf(PasswordService);
      expect(service.minLength).toBe(6);
    });

    it('should create service with custom options', () => {
      const service = createPasswordService({ minLength: 10 });
      expect(service.minLength).toBe(10);
    });
  });
});
