# Integram Database Migration Scripts

Scripts for migrating existing Integram databases from the PHP monolith to the new Node.js backend.

## Prerequisites

- Node.js 18+
- Access to the source MySQL/MariaDB database
- Access to the target PostgreSQL or MySQL database

## Installation

```bash
cd scripts/db-migration
npm install mysql2 pg
```

## Scripts

### Export Script (`export-database.js`)

Exports an existing Integram database to JSON format.

**Usage:**
```bash
node export-database.js <database_name> [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--host` | Database host | localhost |
| `--port` | Database port | 3306 |
| `--user` | Database user | root |
| `--password` | Database password | - |
| `--output` | Output directory | ./exports |
| `--format` | Output format: json, sql, both | json |
| `--types-only` | Export only type definitions | false |
| `--data-only` | Export only data objects | false |
| `--settings` | Include users and settings | false |

**Examples:**
```bash
# Basic export
node export-database.js my

# Export with authentication
node export-database.js my --password=secret --host=db.example.com

# Export to specific directory with SQL output
node export-database.js my --output ./backup --format both

# Export only metadata (types and structure)
node export-database.js my --types-only

# Include users and roles
node export-database.js my --settings
```

**Output Files:**
- `{database}_{timestamp}.json` - JSON export
- `{database}_{timestamp}.sql` - SQL export (if format is sql or both)
- `{database}_{timestamp}_summary.txt` - Export summary

### Import Script (`import-database.js`)

Imports a JSON export into a PostgreSQL or MySQL database.

**Usage:**
```bash
node import-database.js <export_file.json> [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--target` | Target database: postgres, mysql | postgres |
| `--host` | Database host | localhost |
| `--port` | Database port | 5432 (postgres) / 3306 (mysql) |
| `--user` | Database user | postgres / root |
| `--password` | Database password | - |
| `--database` | Target database name | from export |
| `--create` | Create database if not exists | false |
| `--drop` | Drop existing database first | false |
| `--dry-run` | Preview without executing | false |
| `--batch-size` | Insert batch size | 1000 |

**Examples:**
```bash
# Import to PostgreSQL (default)
node import-database.js ./exports/my_2026-02-18.json

# Import to MySQL
node import-database.js ./exports/my_2026-02-18.json --target=mysql

# Create new database and import
node import-database.js ./exports/my_2026-02-18.json --create

# Clean import (drop and recreate)
node import-database.js ./exports/my_2026-02-18.json --drop --create

# Preview import without making changes
node import-database.js ./exports/my_2026-02-18.json --dry-run

# Import to different database name
node import-database.js ./exports/my_2026-02-18.json --database=newdb --create
```

## Migration Process

### Step 1: Export from PHP Backend

```bash
# Connect to the server running the PHP backend
ssh user@php-server

# Export the database
node export-database.js my --password=secret --settings --format both
```

### Step 2: Transfer Export Files

```bash
scp user@php-server:./exports/my_*.json ./
```

### Step 3: Import to New Backend

```bash
# For PostgreSQL (recommended for new installations)
node import-database.js my_2026-02-18.json --target=postgres --create

# For MySQL (if keeping MySQL)
node import-database.js my_2026-02-18.json --target=mysql --create
```

### Step 4: Verify Migration

```bash
# Connect to the new database and verify
psql -h localhost -U postgres -d my -c "SELECT COUNT(*) FROM my"

# Or for MySQL
mysql -u root -p -e "SELECT COUNT(*) FROM my.my"
```

## Data Structure

Integram uses a single table per database with the following structure:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Unique object identifier |
| `up` | INT | Parent object ID (0 for root/types) |
| `ord` | INT | Order within parent |
| `t` | INT | Type ID |
| `val` | VARCHAR | Object value |

### Object Categories

- **Types (Metadata)**: `up = 0`, `t = base_type_id`
- **Requisites**: `up = type_id`, define attributes for types
- **Data Objects**: `up = parent_id`, actual data

### Basic Types

| ID | Name | Description |
|----|------|-------------|
| 3 | SHORT | Short text (up to 127 chars) |
| 8 | CHARS | Long text (up to 10000 chars) |
| 9 | DATE | Date (YYYYMMDD format) |
| 13 | NUMBER | Integer |
| 14 | SIGNED | Decimal number |
| 11 | BOOLEAN | True/False |
| 12 | MEMO | Multiline text |
| 10 | FILE | File attachment |
| 6 | PWD | Password (hashed) |

## Troubleshooting

### Export Fails with "Access denied"

Check your MySQL credentials and ensure the user has SELECT privileges:
```sql
GRANT SELECT ON database_name.* TO 'user'@'localhost';
```

### Import Fails with "Database does not exist"

Use the `--create` flag to create the database:
```bash
node import-database.js export.json --create
```

### Large Database Export

For very large databases (>1M rows), consider:
1. Exporting types and data separately
2. Using the `--batch-size` option during import
3. Running during off-peak hours

### Character Encoding Issues

Ensure both source and target databases use UTF-8:
```sql
-- PostgreSQL
CREATE DATABASE mydb WITH ENCODING 'UTF8';

-- MySQL
CREATE DATABASE mydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Support

For issues with migration:
1. Check the export summary file for statistics
2. Review error logs
3. Use `--dry-run` to preview import actions
4. Open an issue with export summary and error details
