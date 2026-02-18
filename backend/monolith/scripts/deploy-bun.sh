#!/bin/bash
###############################################################################
# DronDoc Monolithic Backend - Bun Deployment Script
#
# This script deploys the backend using Bun runtime:
# 1. Checks prerequisites (Bun, Node.js compatibility)
# 2. Sets up log directories
# 3. Installs dependencies with Bun
# 4. Validates environment configuration
# 5. Starts the backend server
#
# Usage:
#   ./scripts/deploy-bun.sh [options]
#
# Options:
#   --install-only    Only install dependencies, don't start server
#   --dev             Run in development mode with watch
#   --production      Run in production mode (default)
#   --pm2             Use PM2 for process management with Bun
#   --help            Show this help message
#
# Examples:
#   ./scripts/deploy-bun.sh                    # Full deployment in production
#   ./scripts/deploy-bun.sh --install-only     # Only install deps
#   ./scripts/deploy-bun.sh --dev              # Development mode with watch
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
INSTALL_ONLY=false
DEV_MODE=false
USE_PM2=false
SHOW_HELP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --install-only)
            INSTALL_ONLY=true
            shift
            ;;
        --dev)
            DEV_MODE=true
            shift
            ;;
        --production)
            DEV_MODE=false
            shift
            ;;
        --pm2)
            USE_PM2=true
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown option: $1"
            exit 1
            ;;
    esac
done

# Show help if requested
if [ "$SHOW_HELP" = true ]; then
    head -30 "$0" | tail -25
    exit 0
fi

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     DronDoc Monolithic Backend - Bun Deployment Script         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Determine script and backend directories
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if we're running from scripts directory or backend directory
if [[ "$SCRIPT_DIR" == */scripts ]]; then
    BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
else
    # Running from current directory (backend/monolith)
    BACKEND_DIR="$(pwd)"
fi

# Validate we're in the right directory
if [ ! -f "$BACKEND_DIR/package.json" ]; then
    # Try current directory
    if [ -f "package.json" ]; then
        BACKEND_DIR="$(pwd)"
    else
        echo -e "${RED}[ERROR]${NC} Cannot find package.json. Please run this script from backend/monolith directory"
        exit 1
    fi
fi

cd "$BACKEND_DIR"

echo -e "${YELLOW}[INFO]${NC} Backend directory: $BACKEND_DIR"
echo -e "${YELLOW}[INFO]${NC} Mode: $([ "$DEV_MODE" = true ] && echo 'development' || echo 'production')"
echo ""

###############################################################################
# 1. Check Prerequisites
###############################################################################

echo -e "${BLUE}[STEP 1/6]${NC} Checking prerequisites..."

# Check if Bun is installed
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}[OK]${NC} Bun found: v$BUN_VERSION"
else
    echo -e "${YELLOW}[INFO]${NC} Bun is not installed. Installing Bun..."

    # Install Bun
    curl -fsSL https://bun.sh/install | bash

    # Add to PATH for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    # Verify installation
    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun --version)
        echo -e "${GREEN}[OK]${NC} Bun installed: v$BUN_VERSION"
        echo -e "${YELLOW}[INFO]${NC} Please add the following to your shell profile (~/.bashrc or ~/.zshrc):"
        echo '  export BUN_INSTALL="$HOME/.bun"'
        echo '  export PATH="$BUN_INSTALL/bin:$PATH"'
    else
        echo -e "${RED}[ERROR]${NC} Failed to install Bun"
        exit 1
    fi
fi

# Check Node.js (needed for some native modules)
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}[OK]${NC} Node.js found: $NODE_VERSION (for native modules compatibility)"
else
    echo -e "${YELLOW}[WARN]${NC} Node.js not found. Some native modules may not work."
fi

echo ""

###############################################################################
# 2. Validate Directory Structure
###############################################################################

echo -e "${BLUE}[STEP 2/6]${NC} Validating directory structure..."

if [ ! -f "package.json" ]; then
    echo -e "${RED}[ERROR]${NC} package.json not found in $BACKEND_DIR"
    exit 1
fi

