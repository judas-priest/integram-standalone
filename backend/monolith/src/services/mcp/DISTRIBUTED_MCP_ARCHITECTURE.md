# Distributed MCP Architecture

## Overview

This document describes the distributed architecture for Model Context Protocol (MCP) integration where:
- **Claude CLI** can run on ANY machine (developer laptop, CI/CD, dedicated server like YOUR_DEV_SERVER_IP, etc.)
- **http-mcp-bridge.js** runs LOCAL to Claude CLI on the SAME machine
- **Backend orchestrator** runs on a SEPARATE server `dev.drondoc.ru` (which may resolve to YOUR_DEV_SERVER_IP internally)
- **Connection**: Claude CLI → local bridge → HTTPS → remote backend
- MCP tools are accessible via HTTP API from the remote backend

## Architecture Diagram

### Key Concept: TWO Separate Machines

**IMPORTANT**: Claude CLI and Backend run on SEPARATE machines, connected via HTTPS:

- **Machine A** (Claude CLI Server): Can be ANY machine with network access to Backend
  - Examples: developer laptop, CI/CD runner, dedicated server (YOUR_DEV_SERVER_IP), etc.
  - Must have: Node.js, repository codebase with `.claude/mcp.json`, `http-mcp-bridge.js`

- **Machine B** (Backend Server): `dev.drondoc.ru` (may resolve to YOUR_DEV_SERVER_IP)
  - Must have: Node.js, Express server running, `integram-server.js`
  - Accessible via HTTPS from Machine A

```
┌──────────────────────────────────────────────────────────────────────┐
│  Machine A: Claude CLI Server                                        │
│  (Can be: laptop, CI/CD, dedicated server like YOUR_DEV_SERVER_IP, etc.) │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Claude Code (CLI)                                              │ │
│  │  - Reads .claude/mcp.json from project directory               │ │
│  │  - Spawns http-mcp-bridge.js as child process                  │ │
│  │  - Communicates with bridge via stdio                          │ │
│  └──────────────────┬─────────────────────────────────────────────┘ │
│                     │ stdio (stdin/stdout)                           │
│  ┌──────────────────▼─────────────────────────────────────────────┐ │
│  │  http-mcp-bridge.js (LOCAL to Claude CLI)                      │ │
│  │  - Listens on stdio for MCP requests from Claude CLI           │ │
│  │  - Translates stdio ↔ HTTP/HTTPS                               │ │
│  │  - Environment variables:                                       │ │
│  │    • MCP_SERVER_URL=https://dev.drondoc.ru                │ │
│  │    • MCP_API_PATH=/api/mcp/integram                            │ │
│  │  - Makes HTTPS requests to remote backend                      │ │
│  └──────────────────┬─────────────────────────────────────────────┘ │
└────────────────────┼───────────────────────────────────────────────┘
                     │
                     │ HTTPS over network/internet
                     │ (May cross NAT, firewalls, different subnets)
                     │
┌────────────────────▼─────────────────────────────────────────────────┐
│  Machine B: Backend Server (dev.drondoc.ru)                     │
│  (SEPARATE machine, accessible via HTTPS)                            │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Express.js Orchestrator                                        │ │
│  │  - Listens on :8081 for HTTPS requests                         │ │
│  │  - HTTP API Endpoints:                                          │ │
│  │    • GET  /api/mcp/integram/tools    → List tools              │ │
│  │    • POST /api/mcp/integram/execute  → Execute tool            │ │
│  │    • GET  /api/mcp/integram/manifest → Server info             │ │
│  │  - Handles requests from http-mcp-bridge.js                    │ │
│  └──────────────────┬─────────────────────────────────────────────┘ │
│                     │ spawns (per request)                           │
│  ┌──────────────────▼─────────────────────────────────────────────┐ │
│  │  integram-server.js (MCP Server)                                │ │
│  │  - Spawned as child process by Express                         │ │
│  │  - Implements MCP protocol via stdio                           │ │
│  │  - 27 Integram API tools available                             │ │
│  │  - Maintains session state (token, XSRF) in memory             │ │
│  │  - Communicates with Integram API via HTTPS                    │ │
│  └──────────────────┬─────────────────────────────────────────────┘ │
└────────────────────┼───────────────────────────────────────────────┘
                     │
                     │ HTTPS to Integram API
                     │
         ┌───────────▼────────────────────┐
         │  Integram API                  │
         │  https://dronedoc.ru           │
         │  - Database: a2025             │
         │  - Session authentication      │
         │  - XSRF protection             │
         └────────────────────────────────┘
```

