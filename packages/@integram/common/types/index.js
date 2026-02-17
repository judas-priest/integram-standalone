/**
 * @integram/common - Type Definitions
 *
 * TypeScript-style JSDoc type definitions for Integram services.
 * These types provide documentation and IDE support without TypeScript compilation.
 */

// ============================================================================
// User Types
// ============================================================================

/**
 * @typedef {Object} User
 * @property {number} id - User's unique identifier
 * @property {string} val - Username (typically email or login)
 * @property {number} [roleId] - User's role ID
 * @property {string} [role] - User's role name
 * @property {string} [email] - User's email address
 * @property {string} [token] - User's authentication token
 * @property {string} [xsrf] - User's XSRF token
 * @property {number} [activity] - Last activity timestamp
 */

/**
 * @typedef {Object} UserRegistration
 * @property {string} email - User's email address
 * @property {string} password - User's password
 * @property {string} passwordConfirm - Password confirmation
 * @property {boolean} agree - User agreed to terms
 */

/**
 * @typedef {Object} UserLogin
 * @property {string} username - Username or email
 * @property {string} password - Password
 */

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * @typedef {Object} AuthResult
 * @property {boolean} success - Whether authentication succeeded
 * @property {string} [token] - Authentication token on success
 * @property {string} [xsrf] - XSRF token on success
 * @property {User} [user] - User data on success
 * @property {string} [error] - Error message on failure
 * @property {string} [code] - Error code on failure
 */

/**
 * @typedef {Object} TokenValidation
 * @property {boolean} valid - Whether token is valid
 * @property {number} [userId] - User ID if valid
 * @property {string} [username] - Username if valid
 * @property {string} [role] - User role if valid
 * @property {Object.<number, string>} [grants] - User's grants
 */

/**
 * @typedef {'READ' | 'WRITE' | 'BARRED'} GrantLevel
 */

/**
 * @typedef {Object.<number, GrantLevel>} Grants
 */

// ============================================================================
// Database Types
// ============================================================================

/**
 * @typedef {Object} DatabaseInfo
 * @property {string} name - Database name
 * @property {string} [template] - Template used to create database
 * @property {string} [createdAt] - Creation date
 * @property {string} [owner] - Owner user
 */

/**
 * @typedef {Object} IntObject
 * @property {number} id - Object's unique identifier
 * @property {number} up - Parent object ID (0 for root)
 * @property {number} ord - Order within parent
 * @property {number} t - Type ID
 * @property {string} val - Object value
 */

/**
 * @typedef {Object} ObjectQuery
 * @property {string} database - Database name
 * @property {number} type - Object type ID
 * @property {Object.<string, string>} [filters] - Query filters
 * @property {number} [limit] - Maximum results
 * @property {number} [offset] - Results offset
 * @property {string} [orderBy] - Order by field
 * @property {'ASC' | 'DESC'} [orderDir] - Order direction
 */

/**
 * @typedef {Object} ObjectCreate
 * @property {string} database - Database name
 * @property {number} parentId - Parent object ID
 * @property {number} type - Object type ID
 * @property {string} value - Object value
 * @property {Object.<number, string>} [attributes] - Additional attributes
 */

// ============================================================================
// Report Types
// ============================================================================

/**
 * @typedef {Object} ReportColumn
 * @property {number} id - Column ID
 * @property {string} name - Column name
 * @property {number} [type] - Column data type
 * @property {string} [format] - Display format
 * @property {string} [formula] - Calculation formula
 * @property {string} [alias] - Column alias
 * @property {boolean} [hidden] - Whether column is hidden
 * @property {'ASC' | 'DESC'} [sort] - Sort direction
 */

/**
 * @typedef {Object} Report
 * @property {number} id - Report ID
 * @property {string} name - Report name
 * @property {ReportColumn[]} columns - Report columns
 * @property {string} [where] - WHERE clause
 * @property {string} [join] - JOIN clause
 * @property {number} [limit] - Result limit
 */

/**
 * @typedef {Object} ReportResult
 * @property {string[][]} data - Result data as 2D array
 * @property {string[]} headers - Column headers
 * @property {number} total - Total record count
 */

// ============================================================================
// API Response Types
// ============================================================================

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether request succeeded
 * @property {*} [data] - Response data
 * @property {string} [error] - Error message
 * @property {string} [code] - Error code
 */

/**
 * JSON_DATA format response (legacy compatibility).
 * @typedef {string[][]} JsonDataResponse
 * @example [["id","val","up","t","ord"],["1","active","0","18","1"]]
 */

/**
 * JSON_KV format response (legacy compatibility).
 * @typedef {Object.<string, string>} JsonKvResponse
 */

/**
 * JSON_CR format response (legacy compatibility).
 * @typedef {Object} JsonCrResponse
 * @property {number} inserted - Inserted record ID
 * @property {string} [error] - Error if failed
 */

