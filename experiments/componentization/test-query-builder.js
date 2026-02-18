#!/usr/bin/env node
/**
 * Experiment: Test @integram/database QueryBuilder
 *
 * This script demonstrates the usage of the QueryBuilder class
 * that provides SQL query construction matching PHP monolith behavior.
 *
 * Run with: node experiments/componentization/test-query-builder.js
 */

import QueryBuilder, {
  buildInsert,
  buildUpdateVal,
  buildUpdateType,
  buildDelete,
  buildBatchDelete,
  buildCheckOccupied,
  buildGetMaxOrder,
  buildCalcOrder,
} from '../../packages/@integram/database/query-builder.js';

console.log('===== @integram/database QueryBuilder Test =====\n');

// Test 1: Basic SELECT query
console.log('1. Basic SELECT query:');
const basicQuery = QueryBuilder.from('my');
console.log(`   SQL: ${basicQuery.toSql()}`);
console.log(`   Params: ${JSON.stringify(basicQuery.getParams())}`);
console.log();

// Test 2: SELECT with specific columns
console.log('2. SELECT with specific columns:');
const columnsQuery = QueryBuilder.from('my')
  .select('id', 'val', 'up', 't', 'ord');
console.log(`   SQL: ${columnsQuery.toSql()}`);
console.log();

// Test 3: WHERE conditions
console.log('3. WHERE conditions:');
const whereQuery = QueryBuilder.from('my')
  .whereType(18)
  .whereParent(0)
  .where('ord', '>', 5);
const { sql: whereSql, params: whereParams } = whereQuery.buildSelect();
console.log(`   SQL: ${whereSql}`);
console.log(`   Params: ${JSON.stringify(whereParams)}`);
console.log();

// Test 4: ORDER BY and LIMIT
console.log('4. ORDER BY and LIMIT:');
const orderedQuery = QueryBuilder.from('my')
  .select('id', 'val')
  .whereType(18)
  .orderBy('ord', 'ASC')
  .limit(100);
console.log(`   SQL: ${orderedQuery.toSql()}`);
console.log();

// Test 5: WHERE IN clause
console.log('5. WHERE IN clause:');
const inQuery = QueryBuilder.from('my')
  .where('id', 'IN', [1, 2, 3, 4, 5]);
const { sql: inSql, params: inParams } = inQuery.buildSelect();
console.log(`   SQL: ${inSql}`);
console.log(`   Params: ${JSON.stringify(inParams)}`);
console.log();

// Test 6: WHERE LIKE clause
console.log('6. WHERE LIKE clause:');
const likeQuery = QueryBuilder.from('my')
  .where('val', 'LIKE', '%search%');
const { sql: likeSql, params: likeParams } = likeQuery.buildSelect();
console.log(`   SQL: ${likeSql}`);
console.log(`   Params: ${JSON.stringify(likeParams)}`);
console.log();

// Test 7: Complex Integram query
console.log('7. Complex Integram-style query (user list):');
const usersQuery = QueryBuilder.from('my')
  .select('id', 'val', 'up', 't', 'ord')
  .whereType(18) // USER type
  .whereParent(0) // Root level
  .orderBy('val', 'ASC')
  .limit(50);
console.log(`   SQL: ${usersQuery.toSql()}`);
console.log();

// Test 8: Static query builders (PHP function mappings)
console.log('8. Static Query Builders (PHP function mappings):');
console.log();

console.log('   buildInsert (maps to PHP Insert()):');
const insertResult = buildInsert('my', 100, 1, 18, 'John Doe');
console.log(`      SQL: ${insertResult.sql}`);
console.log(`      Params: ${JSON.stringify(insertResult.params)}`);
console.log();

console.log('   buildUpdateVal (maps to PHP Update_Val()):');
const updateResult = buildUpdateVal('my', 123, 'Jane Doe');
console.log(`      SQL: ${updateResult.sql}`);
console.log(`      Params: ${JSON.stringify(updateResult.params)}`);
console.log();

console.log('   buildUpdateType (maps to PHP UpdateTyp()):');
const updateTypeResult = buildUpdateType('my', 123, 42);
console.log(`      SQL: ${updateTypeResult.sql}`);
console.log(`      Params: ${JSON.stringify(updateTypeResult.params)}`);
console.log();

console.log('   buildDelete (maps to PHP Delete()):');
const deleteResult = buildDelete('my', 123);
console.log(`      SQL: ${deleteResult.sql}`);
console.log(`      Params: ${JSON.stringify(deleteResult.params)}`);
console.log();

console.log('   buildBatchDelete (delete children):');
const batchDeleteResult = buildBatchDelete('my', 100);
console.log(`      SQL: ${batchDeleteResult.sql}`);
console.log(`      Params: ${JSON.stringify(batchDeleteResult.params)}`);
console.log();

console.log('   buildCheckOccupied (maps to PHP IsOccupied()):');
const occupiedResult = buildCheckOccupied('my', 123);
console.log(`      SQL: ${occupiedResult.sql}`);
console.log(`      Params: ${JSON.stringify(occupiedResult.params)}`);
console.log();

console.log('   buildGetMaxOrder (maps to PHP Get_Ord()):');
const maxOrderResult = buildGetMaxOrder('my', 100, 18);
console.log(`      SQL: ${maxOrderResult.sql}`);
console.log(`      Params: ${JSON.stringify(maxOrderResult.params)}`);
console.log();

console.log('   buildCalcOrder (maps to PHP Calc_Order()):');
const calcOrderResult = buildCalcOrder('my', 100, 18);
console.log(`      SQL: ${calcOrderResult.sql}`);
console.log(`      Params: ${JSON.stringify(calcOrderResult.params)}`);
console.log();

// Test 9: GROUP BY and aggregation
console.log('9. GROUP BY and aggregation:');
const aggQuery = QueryBuilder.from('my')
  .select('t', 'COUNT(*) as count')
  .whereParent(0)
  .groupBy('t')
  .having('COUNT(*) > 5')
  .orderBy('count', 'DESC');
console.log(`   SQL: ${aggQuery.toSql()}`);
console.log();

// Test 10: DISTINCT
console.log('10. SELECT DISTINCT:');
const distinctQuery = QueryBuilder.from('my')
  .select('val')
  .distinct()
  .whereType(18);
console.log(`   SQL: ${distinctQuery.toSql()}`);
console.log();

console.log('===== All Tests Complete =====');
