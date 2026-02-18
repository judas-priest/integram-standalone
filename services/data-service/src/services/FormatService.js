/**
 * FormatService - Value formatting for Integram objects
 *
 * Maps to PHP functions: Format_Val(), Format_Val_View()
 * Handles date, number, boolean, and other type conversions.
 */

import { BASIC_TYPES, UPLOAD_DIR } from '@integram/common';

/**
 * Service for formatting object values based on their types.
 */
export class FormatService {
  /**
   * Create a new FormatService.
   *
   * @param {Object} [options] - Service options
   * @param {number} [options.timezone=0] - Timezone offset in seconds
   */
  constructor(options = {}) {
    this.timezone = options.timezone || 0;
    this.basicTypes = BASIC_TYPES || this._getDefaultBasicTypes();
    this.reverseTypes = this._buildReverseTypes();
  }

  /**
   * Get default basic types mapping.
   *
   * @returns {Object} Type ID to type name mapping
   * @private
   */
  _getDefaultBasicTypes() {
    return {
      3: 'SHORT',
      8: 'CHARS',
      9: 'DATE',
      13: 'NUMBER',
      14: 'SIGNED',
      11: 'BOOLEAN',
      12: 'MEMO',
      4: 'DATETIME',
      10: 'FILE',
      2: 'HTML',
      7: 'BUTTON',
      6: 'PWD',
      5: 'GRANT',
      15: 'CALCULATABLE',
      16: 'REPORT_COLUMN',
      17: 'PATH',
    };
  }

  /**
   * Build reverse type mapping (name to ID).
   *
   * @returns {Object} Type name to type ID mapping
   * @private
   */
  _buildReverseTypes() {
    const reverse = {};
    for (const [id, name] of Object.entries(this.basicTypes)) {
      reverse[name] = parseInt(id, 10);
    }
    return reverse;
  }

  /**
   * Get type name by ID.
   *
   * @param {number} typeId - Type ID
   * @returns {string} Type name or 'SHORT' if unknown
   */
  getTypeName(typeId) {
    return this.basicTypes[typeId] || 'SHORT';
  }

  /**
   * Get type ID by name.
   *
   * @param {string} typeName - Type name
   * @returns {number} Type ID or 3 (SHORT) if unknown
   */
  getTypeId(typeName) {
    return this.reverseTypes[typeName] || 3;
  }

  /**
   * Format value for storage (input).
   * Maps to PHP: Format_Val()
   *
   * @param {number|string} type - Type ID or type name
   * @param {string} value - Value to format
   * @returns {string} Formatted value
   */
  formatForStorage(type, value) {
    const typeName = typeof type === 'string' ? type : this.getTypeName(type);

    if (value === 'NULL' || value === null) {
      return 'NULL';
    }

    switch (typeName) {
      case 'DATE':
        return this._formatDate(value);

      case 'DATETIME':
        return this._formatDateTime(value);

      case 'NUMBER':
        return this._formatNumber(value);

      case 'SIGNED':
        return this._formatSigned(value);

      case 'BOOLEAN':
        return this._formatBoolean(value);

      default:
        return value;
    }
  }

  /**
   * Format value for display (output).
   * Maps to PHP: Format_Val_View()
   *
   * @param {number|string} type - Type ID or type name
   * @param {string} value - Value to format
   * @param {number} [id=0] - Object ID (for file paths)
   * @returns {string} Formatted value for display
   */
  formatForDisplay(type, value, id = 0) {
    const typeName = typeof type === 'string' ? type : this.getTypeName(type);

    if (value === '' || value === null || value === undefined) {
      return '';
    }

    switch (typeName) {
      case 'DATE':
        return this._formatDateForDisplay(value);

      case 'DATETIME':
        return this._formatDateTimeForDisplay(value);

      case 'BOOLEAN':
        return value !== '' ? 'X' : '';

      case 'NUMBER':
        return this._formatNumberForDisplay(value);

      case 'SIGNED':
        return this._formatSignedForDisplay(value);

      case 'FILE':
        return this._formatFileForDisplay(value, id);

      case 'PATH':
        return this._formatPathForDisplay(value, id);

      case 'PWD':
        return value.length > 0 ? '******' : '';

      default:
        return value;
    }
  }

