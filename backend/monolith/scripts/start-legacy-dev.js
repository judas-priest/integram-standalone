#!/usr/bin/env node
/**
 * Legacy HTML Site Development Server
 *
 * Starts a unified development server that:
 * 1. Serves legacy HTML files from integram-server/
 * 2. Handles legacy PHP-style API routes
 * 3. Provides real database authentication
 *
 * Usage:
 *   node scripts/start-legacy-dev.js
 *   npm run dev:legacy
 *   bun run dev:legacy
 *
 * Environment variables:
 *   PORT          - Server port (default: 8081)
 *   LEGACY_PORT   - Alternative port name (default: same as PORT)
 */

import '../src/config/env.js';

import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = parseInt(process.env.LEGACY_PORT || process.env.PORT || '8081', 10);
const HOST = process.env.HOST || '0.0.0.0';
const LEGACY_PATH = path.resolve(__dirname, process.env.LEGACY_PATH || '../../../integram-server');

const app = express();

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(icon, message, color = colors.reset) {
  console.log(`${color}${icon} ${message}${colors.reset}`);
}

// Check if legacy directory exists
if (!fs.existsSync(LEGACY_PATH)) {
  log('⚠️', `Legacy HTML directory not found: ${LEGACY_PATH}`, colors.yellow);
  log('📍', 'Server will run without static file serving', colors.yellow);
}

// ============================================================================
// Middleware
// ============================================================================

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Authorization']
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging in dev mode
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusColor = res.statusCode >= 400 ? colors.red : res.statusCode >= 300 ? colors.yellow : colors.green;
      console.log(`${statusColor}${res.statusCode}${colors.reset} ${req.method} ${req.url} ${colors.cyan}(${duration}ms)${colors.reset}`);
    });
    next();
  });
}

// ============================================================================
// Static file serving for legacy HTML site
// ============================================================================

if (fs.existsSync(LEGACY_PATH)) {
  // Serve static directories with no caching for dev
  const staticDirs = ['css', 'js', 'i', 'templates', 'ace', 'app', 'fonts', 'img', 'images', 'assets'];
  for (const dir of staticDirs) {
    const dirPath = path.join(LEGACY_PATH, dir);
    if (fs.existsSync(dirPath)) {
      app.use(`/${dir}`, express.static(dirPath, {
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }));
    }
  }

  // Serve root static files
  const rootFiles = ['favicon.ico', 'robots.txt', 'manifest.json'];
  for (const file of rootFiles) {
    const filePath = path.join(LEGACY_PATH, file);
    if (fs.existsSync(filePath)) {
      app.get(`/${file}`, (req, res) => res.sendFile(filePath));
    }
  }
}

// ============================================================================
// Legacy database routes (/:db, /:db/:page*)
// Serve HTML pages for database access
// ============================================================================

// Serve login page for database access (e.g., /my, /demo, /test)
app.get('/:db', (req, res, next) => {
  const { db } = req.params;

  // Skip if it looks like a static file or API request
  if (db.includes('.') || db.startsWith('_') || db === 'api' || db === 'health' || db === 'ws') {
    return next();
  }

  // Validate database name pattern (like PHP's DB_MASK)
  if (!/^[a-z]\w{1,14}$/i.test(db)) {
    return next();
  }

  // Check for token cookie - if present, serve main app
  const token = req.cookies[db];

  if (token) {
    // User has token, serve main app page
    const mainPage = path.join(LEGACY_PATH, 'templates/main.html');
    const appIndex = path.join(LEGACY_PATH, 'app/index.html');

    if (fs.existsSync(mainPage)) {
      return res.sendFile(mainPage);
    } else if (fs.existsSync(appIndex)) {
      return res.sendFile(appIndex);
    }
  }

  // No token, serve login page
  const indexPage = path.join(LEGACY_PATH, 'index.html');
  const loginPage = path.join(LEGACY_PATH, 'login.html');

  if (fs.existsSync(indexPage)) {
    return res.sendFile(indexPage);
  } else if (fs.existsSync(loginPage)) {
    return res.sendFile(loginPage);
  }

  // Fallback to 404
  return res.status(404).send(`Login page not found for database: ${db}`);
});

// ============================================================================
// Import and mount legacy compatibility routes (API endpoints)
// ============================================================================

let legacyRouter = null;
try {
  const legacyCompatModule = await import('../src/api/routes/legacy-compat.js');
  legacyRouter = legacyCompatModule.default;
  app.use('/', legacyRouter);
  log('✅', 'Legacy compatibility routes loaded', colors.green);
} catch (error) {
  log('⚠️', `Could not load legacy-compat.js: ${error.message}`, colors.yellow);
}

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'integram-legacy-dev',
    version: '1.0.0',
    legacyPath: fs.existsSync(LEGACY_PATH) ? LEGACY_PATH : 'not found',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// Root index page
// ============================================================================

