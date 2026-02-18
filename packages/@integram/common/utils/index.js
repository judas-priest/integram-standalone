/**
 * @integram/common - Utility Functions
 *
 * These utilities mirror the PHP monolith functions for backward compatibility.
 * See: integram-server/index.php for original PHP implementations.
 */

import {
  DB_MASK,
  USER_DB_MASK,
  MAIL_MASK,
  BLACKLISTED_EXTENSIONS,
  SQL_RESERVED_WORDS_SET,
  BASIC_TYPES,
} from '../constants/index.js';

// Import Russian locale functions
import russianLocale from './russian-locale.js';

// Re-export Russian locale functions
export * from './russian-locale.js';

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate database name against the standard pattern.
 * Maps to PHP: checkDbName()
 *
 * @param {string} dbName - Database name to validate
 * @param {RegExp} mask - Pattern to validate against (default: DB_MASK)
 * @returns {boolean} True if valid, false otherwise
 */
export function validateDbName(dbName, mask = DB_MASK) {
  if (!dbName || typeof dbName !== 'string') return false;
  return mask.test(dbName);
}

/**
 * Check if database name is a reserved SQL word.
 * Maps to PHP: checkDbNameReserved()
 *
 * @param {string} dbName - Database name to check
 * @returns {boolean} True if reserved, false otherwise
 */
export function isDbNameReserved(dbName) {
  if (!dbName || typeof dbName !== 'string') return false;
  return SQL_RESERVED_WORDS_SET.has(dbName.toUpperCase());
}

/**
 * Check if database name is valid (passes pattern and not reserved).
 *
 * @param {string} dbName - Database name to validate
 * @param {RegExp} mask - Pattern to validate against (default: DB_MASK)
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidDbName(dbName, mask = DB_MASK) {
  return validateDbName(dbName, mask) && !isDbNameReserved(dbName);
}

/**
 * Validate email address format.
 *
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid format, false otherwise
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return MAIL_MASK.test(email);
}

/**
 * Check if file extension is blacklisted (security check).
 * Maps to PHP: BlackList()
 *
 * @param {string} extension - File extension to check
 * @returns {boolean} True if blacklisted, false otherwise
 */
export function isBlacklistedExtension(extension) {
  if (!extension || typeof extension !== 'string') return false;
  return BLACKLISTED_EXTENSIONS.includes(extension.toLowerCase());
}

/**
 * Check for potential SQL injection patterns in a value.
 * Maps to PHP: checkInjection()
 *
 * @param {string} value - Value to check
 * @returns {boolean} True if injection detected, false if safe
 */
export function hasInjectionPattern(value) {
  if (!value || typeof value !== 'string') return false;
  const pattern = /(\b(from|select|table)\b)/i;
  return pattern.test(value);
}

// ============================================================================
// Translation Utilities
// ============================================================================

/**
 * Extract localized text from multi-language string.
 * Maps to PHP: t9n()
 *
 * Format: "[RU]Текст[EN]Text[DE]Texte"
 *
 * @param {string} msg - Multi-language message string
 * @param {string} locale - Locale code (RU, EN, DE, etc.)
 * @returns {string} Localized text
 */
export function translate(msg, locale = 'EN') {
  if (!msg || typeof msg !== 'string') return msg;

  const localeMarker = `[${locale}]`;
  const startPos = msg.indexOf(localeMarker);

  if (startPos === -1) return msg;

  let localizedText = msg.substring(startPos + localeMarker.length);

  // Find the next language marker and truncate
  const match = localizedText.match(/(.*?)\[[A-Z]{2}\]/s);
  if (match?.[1]) {
    return match[1];
  }

  return localizedText;
}

/**
 * Alias for translate function (matches PHP t9n naming).
 */
export const t9n = translate;

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Generate a SHA1 hash salt combined with value.
 * Note: In production, use crypto module for actual hashing.
 * Maps to PHP: Salt()
 *
 * @param {string} user - Username or key
 * @param {string} value - Value to salt
 * @returns {string} Combined string for hashing
 */
export function salt(user, value) {
  // This is a placeholder - actual implementation uses crypto
  return `${user}:${value}`;
}

/**
 * Generate XSRF token.
 * Maps to PHP: xsrf()
 *
 * @param {string} a - First component (typically token)
 * @param {string} b - Second component (typically db name)
 * @returns {string} XSRF token (first 22 chars of SHA1)
 */
