/**
 * ValidationService - Input validation for Integram
 *
 * Maps to PHP functions: checkInjection(), BlackList(), checkDbName(),
 * Val_barred_by_mask(), etc.
 * Provides security validation and input sanitization.
 */

import { InjectionError, ValidationError } from '@integram/common';
import { DB_MASK, USER_DB_MASK, MAIL_MASK, DIR_MASK, FILE_MASK } from '@integram/common';

/**
 * Service for validating and sanitizing input.
 */
export class ValidationService {
  /**
   * Create a new ValidationService.
   *
   * @param {Object} [options] - Service options
   * @param {Array<string>} [options.reservedWords] - Additional reserved words
   */
  constructor(options = {}) {
    this.reservedWords = [
      ...this._getMySQLReservedWords(),
      ...(options.reservedWords || []),
    ];

    // File extensions blacklist (maps to PHP BlackList)
    this.blacklistedExtensions = [
      'php',
      'cgi',
      'pl',
      'fcgi',
      'fpl',
      'phtml',
      'shtml',
      'php2',
      'php3',
      'php4',
      'php5',
      'asp',
      'jsp',
    ];

    // Regex patterns
    this.patterns = {
      dbName: DB_MASK || /^[a-z]\w{1,14}$/i,
      userDbName: USER_DB_MASK || /^[a-z]\w{2,14}$/i,
      email: MAIL_MASK || /.+@.+\..+/i,
      dirName: DIR_MASK || /^[a-z0-9_]+$/i,
      fileName: FILE_MASK || /^[a-z0-9_.]+$/i,
    };

    // SQL injection patterns
    this.injectionPatterns = [
      /\b(from|select|table)\b/i,
      /\b(insert|update|delete|drop|truncate)\b/i,
      /\b(union|join)\b.*\b(select)\b/i,
      /--/,
      /;.*$/,
      /'.*'/,
    ];
  }