### Network Flow Summary

1. **Claude CLI** (Machine A) ↔ **http-mcp-bridge.js** (Machine A): stdio (same machine)
2. **http-mcp-bridge.js** (Machine A) ↔ **Express Backend** (Machine B): HTTPS over network
3. **Express Backend** (Machine B) ↔ **integram-server.js** (Machine B): stdio (same machine)
4. **integram-server.js** (Machine B) ↔ **Integram API** (dronedoc.ru): HTTPS over network

## Components

### 1. Claude CLI Server (Machine A)

**Location**: Can run on ANY machine with network access to backend:
- Developer laptop (e.g., MacBook, Windows PC)
- CI/CD runner (e.g., GitHub Actions, GitLab CI)
- Dedicated server (e.g., YOUR_DEV_SERVER_IP or any other server)
- Cloud VM (e.g., AWS EC2, DigitalOcean Droplet)

**Requirements**:
1. Node.js installed (v18+ recommended)
2. Repository codebase cloned (contains `.claude/mcp.json` and `http-mcp-bridge.js`)
3. Network access to backend server (can reach `dev.drondoc.ru` via HTTPS)

**Configuration**: `.claude/mcp.json` (in project root)
```json
{
  "mcpServers": {
    "integram": {
      "command": "node",
      "args": [
        "backend/monolith/src/services/mcp/http-mcp-bridge.js"
      ],
      "env": {
        "MCP_SERVER_URL": "https://dev.drondoc.ru",
        "MCP_API_PATH": "/api/mcp/integram"
      }
    }
  }
}
```

**How It Works**:
1. User runs Claude CLI on Machine A (e.g., `claude code`)
2. Claude CLI reads `.claude/mcp.json` from current directory
3. Claude CLI spawns `http-mcp-bridge.js` as a child process (runs on same machine)
4. Claude CLI communicates with bridge via stdio (stdin/stdout, local)
5. Bridge makes HTTPS requests to remote backend (over network)

**Key Points**:
- ✅ `http-mcp-bridge.js` runs LOCAL to Claude CLI (same machine)
- ✅ Bridge requires relative path to work from project directory
- ✅ Can run on any machine, not tied to specific server
- ✅ Requires network access to `dev.drondoc.ru`

### 2. HTTP MCP Bridge

**Location**: `backend/monolith/src/services/mcp/http-mcp-bridge.js`

**Purpose**: Translates between stdio (Claude CLI) and HTTP (remote backend)

**Process Flow**:
1. Claude CLI spawns this script as child process
2. Bridge listens on stdio for MCP requests from Claude
3. Translates MCP requests to HTTP POST/GET
4. Sends HTTP requests to `MCP_SERVER_URL + MCP_API_PATH`
5. Receives HTTP responses from backend
6. Translates HTTP responses back to MCP protocol
7. Sends MCP responses to Claude via stdio

**Key Features**:
- SSL certificate validation bypass for dev server (`rejectUnauthorized: false`)
- 30-second timeout for HTTP requests
- Error handling and logging
- Stateless bridge (no session management)

### 3. Backend Orchestrator (dev.drondoc.ru)

**Location**: `backend/monolith/src/api/routes/mcp.js`