export function generateXsrf(a, b) {
  // Placeholder - actual implementation needs crypto
  const combined = salt(a, b);
  // In real implementation: return sha1(combined).substring(0, 22);
  return combined.substring(0, 22);
}

/**
 * Escape special characters for SQL (safe string).
 * Note: Use parameterized queries instead when possible.
 *
 * @param {string} value - Value to escape
 * @returns {string} Escaped value
 */
export function escapeString(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\x00/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
}

/**
 * Mask CSV delimiters in a value.
 * Maps to PHP: maskCsvDelimiters()
 *
 * @param {string} value - Value to mask
 * @returns {string} Masked value
 */
export function maskCsvDelimiters(value) {
  if (!value || typeof value !== 'string') return value;
  return value
    .replace(/;/g, '::SEMI::')
    .replace(/,/g, '::COMMA::')
    .replace(/\n/g, '::NEWLINE::');
}

/**
 * Unmask CSV delimiters in a value.
 *
 * @param {string} value - Value to unmask
 * @returns {string} Unmasked value
 */
export function unmaskCsvDelimiters(value) {
  if (!value || typeof value !== 'string') return value;
  return value
    .replace(/::SEMI::/g, ';')
    .replace(/::COMMA::/g, ',')
    .replace(/::NEWLINE::/g, '\n');
}

/**
 * Slash semicolons (escape for storage).
 * Maps to PHP: Slash_semi()
 *
 * @param {string} str - String to process
 * @returns {string} Processed string
 */
export function slashSemi(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/;/g, '\\;');
}

/**
 * Unslash semicolons (unescape for display).
 * Maps to PHP: UnSlash_semi()
 *
 * @param {string} str - String to process
 * @returns {string} Processed string
 */
export function unslashSemi(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\\;/g, ';');
}

/**
 * Mask delimiters for internal processing.
 * Maps to PHP: MaskDelimiters()
 *
 * @param {string} value - Value to mask
 * @returns {string} Masked value
 */
export function maskDelimiters(value) {
  if (!value || typeof value !== 'string') return value;
  return value.replace(/\[/g, '::LBRACKET::').replace(/\]/g, '::RBRACKET::');
}

/**
 * Unmask delimiters after processing.
 * Maps to PHP: UnMaskDelimiters()
 *
 * @param {string} value - Value to unmask
 * @returns {string} Unmasked value
 */
export function unmaskDelimiters(value) {
  if (!value || typeof value !== 'string') return value;
  return value.replace(/::LBRACKET::/g, '[').replace(/::RBRACKET::/g, ']');
}

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Generate secure subdirectory name for file storage.
 * Maps to PHP: GetSubdir()
 *
 * @param {number} id - Object ID
 * @param {string} uploadDir - Base upload directory
 * @returns {string} Subdirectory path
 */
export function getSubdir(id, uploadDir = 'download/') {
  const subDir = Math.floor(id / 1000);
  // Note: In real implementation, include hash suffix
  return `${uploadDir}${subDir}`;
}

/**
 * Generate secure filename for file storage.
 * Maps to PHP: GetFilename()
 *
 * @param {number} id - Object ID
 * @returns {string} Filename
 */
export function getFilename(id) {
  const idStr = String(id).padStart(3, '0').slice(-3);
  // Note: In real implementation, include hash suffix
  return idStr;
}

/**
 * Format file size for display.
 * Maps to PHP: NormalSize()
 *
 * @param {number} size - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(size) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let fileSize = size;

  while (fileSize >= 1024 && unitIndex < units.length - 1) {
    fileSize /= 1024;
    unitIndex++;
  }

  return `${fileSize.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

// ============================================================================
// Data Formatting Utilities
// ============================================================================

/**
 * Get data type name from ID.
 *
 * @param {number} typeId - Type ID
 * @returns {string|null} Type name or null if not found
 */
export function getTypeName(typeId) {
  return BASIC_TYPES[typeId] || null;
}

/**
 * Format value based on data type for storage.
 * Maps to PHP: Format_Val()
 *
 * @param {number} typeId - Data type ID
 * @param {*} value - Value to format
 * @returns {string} Formatted value
 */
