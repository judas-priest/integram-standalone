#!/usr/bin/env node
/**
 * Integram Database Import Script
 *
 * Imports a JSON export file into a PostgreSQL database for the new Node.js backend.
 * Can also import into MySQL/MariaDB for compatibility.
 *
 * Usage:
 *   node import-database.js <export_file.json> [options]
 *
 * Options:
 *   --target     Target database type: postgres, mysql (default: postgres)
 *   --host       Database host (default: localhost)
 *   --port       Database port (default: 5432 for postgres, 3306 for mysql)
 *   --user       Database user (default: postgres or root)
 *   --password   Database password
 *   --database   Target database name (default: from export file)
 *   --create     Create the database if it doesn't exist
 *   --drop       Drop existing database before import
 *   --dry-run    Show what would be done without executing
 *   --batch-size Batch size for inserts (default: 1000)
 *
 * Examples:
 *   node import-database.js ./exports/my_2026-02-18.json
 *   node import-database.js ./exports/my_2026-02-18.json --target=mysql --create
 *   node import-database.js ./exports/my_2026-02-18.json --database=newdb --drop
 */

import fs from 'fs/promises';
import path from 'path';

// Dynamic imports for database drivers
let pg, mysql;

class DatabaseImporter {
  constructor(options) {
    this.options = {
      target: options.target || 'postgres',
      host: options.host || 'localhost',
      port: parseInt(options.port || (options.target === 'mysql' ? '3306' : '5432'), 10),
      user: options.user || (options.target === 'mysql' ? 'root' : 'postgres'),
      password: options.password || '',
      database: options.database || null,
      create: options.create || false,
      drop: options.drop || false,
      dryRun: options.dryRun || false,
      batchSize: parseInt(options.batchSize || '1000', 10),
      exportFile: options.exportFile,
    };

    this.connection = null;
    this.exportData = null;
    this.stats = {
      typesImported: 0,
      objectsImported: 0,
      errorsCount: 0,
    };
  }

  async loadExportFile() {
    console.log(`Loading export file: ${this.options.exportFile}`);

    const content = await fs.readFile(this.options.exportFile, 'utf-8');
    this.exportData = JSON.parse(content);

    // Set database name from export if not specified
    if (!this.options.database) {
      this.options.database = this.exportData.database;
    }

    console.log(`  Database: ${this.exportData.database}`);
    console.log(`  Types: ${this.exportData.types?.length || 0}`);
    console.log(`  Objects: ${this.exportData.objects?.length || 0}`);
    console.log(`  Exported at: ${this.exportData.exportedAt}`);
  }

  async connect() {
    console.log(`\nConnecting to ${this.options.target} at ${this.options.host}:${this.options.port}...`);

    if (this.options.dryRun) {
      console.log('  [DRY RUN] Skipping connection');
      return;
    }

    if (this.options.target === 'postgres') {
      pg = (await import('pg')).default;
      this.pool = new pg.Pool({
        host: this.options.host,
        port: this.options.port,
        user: this.options.user,
        password: this.options.password,
        database: 'postgres', // Connect to default db first
      });
      this.connection = await this.pool.connect();
    } else {
      mysql = (await import('mysql2/promise')).default;
      this.connection = await mysql.createConnection({
        host: this.options.host,
        port: this.options.port,
        user: this.options.user,
        password: this.options.password,
      });
    }

    console.log('  Connected');
  }

  async close() {
    if (this.connection) {
      if (this.options.target === 'postgres') {
        this.connection.release();
        await this.pool.end();
      } else {
        await this.connection.end();
      }
      console.log('Connection closed.');
    }
  }

  async prepareDatabase() {
    const db = this.options.database;
    console.log(`\nPreparing database: ${db}`);

    if (this.options.dryRun) {
      if (this.options.drop) {
        console.log(`  [DRY RUN] Would drop database: ${db}`);
      }
      if (this.options.create) {
        console.log(`  [DRY RUN] Would create database: ${db}`);
      }
      return;
    }

    try {
      if (this.options.drop) {
        console.log(`  Dropping database: ${db}`);
        if (this.options.target === 'postgres') {
          // Terminate existing connections
          await this.connection.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1 AND pid <> pg_backend_pid()
          `, [db]);
          await this.connection.query(`DROP DATABASE IF EXISTS "${db}"`);
        } else {
          await this.connection.query(`DROP DATABASE IF EXISTS \`${db}\``);
        }
      }

      if (this.options.create) {
        console.log(`  Creating database: ${db}`);
        if (this.options.target === 'postgres') {
          try {
            await this.connection.query(`CREATE DATABASE "${db}"`);
          } catch (e) {
            if (e.code !== '42P04') { // Database already exists
              throw e;
            }
          }
        } else {
          await this.connection.query(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
        }
      }

      // Reconnect to the target database
      if (this.options.target === 'postgres') {
        this.connection.release();
        await this.pool.end();

        this.pool = new pg.Pool({
          host: this.options.host,
          port: this.options.port,
          user: this.options.user,
          password: this.options.password,
          database: db,
        });
        this.connection = await this.pool.connect();
      } else {
        await this.connection.changeUser({ database: db });
      }

      console.log(`  Connected to: ${db}`);

      // Create table
      await this.createTable();
    } catch (error) {
      console.error(`  Error preparing database: ${error.message}`);
      throw error;
    }
  }

