#!/usr/bin/env node
/**
 * Experiment: Test @integram/auth-service components
 *
 * This script demonstrates the usage of the auth-service components
 * including JWT tokens, password hashing, and permission checking.
 *
 * Run with: node experiments/componentization/test-auth-service.js
 */

import { JWTService, createJWTServiceFromEnv } from '../../services/auth-service/src/services/JWTService.js';
import { PasswordService, createPasswordService } from '../../services/auth-service/src/services/PasswordService.js';
import { PermissionService } from '../../services/auth-service/src/services/PermissionService.js';

console.log('===== @integram/auth-service Test =====\n');

// ============================================================================
// JWT Service Tests
// ============================================================================
console.log('1. JWT Service:');
console.log('-------------------');

const jwtService = new JWTService({
  secret: 'my-super-secret-key-change-in-production',
  expiresIn: 3600, // 1 hour
});

// Generate a token
const token = jwtService.generateToken({
  userId: 123,
  username: 'john.doe',
  database: 'mydb',
  role: 'manager',
});
console.log(`   Generated JWT token: ${token.substring(0, 50)}...`);

// Decode token (without verification)
const decoded = jwtService.decodeToken(token);
console.log(`   Decoded payload:`, JSON.stringify(decoded, null, 2).split('\n').map(l => '      ' + l).join('\n'));

// Verify token
try {
  const verified = jwtService.verifyToken(token);
  console.log(`   Token verified: YES (userId: ${verified.userId})`);
} catch (e) {
  console.log(`   Token verified: NO (${e.message})`);
}

// Generate legacy token
const legacyToken = jwtService.generateLegacyToken();
console.log(`   Legacy token: ${legacyToken}`);

// Generate XSRF token
const xsrf = jwtService.generateXsrf(legacyToken, 'mydb');
console.log(`   XSRF token: ${xsrf}`);
console.log(`   XSRF valid: ${jwtService.verifyXsrf(xsrf, legacyToken, 'mydb')}`);
console.log();

// ============================================================================
// Password Service Tests
// ============================================================================
console.log('2. Password Service:');
console.log('----------------------');

const passwordService = createPasswordService({
  minLength: 8,
  requireNumber: true,
});

// Legacy password hashing (PHP compatible)
console.log('   Legacy hashing (PHP sha1 compatible):');
const legacyHash = passwordService.hashLegacy('john.doe', 'secretPassword123');
console.log(`      Hash: ${legacyHash}`);
console.log(`      Verify correct: ${passwordService.verifyLegacy('john.doe', 'secretPassword123', legacyHash)}`);
console.log(`      Verify wrong: ${passwordService.verifyLegacy('john.doe', 'wrongPassword', legacyHash)}`);
console.log();

// Modern password hashing (recommended)
console.log('   Modern hashing (scrypt):');
const modernHash = await passwordService.hashModern('secretPassword123');
console.log(`      Hash: ${modernHash.substring(0, 50)}...`);
console.log(`      Verify correct: ${await passwordService.verifyModern('secretPassword123', modernHash)}`);
console.log(`      Verify wrong: ${await passwordService.verifyModern('wrongPassword', modernHash)}`);
console.log();

// Password validation
console.log('   Password validation:');
const passwords = ['short', 'nolowercase', 'lowercase123', 'StrongPass123!'];
passwords.forEach(pwd => {
  const result = passwordService.validate(pwd);
  console.log(`      "${pwd}": ${result.valid ? 'VALID' : `INVALID (${result.errors.join(', ')})`}`);
});
console.log();

// Hash format detection
console.log('   Hash format detection:');
console.log(`      Legacy hash "${legacyHash.substring(0, 20)}...": isLegacy=${passwordService.isLegacyHash(legacyHash)}, needsUpgrade=${passwordService.needsUpgrade(legacyHash)}`);
console.log(`      Modern hash "${modernHash.substring(0, 20)}...": isLegacy=${passwordService.isLegacyHash(modernHash)}, needsUpgrade=${passwordService.needsUpgrade(modernHash)}`);
console.log();

// Random password generation
console.log('   Random password generation:');
console.log(`      Generated password (12 chars): ${passwordService.generateRandom(12)}`);
console.log(`      Generated password (16 chars): ${passwordService.generateRandom(16)}`);
console.log();

// Reset token
console.log('   Reset token generation:');
const resetToken = passwordService.generateResetToken();
const hashedResetToken = passwordService.hashResetToken(resetToken);
console.log(`      Reset token: ${resetToken.substring(0, 32)}...`);
console.log(`      Hashed for storage: ${hashedResetToken.substring(0, 32)}...`);
console.log();

// ============================================================================
// Permission Service Tests
// ============================================================================
console.log('3. Permission Service:');
console.log('------------------------');

// Mock database service
const mockDb = {
  execSql: async () => ({ rows: [] }),
};

const permissionService = new PermissionService({
  database: mockDb,
});

// Admin user check
console.log('   Admin user access:');
const adminContext = { username: 'admin', userGrants: {} };
console.log(`      checkGrant(123, 18, WRITE): ${permissionService.checkGrant(adminContext, 123, 18, 'WRITE', false)}`);
console.log(`      checkGrant1Level(100): ${permissionService.checkGrant1Level(adminContext, 100)}`);
console.log(`      checkTypesGrant(): ${permissionService.checkTypesGrant(adminContext, false)}`);
console.log();

// Regular user with grants
console.log('   Regular user with grants:');
const userContext = {
  username: 'john',
  userGrants: {
    grants: {
      1: 'READ',     // Root access
      18: 'WRITE',   // USER type
      42: 'READ',    // ROLE type
    },
    masks: {},
  },
};
console.log(`      checkGrant(123, 18, WRITE): ${permissionService.checkGrant(userContext, 123, 18, 'WRITE', false)}`);
console.log(`      checkGrant(123, 18, READ): ${permissionService.checkGrant(userContext, 123, 18, 'READ', false)}`);
console.log(`      checkGrant(123, 42, WRITE): ${permissionService.checkGrant(userContext, 123, 42, 'WRITE', false)}`);
console.log(`      checkGrant(123, 42, READ): ${permissionService.checkGrant(userContext, 123, 42, 'READ', false)}`);
console.log(`      checkGrant1Level(100): ${permissionService.checkGrant1Level(userContext, 100)}`);
console.log();

// User without grants
console.log('   User without grants:');
const noGrantsContext = { username: 'guest', userGrants: null };
console.log(`      checkGrant(123, 18, READ): ${permissionService.checkGrant(noGrantsContext, 123, 18, 'READ', false)}`);
console.log(`      checkGrant1Level(100): ${permissionService.checkGrant1Level(noGrantsContext, 100)}`);
console.log();

// Mask matching
console.log('   Mask pattern matching:');
const patterns = [
  ['hello world', '%world', true],
  ['hello world', 'hello%', true],
  ['secret123', 'secret%', true],
  ['public', 'secret%', false],
  ['test', '!test', false],
  ['other', '!test', true],
];
patterns.forEach(([value, pattern, expected]) => {
  const result = permissionService.matchesMask(value, pattern);
  console.log(`      "${value}" matches "${pattern}": ${result} (expected: ${expected})`);
});
console.log();

console.log('===== All Tests Complete =====');