  /**
   * Get MySQL reserved words.
   *
   * @returns {Array<string>} Reserved words
   * @private
   */
  _getMySQLReservedWords() {
    return [
      'ACCESSIBLE', 'ADD', 'ALL', 'ALTER', 'ANALYZE', 'AND', 'AS', 'ASC',
      'ASENSITIVE', 'BEFORE', 'BETWEEN', 'BIGINT', 'BINARY', 'BLOB', 'BOTH',
      'BY', 'CALL', 'CASCADE', 'CASE', 'CHANGE', 'CHAR', 'CHARACTER', 'CHECK',
      'COLLATE', 'COLUMN', 'CONDITION', 'CONSTRAINT', 'CONTINUE', 'CONVERT',
      'CREATE', 'CROSS', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
      'CURRENT_USER', 'CURSOR', 'DATABASE', 'DATABASES', 'DAY_HOUR',
      'DAY_MICROSECOND', 'DAY_MINUTE', 'DAY_SECOND', 'DEC', 'DECIMAL',
      'DECLARE', 'DEFAULT', 'DELAYED', 'DELETE', 'DESC', 'DESCRIBE',
      'DETERMINISTIC', 'DISTINCT', 'DISTINCTROW', 'DIV', 'DOUBLE', 'DROP',
      'DUAL', 'EACH', 'ELSE', 'ELSEIF', 'ENCLOSED', 'ESCAPED', 'EXISTS',
      'EXIT', 'EXPLAIN', 'FALSE', 'FETCH', 'FLOAT', 'FLOAT4', 'FLOAT8',
      'FOR', 'FORCE', 'FOREIGN', 'FROM', 'FULLTEXT', 'GRANT', 'GROUP',
      'HAVING', 'HIGH_PRIORITY', 'HOUR_MICROSECOND', 'HOUR_MINUTE',
      'HOUR_SECOND', 'IF', 'IGNORE', 'IN', 'INDEX', 'INFILE', 'INNER',
      'INOUT', 'INSENSITIVE', 'INSERT', 'INT', 'INT1', 'INT2', 'INT3',
      'INT4', 'INT8', 'INTEGER', 'INTERVAL', 'INTO', 'IS', 'ITERATE',
      'JOIN', 'KEY', 'KEYS', 'KILL', 'LEADING', 'LEAVE', 'LEFT', 'LIKE',
      'LIMIT', 'LINEAR', 'LINES', 'LOAD', 'LOCALTIME', 'LOCALTIMESTAMP',
      'LOCK', 'LONG', 'LONGBLOB', 'LONGTEXT', 'LOOP', 'LOW_PRIORITY',
      'MASTER', 'MATCH', 'MAXVALUE', 'MEDIUMBLOB', 'MEDIUMINT', 'MEDIUMTEXT',
      'MIDDLEINT', 'MINUTE_MICROSECOND', 'MINUTE_SECOND', 'MOD', 'MODIFIES',
      'NATURAL', 'NOT', 'NO_WRITE_TO_BINLOG', 'NULL', 'NUMERIC', 'ON',
      'OPTIMIZE', 'OPTION', 'OPTIONALLY', 'OR', 'ORDER', 'OUT', 'OUTER',
      'OUTFILE', 'PARTITION', 'PRECISION', 'PRIMARY', 'PROCEDURE', 'PURGE',
      'RANGE', 'READ', 'READS', 'READ_WRITE', 'REAL', 'REFERENCES', 'REGEXP',
      'RELEASE', 'RENAME', 'REPEAT', 'REPLACE', 'REQUIRE', 'RESIGNAL',
      'RESTRICT', 'RETURN', 'REVOKE', 'RIGHT', 'RLIKE', 'SCHEMA', 'SCHEMAS',
      'SECOND_MICROSECOND', 'SELECT', 'SENSITIVE', 'SEPARATOR', 'SET',
      'SHOW', 'SIGNAL', 'SMALLINT', 'SPATIAL', 'SPECIFIC', 'SQL',
      'SQLEXCEPTION', 'SQLSTATE', 'SQLWARNING', 'SQL_BIG_RESULT',
      'SQL_CALC_FOUND_ROWS', 'SQL_SMALL_RESULT', 'SSL', 'STARTING',
      'STRAIGHT_JOIN', 'TABLE', 'TERMINATED', 'THEN', 'TINYBLOB', 'TINYINT',
      'TINYTEXT', 'TO', 'TRAILING', 'TRIGGER', 'TRUE', 'UNDO', 'UNION',
      'UNIQUE', 'UNLOCK', 'UNSIGNED', 'UPDATE', 'USAGE', 'USE', 'USING',
      'UTC_DATE', 'UTC_TIME', 'UTC_TIMESTAMP', 'VALUES', 'VARBINARY',
      'VARCHAR', 'VARCHARACTER', 'VARYING', 'WHEN', 'WHERE', 'WHILE',
      'WITH', 'WRITE', 'XOR', 'YEAR_MONTH', 'ZEROFILL',
    ];
  }

  /**
   * Check for SQL injection patterns.
   * Maps to PHP: checkInjection()
   *
   * @param {string} value - Value to check
   * @throws {InjectionError} If injection pattern detected
   * @returns {string} Original value if safe
   */
  checkInjection(value) {
    if (!value || typeof value !== 'string') {
      return value;
    }

    for (const pattern of this.injectionPatterns) {
      const match = value.match(pattern);
      if (match) {
        throw new InjectionError(
          `SQL injection pattern detected: ${match[0]}`,
          { value, pattern: pattern.toString() }
        );
      }
    }

    return value;
  }

  /**
   * Check if value contains dangerous SQL keywords.
   *
   * @param {string} value - Value to check
   * @returns {boolean} True if contains dangerous patterns
   */
  hasInjectionPattern(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }

