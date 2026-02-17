/**
 * @integram/common - Error Classes
 *
 * Custom error classes for consistent error handling across services.
 * These provide structured errors for backward-compatible API responses.
 */

// ============================================================================
// Base Error Classes
// ============================================================================

/**
 * Base class for all Integram errors.
 */
export class IntegramError extends Error {
  constructor(message, code = 'INTEGRAM_ERROR', statusCode = 500, details = null) {
    super(message);
    this.name = 'IntegramError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for API responses.
   * Format matches legacy PHP JSON error format.
   */
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }

  /**
   * Convert to legacy PHP error format (array with error key).
   */
  toLegacyFormat() {
    return [{ error: this.message }];
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends IntegramError {
  constructor(message = 'Authentication failed', details = null) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when token is invalid or expired.
 */
export class TokenError extends IntegramError {
  constructor(message = 'Invalid or expired token', details = null) {
    super(message, 'TOKEN_ERROR', 401, details);
    this.name = 'TokenError';
  }
}

/**
 * Error thrown when XSRF token is invalid.
 */
export class XsrfError extends IntegramError {
  constructor(message = 'Invalid XSRF token', details = null) {
    super(message, 'XSRF_ERROR', 403, details);
    this.name = 'XsrfError';
  }
}

// ============================================================================
// Authorization Errors
// ============================================================================

/**
 * Error thrown when user lacks permission for an action.
 */
export class AuthorizationError extends IntegramError {
  constructor(message = 'Access denied', details = null) {
    super(message, 'AUTHZ_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Error thrown when grant check fails.
 * Maps to PHP: Check_Grant() failure
 */
export class GrantError extends IntegramError {
  constructor(
    objectId,
    typeId,
    requiredGrant = 'WRITE',
    details = null
  ) {
    const message = `No access to object ${objectId}, type ${typeId}. Required: ${requiredGrant}`;
    super(message, 'GRANT_ERROR', 403, {
      objectId,
      typeId,
      requiredGrant,
      ...details,
    });
    this.name = 'GrantError';
  }
}

/**
 * Error thrown when user has no role assigned.
 */
export class RoleError extends IntegramError {
  constructor(username, details = null) {
    super(`No role assigned to user ${username}`, 'ROLE_ERROR', 403, details);
    this.name = 'RoleError';
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends IntegramError {
  constructor(message = 'Validation failed', fields = null) {
    super(message, 'VALIDATION_ERROR', 400, { fields });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when database name is invalid.
 */
export class InvalidDbNameError extends ValidationError {
  constructor(dbName) {
    super(`Invalid database name: ${dbName}`, { dbName });
    this.code = 'INVALID_DB_NAME';
    this.name = 'InvalidDbNameError';
  }
}

/**
 * Error thrown when email format is invalid.
 */
export class InvalidEmailError extends ValidationError {
  constructor(email) {
    super(`Invalid email format: ${email}`, { email });
    this.code = 'INVALID_EMAIL';
    this.name = 'InvalidEmailError';
  }
}

/**
 * Error thrown when file extension is blacklisted.
 */
export class BlacklistedFileError extends ValidationError {
  constructor(extension) {
    super(`Blacklisted file extension: ${extension}`, { extension });
    this.code = 'BLACKLISTED_FILE';
    this.name = 'BlacklistedFileError';
  }
}

/**
 * Error thrown when SQL injection is detected.
 */
export class InjectionError extends ValidationError {
  constructor(value) {
    super('SQL injection pattern detected', { value: value?.substring(0, 100) });
    this.code = 'INJECTION_DETECTED';
    this.name = 'InjectionError';
  }
}

// ============================================================================
// Database Errors
// ============================================================================

/**
 * Error thrown when database query fails.
 */
export class DatabaseError extends IntegramError {
  constructor(message, query = null, originalError = null) {
    super(message, 'DB_ERROR', 500, {
      query: query?.substring(0, 500), // Truncate for safety
      originalError: originalError?.message,
    });
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * Error thrown when database does not exist.
 * Maps to PHP: mysqli_errno===1146
 */
export class DatabaseNotFoundError extends IntegramError {
  constructor(dbName) {
    super(`Database ${dbName} does not exist`, 'DB_NOT_FOUND', 404, { dbName });
    this.name = 'DatabaseNotFoundError';
  }
}

/**
 * Error thrown when object is not found.
 */
export class ObjectNotFoundError extends IntegramError {
  constructor(objectId, typeId = null) {
    const message = typeId
      ? `Object ${objectId} of type ${typeId} not found`
      : `Object ${objectId} not found`;
    super(message, 'OBJECT_NOT_FOUND', 404, { objectId, typeId });
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Error thrown when user is not found.
 */
export class UserNotFoundError extends IntegramError {
  constructor(identifier) {
    super(`User not found: ${identifier}`, 'USER_NOT_FOUND', 404, { identifier });
    this.name = 'UserNotFoundError';
  }
}

/**
 * Error thrown when duplicate entry is detected.
 */
export class DuplicateError extends IntegramError {
  constructor(field, value) {
    super(`Duplicate ${field}: ${value}`, 'DUPLICATE_ERROR', 409, { field, value });
    this.name = 'DuplicateError';
  }
}

// ============================================================================
// File Errors
// ============================================================================

/**
 * Error thrown when file operation fails.
 */
export class FileError extends IntegramError {
  constructor(message, path = null, operation = null) {
    super(message, 'FILE_ERROR', 500, { path, operation });
    this.name = 'FileError';
  }
}

/**
 * Error thrown when file is not found.
 */
export class FileNotFoundError extends IntegramError {
  constructor(path) {
    super(`File not found: ${path}`, 'FILE_NOT_FOUND', 404, { path });
    this.name = 'FileNotFoundError';
  }
}

// ============================================================================
// Email Errors
// ============================================================================

/**
 * Error thrown when email sending fails.
 */
export class EmailError extends IntegramError {
  constructor(message, recipient = null, originalError = null) {
    super(message, 'EMAIL_ERROR', 500, {
      recipient,
      originalError: originalError?.message,
    });
    this.name = 'EmailError';
    this.originalError = originalError;
  }
}

// ============================================================================
// Registration/Login Errors
// ============================================================================

/**
 * Error thrown when registration fails.
 */
export class RegistrationError extends IntegramError {
  constructor(message, details = null) {
    super(message, 'REGISTRATION_ERROR', 400, details);
    this.name = 'RegistrationError';
  }
}

/**
 * Error thrown when email is already registered.
 */
export class EmailExistsError extends RegistrationError {
  constructor(email) {
    super('This email is already registered [errMailExists]', { email });
    this.code = 'EMAIL_EXISTS';
    this.name = 'EmailExistsError';
  }
}

/**
 * Error thrown when password is invalid.
 */
export class PasswordError extends ValidationError {
  constructor(message = 'Invalid password') {
    super(message, { field: 'password' });
    this.code = 'PASSWORD_ERROR';
    this.name = 'PasswordError';
  }
}

// ============================================================================
// OAuth Errors
// ============================================================================

/**
 * Error thrown when OAuth authentication fails.
 */
export class OAuthError extends AuthenticationError {
  constructor(provider, message = 'OAuth authentication failed') {
    super(message, { provider });
    this.code = 'OAUTH_ERROR';
    this.name = 'OAuthError';
  }
}

// ============================================================================
// Export all error classes
// ============================================================================

export default {
  // Base
  IntegramError,

  // Authentication
  AuthenticationError,
  TokenError,
  XsrfError,

  // Authorization
  AuthorizationError,
  GrantError,
  RoleError,

  // Validation
  ValidationError,
  InvalidDbNameError,
  InvalidEmailError,
  BlacklistedFileError,
  InjectionError,

  // Database
  DatabaseError,
  DatabaseNotFoundError,
  ObjectNotFoundError,
  UserNotFoundError,
  DuplicateError,

  // File
  FileError,
  FileNotFoundError,

  // Email
  EmailError,

  // Registration
  RegistrationError,
  EmailExistsError,
  PasswordError,

  // OAuth
  OAuthError,
};
