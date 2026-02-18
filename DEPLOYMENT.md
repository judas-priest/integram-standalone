# Deployment Guide

## 🚀 Развертывание Integram Standalone

> 📖 **Подробная документация по backend:**
> - [Полное руководство по развёртыванию backend](docs/BACKEND_DEPLOYMENT.md)
> - [План компонентизации backend](docs/BACKEND_COMPONENTIZATION_PLAN.md)
> - [API документация](docs/API_DOCUMENTATION.md)

---

## 📋 Содержание

1. [Быстрый старт](#вариант-1-локальный-запуск-development)
2. [Production развёртывание](#вариант-2-production-сборка)
3. [Конфигурация .env](#-полная-конфигурация-env)
4. [Настройки безопасности](#-настройки-безопасности)
5. [Мониторинг](#-мониторинг)
6. [Troubleshooting](#-troubleshooting)

---

### Вариант 1: Локальный запуск (Development)

#### Требования
- Node.js 18+ или 20+
- npm 9+

#### Шаги

1. **Клонирование репозитория**
```bash
git clone https://github.com/unidel2035/integram-standalone.git
cd integram-standalone
```

2. **Установка зависимостей**
```bash
# Frontend
npm install

# Backend
cd backend/monolith
npm install
cd ../..
```

3. **Настройка окружения**
```bash
# Корневой .env уже создан
# Настройте backend/.env при необходимости
```

4. **Запуск**
```bash
# Terminal 1 - Frontend
npm run dev
# Откроется на http://localhost:5173

# Terminal 2 - Backend
cd backend/monolith
npm run dev
# Запустится на http://localhost:3000
```

### Вариант 2: Production сборка

```bash
# Сборка frontend
npm run build

# Запуск backend в production режиме
cd backend/monolith
npm start
```

Статические файлы будут в `dist/`, backend обслуживает их на порту 3000.

### Вариант 3: Docker (рекомендуется для production)

#### Требования
- Docker 20+
- Docker Compose 2+

#### Запуск через Docker Compose

```bash
# Создайте .env.production с настройками
cat > .env.production << 'EOF'
INTEGRAM_URL=https://example.integram.io
INTEGRAM_DEFAULT_DB=my
INTEGRAM_SYSTEM_USERNAME=your_username
INTEGRAM_SYSTEM_PASSWORD=your_secure_password
SESSION_SECRET=your-super-secret-key-change-this
CORS_ORIGIN=https://yourdomain.com
EOF

# Запуск
docker-compose up -d

# Проверка логов
docker-compose logs -f

# Остановка
docker-compose down
```

#### Сборка Docker образа вручную

```bash
# Сборка
docker build -t integram-standalone:latest .

# Запуск
docker run -d \
  --name integram-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e INTEGRAM_URL=https://example.integram.io \
  integram-standalone:latest

# Проверка
docker logs -f integram-app
```

### Вариант 4: PM2 (для серверов Linux)

```bash
# Установка PM2
npm install -g pm2

# Создание ecosystem файла
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'integram-backend',
    script: 'backend/monolith/src/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
EOF

# Запуск
pm2 start ecosystem.config.js

# Автозапуск при перезагрузке
pm2 startup
pm2 save

# Мониторинг
pm2 monit
```

### Вариант 5: Nginx + PM2

#### 1. Настройка PM2 (как выше)

#### 2. Настройка Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Статические файлы frontend
    location / {
        root /path/to/integram-standalone/dist;
        try_files $uri $uri/ /index.html;
    }

    # Проксирование API запросов
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### 3. Включение конфигурации

```bash
sudo ln -s /etc/nginx/sites-available/integram /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Вариант 6: Systemd Service

```bash
# Создание systemd service
sudo cat > /etc/systemd/system/integram.service << 'EOF'
[Unit]
Description=Integram Standalone Application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/integram-standalone/backend/monolith
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node src/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Запуск
sudo systemctl daemon-reload
sudo systemctl enable integram
sudo systemctl start integram

# Проверка
sudo systemctl status integram
```

## 🔒 Настройки безопасности

### 1. Переменные окружения

**Обязательно измените:**
- `SESSION_SECRET` - уникальный секретный ключ
- `INTEGRAM_SYSTEM_PASSWORD` - реальный пароль
- `CORS_ORIGIN` - ваш домен

### 2. Firewall

```bash
# Разрешить только необходимые порты
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 3. SSL/TLS (Let's Encrypt)

```bash
# Установка certbot
sudo apt install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d yourdomain.com

# Автообновление
sudo certbot renew --dry-run
```

## 📊 Мониторинг

### Health Check

```bash
curl http://localhost:3000/health
```

### Логи

```bash
# Docker
docker-compose logs -f

# PM2
pm2 logs integram-backend

# Systemd
sudo journalctl -u integram -f
```

## 🔧 Обновление

### Git Pull

```bash
git pull origin master
npm install
cd backend/monolith && npm install
npm run build
pm2 restart integram-backend
```

### Docker

```bash
docker-compose down
git pull origin master
docker-compose build
docker-compose up -d
```

## 🆘 Troubleshooting

### Проблема: Backend не запускается

**Решение:**
1. Проверьте .env файлы
2. Убедитесь, что порт 3000 свободен: `sudo lsof -i :3000`
3. Проверьте логи: `pm2 logs` или `docker logs`

### Проблема: Frontend не подключается к backend

**Решение:**
1. Проверьте CORS настройки
2. Убедитесь, что `VITE_API_URL` указывает на правильный адрес
3. Проверьте firewall правила

### Проблема: WebSocket соединение не работает

**Решение:**
1. Убедитесь, что Nginx проксирует WebSocket
2. Проверьте `proxy_set_header Upgrade` в Nginx config
3. Проверьте логи Socket.io на backend

## 🔧 Полная конфигурация .env

Ниже приведены все доступные переменные окружения для backend.

> 📖 **Подробное описание каждой переменной:** [docs/BACKEND_DEPLOYMENT.md](docs/BACKEND_DEPLOYMENT.md#настройка-окружения-env)

### Основные настройки

```env
# Сервер
PORT=8081
HOST=0.0.0.0
NODE_ENV=production

# HTTPS (отключите если за Nginx)
HTTPS_ENABLED=false
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
```

### База данных PostgreSQL

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=integram
DB_USER=integram
DB_PASSWORD=your_secure_password
```

### Аутентификация

```env
# JWT (сгенерируйте: node scripts/generate-jwt-secret.js)
JWT_SECRET=your-256-bit-jwt-secret-key
SESSION_SECRET=your-session-secret

# Время жизни токенов
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# Bcrypt rounds
BCRYPT_ROUNDS=10
```

### Integram API

```env
INTEGRAM_API_BASE_URL=https://example.integram.io
INTEGRAM_AUTH_TOKEN=your-integram-auth-token
INTEGRAM_REGISTRATION_USERNAME=your_registration_username
INTEGRAM_REGISTRATION_PASSWORD=your_secure_password
```

### AI провайдеры

```env
# Минимум один ключ для работы AI чата
POLZA_AI_API_KEY=your-polza-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
```

### Email (SMTP)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@example.integram.io
FROM_NAME=Integram Platform
FRONTEND_URL=https://example.integram.io
```

### Файловое хранилище

```env
UPLOAD_DIR=/var/integram/uploads
DATA_DIR=/var/integram/data
TEMP_DIR=/var/integram/temp
WORKSPACE_ROOT=/var/lib/integram/workspaces
```

### CORS и Rate Limiting

```env
CORS_ORIGIN=http://localhost:5173,https://example.integram.io
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

### Логирование

```env
LOG_LEVEL=info
LOG_FILE=/var/log/integram/backend.log
```

---

## 📚 Дополнительные ресурсы

- [GitHub Repository](https://github.com/unidel2035/integram-standalone)
- [README.md](README.md) - Общая документация
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Детали реализации
- [docs/BACKEND_DEPLOYMENT.md](docs/BACKEND_DEPLOYMENT.md) - Полное руководство по backend
- [docs/BACKEND_COMPONENTIZATION_PLAN.md](docs/BACKEND_COMPONENTIZATION_PLAN.md) - План компонентизации
- [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) - API документация
- [backend/monolith/.env.example](backend/monolith/.env.example) - Пример конфигурации