    try {
      this.checkInjection(value);
      return false;
    } catch (e) {
      return true;
    }
  }

  /**
   * Validate file extension.
   * Maps to PHP: BlackList()
   *
   * @param {string} extension - File extension
   * @throws {ValidationError} If extension is blacklisted
   * @returns {boolean} True if valid
   */
  validateFileExtension(extension) {
    if (!extension) {
      return true;
    }

    const ext = extension.toLowerCase().replace(/^\./, '');

    if (this.blacklistedExtensions.includes(ext)) {
      throw new ValidationError(
        'Invalid file extension',
        'FILE_EXTENSION',
        { extension: ext, blacklisted: this.blacklistedExtensions }
      );
    }

    return true;
  }

  /**
   * Validate database name.
   * Maps to PHP: checkDbName()
   *
   * @param {string} name - Database name
   * @param {boolean} [isUserDb=false] - Use stricter user database rules
   * @throws {ValidationError} If name is invalid
   * @returns {boolean} True if valid
   */
  validateDbName(name, isUserDb = false) {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Database name is required', 'DB_NAME_REQUIRED');
    }

    const pattern = isUserDb ? this.patterns.userDbName : this.patterns.dbName;

    if (!pattern.test(name)) {
      throw new ValidationError(
        'Invalid database name format',
        'DB_NAME_INVALID',
        { name, pattern: pattern.toString() }
      );
    }

    if (this.isReservedWord(name)) {
      throw new ValidationError(
        'Database name is a reserved word',
        'DB_NAME_RESERVED',
        { name }
      );
    }

    return true;
  }

  /**
   * Check if name is a MySQL reserved word.
   * Maps to PHP: checkDbNameReserved()
   *
   * @param {string} name - Name to check
   * @returns {boolean} True if reserved
   */
  isReservedWord(name) {
    return this.reservedWords.includes(name.toUpperCase());
  }

  /**
   * Validate email address.
   *
   * @param {string} email - Email address
   * @throws {ValidationError} If email is invalid
   * @returns {boolean} True if valid
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required', 'EMAIL_REQUIRED');
    }

    if (!this.patterns.email.test(email)) {
      throw new ValidationError(
        'Invalid email format',
        'EMAIL_INVALID',
        { email }
      );
    }

    return true;
  }

  /**
   * Validate directory name.
   *
   * @param {string} name - Directory name
   * @throws {ValidationError} If name is invalid
   * @returns {boolean} True if valid
   */
  validateDirName(name) {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Directory name is required', 'DIR_NAME_REQUIRED');
    }

    if (!this.patterns.dirName.test(name)) {
      throw new ValidationError(
        'Invalid directory name format',
        'DIR_NAME_INVALID',
        { name }
      );
    }

    return true;
  }

  /**
   * Validate file name.
   *
   * @param {string} name - File name
   * @throws {ValidationError} If name is invalid
   * @returns {boolean} True if valid
   */
  validateFileName(name) {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('File name is required', 'FILE_NAME_REQUIRED');
    }

    if (!this.patterns.fileName.test(name)) {
      throw new ValidationError(
        'Invalid file name format',
        'FILE_NAME_INVALID',
        { name }
      );
    }

    // Also check extension
    const ext = name.split('.').pop();
    this.validateFileExtension(ext);

    return true;
  }

  /**
   * Validate password strength.
   *
   * @param {string} password - Password
   * @param {Object} [options] - Validation options
   * @param {number} [options.minLength=6] - Minimum length
   * @throws {ValidationError} If password is weak
   * @returns {boolean} True if valid
   */
  validatePassword(password, options = {}) {
    const { minLength = 6 } = options;

    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required', 'PASSWORD_REQUIRED');
    }

    if (password.length < minLength) {
      throw new ValidationError(
        `Password must be at least ${minLength} characters`,
        'PASSWORD_TOO_SHORT',
        { minLength, actualLength: password.length }
      );
    }

    return true;
  }

  /**
   * Validate password confirmation matches.
   *
   * @param {string} password - Password
   * @param {string} confirmation - Password confirmation
   * @throws {ValidationError} If passwords don't match
   * @returns {boolean} True if valid
   */
  validatePasswordMatch(password, confirmation) {
    if (password !== confirmation) {
      throw new ValidationError(
        'Passwords do not match',
        'PASSWORD_MISMATCH'
      );
    }
    return true;
  }

  /**
   * Sanitize a string for safe use.
   *
   * @param {string} value - Value to sanitize
   * @param {Object} [options] - Sanitization options
   * @param {number} [options.maxLength] - Maximum length
   * @param {boolean} [options.trim=true] - Trim whitespace
   * @param {boolean} [options.lowercase=false] - Convert to lowercase
   * @returns {string} Sanitized value
   */
  sanitize(value, options = {}) {
    if (!value || typeof value !== 'string') {
      return '';
    }

    const { maxLength, trim = true, lowercase = false } = options;

    let result = value;

    if (trim) {
      result = result.trim();
    }

    if (lowercase) {
      result = result.toLowerCase();
    }

    if (maxLength && result.length > maxLength) {
      result = result.substring(0, maxLength);
    }

    return result;
  }

  /**
   * Escape a string for SQL (simple version).
   * Note: Always prefer parameterized queries over escaping.
   *
   * @param {string} value - Value to escape
   * @returns {string} Escaped value
   */
  escapeString(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }

    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\0/g, '\\0');
  }

  /**
   * Validate and parse an integer ID.
   *
   * @param {string|number} value - Value to parse
   * @param {string} [fieldName='ID'] - Field name for error messages
   * @throws {ValidationError} If not a valid integer
   * @returns {number} Parsed integer
   */
  validateId(value, fieldName = 'ID') {
    const id = parseInt(value, 10);

    if (isNaN(id) || id < 0) {
      throw new ValidationError(
        `Invalid ${fieldName}`,
        'INVALID_ID',
        { value, fieldName }
      );
    }

    return id;
  }

  /**
   * Validate a date string.
   *
   * @param {string} value - Date string
   * @param {Object} [options] - Validation options
   * @param {boolean} [options.allowFuture=true] - Allow future dates
   * @param {boolean} [options.allowPast=true] - Allow past dates
   * @throws {ValidationError} If date is invalid
   * @returns {boolean} True if valid
   */
  validateDate(value, options = {}) {
    const { allowFuture = true, allowPast = true } = options;

    if (!value || typeof value !== 'string') {
      throw new ValidationError('Date is required', 'DATE_REQUIRED');
    }

    // Try to parse the date
    let date;
    let year, month, day;

    // YYYYMMDD format
    if (/^\d{8}$/.test(value)) {
      year = parseInt(value.substring(0, 4), 10);
      month = parseInt(value.substring(4, 6), 10);
      day = parseInt(value.substring(6, 8), 10);

      // Validate month and day ranges
      if (month < 1 || month > 12) {
        throw new ValidationError(
          'Invalid date format',
          'DATE_INVALID',
          { value, reason: 'Invalid month' }
        );
      }

      if (day < 1 || day > 31) {
        throw new ValidationError(
          'Invalid date format',
          'DATE_INVALID',
          { value, reason: 'Invalid day' }
        );
      }

      date = new Date(year, month - 1, day);

      // Check if the date rolled over (e.g., Feb 30 becomes Mar 2)
      if (date.getMonth() !== month - 1 || date.getDate() !== day) {
        throw new ValidationError(
          'Invalid date format',
          'DATE_INVALID',
          { value, reason: 'Date does not exist' }
        );
      }
    } else {
      date = new Date(value);
    }

    if (isNaN(date.getTime())) {
      throw new ValidationError(
        'Invalid date format',
        'DATE_INVALID',
        { value }
      );
    }

    const now = new Date();

    if (!allowFuture && date > now) {
      throw new ValidationError(
        'Future dates are not allowed',
        'DATE_FUTURE_NOT_ALLOWED',
        { value }
      );
    }

    if (!allowPast && date < now) {
      throw new ValidationError(
        'Past dates are not allowed',
        'DATE_PAST_NOT_ALLOWED',
        { value }
      );
    }

    return true;
  }
}

export default ValidationService;
