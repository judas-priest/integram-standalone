/**
 * @integram/logger - Main Entry Point
 *
 * Unified logging infrastructure for Integram services.
 * Provides structured logging with backward compatibility to PHP logging.
 *
 * Maps to PHP functions: wlog(), trace()
 */

import fs from 'fs';
import path from 'path';
import {
  TextFormatter,
  JsonFormatter,
  LegacyFormatter,
  SqlFormatter,
  TraceFormatter,
  createFormatter,
} from './formatters/index.js';

// ============================================================================
// Re-export formatters
// ============================================================================

export * from './formatters/index.js';

// ============================================================================
// Log Levels
// ============================================================================

export const LOG_LEVELS = Object.freeze({
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
});

// ============================================================================
// Logger Class
// ============================================================================

/**
 * Unified logger with support for multiple outputs and formats.
 */
export class Logger {
  /**
   * Create a new logger.
   *
   * @param {Object} [options] - Logger options
   * @param {string} [options.service] - Service name for log entries
   * @param {string} [options.level='info'] - Minimum log level
   * @param {Object} [options.formatter] - Log formatter instance
   * @param {Array} [options.transports=[]] - Output transports
   * @param {string} [options.logsDir='logs/'] - Directory for log files
   */
  constructor(options = {}) {
    this.service = options.service || 'integram';
    this.level = LOG_LEVELS[options.level || 'info'];
    this.formatter = options.formatter || new TextFormatter();
    this.transports = options.transports || [];
    this.logsDir = options.logsDir || 'logs/';
    this.traceEnabled = false;
    this.traceBuffer = [];

    // Default to console transport if none specified
    if (this.transports.length === 0) {
      this.transports.push(new ConsoleTransport());
    }
  }

  /**
   * Create a log entry.
   *
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [metadata={}] - Additional metadata
   * @returns {Object} Log entry
   */
  createEntry(level, message, metadata = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      metadata,
      requestId: metadata.requestId || this.currentRequestId,
    };
  }

  /**
   * Log a message at specified level.
   *
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [metadata={}] - Additional metadata
   */
  log(level, message, metadata = {}) {
    if (LOG_LEVELS[level] > this.level) {
      return;
    }

    const entry = this.createEntry(level, message, metadata);
    const formatted = this.formatter.format(entry);

    for (const transport of this.transports) {
      transport.log(level, formatted, entry);
    }
  }

  /**
   * Log an error message.
   *
   * @param {string} message - Error message
   * @param {Object} [metadata={}] - Additional metadata
   */
  error(message, metadata = {}) {
    this.log('error', message, metadata);
  }

  /**
   * Log a warning message.
   *
   * @param {string} message - Warning message
   * @param {Object} [metadata={}] - Additional metadata
   */
  warn(message, metadata = {}) {
    this.log('warn', message, metadata);
  }

  /**
   * Log an info message.
   *
   * @param {string} message - Info message
   * @param {Object} [metadata={}] - Additional metadata
   */
  info(message, metadata = {}) {
    this.log('info', message, metadata);
  }

  /**
   * Log a debug message.
   *
   * @param {string} message - Debug message
   * @param {Object} [metadata={}] - Additional metadata
   */
  debug(message, metadata = {}) {
    this.log('debug', message, metadata);
  }

  /**
   * Log a trace message.
   * Maps to PHP: trace()
   *
   * @param {string} message - Trace message
   * @param {Object} [metadata={}] - Additional metadata
   */
  trace(message, metadata = {}) {
    if (this.traceEnabled) {
      this.traceBuffer.push(message);
      this.log('trace', message, metadata);
    }
  }

  /**
   * Enable tracing.
   *
   * @param {boolean} enabled - Whether to enable tracing
   */
  setTraceEnabled(enabled) {
    this.traceEnabled = enabled;
    if (enabled) {
      this.traceBuffer = [];
    }
  }

  /**
   * Get trace buffer.
   *
   * @returns {string[]} Trace messages
   */
  getTraceBuffer() {
    return [...this.traceBuffer];
  }

  /**
   * Clear trace buffer.
   */
  clearTraceBuffer() {
    this.traceBuffer = [];
  }

  /**
   * Set current request ID for correlation.
   *
   * @param {string} requestId - Request ID
   */
  setRequestId(requestId) {
    this.currentRequestId = requestId;
  }

  /**
   * Create a child logger with additional context.
   *
   * @param {Object} context - Additional context
   * @returns {Logger} Child logger
   */
  child(context) {
    const child = new Logger({
      service: context.service || this.service,
      level: Object.keys(LOG_LEVELS)[this.level],
      formatter: this.formatter,
      transports: this.transports,
      logsDir: this.logsDir,
    });
    child.parentContext = { ...this.parentContext, ...context };
    return child;
  }

  /**
   * Write to a log file in legacy PHP format.
   * Maps to PHP: wlog()
   *
   * @param {string} database - Database name
   * @param {string} message - Log message
   * @param {string} [mode='log'] - Log mode (log, sql, etc.)
   */
  wlog(database, message, mode = 'log') {
    const filename = `${database}_${mode}.txt`;
    const filepath = path.join(this.logsDir, filename);
    const formatter = mode === 'sql' ? new SqlFormatter() : new LegacyFormatter();

    const entry = this.createEntry('info', message, { database });
    const formatted = formatter.format(entry);

    try {
      // Ensure logs directory exists
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      fs.appendFileSync(filepath, formatted + '\n');
    } catch (error) {
      this.error(`Failed to write to log file: ${error.message}`);
    }
  }

  /**
   * Log SQL query with timing.
   * Maps to PHP: wlog with "sql" mode
   *
   * @param {string} database - Database name
   * @param {string} sql - SQL query
   * @param {number} duration - Query duration in seconds
   * @param {string} label - Query label
   * @param {Object} [metadata={}] - Additional metadata
   */
  sqlLog(database, sql, duration, label, metadata = {}) {
    const entry = this.createEntry('debug', sql, {
      ...metadata,
      database,
      sql,
      duration,
      label,
    });

    const formatter = new SqlFormatter();
    const formatted = formatter.format(entry);

    const filename = `${database}_sql.txt`;
    const filepath = path.join(this.logsDir, filename);

    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      fs.appendFileSync(filepath, formatted + '\n');
    } catch (error) {
      this.error(`Failed to write SQL log: ${error.message}`);
    }
  }
}

