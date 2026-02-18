#!/usr/bin/env node
/**
 * Development Server for Legacy HTML Site with Node.js Backend
 *
 * This script starts a development server that:
 * 1. Serves static files from integram-server/ directory
 * 2. Proxies API requests to the Node.js backend
 * 3. Provides live reload for HTML/CSS/JS changes
 *
 * Usage:
 *   node scripts/dev-legacy-site.js
 *   npm run dev:legacy
 *   bun run dev:legacy
 *
 * Environment variables:
 *   PORT          - Port for the dev server (default: 3000)
 *   API_PORT      - Port for the backend API (default: 8081)
 *   API_HOST      - Host for the backend API (default: localhost)
 *   LEGACY_PATH   - Path to integram-server/ (default: ../../integram-server)
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = parseInt(process.env.DEV_PORT || process.env.PORT || '3000', 10);
const API_PORT = parseInt(process.env.API_PORT || '8081', 10);
const API_HOST = process.env.API_HOST || 'localhost';
const LEGACY_PATH = path.resolve(__dirname, process.env.LEGACY_PATH || '../../integram-server');

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
  log('❌', `Legacy HTML directory not found: ${LEGACY_PATH}`, colors.red);
  log('📍', 'Expected structure:', colors.yellow);
  log('   ', '  /integram-server/');
  log('   ', '    ├── index.html');
  log('   ', '    ├── css/');
  log('   ', '    ├── js/');
  log('   ', '    ├── templates/');
  log('   ', '    └── app/');
  process.exit(1);
}

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? colors.red : colors.green;
    console.log(`${statusColor}${res.statusCode}${colors.reset} ${req.method} ${req.url} ${colors.cyan}(${duration}ms)${colors.reset}`);
  });
  next();
});

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Cookie parser
import cookieParser from 'cookie-parser';
app.use(cookieParser());

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -----------------------------------------------------------------------------
// Static file serving for legacy HTML site
// -----------------------------------------------------------------------------

// Serve static directories
const staticDirs = ['css', 'js', 'i', 'templates', 'ace', 'app', 'fonts', 'img', 'images', 'assets'];
for (const dir of staticDirs) {
  const dirPath = path.join(LEGACY_PATH, dir);
  if (fs.existsSync(dirPath)) {
    app.use(`/${dir}`, express.static(dirPath, {
      setHeaders: (res, filePath) => {
        // Disable caching for development
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }));
    log('📁', `Serving /${dir} from ${dirPath}`, colors.blue);
  }
}

// Serve root static files (favicon, robots.txt, etc.)
const rootStaticFiles = ['favicon.ico', 'robots.txt', 'manifest.json', '.htaccess'];
for (const file of rootStaticFiles) {
  const filePath = path.join(LEGACY_PATH, file);
  if (fs.existsSync(filePath)) {
    app.get(`/${file}`, (req, res) => {
      res.sendFile(filePath);
    });
  }
}

// -----------------------------------------------------------------------------
// API Proxy to Node.js Backend
// -----------------------------------------------------------------------------

// Check if proxy middleware is available
let proxyMiddleware = null;
try {
  // Try to create proxy middleware
  const { createProxyMiddleware: createProxy } = await import('http-proxy-middleware');
  proxyMiddleware = createProxy({
    target: `http://${API_HOST}:${API_PORT}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    onError: (err, req, res) => {
      log('❌', `Proxy error: ${err.message}`, colors.red);
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: 'Backend API unavailable',
          details: 'Make sure the backend server is running on port ' + API_PORT
        });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      // Forward cookies
      if (req.headers.cookie) {
        proxyReq.setHeader('Cookie', req.headers.cookie);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      // Forward set-cookie headers
      const setCookie = proxyRes.headers['set-cookie'];
      if (setCookie) {
        res.setHeader('Set-Cookie', setCookie);
      }
    }
  });
  log('🔗', `API proxy configured: http://${API_HOST}:${API_PORT}`, colors.magenta);
} catch (error) {
  log('⚠️', 'http-proxy-middleware not available, API proxy disabled', colors.yellow);
  log('💡', 'Install it with: npm install http-proxy-middleware', colors.cyan);
}

// Proxy /api/* requests to backend
if (proxyMiddleware) {
  app.use('/api', proxyMiddleware);
}

// Proxy WebSocket connections
// Note: WebSocket upgrade handled by http-proxy-middleware automatically

// -----------------------------------------------------------------------------
// Legacy PHP-style routes
// These routes serve the appropriate HTML templates based on the URL
// -----------------------------------------------------------------------------

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
  return res.status(404).send(`Page not found for database: ${db}`);
});

// Serve sub-pages within database context (e.g., /my/dict, /my/object/18)
app.get('/:db/:page*', (req, res, next) => {
  const { db, page } = req.params;
  const wildcard = req.params[0] || '';

  // Skip API-like requests
  if (db.startsWith('_') || db === 'api' || page.startsWith('_')) {
    return next();
  }

  // Validate database name
  if (!/^[a-z]\w{1,14}$/i.test(db)) {
    return next();
  }

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
    'auth': 'index.html',
    'login': 'index.html',
    'register': 'templates/register.html',
  };

  const templateFile = pageMap[page];
  if (templateFile) {
    const fullPath = path.join(LEGACY_PATH, templateFile);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }

  // Check for custom database-specific templates
  const customPath = path.join(LEGACY_PATH, `templates/custom/${db}/${page}.html`);
  if (fs.existsSync(customPath)) {
    return res.sendFile(customPath);
  }

  // Fallback to app/index.html for SPA routing
  const appIndex = path.join(LEGACY_PATH, 'app/index.html');
  if (fs.existsSync(appIndex)) {
    return res.sendFile(appIndex);
  }

  return next();
});

// -----------------------------------------------------------------------------
// Fallback routes
// -----------------------------------------------------------------------------

// Serve index.html for root
app.get('/', (req, res) => {
  const indexPage = path.join(LEGACY_PATH, 'index.html');
  if (fs.existsSync(indexPage)) {
    return res.sendFile(indexPage);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Integram Legacy Dev Server</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        .endpoints { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }
        ul { line-height: 1.8; }
      </style>
    </head>
    <body>
      <h1>🚀 Integram Legacy Dev Server</h1>
      <p>This server serves the legacy HTML frontend with API proxy to Node.js backend.</p>

      <div class="endpoints">
        <h3>Available Endpoints:</h3>
        <ul>
          <li><code>/:db</code> - Access database (e.g., /my, /demo)</li>
          <li><code>/:db/dict</code> - Dictionary view</li>
          <li><code>/:db/object/:id</code> - Object view</li>
          <li><code>/api/*</code> - API proxy to backend (port ${API_PORT})</li>
        </ul>

        <h3>Configuration:</h3>
        <ul>
          <li>Dev Server Port: <code>${PORT}</code></li>
          <li>API Backend: <code>http://${API_HOST}:${API_PORT}</code></li>
          <li>Legacy HTML Path: <code>${LEGACY_PATH}</code></li>
        </ul>
      </div>

      <p><strong>Note:</strong> Make sure the backend server is running:</p>
      <pre><code>cd backend/monolith && npm run dev</code></pre>
    </body>
    </html>
  `);
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head><title>404 - Not Found</title></head>
    <body style="font-family: system-ui; text-align: center; padding: 50px;">
      <h1>404 - Page Not Found</h1>
      <p>The requested URL <code>${req.url}</code> was not found.</p>
      <p><a href="/">Go Home</a></p>
    </body>
    </html>
  `);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).send(`
    <!DOCTYPE html>
    <html>
    <head><title>500 - Server Error</title></head>
    <body style="font-family: system-ui; text-align: center; padding: 50px;">
      <h1>500 - Server Error</h1>
      <p>${err.message}</p>
    </body>
    </html>
  `);
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════════╗', '', colors.bright);
  log('║       Integram Legacy Site - Development Server                ║', '', colors.bright);
  log('╚════════════════════════════════════════════════════════════════╝', '', colors.bright);
  console.log();
  log('🌐', `Server running on http://localhost:${PORT}`, colors.green);
  log('📂', `Serving legacy HTML from: ${LEGACY_PATH}`, colors.blue);
  log('🔗', `API proxy to: http://${API_HOST}:${API_PORT}`, colors.magenta);
  console.log();
  log('📚', 'Quick links:', colors.cyan);
  log('   ', `  http://localhost:${PORT}/my       - Login to 'my' database`);
  log('   ', `  http://localhost:${PORT}/demo     - Login to 'demo' database`);
  log('   ', `  http://localhost:${PORT}/api/health - Backend health check`);
  console.log();
  log('💡', 'Press Ctrl+C to stop the server', colors.yellow);
  console.log();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  log('👋', 'Shutting down dev server...', colors.yellow);
  server.close(() => {
    log('✅', 'Server closed', colors.green);
    process.exit(0);
  });
});
