/**
 * @integram/common - Constants
 *
 * These constants mirror the PHP monolith definitions for backward compatibility.
 * See: integram-server/index.php for original PHP constants.
 */

// ============================================================================
// Data Type Identifiers (from PHP index.php)
// ============================================================================

/** User data type identifier */
export const USER = 18;

/** Database type identifier */
export const DATABASE = 271;

/** Phone field type identifier */
export const PHONE = 30;

/** XSRF token type identifier */
export const XSRF = 40;

/** Email field type identifier */
export const EMAIL = 41;

/** Role type identifier */
export const ROLE = 42;

/** Activity timestamp type identifier */
export const ACTIVITY = 124;

/** Password field type identifier */
export const PASSWORD = 20;

/** Token field type identifier */
export const TOKEN = 125;

/** Secret type identifier */
export const SECRET = 130;

/** Version type identifier */
export const VERSION = 8;

// ============================================================================
// Report Constants
// ============================================================================

export const REPORT = 22;
export const LEVEL = 47;
export const MASK = 49;
export const EXPORT = 55;
export const DELETE = 56;
export const ROLE_OBJECT = 116;
export const CONNECT = 226;
export const SETTINGS = 269;
export const SETTINGS_TYPE = 271;
export const SETTINGS_VAL = 273;

// Report Column Constants
export const REP_COLS = 28;
export const REP_JOIN = 44;
export const REP_HREFS = 95;
export const REP_URL = 97;
export const REP_LIMIT = 134;
export const REP_IFNULL = 113;
export const REP_WHERE = 262;
export const REP_ALIAS = 265;
export const REP_JOIN_ON = 266;

// Report Column Format Constants
export const REP_COL_FORMAT = 29;
export const REP_COL_ALIAS = 58;
export const REP_COL_FUNC = 63;
export const REP_COL_TOTAL = 65;
export const REP_COL_NAME = 100;
export const REP_COL_FORMULA = 101;
export const REP_COL_FROM = 102;
export const REP_COL_TO = 103;
export const REP_COL_HAV_FR = 105;
export const REP_COL_HAV_TO = 106;
export const REP_COL_HIDE = 107;
export const REP_COL_SORT = 109;
export const REP_COL_SET = 132;

// ============================================================================
// Validation Patterns (from PHP index.php)
// ============================================================================

/** Database name validation pattern - allows alphanumeric with underscore, 2-15 chars */
export const DB_MASK = /^[a-z]\w{1,14}$/i;

/** User database name validation pattern - 3-15 chars */
export const USER_DB_MASK = /^[a-z]\w{2,14}$/i;

/** Directory name validation pattern */
export const DIR_MASK = /^[a-z0-9_]+$/i;

/** File name validation pattern */
export const FILE_MASK = /^[a-z0-9_.]+$/i;

/** Email validation pattern */
export const MAIL_MASK = /.+@.+\..+/i;

// ============================================================================
// Configuration Constants
// ============================================================================

/** Maximum length of the value (val) field on UI */
export const VAL_LIM = 127;

/** Default LIMIT parameter for queries with no filter */
export const DEFAULT_LIMIT = 20;

/** Default length of dropdown lists */
export const DDLIST_ITEMS = 80;

/** Cookie expiration time in seconds (30 days) */
export const COOKIES_EXPIRE = 2592000;

/** Password field display placeholder */
export const PASSWORD_STARS = '******';

// ============================================================================
// Mask Constants
// ============================================================================

export const NOT_NULL_MASK = ':!NULL:';
export const MULTI_MASK = ':MULTI:';
export const ALIAS_MASK = /:ALIAS=(.*?):/u;
export const ALIAS_DEF = ':ALIAS=';

// ============================================================================
// Basic Data Types Mapping (from PHP $GLOBALS["basics"])
// ============================================================================

/**
 * Basic data types mapping from type ID to type name.
 * Used for data formatting and UI rendering.
 */
export const BASIC_TYPES = Object.freeze({
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
});

/**
 * Reverse mapping from type name to type ID.
 */
export const BASIC_TYPE_IDS = Object.freeze(
  Object.entries(BASIC_TYPES).reduce((acc, [id, name]) => {
    acc[name] = parseInt(id, 10);
    return acc;
  }, {})
);

// ============================================================================
// Grant Levels
// ============================================================================

export const GRANTS = Object.freeze({
  READ: 'READ',
  WRITE: 'WRITE',
  BARRED: 'BARRED',
});

// ============================================================================
// Special UI Labels (translations handled separately)
// ============================================================================