/**
 * JSON_HR format response (legacy compatibility).
 * @typedef {Object[]} JsonHrResponse
 */

// ============================================================================
// Request Types
// ============================================================================

/**
 * @typedef {Object} LegacyRequest
 * @property {string} [JSON_DATA] - JSON_DATA format flag
 * @property {string} [JSON_KV] - JSON_KV format flag
 * @property {string} [JSON_CR] - JSON_CR format flag
 * @property {string} [JSON_HR] - JSON_HR format flag
 * @property {string} [JSON] - Generic JSON flag
 * @property {Object.<string, string>} [filters] - Query filters
 */

/**
 * @typedef {Object} ModernRequest
 * @property {string} database - Database name
 * @property {number} [type] - Object type ID
 * @property {number} [id] - Object ID
 * @property {string} [action] - Action to perform
 * @property {Object} [data] - Request data
 * @property {Object} [filters] - Query filters
 */

// ============================================================================
// OAuth Types
// ============================================================================

/**
 * @typedef {Object} OAuthProvider
 * @property {string} clientId - OAuth client ID
 * @property {string} clientSecret - OAuth client secret
 * @property {string} redirectUri - OAuth redirect URI
 * @property {string} [baseUrl] - Provider base URL
 * @property {string} [tokenEndpoint] - Token endpoint URL
 * @property {string} [authEndpoint] - Auth endpoint URL
 */

/**
 * @typedef {Object} OAuthToken
 * @property {string} accessToken - Access token
 * @property {string} [refreshToken] - Refresh token
 * @property {number} expiresIn - Expiration time in seconds
 * @property {string} tokenType - Token type (usually 'Bearer')
 */

/**
 * @typedef {Object} OAuthUserInfo
 * @property {string} id - Provider-specific user ID
 * @property {string} email - User's email
 * @property {string} [name] - User's display name
 * @property {string} [picture] - Profile picture URL
 * @property {string} provider - OAuth provider name
 */

// ============================================================================
// File Types
// ============================================================================

/**
 * @typedef {Object} FileUpload
 * @property {string} filename - Original filename
 * @property {string} mimetype - File MIME type
 * @property {number} size - File size in bytes
 * @property {Buffer} buffer - File contents
 */

/**
 * @typedef {Object} FileInfo
 * @property {number} id - File object ID
 * @property {string} name - Filename
 * @property {string} path - Server file path
 * @property {string} [url] - Public URL
 * @property {number} size - File size
 * @property {string} mime - MIME type
 */

// ============================================================================
// Export Types
// ============================================================================

/**
 * @typedef {'CSV' | 'XLSX' | 'PDF' | 'JSON'} ExportFormat
 */

/**
 * @typedef {Object} ExportOptions
 * @property {ExportFormat} format - Export format
 * @property {string} filename - Output filename
 * @property {string[]} [columns] - Columns to include
 * @property {boolean} [includeHeaders] - Include column headers
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} host - Database host
 * @property {number} port - Database port
 * @property {string} user - Database user
 * @property {string} password - Database password
 * @property {string} database - Default database name
 */

/**
 * @typedef {Object} ServiceConfig
 * @property {string} name - Service name
 * @property {number} port - Service port
 * @property {string} [host] - Service host
 * @property {boolean} [ssl] - Use SSL
 * @property {Object} [features] - Feature flags
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * @typedef {Object} IntEvent
 * @property {string} type - Event type
 * @property {string} database - Database name
 * @property {number} [objectId] - Object ID
 * @property {number} [typeId] - Type ID
 * @property {number} [userId] - User ID
 * @property {Object} [data] - Event data
 * @property {string} timestamp - Event timestamp
 */

// ============================================================================
// Type Guards (runtime type checking)
// ============================================================================

/**
 * Check if value is a valid User object.
 * @param {*} obj - Value to check
 * @returns {boolean} True if valid User
 */
export function isUser(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'number' &&
    typeof obj.val === 'string'
  );
}

/**
 * Check if value is a valid IntObject.
 * @param {*} obj - Value to check
 * @returns {boolean} True if valid IntObject
 */
export function isIntObject(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'number' &&
    typeof obj.up === 'number' &&
    typeof obj.t === 'number' &&
    typeof obj.val === 'string'
  );
}

/**
 * Check if value is a valid GrantLevel.
 * @param {*} value - Value to check
 * @returns {boolean} True if valid GrantLevel
 */
export function isGrantLevel(value) {
  return value === 'READ' || value === 'WRITE' || value === 'BARRED';
}

/**
 * Check if value is a valid ExportFormat.
 * @param {*} value - Value to check
 * @returns {boolean} True if valid ExportFormat
 */
export function isExportFormat(value) {
  return ['CSV', 'XLSX', 'PDF', 'JSON'].includes(value);
}

// ============================================================================
// Export type guards
// ============================================================================

export default {
  isUser,
  isIntObject,
  isGrantLevel,
  isExportFormat,
};
