// Minimal Integram Backend Server for integram-standalone
// This server provides real database authentication compatible with PHP backend
import './config/env.js';

import express from 'express';
import cors from 'cors';
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// Database Configuration
// ============================================================================

// Database connection configuration from environment
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'integram',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
};

// Type constants (matching PHP index.php)
const TYPE = {
  USER: 18,
  PASSWORD: 20,
  TOKEN: 125,
  XSRF: 40,
  ACTIVITY: 124,
  EMAIL: 41,
  ROLE: 42,
  SECRET: 130,
};

// Auth configuration
const AUTH_SALT = process.env.AUTH_SALT || 'DronedocSalt2025';
const COOKIES_EXPIRE = parseInt(process.env.AUTH_COOKIE_EXPIRE || '2592000', 10);

// Database pool (lazy initialized)
let dbPool = null;
let mysql2 = null;
let dbConnected = false;

/**
 * Initialize database connection pool
 */
async function initDatabase() {
  if (dbPool) return dbPool;

  try {
    mysql2 = await import('mysql2/promise');
    dbPool = mysql2.default.createPool(DB_CONFIG);

    // Test connection
    const connection = await dbPool.getConnection();
    console.log('✅ Database connected:', DB_CONFIG.host);
    connection.release();
    dbConnected = true;

    return dbPool;
  } catch (error) {
    console.warn('⚠️  Database not available:', error.message);
    console.warn('⚠️  Running in mock mode (no real authentication)');
    dbPool = null;
    dbConnected = false;
    return null;
  }
}

// ============================================================================
// Authentication Helper Functions
// ============================================================================

/**
 * Salt a password according to PHP Salt() function
 * PHP: function Salt($u, $val) { return SALT."$u$z$val"; }
 */
function saltPassword(username, database, password) {
  const u = username.toUpperCase();
  return `${AUTH_SALT}${u}${database}${password}`;
}

/**
 * Hash password according to PHP password format
 * PHP: $pwd = sha1(Salt($u, $p))
 */
function hashPassword(username, database, password) {
  const salted = saltPassword(username, database, password);
  return crypto.createHash('sha1').update(salted).digest('hex');
}

/**
 * Generate a new token (matches PHP: md5(microtime(TRUE)))
 */
function generateToken() {
  const microtime = Date.now() / 1000 + Math.random();
  return crypto.createHash('md5').update(microtime.toString()).digest('hex');
}

/**
 * Generate XSRF token
 * PHP: function xsrf($a, $b) { return substr(sha1(Salt($a, $b)), 0, 22); }
 */
function generateXsrf(token, username) {
  const salted = saltPassword(token, '', username);
  const hash = crypto.createHash('sha1').update(salted).digest('hex');
  return hash.substring(0, 22);
}

/**
 * Query the database
 */
async function query(sql, params = []) {
  if (!dbPool) {
    throw new Error('Database not connected');
  }
  const [rows] = await dbPool.query(sql, params);
  return rows;
}

/**
 * Execute an INSERT/UPDATE/DELETE
 */
async function execute(sql, params = []) {
  if (!dbPool) {
    throw new Error('Database not connected');
  }
  const [result] = await dbPool.execute(sql, params);
  return result;
}

// ============================================================================
// Middleware
// ============================================================================

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Authorization', 'x-authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// Health Check Endpoints
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'integram-standalone-backend',
    version: '1.0.0',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'integram-standalone-backend',
    version: '1.0.0',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// Root API Documentation
// ============================================================================

app.get('/', (req, res) => {
  res.json({
    name: 'Integram Standalone Backend',
    version: '1.0.0',
    status: 'running',
    database: dbConnected ? 'connected' : 'disconnected (mock mode)',
    description: 'Backend server for Integram standalone deployment with real DB authentication',
    endpoints: {
      health: '/health',
      api: {
        health: 'GET /api/health',
        info: 'GET /api/info',
        chat: 'POST /api/chat/send',
        integram: {
          auth: 'POST /api/:db/auth',
          jwt: 'POST /api/:db/jwt',
          confirm: 'POST /api/:db/confirm',
          getcode: 'POST /api/:db/getcode',
          checkcode: 'POST /api/:db/checkcode'
        }
      },
      websocket: '/ws'
    }
  });
});

// ============================================================================
// API Info Endpoint
// ============================================================================

