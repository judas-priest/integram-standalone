#!/usr/bin/env node
/**
 * Experiment: Test @integram/common package
 *
 * This script demonstrates the usage of the common package
 * that provides shared utilities, constants, and types for Integram services.
 *
 * Run with: node experiments/componentization/test-common-package.js
 */

import {
  // Constants
  USER,
  TOKEN,
  PASSWORD,
  EMAIL,
  ROLE,
  DATABASE,
  XSRF,
  BASIC_TYPES,
  GRANTS,
  DB_MASK,
  MAIL_MASK,

  // Utilities
  validateDbName,
  validateEmail,
  escapeString,
  hasInjectionPattern,
  t9n,

  // Errors
  IntegramError,
  AuthenticationError,
  ValidationError,
  DatabaseError,
} from '../../packages/@integram/common/index.js';

console.log('===== @integram/common Package Test =====\n');

// Test Constants
console.log('1. Data Type Constants (matching PHP define() values):');
console.log(`   USER type ID: ${USER} (should be 18)`);
console.log(`   TOKEN type ID: ${TOKEN} (should be 125)`);
console.log(`   PASSWORD type ID: ${PASSWORD} (should be 20)`);
console.log(`   EMAIL type ID: ${EMAIL} (should be 41)`);
console.log(`   ROLE type ID: ${ROLE} (should be 42)`);
console.log(`   DATABASE type ID: ${DATABASE} (should be 271)`);
console.log(`   XSRF type ID: ${XSRF} (should be 40)`);
console.log();

// Test Basic Types
console.log('2. Basic Types Mapping:');
console.log(`   Type 3 (SHORT): ${BASIC_TYPES[3]}`);
console.log(`   Type 9 (DATE): ${BASIC_TYPES[9]}`);
console.log(`   Type 13 (NUMBER): ${BASIC_TYPES[13]}`);
console.log();

// Test Grants
console.log('3. Grant Levels:');
console.log(`   Available grants: ${Object.values(GRANTS).join(', ')}`);
console.log();

// Test Validation Utilities
console.log('4. Database Name Validation:');
const dbNames = ['my', 'test123', 'MyDatabase', 'a', '123invalid', 'too-long-database-name-here'];
dbNames.forEach(name => {
  const isValid = validateDbName(name);
  console.log(`   "${name}": ${isValid ? 'VALID' : 'INVALID'}`);
});
console.log();

// Test Email Validation
console.log('5. Email Validation:');
const emails = ['user@example.com', 'test@test.co.uk', 'invalid', 'no@domain'];
emails.forEach(email => {
  const isValid = validateEmail(email);
  console.log(`   "${email}": ${isValid ? 'VALID' : 'INVALID'}`);
});
console.log();

// Test SQL Injection Prevention
console.log('6. SQL Injection Prevention:');
const injectionTests = ['normal_column', 'id; DROP TABLE users;--', "val' OR '1'='1", 'SELECT * FROM'];
injectionTests.forEach(input => {
  const hasInjection = hasInjectionPattern(input);
  console.log(`   "${input}": ${hasInjection ? 'INJECTION DETECTED' : 'Clean'}`);
});
console.log();

// Test String Escaping
console.log('7. String Escaping:');
const stringsToEscape = ["Hello 'World'", 'Say "Hi"', 'Back\\slash', 'Line\nBreak'];
stringsToEscape.forEach(str => {
  console.log(`   "${str}" => "${escapeString(str)}"`);
});
console.log();

// Test Translation Helper
console.log('8. Translation Helper (t9n):');
console.log(`   Multi-lang "[RU]Привет[EN]Hello": ${t9n('[RU]Привет[EN]Hello', 'EN')}`);
console.log(`   Multi-lang "[RU]Привет[EN]Hello" (RU): ${t9n('[RU]Привет[EN]Hello', 'RU')}`);
console.log(`   No markers "plain text": ${t9n('plain text', 'EN')}`);
console.log();

// Test Error Classes
console.log('9. Error Classes:');
try {
  throw new ValidationError('Invalid input', { field: 'email' });
} catch (e) {
  console.log(`   ValidationError: ${e.message}`);
  console.log(`   Error code: ${e.code}`);
  console.log(`   Status code: ${e.statusCode}`);
  console.log(`   toJSON():`, JSON.stringify(e.toJSON()));
}
console.log();

try {
  throw new AuthenticationError('Invalid credentials');
} catch (e) {
  console.log(`   AuthenticationError: ${e.message}`);
  console.log(`   toLegacyFormat():`, JSON.stringify(e.toLegacyFormat()));
}
console.log();

console.log('===== All Tests Complete =====');
