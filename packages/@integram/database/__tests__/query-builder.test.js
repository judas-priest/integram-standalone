/**
 * @integram/database - Query Builder Tests
 *
 * Tests for the SQL query builder that ensures proper parameterized queries
 * and backward compatibility with PHP monolith query construction.
 */

import { describe, it, expect } from 'vitest';
import {
  QueryBuilder,
  buildInsert,
  buildUpdateVal,
  buildUpdateType,
  buildDelete,
  buildBatchDelete,
  buildCheckOccupied,
  buildGetMaxOrder,
  buildCalcOrder,
} from '../query-builder.js';

describe('@integram/database Query Builder', () => {
  describe('QueryBuilder class', () => {
    it('should create a basic SELECT query', () => {
      const qb = QueryBuilder.from('testdb');
      const { sql, params } = qb.buildSelect();

      expect(sql).toBe('SELECT * FROM testdb');
      expect(params).toEqual([]);
    });

    it('should support selecting specific columns', () => {
      const qb = QueryBuilder.from('testdb').select('id', 'val', 't');
      const { sql, params } = qb.buildSelect();

      expect(sql).toBe('SELECT id, val, t FROM testdb');
      expect(params).toEqual([]);
    });

    it('should support DISTINCT modifier', () => {
      const qb = QueryBuilder.from('testdb').distinct().select('t');
      const { sql, params } = qb.buildSelect();

      expect(sql).toBe('SELECT DISTINCT t FROM testdb');
      expect(params).toEqual([]);
    });

    describe('WHERE conditions', () => {
      it('should add basic WHERE equals', () => {
        const qb = QueryBuilder.from('testdb').whereEquals('id', 123);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE id = ?');
        expect(params).toEqual([123]);
      });

      it('should add WHERE with operator', () => {
        const qb = QueryBuilder.from('testdb').where('t', '>', 10);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE t > ?');
        expect(params).toEqual([10]);
      });

      it('should support whereId helper', () => {
        const qb = QueryBuilder.from('testdb').whereId(42);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE id = ?');
        expect(params).toEqual([42]);
      });

      it('should support whereType helper', () => {
        const qb = QueryBuilder.from('testdb').whereType(18);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE t = ?');
        expect(params).toEqual([18]);
      });

      it('should support whereParent helper', () => {
        const qb = QueryBuilder.from('testdb').whereParent(5);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE up = ?');
        expect(params).toEqual([5]);
      });

      it('should support IS NULL condition', () => {
        const qb = QueryBuilder.from('testdb').whereNull('val');
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE val IS NULL');
        expect(params).toEqual([]);
      });

      it('should support IS NOT NULL condition', () => {
        const qb = QueryBuilder.from('testdb').whereNull('val', false);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE val IS NOT NULL');
        expect(params).toEqual([]);
      });

      it('should support IN condition', () => {
        const qb = QueryBuilder.from('testdb').where('t', 'IN', [1, 2, 3]);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE t IN (?, ?, ?)');
        expect(params).toEqual([1, 2, 3]);
      });

      it('should support LIKE condition', () => {
        const qb = QueryBuilder.from('testdb').where('val', 'LIKE', '%test%');
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE val LIKE ?');
        expect(params).toEqual(['%test%']);
      });

      it('should support BETWEEN condition', () => {
        const qb = QueryBuilder.from('testdb').where('ord', 'BETWEEN', [1, 10]);
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE ord BETWEEN ? AND ?');
        expect(params).toEqual([1, 10]);
      });

      it('should combine multiple WHERE conditions with AND', () => {
        const qb = QueryBuilder.from('testdb')
          .whereType(18)
          .whereParent(1)
          .where('val', '!=', '');
        const { sql, params } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb WHERE t = ? AND up = ? AND val != ?');
        expect(params).toEqual([18, 1, '']);
      });

      it('should reject columns with injection patterns', () => {
        const qb = QueryBuilder.from('testdb');
        expect(() => qb.where('SELECT * FROM', '=', 'x')).toThrow();
      });
    });

    describe('JOIN operations', () => {
      it('should add LEFT JOIN', () => {
        const qb = QueryBuilder.from('testdb')
          .leftJoin('testdb', 'r', 'r.up = testdb.id');
        const { sql } = qb.buildSelect();

        expect(sql).toContain('LEFT JOIN testdb r ON r.up = testdb.id');
      });

      it('should support parameterized JOIN conditions', () => {
        const qb = QueryBuilder.from('testdb')
          .leftJoin('testdb', 'r', 'r.up = testdb.id AND r.t = ?', [42]);
        const { sql, params } = qb.buildSelect();

        expect(sql).toContain('LEFT JOIN testdb r ON r.up = testdb.id AND r.t = ?');
        expect(params).toContain(42);
      });
    });

    describe('ORDER BY', () => {
      it('should add ORDER BY ASC', () => {
        const qb = QueryBuilder.from('testdb').orderBy('id');
        const { sql } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb ORDER BY id ASC');
      });

      it('should add ORDER BY DESC', () => {
        const qb = QueryBuilder.from('testdb').orderBy('ord', 'DESC');
        const { sql } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb ORDER BY ord DESC');
      });

      it('should reject ORDER BY with injection patterns', () => {
        const qb = QueryBuilder.from('testdb');
        expect(() => qb.orderBy('DROP TABLE')).toThrow();
      });
    });

    describe('GROUP BY and HAVING', () => {
      it('should add GROUP BY', () => {
        const qb = QueryBuilder.from('testdb').groupBy('t');
        const { sql } = qb.buildSelect();

        expect(sql).toContain('GROUP BY t');
      });

      it('should add HAVING', () => {
        const qb = QueryBuilder.from('testdb')
          .groupBy('t')
          .having('COUNT(*) > 1');
        const { sql } = qb.buildSelect();

        expect(sql).toContain('GROUP BY t');
        expect(sql).toContain('HAVING COUNT(*) > 1');
      });
    });

    describe('LIMIT and OFFSET', () => {
      it('should add LIMIT', () => {
        const qb = QueryBuilder.from('testdb').limit(10);
        const { sql } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb LIMIT 10');
      });

      it('should add OFFSET', () => {
        const qb = QueryBuilder.from('testdb').limit(10).offset(20);
        const { sql } = qb.buildSelect();

        expect(sql).toBe('SELECT * FROM testdb LIMIT 10 OFFSET 20');
      });
    });

    describe('toSql and getParams helpers', () => {
      it('should return SQL via toSql()', () => {
        const qb = QueryBuilder.from('testdb').whereId(1);
        expect(qb.toSql()).toBe('SELECT * FROM testdb WHERE id = ?');
      });

      it('should return params via getParams()', () => {
        const qb = QueryBuilder.from('testdb').whereId(1).whereType(18);
        expect(qb.getParams()).toEqual([1, 18]);
      });
    });
  });

  describe('Static query builders', () => {
    describe('buildInsert', () => {
      it('should build INSERT query', () => {
        const { sql, params } = buildInsert('testdb', 1, 0, 18, 'testuser');

        expect(sql).toBe('INSERT INTO testdb (up, ord, t, val) VALUES (?, ?, ?, ?)');
        expect(params).toEqual([1, 0, 18, 'testuser']);
      });
    });

    describe('buildUpdateVal', () => {
      it('should build UPDATE value query', () => {
        const { sql, params } = buildUpdateVal('testdb', 42, 'newvalue');

        expect(sql).toBe('UPDATE testdb SET val = ? WHERE id = ?');
        expect(params).toEqual(['newvalue', 42]);
      });
    });

    describe('buildUpdateType', () => {
      it('should build UPDATE type query', () => {
        const { sql, params } = buildUpdateType('testdb', 42, 20);

        expect(sql).toBe('UPDATE testdb SET t = ? WHERE id = ?');
        expect(params).toEqual([20, 42]);
      });
    });

    describe('buildDelete', () => {
      it('should build DELETE query', () => {
        const { sql, params } = buildDelete('testdb', 42);

        expect(sql).toBe('DELETE FROM testdb WHERE id = ?');
        expect(params).toEqual([42]);
      });
    });

    describe('buildBatchDelete', () => {
      it('should build batch DELETE query by parent', () => {
        const { sql, params } = buildBatchDelete('testdb', 10);

        expect(sql).toBe('DELETE FROM testdb WHERE up = ?');
        expect(params).toEqual([10]);
      });
    });

    describe('buildCheckOccupied', () => {
      it('should build occupied check query', () => {
        const { sql, params } = buildCheckOccupied('testdb', 42);

        expect(sql).toBe('SELECT 1 FROM testdb WHERE id = ? LIMIT 1');
        expect(params).toEqual([42]);
      });
    });

    describe('buildGetMaxOrder', () => {
      it('should build max order query without type', () => {
        const { sql, params } = buildGetMaxOrder('testdb', 5);

        expect(sql).toBe('SELECT MAX(ord) + 1 FROM testdb WHERE up = ?');
        expect(params).toEqual([5]);
      });

      it('should build max order query with type filter', () => {
        const { sql, params } = buildGetMaxOrder('testdb', 5, 18);

        expect(sql).toBe('SELECT MAX(ord) + 1 FROM testdb WHERE up = ? AND t = ?');
        expect(params).toEqual([5, 18]);
      });
    });

    describe('buildCalcOrder', () => {
      it('should build calculate order query', () => {
        const { sql, params } = buildCalcOrder('testdb', 5, 18);

        expect(sql).toBe('SELECT COALESCE(MAX(ord), 0) + 1 as next_ord FROM testdb WHERE up = ? AND t = ?');
        expect(params).toEqual([5, 18]);
      });
    });
  });
});
