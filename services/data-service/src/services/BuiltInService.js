/**
 * BuiltInService - Built-in variable substitution
 *
 * Maps to PHP function: BuiltIn()
 * Replaces built-in placeholders like [TODAY], [USER], [NOW] with actual values.
 */

/**
 * Service for resolving built-in variable placeholders.
 */
export class BuiltInService {
  /**
   * Create a new BuiltInService.
   *
   * @param {Object} [options] - Service options
   * @param {Object} [options.context] - Request context with user info
   * @param {number} [options.timezone=0] - Timezone offset in seconds
   */
  constructor(options = {}) {
    this.context = options.context || {};
    this.timezone = options.timezone || 0;
  }

  /**
   * Set the current context.
   *
   * @param {Object} context - Context with user info
   * @param {string} [context.user] - Current username
   * @param {number} [context.userId] - Current user ID
   * @param {string} [context.role] - Current user role
   * @param {number} [context.roleId] - Current role ID
   * @param {string} [context.remoteAddr] - Client IP address
   * @param {string} [context.remoteHost] - Client hostname
   * @param {string} [context.userAgent] - Client user agent
   * @param {string} [context.referer] - HTTP referer
   * @param {string} [context.host] - Server host
   * @param {string} [context.requestUri] - Request URI
   */
  setContext(context) {
    this.context = context;
  }

  /**
   * Set timezone offset.
   *
   * @param {number} offset - Timezone offset in seconds
   */
  setTimezone(offset) {
    this.timezone = offset;
  }

  /**
   * Get current timestamp with timezone.
   *
   * @returns {number} Unix timestamp
   * @private
   */
  _now() {
    return Math.floor(Date.now() / 1000) + this.timezone;
  }

  /**
   * Format date as DD.MM.YYYY.
   *
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Formatted date
   * @private
   */
  _formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  /**
   * Format datetime as DD.MM.YYYY HH:mm:ss.
   *
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Formatted datetime
   * @private
   */
  _formatDateTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const dateStr = this._formatDate(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Resolve a built-in placeholder.
   * Maps to PHP: BuiltIn()
   *
   * @param {string} placeholder - Placeholder like [TODAY] or [USER]
   * @returns {string} Resolved value or original placeholder if unknown
   */
  resolve(placeholder) {
    const now = this._now();

    switch (placeholder) {
      // Date/Time placeholders
      case '[TODAY]':
        return this._formatDate(now);

      case '[NOW]':
        return this._formatDateTime(now);

      case '[YESTERDAY]':
        return this._formatDate(now - 86400);

      case '[TOMORROW]':
        return this._formatDate(now + 86400);

      case '[MONTH_AGO]':
        return this._formatDate(now - 30 * 86400);

      case '[WEEK_AGO]':
        return this._formatDate(now - 7 * 86400);

      case '[MONTH_PLUS]':
        return this._formatDate(now + 30 * 86400);

      // User placeholders
      case '[USER]':
        return this.context.user || '';

      case '[USER_ID]':
        return String(this.context.userId || 0);

      case '[ROLE]':
        return this.context.role || '';

      case '[ROLE_ID]':
        return String(this.context.roleId || 0);

      // System placeholders
      case '[TSHIFT]':
        return String(this.timezone);

      case '[REMOTE_ADDR]':
        return this.context.remoteAddr || '';

      case '[REMOTE_HOST]':
        return this.context.remoteHost || '';

      case '[HTTP_USER_AGENT]':
        return this.context.userAgent || '';

      case '[HTTP_REFERER]':
        return this.context.referer || '';

      case '[HTTP_HOST]':
        return this.context.host || '';

      case '[REQUEST_URI]':
        return this.context.requestUri || '';

      default:
        return placeholder;
    }
  }

  /**
   * Replace all built-in placeholders in a string.
   *
   * @param {string} text - Text with placeholders
   * @returns {string} Text with resolved placeholders
   */
  replaceAll(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // Match all [PLACEHOLDER] patterns
    return text.replace(/\[([A-Z_]+)\]/g, (match) => {
      const resolved = this.resolve(match);
      return resolved === match ? match : resolved;
    });
  }

  /**
   * Check if a value contains built-in placeholders.
   *
   * @param {string} value - Value to check
   * @returns {boolean} True if contains placeholders
   */
  hasPlaceholders(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }
    return /\[[A-Z_]+\]/.test(value);
  }

  /**
   * Extract all placeholders from a string.
   *
   * @param {string} text - Text to search
   * @returns {Array<string>} Array of placeholder names (without brackets)
   */
  extractPlaceholders(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const matches = text.match(/\[([A-Z_]+)\]/g) || [];
    return matches.map((m) => m.slice(1, -1));
  }

  /**
   * Get all available built-in placeholder names.
   *
   * @returns {Array<string>} Array of placeholder names
   */
  getAvailablePlaceholders() {
    return [
      'TODAY',
      'NOW',
      'YESTERDAY',
      'TOMORROW',
      'MONTH_AGO',
      'WEEK_AGO',
      'MONTH_PLUS',
      'USER',
      'USER_ID',
      'ROLE',
      'ROLE_ID',
      'TSHIFT',
      'REMOTE_ADDR',
      'REMOTE_HOST',
      'HTTP_USER_AGENT',
      'HTTP_REFERER',
      'HTTP_HOST',
      'REQUEST_URI',
    ];
  }
}

export default BuiltInService;