app.get('/api/info', (req, res) => {
  res.json({
    name: 'Integram Standalone Backend',
    version: '1.0.0',
    node: process.version,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// Chat Routes (Basic Implementation)
// ============================================================================

// Simple chat endpoint
app.post('/api/chat/send', (req, res) => {
  const { message, userId, chatId } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'Message is required'
    });
  }

  res.json({
    success: true,
    data: {
      id: Date.now().toString(36),
      message,
      userId: userId || 'anonymous',
      chatId: chatId || 'default',
      timestamp: new Date().toISOString()
    }
  });
});

// Get chat history (mock)
app.get('/api/chat/history/:chatId', (req, res) => {
  res.json({
    success: true,
    data: {
      chatId: req.params.chatId,
      messages: [],
      total: 0
    }
  });
});

// ============================================================================
// Integram Legacy API Routes (PHP-compatible)
// These routes provide REAL database authentication matching PHP backend
// ============================================================================

/**
 * Authentication endpoint (POST /:db/auth)
 * Maps to PHP: case "pwd" in index.php
 *
 * Supports:
 * - login/pwd format (PHP legacy)
 * - user/pwd format
 * - email/password format
 */
app.post('/api/:db/auth', async (req, res) => {
  const { db } = req.params;
  const username = req.body.login || req.body.user || req.body.email || req.body.u;
  const password = req.body.pwd || req.body.password || req.body.p;

  // Validate input
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
      code: 'MISSING_CREDENTIALS'
    });
  }

  // If database is not connected, return mock response
  if (!dbConnected) {
    console.warn(`⚠️  [AUTH] Mock mode - no database connection`);
    return res.json({
      success: true,
      message: 'Mock authentication (database not connected)',
      db,
      user: username,
      token: 'mock-token-' + generateToken(),
      xsrf: 'mock-xsrf-' + generateXsrf(Date.now().toString(), username),
      mock: true
    });
  }

  try {
    // Hash the password the same way PHP does
    const passwordHash = hashPassword(username, db, password);

    // Query to find user with matching password
    // PHP: SELECT u.id uid, u.val, pwd.id pwd_id, pwd.val pwd, tok.id tok, tok.val token, act.id act, xsrf.id xsrf
    //      FROM $z pwd, $z u
    //      LEFT JOIN $z act ON act.up=u.id AND act.t=ACTIVITY
    //      LEFT JOIN $z tok ON tok.up=u.id AND tok.t=TOKEN
    //      LEFT JOIN $z xsrf ON xsrf.up=u.id AND xsrf.t=XSRF
    //      WHERE u.t=USER AND u.val=? AND pwd.up=u.id AND pwd.val=?
    const sql = `
      SELECT
        u.id AS uid,
        u.val AS username,
        pwd.id AS pwd_id,
        tok.id AS tok_id,
        tok.val AS token,
        xsrf.id AS xsrf_id,
        xsrf.val AS xsrf,
        act.id AS act_id,
        role.t AS role_id,
        role_def.val AS role_name
      FROM ?? u
      JOIN ?? pwd ON pwd.up = u.id AND pwd.t = ?
      LEFT JOIN ?? tok ON tok.up = u.id AND tok.t = ?
      LEFT JOIN ?? xsrf ON xsrf.up = u.id AND xsrf.t = ?
      LEFT JOIN ?? act ON act.up = u.id AND act.t = ?
      LEFT JOIN ?? role ON role.up = u.id AND role.t IN (SELECT id FROM ?? WHERE t = ?)
      LEFT JOIN ?? role_def ON role_def.id = role.t AND role_def.t = ?
      WHERE u.t = ? AND u.val = ? AND pwd.val = ?
      LIMIT 1
    `;

    const rows = await query(sql, [
      db, // table u
      db, // table pwd
      TYPE.PASSWORD, // pwd.t
      db, // table tok
      TYPE.TOKEN, // tok.t
      db, // table xsrf
      TYPE.XSRF, // xsrf.t
      db, // table act
      TYPE.ACTIVITY, // act.t
      db, // table role
      db, // subquery table
      TYPE.ROLE, // role type filter
      db, // table role_def
      TYPE.ROLE, // role_def.t
      TYPE.USER, // u.t
      username, // u.val
      passwordHash // pwd.val
    ]);

    if (rows.length === 0) {
      console.log(`❌ [AUTH] Failed login attempt for user: ${username} in ${db}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = rows[0];

    // Generate new token
    const newToken = generateToken();
    const newXsrf = generateXsrf(newToken, username);
    const timestamp = Math.floor(Date.now() / 1000);

    // Update or create token
    if (user.tok_id) {
      await execute(`UPDATE ?? SET val = ? WHERE id = ?`, [db, newToken, user.tok_id]);
    } else {
      // Get next order number
      const maxOrd = await query(`SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM ?? WHERE up = ?`, [db, user.uid]);
      const ord = maxOrd[0]?.ord || 1;
      await execute(`INSERT INTO ?? (up, ord, t, val) VALUES (?, ?, ?, ?)`, [db, user.uid, ord, TYPE.TOKEN, newToken]);
    }

    // Update or create XSRF
    if (user.xsrf_id) {
      await execute(`UPDATE ?? SET val = ? WHERE id = ?`, [db, newXsrf, user.xsrf_id]);
    } else {
      const maxOrd = await query(`SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM ?? WHERE up = ?`, [db, user.uid]);
      const ord = maxOrd[0]?.ord || 1;
      await execute(`INSERT INTO ?? (up, ord, t, val) VALUES (?, ?, ?, ?)`, [db, user.uid, ord, TYPE.XSRF, newXsrf]);
    }

    // Update or create activity timestamp
    if (user.act_id) {
      await execute(`UPDATE ?? SET val = ? WHERE id = ?`, [db, String(timestamp), user.act_id]);
    } else {
      const maxOrd = await query(`SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM ?? WHERE up = ?`, [db, user.uid]);
      const ord = maxOrd[0]?.ord || 1;
      await execute(`INSERT INTO ?? (up, ord, t, val) VALUES (?, ?, ?, ?)`, [db, user.uid, ord, TYPE.ACTIVITY, String(timestamp)]);
    }

    console.log(`✅ [AUTH] User logged in: ${username} (id: ${user.uid}) in ${db}`);

    // Return response matching PHP format
    res.json({
      success: true,
      token: newToken,
      _xsrf: newXsrf,
      id: user.uid,
      user: user.username,
      role: user.role_name || null,
      roleId: user.role_id || null
    });

  } catch (error) {
    console.error('❌ [AUTH] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Token validation endpoint (POST /:db/validate)
 * Maps to PHP: Validate_Token()
 */
app.all('/api/:db/validate', async (req, res) => {
  const { db } = req.params;
  const token = req.body.token || req.query.token || req.cookies?.[db];

  if (!token) {
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'No token provided'
    });
  }

  if (!dbConnected) {
    return res.json({
      success: true,
      valid: false,
      mock: true,
      error: 'Database not connected'
    });
  }

  try {
    const sql = `
      SELECT
        u.id AS uid,
        u.val AS username,
        xsrf.val AS xsrf,
        role.t AS role_id,
        role_def.val AS role_name
      FROM ?? tok
      JOIN ?? u ON tok.up = u.id AND u.t = ?
      LEFT JOIN ?? xsrf ON xsrf.up = u.id AND xsrf.t = ?
      LEFT JOIN ?? role ON role.up = u.id
      LEFT JOIN ?? role_def ON role_def.id = role.t AND role_def.t = ?
      WHERE tok.t = ? AND tok.val = ?
      LIMIT 1
    `;

    const rows = await query(sql, [
      db, // table tok
      db, // table u
      TYPE.USER,
      db, // table xsrf
      TYPE.XSRF,
      db, // table role
      db, // table role_def
      TYPE.ROLE,
      TYPE.TOKEN,
      token
    ]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: 'Invalid token'
      });
    }

    const user = rows[0];

    res.json({
      success: true,
      valid: true,
      id: user.uid,
      user: user.username,
      xsrf: user.xsrf,
      role: user.role_name,
      roleId: user.role_id
    });

  } catch (error) {
    console.error('❌ [VALIDATE] Error:', error.message);
    res.status(500).json({
      success: false,
      valid: false,
      error: 'Validation error'
    });
  }
});

// JWT authentication (POST /:db/jwt)
app.post('/api/:db/jwt', (req, res) => {
  const { db } = req.params;
  const { jwt, token } = req.body;

  res.json({
    success: false,
    message: 'JWT authentication endpoint',
    db,
    valid: false,
    error: 'JWT verification requires @integram/auth-service'
  });
});

// Password confirmation (POST /:db/confirm)
app.post('/api/:db/confirm', (req, res) => {
  const { db } = req.params;

  res.json({
    success: false,
    message: 'Password confirmation endpoint',
    db,
    confirmed: false,
    error: 'Password confirmation requires @integram/auth-service'
  });
});

// Get one-time code (POST /:db/getcode)
app.all('/api/:db/getcode', async (req, res) => {
  const { db } = req.params;
  const email = req.body.email || req.body.u || req.query.email || req.query.u;

  if (!email) {
    return res.json({ error: 'invalid user' });
  }

  // Validate email format
  if (!/.+@.+\..+/i.test(email)) {
    return res.json({ error: 'invalid user' });
  }

  if (!dbConnected) {
    return res.json({ msg: 'new' }); // User would need to register
  }

  try {
    // Check if user exists
    const sql = `
      SELECT u.id, tok.val AS token
      FROM ?? u
      LEFT JOIN ?? tok ON tok.up = u.id AND tok.t = ?
      WHERE u.t = ? AND u.val = ?
      LIMIT 1
    `;

    const rows = await query(sql, [db, db, TYPE.TOKEN, TYPE.USER, email.toLowerCase()]);

    if (rows.length === 0) {
      // Also check email field
      const emailSql = `
        SELECT u.id, tok.val AS token
        FROM ?? email
        JOIN ?? u ON email.up = u.id AND u.t = ?
        LEFT JOIN ?? tok ON tok.up = u.id AND tok.t = ?
        WHERE email.t = ? AND email.val = ?
        LIMIT 1
      `;
      const emailRows = await query(emailSql, [db, db, TYPE.USER, db, TYPE.TOKEN, TYPE.EMAIL, email.toLowerCase()]);

      if (emailRows.length === 0) {
        return res.json({ msg: 'new' });
      }

      // User found via email field
      // In production: would send code to email here
      return res.json({ msg: 'ok' });
    }

    // User found
    // In production: would send code to email here
    return res.json({ msg: 'ok' });

  } catch (error) {
    console.error('❌ [GETCODE] Error:', error.message);
    return res.json({ error: 'invalid user' });
  }
});

// Check one-time code (POST /:db/checkcode)
app.all('/api/:db/checkcode', async (req, res) => {
  const { db } = req.params;
  const email = req.body.email || req.body.u || req.query.email || req.query.u;
  const code = req.body.code || req.body.c || req.query.code || req.query.c;

  if (!email || !code) {
    return res.json({ error: 'invalid data' });
  }

  if (code.length !== 4) {
    return res.json({ error: 'invalid data' });
  }

  if (!dbConnected) {
    return res.json({ error: 'user not found' });
  }

  try {
    // PHP: tok.val LIKE '$c%' - token starts with code
    const sql = `
      SELECT u.id AS uid, u.val AS username, tok.id AS tok_id, xsrf.id AS xsrf_id, act.id AS act_id
      FROM ?? tok
      JOIN ?? u ON tok.up = u.id AND u.t = ?
      LEFT JOIN ?? xsrf ON xsrf.up = u.id AND xsrf.t = ?
      LEFT JOIN ?? act ON act.up = u.id AND act.t = ?
      WHERE tok.t = ? AND LOWER(tok.val) LIKE ? AND u.val = ?
      LIMIT 1
    `;

    const rows = await query(sql, [
      db, db, TYPE.USER,
      db, TYPE.XSRF,
      db, TYPE.ACTIVITY,
      TYPE.TOKEN,
      code.toLowerCase() + '%',
      email.toLowerCase()
    ]);

    if (rows.length === 0) {
      return res.json({ error: 'user not found' });
    }

    const user = rows[0];

    // Generate new token and XSRF
    const newToken = generateToken();
    const newXsrf = generateXsrf(newToken, email);
    const timestamp = Math.floor(Date.now() / 1000);

    // Update token
    await execute(`UPDATE ?? SET val = ? WHERE id = ?`, [db, newToken, user.tok_id]);

    // Update or create XSRF
    if (user.xsrf_id) {
      await execute(`UPDATE ?? SET val = ? WHERE id = ?`, [db, newXsrf, user.xsrf_id]);
    } else {
      const maxOrd = await query(`SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM ?? WHERE up = ?`, [db, user.uid]);
      await execute(`INSERT INTO ?? (up, ord, t, val) VALUES (?, ?, ?, ?)`, [db, user.uid, maxOrd[0].ord, TYPE.XSRF, newXsrf]);
    }

    // Update or create activity
    if (user.act_id) {
      await execute(`UPDATE ?? SET val = ? WHERE id = ?`, [db, String(timestamp), user.act_id]);
    } else {
      const maxOrd = await query(`SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM ?? WHERE up = ?`, [db, user.uid]);
      await execute(`INSERT INTO ?? (up, ord, t, val) VALUES (?, ?, ?, ?)`, [db, user.uid, maxOrd[0].ord, TYPE.ACTIVITY, String(timestamp)]);
    }

    console.log(`✅ [CHECKCODE] User authenticated via code: ${email} in ${db}`);

    res.json({
      token: newToken,
      _xsrf: newXsrf
    });

  } catch (error) {
    console.error('❌ [CHECKCODE] Error:', error.message);
    return res.json({ error: 'user not found' });
  }
});

// ============================================================================
// Legacy DML Action Routes (PHP-compatible _m_* and _d_* actions)
// These are placeholder stubs - full implementation in @integram/core-data-service
// ============================================================================

// Create new object (_m_new)
app.post('/api/:db/_m_new/:up', (req, res) => {
  const { db, up } = req.params;
  res.json({
    success: false,
    action: '_m_new',
    db,
    up,
    error: 'Full implementation available in @integram/core-data-service'
  });
});

// Save object (_m_save)
app.post('/api/:db/_m_save/:id', (req, res) => {
  const { db, id } = req.params;
  res.json({
    success: false,
    action: '_m_save',
    db,
    id,
    error: 'Full implementation available in @integram/core-data-service'
  });
});

// Delete object (_m_del)
app.post('/api/:db/_m_del/:id', (req, res) => {
  const { db, id } = req.params;
  res.json({
    success: false,
    action: '_m_del',
    db,
    id,
    error: 'Full implementation available in @integram/core-data-service'
  });
});

// Move object (_m_move)
app.post('/api/:db/_m_move/:id', (req, res) => {
  const { db, id } = req.params;
  res.json({
    success: false,
    action: '_m_move',
    db,
    id,
    error: 'Full implementation available in @integram/core-data-service'
  });
});

// Set object attribute (_m_set)
app.post('/api/:db/_m_set/:id', (req, res) => {
  const { db, id } = req.params;
  res.json({
    success: false,
    action: '_m_set',
    db,
    id,
    error: 'Full implementation available in @integram/core-data-service'
  });
});

// Create new type (_d_new)
app.post('/api/:db/_d_new/:parentTypeId', (req, res) => {
  const { db, parentTypeId } = req.params;
  res.json({
    success: false,
    action: '_d_new',
    db,
    parentTypeId,
    error: 'Full implementation available in @integram/core-data-service'
  });
});

// Delete type (_d_del)
app.post('/api/:db/_d_del/:typeId', (req, res) => {
  const { db, typeId } = req.params;
  res.json({
    success: false,
    action: '_d_del',
    db,
    typeId,
    error: 'Full implementation available in @integram/core-data-service'
  });
});

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.path}`,
    code: 'NOT_FOUND'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ============================================================================
// HTTP Server
// ============================================================================

const server = http.createServer(app);

// ============================================================================
// WebSocket Server
// ============================================================================

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  console.log('✅ WebSocket client connected from:', request.socket.remoteAddress);

  ws.on('message', (message) => {
    console.log('📨 Received:', message.toString());
    try {
      const data = JSON.parse(message.toString());

      // Handle ping/pong
      if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // Echo back with acknowledgement
      ws.send(JSON.stringify({
        type: 'ack',
        originalMessage: data,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON',
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Integram WebSocket',
    timestamp: new Date().toISOString()
  }));
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function startServer() {
  // Initialize database connection
  await initDatabase();

  server.listen(PORT, HOST, () => {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║       Integram Standalone Backend - With DB Authentication     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`✅ Server running on http://${HOST}:${PORT}`);
    console.log(`✅ WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
    console.log(`✅ Health check: http://${HOST}:${PORT}/health`);
    console.log(`✅ API Info: http://${HOST}:${PORT}/api/info`);
    console.log(`📦 Database: ${dbConnected ? `Connected to ${DB_CONFIG.host}` : 'Not connected (mock mode)'}`);
    console.log('\n📚 Integram API routes (PHP-compatible):');
    console.log(`   POST /api/:db/auth       - User authentication (${dbConnected ? 'REAL' : 'MOCK'})`);
    console.log(`   GET  /api/:db/validate   - Token validation`);
    console.log(`   POST /api/:db/getcode    - Request one-time code`);
    console.log(`   POST /api/:db/checkcode  - Verify one-time code`);
    console.log(`   POST /api/:db/jwt        - JWT authentication (stub)`);
    console.log(`   POST /api/:db/confirm    - Password confirmation (stub)`);
    console.log(`   POST /api/:db/_m_*       - DML actions (stubs)`);
    console.log('\n');
  });
}

startServer().catch(error => {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

const shutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);

  // Close WebSocket connections
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });

  // Close database pool
  if (dbPool) {
    try {
      await dbPool.end();
      console.log('✅ Database connections closed');
    } catch (err) {
      console.error('⚠️  Error closing database:', err.message);
    }
  }

  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
