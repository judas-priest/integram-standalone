# HTTP MCP Session Persistence

## Overview

The HTTP MCP server now supports session persistence, allowing multi-step operations to maintain state (including authentication) across multiple HTTP requests.

## Problem Statement

Previously, each HTTP request to `/api/mcp/integram/execute` spawned a **new** MCP client process. This meant:

- ❌ Authentication state was lost between requests
- ❌ Multi-step operations (authenticate → set context → query) failed
- ❌ Each request required re-authentication
- ❌ Complex workflows were impossible via HTTP API

### Evidence

```bash
# Before session persistence:
Step 1: Authentication ✓ SUCCESS
  Token: CHANGEME_EXPIRED_TOKEN

Step 2: Set Context ✓ SUCCESS

Step 3: Get Dictionary ✗ FAILED
  Error: Not authenticated. Call authenticate first.
```

## Solution: Session Persistence

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HTTP MCP Server                       │
│  (/api/mcp/integram/execute)                            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Session Storage      │
        │  (In-Memory Map)      │
        │                       │
        │  sessionId → {        │
        │    client,            │
        │    transport,         │
        │    createdAt,         │
        │    lastUsedAt         │
        │  }                    │
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  MCP Client Process   │
        │  (integram-server.js) │
        │                       │
        │  ✓ Maintains auth     │
        │  ✓ Reused across     │
        │    requests           │
        └───────────────────────┘
```

### Key Features

1. **Session Management**
   - Sessions stored in memory (Map)
   - Each session tracks: client, transport, timestamps
   - Auto-generated session IDs (crypto random)

2. **X-Session-ID Header**
   - Client sends `X-Session-ID` header to reuse session
   - Server returns `X-Session-ID` in response
   - New session created if header missing

3. **Automatic Cleanup**
   - Sessions expire after 30 minutes of inactivity
   - Cleanup runs every 5 minutes
   - Graceful client closure on timeout

4. **Session Endpoints**
   - `GET /api/mcp/sessions` - List active sessions
   - `DELETE /api/mcp/sessions/:id` - Close specific session
   - `POST /api/mcp/sessions/cleanup` - Manual cleanup

## Usage

### Basic Example (Node.js)

```javascript
import axios from 'axios';

const API_URL = 'https://dev.drondoc.ru/api/mcp/integram';

let sessionId = null;

// Step 1: Authenticate (creates new session)
const authResponse = await axios.post(`${API_URL}/execute`, {
  toolName: 'integram_authenticate',
  arguments: {
    serverURL: 'https://dronedoc.ru',
    database: 'ddadmin',
    login: 'd',
    password: 'd'
  }
});

// Get session ID from response header
sessionId = authResponse.headers['x-session-id'];
const { token, xsrfToken } = JSON.parse(authResponse.data.result.content[0].text);

console.log(`Session ID: ${sessionId}`);

// Step 2: Set context (reuse session)
const contextResponse = await axios.post(`${API_URL}/execute`, {
  toolName: 'integram_set_context',
  arguments: {
    serverURL: 'https://dronedoc.ru',
    database: 'ddadmin',
    token,
    xsrfToken
  }
}, {
  headers: {
    'X-Session-ID': sessionId  // ← Reuse session!
  }
});

// Step 3: Get dictionary (still authenticated!)
const dictResponse = await axios.post(`${API_URL}/execute`, {
  toolName: 'integram_get_dictionary',
  arguments: {}
}, {
  headers: {
    'X-Session-ID': sessionId  // ← Same session!
  }
});

// Success! All steps use the same authenticated session.
```

### Response Format

```json
{
  "success": true,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"types\": [...], \"users\": [...]}"
      }
    ]
  },
  "toolName": "integram_get_dictionary",
  "session": {
    "id": "a1b2c3d4e5f6...",
    "isNew": false,
    "message": "Using existing session."
  }
}
```

### Session Management

#### List Active Sessions

```bash
curl https://dev.drondoc.ru/api/mcp/sessions
```

Response:
```json
{
  "success": true,
  "sessions": [
    {
      "sessionId": "a1b2c3d4e5f6...",
      "createdAt": "2025-11-16T10:00:00Z",
      "lastUsedAt": "2025-11-16T10:05:00Z",
      "ageMs": 300000,
      "idleMs": 0
    }
  ],
  "count": 1,
  "timeout": 1800000,
  "cleanupInterval": 300000
}
```

#### Close a Session

```bash
curl -X DELETE https://dev.drondoc.ru/api/mcp/sessions/a1b2c3d4e5f6...
```

Response:
```json
{
  "success": true,
  "message": "Session a1b2c3d4e5f6... closed successfully"
}
```

#### Manual Cleanup

```bash
curl -X POST https://dev.drondoc.ru/api/mcp/sessions/cleanup
```

## Configuration

### Timeouts

```javascript
// In backend/monolith/src/api/routes/mcp.js

