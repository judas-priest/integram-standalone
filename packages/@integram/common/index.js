/**
 * @integram/common - Main Entry Point
 *
 * Shared types, interfaces, utilities, and constants for Integram services.
 * This package provides backward-compatible utilities based on the PHP monolith.
 */

// ============================================================================
// Re-export all modules
// ============================================================================

export * from './constants/index.js';
export * from './utils/index.js';
export * from './errors/index.js';
export * from './types/index.js';

// ============================================================================
// Import defaults for convenient access
// ============================================================================

import constants from './constants/index.js';
import utils from './utils/index.js';
import errors from './errors/index.js';
import types from './types/index.js';

// ============================================================================
// Package information
// ============================================================================

export const PACKAGE_NAME = '@integram/common';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// Export default object with all modules
// ============================================================================

export default {
  ...constants,
  ...utils,
  errors,
  types,
  PACKAGE_NAME,
  PACKAGE_VERSION,
};