  /**
   * Format date for storage.
   * Converts various date formats to YYYYMMDD.
   *
   * @param {string} value - Date value
   * @returns {string} Formatted date (YYYYMMDD)
   * @private
   */
  _formatDate(value) {
    if (!value || value.startsWith('[') || value.startsWith('_request_.')) {
      return value;
    }

    value = value.trim();

    // ISO format: YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = value.match(/^(\d{4})[-\/.]?(\d{2})[-\/.]?(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
    }

    // European format: DD.MM.YYYY or DD/MM/YYYY
    const parts = value.split(/[.\/,\s]+/);
    const day = parseInt(parts[0], 10) || 1;
    const month = parseInt(parts[1], 10) || new Date().getMonth() + 1;
    let year = parseInt(parts[2], 10) || new Date().getFullYear();

    if (year < 100) {
      year = 2000 + year;
    }

    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');

    return `${year}${monthStr}${dayStr}`;
  }

  /**
   * Format datetime for storage.
   * Converts to Unix timestamp.
   *
   * @param {string} value - DateTime value
   * @returns {string|number} Unix timestamp
   * @private
   */
  _formatDateTime(value) {
    if (!value || value.startsWith('[')) {
      return value;
    }

    value = value.trim();

    // Already a timestamp
    if (!isNaN(value) && parseInt(value, 10) > 10000) {
      return parseInt(value, 10) - this.timezone;
    }

    // Parse date/time string
    try {
      // Try ISO format first
      let date = new Date(value);

      // If invalid, try European format
      if (isNaN(date.getTime())) {
        const dateValue = this._formatDate(value.split(' ')[0]);
        const timeStr = value.split(' ')[1] || '00:00:00';
        const [hours, minutes, seconds] = timeStr.split(':').map(Number);

        date = new Date(
          parseInt(dateValue.substring(0, 4), 10),
          parseInt(dateValue.substring(4, 6), 10) - 1,
          parseInt(dateValue.substring(6, 8), 10),
          hours || 0,
          minutes || 0,
          seconds || 0
        );
      }

      return Math.floor(date.getTime() / 1000) - this.timezone;
    } catch (e) {
      return value;
    }
  }

  /**
   * Format number for storage.
   * Removes spaces and converts to integer.
   *
   * @param {string} value - Number value
   * @returns {number|string} Formatted number
   * @private
   */
  _formatNumber(value) {
    const cleaned = String(value).replace(/[,\s]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? value : num;
  }

  /**
   * Format signed (decimal) number for storage.
   *
   * @param {string} value - Signed number value
   * @returns {number|string} Formatted number
   * @private
   */
  _formatSigned(value) {
    const cleaned = String(value)
      .replace(/,/g, '.')
      .replace(/[\s\u00A0]/g, ''); // Remove spaces and non-breaking spaces
    const num = parseFloat(cleaned);
    return isNaN(num) ? value : num;
  }

  /**
   * Format boolean for storage.
   *
   * @param {string} value - Boolean value
   * @returns {string} '1' or ''
   * @private
   */
  _formatBoolean(value) {
    if (
      value === '' ||
      value === 'false' ||
      value === '-1' ||
      value === ' ' ||
      value === false
    ) {
      return '';
    }
    return '1';
  }

  /**
   * Format date for display.
   * Converts YYYYMMDD to DD.MM.YYYY.
   *
   * @param {string} value - Date value (YYYYMMDD)
   * @returns {string} Formatted date
   * @private
   */
  _formatDateForDisplay(value) {
    if (!value) return '';

    // Handle Unix timestamp (for datetime stored as number)
    if (value.length > 8) {
      const date = new Date((parseInt(value, 10) + this.timezone) * 1000);
      return this._formatDateObject(date);
    }

    // Format YYYYMMDD to DD.MM.YYYY
    const day = value.substring(6, 8);
    const month = value.substring(4, 6);
    const year = value.substring(0, 4);

    return `${day}.${month}.${year}`;
  }

  /**
   * Format datetime for display.
   *
   * @param {string|number} value - Unix timestamp
   * @returns {string} Formatted datetime
   * @private
   */
  _formatDateTimeForDisplay(value) {
    if (!value) return '';

    const timestamp = parseInt(value, 10) + this.timezone;
    const date = new Date(timestamp * 1000);

    return this._formatDateTimeObject(date);
  }

  /**
   * Format Date object to DD.MM.YYYY.
   *
   * @param {Date} date - Date object
   * @returns {string} Formatted date
   * @private
   */
  _formatDateObject(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
  }

  /**
   * Format Date object to DD.MM.YYYY HH:mm:ss.
   *
   * @param {Date} date - Date object
   * @returns {string} Formatted datetime
   * @private
   */
  _formatDateTimeObject(date) {
    const dateStr = this._formatDateObject(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${dateStr} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Format number for display with thousands separator.
   *
   * @param {number|string} value - Number value
   * @returns {string} Formatted number
   * @private
   */
  _formatNumberForDisplay(value) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num === 0) return value;
    return num.toLocaleString('ru-RU');
  }

  /**
   * Format signed number for display.
   *
   * @param {string|number} value - Signed number value
   * @returns {string} Formatted number
   * @private
   */
  _formatSignedForDisplay(value) {
    if (value === '') return '';

    const parts = String(value).trim().split('.');
    const intPart = parseInt(parts[0], 10).toLocaleString('ru-RU');
    const decPart = (parts[1] || '00').padEnd(2, '0');

    return `${intPart}.${decPart.substring(0, Math.max(2, decPart.length))}`;
  }

  /**
   * Format file for display (create download link).
   *
   * @param {string} value - File value (id:filename.ext or just filename.ext)
   * @param {number} id - Object ID
   * @returns {string} HTML link
   * @private
   */
  _formatFileForDisplay(value, id) {
    if (!value) return '';

    let fileId = id;
    let filename = value;

    // Parse "id:filename" format
    const colonPos = value.indexOf(':');
    if (colonPos !== -1) {
      fileId = parseInt(value.substring(0, colonPos), 10);
      filename = value.substring(colonPos + 1);
    }

    const extension = filename.split('.').pop();
    const path = this._getFilePath(fileId, extension);

    return `<a target="_blank" href="${path}">${filename}</a>`;
  }

  /**
   * Format path for display.
   *
   * @param {string} value - Path value (id:filename.ext)
   * @param {number} id - Object ID
   * @returns {string} File path
   * @private
   */
  _formatPathForDisplay(value, id) {
    if (!value) return '';

    const colonPos = value.indexOf(':');
    const fileId = colonPos !== -1 ? parseInt(value.substring(0, colonPos), 10) : id;
    const extension = value.split('.').pop();

    return this._getFilePath(fileId, extension);
  }

  /**
   * Get secure file path.
   * Maps to PHP: GetSubdir() / GetFilename()
   *
   * @param {number} id - Object ID
   * @param {string} extension - File extension
   * @returns {string} Secure file path
   * @private
   */
  _getFilePath(id, extension) {
    const subdir = Math.floor(id / 1000);
    const paddedId = String(id).padStart(3, '0').slice(-3);

    // Note: In production, this should use the proper SHA hash
    // For now, we use a simplified path
    return `/${UPLOAD_DIR || 'download'}/${subdir}/${paddedId}.${extension}`;
  }

  /**
   * Get column alignment based on type.
   * Maps to PHP: Get_Align()
   *
   * @param {number|string} type - Type ID or name
   * @returns {string} Alignment (LEFT, CENTER, RIGHT)
   */
  getAlignment(type) {
    const typeName = typeof type === 'string' ? type : this.getTypeName(type);

    switch (typeName) {
      case 'PWD':
      case 'DATE':
      case 'BOOLEAN':
        return 'CENTER';
      case 'NUMBER':
      case 'SIGNED':
        return 'RIGHT';
      default:
        return 'LEFT';
    }
  }

  /**
   * Set timezone offset.
   *
   * @param {number} offset - Timezone offset in seconds
   */
  setTimezone(offset) {
    this.timezone = offset;
  }
}

export default FormatService;
