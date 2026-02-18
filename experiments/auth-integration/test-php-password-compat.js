/**
 * PHP Password Compatibility Test
 *
 * Tests that the PasswordService generates hashes compatible with PHP.
 * Run with: node experiments/auth-integration/test-php-password-compat.js
 *
 * PHP Salt() function:
 *   function Salt($u, $val) {
 *     global $z;
 *     $u = strtoupper($u);
 *     return SALT."$u$z$val";
 *   }
 *
 * PHP Password hash: sha1(Salt($username, $password))
 * PHP XSRF: substr(sha1(Salt($token, $database)), 0, 22)
 */

import { PasswordService } from '../../services/auth-service/src/services/PasswordService.js';
import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const SALT_PREFIX = process.env.INTEGRAM_SALT || '';

// ============================================================================
// Test Utilities
// ============================================================================

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function success(message) {
  console.log(`${colors.green}[✓ PASS]${colors.reset} ${message}`);
}

function fail(message) {
  console.log(`${colors.red}[✗ FAIL]${colors.reset} ${message}`);
}

function info(message) {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${message}`);
}

// ============================================================================
// PHP Reference Implementation (for comparison)
// ============================================================================

/**
 * PHP Salt() function reimplemented in JavaScript
 */
function phpSalt(username, value, database, saltPrefix = '') {
  const u = username.toUpperCase();
  return saltPrefix + u + database + value;
}

/**
 * PHP password hash: sha1(Salt($username, $password))
 */
function phpPasswordHash(username, password, database, saltPrefix = '') {
  const salted = phpSalt(username, password, database, saltPrefix);
  return crypto.createHash('sha1').update(salted).digest('hex');
}

/**
 * PHP xsrf() function: substr(sha1(Salt($token, $database)), 0, 22)
 */
function phpXsrf(token, database, saltPrefix = '') {
  // In xsrf(), Salt($token, $database) is called
  // Salt($a, $b) = SALT + strtoupper($a) + $z + $b
  // Here $a = $token, $b = $database, and $z = $database
  const salted = phpSalt(token, database, database, saltPrefix);
  const hash = crypto.createHash('sha1').update(salted).digest('hex');
  return hash.substring(0, 22);
}

// ============================================================================
// Tests
// ============================================================================

function testSaltFunction() {
  info('Testing Salt function compatibility...');

  const testCases = [
    { username: 'admin', value: 'password123', database: 'mydb' },
    { username: 'User', value: 'secret', database: 'test' },
    { username: 'JOHN', value: 'pass', database: 'a2025' },
    { username: 'lowercase', value: 'pwd', database: 'db' },
  ];

  const service = new PasswordService({ salt: SALT_PREFIX });
  let passed = 0;

  for (const tc of testCases) {
    const expected = phpSalt(tc.username, tc.value, tc.database, SALT_PREFIX);
    const actual = service.saltPhp(tc.username, tc.value, tc.database);

    if (expected === actual) {
      success(`Salt(${tc.username}, ${tc.value}, ${tc.database}) = "${actual}"`);
      passed++;
    } else {
      fail(`Salt mismatch for ${tc.username}:`);
      console.log(`  Expected: "${expected}"`);
      console.log(`  Actual:   "${actual}"`);
    }
  }

  console.log('');
  return passed === testCases.length;
}

function testPasswordHash() {
  info('Testing password hash compatibility...');

  const testCases = [
    { username: 'admin', password: 'admin123', database: 'mydb' },
    { username: 'test', password: 'testpass', database: 'test' },
    { username: 'User1', password: 'P@ssw0rd', database: 'a2025' },
  ];

  const service = new PasswordService({ salt: SALT_PREFIX });
  let passed = 0;

  for (const tc of testCases) {
    const expected = phpPasswordHash(tc.username, tc.password, tc.database, SALT_PREFIX);
    const actual = service.hashLegacy(tc.username, tc.password, tc.database);

    if (expected === actual) {
      success(`Hash(${tc.username}, ***) = ${actual.substring(0, 16)}...`);
      passed++;
    } else {
      fail(`Hash mismatch for ${tc.username}:`);
      console.log(`  Expected: ${expected}`);
      console.log(`  Actual:   ${actual}`);
    }
  }

  console.log('');
  return passed === testCases.length;
}

function testXsrfGeneration() {
  info('Testing XSRF token generation compatibility...');

  const testCases = [
    { token: 'abc123def456', database: 'mydb' },
    { token: 'token_value', database: 'test' },
    { token: 'sessiontoken', database: 'a2025' },
  ];

  const service = new PasswordService({ salt: SALT_PREFIX });
  let passed = 0;

  for (const tc of testCases) {
    const expected = phpXsrf(tc.token, tc.database, SALT_PREFIX);
    const actual = service.generateXsrf(tc.token, tc.database);

    if (expected === actual) {
      success(`XSRF(${tc.token.substring(0, 8)}..., ${tc.database}) = ${actual}`);
      passed++;
    } else {
      fail(`XSRF mismatch for token ${tc.token}:`);
      console.log(`  Expected: ${expected}`);
      console.log(`  Actual:   ${actual}`);
    }
  }

  console.log('');
  return passed === testCases.length;
}

function testXsrfVerification() {
  info('Testing XSRF verification...');

  const service = new PasswordService({ salt: SALT_PREFIX });

  // Generate XSRF
  const token = 'my_auth_token';
  const database = 'testdb';
  const xsrf = service.generateXsrf(token, database);

  // Test valid verification
  const validResult = service.verifyXsrf(xsrf, token, database);
  if (validResult) {
    success('Valid XSRF verified correctly');
  } else {
    fail('Valid XSRF rejected incorrectly');
    return false;
  }

  // Test invalid verification
  const invalidResult = service.verifyXsrf('invalid_xsrf_value_', token, database);
  if (!invalidResult) {
    success('Invalid XSRF rejected correctly');
  } else {
    fail('Invalid XSRF accepted incorrectly');
    return false;
  }

  console.log('');
  return true;
}

function testPasswordVerification() {
  info('Testing password verification...');

  const service = new PasswordService({ salt: SALT_PREFIX });

  const username = 'testuser';
  const password = 'mypassword';
  const database = 'mydb';

  // Hash the password
  const hash = service.hashLegacy(username, password, database);

  // Verify correct password
  const correctResult = service.verifyLegacy(username, password, hash, database);
  if (correctResult) {
    success('Correct password verified');
  } else {
    fail('Correct password rejected');
    return false;
  }

  // Verify wrong password
  const wrongResult = service.verifyLegacy(username, 'wrongpassword', hash, database);
  if (!wrongResult) {
    success('Wrong password rejected');
  } else {
    fail('Wrong password accepted');
    return false;
  }

  // Verify wrong database
  const wrongDbResult = service.verifyLegacy(username, password, hash, 'otherdb');
  if (!wrongDbResult) {
    success('Password with wrong database rejected');
  } else {
    fail('Password with wrong database accepted');
    return false;
  }

  console.log('');
  return true;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('\n' + '='.repeat(60));
  console.log('PHP Password Compatibility Test');
  console.log('='.repeat(60) + '\n');

  info(`Salt prefix: "${SALT_PREFIX}" (${SALT_PREFIX.length} chars)`);
  console.log('');

  const results = {
    total: 5,
    passed: 0,
  };

  if (testSaltFunction()) results.passed++;
  if (testPasswordHash()) results.passed++;
  if (testXsrfGeneration()) results.passed++;
  if (testXsrfVerification()) results.passed++;
  if (testPasswordVerification()) results.passed++;

  // Summary
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total:  ${results.total}`);
  console.log(`Passed: ${colors.green}${results.passed}${colors.reset}`);
  console.log(`Failed: ${colors.red}${results.total - results.passed}${colors.reset}`);
  console.log('');

  if (results.passed === results.total) {
    success('All PHP compatibility tests passed!');
  } else {
    fail(`${results.total - results.passed} test(s) failed`);
  }

  console.log('');
  process.exit(results.passed === results.total ? 0 : 1);
}

main();
