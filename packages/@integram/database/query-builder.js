/**
 * @integram/database - Query Builder
 *
 * SQL query builder that mirrors PHP monolith query construction.
 * Provides parameterized queries to prevent SQL injection.
 *
 * Maps to PHP functions: Construct_WHERE, Exec_sql, Insert, Update_Val, Delete
 */

import {
  escapeString,
  hasInjectionPattern,
} from '@integram/common';

import { InjectionError, ValidationError } from '@integram/common';

// ============================================================================
// Query Builder Class
// ============================================================================

/**
 * Fluent SQL query builder for Integram database operations.
 */
export class QueryBuilder {
  /**
   * Create a new query builder.
   *
   * @param {string} table - Table name (database name in Integram)
   */
  constructor(table) {
    this.table = table;
    this._select = ['*'];
    this._where = [];
    this._whereParams = [];
    this._joins = [];
    this._joinParams = [];
    this._orderBy = [];
    this._groupBy = [];
    this._having = [];
    this._limit = null;
    this._offset = null;
    this._distinct = false;
  }

  /**
   * Create a new query builder for a table.
   *
   * @param {string} table - Table name
   * @returns {QueryBuilder} New query builder
   */
  static from(table) {
    return new QueryBuilder(table);
  }

  // ============================================================================
  // SELECT Methods
  // ============================================================================

  /**
   * Set SELECT columns.
   *
   * @param {...string} columns - Column names or expressions
   * @returns {QueryBuilder} this
   */
  select(...columns) {
    this._select = columns.length > 0 ? columns : ['*'];
    return this;
  }

  /**
   * Add DISTINCT modifier.
   *
   * @returns {QueryBuilder} this
   */
  distinct() {
    this._distinct = true;
    return this;
  }

  // ============================================================================
  // WHERE Methods (maps to PHP Construct_WHERE)
  // ============================================================================

  /**
   * Add a WHERE condition.
   *
   * @param {string} column - Column name
   * @param {string} operator - Comparison operator
   * @param {*} value - Value to compare
   * @returns {QueryBuilder} this
   */
  where(column, operator, value) {
    // Check for injection in column name
    if (hasInjectionPattern(column)) {
      throw new InjectionError(column);
    }

    // Handle special operators
    if (operator === 'IS' || operator === 'IS NOT') {
      this._where.push(`${column} ${operator} NULL`);
    } else if (operator === 'IN' || operator === 'NOT IN') {
      const placeholders = Array.isArray(value)
        ? value.map(() => '?').join(', ')
        : '?';
      this._where.push(`${column} ${operator} (${placeholders})`);
      if (Array.isArray(value)) {
        this._whereParams.push(...value);
      } else {
        this._whereParams.push(value);
      }
    } else if (operator === 'LIKE' || operator === 'NOT LIKE') {
      this._where.push(`${column} ${operator} ?`);
      this._whereParams.push(value);
    } else if (operator === 'BETWEEN') {
      this._where.push(`${column} BETWEEN ? AND ?`);
      this._whereParams.push(value[0], value[1]);
    } else {
      this._where.push(`${column} ${operator} ?`);
      this._whereParams.push(value);
    }

    return this;
  }

  /**
   * Add an equals WHERE condition.
   *
   * @param {string} column - Column name
   * @param {*} value - Value to compare
   * @returns {QueryBuilder} this
   */
  whereEquals(column, value) {
    return this.where(column, '=', value);
  }

  /**
   * Add a WHERE condition for ID.
   *
   * @param {number} id - Object ID
   * @returns {QueryBuilder} this
   */
  whereId(id) {
    return this.where('id', '=', parseInt(id, 10));
  }

  /**
   * Add a WHERE condition for type.
   *
   * @param {number} type - Type ID
   * @returns {QueryBuilder} this
   */
  whereType(type) {
    return this.where('t', '=', parseInt(type, 10));
  }

  /**
   * Add a WHERE condition for parent.
   *
   * @param {number} parent - Parent ID
   * @returns {QueryBuilder} this
   */
  whereParent(parent) {
    return this.where('up', '=', parseInt(parent, 10));
  }

  /**
   * Add a NULL check WHERE condition.
   *
   * @param {string} column - Column name
   * @param {boolean} isNull - True for IS NULL, false for IS NOT NULL
   * @returns {QueryBuilder} this
   */
  whereNull(column, isNull = true) {
    return this.where(column, isNull ? 'IS' : 'IS NOT', null);
  }