export function formatValueForStorage(typeId, value) {
  const typeName = BASIC_TYPES[typeId];

  if (value === null || value === undefined) return '';

  switch (typeName) {
    case 'DATE':
      // Convert to YYYYMMDD format
      if (value instanceof Date) {
        return value.toISOString().slice(0, 10).replace(/-/g, '');
      }
      // Handle string dates
      if (typeof value === 'string') {
        // Try to parse various date formats
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().slice(0, 10).replace(/-/g, '');
        }
      }
      return String(value);

    case 'DATETIME':
      if (value instanceof Date) {
        return value.toISOString().replace('T', ' ').slice(0, 19);
      }
      return String(value);

    case 'NUMBER':
    case 'SIGNED':
      return String(parseFloat(value) || 0);

    case 'BOOLEAN':
      return value ? '1' : '0';

    default:
      return String(value);
  }
}

/**
 * Format value based on data type for display.
 * Maps to PHP: Format_Val_View()
 *
 * @param {number} typeId - Data type ID
 * @param {*} value - Value to format
 * @param {string} locale - Locale for formatting (default: 'EN')
 * @returns {string} Formatted value for display
 */
export function formatValueForDisplay(typeId, value, locale = 'EN') {
  const typeName = BASIC_TYPES[typeId];

  if (value === null || value === undefined || value === '') return '';

  switch (typeName) {
    case 'DATE':
      // Format YYYYMMDD to locale date
      const dateStr = String(value);
      if (dateStr.length === 8) {
        const year = dateStr.slice(0, 4);
        const month = dateStr.slice(4, 6);
        const day = dateStr.slice(6, 8);
        return `${day}.${month}.${year}`;
      }
      return dateStr;

    case 'DATETIME':
      return String(value);

    case 'NUMBER':
      // Format with thousand separators
      const num = parseFloat(value);
      return isNaN(num) ? '' : num.toLocaleString(locale === 'RU' ? 'ru-RU' : 'en-US');

    case 'SIGNED':
      const signed = parseFloat(value);
      return isNaN(signed)
        ? ''
        : signed.toLocaleString(locale === 'RU' ? 'ru-RU' : 'en-US');

    case 'BOOLEAN':
      return value === '1' || value === true ? '✓' : '';

    case 'PWD':
      return '******';

    default:
      return String(value);
  }
}

/**
 * Get alignment for data type (used in UI rendering).
 * Maps to PHP: Get_Align()
 *
 * @param {number} typeId - Data type ID
 * @returns {string} CSS text-align value
 */
export function getAlignment(typeId) {
  const typeName = BASIC_TYPES[typeId];

  switch (typeName) {
    case 'NUMBER':
    case 'SIGNED':
      return 'right';
    case 'BOOLEAN':
      return 'center';
    default:
      return 'left';
  }
}

// ============================================================================
// Database Name Generation Utilities
// ============================================================================

/**
 * Convert email to database name.
 * Maps to PHP: mail2DB()
 *
 * @param {string} email - User's email address
 * @param {number} uid - User ID (fallback)
 * @returns {string} Database name
 */
export function emailToDbName(email, uid) {
  if (!email || typeof email !== 'string') {
    return `g${uid}`;
  }

  // Take the part before @
  const localPart = email.split('@')[0] || '';

  // Remove non-alphanumeric chars and limit to 15 chars
  const dbName = localPart.replace(/[^A-Za-z0-9]/g, '').substring(0, 15).toLowerCase();

  // Check if valid, otherwise use fallback
  if (validateDbName(dbName, USER_DB_MASK) && !isDbNameReserved(dbName)) {
    return dbName;
  }

  return `g${uid}`;
}

// ============================================================================
// Export default object with all utilities
// ============================================================================

export default {
  // Validation
  validateDbName,
  isDbNameReserved,
  isValidDbName,
  validateEmail,
  isBlacklistedExtension,
  hasInjectionPattern,

  // Translation
  translate,
  t9n,

  // String utilities
  salt,
  generateXsrf,
  escapeString,
  maskCsvDelimiters,
  unmaskCsvDelimiters,
  slashSemi,
  unslashSemi,
  maskDelimiters,
  unmaskDelimiters,

  // File utilities
  getSubdir,
  getFilename,
  formatFileSize,

  // Data formatting
  getTypeName,
  formatValueForStorage,
  formatValueForDisplay,
  getAlignment,

  // Database name
  emailToDbName,

  // Russian locale (re-export all)
  ...russianLocale,
};