  async createTable() {
    const db = this.options.database;
    console.log('  Creating table structure...');

    if (this.options.dryRun) {
      console.log('  [DRY RUN] Would create table');
      return;
    }

    if (this.options.target === 'postgres') {
      await this.connection.query(`
        CREATE TABLE IF NOT EXISTS "${db}" (
          id SERIAL PRIMARY KEY,
          up INTEGER NOT NULL DEFAULT 0,
          ord INTEGER NOT NULL DEFAULT 0,
          t INTEGER NOT NULL DEFAULT 0,
          val TEXT
        )
      `);

      // Create indexes
      await this.connection.query(`
        CREATE INDEX IF NOT EXISTS "${db}_up_idx" ON "${db}" (up);
        CREATE INDEX IF NOT EXISTS "${db}_t_idx" ON "${db}" (t);
        CREATE INDEX IF NOT EXISTS "${db}_val_idx" ON "${db}" (val);
      `);
    } else {
      await this.connection.query(`
        CREATE TABLE IF NOT EXISTS \`${db}\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          up INT NOT NULL DEFAULT 0,
          ord INT NOT NULL DEFAULT 0,
          t INT NOT NULL DEFAULT 0,
          val VARCHAR(10000),
          KEY up (up),
          KEY t (t),
          KEY val (val(100))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    console.log('  Table created');
  }

  async importTypes() {
    const types = this.exportData.types || [];
    if (types.length === 0) {
      console.log('\nNo types to import');
      return;
    }

    console.log(`\nImporting ${types.length} types...`);

    if (this.options.dryRun) {
      console.log(`  [DRY RUN] Would import ${types.length} types`);
      return;
    }

    for (const type of types) {
      try {
        // Insert type
        await this.insertRow({
          id: type.id,
          up: 0,
          ord: type.order,
          t: type.baseType,
          val: type.name,
        });
        this.stats.typesImported++;

        // Insert requisites
        for (const req of type.requisites || []) {
          // Reconstruct the value with modifiers
          let val = req.name;
          if (req.alias) val = `:ALIAS=${req.alias}:${val}`;
          if (req.required) val = `:!NULL:${val}`;
          if (req.multi) val = `:MULTI:${val}`;

          await this.insertRow({
            id: req.id,
            up: type.id,
            ord: req.order,
            t: req.typeId,
            val,
          });
        }
      } catch (error) {
        console.error(`  Error importing type ${type.id}: ${error.message}`);
        this.stats.errorsCount++;
      }
    }

    console.log(`  Imported ${this.stats.typesImported} types`);
  }

  async importObjects() {
    const objects = this.exportData.objects || [];
    if (objects.length === 0) {
      console.log('\nNo objects to import');
      return;
    }

    console.log(`\nImporting ${objects.length} objects...`);

    if (this.options.dryRun) {
      console.log(`  [DRY RUN] Would import ${objects.length} objects`);
      return;
    }

    // Import in batches
    const batchSize = this.options.batchSize;
    let imported = 0;

    for (let i = 0; i < objects.length; i += batchSize) {
      const batch = objects.slice(i, i + batchSize);

      try {
        await this.insertBatch(batch);
        imported += batch.length;
        this.stats.objectsImported += batch.length;

        // Progress indicator
        const progress = Math.round((i + batch.length) / objects.length * 100);
        process.stdout.write(`\r  Importing... ${progress}% (${imported}/${objects.length})`);
      } catch (error) {
        console.error(`\n  Error importing batch at ${i}: ${error.message}`);
        this.stats.errorsCount++;

        // Try individual inserts for this batch
        for (const obj of batch) {
          try {
            await this.insertRow({
              id: obj.id,
              up: obj.parentId,
              ord: obj.order,
              t: obj.typeId,
              val: obj.value,
            });
            imported++;
            this.stats.objectsImported++;
          } catch (e) {
            this.stats.errorsCount++;
          }
        }
      }
    }

    console.log(`\n  Imported ${this.stats.objectsImported} objects`);
  }

  async insertRow(row) {
    const db = this.options.database;

    if (this.options.target === 'postgres') {
      await this.connection.query(
        `INSERT INTO "${db}" (id, up, ord, t, val) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET up = $2, ord = $3, t = $4, val = $5`,
        [row.id, row.up, row.ord, row.t, row.val]
      );
    } else {
      await this.connection.query(
        `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE up = VALUES(up), ord = VALUES(ord), t = VALUES(t), val = VALUES(val)`,
        [row.id, row.up, row.ord, row.t, row.val]
      );
    }
  }

  async insertBatch(objects) {
    const db = this.options.database;

    if (this.options.target === 'postgres') {
      // Build bulk insert
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const obj of objects) {
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(obj.id, obj.parentId, obj.order, obj.typeId, obj.value);
      }

      await this.connection.query(
        `INSERT INTO "${db}" (id, up, ord, t, val) VALUES ${values.join(', ')}
         ON CONFLICT (id) DO UPDATE SET up = EXCLUDED.up, ord = EXCLUDED.ord, t = EXCLUDED.t, val = EXCLUDED.val`,
        params
      );
    } else {
      // Build bulk insert for MySQL
      const values = objects.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = [];

      for (const obj of objects) {
        params.push(obj.id, obj.parentId, obj.order, obj.typeId, obj.value);
      }

      await this.connection.query(
        `INSERT INTO \`${db}\` (id, up, ord, t, val) VALUES ${values}
         ON DUPLICATE KEY UPDATE up = VALUES(up), ord = VALUES(ord), t = VALUES(t), val = VALUES(val)`,
        params
      );
    }
  }