// ============================================================================
// Transports
// ============================================================================

/**
 * Console output transport.
 */
export class ConsoleTransport {
  /**
   * Log to console.
   *
   * @param {string} level - Log level
   * @param {string} formatted - Formatted message
   * @param {Object} entry - Raw log entry
   */
  log(level, formatted, entry) {
    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'debug':
      case 'trace':
        console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }
  }
}

/**
 * File output transport.
 */
export class FileTransport {
  /**
   * Create file transport.
   *
   * @param {Object} options - Transport options
   * @param {string} options.filename - Output filename
   * @param {string} [options.directory='logs/'] - Output directory
   */
  constructor(options) {
    this.filename = options.filename;
    this.directory = options.directory || 'logs/';
    this.filepath = path.join(this.directory, this.filename);
  }

  /**
   * Log to file.
   *
   * @param {string} level - Log level
   * @param {string} formatted - Formatted message
   * @param {Object} entry - Raw log entry
   */
  log(level, formatted, entry) {
    try {
      if (!fs.existsSync(this.directory)) {
        fs.mkdirSync(this.directory, { recursive: true });
      }

      fs.appendFileSync(this.filepath, formatted + '\n');
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }
}

/**
 * JSON file transport (for log aggregation).
 */
export class JsonFileTransport extends FileTransport {
  /**
   * Create JSON file transport.
   *
   * @param {Object} options - Transport options
   */
  constructor(options) {
    super(options);
  }

  /**
   * Log to JSON file.
   *
   * @param {string} level - Log level
   * @param {string} formatted - Formatted message
   * @param {Object} entry - Raw log entry
   */
  log(level, formatted, entry) {
    try {
      if (!fs.existsSync(this.directory)) {
        fs.mkdirSync(this.directory, { recursive: true });
      }

      const jsonLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.filepath, jsonLine);
    } catch (error) {
      console.error(`Failed to write to JSON log file: ${error.message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a logger with default configuration.
 *
 * @param {Object} [options] - Logger options
 * @returns {Logger} Configured logger
 */
export function createLogger(options = {}) {
  return new Logger(options);
}

/**
 * Create a logger from environment variables.
 *
 * @param {string} [service] - Service name
 * @returns {Logger} Configured logger
 */
export function createLoggerFromEnv(service) {
  const level = process.env.LOG_LEVEL || 'info';
  const format = process.env.LOG_FORMAT || 'text';
  const logsDir = process.env.LOGS_DIR || 'logs/';

  const transports = [new ConsoleTransport()];

  // Add file transport if LOG_FILE is set
  if (process.env.LOG_FILE) {
    transports.push(
      new FileTransport({
        filename: process.env.LOG_FILE,
        directory: logsDir,
      })
    );
  }

  return new Logger({
    service: service || process.env.SERVICE_NAME || 'integram',
    level,
    formatter: createFormatter(format),
    transports,
    logsDir,
  });
}

// ============================================================================
// Package Information
// ============================================================================

export const PACKAGE_NAME = '@integram/logger';
export const PACKAGE_VERSION = '1.0.0';

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Classes
  Logger,
  ConsoleTransport,
  FileTransport,
  JsonFileTransport,

  // Factory functions
  createLogger,
  createLoggerFromEnv,

  // Constants
  LOG_LEVELS,

  // Package info
  PACKAGE_NAME,
  PACKAGE_VERSION,
};