if [ ! -f "src/index-minimal.js" ]; then
    echo -e "${RED}[ERROR]${NC} src/index-minimal.js not found"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Directory structure validated"
echo ""

###############################################################################
# 3. Create Required Directories
###############################################################################

echo -e "${BLUE}[STEP 3/6]${NC} Setting up directories..."

# Create log directory if possible (may need sudo)
if [ ! -d "/var/log/dronedoc" ]; then
    if [ -w "/var/log" ] || [ "$EUID" -eq 0 ]; then
        mkdir -p /var/log/dronedoc
        echo -e "${GREEN}[OK]${NC} Created /var/log/dronedoc"
    else
        echo -e "${YELLOW}[INFO]${NC} Cannot create /var/log/dronedoc (need sudo). Logs will use local directory."
        mkdir -p logs
    fi
fi

# Create data directories
mkdir -p data/integram
mkdir -p data/uploads
mkdir -p data/temp

echo -e "${GREEN}[OK]${NC} Directories ready"
echo ""

###############################################################################
# 4. Install Dependencies
###############################################################################

echo -e "${BLUE}[STEP 4/6]${NC} Installing dependencies with Bun..."

# Remove existing node_modules if switching from npm
if [ -f "node_modules/.package-lock.json" ]; then
    echo -e "${YELLOW}[INFO]${NC} Detected npm node_modules, cleaning for Bun..."
    rm -rf node_modules
fi

# Install dependencies with Bun
if [ "$DEV_MODE" = true ]; then
    bun install
else
    bun install --production
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Failed to install dependencies"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Dependencies installed"
echo ""

###############################################################################
# 5. Validate Environment Configuration
###############################################################################

echo -e "${BLUE}[STEP 5/6]${NC} Checking environment configuration..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[WARN]${NC} .env file not found"

    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}[INFO]${NC} Creating .env from .env.example..."
        cp .env.example .env
        echo -e "${YELLOW}[IMPORTANT]${NC} Please edit .env file and add your API keys and secrets"
    else
        echo -e "${YELLOW}[WARN]${NC} .env.example not found, skipping..."
    fi
else
    echo -e "${GREEN}[OK]${NC} .env file found"
fi

# Run environment validation if script exists
if [ -f "scripts/verify-env.js" ]; then
    echo -e "${YELLOW}[INFO]${NC} Running environment validation..."
    bun run scripts/verify-env.js 2>/dev/null || echo -e "${YELLOW}[WARN]${NC} Environment validation had warnings"
fi

echo ""

###############################################################################
# 6. Start Server (unless --install-only)
###############################################################################

if [ "$INSTALL_ONLY" = true ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                Installation Complete!                          ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}To start the server:${NC}"
    echo "  Development:  bun run dev"
    echo "  Production:   bun run src/index-minimal.js"
    echo "  PM2:          bun run pm2:start"
    echo ""
    exit 0
fi

echo -e "${BLUE}[STEP 6/6]${NC} Starting server..."

if [ "$USE_PM2" = true ]; then
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}[INFO]${NC} Installing PM2..."
        bun add -g pm2 || npm install -g pm2
    fi

    # Stop existing instance
    pm2 stop dronedoc-monolith 2>/dev/null || true
    pm2 delete dronedoc-monolith 2>/dev/null || true

    # Start with PM2 using Bun
    if [ -f "ecosystem.config.cjs" ]; then
        pm2 start ecosystem.config.cjs --interpreter ~/.bun/bin/bun
    else
        pm2 start src/index-minimal.js --name dronedoc-monolith --interpreter ~/.bun/bin/bun
    fi

    pm2 save

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                   Deployment Successful!                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    pm2 status
else
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                   Starting Server...                           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ "$DEV_MODE" = true ]; then
        echo -e "${YELLOW}[INFO]${NC} Starting in development mode with watch..."
        echo -e "${YELLOW}[INFO]${NC} Press Ctrl+C to stop"
        echo ""
        bun --watch run src/index-minimal.js
    else
        echo -e "${YELLOW}[INFO]${NC} Starting in production mode..."
        echo -e "${YELLOW}[INFO]${NC} Press Ctrl+C to stop"
        echo ""
        bun run src/index-minimal.js
    fi
fi
