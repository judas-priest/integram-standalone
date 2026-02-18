/**
 * @integram/database - Query Builder Tests
 *
 * Unit tests for the QueryBuilder class and static query builder functions.
 * These tests verify SQL generation without requiring a database connection.
 */

import { describe, it, expect } from 'vitest';
import QueryBuilder, {
  buildInsert,
  buildUpdateVal,
  buildUpdateType,
  buildDelete,
  buildBatchDelete,
  buildCheckOccupied,
  buildGetMaxOrder,
  buildCalcOrder,
} from '../query-builder.js';

describe('@integram/database QueryBuilder', () => {
  describe('QueryBuilder class', () => {
    describe('Basic SELECT queries', () => {
      it('should build simple SELECT * query', () => {
        const query = QueryBuilder.from('test_db');
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db');
        expect(params).toEqual([]);
      });

      it('should build SELECT with specific columns', () => {
        const query = QueryBuilder.from('test_db')
          .select('id', 'val', 't');
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT id, val, t FROM test_db');
        expect(params).toEqual([]);
      });

      it('should build SELECT DISTINCT', () => {
        const query = QueryBuilder.from('test_db')
          .select('val')
          .distinct();
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT DISTINCT val FROM test_db');
        expect(params).toEqual([]);
      });
    });

    describe('WHERE conditions', () => {
      it('should build simple WHERE equals', () => {
        const query = QueryBuilder.from('test_db')
          .whereEquals('id', 123);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE id = ?');
        expect(params).toEqual([123]);
      });

      it('should build WHERE with custom operator', () => {
        const query = QueryBuilder.from('test_db')
          .where('ord', '>', 10);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE ord > ?');
        expect(params).toEqual([10]);
      });

      it('should build whereId helper', () => {
        const query = QueryBuilder.from('test_db')
          .whereId(42);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE id = ?');
        expect(params).toEqual([42]);
      });

      it('should build whereType helper', () => {
        const query = QueryBuilder.from('test_db')
          .whereType(18);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE t = ?');
        expect(params).toEqual([18]);
      });

      it('should build whereParent helper', () => {
        const query = QueryBuilder.from('test_db')
          .whereParent(100);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE up = ?');
        expect(params).toEqual([100]);
      });

      it('should build WHERE IN', () => {
        const query = QueryBuilder.from('test_db')
          .where('id', 'IN', [1, 2, 3]);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE id IN (?, ?, ?)');
        expect(params).toEqual([1, 2, 3]);
      });

      it('should build WHERE NOT IN', () => {
        const query = QueryBuilder.from('test_db')
          .where('id', 'NOT IN', [5, 6]);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE id NOT IN (?, ?)');
        expect(params).toEqual([5, 6]);
      });

      it('should build WHERE LIKE', () => {
        const query = QueryBuilder.from('test_db')
          .where('val', 'LIKE', '%test%');
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE val LIKE ?');
        expect(params).toEqual(['%test%']);
      });

      it('should build WHERE BETWEEN', () => {
        const query = QueryBuilder.from('test_db')
          .where('ord', 'BETWEEN', [10, 20]);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE ord BETWEEN ? AND ?');
        expect(params).toEqual([10, 20]);
      });

      it('should build WHERE IS NULL', () => {
        const query = QueryBuilder.from('test_db')
          .whereNull('val', true);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE val IS NULL');
        expect(params).toEqual([]);
      });

      it('should build WHERE IS NOT NULL', () => {
        const query = QueryBuilder.from('test_db')
          .whereNull('val', false);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE val IS NOT NULL');
        expect(params).toEqual([]);
      });

      it('should combine multiple WHERE conditions with AND', () => {
        const query = QueryBuilder.from('test_db')
          .whereType(18)
          .whereParent(100)
          .where('ord', '>', 5);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db WHERE t = ? AND up = ? AND ord > ?');
        expect(params).toEqual([18, 100, 5]);
      });
    });

    describe('ORDER BY', () => {
      it('should build ORDER BY ascending', () => {
        const query = QueryBuilder.from('test_db')
          .orderBy('ord', 'ASC');
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db ORDER BY ord ASC');
      });

      it('should build ORDER BY descending', () => {
        const query = QueryBuilder.from('test_db')
          .orderBy('id', 'DESC');
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db ORDER BY id DESC');
      });

      it('should build multiple ORDER BY clauses', () => {
        const query = QueryBuilder.from('test_db')
          .orderBy('t', 'ASC')
          .orderBy('ord', 'DESC');
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db ORDER BY t ASC, ord DESC');
      });
    });

    describe('LIMIT and OFFSET', () => {
      it('should build LIMIT', () => {
        const query = QueryBuilder.from('test_db')
          .limit(10);
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db LIMIT 10');
      });

      it('should build OFFSET', () => {
        const query = QueryBuilder.from('test_db')
          .limit(10)
          .offset(20);
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db LIMIT 10 OFFSET 20');
      });

      it('should parse string numbers', () => {
        const query = QueryBuilder.from('test_db')
          .limit('25')
          .offset('50');
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db LIMIT 25 OFFSET 50');
      });
    });

    describe('GROUP BY and HAVING', () => {
      it('should build GROUP BY', () => {
        const query = QueryBuilder.from('test_db')
          .select('t', 'COUNT(*) as cnt')
          .groupBy('t');
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT t, COUNT(*) as cnt FROM test_db GROUP BY t');
      });

      it('should build GROUP BY with HAVING', () => {
        const query = QueryBuilder.from('test_db')
          .select('t', 'COUNT(*) as cnt')
          .groupBy('t')
          .having('COUNT(*) > 5');
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT t, COUNT(*) as cnt FROM test_db GROUP BY t HAVING COUNT(*) > 5');
      });
    });

    describe('JOIN clauses', () => {
      it('should build LEFT JOIN', () => {
        const query = QueryBuilder.from('test_db')
          .leftJoin('test_db', 'attr', 'attr.up = test_db.id');
        const { sql } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db LEFT JOIN test_db attr ON attr.up = test_db.id');
      });

      it('should build JOIN with parameters', () => {
        const query = QueryBuilder.from('test_db vals')
          .leftJoin('test_db', 'attr', 'attr.up = vals.id AND attr.t = ?', [20]);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT * FROM test_db vals LEFT JOIN test_db attr ON attr.up = vals.id AND attr.t = ?');
        expect(params).toEqual([20]);
      });
    });

    describe('Complex queries', () => {
      it('should build Integram-style object query', () => {
        const query = QueryBuilder.from('my')
          .select('id', 'val', 'up', 't', 'ord')
          .whereType(18)
          .whereParent(0)
          .orderBy('ord', 'ASC')
          .limit(100);
        const { sql, params } = query.buildSelect();

        expect(sql).toBe('SELECT id, val, up, t, ord FROM my WHERE t = ? AND up = ? ORDER BY ord ASC LIMIT 100');
        expect(params).toEqual([18, 0]);
      });
    });

    describe('SQL injection prevention', () => {
      it('should throw InjectionError for malicious column names', () => {
        const query = QueryBuilder.from('test_db');
        expect(() => {
          query.where('id; DROP TABLE users;--', '=', 1);
        }).toThrow();
      });

      it('should throw for injection in ORDER BY', () => {
        const query = QueryBuilder.from('test_db');
        expect(() => {
          query.orderBy('id; DROP TABLE users;--', 'ASC');
        }).toThrow();
      });
    });

    describe('Helper methods', () => {
      it('toSql should return only SQL', () => {
        const query = QueryBuilder.from('test_db').whereId(1);
        const sql = query.toSql();

        expect(sql).toBe('SELECT * FROM test_db WHERE id = ?');
        expect(typeof sql).toBe('string');
      });

      it('getParams should return only params', () => {
        const query = QueryBuilder.from('test_db').whereId(1);
        const params = query.getParams();

        expect(params).toEqual([1]);
        expect(Array.isArray(params)).toBe(true);
      });
    });
  });

  describe('Static query builders (PHP function mappings)', () => {
    describe('buildInsert (maps to PHP Insert())', () => {
      it('should build INSERT query', () => {
        const { sql, params } = buildInsert('my', 100, 1, 18, 'John Doe');

        expect(sql).toBe('INSERT INTO my (up, ord, t, val) VALUES (?, ?, ?, ?)');
        expect(params).toEqual([100, 1, 18, 'John Doe']);
      });

      it('should handle empty value', () => {
        const { sql, params } = buildInsert('test', 0, 1, 3, '');

        expect(params[3]).toBe('');
      });
    });

    describe('buildUpdateVal (maps to PHP Update_Val())', () => {
      it('should build UPDATE val query', () => {
        const { sql, params } = buildUpdateVal('my', 123, 'Updated Name');

        expect(sql).toBe('UPDATE my SET val = ? WHERE id = ?');
        expect(params).toEqual(['Updated Name', 123]);
      });
    });

    describe('buildUpdateType (maps to PHP UpdateTyp())', () => {
      it('should build UPDATE type query', () => {
        const { sql, params } = buildUpdateType('my', 123, 42);

        expect(sql).toBe('UPDATE my SET t = ? WHERE id = ?');
        expect(params).toEqual([42, 123]);
      });
    });

    describe('buildDelete (maps to PHP Delete())', () => {
      it('should build DELETE query', () => {
        const { sql, params } = buildDelete('my', 123);

        expect(sql).toBe('DELETE FROM my WHERE id = ?');
        expect(params).toEqual([123]);
      });
    });

    describe('buildBatchDelete', () => {
      it('should build DELETE for children', () => {
        const { sql, params } = buildBatchDelete('my', 100);

        expect(sql).toBe('DELETE FROM my WHERE up = ?');
        expect(params).toEqual([100]);
      });
    });

    describe('buildCheckOccupied (maps to PHP IsOccupied())', () => {
      it('should build existence check query', () => {
        const { sql, params } = buildCheckOccupied('my', 123);

        expect(sql).toBe('SELECT 1 FROM my WHERE id = ? LIMIT 1');
        expect(params).toEqual([123]);
      });
    });

    describe('buildGetMaxOrder (maps to PHP Get_Ord())', () => {
      it('should build max order query without type filter', () => {
        const { sql, params } = buildGetMaxOrder('my', 100);

        expect(sql).toBe('SELECT MAX(ord) + 1 FROM my WHERE up = ?');
        expect(params).toEqual([100]);
      });

      it('should build max order query with type filter', () => {
        const { sql, params } = buildGetMaxOrder('my', 100, 18);

        expect(sql).toBe('SELECT MAX(ord) + 1 FROM my WHERE up = ? AND t = ?');
        expect(params).toEqual([100, 18]);
      });
    });

    describe('buildCalcOrder (maps to PHP Calc_Order())', () => {
      it('should build next order calculation query', () => {
        const { sql, params } = buildCalcOrder('my', 100, 18);

        expect(sql).toBe('SELECT COALESCE(MAX(ord), 0) + 1 as next_ord FROM my WHERE up = ? AND t = ?');
        expect(params).toEqual([100, 18]);
      });
    });
  });
});
