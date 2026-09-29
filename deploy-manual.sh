#!/bin/bash
# Manual Deployment Script for Integram Standalone
# Запустите этот скрипт на сервере YOUR_SERVER_IP

set -e

echo "🚀 Starting manual deployment..."

# Переменные
DEPLOY_DIR="/var/www/integram-standalone"
REPO_URL="https://github.com/unidel2035/integram-standalone.git"
BRANCH="master"

# Проверка директории
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "❌ Directory $DEPLOY_DIR does not exist!"
    echo "Creating directory and cloning repository..."
    mkdir -p $DEPLOY_DIR
    git clone -b $BRANCH $REPO_URL $DEPLOY_DIR
fi

cd $DEPLOY_DIR

echo "📥 Pulling latest changes from $BRANCH..."
git fetch origin
git reset --hard origin/$BRANCH

echo "📦 Installing frontend dependencies..."
npm ci

echo "🔨 Building frontend..."
npm run build

echo "📦 Installing backend dependencies..."
cd backend/monolith
npm ci

echo "🔄 Restarting service..."
if systemctl is-active --quiet integram-standalone; then
    sudo systemctl restart integram-standalone
    echo "✅ Service restarted successfully"
else
    echo "⚠️  Service integram-standalone is not running or doesn't exist"
    echo "You may need to start it manually or configure systemd service"
fi

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Summary:"
echo "   - Repository: $REPO_URL"
echo "   - Branch: $BRANCH"
echo "   - Deployment directory: $DEPLOY_DIR"
echo "   - Latest commit: $(git log -1 --format='%h - %s')"
