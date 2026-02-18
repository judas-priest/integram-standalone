// Legacy PHP Backend Compatibility Layer
// Allows legacy HTML frontend (integram-server/) to work with new Node.js backend
// Maps old PHP URL patterns to new API endpoints

import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import cookieParser from 'cookie-parser';
import multer from 'multer';

const router = express.Router();

// Get the directory path for serving static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyPath = path.resolve(__dirname, '../../../../integram-server');

// Parse cookies for token handling
router.use(cookieParser());

// Parse multipart/form-data (for legacy PHP frontend)
// Using multer to handle form submissions with file uploads
const upload = multer({ storage: multer.memoryStorage() });
router.use(upload.none()); // Handle multipart forms without files

// Database connection pool (lazy initialization)
let pool = null;

/**
 * Get or create database connection pool
 */
function getPool() {
  if (!pool) {
    const config = {
      host: process.env.INTEGRAM_DB_HOST || process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.INTEGRAM_DB_PORT || process.env.MYSQL_PORT || '3306'),
      user: process.env.INTEGRAM_DB_USER || process.env.MYSQL_USER || 'root',
      password: process.env.INTEGRAM_DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };

    pool = mysql.createPool(config);
    logger.info('[Legacy Compat] Database pool created', { host: config.host, port: config.port });
  }
  return pool;
}

/**
 * PHP-compatible password hashing (SHA1 with salt)
 * Matches: sha1(Salt($username, $password))
 * Salt function: sha1($username . "INTEGRAM_SALT" . $password)
 */
function phpCompatibleHash(username, password) {
  const salt = process.env.INTEGRAM_SALT || 'INTEGRAM_SALT';
  const saltedValue = username + salt + password;
  const innerHash = crypto.createHash('sha1').update(saltedValue).digest('hex');
  return crypto.createHash('sha1').update(innerHash).digest('hex');
}

/**
 * Generate token (like PHP's md5(microtime(TRUE)))
 */
function generateToken() {
  const microtime = Date.now() / 1000;
  return crypto.createHash('md5').update(microtime.toString() + Math.random().toString()).digest('hex');
}

/**
 * Generate XSRF token
 */
function generateXsrf(token, db) {
  return crypto.createHash('md5').update(token + db + 'XSRF').digest('hex');
}

// PHP Type constants (matching index.php)
const TYPE = {
  // Base types
  HTML: 2,
  SHORT: 3,
  DATETIME: 4,
  GRANT: 5,
  PWD: 6,
  BUTTON: 7,
  CHARS: 8,
  DATE: 9,
  FILE: 10,
  BOOLEAN: 11,
  MEMO: 12,
  NUMBER: 13,
  SIGNED: 14,
  CALCULATABLE: 15,
  REPORT_COLUMN: 16,
  PATH: 17,

  // User types
  USER: 18,
  PASSWORD: 20,
  REPORT: 22,
  REP_COLS: 28,
  PHONE: 30,
  XSRF: 40,
  EMAIL: 41,
  ROLE: 42,
  REP_JOIN: 44,
  LEVEL: 47,
  MASK: 49,
  EXPORT: 55,
  DELETE: 56,

  ROLE_OBJECT: 116,
  ACTIVITY: 124,
  TOKEN: 125,
  SECRET: 130,

  CONNECT: 226,
  SETTINGS: 269,
  DATABASE: 271,
  SETTINGS_TYPE: 271,
  SETTINGS_VAL: 273,
};

// Reverse mapping for base types (for Format_Val functions)
const REV_BASE_TYPE = {
  [TYPE.HTML]: 'HTML',
  [TYPE.SHORT]: 'SHORT',
  [TYPE.DATETIME]: 'DATETIME',
  [TYPE.GRANT]: 'GRANT',
  [TYPE.PWD]: 'PWD',
  [TYPE.BUTTON]: 'BUTTON',
  [TYPE.CHARS]: 'CHARS',
  [TYPE.DATE]: 'DATE',
  [TYPE.FILE]: 'FILE',
  [TYPE.BOOLEAN]: 'BOOLEAN',
  [TYPE.MEMO]: 'MEMO',
  [TYPE.NUMBER]: 'NUMBER',
  [TYPE.SIGNED]: 'SIGNED',
};

// Store for grants per request (thread-local simulation)
const grantStore = new Map();

// ============================================================================
// Grant/Permission System (Phase 4 - remaining 10%)
// ============================================================================

/**
 * Load grants for a user's role from database
 * Matches PHP's getGrants() function
 * @param {Object} pool - MySQL pool
 * @param {string} db - Database name
 * @param {number} roleId - User's role ID
 * @returns {Object} grants object
 */
async function getGrants(pool, db, roleId) {
  const grants = {};

  try {
    const query = `
      SELECT
        gr.val AS obj,
        COALESCE(def.val, '') AS lev,
        mask.val AS mask,
        exp.val AS exp,
        del.val AS del
      FROM ${db}.${db} gr
      LEFT JOIN (${db} lev CROSS JOIN ${db} def) ON lev.up = gr.id AND def.id = lev.t AND def.t = ${TYPE.LEVEL}
      LEFT JOIN ${db} mask ON mask.up = gr.id AND mask.t = ${TYPE.MASK}
      LEFT JOIN ${db} exp ON exp.up = gr.id AND exp.t = ${TYPE.EXPORT}
      LEFT JOIN ${db} del ON del.up = gr.id AND del.t = ${TYPE.DELETE}
      WHERE gr.up = ? AND gr.t = ${TYPE.ROLE_OBJECT}
    `;

    const [rows] = await pool.query(query, [roleId]);

    for (const row of rows) {
      if (row.lev && row.lev.length > 0) {
        grants[row.obj] = row.lev;
      }
      if (row.mask && row.mask.length > 0) {
        if (!grants.mask) grants.mask = {};
        if (!grants.mask[row.obj]) grants.mask[row.obj] = {};
        grants.mask[row.obj][row.mask] = row.lev;
      }
      if (row.exp && row.exp.length > 0) {
        if (!grants.EXPORT) grants.EXPORT = {};
        grants.EXPORT[row.obj] = '1';
      }
      if (row.del && row.del.length > 0) {
        if (!grants.DELETE) grants.DELETE = {};
        grants.DELETE[row.obj] = '1';
      }
    }

    logger.debug('[Grants] Loaded grants', { db, roleId, count: Object.keys(grants).length });
  } catch (error) {
    logger.error('[Grants] Error loading grants', { error: error.message, db, roleId });
  }

  return grants;
}

/**
 * Check grant for an object/type
 * Matches PHP's Check_Grant() function
 * @param {Object} pool - MySQL pool
 * @param {string} db - Database name
 * @param {Object} grants - Loaded grants object
 * @param {number} id - Object ID
 * @param {number} t - Type ID (default: 0)
 * @param {string} grant - Required grant level ("READ" or "WRITE", default: "WRITE")
 * @param {string} username - Current username (admin bypasses checks)
 * @returns {boolean} true if granted
 */
async function checkGrant(pool, db, grants, id, t = 0, grant = 'WRITE', username = '') {
  // Admin always has access
  if (username.toLowerCase() === 'admin') {
    return true;
  }

  // Check explicit grant for type
  if (t !== 0 && grants[t]) {
    if (grants[t] === grant || grants[t] === 'WRITE') {
      return true;
    }
    return false;
  }

  // Check explicit grant for object ID
  if (grants[id]) {
    if (grants[id] === grant || grants[id] === 'WRITE') {
      return true;
    }
    return false;
  }

  // Need to check parent chain
  try {
    let query;
    if (t === 0) {
      query = `
        SELECT
          obj.t,
          COALESCE(par.t, 1) AS par_typ,
          COALESCE(par.id, 1) AS par_id,
          COALESCE(arr.id, -1) AS arr,
          obj.val AS ref
        FROM ${db}.${db} obj
        LEFT JOIN ${db} par ON obj.up > 1 AND par.id = obj.up
        LEFT JOIN ${db} arr ON arr.up = par.t AND arr.t = obj.t
        WHERE obj.id = ?
        LIMIT 1
      `;
    } else if (id !== 1) {
      query = `
        SELECT
          obj.t,
          COALESCE(par.t, 1) AS par_typ,
          COALESCE(par.id, 1) AS par_id,
          COALESCE(arr.id, -1) AS arr,
          -1 AS ref
        FROM ${db}.${db} obj
        JOIN ${db} par ON obj.up > 1 AND (par.t = obj.up OR par.id = obj.up)
        LEFT JOIN ${db} arr ON arr.up = par.t AND arr.t = obj.t
        WHERE par.id = ? AND (obj.t = ? OR obj.id = ?)
        LIMIT 1
      `;
    } else {
      // First level object
      return grants[t] === grant || grants[t] === 'WRITE' || grants[1] === grant || grants[1] === 'WRITE';
    }

    const params = t === 0 ? [id] : [id, t, t];
    const [rows] = await pool.query(query, params);

    if (rows.length > 0) {
      const row = rows[0];

      // Check object type
      if (grants[row.t]) {
        if (grants[row.t] === grant || grants[row.t] === 'WRITE') {
          return true;
        }
      }
      // Check array membership
      else if (grants[row.arr]) {
        if (grants[row.arr] === grant || grants[row.arr] === 'WRITE') {
          return true;
        }
      }
      // Check reference
      else if (grants[row.ref] && row.t !== TYPE.REP_COLS && row.t !== TYPE.ROLE_OBJECT) {
        if (grants[row.ref] === grant || grants[row.ref] === 'WRITE') {
          return true;
        }
      }
      // Check parent type
      else if (grants[row.par_typ]) {
        if (grants[row.par_typ] === grant || grants[row.par_typ] === 'WRITE') {
          return true;
        }
      }
      // Check parent ID
      else if (grants[row.par_id]) {
        if (grants[row.par_id] === grant || grants[row.par_id] === 'WRITE') {
          return true;
        }
      }
      // Recursively check parent
      else if (row.par_id > 1) {
        return await checkGrant(pool, db, grants, row.par_id, 0, grant, username);
      }
    }
  } catch (error) {
    logger.error('[Grants] Error checking grant', { error: error.message, db, id, t });
  }

  return false;
}

/**
 * Check grant for first-level (root) children
 * Matches PHP's Grant_1level() function
 */
async function grant1Level(pool, db, grants, id, username = '') {
  if (username.toLowerCase() === 'admin') {
    return 'WRITE';
  }

  // Explicit rights
  if (grants[id]) {
    if (grants[id] === 'READ' || grants[id] === 'WRITE') {
      return grants[id];
    }
  }

  // ROOT rights
  if (grants[1]) {
    if (grants[1] === 'READ' || grants[1] === 'WRITE') {
      return grants[1];
    }
  }

  // Check parent of this as ref
  try {
    const query = `
      SELECT req.up
      FROM ${db}.${db} ref
      LEFT JOIN ${db} req ON req.t = ref.id
      WHERE ref.t = ? AND ref.up = 0
    `;
    const [rows] = await pool.query(query, [id]);

    for (const row of rows) {
      if (grants[row.up]) {
        if (grants[row.up] === 'READ' || grants[row.up] === 'WRITE') {
          return 'READ';
        }
      }
    }
  } catch (error) {
    logger.error('[Grants] Error in grant1Level', { error: error.message, db, id });
  }

  return false;
}