**HTTP Endpoints**:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/mcp/integram/tools` | List all available MCP tools |
| POST | `/api/mcp/integram/execute` | Execute a specific MCP tool |
| GET | `/api/mcp/integram/manifest` | Get MCP server manifest |
| GET | `/api/mcp/integram` | SSE endpoint for web clients |
| POST | `/api/mcp/integram` | Handle MCP protocol messages |

**Process Flow**:
1. Receives HTTP request from bridge
2. Spawns `integram-server.js` as child process
3. Establishes stdio communication with MCP server
4. Forwards tool list/call requests via stdio
5. Receives MCP responses from server
6. Translates to HTTP JSON response
7. Sends response back to bridge

**Key Features**:
- Stateless request handling
- Spawns fresh MCP server for each request (clean sessions)
- CORS enabled for web clients
- Error logging with pino logger
- JSON-RPC 2.0 protocol support

### 4. Integram MCP Server

**Location**: `backend/monolith/src/services/mcp/integram-server.js`

**Purpose**: Implements MCP protocol and provides Integram API tools

**Tools Available** (27 total):
- Authentication (2): `integram_authenticate`, `integram_set_context`
- DDL operations (8): Create/modify types and requisites
- DML operations (6): Create/modify/delete objects
- Queries (7): Get metadata, object lists, reports
- Multiselect (2): Add/remove multiselect items
- Files (2): Directory admin, backups

**Key Features**:
- Maintains session state (token, XSRF) in memory
- Communicates with Integram API via HTTPS
- Returns structured MCP responses
- Error handling with descriptive messages

### 5. Integram API

**Location**: `https://dronedoc.ru`

**Purpose**: Production database backend

**Key Features**:
- RESTful API for database operations
- Session-based authentication (token + XSRF)
- Multi-database support (specify database name)
- JSON API responses

## Network Flow Example

### Example: List Tools

```
1. Claude CLI → http-mcp-bridge.js (stdio)
   MCP Request: { method: 'tools/list' }

2. http-mcp-bridge.js → dev.drondoc.ru (HTTPS)
   GET /api/mcp/integram/tools

3. dev.drondoc.ru → integram-server.js (stdio)
   Spawns server, sends: { method: 'tools/list' }

4. integram-server.js → dev.drondoc.ru (stdio)
   Returns: { tools: [...27 tools...] }

5. dev.drondoc.ru → http-mcp-bridge.js (HTTPS)
   HTTP 200: { success: true, tools: [...], count: 27 }

6. http-mcp-bridge.js → Claude CLI (stdio)
   MCP Response: { tools: [...27 tools...] }
```

### Example: Authenticate and Create Object

```
1. Claude CLI: "Authenticate with Integram"

2. http-mcp-bridge.js → dev.drondoc.ru
   POST /api/mcp/integram/execute
   { toolName: "integram_authenticate", arguments: {...} }

3. integram-server.js → dronedoc.ru
   POST /auth
   { login: "d", password: "d", database: "a2025" }

4. dronedoc.ru → integram-server.js
   { success: true, token: "...", xsrf: "..." }

5. integram-server.js saves session in memory

6. Claude CLI: "Create a new project"

7. http-mcp-bridge.js → dev.drondoc.ru
   POST /api/mcp/integram/execute
   { toolName: "integram_create_object", arguments: {...} }

8. integram-server.js → dronedoc.ru
   POST /api/objects/create
   Headers: { Authorization: "Bearer ...", X-XSRF-TOKEN: "..." }

9. dronedoc.ru → integram-server.js
   { success: true, objectId: 1234 }

10. Response flows back to Claude CLI
```

## Security Considerations

### SSL/TLS

- **Production**: Should use valid SSL certificates
- **Development**: Currently bypasses SSL verification for `dev.drondoc.ru`
  ```javascript
  httpsAgent: new https.Agent({
    rejectUnauthorized: false  // Only for dev server
  })
  ```
- **Recommendation**: Use Let's Encrypt for dev.drondoc.ru

### Authentication

- **No API keys required** for MCP endpoints (open access)
- **Integram authentication** handled per-tool via credentials
- **Session tokens** stored in MCP server memory (not persisted)
- **XSRF protection** implemented by Integram API

### Network Security

- All communication over HTTPS (except stdio)
- CORS enabled for web clients
- No sensitive data in URLs (POST body only)
- Timeout protection (30s) on HTTP requests

## Setting Up Claude CLI Machine

### Prerequisites

Before Claude CLI can connect to the MCP backend, you need:

1. **Node.js**: Version 18 or higher
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **Repository Codebase**: Clone the repository
   ```bash
   git clone https://github.com/unidel2035/dronedoc2025.git
   cd dronedoc2025
   ```

