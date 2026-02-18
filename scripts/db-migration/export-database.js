#!/usr/bin/env node
/**
 * Integram Database Export Script
 *
 * Exports an existing Integram database (MySQL/MariaDB) to JSON format
 * for migration to the new Node.js backend.
 *
 * Usage:
 *   node export-database.js <database_name> [options]
 *
 * Options:
 *   --host       Database host (default: localhost)
 *   --port       Database port (default: 3306)
 *   --user       Database user (default: root)
 *   --password   Database password
 *   --output     Output directory (default: ./exports)
 *   --format     Output format: json, sql, or both (default: json)
 *   --include    Comma-separated list of tables to include (default: all)
 *   --exclude    Comma-separated list of tables to exclude
 *   --types-only Export only type definitions (metadata)
 *   --data-only  Export only data (objects)
 *   --settings   Include settings and configuration
 *
 * Examples:
 *   node export-database.js my
 *   node export-database.js my --output ./backup --format both
 *   node export-database.js my --types-only
 *   node export-database.js my --password=secret --host=db.example.com
 */

import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Basic type mapping from PHP constants
const BASIC_TYPES = {
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

// System type IDs
const SYSTEM_TYPES = {
  USER: 18,
  DATABASE: 271,
  PHONE: 30,
  XSRF: 40,
  EMAIL: 41,
  ROLE: 42,
  ACTIVITY: 124,
  PASSWORD: 20,
  TOKEN: 125,
  SECRET: 130,
};

class DatabaseExporter {
  constructor(options) {
    this.options = {
      host: options.host || 'localhost',
      port: parseInt(options.port || '3306', 10),
      user: options.user || 'root',
      password: options.password || '',
      database: options.database,
      outputDir: options.output || './exports',
      format: options.format || 'json',
      includeTypes: options.typesOnly || !options.dataOnly,
      includeData: options.dataOnly || !options.typesOnly,
      includeSettings: options.settings || false,
      include: options.include ? options.include.split(',') : null,
      exclude: options.exclude ? options.exclude.split(',') : [],
    };

    this.connection = null;
    this.exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      database: this.options.database,
      types: [],
      objects: [],
      settings: {},
      statistics: {},
    };
  }

  async connect() {
    console.log(`Connecting to ${this.options.host}:${this.options.port}...`);
    this.connection = await mysql.createConnection({
      host: this.options.host,
      port: this.options.port,
      user: this.options.user,
      password: this.options.password,
    });

    // Check if database exists
    const [rows] = await this.connection.query(
      `SELECT 1 FROM ${this.options.database} LIMIT 1`
    );
    console.log(`Connected to database: ${this.options.database}`);
  }

  async close() {
    if (this.connection) {
      await this.connection.end();
      console.log('Connection closed.');
    }
  }

  async exportTypes() {
    if (!this.options.includeTypes) {
      console.log('Skipping type export (--data-only specified)');
      return;
    }

    console.log('\nExporting types (metadata)...');
    const db = this.options.database;

    // Get all types (root objects where up=0 and id!=t)
    const [types] = await this.connection.query(`
      SELECT
        obj.id,
        obj.val as name,
        obj.t as baseType,
        obj.ord as \`order\`,
        obj.up as parentId
      FROM ${db} obj
      WHERE obj.up = 0
        AND obj.id != obj.t
        AND obj.val != ''
        AND obj.t != 0
      ORDER BY obj.id
    `);

    console.log(`  Found ${types.length} types`);

    // For each type, get its requisites
    for (const type of types) {
      const [requisites] = await this.connection.query(`
        SELECT
          req.id,
          req.val as rawValue,
          req.t as typeId,
          req.ord as \`order\`,
          def.t as baseTypeId
        FROM ${db} req
        LEFT JOIN ${db} def ON def.id = req.t
        WHERE req.up = ?
        ORDER BY req.ord
      `, [type.id]);

      type.requisites = requisites.map(req => this.parseRequisite(req));
      type.basicTypeName = BASIC_TYPES[type.baseType] || null;
      type.isBasicType = type.baseType in BASIC_TYPES;
    }

    this.exportData.types = types;
    console.log(`  Exported ${types.length} types with requisites`);
  }

  async exportObjects() {
    if (!this.options.includeData) {
      console.log('Skipping object export (--types-only specified)');
      return;
    }

    console.log('\nExporting objects...');
    const db = this.options.database;

    // Get total count
    const [countResult] = await this.connection.query(
      `SELECT COUNT(*) as count FROM ${db} WHERE up != 0`
    );
    const totalCount = countResult[0].count;
    console.log(`  Total objects to export: ${totalCount}`);

    // Export in batches to handle large databases
    const batchSize = 10000;
    let offset = 0;
    let totalExported = 0;

    while (offset < totalCount) {
      const [objects] = await this.connection.query(`
        SELECT
          id,
          val as value,
          t as typeId,
          up as parentId,
          ord as \`order\`
        FROM ${db}
        WHERE up != 0
        ORDER BY id
        LIMIT ? OFFSET ?
      `, [batchSize, offset]);

      this.exportData.objects.push(...objects);
      totalExported += objects.length;
      offset += batchSize;

      // Progress indicator
      const progress = Math.min(100, Math.round((offset / totalCount) * 100));
      process.stdout.write(`\r  Exporting... ${progress}% (${totalExported}/${totalCount})`);
    }

    console.log(`\n  Exported ${this.exportData.objects.length} objects`);
  }

  async exportSettings() {
    if (!this.options.includeSettings) {
      console.log('Skipping settings export (--settings not specified)');
      return;
    }

    console.log('\nExporting settings...');
    const db = this.options.database;

    // Export users
    const [users] = await this.connection.query(`
      SELECT
        u.id,
        u.val as username,
        r.val as role,
        email.val as email
      FROM ${db} u
      LEFT JOIN (
        ${db} role_link
        CROSS JOIN ${db} r
      ) ON role_link.up = u.id AND r.id = role_link.t AND r.t = ${SYSTEM_TYPES.ROLE}
      LEFT JOIN ${db} email ON email.up = u.id AND email.t = ${SYSTEM_TYPES.EMAIL}
      WHERE u.t = ${SYSTEM_TYPES.USER}
    `);

    this.exportData.settings.users = users;
    console.log(`  Exported ${users.length} users`);

    // Export roles
    const [roles] = await this.connection.query(`
      SELECT
        r.id,
        r.val as name
      FROM ${db} r
      WHERE r.t = ${SYSTEM_TYPES.ROLE} AND r.up = 1
      ORDER BY r.id
    `);

    this.exportData.settings.roles = roles;
    console.log(`  Exported ${roles.length} roles`);
  }

  async generateStatistics() {
    console.log('\nGenerating statistics...');
    const db = this.options.database;

    // Object count by type
    const [typeStats] = await this.connection.query(`
      SELECT
        obj.t as typeId,
        def.val as typeName,
        COUNT(*) as count
      FROM ${db} obj
      JOIN ${db} def ON def.id = obj.t AND def.up = 0
      WHERE obj.up != 0
      GROUP BY obj.t, def.val
      ORDER BY count DESC
    `);

    this.exportData.statistics = {
      totalTypes: this.exportData.types.length,
      totalObjects: this.exportData.objects.length,
      objectsByType: typeStats,
      exportedAt: new Date().toISOString(),
    };

    console.log('  Statistics generated');
  }

  parseRequisite(req) {
    let value = req.rawValue || '';
    let alias = null;
    let required = false;
    let multi = false;

    // Extract alias
    const aliasMatch = value.match(/:ALIAS=(.*?):/);
    if (aliasMatch) {
      alias = aliasMatch[1];
      value = value.replace(aliasMatch[0], '');
    }

    // Extract NOT NULL
    if (value.includes(':!NULL:')) {
      required = true;
      value = value.replace(':!NULL:', '');
    }

    // Extract MULTI
    if (value.includes(':MULTI:')) {
      multi = true;
      value = value.replace(':MULTI:', '');
    }

    return {
      id: req.id,
      name: value.trim(),
      alias,
      typeId: req.typeId,
      baseTypeId: req.baseTypeId,
      basicTypeName: BASIC_TYPES[req.baseTypeId] || null,
      order: req.order,
      required,
      multi,
    };
  }

  async saveToFile() {
    console.log('\nSaving export...');

    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseFilename = `${this.options.database}_${timestamp}`;

    // Save JSON format
    if (this.options.format === 'json' || this.options.format === 'both') {
      const jsonPath = path.join(this.options.outputDir, `${baseFilename}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(this.exportData, null, 2));
      console.log(`  Saved JSON: ${jsonPath}`);
    }

    // Save SQL format (for import into new database)
    if (this.options.format === 'sql' || this.options.format === 'both') {
      const sqlPath = path.join(this.options.outputDir, `${baseFilename}.sql`);
      await fs.writeFile(sqlPath, this.generateSQL());
      console.log(`  Saved SQL: ${sqlPath}`);
    }

    // Save summary
    const summaryPath = path.join(this.options.outputDir, `${baseFilename}_summary.txt`);
    await fs.writeFile(summaryPath, this.generateSummary());
    console.log(`  Saved summary: ${summaryPath}`);
  }

  generateSQL() {
    const lines = [];
    const db = this.options.database;

    lines.push(`-- Integram Database Export`);
    lines.push(`-- Database: ${db}`);
    lines.push(`-- Exported: ${this.exportData.exportedAt}`);
    lines.push(`-- Version: ${this.exportData.version}`);
    lines.push('');

    // Create table (same structure as original Integram)
    lines.push(`CREATE TABLE IF NOT EXISTS \`${db}\` (`);
    lines.push(`  \`id\` int(11) NOT NULL AUTO_INCREMENT,`);
    lines.push(`  \`up\` int(11) NOT NULL DEFAULT 0,`);
    lines.push(`  \`ord\` int(11) NOT NULL DEFAULT 0,`);
    lines.push(`  \`t\` int(11) NOT NULL DEFAULT 0,`);
    lines.push(`  \`val\` varchar(10000) DEFAULT NULL,`);
    lines.push(`  PRIMARY KEY (\`id\`),`);
    lines.push(`  KEY \`up\` (\`up\`),`);
    lines.push(`  KEY \`t\` (\`t\`),`);
    lines.push(`  KEY \`val\` (\`val\`(100))`);
    lines.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    lines.push('');

    // Insert types
    if (this.exportData.types.length > 0) {
      lines.push('-- Types (Metadata)');
      for (const type of this.exportData.types) {
        const escapedName = (type.name || '').replace(/'/g, "\\'");
        lines.push(
          `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (${type.id}, 0, ${type.order}, ${type.baseType}, '${escapedName}');`
        );

        // Insert requisites
        for (const req of type.requisites || []) {
          // Reconstruct the value with modifiers
          let val = req.name;
          if (req.alias) val = `:ALIAS=${req.alias}:${val}`;
          if (req.required) val = `:!NULL:${val}`;
          if (req.multi) val = `:MULTI:${val}`;

          const escapedVal = val.replace(/'/g, "\\'");
          lines.push(
            `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (${req.id}, ${type.id}, ${req.order}, ${req.typeId}, '${escapedVal}');`
          );
        }
      }
      lines.push('');
    }

    // Insert objects
    if (this.exportData.objects.length > 0) {
      lines.push('-- Objects (Data)');
      for (const obj of this.exportData.objects) {
        const escapedVal = (obj.value || '').replace(/'/g, "\\'");
        lines.push(
          `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (${obj.id}, ${obj.parentId}, ${obj.order}, ${obj.typeId}, '${escapedVal}');`
        );
      }
    }

    return lines.join('\n');
  }

  generateSummary() {
    const stats = this.exportData.statistics;
    const lines = [];

    lines.push('='.repeat(60));
    lines.push('INTEGRAM DATABASE EXPORT SUMMARY');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Database: ${this.exportData.database}`);
    lines.push(`Exported: ${this.exportData.exportedAt}`);
    lines.push(`Version: ${this.exportData.version}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('STATISTICS');
    lines.push('-'.repeat(60));
    lines.push(`Total Types: ${stats.totalTypes}`);
    lines.push(`Total Objects: ${stats.totalObjects}`);
    lines.push('');

    if (stats.objectsByType && stats.objectsByType.length > 0) {
      lines.push('Objects by Type:');
      for (const item of stats.objectsByType.slice(0, 20)) {
        lines.push(`  ${item.typeName || `Type ${item.typeId}`}: ${item.count}`);
      }
      if (stats.objectsByType.length > 20) {
        lines.push(`  ... and ${stats.objectsByType.length - 20} more types`);
      }
    }

    if (this.exportData.settings?.users) {
      lines.push('');
      lines.push(`Users: ${this.exportData.settings.users.length}`);
    }

    if (this.exportData.settings?.roles) {
      lines.push(`Roles: ${this.exportData.settings.roles.length}`);
    }

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  async run() {
    try {
      await this.connect();
      await this.exportTypes();
      await this.exportObjects();
      await this.exportSettings();
      await this.generateStatistics();
      await this.saveToFile();

      console.log('\n✅ Export completed successfully!');
      console.log(`   Types: ${this.exportData.types.length}`);
      console.log(`   Objects: ${this.exportData.objects.length}`);
    } catch (error) {
      console.error('\n❌ Export failed:', error.message);
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  // First argument should be the database name
  if (args.length === 0 || args[0].startsWith('-')) {
    console.error('Usage: node export-database.js <database_name> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --host       Database host (default: localhost)');
    console.error('  --port       Database port (default: 3306)');
    console.error('  --user       Database user (default: root)');
    console.error('  --password   Database password');
    console.error('  --output     Output directory (default: ./exports)');
    console.error('  --format     Output format: json, sql, or both (default: json)');
    console.error('  --types-only Export only type definitions');
    console.error('  --data-only  Export only data objects');
    console.error('  --settings   Include settings and configuration');
    process.exit(1);
  }

  options.database = args[0];

  // Parse remaining arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');

      switch (key) {
        case 'host':
          options.host = value || args[++i];
          break;
        case 'port':
          options.port = value || args[++i];
          break;
        case 'user':
          options.user = value || args[++i];
          break;
        case 'password':
          options.password = value || args[++i];
          break;
        case 'output':
          options.output = value || args[++i];
          break;
        case 'format':
          options.format = value || args[++i];
          break;
        case 'include':
          options.include = value || args[++i];
          break;
        case 'exclude':
          options.exclude = value || args[++i];
          break;
        case 'types-only':
          options.typesOnly = true;
          break;
        case 'data-only':
          options.dataOnly = true;
          break;
        case 'settings':
          options.settings = true;
          break;
        default:
          console.error(`Unknown option: --${key}`);
          process.exit(1);
      }
    }
  }

  return options;
}

// Main execution
const options = parseArgs();
const exporter = new DatabaseExporter(options);
exporter.run().catch(() => process.exit(1));