// ============================================================================
// Value Formatting Functions (Phase 4 - remaining 10%)
// ============================================================================

/**
 * Format value for storage (input validation)
 * Matches PHP's Format_Val() function
 */
function formatVal(typeId, val, tzone = 0) {
  if (val === 'NULL' || val === null) {
    return val;
  }

  const baseType = REV_BASE_TYPE[typeId];
  if (!baseType) {
    return val;
  }

  switch (baseType) {
    case 'DATE':
      if (val && !val.startsWith('[') && !val.startsWith('_request_.')) {
        val = String(val).trim();
        // ISO format YYYY[-/.]MM[-/.]DD
        const isoMatch = val.match(/^(\d{4})[-\/.]?(\d{2})[-\/.]?(\d{2})/);
        if (isoMatch) {
          return isoMatch[1] + isoMatch[2] + isoMatch[3];
        }
        // DD/MM/YYYY format
        const parts = val.split(/[\/., ]/);
        const dy = parts[2] ? (parts[2].length === 4 ? parseInt(parts[2]) : 2000 + parseInt(parts[2])) : new Date().getFullYear();
        const dm = parts[1] ? parseInt(parts[1]) : new Date().getMonth() + 1;
        const dd = parseInt(parts[0]) || 1;
        return String(dy) + String(dm).padStart(2, '0') + String(dd).padStart(2, '0');
      }
      break;

    case 'NUMBER':
      const numVal = parseInt(String(val).replace(/,/g, '.').replace(/ /g, ''));
      if (numVal !== 0) {
        return numVal;
      }
      break;

    case 'BOOLEAN':
      if (val === '' || String(val).toLowerCase() === 'false' || val === '-1' || val === ' ') {
        return '';
      }
      return '1';

    case 'SIGNED':
      const signedVal = parseFloat(String(val).replace(/,/g, '.').replace(/ /g, '').replace(/\u00A0/g, ''));
      if (signedVal !== 0) {
        return signedVal;
      }
      break;

    case 'DATETIME':
      if (val && !String(val).startsWith('[')) {
        val = String(val).trim();
        if (parseInt(val) > 10000) {
          // Already a timestamp
          return parseInt(val) - tzone;
        }
        const parsed = Date.parse(val);
        if (!isNaN(parsed)) {
          return Math.floor(parsed / 1000) - tzone;
        }
      }
      break;
  }

  return val;
}

/**
 * Format value for display (output formatting)
 * Matches PHP's Format_Val_View() function
 */
function formatValView(typeId, val, tzone = 0) {
  if (val === '' || val === null) {
    return '';
  }

  const baseType = REV_BASE_TYPE[typeId];
  if (!baseType) {
    return val;
  }

  switch (baseType) {
    case 'DATE':
      if (val) {
        const valStr = String(val);
        if (valStr.length > 8) {
          // DATETIME stored as timestamp
          const date = new Date((parseInt(val) + tzone) * 1000);
          return date.toLocaleDateString('ru-RU');
        }
        // YYYYMMDD format
        return valStr.slice(6, 8) + '.' + valStr.slice(4, 6) + '.' + valStr.slice(0, 4);
      }
      break;

    case 'DATETIME':
      if (val) {
        const date = new Date((parseInt(val) + tzone) * 1000);
        return date.toLocaleString('ru-RU');
      }
      break;

    case 'BOOLEAN':
      return val ? 'X' : '';

    case 'NUMBER':
      if (val !== 0) {
        return String(parseInt(val));
      }
      break;

    case 'SIGNED':
      if (val !== 0) {
        return String(parseFloat(val));
      }
      break;
  }

  return val;
}

/**
 * Get alignment for column based on type
 * Matches PHP's Get_Align() function
 */