export const SPECIAL_LABELS = Object.freeze({
  CUSTOM_REP_COL: 'Calculatable',
  TYPE_EDITOR: '*** Type editor ***',
  ALL_OBJECTS: '*** All objects ***',
  FILES: '*** Files ***',
});

// ============================================================================
// Blacklisted File Extensions (security)
// ============================================================================

export const BLACKLISTED_EXTENSIONS = Object.freeze([
  'php', 'cgi', 'pl', 'fcgi', 'fpl', 'phtml', 'shtml',
  'php2', 'php3', 'php4', 'php5', 'asp', 'jsp',
]);

// ============================================================================
// SQL Reserved Words (for database name validation)
// ============================================================================

export const SQL_RESERVED_WORDS = Object.freeze([
  'ACCESSIBLE', 'ACCOUNT', 'ACTION', 'ACTIVE', 'ADD', 'ADMIN', 'AFTER', 'AGAINST',
  'AGGREGATE', 'ALGORITHM', 'ALL', 'ALTER', 'ALWAYS', 'ANALYSE', 'ANALYZE', 'AND',
  'ANY', 'ARRAY', 'ASC', 'ASCII', 'ASENSITIVE', 'ATTRIBUTE', 'AUTHENTICATION',
  'AUTOEXTEND_SIZE', 'AUTO_INCREMENT', 'AVG', 'AVG_ROW_LENGTH', 'BACKUP', 'BEFORE',
  'BEGIN', 'BETWEEN', 'BIGINT', 'BINARY', 'BINLOG', 'BIT', 'BLOB', 'BLOCK', 'BOOL',
  'BOOLEAN', 'BOTH', 'BTREE', 'BUCKETS', 'BULK', 'BYTE', 'CACHE', 'CALL', 'CASCADE',
  'CASCADED', 'CASE', 'CATALOG_NAME', 'CHAIN', 'CHANGE', 'CHANGED', 'CHANNEL', 'CHAR',
  'CHARACTER', 'CHARSET', 'CHECK', 'CHECKSUM', 'CIPHER', 'CLASS_ORIGIN', 'CLIENT',
  'CLONE', 'CLOSE', 'COALESCE', 'CODE', 'COLLATE', 'COLLATION', 'COLUMN', 'COLUMNS',
  'COLUMN_FORMAT', 'COLUMN_NAME', 'COMMENT', 'COMMIT', 'COMMITTED', 'COMPACT',
  'COMPLETION', 'COMPONENT', 'COMPRESSED', 'COMPRESSION', 'CONCURRENT', 'CONDITION',
  'CONNECTION', 'CONSISTENT', 'CONSTRAINT', 'CONSTRAINT_NAME', 'CONTAINS', 'CONTEXT',
  'CONTINUE', 'CONVERT', 'CPU', 'CREATE', 'CROSS', 'CUBE', 'CUME_DIST', 'CURRENT',
  'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_USER', 'CURSOR', 'CURSOR_NAME', 'DATA',
  'DATABASE', 'DATABASES', 'DATAFILE', 'DATE', 'DATETIME', 'DAY', 'DAY_HOUR',
  'DAY_MICROSECOND', 'DAY_MINUTE', 'DAY_SECOND', 'DEALLOCATE', 'DEC', 'DECIMAL',
  'DECLARE', 'DEFAULT', 'DEFAULT_AUTH', 'DEFINER', 'DEFINITION', 'DELAYED',
  'DELAY_KEY_WRITE', 'DELETE', 'DENSE_RANK', 'DESC', 'DESCRIBE', 'DESCRIPTION',
  'DES_KEY_FILE', 'DETERMINISTIC', 'DIAGNOSTICS', 'DIRECTORY', 'DISABLE', 'DISCARD',
  'DISK', 'DISTINCT', 'DISTINCTROW', 'DIV', 'DOUBLE', 'DROP', 'DUAL', 'DUMPFILE',
  'DUPLICATE', 'DYNAMIC', 'EACH', 'ELSE', 'ELSEIF', 'EMPTY', 'ENABLE', 'ENCLOSED',
  'ENCRYPTION', 'END', 'ENDS', 'ENFORCED', 'ENGINE', 'ENGINES', 'ENUM', 'ERROR',
  'ERRORS', 'ESCAPE', 'ESCAPED', 'EVENT', 'EVENTS', 'EVERY', 'EXCEPT', 'EXCHANGE',
  'EXCLUDE', 'EXECUTE', 'EXISTS', 'EXIT', 'EXPANSION', 'EXPIRE', 'EXPLAIN', 'EXPORT',
  'EXTENDED', 'EXTENT_SIZE', 'FACTOR', 'FALSE', 'FAST', 'FAULTS', 'FETCH', 'FIELDS',
  'FILE', 'FILE_BLOCK_SIZE', 'FILTER', 'FINISH', 'FIRST', 'FIRST_VALUE', 'FIXED',
  'FLOAT', 'FLOAT4', 'FLOAT8', 'FLUSH', 'FOLLOWING', 'FOLLOWS', 'FOR', 'FORCE',
  'FOREIGN', 'FORMAT', 'FOUND', 'FROM', 'FULL', 'FULLTEXT', 'FUNCTION', 'GENERAL',
  'GENERATE', 'GENERATED', 'GEOMCOLLECTION', 'GEOMETRY', 'GET', 'GET_FORMAT', 'GLOBAL',
  'GRANT', 'GRANTS', 'GROUP', 'GROUPING', 'GROUPS', 'GTID_ONLY', 'HANDLER', 'HASH',
  'HAVING', 'HELP', 'HIGH_PRIORITY', 'HISTOGRAM', 'HISTORY', 'HOST', 'HOSTS', 'HOUR',
  'HOUR_MINUTE', 'HOUR_SECOND', 'IDENTIFIED', 'IGNORE', 'IMPORT', 'INACTIVE', 'INDEX',
  'INDEXES', 'INFILE', 'INITIAL', 'INITIAL_SIZE', 'INITIATE', 'INNER', 'INOUT',
  'INSENSITIVE', 'INSERT', 'INSERT_METHOD', 'INSTALL', 'INSTANCE', 'INT', 'INT1',
  'INT2', 'INT3', 'INT4', 'INT8', 'INTEGER', 'INTERSECT', 'INTERVAL', 'INTO',
  'INVISIBLE', 'INVOKER', 'IO_AFTER_GTIDS', 'IO_BEFORE_GTIDS', 'IO_THREAD', 'IPC',
  'ISOLATION', 'ISSUER', 'ITERATE', 'JOIN', 'JSON', 'JSON_TABLE', 'JSON_VALUE', 'KEY',
  'KEYRING', 'KEYS', 'KEY_BLOCK_SIZE', 'KILL', 'LAG', 'LANGUAGE', 'LAST', 'LAST_VALUE',
  'LATERAL', 'LEAD', 'LEADING', 'LEAVE', 'LEAVES', 'LEFT', 'LESS', 'LEVEL', 'LIKE',
  'LIMIT', 'LINEAR', 'LINES', 'LINESTRING', 'LIST', 'LOAD', 'LOCAL', 'LOCALTIME',
  'LOCALTIMESTAMP', 'LOCK', 'LOCKED', 'LOCKS', 'LOGFILE', 'LOGS', 'LONG', 'LONGBLOB',
  'LONGTEXT', 'LOOP', 'LOW_PRIORITY', 'MASTER', 'MASTER_BIND', 'MASTER_DELAY',
  'MASTER_HOST', 'MASTER_LOG_FILE', 'MASTER_LOG_POS', 'MASTER_PASSWORD', 'MASTER_PORT',
  'MASTER_SSL', 'MASTER_SSL_CA', 'MASTER_SSL_CERT', 'MASTER_SSL_CRL', 'MASTER_SSL_KEY',
  'MASTER_USER', 'MATCH', 'MAXVALUE', 'MAX_ROWS', 'MAX_SIZE', 'MEDIUM', 'MEDIUMBLOB',
  'MEDIUMINT', 'MEDIUMTEXT', 'MEMBER', 'MEMORY', 'MERGE', 'MESSAGE_TEXT', 'MICROSECOND',
  'MIDDLEINT', 'MIGRATE', 'MINUTE', 'MINUTE_SECOND', 'MIN_ROWS', 'MOD', 'MODE',
  'MODIFIES', 'MODIFY', 'MONTH', 'MULTILINESTRING', 'MULTIPOINT', 'MULTIPOLYGON',
  'MUTEX', 'MYSQL_ERRNO', 'NAME', 'NAMES', 'NATIONAL', 'NATURAL', 'NCHAR', 'NDB',
  'NDBCLUSTER', 'NESTED', 'NEVER', 'NEW', 'NEXT', 'NODEGROUP', 'NONE', 'NOT', 'NOWAIT',
  'NO_WAIT', 'NTH_VALUE', 'NTILE', 'NULL', 'NULLS', 'NUMBER', 'NUMERIC', 'NVARCHAR',
  'OFF', 'OFFSET', 'OLD', 'ONE', 'ONLY', 'OPEN', 'OPTIMIZE', 'OPTIMIZER_COSTS',
  'OPTION', 'OPTIONAL', 'OPTIONALLY', 'OPTIONS', 'ORDER', 'ORDINALITY', 'ORGANIZATION',
  'OTHERS', 'OUT', 'OUTER', 'OUTFILE', 'OVER', 'OWNER', 'PACK_KEYS', 'PAGE', 'PARSER',
  'PARTIAL', 'PARTITION', 'PARTITIONING', 'PARTITIONS', 'PASSWORD', 'PATH',
  'PERCENT_RANK', 'PERSIST', 'PERSIST_ONLY', 'PHASE', 'PLUGIN', 'PLUGINS', 'PLUGIN_DIR',
  'POINT', 'POLYGON', 'PORT', 'PRECEDES', 'PRECEDING', 'PRECISION', 'PREPARE',
  'PRESERVE', 'PREV', 'PRIMARY', 'PRIVILEGES', 'PROCEDURE', 'PROCESS', 'PROCESSLIST',
  'PROFILE', 'PROFILES', 'PROXY', 'PURGE', 'QUARTER', 'QUERY', 'QUICK', 'RANDOM',
  'RANGE', 'RANK', 'READ', 'READS', 'READ_ONLY', 'READ_WRITE', 'REAL', 'REBUILD',
  'RECOVER', 'RECURSIVE', 'REDOFILE', 'REDUNDANT', 'REFERENCE', 'REFERENCES', 'REGEXP',
  'REGISTRATION', 'RELAY', 'RELAYLOG', 'RELAY_LOG_FILE', 'RELAY_LOG_POS', 'RELAY_THREAD',
  'RELEASE', 'RELOAD', 'REMOTE', 'REMOVE', 'RENAME', 'REORGANIZE', 'REPAIR', 'REPEAT',
  'REPEATABLE', 'REPLACE', 'REPLICA', 'REPLICAS', 'REPLICATE_DO_DB', 'REPLICATION',
  'REQUIRE', 'RESET', 'RESIGNAL', 'RESOURCE', 'RESPECT', 'RESTART', 'RESTORE',
  'RESTRICT', 'RESUME', 'RETAIN', 'RETURN', 'RETURNING', 'RETURNS', 'REUSE', 'REVERSE',
  'REVOKE', 'RIGHT', 'RLIKE', 'ROLE', 'ROLLBACK', 'ROLLUP', 'ROTATE', 'ROUTINE', 'ROW',
  'ROWS', 'ROW_COUNT', 'ROW_FORMAT', 'ROW_NUMBER', 'RTREE', 'SAVEPOINT', 'SCHEDULE',
  'SCHEMA', 'SCHEMAS', 'SCHEMA_NAME', 'SECOND', 'SECONDARY', 'SECONDARY_LOAD',
  'SECURITY', 'SELECT', 'SENSITIVE', 'SEPARATOR', 'SERIAL', 'SERIALIZABLE', 'SERVER',
  'SESSION', 'SET', 'SHARE', 'SHOW', 'SHUTDOWN', 'SIGNAL', 'SIGNED', 'SIMPLE', 'SKIP',
  'SLAVE', 'SLOW', 'SMALLINT', 'SNAPSHOT', 'SOCKET', 'SOME', 'SONAME', 'SOUNDS',
  'SOURCE', 'SOURCE_BIND', 'SOURCE_DELAY', 'SOURCE_HOST', 'SOURCE_LOG_FILE',
  'SOURCE_LOG_POS', 'SOURCE_PASSWORD', 'SOURCE_PORT', 'SOURCE_SSL', 'SOURCE_SSL_CA',
  'SOURCE_SSL_CERT', 'SOURCE_SSL_CRL', 'SOURCE_SSL_KEY', 'SOURCE_USER', 'SPATIAL',
  'SPECIFIC', 'SQL', 'SQLEXCEPTION', 'SQLSTATE', 'SQLWARNING', 'SQL_AFTER_GTIDS',
  'SQL_BIG_RESULT', 'SQL_CACHE', 'SQL_NO_CACHE', 'SQL_THREAD', 'SQL_TSI_DAY',
  'SQL_TSI_HOUR', 'SQL_TSI_MINUTE', 'SQL_TSI_MONTH', 'SQL_TSI_QUARTER', 'SQL_TSI_SECOND',
  'SQL_TSI_WEEK', 'SQL_TSI_YEAR', 'SRID', 'SSL', 'STACKED', 'START', 'STARTING',
  'STARTS', 'STATUS', 'STOP', 'STORAGE', 'STORED', 'STRAIGHT_JOIN', 'STREAM', 'STRING',
  'SUBCLASS_ORIGIN', 'SUBJECT', 'SUBPARTITION', 'SUBPARTITIONS', 'SUPER', 'SUSPEND',
  'SWAPS', 'SWITCHES', 'SYSTEM', 'TABLE', 'TABLES', 'TABLESPACE', 'TABLE_CHECKSUM',
  'TABLE_NAME', 'TEMPORARY', 'TEMPTABLE', 'TERMINATED', 'TEXT', 'THAN', 'THEN',
  'THREAD_PRIORITY', 'TIES', 'TIME', 'TIMESTAMP', 'TIMESTAMPADD', 'TIMESTAMPDIFF',
  'TINYBLOB', 'TINYINT', 'TINYTEXT', 'TLS', 'TRAILING', 'TRANSACTION', 'TRIGGER',
  'TRIGGERS', 'TRUE', 'TRUNCATE', 'TYPE', 'TYPES', 'UNBOUNDED', 'UNCOMMITTED',
  'UNDEFINED', 'UNDO', 'UNDOFILE', 'UNICODE', 'UNINSTALL', 'UNION', 'UNIQUE', 'UNKNOWN',
  'UNLOCK', 'UNREGISTER', 'UNSIGNED', 'UNTIL', 'UPDATE', 'UPGRADE', 'URL', 'USAGE',
  'USE', 'USER', 'USER_RESOURCES', 'USE_FRM', 'USING', 'UTC_DATE', 'UTC_TIME',
  'UTC_TIMESTAMP', 'VALIDATION', 'VALUE', 'VALUES', 'VARBINARY', 'VARCHAR',
  'VARCHARACTER', 'VARIABLES', 'VARYING', 'VCPU', 'VIEW', 'VIRTUAL', 'VISIBLE', 'WAIT',
  'WARNINGS', 'WEEK', 'WEIGHT_STRING', 'WHEN', 'WHERE', 'WHILE', 'WINDOW', 'WITH',
  'WITHOUT', 'WORK', 'WRAPPER', 'WRITE', 'X509', 'XID', 'XML', 'XOR', 'YEAR',
  'YEAR_MONTH', 'ZEROFILL', 'ZONE',
]);