const SESSION_TIMEOUT = 30 * 60 * 1000;      // 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;       // 5 minutes
```

### Customization

```javascript
// Adjust session timeout
const SESSION_TIMEOUT = parseInt(process.env.MCP_SESSION_TIMEOUT || '1800000');

// Adjust cleanup interval
const CLEANUP_INTERVAL = parseInt(process.env.MCP_CLEANUP_INTERVAL || '300000');
```

## Error Handling

### Session Not Found

If you provide an invalid `X-Session-ID`, a new session is created:

```json
{
  "success": true,
  "session": {
    "id": "newSessionId...",
    "isNew": true,
    "message": "New session created. Use X-Session-ID header in subsequent requests."
  }
}
```

### Tool Execution Failed

If a tool fails, the session is **kept alive** for retry:

```json
{
  "success": false,
  "error": "Tool execution failed",
  "message": "Not authenticated. Call authenticate first.",
  "session": {
    "id": "existingSessionId...",
    "isNew": false,
    "message": "Session is still active. You can retry or use other tools."
  }
}
```

## Complete Example: Create Table

See `backend/monolith/examples/create-zadachi-table-with-sessions.js` for a full example demonstrating:

1. Authentication
2. Context setting
3. Dictionary retrieval
4. Type creation
5. Requisite addition
6. Alias setting
7. Data insertion
8. Data retrieval

All using a **single session** maintained across 17 tool calls!

## Migration Guide

### Before (No Session Support)

```javascript
// Each call was isolated
const auth = await callTool('integram_authenticate', {...});
const dict = await callTool('integram_get_dictionary', {});
// ❌ Failed: dictionary call had no authentication context
```

### After (With Session Support)

```javascript
// First call creates session
const authResponse = await callTool('integram_authenticate', {...});
const sessionId = authResponse.headers['x-session-id'];

// Subsequent calls reuse session
const dictResponse = await callTool('integram_get_dictionary', {}, sessionId);
// ✓ Success: authentication persists via session
```

## Troubleshooting

### Session Expires Too Quickly

Increase `SESSION_TIMEOUT`:

```bash
# Environment variable
MCP_SESSION_TIMEOUT=3600000  # 1 hour
```

### Too Many Sessions Accumulating

Decrease `SESSION_TIMEOUT` or increase `CLEANUP_INTERVAL`:

```bash
MCP_SESSION_TIMEOUT=900000   # 15 minutes
MCP_CLEANUP_INTERVAL=60000   # 1 minute
```

### Check Active Sessions

```bash
curl https://dev.drondoc.ru/api/mcp/sessions | jq .
```

### Force Cleanup

```bash
curl -X POST https://dev.drondoc.ru/api/mcp/sessions/cleanup
```

## Performance Considerations

### Memory Usage

- Each session holds: 1 MCP client + 1 transport
- Typical session: ~5-10 MB
- 100 active sessions: ~500 MB - 1 GB

### Concurrency

- Sessions are independent (no shared state)
- Multiple concurrent requests can use different sessions
- Same session cannot handle concurrent requests (sequential only)

### Scalability

- Current implementation: In-memory storage (single server)
- Future: Distributed session storage (Redis, Memcached)

## Future Enhancements

1. **Distributed Sessions**
   - Store sessions in Redis/Memcached
   - Enable horizontal scaling across multiple servers

2. **Session Persistence**
   - Save sessions to disk for recovery after restart
   - Restore active sessions on server startup

3. **Session Metrics**
   - Track session usage statistics
   - Monitor tool call counts per session
   - Detect suspicious activity

4. **Client SDK**
   - Provide helper library for automatic session management
   - Handle session ID storage/retrieval transparently

## References

- **Issue**: #3501 - Create Задачи table in ddadmin database
- **Implementation**: `backend/monolith/src/api/routes/mcp.js`
- **Examples**:
  - `backend/monolith/examples/test-session-persistence.js`
  - `backend/monolith/examples/create-zadachi-table-with-sessions.js`
- **Related**:
  - `INTEGRAM_MCP_README.md` - Integram MCP server documentation
  - `HTTP_MCP_USAGE.md` - HTTP MCP usage guide

## Summary

✅ **Session persistence solves the multi-step operation problem**

- Authentication persists across requests
- Complex workflows now possible via HTTP API
- Automatic cleanup prevents resource leaks
- Backwards compatible with existing code
- Simple to use (just pass X-Session-ID header)

**Try it now:**

```bash
node backend/monolith/examples/test-session-persistence.js
```