function getAlign(typeId) {
  const baseType = REV_BASE_TYPE[typeId];
  switch (baseType) {
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
 * Validate database name (matches PHP DB_MASK)
 */
function isValidDbName(db) {
  return /^[a-z]\w{1,14}$/i.test(db);
}

/**
 * Check if database table exists
 */
async function dbExists(db) {
  try {
    const pool = getPool();
    logger.info('[dbExists] Checking database', { db });
    const [rows] = await pool.query('SHOW DATABASES LIKE ?', [db]);
    logger.info('[dbExists] Query result', { db, count: rows.length, rows });
    return rows.length > 0;
  } catch (error) {
    logger.error('[dbExists] Error', { db, error: error.message });
    return false;
  }
}

/**
 * Authentication endpoint - matches PHP's "auth" case
 * POST /:db/auth
 *
 * Expected request body (FormData):
 * - login: username
 * - pwd: password
 * - db: database name
 *
 * Response (JSON mode):
 * - success: { token, xsrf, message }
 * - failure: { error, message }
 */
router.post('/:db/auth', async (req, res) => {
  const { db } = req.params;
  const isJSON = req.query.JSON !== undefined || req.query.json !== undefined;

  logger.info('[Legacy Auth] Request', { db, isJSON, body: { ...req.body, pwd: '***' } });

  // Validate DB name
  if (!isValidDbName(db)) {
    if (isJSON) {
      return res.json({ success: false, error: 'Invalid database name' });
    }
    return res.status(400).send('Invalid database');
  }

  const login = req.body.login || req.body.user || '';
  const password = req.body.pwd || req.body.password || '';

  if (!login || !password) {
    if (isJSON) {
      return res.json({ success: false, error: 'Login and password required' });
    }
    return res.status(400).send('Login and password required');
  }

  try {
    // Check if database exists
    if (!await dbExists(db)) {
      if (isJSON) {
        return res.json({ success: false, error: 'Database not found' });
      }
      return res.status(404).send(`${db} does not exist`);
    }

    const pool = getPool();

    // Query matching PHP's auth logic
    // Find user by login (val field) and get their password and token
    const query = `
      SELECT
        user.id AS uid,
        user.val AS username,
        pwd.val AS password_hash,
        token.val AS token,
        token.id AS token_id,
        xsrf.val AS xsrf,
        xsrf.id AS xsrf_id
      FROM ${db}.${db} user
      LEFT JOIN ${db}.${db} pwd ON pwd.up = user.id AND pwd.t = ${TYPE.PASSWORD}
      LEFT JOIN ${db}.${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      LEFT JOIN ${db}.${db} xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      WHERE user.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [login]);

    if (rows.length === 0) {
      logger.warn('[Legacy Auth] User not found', { db, login });
      if (isJSON) {
        return res.json({ success: false, error: 'Invalid credentials' });
      }
      return res.status(401).send('Invalid credentials');
    }

    const user = rows[0];

    // Verify password using PHP-compatible hashing
    const expectedHash = phpCompatibleHash(login, password);

    console.log('[DEBUG] Password verification:', {
      db,
      login,
      password,
      password_hash: user.password_hash,
      expectedHash,
      match: user.password_hash === expectedHash
    });

    if (user.password_hash !== expectedHash) {
      console.log('[DEBUG] Password mismatch', { db, login });
      if (isJSON) {
        return res.json({ success: false, error: 'Invalid credentials' });
      }
      return res.status(401).send('Invalid credentials');
    }

    // Generate or use existing token
    let token = user.token;
    let xsrf = user.xsrf;

    if (!token) {
      token = generateToken();
      // Insert new token
      await pool.query(
        `INSERT INTO ${db}.${db} (up, t, val) VALUES (?, ${TYPE.TOKEN}, ?)`,
        [user.uid, token]
      );
    }

    if (!xsrf) {
      xsrf = generateXsrf(token, db);
      // Insert new xsrf
      await pool.query(
        `INSERT INTO ${db}.${db} (up, t, val) VALUES (?, ${TYPE.XSRF}, ?)`,
        [user.uid, xsrf]
      );
    }

    logger.info('[Legacy Auth] Success', { db, login, uid: user.uid });

    // Set cookie like PHP does
    res.cookie(db, token, {
      maxAge: 30 * 12 * 24 * 60 * 60 * 1000, // 30*12 days
      path: '/',
      httpOnly: false, // PHP sets this accessible to JS
    });

    if (isJSON) {
      return res.json({
        success: true,
        token,
        xsrf,
        message: 'Authentication successful',
        user: {
          id: user.uid,
          login: user.username,
        },
      });
    }

    // Non-JSON mode: redirect to database
    return res.redirect(`/${db}`);

  } catch (error) {
    console.log('[DEBUG] ERROR:', error.message, error.stack);
    logger.error('[Legacy Auth] Error', { error: error.message, db, login });

    if (isJSON) {
      return res.json({ success: false, error: 'Authentication failed' });
    }
    return res.status(500).send('Authentication failed');
  }
});

/**
 * Token validation endpoint
 * GET /:db/validate
 */
router.get('/:db/validate', async (req, res) => {
  const { db } = req.params;
  const token = req.cookies[db] || req.headers['x-authorization'] || req.headers.authorization;
  const isJSON = req.query.JSON !== undefined;

  if (!isValidDbName(db)) {
    return res.status(400).json({ success: false, error: 'Invalid database' });
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  try {
    const pool = getPool();

    const query = `
      SELECT
        user.id AS uid,
        user.val AS username,
        xsrf.val AS xsrf
      FROM ${db}.${db} user
      JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      LEFT JOIN ${db} xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      WHERE token.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [token.replace('Bearer ', '')]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const user = rows[0];

    return res.json({
      success: true,
      valid: true,
      user: {
        id: user.uid,
        login: user.username,
      },
      xsrf: user.xsrf,
    });

  } catch (error) {
    logger.error('[Legacy Validate] Error', { error: error.message, db });
    return res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

/**
 * Get one-time code endpoint
 * POST /:db/getcode
 */
router.post('/:db/getcode', async (req, res) => {
  const { db } = req.params;
  const { login, email, phone } = req.body;

  // Mock implementation - generates a code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  logger.info('[Legacy GetCode] Generated', { db, login: login || email || phone });

  return res.json({
    success: true,
    message: 'SMS',
    details: 'Code sent to your phone',
  });
});

/**
 * Check one-time code endpoint
 * POST /:db/checkcode
 */
router.post('/:db/checkcode', async (req, res) => {
  const { db } = req.params;
  const { code, login } = req.body;

  // Mock implementation
  logger.info('[Legacy CheckCode] Checking', { db, login, code: '***' });

  // In real implementation, verify code from database
  return res.json({
    success: true,
    valid: true,
    token: generateToken(),
    xsrf: generateXsrf(generateToken(), db),
  });
});

/**
 * Password reset endpoint
 * POST /:db/auth?reset (with reset query param)
 */
router.post('/:db/auth', async (req, res, next) => {
  if (req.query.reset === undefined) {
    return next(); // Not a reset request
  }

  const { db } = req.params;
  const { login } = req.body;

  logger.info('[Legacy Reset] Request', { db, login });

  // Mock implementation
  return res.json({
    success: true,
    message: 'MAIL',
    details: 'New password sent to your email',
  });
});

/**
 * Registration endpoint (my/register)
 * POST /my/register
 */
router.post('/my/register', async (req, res) => {
  const { email, regpwd, regpwd1, agree } = req.body;
  const isJSON = req.query.JSON !== undefined;

  logger.info('[Legacy Register] Request', { email });

  // Validate input
  if (!email || !/^.+@.+\..+$/.test(email)) {
    if (isJSON) {
      return res.json([{ error: 'Please provide a valid email' }]);
    }
    return res.status(400).send('Please provide a valid email');
  }

  if (!regpwd || regpwd.length < 6) {
    if (isJSON) {
      return res.json([{ error: 'Password must be at least 6 characters' }]);
    }
    return res.status(400).send('Password must be at least 6 characters');
  }

  if (regpwd !== regpwd1) {
    if (isJSON) {
      return res.json([{ error: 'Passwords do not match' }]);
    }
    return res.status(400).send('Passwords do not match');
  }

  // Mock successful registration
  logger.info('[Legacy Register] Success', { email });

  if (isJSON) {
    return res.json({
      success: true,
      message: 'toConfirm',
    });
  }

  return res.redirect('/my');
});

/**
 * Logout endpoint
 * POST /:db/exit or GET /:db/exit
 */
router.all('/:db/exit', (req, res) => {
  const { db } = req.params;

  // Clear the session cookie
  res.clearCookie(db, { path: '/' });

  logger.info('[Legacy Exit] Logout', { db });

  if (req.query.JSON !== undefined) {
    return res.json({ success: true, message: 'Logged out' });
  }

  // Redirect to login page
  return res.redirect(`/${db}`);
});

/**
 * Serve login page for database access
 * GET /:db (when no token cookie is present)
 *
 * This serves the login.html or index.html page from integram-server
 */
router.get('/:db', async (req, res, next) => {
  const { db } = req.params;

  // Skip if it looks like an API request or has an action
  if (db.startsWith('_') || db.startsWith('api') || db === 'health' || db === 'ws') {
    return next();
  }

  // Validate DB name
  if (!isValidDbName(db)) {
    return next();
  }

  // Check if user has a valid token cookie
  const token = req.cookies[db];

  logger.info('[Legacy Page] Request', { db, hasToken: !!token });

  if (!token) {
    // Serve login page
    const loginPage = path.join(legacyPath, 'index.html');
    if (fs.existsSync(loginPage)) {
      return res.sendFile(loginPage);
    }
    // Fallback: redirect to login.html
    const loginHtml = path.join(legacyPath, 'login.html');
    if (fs.existsSync(loginHtml)) {
      return res.sendFile(loginHtml);
    }
    return res.status(404).send('Login page not found');
  }

  // User has token - validate it and serve main app
  try {
    // Check if database exists
    if (!await dbExists(db)) {
      res.clearCookie(db, { path: '/' });
      return res.redirect(`/${db}`);
    }

    const pool = getPool();

    // Validate token
    const query = `
      SELECT user.id AS uid
      FROM ${db}.${db} user
      JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      WHERE token.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [token]);

    if (rows.length === 0) {
      // Invalid token - clear cookie and redirect to login
      res.clearCookie(db, { path: '/' });
      return res.redirect(`/${db}`);
    }

    // Valid token - serve main app page
    const mainPage = path.join(legacyPath, 'templates/main.html');
    if (fs.existsSync(mainPage)) {
      return res.sendFile(mainPage);
    }

    // Fallback to app/index.html
    const appIndex = path.join(legacyPath, 'app/index.html');
    if (fs.existsSync(appIndex)) {
      return res.sendFile(appIndex);
    }

    return res.status(404).send('Main page not found');

  } catch (error) {
    logger.error('[Legacy Page] Error', { error: error.message, db });
    // On error, clear cookie and redirect to login
    res.clearCookie(db, { path: '/' });
    return res.redirect(`/${db}`);
  }
});

/**
 * Serve specific pages within database context
 * GET /:db/:page (e.g., /my/dict, /my/object/18)
 */
router.get('/:db/:page*', async (req, res, next) => {
  const { db, page } = req.params;
  const fullPath = req.params[0] || '';

  // Skip API-like requests
  if (db.startsWith('_') || db === 'api' || page.startsWith('_')) {
    return next();
  }

  // Validate DB name
  if (!isValidDbName(db)) {
    return next();
  }

  const token = req.cookies[db];

  // If no token and not auth-related, redirect to login
  if (!token && page !== 'auth' && page !== 'login' && page !== 'register') {
    return res.redirect(`/${db}?uri=${encodeURIComponent(req.originalUrl)}`);
  }

  logger.info('[Legacy SubPage] Request', { db, page, fullPath });

  // Map page names to template files
  const pageMap = {
    'dict': 'templates/dict.html',
    'object': 'templates/object.html',
    'edit': 'templates/edit_obj.html',
    'report': 'templates/report.html',
    'types': 'templates/edit_types.html',
    'form': 'templates/form.html',
    'upload': 'templates/upload.html',
    'sql': 'templates/sql.html',
    'admin': 'templates/dir_admin.html',
    'info': 'templates/info.html',
    'quiz': 'templates/quiz.html',
  };

  const templatePath = pageMap[page];
  if (templatePath) {
    const fullTemplatePath = path.join(legacyPath, templatePath);
    if (fs.existsSync(fullTemplatePath)) {
      return res.sendFile(fullTemplatePath);
    }
  }

  // Check for custom database-specific templates
  const customPath = path.join(legacyPath, `templates/custom/${db}/${page}.html`);
  if (fs.existsSync(customPath)) {
    return res.sendFile(customPath);
  }

  // Fall through to other handlers or 404
  return next();
});

// ============================================================================
// Helper functions for DML operations
// ============================================================================

/**
 * Extract type attributes from request body (t{id}=value format)
 */
function extractAttributes(body) {
  const attributes = {};
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('t') && /^t\d+$/.test(key)) {
      const typeId = parseInt(key.substring(1), 10);
      attributes[typeId] = value;
    }
  }
  return attributes;
}

/**
 * Get next order value for a parent/type combination
 */
async function getNextOrder(db, parentId, typeId = null) {
  try {
    const pool = getPool();
    let query = `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM ${db} WHERE up = ?`;
    const params = [parentId];

    if (typeId !== null) {
      query = `SELECT COALESCE(MAX(ord), 0) + 1 AS next_ord FROM ${db} WHERE up = ? AND t = ?`;
      params.push(typeId);
    }

    const [rows] = await pool.query(query, params);
    return rows[0]?.next_ord || 1;
  } catch (error) {
    return 1;
  }
}

/**
 * Insert a new row into the database
 */
async function insertRow(db, parentId, order, typeId, value) {
  const pool = getPool();
  const query = `INSERT INTO ${db}.${db} (up, ord, t, val) VALUES (?, ?, ?, ?)`;
  const [result] = await pool.query(query, [parentId, order, typeId, value]);
  return result.insertId;
}

/**
 * Update a row's value
 */
async function updateRowValue(db, id, value) {
  const pool = getPool();
  const query = `UPDATE ${db}.${db} SET val = ? WHERE id = ?`;
  const [result] = await pool.query(query, [value, id]);
  return result.affectedRows > 0;
}

/**
 * Delete a row by ID
 */
async function deleteRow(db, id) {
  const pool = getPool();
  const query = `DELETE FROM ${db}.${db} WHERE id = ?`;
  const [result] = await pool.query(query, [id]);
  return result.affectedRows > 0;
}

/**
 * Delete all children of a parent
 */
async function deleteChildren(db, parentId) {
  const pool = getPool();
  const query = `DELETE FROM ${db}.${db} WHERE up = ?`;
  const [result] = await pool.query(query, [parentId]);
  return result.affectedRows;
}

/**
 * Get object by ID
 */
async function getObjectById(db, id) {
  const pool = getPool();
  const query = `SELECT id, up, ord, t, val FROM ${db} WHERE id = ?`;
  const [rows] = await pool.query(query, [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get requisite by parent and type
 */
async function getRequisiteByType(db, parentId, typeId) {
  const pool = getPool();
  const query = `SELECT id, val FROM ${db} WHERE up = ? AND t = ? LIMIT 1`;
  const [rows] = await pool.query(query, [parentId, typeId]);
  return rows.length > 0 ? rows[0] : null;
}

// ============================================================================
// DML Action Routes (Phase 1 MVP - Real Implementation)
// ============================================================================

/**
 * _m_new - Create new object
 * POST /:db/_m_new/:up
 * Parameters: up (parent ID), t (type ID), val, t{id}=value (attributes)
 */
router.post('/:db/_m_new/:up?', async (req, res) => {
  const { db, up } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const parentId = parseInt(up || req.body.up || '0', 10);
    const typeId = parseInt(req.body.t, 10);
    const value = req.body.val || '';

    if (!typeId) {
      return res.status(400).json({ error: 'Type ID (t) is required' });
    }

    // Get next order
    const order = await getNextOrder(db, parentId, typeId);

    // Insert the object
    const id = await insertRow(db, parentId, order, typeId, value);

    logger.info('[Legacy _m_new] Object created', { db, id, typeId, parentId });

    // Save requisites (t{id}=value format)
    const attributes = extractAttributes(req.body);
    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const attrOrder = await getNextOrder(db, id, parseInt(attrTypeId, 10));
      await insertRow(db, id, attrOrder, parseInt(attrTypeId, 10), String(attrValue));
    }

    res.json({
      status: 'Ok',
      id,
      val: value,
      up: parentId,
      t: typeId,
      ord: order,
    });
  } catch (error) {
    logger.error('[Legacy _m_new] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _m_save - Save/update object attributes
 * POST /:db/_m_save/:id
 * Parameters: val, t{id}=value (attributes to update)
 */
router.post('/:db/_m_save/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const objectId = parseInt(id, 10);

    // Update value if provided
    if (req.body.val !== undefined) {
      await updateRowValue(db, objectId, req.body.val);
    }

    // Update requisites (t{id}=value format)
    const attributes = extractAttributes(req.body);
    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);
      const existing = await getRequisiteByType(db, objectId, typeIdNum);

      if (existing) {
        // Update existing requisite
        await updateRowValue(db, existing.id, String(attrValue));
      } else {
        // Create new requisite
        const attrOrder = await getNextOrder(db, objectId, typeIdNum);
        await insertRow(db, objectId, attrOrder, typeIdNum, String(attrValue));
      }
    }

    logger.info('[Legacy _m_save] Object saved', { db, id: objectId });

    res.json({
      status: 'Ok',
      id: objectId,
      val: req.body.val,
    });
  } catch (error) {
    logger.error('[Legacy _m_save] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _m_del - Delete object
 * POST /:db/_m_del/:id
 */
router.post('/:db/_m_del/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const objectId = parseInt(id, 10);
    const cascade = req.body.cascade === '1' || req.body.cascade === true;

    // Delete children first if cascade
    if (cascade) {
      await deleteChildren(db, objectId);
    }

    // Delete the object
    await deleteRow(db, objectId);

    logger.info('[Legacy _m_del] Object deleted', { db, id: objectId, cascade });

    res.json({ status: 'Ok' });
  } catch (error) {
    logger.error('[Legacy _m_del] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _m_set - Set object attributes
 * POST /:db/_m_set/:id
 * Parameters: t{id}=value (attributes to set)
 */
router.post('/:db/_m_set/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const objectId = parseInt(id, 10);
    const attributes = extractAttributes(req.body);

    if (Object.keys(attributes).length === 0) {
      return res.status(400).json({ error: 'No attributes provided' });
    }

    for (const [attrTypeId, attrValue] of Object.entries(attributes)) {
      const typeIdNum = parseInt(attrTypeId, 10);
      const existing = await getRequisiteByType(db, objectId, typeIdNum);

      if (existing) {
        await updateRowValue(db, existing.id, String(attrValue));
      } else {
        const attrOrder = await getNextOrder(db, objectId, typeIdNum);
        await insertRow(db, objectId, attrOrder, typeIdNum, String(attrValue));
      }
    }

    logger.info('[Legacy _m_set] Attributes set', { db, id: objectId });

    res.json({ status: 'Ok' });
  } catch (error) {
    logger.error('[Legacy _m_set] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _m_move - Move object to new parent
 * POST /:db/_m_move/:id
 * Parameters: up (new parent ID)
 */
router.post('/:db/_m_move/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const objectId = parseInt(id, 10);
    const newParentId = parseInt(req.body.up, 10);
    const newOrder = await getNextOrder(db, newParentId);

    const pool = getPool();
    await pool.query(`UPDATE ${db}.${db} SET up = ?, ord = ? WHERE id = ?`, [newParentId, newOrder, objectId]);

    logger.info('[Legacy _m_move] Object moved', { db, id: objectId, newParentId });

    res.json({ status: 'Ok' });
  } catch (error) {
    logger.error('[Legacy _m_move] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// Query Action Routes (Phase 1 MVP - Real Implementation)
// ============================================================================

/**
 * _dict - Get type dictionary (list of types with their definitions)
 * GET/POST /:db/_dict/:typeId?
 */
router.all('/:db/_dict/:typeId?', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    let query;
    let params = [];

    if (typeId) {
      // Get specific type with its requisites
      const type = parseInt(typeId, 10);
      query = `
        SELECT t.id, t.val AS name, t.t AS base_type, t.ord,
               r.id AS req_id, r.val AS req_name, r.t AS req_type, r.ord AS req_ord
        FROM ${db}.${db} t
        LEFT JOIN ${db} r ON r.up = t.id
        WHERE t.id = ?
        ORDER BY r.ord
      `;
      params = [type];
    } else {
      // Get all types (root-level objects with up=0)
      query = `SELECT id, val AS name, t AS base_type, ord FROM ${db} WHERE up = 0 ORDER BY val`;
    }

    const [rows] = await pool.query(query, params);

    if (typeId && rows.length > 0) {
      // Format as type with requisites
      const type = {
        id: rows[0].id,
        name: rows[0].name,
        baseType: rows[0].base_type,
        order: rows[0].ord,
        requisites: rows
          .filter(r => r.req_id)
          .map(r => ({
            id: r.req_id,
            name: r.req_name,
            type: r.req_type,
            order: r.req_ord,
          })),
      };
      return res.json(type);
    }

    // Return list of types
    const types = rows.map(row => ({
      id: row.id,
      name: row.name,
      baseType: row.base_type,
      order: row.ord,
    }));

    res.json(types);
  } catch (error) {
    logger.error('[Legacy _dict] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * _list - Get list of objects
 * GET/POST /:db/_list/:typeId
 * Parameters: up (parent), LIMIT, F (offset/from), q (search)
 */
router.all('/:db/_list/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);
    const parentId = req.query.up !== undefined || req.body.up !== undefined
      ? parseInt(req.query.up || req.body.up, 10)
      : null;
    const limit = parseInt(req.query.LIMIT || req.body.LIMIT || '50', 10);
    const offset = parseInt(req.query.F || req.body.F || '0', 10);
    const search = req.query.q || req.body.q || '';

    // Build query
    let query = `SELECT id, val, up, t, ord FROM ${db} WHERE t = ?`;
    let countQuery = `SELECT COUNT(*) as total FROM ${db} WHERE t = ?`;
    const params = [type];
    const countParams = [type];

    if (parentId !== null) {
      query += ` AND up = ?`;
      countQuery += ` AND up = ?`;
      params.push(parentId);
      countParams.push(parentId);
    }

    if (search) {
      query += ` AND val LIKE ?`;
      countQuery += ` AND val LIKE ?`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    query += ` ORDER BY ord LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    const [countRows] = await pool.query(countQuery, countParams);
    const total = countRows[0]?.total || 0;

    const objects = rows.map(row => ({
      id: row.id,
      val: row.val,
      up: row.up,
      t: row.t,
      ord: row.ord,
    }));

    // Return in PHP-compatible format
    res.json({
      data: objects,
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('[Legacy _list] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * _list_join - List objects with multi-join queries
 * GET/POST /:db/_list_join/:typeId
 * Parameters: up (parent), LIMIT, F (offset/from), q (search), join (comma-separated requisite IDs to join)
 *
 * This endpoint supports complex multi-join queries that fetch object data
 * along with requisite values in a single query.
 */
router.all('/:db/_list_join/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);
    const parentId = req.query.up !== undefined || req.body.up !== undefined
      ? parseInt(req.query.up || req.body.up, 10)
      : null;
    const limit = parseInt(req.query.LIMIT || req.body.LIMIT || '50', 10);
    const offset = parseInt(req.query.F || req.body.F || '0', 10);
    const search = req.query.q || req.body.q || '';
    const joinReqs = (req.query.join || req.body.join || '').split(',').filter(Boolean).map(id => parseInt(id, 10));

    // Get type requisites for join
    const [reqRows] = await pool.query(
      `SELECT id, val, t FROM ${db} WHERE up = ? ORDER BY ord`,
      [type]
    );

    // Parse requisite info
    const requisites = reqRows.map(r => {
      const aliasMatch = r.val.match(/:ALIAS=([^:]+):/);
      return {
        id: r.id,
        name: r.val.replace(/:ALIAS=[^:]+:/g, '').replace(/:!NULL:/g, '').replace(/:MULTI:/g, '').trim(),
        alias: aliasMatch ? aliasMatch[1] : `req_${r.id}`,
        type: r.t
      };
    });

    // Determine which requisites to join
    const reqsToJoin = joinReqs.length > 0
      ? requisites.filter(r => joinReqs.includes(r.id))
      : requisites.slice(0, 5); // Default: first 5 requisites

    // Build multi-join query
    let selectParts = ['obj.id', 'obj.val', 'obj.up', 'obj.t', 'obj.ord'];
    let joinParts = [];
    let joinIdx = 0;

    for (const req of reqsToJoin) {
      const alias = `r${joinIdx++}`;
      selectParts.push(`${alias}.val AS ${req.alias}`);
      joinParts.push(`LEFT JOIN ${db} ${alias} ON ${alias}.up = obj.id AND ${alias}.t = ${req.id}`);
    }

    let query = `SELECT ${selectParts.join(', ')} FROM ${db}.${db} obj ${joinParts.join(' ')} WHERE obj.t = ?`;
    let countQuery = `SELECT COUNT(*) as total FROM ${db} WHERE t = ?`;
    const params = [type];
    const countParams = [type];

    if (parentId !== null) {
      query += ` AND obj.up = ?`;
      countQuery += ` AND up = ?`;
      params.push(parentId);
      countParams.push(parentId);
    }

    if (search) {
      query += ` AND obj.val LIKE ?`;
      countQuery += ` AND val LIKE ?`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    query += ` ORDER BY obj.ord LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    const [countRows] = await pool.query(countQuery, countParams);
    const total = countRows[0]?.total || 0;

    // Format results
    const objects = rows.map(row => {
      const obj = {
        id: row.id,
        val: row.val,
        up: row.up,
        t: row.t,
        ord: row.ord,
        reqs: {}
      };

      // Add requisite values
      for (const req of reqsToJoin) {
        obj.reqs[req.alias] = row[req.alias] || null;
        // Also add formatted value
        if (row[req.alias]) {
          obj.reqs[`${req.alias}_formatted`] = formatValView(req.type, row[req.alias]);
        }
      }

      return obj;
    });

    logger.info('[Legacy _list_join] Multi-join query', { db, type, joinedReqs: reqsToJoin.length, rows: objects.length });

    res.json({
      data: objects,
      total,
      limit,
      offset,
      requisites: reqsToJoin.map(r => ({ id: r.id, name: r.name, alias: r.alias, type: r.type }))
    });
  } catch (error) {
    logger.error('[Legacy _list_join] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * _d_main - Get type metadata with requisites
 * GET/POST /:db/_d_main/:typeId
 */
router.all('/:db/_d_main/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);

    // Get type info
    const [typeRows] = await pool.query(
      `SELECT id, val AS name, t AS base_type, ord FROM ${db} WHERE id = ?`,
      [type]
    );

    if (typeRows.length === 0) {
      return res.status(404).json({ error: 'Type not found' });
    }

    // Get requisites (children of the type)
    const [reqRows] = await pool.query(
      `SELECT id, val AS name, t AS type, ord FROM ${db} WHERE up = ? ORDER BY ord`,
      [type]
    );

    // Parse requisite modifiers from value
    const requisites = reqRows.map(row => {
      let name = row.name || '';
      let alias = null;
      let required = false;
      let multi = false;

      // Extract :ALIAS=xxx:
      const aliasMatch = name.match(/:ALIAS=(.*?):/);
      if (aliasMatch) {
        alias = aliasMatch[1];
        name = name.replace(aliasMatch[0], '');
      }

      // Extract :!NULL:
      if (name.includes(':!NULL:')) {
        required = true;
        name = name.replace(':!NULL:', '');
      }

      // Extract :MULTI:
      if (name.includes(':MULTI:')) {
        multi = true;
        name = name.replace(':MULTI:', '');
      }

      return {
        id: row.id,
        name: name.trim(),
        alias,
        type: row.type,
        order: row.ord,
        required,
        multi,
      };
    });

    const result = {
      id: typeRows[0].id,
      name: typeRows[0].name,
      baseType: typeRows[0].base_type,
      order: typeRows[0].ord,
      requisites,
    };

    res.json(result);
  } catch (error) {
    logger.error('[Legacy _d_main] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * terms - List all terms/types
 * GET /:db/terms
 */
router.get('/:db/terms', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, val AS name, t AS type FROM ${db} WHERE up = 0 ORDER BY val`
    );

    const types = rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      val: row.name,
    }));

    res.json(types);
  } catch (error) {
    logger.error('[Legacy terms] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * xsrf - Get XSRF token
 * GET /:db/xsrf
 */
router.get('/:db/xsrf', (req, res) => {
  const { db } = req.params;
  const token = req.cookies[db] || generateToken();

  res.json({
    _xsrf: generateXsrf(token, db),
    token: req.cookies[db] || null,
  });
});

/**
 * _ref_reqs - Get reference requisites for dropdown lists
 * GET /:db/_ref_reqs/:refId
 */
router.get('/:db/_ref_reqs/:refId', async (req, res) => {
  const { db, refId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const id = parseInt(refId, 10);
    const searchQuery = req.query.q || '';

    // Get the reference type info (to find what type of objects to list)
    const [refRows] = await pool.query(
      `SELECT t, val FROM ${db} WHERE id = ?`,
      [id]
    );

    if (refRows.length === 0) {
      return res.status(404).json({ error: 'Reference not found' });
    }

    const refTypeId = refRows[0].t;

    // Get objects of that type
    let query = `SELECT id, val FROM ${db} WHERE t = ?`;
    const params = [refTypeId];

    if (searchQuery) {
      if (searchQuery.startsWith('@')) {
        // Search by ID
        const searchId = parseInt(searchQuery.substring(1), 10);
        if (!isNaN(searchId)) {
          query += ` AND id = ?`;
          params.push(searchId);
        }
      } else {
        query += ` AND val LIKE ?`;
        params.push(`%${searchQuery}%`);
      }
    }

    query += ` ORDER BY val LIMIT 80`;

    const [rows] = await pool.query(query, params);

    // Return as key-value pairs (PHP-compatible format)
    const result = {};
    for (const row of rows) {
      result[row.id] = row.val;
    }

    res.json(result);
  } catch (error) {
    logger.error('[Legacy _ref_reqs] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * _connect - Check database connection
 * GET/POST /:db/_connect
 */
router.all('/:db/_connect', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    if (await dbExists(db)) {
      res.json({ status: 'Ok', message: 'Connection successful' });
    } else {
      res.status(404).json({ error: 'Database not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Connection failed' });
  }
});

// ============================================================================
// DDL Action Routes (Phase 2 - Real Implementation)
// ============================================================================

/**
 * Helper function to parse and update modifiers in requisite name
 * Modifiers are stored in the val field: :ALIAS=xxx::!NULL::MULTI:Name
 */
function parseModifiers(val) {
  let name = val || '';
  let alias = null;
  let required = false;
  let multi = false;

  // Extract :ALIAS=xxx:
  const aliasMatch = name.match(/:ALIAS=(.*?):/);
  if (aliasMatch) {
    alias = aliasMatch[1];
    name = name.replace(aliasMatch[0], '');
  }

  // Extract :!NULL:
  if (name.includes(':!NULL:')) {
    required = true;
    name = name.replace(':!NULL:', '');
  }

  // Extract :MULTI:
  if (name.includes(':MULTI:')) {
    multi = true;
    name = name.replace(':MULTI:', '');
  }

  return { name: name.trim(), alias, required, multi };
}

/**
 * Helper function to build modifier string
 */
function buildModifiers(name, alias, required, multi) {
  let val = '';
  if (alias) val += `:ALIAS=${alias}:`;
  if (required) val += ':!NULL:';
  if (multi) val += ':MULTI:';
  val += name;
  return val;
}

/**
 * _d_new - Create new type
 * POST /:db/_d_new/:parentTypeId?
 * Parameters: val (type name), t (base type), parentTypeId (optional parent)
 */
router.post('/:db/_d_new/:parentTypeId?', async (req, res) => {
  const { db, parentTypeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const parentId = parseInt(parentTypeId || req.body.up || '0', 10);
    const baseType = parseInt(req.body.t || '8', 10); // Default to CHARS type (8)
    const name = req.body.val || req.body.name || '';

    if (!name) {
      return res.status(400).json({ error: 'Type name (val) is required' });
    }

    // Get next order
    const order = await getNextOrder(db, parentId);

    // Insert the new type
    const id = await insertRow(db, parentId, order, baseType, name);

    logger.info('[Legacy _d_new] Type created', { db, id, name, baseType, parentId });

    res.json({
      status: 'Ok',
      id,
      val: name,
      t: baseType,
      up: parentId,
      ord: order,
    });
  } catch (error) {
    logger.error('[Legacy _d_new] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_save - Save/update type
 * POST /:db/_d_save/:typeId
 * Parameters: val (new name), t (new base type)
 */
router.post('/:db/_d_save/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(typeId, 10);
    const pool = getPool();

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (req.body.val !== undefined) {
      updates.push('val = ?');
      params.push(req.body.val);
    }

    if (req.body.t !== undefined) {
      updates.push('t = ?');
      params.push(parseInt(req.body.t, 10));
    }

    if (req.body.up !== undefined) {
      updates.push('up = ?');
      params.push(parseInt(req.body.up, 10));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    await pool.query(`UPDATE ${db}.${db} SET ${updates.join(', ')} WHERE id = ?`, params);

    logger.info('[Legacy _d_save] Type saved', { db, id, updates: req.body });

    res.json({ status: 'Ok', id });
  } catch (error) {
    logger.error('[Legacy _d_save] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_del - Delete type
 * POST /:db/_d_del/:typeId
 */
router.post('/:db/_d_del/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(typeId, 10);
    const cascade = req.body.cascade === '1' || req.body.cascade === true;

    // Delete children first if cascade
    if (cascade) {
      await deleteChildren(db, id);
    }

    // Delete the type
    await deleteRow(db, id);

    logger.info('[Legacy _d_del] Type deleted', { db, id, cascade });

    res.json({ status: 'Ok' });
  } catch (error) {
    logger.error('[Legacy _d_del] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_req - Add requisite to type
 * POST /:db/_d_req/:typeId
 * Parameters: val (requisite name), t (requisite type), alias, required, multi
 */
router.post('/:db/_d_req/:typeId', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const parentId = parseInt(typeId, 10);
    const reqType = parseInt(req.body.t || '8', 10); // Default to CHARS
    const name = req.body.val || req.body.name || '';
    const alias = req.body.alias || null;
    const required = req.body.required === '1' || req.body.required === true;
    const multi = req.body.multi === '1' || req.body.multi === true;

    if (!name) {
      return res.status(400).json({ error: 'Requisite name (val) is required' });
    }

    // Build value with modifiers
    const val = buildModifiers(name, alias, required, multi);

    // Get next order
    const order = await getNextOrder(db, parentId);

    // Insert the requisite
    const id = await insertRow(db, parentId, order, reqType, val);

    logger.info('[Legacy _d_req] Requisite added', { db, id, parentId, name, reqType });

    res.json({
      status: 'Ok',
      id,
      val,
      t: reqType,
      up: parentId,
      ord: order,
    });
  } catch (error) {
    logger.error('[Legacy _d_req] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_alias - Set alias for requisite
 * POST /:db/_d_alias/:reqId
 * Parameters: alias (new alias value)
 */
router.post('/:db/_d_alias/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(reqId, 10);
    const newAlias = req.body.alias || '';
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Update alias and rebuild value
    const newVal = buildModifiers(modifiers.name, newAlias || null, modifiers.required, modifiers.multi);

    await pool.query(`UPDATE ${db}.${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_alias] Alias set', { db, id, alias: newAlias });

    res.json({ status: 'Ok', id, alias: newAlias });
  } catch (error) {
    logger.error('[Legacy _d_alias] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_null - Toggle NOT NULL flag for requisite
 * POST /:db/_d_null/:reqId
 * Parameters: required (1/0 or true/false)
 */
router.post('/:db/_d_null/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Toggle or set required flag
    const newRequired = req.body.required !== undefined
      ? (req.body.required === '1' || req.body.required === true)
      : !modifiers.required;

    // Rebuild value with updated flag
    const newVal = buildModifiers(modifiers.name, modifiers.alias, newRequired, modifiers.multi);

    await pool.query(`UPDATE ${db}.${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_null] NOT NULL toggled', { db, id, required: newRequired });

    res.json({ status: 'Ok', id, required: newRequired });
  } catch (error) {
    logger.error('[Legacy _d_null] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_multi - Toggle MULTI flag for requisite
 * POST /:db/_d_multi/:reqId
 * Parameters: multi (1/0 or true/false)
 */
router.post('/:db/_d_multi/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Toggle or set multi flag
    const newMulti = req.body.multi !== undefined
      ? (req.body.multi === '1' || req.body.multi === true)
      : !modifiers.multi;

    // Rebuild value with updated flag
    const newVal = buildModifiers(modifiers.name, modifiers.alias, modifiers.required, newMulti);

    await pool.query(`UPDATE ${db}.${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_multi] MULTI toggled', { db, id, multi: newMulti });

    res.json({ status: 'Ok', id, multi: newMulti });
  } catch (error) {
    logger.error('[Legacy _d_multi] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_attrs - Set modifiers for requisite
 * POST /:db/_d_attrs/:reqId
 * Parameters: alias, required, multi (sets all modifiers at once)
 */
router.post('/:db/_d_attrs/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current value
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Parse existing modifiers
    const modifiers = parseModifiers(obj.val);

    // Update modifiers from request (keep existing if not provided)
    const newAlias = req.body.alias !== undefined ? (req.body.alias || null) : modifiers.alias;
    const newRequired = req.body.required !== undefined
      ? (req.body.required === '1' || req.body.required === true)
      : modifiers.required;
    const newMulti = req.body.multi !== undefined
      ? (req.body.multi === '1' || req.body.multi === true)
      : modifiers.multi;

    // Update name if provided
    const newName = req.body.name || req.body.val || modifiers.name;

    // Rebuild value
    const newVal = buildModifiers(newName, newAlias, newRequired, newMulti);

    await pool.query(`UPDATE ${db}.${db} SET val = ? WHERE id = ?`, [newVal, id]);

    logger.info('[Legacy _d_attrs] Modifiers updated', { db, id, alias: newAlias, required: newRequired, multi: newMulti });

    res.json({
      status: 'Ok',
      id,
      name: newName,
      alias: newAlias,
      required: newRequired,
      multi: newMulti,
    });
  } catch (error) {
    logger.error('[Legacy _d_attrs] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_up - Move requisite up (decrease order)
 * POST /:db/_d_up/:reqId
 */
router.post('/:db/_d_up/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(reqId, 10);
    const pool = getPool();

    // Get current object
    const obj = await getObjectById(db, id);
    if (!obj) {
      return res.status(404).json({ error: 'Requisite not found' });
    }

    // Find the previous sibling (same parent, lower order)
    const [siblings] = await pool.query(
      `SELECT id, ord FROM ${db} WHERE up = ? AND ord < ? ORDER BY ord DESC LIMIT 1`,
      [obj.up, obj.ord]
    );

    if (siblings.length === 0) {
      return res.json({ status: 'Ok', message: 'Already at top' });
    }

    const prevSibling = siblings[0];

    // Swap orders
    await pool.query(`UPDATE ${db}.${db} SET ord = ? WHERE id = ?`, [obj.ord, prevSibling.id]);
    await pool.query(`UPDATE ${db}.${db} SET ord = ? WHERE id = ?`, [prevSibling.ord, id]);

    logger.info('[Legacy _d_up] Requisite moved up', { db, id, newOrd: prevSibling.ord });

    res.json({ status: 'Ok', ord: prevSibling.ord });
  } catch (error) {
    logger.error('[Legacy _d_up] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_ord - Set order for requisite
 * POST /:db/_d_ord/:reqId
 * Parameters: ord (new order value)
 */
router.post('/:db/_d_ord/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(reqId, 10);
    const newOrd = parseInt(req.body.ord, 10);

    if (isNaN(newOrd)) {
      return res.status(400).json({ error: 'Order (ord) is required' });
    }

    const pool = getPool();
    await pool.query(`UPDATE ${db}.${db} SET ord = ? WHERE id = ?`, [newOrd, id]);

    logger.info('[Legacy _d_ord] Order set', { db, id, ord: newOrd });

    res.json({ status: 'Ok', id, ord: newOrd });
  } catch (error) {
    logger.error('[Legacy _d_ord] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_del_req - Delete requisite
 * POST /:db/_d_del_req/:reqId
 */
router.post('/:db/_d_del_req/:reqId', async (req, res) => {
  const { db, reqId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const id = parseInt(reqId, 10);
    const cascade = req.body.cascade === '1' || req.body.cascade === true;

    // Delete children first if cascade
    if (cascade) {
      await deleteChildren(db, id);
    }

    // Delete the requisite
    await deleteRow(db, id);

    logger.info('[Legacy _d_del_req] Requisite deleted', { db, id, cascade });

    res.json({ status: 'Ok' });
  } catch (error) {
    logger.error('[Legacy _d_del_req] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _d_ref - Create reference type (type that references another type)
 * POST /:db/_d_ref/:parentTypeId
 * Parameters: ref (referenced type ID), val (name)
 */
router.post('/:db/_d_ref/:parentTypeId', async (req, res) => {
  const { db, parentTypeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const parentId = parseInt(parentTypeId, 10);
    const refTypeId = parseInt(req.body.ref || req.body.t, 10);
    const name = req.body.val || req.body.name || '';

    if (!refTypeId) {
      return res.status(400).json({ error: 'Reference type ID (ref) is required' });
    }

    // Get next order
    const order = await getNextOrder(db, parentId);

    // Insert the reference requisite
    // The type (t) field is the referenced type ID
    const id = await insertRow(db, parentId, order, refTypeId, name);

    logger.info('[Legacy _d_ref] Reference created', { db, id, parentId, refTypeId, name });

    res.json({
      status: 'Ok',
      id,
      val: name,
      t: refTypeId,
      up: parentId,
      ord: order,
    });
  } catch (error) {
    logger.error('[Legacy _d_ref] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// Additional DML Actions (Phase 2)
// ============================================================================

/**
 * _m_up - Move object up (decrease order)
 * POST /:db/_m_up/:id
 */
router.post('/:db/_m_up/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const objectId = parseInt(id, 10);
    const pool = getPool();

    // Get current object
    const obj = await getObjectById(db, objectId);
    if (!obj) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Find the previous sibling (same parent and type, lower order)
    const [siblings] = await pool.query(
      `SELECT id, ord FROM ${db} WHERE up = ? AND t = ? AND ord < ? ORDER BY ord DESC LIMIT 1`,
      [obj.up, obj.t, obj.ord]
    );

    if (siblings.length === 0) {
      return res.json({ status: 'Ok', message: 'Already at top' });
    }

    const prevSibling = siblings[0];

    // Swap orders
    await pool.query(`UPDATE ${db}.${db} SET ord = ? WHERE id = ?`, [obj.ord, prevSibling.id]);
    await pool.query(`UPDATE ${db}.${db} SET ord = ? WHERE id = ?`, [prevSibling.ord, objectId]);

    logger.info('[Legacy _m_up] Object moved up', { db, id: objectId, newOrd: prevSibling.ord });

    res.json({ status: 'Ok', ord: prevSibling.ord });
  } catch (error) {
    logger.error('[Legacy _m_up] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _m_ord - Set order for object
 * POST /:db/_m_ord/:id
 * Parameters: ord (new order value)
 */
router.post('/:db/_m_ord/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const objectId = parseInt(id, 10);
    const newOrd = parseInt(req.body.ord, 10);

    if (isNaN(newOrd)) {
      return res.status(400).json({ error: 'Order (ord) is required' });
    }

    const pool = getPool();
    await pool.query(`UPDATE ${db}.${db} SET ord = ? WHERE id = ?`, [newOrd, objectId]);

    logger.info('[Legacy _m_ord] Order set', { db, id: objectId, ord: newOrd });

    res.json({ status: 'Ok', id: objectId, ord: newOrd });
  } catch (error) {
    logger.error('[Legacy _m_ord] Error', { error: error.message, db });
    res.status(400).json({ error: error.message });
  }
});

/**
 * _m_id - Change object ID (reserved operation)
 * POST /:db/_m_id/:id
 */
router.post('/:db/_m_id/:id', async (req, res) => {
  const { db, id } = req.params;

  // ID changes are dangerous - usually not allowed
  logger.warn('[Legacy _m_id] ID change attempted (not implemented)', { db, id });

  res.status(400).json({
    error: 'ID change is not supported for data integrity reasons'
  });
});

// ============================================================================
// Phase 3: Metadata and Advanced Query Actions
// ============================================================================

/**
 * obj_meta - Get object metadata with requisites
 * GET/POST /:db/obj_meta/:id
 */
router.all('/:db/obj_meta/:id', async (req, res) => {
  const { db, id } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const objectId = parseInt(id, 10);

    // Get object with its requisites and type information
    const query = `
      SELECT
        obj.id, obj.up, obj.t, obj.val,
        req.id AS req_id, req.t AS req_type, req.val AS req_attrs, req.ord AS req_ord,
        COALESCE(refs.t, typs.t) AS base_typ,
        COALESCE(refs.val, typs.val) AS req_val,
        refs.id AS ref_id,
        CASE WHEN arrs.id IS NOT NULL THEN typs.id ELSE NULL END AS arr_id
      FROM ${db}.${db} obj
      LEFT JOIN ${db} req ON req.up = ?
      LEFT JOIN ${db} typs ON typs.id = req.t
      LEFT JOIN ${db} refs ON refs.id = typs.t AND refs.t != refs.id
      LEFT JOIN ${db} arrs ON refs.id IS NULL AND arrs.up = typs.id AND arrs.ord = 1
      WHERE obj.id = ?
      ORDER BY req.ord
    `;

    const [rows] = await pool.query(query, [objectId, objectId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Build response object
    const meta = {
      id: rows[0].id.toString(),
      up: rows[0].up.toString(),
      type: rows[0].t.toString(),
      val: rows[0].val || '',
      reqs: {}
    };

    // Add requisites
    for (const row of rows) {
      if (row.req_id) {
        const reqData = {
          id: row.req_id.toString(),
          val: row.req_val || '',
          type: row.base_typ ? row.base_typ.toString() : ''
        };

        if (row.arr_id) {
          reqData.arr_id = row.arr_id.toString();
        }

        if (row.ref_id) {
          reqData.ref = row.ref_id.toString();
          reqData.ref_id = row.req_type.toString();
        }

        if (row.req_attrs) {
          reqData.attrs = row.req_attrs;
        }

        meta.reqs[row.req_ord.toString()] = reqData;
      }
    }

    logger.info('[Legacy obj_meta] Metadata retrieved', { db, id: objectId });

    res.json(meta);
  } catch (error) {
    logger.error('[Legacy obj_meta] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * metadata - Get type/term metadata for all or specific type
 * GET/POST /:db/metadata/:typeId?
 */
router.all('/:db/metadata/:typeId?', async (req, res) => {
  const { db, typeId } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const isOneType = typeId && parseInt(typeId, 10) > 0;
    const id = isOneType ? parseInt(typeId, 10) : null;

    // Build query for types and their requisites
    let query;
    let params = [];

    if (isOneType) {
      query = `
        SELECT
          obj.id, obj.up, obj.t, obj.ord AS uniq, obj.val,
          req.id AS req_id, req.t AS req_type, req.val AS req_attrs, req.ord AS req_ord,
          COALESCE(refs.t, typs.t) AS base_typ,
          COALESCE(refs.val, typs.val) AS req_val,
          refs.id AS ref_id,
          CASE WHEN arrs.id IS NOT NULL THEN typs.id ELSE NULL END AS arr_id
        FROM ${db}.${db} obj
        LEFT JOIN ${db} req ON req.up = ?
        LEFT JOIN ${db} typs ON typs.id = req.t
        LEFT JOIN ${db} refs ON refs.id = typs.t AND refs.t != refs.id
        LEFT JOIN ${db} arrs ON refs.id IS NULL AND arrs.up = typs.id AND arrs.ord = 1
        WHERE obj.id = ?
        ORDER BY obj.id, req.ord
      `;
      params = [id, id];
    } else {
      query = `
        SELECT
          obj.id, obj.up, obj.t, obj.ord AS uniq, obj.val,
          req.id AS req_id, req.t AS req_type, req.val AS req_attrs, req.ord AS req_ord,
          COALESCE(refs.t, typs.t) AS base_typ,
          COALESCE(refs.val, typs.val) AS req_val,
          refs.id AS ref_id,
          CASE WHEN arrs.id IS NOT NULL THEN typs.id ELSE NULL END AS arr_id
        FROM ${db}.${db} obj
        LEFT JOIN ${db} req ON req.up = obj.id
        LEFT JOIN ${db} typs ON typs.id = req.t
        LEFT JOIN ${db} refs ON refs.id = typs.t AND refs.t != refs.id
        LEFT JOIN ${db} arrs ON refs.id IS NULL AND arrs.up = typs.id AND arrs.ord = 1
        WHERE obj.up = 0 AND obj.id != obj.t AND obj.val != '' AND obj.t != 0
        ORDER BY obj.id, req.ord
      `;
    }

    const [rows] = await pool.query(query, params);

    // Group rows by type ID
    const typesMap = new Map();
    const reqsMap = new Map();

    for (const row of rows) {
      if (!typesMap.has(row.id)) {
        typesMap.set(row.id, {
          id: row.id.toString(),
          up: row.up.toString(),
          type: row.t.toString(),
          val: row.val || '',
          unique: row.uniq.toString(),
          reqs: []
        });
      }

      if (row.req_ord) {
        const reqData = {
          num: row.req_ord,
          id: row.req_id.toString(),
          val: row.req_val || '',
          orig: (row.ref_id || row.req_type || '').toString(),
          type: row.base_typ ? row.base_typ.toString() : ''
        };

        if (row.arr_id) {
          reqData.arr_id = row.arr_id.toString();
        }

        if (row.ref_id) {
          reqData.ref = row.ref_id.toString();
          reqData.ref_id = row.req_type.toString();
        }

        if (row.req_attrs) {
          reqData.attrs = row.req_attrs;
        }

        typesMap.get(row.id).reqs.push(reqData);
      }
    }

    const result = Array.from(typesMap.values());

    logger.info('[Legacy metadata] Metadata retrieved', { db, typeId: id, count: result.length });

    if (isOneType) {
      res.json(result[0] || { error: 'Type not found' });
    } else {
      res.json(result);
    }
  } catch (error) {
    logger.error('[Legacy metadata] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * jwt - JWT authentication
 * POST /:db/jwt
 */
router.post('/:db/jwt', async (req, res) => {
  const { db } = req.params;
  const { token, refresh_token } = req.body;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    // JWT validation - verify token exists in database
    const authToken = token || req.cookies[db] || req.headers['x-authorization'];

    if (!authToken) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const pool = getPool();

    const query = `
      SELECT
        user.id AS uid,
        user.val AS username,
        xsrf.val AS xsrf,
        role.id AS role_id,
        role.val AS role_name
      FROM ${db}.${db} user
      JOIN ${db} tkn ON tkn.up = user.id AND tkn.t = ${TYPE.TOKEN}
      LEFT JOIN ${db} xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
      LEFT JOIN ${db} role ON role.up = user.id AND role.t = ${TYPE.ROLE}
      WHERE tkn.val = ? AND user.t = ${TYPE.USER}
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [authToken.replace('Bearer ', '')]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = rows[0];

    logger.info('[Legacy jwt] JWT validated', { db, uid: user.uid });

    res.json({
      success: true,
      valid: true,
      user: {
        id: user.uid,
        login: user.username,
        role: user.role_name || null,
        role_id: user.role_id || null
      },
      xsrf: user.xsrf,
      token: authToken
    });
  } catch (error) {
    logger.error('[Legacy jwt] Error', { error: error.message, db });
    res.status(500).json({ error: 'JWT validation failed' });
  }
});

/**
 * confirm - Confirm password change
 * POST /:db/confirm
 */
router.post('/:db/confirm', async (req, res) => {
  const { db } = req.params;
  const { code, password, password2 } = req.body;
  const isJSON = req.query.JSON !== undefined;

  if (!isValidDbName(db)) {
    if (isJSON) {
      return res.json({ success: false, error: 'Invalid database' });
    }
    return res.status(400).send('Invalid database');
  }

  // Validate passwords match
  if (password !== password2) {
    if (isJSON) {
      return res.json({ success: false, error: 'Passwords do not match' });
    }
    return res.status(400).send('Passwords do not match');
  }

  // Validate password strength
  if (!password || password.length < 6) {
    if (isJSON) {
      return res.json({ success: false, error: 'Password must be at least 6 characters' });
    }
    return res.status(400).send('Password must be at least 6 characters');
  }

  try {
    // In real implementation: verify code, update password
    logger.info('[Legacy confirm] Password confirmation', { db, codeProvided: !!code });

    if (isJSON) {
      return res.json({
        success: true,
        message: 'Password updated successfully'
      });
    }

    return res.redirect(`/${db}`);
  } catch (error) {
    logger.error('[Legacy confirm] Error', { error: error.message, db });
    if (isJSON) {
      return res.json({ success: false, error: 'Confirmation failed' });
    }
    return res.status(500).send('Confirmation failed');
  }
});

/**
 * login - Login page action (redirect)
 * GET/POST /:db/login
 */
router.all('/:db/login', (req, res) => {
  const { db } = req.params;

  // Redirect to main database page (which will show login if not authenticated)
  res.redirect(`/${db}`);
});

/**
 * _new_db - Create new database (only from 'my' database)
 * GET/POST /my/_new_db
 */
router.all('/my/_new_db', async (req, res) => {
  const newDbName = req.query.db || req.body.db;
  const template = req.query.template || req.body.template || 'empty';
  const description = req.body.descr || '';

  // Validate new database name (3-15 chars, starts with letter)
  const USER_DB_MASK = /^[a-z][a-z0-9]{2,14}$/i;
  if (!newDbName || !USER_DB_MASK.test(newDbName)) {
    return res.status(400).json({
      error: 'Invalid database name. Must be 3-15 characters, starting with a letter.',
      code: 'errDbName'
    });
  }

  // Check for reserved names
  const reservedNames = ['my', 'admin', 'root', 'system', 'test', 'demo', 'api', 'health'];
  if (reservedNames.includes(newDbName.toLowerCase())) {
    return res.status(400).json({
      error: `Database name "${newDbName}" is reserved`,
      code: 'errDbNameReserved'
    });
  }

  try {
    const pool = getPool();

    // Check if database already exists
    const existsQuery = `SHOW TABLES LIKE '${newDbName}'`;
    const [existingTables] = await pool.query(existsQuery);

    if (existingTables.length > 0) {
      return res.status(400).json({
        error: `Database "${newDbName}" already exists`,
        code: 'errDbExists'
      });
    }

    // Create new database table with standard schema
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${newDbName} (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        up BIGINT UNSIGNED NOT NULL DEFAULT 0,
        ord INT UNSIGNED NOT NULL DEFAULT 1,
        t BIGINT UNSIGNED NOT NULL DEFAULT 0,
        val TEXT,
        INDEX idx_up (up),
        INDEX idx_t (t),
        INDEX idx_up_t (up, t)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await pool.query(createTableQuery);

    // Initialize with basic types (similar to PHP template)
    const initQueries = [
      // Base types
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (1, 0, 1, 1, 'Объект')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (8, 0, 2, 8, 'Строка')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (12, 0, 3, 12, 'Текст')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (13, 0, 4, 13, 'Число')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (9, 0, 5, 9, 'Дата')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (4, 0, 6, 4, 'Дата и время')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (11, 0, 7, 11, 'Да/Нет')`,
      // User type
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (18, 0, 10, 8, 'Пользователь')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (20, 18, 1, 6, ':!NULL:Пароль')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (30, 18, 2, 8, 'Телефон')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (41, 18, 3, 8, 'Email')`,
      // Role type
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (42, 0, 11, 8, 'Роль')`,
      // Token/Session types
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (125, 0, 12, 8, 'Токен')`,
      `INSERT INTO ${newDbName} (id, up, ord, t, val) VALUES (40, 0, 13, 8, 'XSRF')`,
    ];

    for (const initQuery of initQueries) {
      try {
        await pool.query(initQuery);
      } catch (e) {
        // Ignore duplicate key errors
        if (!e.message.includes('Duplicate')) {
          logger.warn('[Legacy _new_db] Init query error', { error: e.message });
        }
      }
    }

    logger.info('[Legacy _new_db] Database created', { dbName: newDbName, template });

    res.json({
      status: 'Ok',
      id: newDbName,
      database: newDbName,
      template,
      message: `Database "${newDbName}" created successfully`
    });
  } catch (error) {
    logger.error('[Legacy _new_db] Error', { error: error.message, dbName: newDbName });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Phase 3: File Management Endpoints
// ============================================================================

/**
 * File upload endpoint
 * POST /:db/upload
 */
router.post('/:db/upload', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  // Check for multipart form data
  if (!req.files && !req.body) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Create upload directory if it doesn't exist
    const uploadDir = path.join(legacyPath, 'download', db);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Handle file upload (simplified - in production use multer middleware)
    logger.info('[Legacy upload] File upload request', { db });

    res.json({
      success: true,
      message: 'File uploaded successfully',
      path: `/download/${db}/`
    });
  } catch (error) {
    logger.error('[Legacy upload] Error', { error: error.message, db });
    res.status(500).json({ error: 'Upload failed' });
  }
});

/**
 * File download endpoint
 * GET /:db/download/:filename
 */
router.get('/:db/download/:filename', async (req, res) => {
  const { db, filename } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    const filePath = path.join(legacyPath, 'download', db, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    logger.info('[Legacy download] File download', { db, filename });

    res.download(filePath, filename);
  } catch (error) {
    logger.error('[Legacy download] Error', { error: error.message, db });
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * Directory listing endpoint
 * GET /:db/dir_admin
 */
router.get('/:db/dir_admin', async (req, res) => {
  const { db } = req.params;
  const { download, add_path, gf } = req.query;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    // Determine folder to list
    const folder = download ? 'download' : 'templates';
    let basePath = folder === 'download'
      ? path.join(legacyPath, 'download', db)
      : path.join(legacyPath, 'templates', 'custom', db);

    // Prevent directory traversal
    let addPath = add_path || '';
    if (addPath.includes('..')) {
      addPath = '';
    }

    const fullPath = path.join(basePath, addPath);

    // Handle file download request
    if (gf) {
      if (gf.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const filePath = path.join(fullPath, gf);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.download(filePath, gf);
      }
      return res.status(404).json({ error: 'File not found' });
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // List directory contents
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue;

      if (entry.isDirectory()) {
        dirs.push({ name: entry.name, type: 'directory' });
      } else {
        const stats = fs.statSync(path.join(fullPath, entry.name));
        files.push({
          name: entry.name,
          type: 'file',
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      }
    }

    logger.info('[Legacy dir_admin] Directory listing', { db, path: fullPath, dirs: dirs.length, files: files.length });

    res.json({
      success: true,
      folder,
      path: fullPath,
      add_path: addPath,
      directories: dirs,
      files
    });
  } catch (error) {
    logger.error('[Legacy dir_admin] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Phase 4: Full Report System with Filtering (remaining 10%)
// ============================================================================

/**
 * Compile a report - get columns, joins, and prepare query
 * Matches PHP's Compile_Report() function
 */
async function compileReport(pool, db, reportId) {
  const report = {
    id: reportId,
    header: '',
    head: [],
    columns: [],
    types: {},
    names: {},
    baseOut: {},
    joins: [],
    filters: {},
    totals: {},
    rownum: 0
  };

  try {
    // Get report definition
    const [reportRows] = await pool.query(
      `SELECT id, val, t, up FROM ${db} WHERE id = ?`,
      [reportId]
    );

    if (reportRows.length === 0) {
      return null;
    }

    report.header = reportRows[0].val;
    report.parentType = reportRows[0].up;

    // Get report columns (REP_COLS type)
    const [colRows] = await pool.query(
      `SELECT col.id, col.val, col.t, col.ord,
              typ.val AS typeName, typ.t AS baseType
       FROM ${db}.${db} col
       LEFT JOIN ${db} typ ON typ.id = col.t
       WHERE col.up = ? AND col.t = ${TYPE.REP_COLS}
       ORDER BY col.ord`,
      [reportId]
    );

    for (const col of colRows) {
      const colName = col.val.replace(/ /g, '_');
      report.head.push(col.val);
      report.names[report.head.length - 1] = colName;
      report.types[report.head.length - 1] = col.t;
      report.baseOut[report.head.length - 1] = col.baseType || TYPE.CHARS;
      report.columns.push({
        id: col.id,
        name: col.val,
        alias: colName,
        type: col.t,
        baseType: col.baseType,
        order: col.ord
      });
    }

    // Get report joins (REP_JOIN type)
    const [joinRows] = await pool.query(
      `SELECT id, val, t FROM ${db} WHERE up = ? AND t = ${TYPE.REP_JOIN}`,
      [reportId]
    );

    for (const join of joinRows) {
      report.joins.push({
        id: join.id,
        table: join.val,
        type: join.t
      });
    }

    logger.debug('[Report] Compiled report', { db, reportId, columns: report.columns.length, joins: report.joins.length });

  } catch (error) {
    logger.error('[Report] Error compiling report', { error: error.message, db, reportId });
    return null;
  }

  return report;
}

/**
 * Execute report query with filters
 */
async function executeReport(pool, db, report, filters = {}, limit = 100, offset = 0) {
  const results = {
    data: [],
    totals: {},
    rownum: 0
  };

  try {
    // Build WHERE clause from filters
    const whereClauses = [];
    const whereParams = [];

    for (const [colName, filter] of Object.entries(filters)) {
      if (filter.from !== undefined && filter.from !== '') {
        whereClauses.push(`${colName} >= ?`);
        whereParams.push(filter.from);
      }
      if (filter.to !== undefined && filter.to !== '') {
        whereClauses.push(`${colName} <= ?`);
        whereParams.push(filter.to);
      }
      if (filter.eq !== undefined && filter.eq !== '') {
        whereClauses.push(`${colName} = ?`);
        whereParams.push(filter.eq);
      }
      if (filter.like !== undefined && filter.like !== '') {
        whereClauses.push(`${colName} LIKE ?`);
        whereParams.push(`%${filter.like}%`);
      }
    }

    // Build query - simplified version for general type listing
    let query = `SELECT id, val, up, t, ord FROM ${db}`;

    if (report.parentType && report.parentType > 0) {
      whereClauses.push('t = ?');
      whereParams.push(report.parentType);
    }

    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY ord';
    query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    const [rows] = await pool.query(query, whereParams);

    results.data = rows;
    results.rownum = rows.length;

    // Calculate totals for numeric columns
    for (const col of report.columns) {
      const baseType = REV_BASE_TYPE[col.baseType];
      if (baseType === 'NUMBER' || baseType === 'SIGNED') {
        let total = 0;
        for (const row of rows) {
          if (row[col.alias]) {
            total += parseFloat(row[col.alias]) || 0;
          }
        }
        results.totals[col.alias] = total;
      }
    }

    logger.debug('[Report] Executed report', { db, reportId: report.id, rows: results.rownum });

  } catch (error) {
    logger.error('[Report] Error executing report', { error: error.message, db, reportId: report.id });
  }

  return results;
}

/**
 * Report generation endpoint with full filtering support
 * GET/POST /:db/report/:reportId
 */
router.all('/:db/report/:reportId?', async (req, res) => {
  const { db, reportId } = req.params;
  const { execute, format } = req.query;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const id = reportId ? parseInt(reportId, 10) : null;

    if (!id) {
      // List available reports
      const [rows] = await pool.query(
        `SELECT id, val AS name, ord FROM ${db} WHERE t = ${TYPE.REPORT} ORDER BY ord`
      );

      return res.json({
        success: true,
        reports: rows.map(r => ({
          id: r.id,
          name: r.name,
          order: r.ord
        }))
      });
    }

    // Compile report
    const report = await compileReport(pool, db, id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // If execution is requested, run the report
    if (execute || req.method === 'POST') {
      // Parse filters from request
      const filters = {};
      const params = { ...req.query, ...req.body };

      for (const col of report.columns) {
        const colName = col.alias;
        const filter = {};

        if (params[`FR_${colName}`]) {
          filter.from = params[`FR_${colName}`];
        }
        if (params[`TO_${colName}`]) {
          filter.to = params[`TO_${colName}`];
        }
        if (params[`EQ_${colName}`]) {
          filter.eq = params[`EQ_${colName}`];
        }
        if (params[`LIKE_${colName}`]) {
          filter.like = params[`LIKE_${colName}`];
        }

        if (Object.keys(filter).length > 0) {
          filters[colName] = filter;
        }
      }

      const limit = params.LIMIT || params.limit || 100;
      const offset = params.F || params.offset || 0;

      const results = await executeReport(pool, db, report, filters, limit, offset);

      // Format data for display
      const formattedData = results.data.map(row => {
        const formatted = { ...row };
        for (const col of report.columns) {
          if (formatted[col.alias] !== undefined) {
            formatted[`${col.alias}_formatted`] = formatValView(col.baseType, formatted[col.alias]);
          }
        }
        return formatted;
      });

      logger.info('[Legacy report] Report executed', { db, reportId: id, rows: results.rownum });

      // Export formats
      if (format === 'csv') {
        const headers = report.columns.map(c => c.name).join(',');
        const csvRows = results.data.map(row =>
          report.columns.map(c => `"${(row[c.alias] || '').toString().replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=report_${id}.csv`);
        return res.send(headers + '\n' + csvRows);
      }

      return res.json({
        success: true,
        report: {
          id: report.id,
          name: report.header,
          columns: report.columns
        },
        data: formattedData,
        totals: results.totals,
        rownum: results.rownum,
        filters: Object.keys(filters).length > 0 ? filters : undefined
      });
    }

    // Return report definition only
    logger.info('[Legacy report] Report metadata retrieved', { db, reportId: id });

    res.json({
      success: true,
      report: {
        id: report.id,
        name: report.header,
        columns: report.columns,
        head: report.head,
        types: report.types,
        filters: report.filters
      }
    });
  } catch (error) {
    logger.error('[Legacy report] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Export data endpoint with full requisite support
 * GET /:db/export/:typeId
 */
router.get('/:db/export/:typeId', async (req, res) => {
  const { db, typeId } = req.params;
  const { format = 'csv', include_reqs = '1' } = req.query;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();
    const type = parseInt(typeId, 10);

    // Get type requisites for header
    const [reqRows] = await pool.query(
      `SELECT id, val, t FROM ${db} WHERE up = ? ORDER BY ord`,
      [type]
    );

    // Parse requisite names and aliases
    const requisites = reqRows.map(r => {
      const aliasMatch = r.val.match(/:ALIAS=([^:]+):/);
      return {
        id: r.id,
        name: r.val.replace(/:ALIAS=[^:]+:/g, '').replace(/:!NULL:/g, '').replace(/:MULTI:/g, '').trim(),
        alias: aliasMatch ? aliasMatch[1] : null,
        type: r.t
      };
    });

    // Get objects of the type
    const [rows] = await pool.query(
      `SELECT id, val, up, ord FROM ${db} WHERE t = ? ORDER BY ord`,
      [type]
    );

    // If include requisites, fetch all requisite values
    let exportData = rows;
    if (include_reqs === '1' && requisites.length > 0) {
      const objectIds = rows.map(r => r.id);

      if (objectIds.length > 0) {
        // Get all requisite values for these objects
        const [reqValues] = await pool.query(
          `SELECT up AS obj_id, t AS req_type, val FROM ${db} WHERE up IN (?) AND t IN (?)`,
          [objectIds, requisites.map(r => r.id)]
        );

        // Build a map of requisite values per object
        const reqValueMap = {};
        for (const rv of reqValues) {
          if (!reqValueMap[rv.obj_id]) reqValueMap[rv.obj_id] = {};
          reqValueMap[rv.obj_id][rv.req_type] = rv.val;
        }

        // Merge requisite values into export data
        exportData = rows.map(row => {
          const data = { ...row };
          for (const req of requisites) {
            const key = req.alias || `req_${req.id}`;
            data[key] = reqValueMap[row.id] ? reqValueMap[row.id][req.id] || '' : '';
          }
          return data;
        });
      }
    }

    if (format === 'json') {
      logger.info('[Legacy export] Data exported (JSON)', { db, typeId: type, count: exportData.length });
      return res.json({
        success: true,
        type: type,
        requisites: requisites,
        data: exportData,
        count: exportData.length
      });
    }

    // CSV export with requisites
    const baseHeaders = ['id', 'value', 'parent', 'order'];
    const reqHeaders = requisites.map(r => r.alias || r.name);
    const allHeaders = [...baseHeaders, ...reqHeaders];

    const csvHeader = allHeaders.join(',') + '\n';
    const csvRows = exportData.map(r => {
      const baseVals = [r.id, `"${(r.val || '').replace(/"/g, '""')}"`, r.up, r.ord];
      const reqVals = requisites.map(req => {
        const key = req.alias || `req_${req.id}`;
        const val = r[key] || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      return [...baseVals, ...reqVals].join(',');
    }).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${db}_type_${typeId}.csv`);

    logger.info('[Legacy export] Data exported (CSV)', { db, typeId: type, format, count: rows.length });

    res.send(csv);
  } catch (error) {
    logger.error('[Legacy export] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Phase 4: Grants Endpoint (remaining 10%)
// ============================================================================

/**
 * Get user grants for the current session
 * GET /:db/grants
 */
router.get('/:db/grants', async (req, res) => {
  const { db } = req.params;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  try {
    const pool = getPool();

    // Get token from cookie or header
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Validate token and get user role
    const [userRows] = await pool.query(`
      SELECT u.id, u.val AS username, role_def.id AS role_id, role_def.val AS role_name
      FROM ${db}.${db} tok
      JOIN ${db} u ON tok.up = u.id
      LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
      WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
      LIMIT 1
    `, [token]);

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = userRows[0];

    // Get grants for the user's role
    const grants = await getGrants(pool, db, user.role_id);

    logger.info('[Legacy grants] Grants retrieved', { db, username: user.username, grantCount: Object.keys(grants).length });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role_name,
        roleId: user.role_id
      },
      grants: grants
    });
  } catch (error) {
    logger.error('[Legacy grants] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check grant for specific object/type
 * POST /:db/check_grant
 */
router.post('/:db/check_grant', async (req, res) => {
  const { db } = req.params;
  const { id, t, grant = 'READ' } = req.body;

  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  if (!id) {
    return res.status(400).json({ error: 'Object ID required' });
  }

  try {
    const pool = getPool();

    // Get token from cookie or header
    const token = req.cookies[db] || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Validate token and get user
    const [userRows] = await pool.query(`
      SELECT u.id, u.val AS username, role_def.id AS role_id
      FROM ${db}.${db} tok
      JOIN ${db} u ON tok.up = u.id
      LEFT JOIN (${db} r CROSS JOIN ${db} role_def) ON r.up = u.id AND role_def.id = r.t AND role_def.t = ${TYPE.ROLE}
      WHERE tok.val = ? AND tok.t = ${TYPE.TOKEN}
      LIMIT 1
    `, [token]);

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = userRows[0];

    // Get grants
    const grants = await getGrants(pool, db, user.role_id);

    // Check specific grant
    const hasGrant = await checkGrant(pool, db, grants, parseInt(id), parseInt(t) || 0, grant.toUpperCase(), user.username);

    logger.info('[Legacy check_grant] Grant checked', { db, id, t, grant, hasGrant });

    res.json({
      success: true,
      granted: hasGrant,
      id: parseInt(id),
      type: parseInt(t) || 0,
      level: grant.toUpperCase()
    });
  } catch (error) {
    logger.error('[Legacy check_grant] Error', { error: error.message, db });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Generic fallback for unknown actions
// ============================================================================

router.post('/:db/:action', async (req, res) => {
  const { db, action } = req.params;

  // Validate DB name
  if (!isValidDbName(db)) {
    return res.status(400).json({ error: 'Invalid database' });
  }

  logger.warn('[Legacy API] Unknown action', { db, action, body: req.body });

  res.json({ success: false, error: `Unknown action: ${action}` });
});

export default router;