// Create a Set for O(1) lookup
export const SQL_RESERVED_WORDS_SET = new Set(SQL_RESERVED_WORDS);

// ============================================================================
// Export all constants as a single object for convenience
// ============================================================================

export default {
  // Data types
  USER,
  DATABASE,
  PHONE,
  XSRF,
  EMAIL,
  ROLE,
  ACTIVITY,
  PASSWORD,
  TOKEN,
  SECRET,
  VERSION,

  // Report constants
  REPORT,
  LEVEL,
  MASK,
  EXPORT,
  DELETE,
  ROLE_OBJECT,
  CONNECT,
  SETTINGS,
  SETTINGS_TYPE,
  SETTINGS_VAL,
  REP_COLS,
  REP_JOIN,
  REP_HREFS,
  REP_URL,
  REP_LIMIT,
  REP_IFNULL,
  REP_WHERE,
  REP_ALIAS,
  REP_JOIN_ON,
  REP_COL_FORMAT,
  REP_COL_ALIAS,
  REP_COL_FUNC,
  REP_COL_TOTAL,
  REP_COL_NAME,
  REP_COL_FORMULA,
  REP_COL_FROM,
  REP_COL_TO,
  REP_COL_HAV_FR,
  REP_COL_HAV_TO,
  REP_COL_HIDE,
  REP_COL_SORT,
  REP_COL_SET,

  // Validation patterns
  DB_MASK,
  USER_DB_MASK,
  DIR_MASK,
  FILE_MASK,
  MAIL_MASK,

  // Configuration
  VAL_LIM,
  DEFAULT_LIMIT,
  DDLIST_ITEMS,
  COOKIES_EXPIRE,
  PASSWORD_STARS,

  // Masks
  NOT_NULL_MASK,
  MULTI_MASK,
  ALIAS_MASK,
  ALIAS_DEF,

  // Data types mapping
  BASIC_TYPES,
  BASIC_TYPE_IDS,

  // Grants
  GRANTS,

  // Special labels
  SPECIAL_LABELS,

  // Security
  BLACKLISTED_EXTENSIONS,
  SQL_RESERVED_WORDS,
  SQL_RESERVED_WORDS_SET,
};