  /**
   * Add a raw WHERE clause (use with caution).
   *
   * @param {string} sql - Raw SQL condition
   * @param {Array} params - Parameters
   * @returns {QueryBuilder} this
   */
  whereRaw(sql, params = []) {
    this._where.push(sql);
    this._whereParams.push(...params);
    return this;
  }

  // ============================================================================
  // JOIN Methods
  // ============================================================================

  /**
   * Add a JOIN clause.
   *
   * @param {string} type - JOIN type (JOIN, LEFT JOIN, etc.)
   * @param {string} table - Table to join
   * @param {string} alias - Table alias
   * @param {string} onClause - ON condition
   * @param {Array} params - Parameters for ON condition
   * @returns {QueryBuilder} this
   */
  join(type, table, alias, onClause, params = []) {
    this._joins.push(`${type} ${table} ${alias} ON ${onClause}`);
    this._joinParams.push(...params);
    return this;
  }

  /**
   * Add a LEFT JOIN clause.
   *
   * @param {string} table - Table to join
   * @param {string} alias - Table alias
   * @param {string} onClause - ON condition
   * @param {Array} params - Parameters
   * @returns {QueryBuilder} this
   */
  leftJoin(table, alias, onClause, params = []) {
    return this.join('LEFT JOIN', table, alias, onClause, params);
  }

  /**
   * Add a JOIN for object attributes (Integram-specific).
   *
   * @param {number} typeId - Attribute type ID
   * @param {string} alias - Join alias
   * @returns {QueryBuilder} this
   */
  joinAttribute(typeId, alias) {
    return this.leftJoin(
      this.table,
      alias,
      `${alias}.up=vals.id AND ${alias}.t=?`,
      [typeId]
    );
  }

  // ============================================================================
  // ORDER BY Methods
  // ============================================================================

  /**
   * Add an ORDER BY clause.
   *
   * @param {string} column - Column name
   * @param {'ASC'|'DESC'} direction - Sort direction
   * @returns {QueryBuilder} this
   */
  orderBy(column, direction = 'ASC') {
    if (hasInjectionPattern(column)) {
      throw new InjectionError(column);
    }
    this._orderBy.push(`${column} ${direction.toUpperCase()}`);
    return this;
  }

  // ============================================================================
  // GROUP BY / HAVING Methods
  // ============================================================================

  /**
   * Add a GROUP BY clause.
   *
   * @param {...string} columns - Column names
   * @returns {QueryBuilder} this
   */
  groupBy(...columns) {
    this._groupBy.push(...columns);
    return this;
  }

  /**
   * Add a HAVING clause.
   *
   * @param {string} condition - HAVING condition
   * @returns {QueryBuilder} this
   */
  having(condition) {
    this._having.push(condition);
    return this;
  }

  // ============================================================================
  // LIMIT / OFFSET Methods
  // ============================================================================

  /**
   * Set LIMIT clause.
   *
   * @param {number} limit - Maximum rows to return
   * @returns {QueryBuilder} this
   */
  limit(limit) {
    this._limit = parseInt(limit, 10);
    return this;
  }

  /**
   * Set OFFSET clause.
   *
   * @param {number} offset - Rows to skip
   * @returns {QueryBuilder} this
   */
  offset(offset) {
    this._offset = parseInt(offset, 10);
    return this;
  }

  // ============================================================================
  // Build Methods
  // ============================================================================

  /**
   * Build SELECT query.
   *
   * @returns {Object} Object with sql and params
   */
  buildSelect() {
    const parts = [];

    // SELECT
    parts.push(`SELECT ${this._distinct ? 'DISTINCT ' : ''}${this._select.join(', ')}`);

    // FROM
    parts.push(`FROM ${this.table}`);

    // JOINs
    if (this._joins.length > 0) {
      parts.push(this._joins.join(' '));
    }

    // WHERE
    if (this._where.length > 0) {
      parts.push(`WHERE ${this._where.join(' AND ')}`);
    }

    // GROUP BY
    if (this._groupBy.length > 0) {
      parts.push(`GROUP BY ${this._groupBy.join(', ')}`);
    }

    // HAVING
    if (this._having.length > 0) {
      parts.push(`HAVING ${this._having.join(' AND ')}`);
    }

    // ORDER BY
    if (this._orderBy.length > 0) {
      parts.push(`ORDER BY ${this._orderBy.join(', ')}`);
    }

    // LIMIT
    if (this._limit !== null) {
      parts.push(`LIMIT ${this._limit}`);
    }

    // OFFSET
    if (this._offset !== null) {
      parts.push(`OFFSET ${this._offset}`);
    }

    return {
      sql: parts.join(' '),
      params: [...this._joinParams, ...this._whereParams],
    };
  }

