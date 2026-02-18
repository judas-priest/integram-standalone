/**
 * PHP Bridge Integration Test
 *
 * Tests the PhpBridge service against a real PHP backend.
 * Run with: node experiments/auth-integration/test-php-bridge.js
 *
 * Environment variables:
 *   INTEGRAM_PHP_URL - PHP backend URL (default: https://dronedoc.ru)
 *   TEST_DATABASE - Database to test against (default: my)
 *   TEST_LOGIN - Test username (required for auth tests)
 *   TEST_PASSWORD - Test password (required for auth tests)
 */

import { PhpBridge } from '../../services/auth-service/src/services/PhpBridge.js';

// ============================================================================
// Configuration
// ============================================================================

const config = {
  phpUrl: process.env.INTEGRAM_PHP_URL || 'https://dronedoc.ru',
  database: process.env.TEST_DATABASE || 'my',
  login: process.env.TEST_LOGIN,
  password: process.env.TEST_PASSWORD,
};

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

function log(color, label, message) {
  console.log(`${color}[${label}]${colors.reset} ${message}`);
}

function success(message) {
  log(colors.green, '✓ PASS', message);
}

function fail(message, error) {
  log(colors.red, '✗ FAIL', message);
  if (error) {
    console.error('  Error:', error.message);
  }
}

function info(message) {
  log(colors.cyan, 'INFO', message);
}

function warn(message) {
  log(colors.yellow, 'WARN', message);
}

// ============================================================================
// Tests
// ============================================================================

async function testDatabaseCheck(bridge) {
  info('Testing database existence check...');

  try {
    const exists = await bridge.checkDatabase(config.database);
    if (exists) {
      success(`Database "${config.database}" exists`);
    } else {
      warn(`Database "${config.database}" does not exist`);
    }
    return exists;
  } catch (error) {
    fail('Database check failed', error);
    return false;
  }
}

async function testAuthentication(bridge) {
  if (!config.login || !config.password) {
    warn('Skipping authentication test: TEST_LOGIN and TEST_PASSWORD not set');
    return null;
  }

  info(`Testing authentication: ${config.login}@${config.database}...`);

  try {
    const result = await bridge.authenticate(
      config.database,
      config.login,
      config.password
    );

    success('Authentication successful');
    console.log('  Token:', result.token?.substring(0, 10) + '...');
    console.log('  XSRF:', result.xsrf);
    console.log('  User ID:', result.userId);

    return result;
  } catch (error) {
    fail('Authentication failed', error);
    return null;
  }
}

async function testTokenValidation(bridge, authResult) {
  if (!authResult) {
    warn('Skipping token validation: no auth result');
    return;
  }

  info('Testing token validation...');

  try {
    const result = await bridge.validateToken(
      config.database,
      authResult.token
    );

    if (result.valid) {
      success('Token validation successful');
    } else {
      fail('Token validation returned invalid');
    }
  } catch (error) {
    fail('Token validation failed', error);
  }
}

async function testInvalidCredentials(bridge) {
  info('Testing rejection of invalid credentials...');

  try {
    await bridge.authenticate(
      config.database,
      'nonexistent_user_12345',
      'wrong_password'
    );
    fail('Invalid credentials were accepted (should have been rejected)');
  } catch (error) {
    if (error.code === 'AUTH_FAILED' || error.message.includes('credentials')) {
      success('Invalid credentials correctly rejected');
    } else {
      fail('Unexpected error for invalid credentials', error);
    }
  }
}

async function testLogout(bridge, authResult) {
  if (!authResult) {
    warn('Skipping logout test: no auth result');
    return;
  }

  info('Testing logout...');

  try {
    const result = await bridge.logout(config.database, authResult.token);
    if (result.success) {
      success('Logout successful');
    } else {
      fail('Logout returned failure');
    }
  } catch (error) {
    fail('Logout failed', error);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('PHP Bridge Integration Test');
  console.log('='.repeat(60) + '\n');

  info(`PHP URL: ${config.phpUrl}`);
  info(`Database: ${config.database}`);
  info(`Login: ${config.login || '(not set)'}`);
  console.log('');

  // Create bridge
  const bridge = new PhpBridge({
    baseUrl: config.phpUrl,
    rejectUnauthorized: false, // Allow self-signed certs for testing
    logger: {
      debug: (msg, data) => console.log(`  [DEBUG] ${msg}`, data || ''),
      info: (msg, data) => console.log(`  [INFO] ${msg}`, data || ''),
      error: (msg, data) => console.error(`  [ERROR] ${msg}`, data || ''),
    },
  });

  // Run tests
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  // Test 1: Database check
  results.total++;
  const dbExists = await testDatabaseCheck(bridge);
  if (dbExists) results.passed++;
  else results.failed++;
  console.log('');

  // Test 2: Invalid credentials (should fail gracefully)
  results.total++;
  try {
    await testInvalidCredentials(bridge);
    results.passed++;
  } catch {
    results.failed++;
  }
  console.log('');

  // Test 3: Authentication (requires credentials)
  results.total++;
  const authResult = await testAuthentication(bridge);
  if (authResult) {
    results.passed++;
  } else if (!config.login) {
    results.skipped++;
  } else {
    results.failed++;
  }
  console.log('');

  // Test 4: Token validation
  results.total++;
  if (authResult) {
    try {
      await testTokenValidation(bridge, authResult);
      results.passed++;
    } catch {
      results.failed++;
    }
  } else {
    results.skipped++;
  }
  console.log('');

  // Test 5: Logout
  results.total++;
  if (authResult) {
    try {
      await testLogout(bridge, authResult);
      results.passed++;
    } catch {
      results.failed++;
    }
  } else {
    results.skipped++;
  }
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total:   ${results.total}`);
  console.log(`Passed:  ${colors.green}${results.passed}${colors.reset}`);
  console.log(`Failed:  ${colors.red}${results.failed}${colors.reset}`);
  console.log(`Skipped: ${colors.yellow}${results.skipped}${colors.reset}`);
  console.log('');

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
