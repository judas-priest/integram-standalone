// Minimal Integram Backend Server for integram-standalone
// This server works "out of the box" without database configuration
import './config/env.js';

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
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
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'integram-standalone-backend',
    version: '1.0.0',
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
    description: 'Minimal backend server for Integram standalone deployment',
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
// These routes match the PHP backend API format
// ============================================================================

// Authentication endpoint (POST /:db/auth)
app.post('/api/:db/auth', (req, res) => {
  const { db } = req.params;
  const { user, pwd, login } = req.body;

  // For now, return a mock response matching PHP format
  res.json({
    success: true,
    message: 'Authentication endpoint',
    db,
    // Legacy format response
    user: user || login,
    token: 'mock-token-' + Date.now().toString(36),
    xsrf: 'mock-xsrf-' + Date.now().toString(36).substring(0, 22)
  });
});

// JWT authentication (POST /:db/jwt)
app.post('/api/:db/jwt', (req, res) => {
  const { db } = req.params;
  const { jwt, token } = req.body;

  res.json({
    success: true,
    message: 'JWT authentication endpoint',
    db,
    valid: false,
    error: 'JWT verification not implemented in minimal server'
  });
});

// Password confirmation (POST /:db/confirm)
app.post('/api/:db/confirm', (req, res) => {
  const { db } = req.params;
  const { pwd } = req.body;

  res.json({
    success: true,
    message: 'Password confirmation endpoint',
    db,
    confirmed: false,
    error: 'Password confirmation not implemented in minimal server'
  });
});

// Get one-time code (POST /:db/getcode)
app.all('/api/:db/getcode', (req, res) => {
  const { db } = req.params;
  const { email, phone } = { ...req.body, ...req.query };

  res.json({
    success: true,
    message: 'One-time code request endpoint',
    db,
    sent: false,
    error: 'Code generation not implemented in minimal server'
  });
});

// Check one-time code (POST /:db/checkcode)
app.all('/api/:db/checkcode', (req, res) => {
  const { db } = req.params;
  const { code } = { ...req.body, ...req.query };

  res.json({
    success: true,
    message: 'One-time code verification endpoint',
    db,
    valid: false,
    error: 'Code verification not implemented in minimal server'
  });
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

server.listen(PORT, HOST, () => {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       Integram Standalone Backend - Minimal Version            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  console.log(`✅ WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
  console.log(`✅ Health check: http://${HOST}:${PORT}/health`);
  console.log(`✅ API Info: http://${HOST}:${PORT}/api/info`);
  console.log('\n📚 Legacy Integram API routes:');
  console.log(`   POST /api/:db/auth     - Authentication`);
  console.log(`   POST /api/:db/jwt      - JWT authentication`);
  console.log(`   POST /api/:db/confirm  - Password confirmation`);
  console.log(`   POST /api/:db/getcode  - Request one-time code`);
  console.log(`   POST /api/:db/checkcode - Verify one-time code`);
  console.log(`   POST /api/:db/_m_new   - Create object (stub)`);
  console.log(`   POST /api/:db/_m_save  - Save object (stub)`);
  console.log(`   POST /api/:db/_m_del   - Delete object (stub)`);
  console.log('\n');
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

const shutdown = (signal) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);

  // Close WebSocket connections
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });

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
