#!/bin/bash

# Integram Standalone - Server Setup Script
# Автоматическая установка всех зависимостей и настройка сервера

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Конфигурация
SERVER_IP="YOUR_SERVER_IP"
DEPLOY_DIR="/var/www/integram-standalone"
NODE_VERSION="20"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║   Integram Standalone - Server Setup Script          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
   echo -e "${RED}Please run as root (sudo)${NC}"
   exit 1
fi

echo -e "${GREEN}Step 1/8: Updating system packages...${NC}"
apt update
apt upgrade -y

echo -e "${GREEN}Step 2/8: Installing Node.js ${NODE_VERSION}.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
fi
echo -e "Node.js version: ${YELLOW}$(node --version)${NC}"
echo -e "npm version: ${YELLOW}$(npm --version)${NC}"

echo -e "${GREEN}Step 3/8: Installing Git...${NC}"
apt install -y git
echo -e "Git version: ${YELLOW}$(git --version)${NC}"

echo -e "${GREEN}Step 4/8: Installing Nginx...${NC}"
apt install -y nginx
systemctl enable nginx
systemctl start nginx
echo -e "Nginx version: ${YELLOW}$(nginx -v 2>&1)${NC}"

echo -e "${GREEN}Step 5/8: Installing PM2 (optional)...${NC}"
npm install -g pm2
pm2 startup systemd -u root --hp /root
echo -e "PM2 version: ${YELLOW}$(pm2 --version)${NC}"

echo -e "${GREEN}Step 6/8: Creating deployment directory...${NC}"
mkdir -p $DEPLOY_DIR
chown -R www-data:www-data $DEPLOY_DIR
echo -e "Deploy directory: ${YELLOW}$DEPLOY_DIR${NC}"

echo -e "${GREEN}Step 7/8: Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 3000/tcp
    echo "y" | ufw enable || true
    ufw status
fi

echo -e "${GREEN}Step 8/8: Generating SSH key for GitHub Actions...${NC}"
if [ ! -f ~/.ssh/deploy_key ]; then
    ssh-keygen -t ed25519 -C "deploy@integram-standalone" -f ~/.ssh/deploy_key -N ""
    cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    chmod 700 ~/.ssh

    echo -e "${YELLOW}"
    echo "════════════════════════════════════════════════════"
    echo "  SSH Deploy Key (add to GitHub Secrets):"
    echo "════════════════════════════════════════════════════"
    echo -e "${NC}"
    cat ~/.ssh/deploy_key
    echo -e "${YELLOW}"
    echo "════════════════════════════════════════════════════"
    echo -e "${NC}"
else
    echo -e "${YELLOW}SSH key already exists at ~/.ssh/deploy_key${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ Server Setup Complete!                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "${YELLOW}1. Configure GitHub Secrets:${NC}"
echo "   Go to: https://github.com/unidel2035/integram-standalone/settings/secrets/actions"
echo "   Add secrets:"
echo "   - DEPLOY_HOST: ${SERVER_IP}"
echo "   - DEPLOY_USER: root"
echo "   - DEPLOY_SSH_KEY: <copy from above>"
echo ""
echo -e "${YELLOW}2. Download and run deploy script:${NC}"
echo "   wget https://raw.githubusercontent.com/unidel2035/integram-standalone/master/deploy.sh"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh master"
echo ""
echo -e "${YELLOW}3. Setup systemd service:${NC}"
echo "   wget -O /etc/systemd/system/integram-standalone.service \\"
echo "     https://raw.githubusercontent.com/unidel2035/integram-standalone/master/integram-standalone.service"
echo "   systemctl daemon-reload"
echo "   systemctl enable integram-standalone"
echo "   systemctl start integram-standalone"
echo ""
echo -e "${YELLOW}4. Configure Nginx:${NC}"
echo "   wget -O /etc/nginx/sites-available/integram-standalone \\"
echo "     https://raw.githubusercontent.com/unidel2035/integram-standalone/master/nginx.conf"
echo "   ln -s /etc/nginx/sites-available/integram-standalone /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo -e "${GREEN}Server is ready for deployment!${NC}"
echo -e "IP: ${YELLOW}${SERVER_IP}${NC}"
echo ""