  async resetSequence() {
    if (this.options.target !== 'postgres') {
      return;
    }

    const db = this.options.database;
    console.log('\nResetting sequence...');

    if (this.options.dryRun) {
      console.log('  [DRY RUN] Would reset sequence');
      return;
    }

    await this.connection.query(`
      SELECT setval(pg_get_serial_sequence('"${db}"', 'id'),
                    (SELECT COALESCE(MAX(id), 1) FROM "${db}"))
    `);

    console.log('  Sequence reset');
  }

  async run() {
    try {
      await this.loadExportFile();
      await this.connect();
      await this.prepareDatabase();
      await this.importTypes();
      await this.importObjects();
      await this.resetSequence();

      console.log('\n' + '='.repeat(60));
      console.log('IMPORT SUMMARY');
      console.log('='.repeat(60));
      console.log(`Database: ${this.options.database}`);
      console.log(`Target: ${this.options.target}`);
      console.log(`Types imported: ${this.stats.typesImported}`);
      console.log(`Objects imported: ${this.stats.objectsImported}`);
      console.log(`Errors: ${this.stats.errorsCount}`);

      if (this.options.dryRun) {
        console.log('\n⚠️  DRY RUN - No changes were made');
      } else {
        console.log('\n✅ Import completed successfully!');
      }
    } catch (error) {
      console.error('\n❌ Import failed:', error.message);
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

  // First argument should be the export file
  if (args.length === 0 || args[0].startsWith('-')) {
    console.error('Usage: node import-database.js <export_file.json> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --target     Target database type: postgres, mysql (default: postgres)');
    console.error('  --host       Database host (default: localhost)');
    console.error('  --port       Database port');
    console.error('  --user       Database user');
    console.error('  --password   Database password');
    console.error('  --database   Target database name (default: from export)');
    console.error('  --create     Create the database if it doesn\'t exist');
    console.error('  --drop       Drop existing database before import');
    console.error('  --dry-run    Show what would be done without executing');
    console.error('  --batch-size Batch size for inserts (default: 1000)');
    process.exit(1);
  }

  options.exportFile = args[0];

  // Parse remaining arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');

      switch (key) {
        case 'target':
          options.target = value || args[++i];
          break;
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
        case 'database':
          options.database = value || args[++i];
          break;
        case 'batch-size':
          options.batchSize = value || args[++i];
          break;
        case 'create':
          options.create = true;
          break;
        case 'drop':
          options.drop = true;
          break;
        case 'dry-run':
          options.dryRun = true;
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
const importer = new DatabaseImporter(options);
importer.run().catch(() => process.exit(1));