3. **Network Access**: Verify backend is reachable
   ```bash
   curl -k https://dev.drondoc.ru/api/health
   # Should return: {"status":"healthy",...}
   ```

### Installation Steps

#### Step 1: Install Dependencies

The bridge script requires the MCP SDK and axios:

```bash
# Navigate to project root
cd /path/to/dronedoc2025

# Install dependencies for the bridge script
cd backend/monolith
npm install @modelcontextprotocol/sdk axios

# Return to project root
cd ../..
```

#### Step 2: Verify Configuration

Check that `.claude/mcp.json` exists and is correctly configured:

```bash
cat .claude/mcp.json
```

Should contain:
```json
{
  "mcpServers": {
    "integram": {
      "command": "node",
      "args": [
        "backend/monolith/src/services/mcp/http-mcp-bridge.js"
      ],
      "env": {
        "MCP_SERVER_URL": "https://dev.drondoc.ru",
        "MCP_API_PATH": "/api/mcp/integram"
      }
    }
  }
}
```

#### Step 3: Test the Bridge

Test the bridge manually before using it with Claude CLI:

```bash
# Set environment variables
export MCP_SERVER_URL="https://dev.drondoc.ru"
export MCP_API_PATH="/api/mcp/integram"

# Run the bridge
node backend/monolith/src/services/mcp/http-mcp-bridge.js

# You should see in stderr:
# HTTP MCP Bridge running (https://dev.drondoc.ru/api/mcp/integram)

# Test by sending MCP request via stdin (Ctrl+C to exit):
# {"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

#### Step 4: Verify Backend Connectivity

Ensure the bridge can reach the backend:

```bash
# Test tools endpoint
curl -k https://dev.drondoc.ru/api/mcp/integram/tools

# Should return:
# {"success":true,"tools":[...],"count":27}
```

#### Step 5: Start Claude CLI

Now you can start Claude CLI:

```bash
claude code
# or
claude chat
```

Claude CLI will automatically:
1. Read `.claude/mcp.json`
2. Spawn `http-mcp-bridge.js`
3. Connect to the remote MCP backend
4. Make 27 Integram tools available to Claude

### Verifying Connection

Once Claude CLI is running, you can verify MCP tools are loaded:

1. In Claude CLI, list available tools
2. Look for tools starting with `integram_` (e.g., `integram_authenticate`, `integram_get_dictionary`)
3. Test a simple tool: "List all available types in the Integram database"

### Common Issues on Claude CLI Machine

#### Issue 1: "Cannot find module '@modelcontextprotocol/sdk'"

**Cause**: Dependencies not installed in `backend/monolith/`

**Solution**:
```bash
cd backend/monolith
npm install @modelcontextprotocol/sdk axios
```

#### Issue 2: "ENOENT: no such file or directory"

**Cause**: Bridge script path is incorrect in `.claude/mcp.json`

**Solution**: Ensure you're running Claude CLI from the project root directory:
```bash
cd /path/to/dronedoc2025
claude code  # Run from project root
```

#### Issue 3: "ECONNREFUSED" or "ETIMEDOUT"

**Cause**: Cannot reach backend server

**Solutions**:
1. Check network connectivity:
   ```bash
   ping dev.drondoc.ru
   curl -k https://dev.drondoc.ru/api/health
   ```

2. Check firewall rules (allow outbound HTTPS to port 8081)

3. Verify backend is running:
   ```bash
   ssh user@dev.drondoc.ru
   systemctl status backend-orchestrator
   # or
   pm2 status
   ```

#### Issue 4: "unable to verify the first certificate"

**Cause**: SSL certificate verification failed

**Solution**: The bridge already bypasses SSL verification for dev server (see `rejectUnauthorized: false` in `http-mcp-bridge.js`). If you still see this error, check that you're using the latest version of the bridge script.

## Deployment Scenarios

### Scenario 1: Developer Laptop

```
Developer Laptop
  ├── Claude CLI (local)
  ├── http-mcp-bridge.js (local)
  └── → HTTPS → dev.drondoc.ru (remote)
           └── integram-server.js (remote)
                └── → HTTPS → dronedoc.ru (production)
