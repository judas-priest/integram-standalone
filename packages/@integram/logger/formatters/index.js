/**
 * @integram/logger - Log Formatters
 *
 * Various output formatters for log messages.
 * Supports JSON, text, and legacy PHP-compatible formats.
 */

// ============================================================================
// Base Formatter
// ============================================================================

/**
 * Base formatter class that other formatters extend.
 */
export class BaseFormatter {
  /**
   * Format a log entry.
   *
   * @param {Object} entry - Log entry
   * @returns {string} Formatted log message
   */
  format(entry) {
    throw new Error('format() must be implemented by subclass');
  }
}

// ============================================================================
// JSON Formatter
// ============================================================================

/**
 * Formats log entries as JSON strings.
 * Useful for log aggregation systems.
 */
export class JsonFormatter extends BaseFormatter {
  /**
   * Create JSON formatter.
   *
   * @param {Object} [options] - Formatter options
   * @param {boolean} [options.pretty=false] - Pretty print JSON
   */
  constructor(options = {}) {
    super();
    this.pretty = options.pretty || false;
  }

  /**
   * Format log entry as JSON.
   *
   * @param {Object} entry - Log entry
   * @returns {string} JSON string
   */
  format(entry) {
    if (this.pretty) {
      return JSON.stringify(entry, null, 2);
    }
    return JSON.stringify(entry);
  }
}

// ============================================================================
// Text Formatter
// ============================================================================

/**
 * Formats log entries as human-readable text.
 */
export class TextFormatter extends BaseFormatter {
  /**
   * Create text formatter.
   *
   * @param {Object} [options] - Formatter options
   * @param {boolean} [options.colors=true] - Use ANSI colors
   * @param {boolean} [options.timestamps=true] - Include timestamps
   */
  constructor(options = {}) {
    super();
    this.colors = options.colors !== false;
    this.timestamps = options.timestamps !== false;
  }

  /**
   * Get ANSI color code for log level.
   *
   * @param {string} level - Log level
   * @returns {string} ANSI color code
   */
  getColor(level) {
    if (!this.colors) return '';

    const colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      debug: '\x1b[90m',   // Gray
      trace: '\x1b[90m',   // Gray
    };

    return colors[level] || '';
  }

  /**
   * Reset ANSI color.
   *
   * @returns {string} Reset code
   */
  getReset() {
    return this.colors ? '\x1b[0m' : '';
  }

  /**
   * Format log entry as text.
   *
   * @param {Object} entry - Log entry
   * @returns {string} Formatted text
   */
  format(entry) {
    const parts = [];

    if (this.timestamps && entry.timestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    const color = this.getColor(entry.level);
    const reset = this.getReset();

    parts.push(`${color}${entry.level.toUpperCase()}${reset}`);

    if (entry.service) {
      parts.push(`[${entry.service}]`);
    }

    parts.push(entry.message);

    // Add metadata as key=value pairs
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const meta = Object.entries(entry.metadata)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' ');
      parts.push(`{${meta}}`);
    }

    return parts.join(' ');
  }
}

// ============================================================================
// Legacy PHP Formatter
// ============================================================================

/**
 * Formats log entries in the legacy PHP format.
 * Maps to PHP: wlog() output format
 */
export class LegacyFormatter extends BaseFormatter {
  /**
   * Format log entry in legacy PHP format.
   *
   * Format: "DD/MM/YYYY HH:MM:SS message"
   *
   * @param {Object} entry - Log entry
   * @returns {string} Legacy formatted text
   */
  format(entry) {
    const date = entry.timestamp
      ? new Date(entry.timestamp)
      : new Date();

    // Format: DD/MM/YYYY HH:MM:SS
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const timestamp = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;

    let message = entry.message;

    // Append metadata if present
    if (entry.metadata) {
      if (entry.metadata.ip) {
        message = `${entry.metadata.ip} ${message}`;
      }
      if (entry.metadata.user) {
        message = `${entry.metadata.user}@${message}`;
      }
    }

    return `${timestamp} ${message}`;
  }
}

// ============================================================================
// SQL Log Formatter
// ============================================================================

/**
 * Formats SQL query logs in the legacy PHP format.
 * Maps to PHP: wlog() with "sql" mode
 */
export class SqlFormatter extends BaseFormatter {
  /**
   * Format SQL log entry.
   *
   * Format: "user@ip[duration]sql;[label]"
   *
   * @param {Object} entry - Log entry
   * @returns {string} SQL formatted log
   */
  format(entry) {
    const date = entry.timestamp
      ? new Date(entry.timestamp)
      : new Date();

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const timestamp = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;

    const meta = entry.metadata || {};
    const user = meta.user || '';
    const ip = meta.ip || '';
    const duration = meta.duration !== undefined ? `[${meta.duration.toFixed(4)}]` : '';
    const sql = meta.sql || entry.message;
    const label = meta.label ? `[${meta.label}]` : '';

    return `${timestamp} ${user}@${ip}${duration}${sql};${label}`;
  }
}

// ============================================================================
// Trace Formatter
// ============================================================================

/**
 * Formats trace/debug logs in verbose format.
 * Maps to PHP: trace() function
 */
export class TraceFormatter extends BaseFormatter {
  /**
   * Create trace formatter.
   *
   * @param {Object} [options] - Formatter options
   * @param {boolean} [options.html=false] - Use HTML formatting
   */
  constructor(options = {}) {
    super();
    this.html = options.html || false;
  }

  /**
   * Format trace log entry.
   *
   * @param {Object} entry - Log entry
   * @returns {string} Trace formatted log
   */
  format(entry) {
    const lineBreak = this.html ? '<br>\n' : '\n';
    const message = entry.message;

    if (this.html) {
      return `${message} ${lineBreak}`;
    }

    return `${message}\n`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a formatter by name.
 *
 * @param {string} name - Formatter name
 * @param {Object} [options] - Formatter options
 * @returns {BaseFormatter} Formatter instance
 */
export function createFormatter(name, options = {}) {
  switch (name.toLowerCase()) {
    case 'json':
      return new JsonFormatter(options);
    case 'text':
      return new TextFormatter(options);
    case 'legacy':
      return new LegacyFormatter();
    case 'sql':
      return new SqlFormatter();
    case 'trace':
      return new TraceFormatter(options);
    default:
      return new TextFormatter(options);
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  BaseFormatter,
  JsonFormatter,
  TextFormatter,
  LegacyFormatter,
  SqlFormatter,
  TraceFormatter,
  createFormatter,
};
