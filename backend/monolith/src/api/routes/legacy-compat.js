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

const router = express.Router();

// Get the directory path for serving static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyPath = path.resolve(__dirname, '../../../../integram-server');

// Parse cookies for token handling
router.use(cookieParser());

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
  USER: 18,
  PASSWORD: 20,
  PHONE: 30,
  XSRF: 40,
  EMAIL: 41,
  ROLE: 42,
  ACTIVITY: 124,
  TOKEN: 125,
  SECRET: 130,
  DATABASE: 271,
};

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
    const [rows] = await pool.query(`SELECT 1 FROM ${db} LIMIT 1`);
    return true;
  } catch (error) {
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
      FROM ${db} user
      LEFT JOIN ${db} pwd ON pwd.up = user.id AND pwd.t = ${TYPE.PASSWORD}
      LEFT JOIN ${db} token ON token.up = user.id AND token.t = ${TYPE.TOKEN}
      LEFT JOIN ${db} xsrf ON xsrf.up = user.id AND xsrf.t = ${TYPE.XSRF}
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

    if (user.password_hash !== expectedHash) {
      logger.warn('[Legacy Auth] Password mismatch', { db, login });
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
        `INSERT INTO ${db} (up, t, val) VALUES (?, ${TYPE.TOKEN}, ?)`,
        [user.uid, token]
      );
    }

    if (!xsrf) {
      xsrf = generateXsrf(token, db);
      // Insert new xsrf
      await pool.query(
        `INSERT INTO ${db} (up, t, val) VALUES (?, ${TYPE.XSRF}, ?)`,
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
      FROM ${db} user
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
      FROM ${db} user
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

/**
 * Generic API endpoint handler for legacy actions
 * Handles: _m_new, _m_save, _m_del, _m_set, _m_move, _d_*, _dict, _list, etc.
 */
router.post('/:db/:action', async (req, res) => {
  const { db, action } = req.params;
  const isJSON = req.query.JSON !== undefined || req.query.JSON_KV !== undefined || req.query.JSON_DATA !== undefined;

  // Validate DB name
  if (!isValidDbName(db)) {
    if (isJSON) {
      return res.json({ success: false, error: 'Invalid database' });
    }
    return res.status(400).send('Invalid database');
  }

  logger.info('[Legacy API] Request', { db, action, body: req.body });

  // Handle different actions based on PHP switch cases
  switch (action) {
    // DML Actions
    case '_m_new':
      return res.json({ success: true, id: Date.now(), message: 'Object created (stub)' });

    case '_m_save':
      return res.json({ success: true, message: 'Object saved (stub)' });

    case '_m_del':
      return res.json({ success: true, message: 'Object deleted (stub)' });

    case '_m_set':
      return res.json({ success: true, message: 'Value set (stub)' });

    case '_m_move':
      return res.json({ success: true, message: 'Object moved (stub)' });

    // DDL Actions
    case '_d_new':
      return res.json({ success: true, id: Date.now(), message: 'Type created (stub)' });

    case '_d_save':
    case '_patchterm':
      return res.json({ success: true, message: 'Type saved (stub)' });

    case '_d_del':
    case '_deleteterm':
      return res.json({ success: true, message: 'Type deleted (stub)' });

    case '_d_req':
    case '_attributes':
      return res.json({ success: true, message: 'Requisite added (stub)' });

    case '_d_alias':
    case '_setalias':
      return res.json({ success: true, message: 'Alias set (stub)' });

    case '_d_null':
    case '_setnull':
      return res.json({ success: true, message: 'NULL flag toggled (stub)' });

    case '_d_multi':
    case '_setmulti':
      return res.json({ success: true, message: 'MULTI flag toggled (stub)' });

    // Query Actions
    case '_dict':
      return res.json({ success: true, data: [], total: 0, message: 'Dictionary (stub)' });

    case '_list':
      return res.json({ success: true, data: [], total: 0, message: 'List (stub)' });

    case '_d_main':
      return res.json({ success: true, data: {}, message: 'Type metadata (stub)' });

    case 'terms':
      return res.json({ success: true, data: [], message: 'Terms list (stub)' });

    case 'xsrf':
      return res.json({ success: true, xsrf: generateXsrf(generateToken(), db) });

    case '_ref_reqs':
      return res.json({ success: true, data: [], message: 'Reference requisites (stub)' });

    case '_connect':
      return res.json({ success: true, message: 'Connection check OK' });

    default:
      logger.warn('[Legacy API] Unknown action', { db, action });
      return res.json({ success: false, error: `Unknown action: ${action}` });
  }
});

export default router;