  /**
   * Build and return the SELECT SQL query string.
   *
   * @returns {string} SQL query
   */
  toSql() {
    return this.buildSelect().sql;
  }

  /**
   * Get parameters for the query.
   *
   * @returns {Array} Query parameters
   */
  getParams() {
    return this.buildSelect().params;
  }
}

// ============================================================================
// Static Query Builders (maps to PHP functions)
// ============================================================================

/**
 * Build an INSERT query.
 * Maps to PHP: Insert()
 *
 * @param {string} table - Table name
 * @param {number} up - Parent ID
 * @param {number} ord - Order value
 * @param {number} t - Type ID
 * @param {string} val - Value
 * @returns {Object} Object with sql and params
 */
export function buildInsert(table, up, ord, t, val) {
  return {
    sql: `INSERT INTO ${table} (up, ord, t, val) VALUES (?, ?, ?, ?)`,
    params: [up, ord, t, val],
  };
}

/**
 * Build an UPDATE query for value.
 * Maps to PHP: Update_Val()
 *
 * @param {string} table - Table name
 * @param {number} id - Object ID
 * @param {string} val - New value
 * @returns {Object} Object with sql and params
 */
export function buildUpdateVal(table, id, val) {
  return {
    sql: `UPDATE ${table} SET val = ? WHERE id = ?`,
    params: [val, id],
  };
}

/**
 * Build an UPDATE query for type.
 * Maps to PHP: UpdateTyp()
 *
 * @param {string} table - Table name
 * @param {number} id - Object ID
 * @param {number} t - New type ID
 * @returns {Object} Object with sql and params
 */
export function buildUpdateType(table, id, t) {
  return {
    sql: `UPDATE ${table} SET t = ? WHERE id = ?`,
    params: [t, id],
  };
}

/**
 * Build a DELETE query.
 * Maps to PHP: Delete()
 *
 * @param {string} table - Table name
 * @param {number} id - Object ID
 * @returns {Object} Object with sql and params
 */
export function buildDelete(table, id) {
  return {
    sql: `DELETE FROM ${table} WHERE id = ?`,
    params: [id],
  };
}

/**
 * Build a batch DELETE query for children.
 *
 * @param {string} table - Table name
 * @param {number} parentId - Parent object ID
 * @returns {Object} Object with sql and params
 */
export function buildBatchDelete(table, parentId) {
  return {
    sql: `DELETE FROM ${table} WHERE up = ?`,
    params: [parentId],
  };
}

/**
 * Build a query to check if an ID is occupied.
 * Maps to PHP: IsOccupied()
 *
 * @param {string} table - Table name
 * @param {number} id - Object ID
 * @returns {Object} Object with sql and params
 */
export function buildCheckOccupied(table, id) {
  return {
    sql: `SELECT 1 FROM ${table} WHERE id = ? LIMIT 1`,
    params: [id],
  };
}

/**
 * Build a query to get max order value.
 * Maps to PHP: Get_Ord()
 *
 * @param {string} table - Table name
 * @param {number} parentId - Parent object ID
 * @param {number} [typeId] - Optional type filter
 * @returns {Object} Object with sql and params
 */
export function buildGetMaxOrder(table, parentId, typeId = null) {
  if (typeId !== null) {
    return {
      sql: `SELECT MAX(ord) + 1 FROM ${table} WHERE up = ? AND t = ?`,
      params: [parentId, typeId],
    };
  }
  return {
    sql: `SELECT MAX(ord) + 1 FROM ${table} WHERE up = ?`,
    params: [parentId],
  };
}

/**
 * Build a query to calculate order for new object.
 * Maps to PHP: Calc_Order()
 *
 * @param {string} table - Table name
 * @param {number} up - Parent ID
 * @param {number} t - Type ID
 * @returns {Object} Object with sql and params
 */
export function buildCalcOrder(table, up, t) {
  return {
    sql: `SELECT COALESCE(MAX(ord), 0) + 1 as next_ord FROM ${table} WHERE up = ? AND t = ?`,
    params: [up, t],
  };
}

// ============================================================================
// Export
// ============================================================================

export default QueryBuilder;