app.get('/', (req, res) => {
  const indexPage = path.join(LEGACY_PATH, 'index.html');
  if (fs.existsSync(indexPage)) {
    return res.sendFile(indexPage);
  }

  // Fallback info page
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Integram Legacy Dev Server</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 20px;
          background: #f8f9fa;
          color: #333;
        }
        h1 { color: #2c3e50; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 30px; }
        .card {
          background: white;
          border-radius: 8px;
          padding: 25px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card h2 { margin-top: 0; color: #3498db; }
        code {
          background: #ecf0f1;
          padding: 3px 8px;
          border-radius: 4px;
          font-family: 'Monaco', 'Consolas', monospace;
        }
        pre {
          background: #2c3e50;
          color: #ecf0f1;
          padding: 15px;
          border-radius: 6px;
          overflow-x: auto;
        }
        ul { line-height: 2; }
        a { color: #3498db; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .status { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status-ok { background: #27ae60; color: white; }
        .status-warn { background: #f39c12; color: white; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .link-card {
          background: #3498db;
          color: white;
          padding: 20px;
          border-radius: 8px;
          text-decoration: none;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .link-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(52,152,219,0.4);
          text-decoration: none;
        }
        .link-card h3 { margin: 0 0 8px 0; }
        .link-card p { margin: 0; opacity: 0.9; font-size: 14px; }
      </style>
    </head>
    <body>
      <h1>🚀 Integram Legacy Dev Server</h1>
      <p class="subtitle">Development server for legacy HTML frontend with Node.js backend</p>

      <div class="card">
        <h2>Quick Links</h2>
        <div class="grid">
          <a href="/my" class="link-card">
            <h3>📁 /my</h3>
            <p>Access 'my' database</p>
          </a>
          <a href="/demo" class="link-card">
            <h3>📁 /demo</h3>
            <p>Access 'demo' database</p>
          </a>
          <a href="/health" class="link-card">
            <h3>💚 /health</h3>
            <p>Server health check</p>
          </a>
          <a href="/app" class="link-card">
            <h3>📱 /app</h3>
            <p>Modern app interface</p>
          </a>
        </div>
      </div>

      <div class="card">
        <h2>Server Status</h2>
        <ul>
          <li>Server: <span class="status status-ok">Running</span> on port <code>${PORT}</code></li>
          <li>Legacy HTML: <span class="status ${fs.existsSync(LEGACY_PATH) ? 'status-ok' : 'status-warn'}">${fs.existsSync(LEGACY_PATH) ? 'Available' : 'Not Found'}</span></li>
          <li>Path: <code>${LEGACY_PATH}</code></li>
        </ul>
      </div>

      <div class="card">
        <h2>API Endpoints</h2>
        <ul>
          <li><code>POST /:db/auth</code> - User authentication</li>
          <li><code>GET /:db/validate</code> - Token validation</li>
          <li><code>POST /:db/_m_new/:up</code> - Create object</li>
          <li><code>POST /:db/_m_save/:id</code> - Save object</li>
          <li><code>POST /:db/_m_del/:id</code> - Delete object</li>
          <li><code>GET /:db/_dict/:typeId?</code> - Get type dictionary</li>
          <li><code>GET /:db/_list/:typeId</code> - List objects</li>
          <li><code>GET /:db/_d_main/:typeId</code> - Get type metadata</li>
        </ul>
      </div>

      <div class="card">
        <h2>Getting Started</h2>
        <p>To start developing with the legacy HTML frontend:</p>
        <ol>
          <li>Ensure MySQL/MariaDB is running with your Integram database</li>
          <li>Configure <code>.env</code> with database credentials</li>
          <li>Start this server: <pre>npm run dev:legacy</pre></li>
          <li>Open a database URL like <a href="/my">/my</a> or <a href="/demo">/demo</a></li>
        </ol>
      </div>
    </body>
    </html>
  `);
});

// ============================================================================
// 404 Handler
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================================
// HTTP Server with WebSocket support
// ============================================================================

const server = http.createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  log('🔌', 'WebSocket client connected', colors.green);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    log('🔌', 'WebSocket client disconnected', colors.yellow);
  });

  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Integram Legacy Dev Server',
    timestamp: Date.now()
  }));
});

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
// Start Server
// ============================================================================

server.listen(PORT, HOST, () => {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════════╗', '', colors.bright + colors.cyan);
  log('║       Integram Legacy Site - Development Server                ║', '', colors.bright + colors.cyan);
  log('╚════════════════════════════════════════════════════════════════╝', '', colors.bright + colors.cyan);
  console.log();
  log('🌐', `Server: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`, colors.green);
  log('📂', `Legacy HTML: ${fs.existsSync(LEGACY_PATH) ? LEGACY_PATH : 'Not found'}`, colors.blue);
  log('🔌', `WebSocket: ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/ws`, colors.magenta);
  console.log();
  log('📚', 'Quick links:', colors.cyan);
  log('   ', `  http://localhost:${PORT}/my     - Login to 'my' database`);
  log('   ', `  http://localhost:${PORT}/demo   - Login to 'demo' database`);
  log('   ', `  http://localhost:${PORT}/health - Health check`);
  console.log();
  log('💡', 'Press Ctrl+C to stop', colors.yellow);
  console.log();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  log('👋', 'Shutting down...', colors.yellow);
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
  server.close(() => {
    log('✅', 'Server closed', colors.green);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
});

process.on('SIGTERM', () => {
  process.emit('SIGINT');
});