```

**Advantages**:
- No backend setup required locally
- Uses shared production database
- Consistent behavior across developers

**Disadvantages**:
- Requires network access to dev.drondoc.ru
- Shares backend resources with other developers

### Scenario 2: CI/CD Pipeline

```
GitHub Actions Runner
  ├── Claude CLI (CI environment)
  ├── http-mcp-bridge.js (CI environment)
  └── → HTTPS → dev.drondoc.ru (remote)
           └── integram-server.js (remote)
                └── → HTTPS → dronedoc.ru (production)
```

**Advantages**:
- No special CI configuration needed
- Can run database integration tests
- Automated PR review with MCP tools

**Disadvantages**:
- CI runner needs network access to dev.drondoc.ru
- May affect production data (use test database!)

### Scenario 3: Claude Desktop (Local)

```
Claude Desktop App
  ├── Built-in MCP client
  ├── http-mcp-bridge.js (local)
  └── → HTTPS → dev.drondoc.ru (remote)
           └── integram-server.js (remote)
                └── → HTTPS → dronedoc.ru (production)
```

**Configuration**: `~/.config/Claude/claude_desktop_config.json`

**Advantages**:
- GUI access to MCP tools
- Natural language interface
- No CLI required

### Scenario 4: Fully Local (Alternative)

```
Developer Laptop
  ├── Claude CLI (local)
  ├── integram-server.js (local, stdio)
  └── → HTTPS → dronedoc.ru (production)
```

**Configuration**: `.claude/mcp.json` (without HTTP bridge)
```json
{
  "mcpServers": {
    "integram-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/backend/monolith/src/services/mcp/integram-server.js"
      ]
    }
  }
}
```

**Advantages**:
- No dependency on dev.drondoc.ru
- Faster (no HTTP overhead)
- Works offline (except Integram API calls)

**Disadvantages**:
- Requires local backend setup
- Different behavior than other developers

## Configuration Management

### Environment Variables

**HTTP Bridge** (`http-mcp-bridge.js`):
- `MCP_SERVER_URL` - Backend orchestrator URL (default: `https://dev.drondoc.ru`)
- `MCP_API_PATH` - API path for MCP endpoints (default: `/api/mcp/integram`)

**Backend Orchestrator** (Express server):
- `PORT` - Server port (default: `8081`)
- `NODE_ENV` - Environment (development/production)
- `DEEPSEEK_API_KEY` - For AI chat features (optional)

**Integram MCP Server**:
- No environment variables required (session managed in memory)

### Configuration Files

**Claude CLI**: `.claude/mcp.json` (project root)
```json
{
  "mcpServers": {
    "integram": {
      "command": "node",
      "args": ["backend/monolith/src/services/mcp/http-mcp-bridge.js"],
      "env": {
        "MCP_SERVER_URL": "https://dev.drondoc.ru",
        "MCP_API_PATH": "/api/mcp/integram"
      }
    }
  }
}
```

**Claude Desktop**: `~/.config/Claude/claude_desktop_config.json`
```json
{
  "mcpServers": {
    "integram": {
      "command": "node",
      "args": ["/absolute/path/to/backend/monolith/src/services/mcp/http-mcp-bridge.js"],
      "env": {
        "MCP_SERVER_URL": "https://dev.drondoc.ru",
        "MCP_API_PATH": "/api/mcp/integram"
      }
    }
  }
}
```

## Troubleshooting

### Bridge Cannot Connect to Backend

**Symptom**: Error "ECONNREFUSED" or "ETIMEDOUT"

**Solutions**:
1. Check backend is running: `curl https://dev.drondoc.ru/api/health`
2. Verify network access from Claude CLI server
3. Check firewall rules
4. Ensure correct `MCP_SERVER_URL` in configuration

### SSL Certificate Errors

**Symptom**: "unable to verify the first certificate"

**Solutions**:
1. Verify SSL bypass is enabled in `http-mcp-bridge.js`
2. Use valid SSL certificate on dev.drondoc.ru
3. Add CA certificate to system trust store

### Tool Execution Timeout

**Symptom**: "Request timeout after 30000ms"

**Solutions**:
1. Increase timeout in `http-mcp-bridge.js`
2. Check Integram API response time
3. Verify database performance
4. Use pagination for large result sets

### Session Lost Between Calls

**Symptom**: "Not authenticated" after successful authentication

**Cause**: Backend spawns fresh MCP server for each request

**Solutions**:
1. Use `integram_set_context` to restore session
2. Save token/XSRF in Claude conversation context
3. Re-authenticate if session expires

## Performance Considerations

### Latency

**Typical Request Path**:
```
Claude CLI → stdio → Bridge → HTTPS (50-200ms) → Backend → stdio → MCP Server → HTTPS (50-200ms) → Integram API
```

**Total latency**: 150-500ms (network dependent)

**Optimization**:
- Use local MCP server for dev (removes HTTP hop)
- Cache frequently accessed metadata
- Use HTTP/2 for backend communication
- Implement connection pooling

### Scalability

**Current Architecture**:
- Stateless bridge (can run multiple instances)
- Backend spawns MCP server per request (high memory usage)
- No connection pooling to Integram API

**Improvements**:
- Connection pooling to Integram API
- Persistent MCP server with session management
- Load balancer for backend orchestrator
- Redis for distributed session storage

### Resource Usage

**HTTP Bridge**:
- Memory: ~30MB per instance
- CPU: Minimal (proxy only)
- Network: ~1-10 KB per request

**Backend Orchestrator**:
- Memory: ~50MB base + ~30MB per concurrent MCP server
- CPU: Moderate (spawning processes)
- Network: ~1-10 KB per request

**MCP Server**:
- Memory: ~30MB per instance
- CPU: Low (I/O bound)
- Network: ~1-10 KB per Integram API call

## Monitoring and Logging

### Logs to Monitor

**HTTP Bridge** (stderr):
```
HTTP MCP Bridge running (https://dev.drondoc.ru/api/mcp/integram)
Error listing tools: <error message>
Error executing tool: <error message>
```

**Backend Orchestrator** (pino logs):
```json
{"level":"info","msg":"Integram tool execution failed","toolName":"...","error":"..."}
{"level":"info","msg":"SSE MCP client connected from claude.ai"}
```

**MCP Server** (stderr):
```
Integram MCP Server running on stdio
```

### Health Checks

**Backend Health**: `GET /api/health`
```json
{
  "status": "healthy",
  "uptime": 12345.67,
  "coordinator": "running"
}
```

**MCP Tools Available**: `GET /api/mcp/integram/tools`
```json
{
  "success": true,
  "count": 27
}
```

### Metrics to Track

- Request latency (HTTP bridge → backend)
- Tool execution success rate
- Authentication success rate
- Number of concurrent MCP servers
- Memory usage per component
- Error rate by tool

## Future Improvements

### Short Term

1. **Session Persistence**
   - Store Integram sessions in Redis
   - Reuse sessions across tool calls
   - Reduce authentication overhead

2. **Connection Pooling**
   - Maintain persistent connections to Integram API
   - Reduce latency for repeated calls
   - Lower load on Integram API

3. **Better SSL**
   - Use Let's Encrypt for dev.drondoc.ru
   - Enable SSL verification
   - Improve security

### Long Term

1. **WebSocket Bridge**
   - Replace HTTP with WebSocket for bridge
   - Reduce latency with persistent connection
   - Enable server-push capabilities

2. **Distributed Sessions**
   - Redis-based session storage
   - Support multiple backend instances
   - Enable horizontal scaling

3. **Advanced Monitoring**
   - OpenTelemetry integration
   - Distributed tracing
   - Real-time metrics dashboard

4. **Caching Layer**
   - Cache type metadata
   - Cache dictionary/reference data
   - Reduce Integram API load

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [HTTP MCP Usage Guide](./HTTP_MCP_USAGE.md)
- [Integram MCP README](./INTEGRAM_MCP_README.md)
- [Claude Code Setup](./CLAUDE_CODE_SETUP.md)
- [Backend Orchestrator API](../../api/routes/mcp.js)
