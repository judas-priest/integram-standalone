# Backend Node.js - Руководство по развёртыванию

## Содержание

1. [Обзор](#обзор)
2. [Требования к системе](#требования-к-системе)
3. [Быстрый старт](#быстрый-старт)
4. [Настройка окружения (.env)](#настройка-окружения-env)
5. [Подключение базы данных](#подключение-базы-данных)
6. [Запуск сервера](#запуск-сервера)
7. [Production развёртывание](#production-развёртывание)
8. [Мониторинг и Health Checks](#мониторинг-и-health-checks)
9. [Troubleshooting](#troubleshooting)

---

## Обзор

Backend Node.js - это современная реализация серверной части Integram, построенная на Express.js. Система обеспечивает полную обратную совместимость с существующим PHP монолитом.

### Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway (Express.js)               │
│           (Routes, Authentication, Rate Limiting)           │
└───────────────────────────┬─────────────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    ▼                       ▼                       ▼
┌─────────┐           ┌──────────┐            ┌─────────┐
│  Auth   │           │  Core    │            │ Business│
│ Service │           │  Data    │            │ Services│
│         │           │  Service │            │         │
└─────────┘           └──────────┘            └─────────┘
    │                       │                       │
    └───────────────────────┼───────────────────────┘
                            ▼
                    ┌───────────────┐
                    │ MySQL/MariaDB │
                    │   Database    │
                    └───────────────┘
```

### Ключевые компоненты

| Компонент | Описание |
|-----------|----------|
| `src/index.js` | Главная точка входа, инициализация сервера |
| `src/api/routes/` | 150+ API эндпоинтов |
| `src/services/` | 95+ сервисов бизнес-логики |
| `src/core/` | Ядро: TaskQueue, AgentRegistry, Coordinator |
| `src/middleware/` | Middleware безопасности и аутентификации |
| `src/api/v2/` | Современный API v2 с JSON:API форматом |

---

## Требования к системе

### Минимальные требования

| Компонент | Минимум | Рекомендовано |
|-----------|---------|---------------|
| Node.js | 18.x | 20.x LTS |
| npm | 9.x | 10.x |
| RAM | 1 GB | 2-4 GB |
| Disk | 500 MB | 2 GB |
| MySQL/MariaDB | 8.0+ / 10.5+ | 8.0+ / 10.6+ |

### Опциональные зависимости

- **Redis** - для кэширования и очередей задач
- **Nginx** - для reverse proxy и SSL termination
- **PM2** - для process management в production
- **Docker** - для контейнеризации

---

## Быстрый старт

### 1. Клонирование репозитория

```bash
git clone https://github.com/unidel2035/integram-standalone.git
cd integram-standalone
```

### 2. Установка зависимостей

#### Вариант A: С использованием Bun (рекомендуется)

```bash
cd backend/monolith

# Полное развёртывание одной командой
./scripts/deploy-bun.sh --install-only

# Или установка вручную
bun install
```

#### Вариант B: С использованием npm

```bash
cd backend/monolith
npm install
```

### 3. Настройка окружения

```bash
# Копирование примера конфигурации
cp .env.example .env

# Редактирование настроек
nano .env
```

### 4. Запуск в режиме разработки

#### С Bun (быстрее)
```bash
bun run dev
# или
./scripts/deploy-bun.sh --dev
```

#### С Node.js
```bash
npm run dev
```

Сервер будет доступен по адресу: `http://localhost:8081`

---

## Настройка окружения (.env)

### Основные настройки сервера

```env
# Порт сервера (по умолчанию 8081)
PORT=8081

# Хост для биндинга (0.0.0.0 для всех интерфейсов)
HOST=0.0.0.0

# Режим работы: development, production, test
NODE_ENV=production
```

### HTTPS конфигурация

```env
# ⚠️ ВАЖНО: Включайте HTTPS только если backend НЕ за Nginx
# Рекомендуется использовать Nginx для SSL termination

# Включить/выключить HTTPS
HTTPS_ENABLED=false

# Пути к SSL сертификатам (только если HTTPS_ENABLED=true)
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
```

### Настройки базы данных

```env
# PostgreSQL соединение
DATABASE_URL=postgresql://user:password@localhost:5432/integram

# Или отдельные параметры
DB_HOST=localhost
DB_PORT=5432
DB_NAME=integram
DB_USER=integram
DB_PASSWORD=your_secure_password
```

### Аутентификация и безопасность

```env
# JWT секретный ключ (минимум 64 символа)
# Генерация: node scripts/generate-jwt-secret.js
JWT_SECRET=your-256-bit-jwt-secret-key-change-this

# Секрет сессий Express
SESSION_SECRET=your-session-secret-change-this

# Время жизни токенов
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# Bcrypt rounds для хэширования паролей
BCRYPT_ROUNDS=10
```

### Интеграция с Integram API

```env
# URL основного Integram сервера
INTEGRAM_API_BASE_URL=https://example.integram.io

# Токен авторизации
INTEGRAM_AUTH_TOKEN=your-integram-auth-token

# Учётные данные для регистрации пользователей
INTEGRAM_REGISTRATION_USERNAME=your_registration_username
INTEGRAM_REGISTRATION_PASSWORD=your_secure_password
```

### AI провайдеры

```env
# Минимум один ключ должен быть установлен для работы AI чата
# Приоритет: POLZA > DEEPSEEK > ANTHROPIC > OPENAI

POLZA_AI_API_KEY=your-polza-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
```

### Email (SMTP)

```env
# SMTP сервер
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false  # true для порта 465
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-app-password

# От кого отправлять письма
FROM_EMAIL=noreply@example.integram.io
FROM_NAME=Integram Platform

# URL для ссылок в письмах
FRONTEND_URL=https://example.integram.io
```

### Файловое хранилище

```env
# Директории для файлов
UPLOAD_DIR=/var/integram/uploads
DATA_DIR=/var/integram/data
TEMP_DIR=/var/integram/temp

# Директория для AI workspaces
# ⚠️ ВАЖНО: Используйте абсолютный путь вне кодовой базы!
WORKSPACE_ROOT=/var/lib/integram/workspaces
```

### CORS

```env
# Разрешённые источники (через запятую)
CORS_ORIGIN=http://localhost:5173,https://example.integram.io
```

### Логирование

```env
# Уровень логирования: debug, info, warn, error
LOG_LEVEL=info

# Файл логов
LOG_FILE=/var/log/integram/backend.log

# Отключение логов (только для production с внешним сборщиком логов!)
# DISABLE_LOGGING=false
```

---

## Подключение базы данных

### MySQL / MariaDB

Backend использует MySQL/MariaDB как основную базу данных (совместимо с PHP-монолитом).

> **Примечание**: Minimal-сервер (`index-minimal.js`) автоматически подключается к базе данных при старте, если настроены переменные окружения. Если база недоступна, сервер работает в mock-режиме.

#### 1. Создание базы данных

```bash
# Подключение к MySQL
mysql -u root -p

# Создание пользователя и базы
CREATE DATABASE integram CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'integram'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON integram.* TO 'integram'@'localhost';
FLUSH PRIVILEGES;

# Выход
\q
```

> **Важно**: Для каждой организации/базы (например, `a2025`, `mycompany`) создаётся отдельная таблица с именем базы. Таблица имеет структуру EAV (Entity-Attribute-Value): `id`, `up` (parent), `ord` (order), `t` (type), `val` (value).

#### 2. Проверка соединения

```bash
mysql -h localhost -u integram -p integram -e "SELECT 1;"
```

#### 3. Настройка .env

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=integram
DB_PASSWORD=your_secure_password
DB_CHARSET=utf8mb4

# Аутентификация
AUTH_SALT=DronedocSalt2025
AUTH_COOKIE_EXPIRE=2592000
```

#### 4. Режимы работы

| Режим | Условие | Поведение |
|-------|---------|-----------|
| **Real Auth** | DB_HOST, DB_USER настроены, база доступна | Реальная аутентификация против MySQL |
| **Mock Auth** | База недоступна или не настроена | Возвращает mock-токены (для разработки) |

При запуске сервер выводит статус подключения:
```
📦 Database: Connected to localhost
```
или
```
📦 Database: Not connected (mock mode)
```

### Integram Database Service

Backend также использует встроенную абстракцию базы данных для организаций:

- **Phase 0 (текущая)**: JSON-файлы в `backend/monolith/data/integram/{org_id}/tables/`
- **Phase 1 (планируется)**: HTTP API к PostgreSQL

Структура таблиц описана в `backend/monolith/src/database/integram/README.md`.

---

## Запуск сервера

### Режим разработки

```bash
cd backend/monolith
npm run dev
```

Особенности:
- Hot reload при изменении файлов
- Подробное логирование
- Source maps для отладки

### Production режим

```bash
cd backend/monolith
npm start
```

### С увеличенной памятью

```bash
# Для больших нагрузок (4GB)
npm run start:high-mem
```

---

## Production развёртывание

### Вариант 0: Bun (быстрая установка)

Bun — это высокопроизводительный JavaScript runtime, совместимый с Node.js.
Используйте скрипт развёртывания для быстрой установки:

```bash
cd backend/monolith

# Полное развёртывание (установка + запуск)
./scripts/deploy-bun.sh

# Только установка зависимостей
./scripts/deploy-bun.sh --install-only

# Режим разработки с hot reload
./scripts/deploy-bun.sh --dev

# Production с PM2
./scripts/deploy-bun.sh --pm2
```

#### Команды Bun

| Команда | Описание |
|---------|----------|
| `bun run bun:deploy` | Полное развёртывание |
| `bun run bun:deploy:dev` | Развёртывание в dev режиме |
| `bun run bun:deploy:install` | Только установка зависимостей |
| `bun run bun:deploy:pm2` | Развёртывание с PM2 |
| `bun run bun:start` | Запуск сервера с Bun |
| `bun run bun:dev` | Dev режим с watch |

#### Преимущества Bun

- **Быстрая установка**: в 3-10 раз быстрее npm
- **Быстрый запуск**: меньше времени на холодный старт
- **Совместимость**: работает с существующим кодом Node.js
- **Автоустановка**: скрипт автоматически установит Bun, если его нет

### Вариант 1: PM2 (рекомендуется)

```bash
# Установка PM2
npm install -g pm2

# Запуск
cd backend/monolith
pm2 start ecosystem.config.js

# Автозапуск при перезагрузке
pm2 startup
pm2 save

# Мониторинг
pm2 monit
pm2 logs
```

### Вариант 2: Systemd

```bash
# Создание service файла
sudo cat > /etc/systemd/system/integram-backend.service << 'EOF'
[Unit]
Description=Integram Backend Node.js Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/integram/backend/monolith
Environment="NODE_ENV=production"
Environment="PORT=8081"
ExecStart=/usr/bin/node --max-old-space-size=2048 src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Запуск
sudo systemctl daemon-reload
sudo systemctl enable integram-backend
sudo systemctl start integram-backend

# Проверка статуса
sudo systemctl status integram-backend
```

### Вариант 3: Docker

```bash
# Сборка образа
docker build -t integram-backend:latest -f Dockerfile.backend .

# Запуск контейнера
docker run -d \
  --name integram-backend \
  -p 8081:8081 \
  -e NODE_ENV=production \
  -e DB_HOST=host.docker.internal \
  -v /var/integram:/var/integram \
  integram-backend:latest
```

### Nginx Reverse Proxy

```nginx
upstream integram_backend {
    server 127.0.0.1:8081;
    keepalive 64;
}

server {
    listen 80;
    server_name api.example.integram.io;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.integram.io;

    ssl_certificate /etc/letsencrypt/live/example.integram.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.integram.io/privkey.pem;

    # Проксирование API запросов
    location / {
        proxy_pass http://integram_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://integram_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Мониторинг и Health Checks

### Health Check Endpoint

```bash
# Базовая проверка
curl http://localhost:8081/health

# Подробная информация
curl http://localhost:8081/api/health
```

### Основные метрики

| Endpoint | Описание |
|----------|----------|
| `GET /health` | Простая проверка работоспособности |
| `GET /api/health` | Детальный статус всех сервисов |
| `GET /api/deployment-info` | Информация о развёртывании |
| `GET /api/system-resources` | Использование ресурсов |

### Логирование

```bash
# PM2 логи
pm2 logs integram-backend

# Systemd логи
sudo journalctl -u integram-backend -f

# Docker логи
docker logs -f integram-backend
```

---

## Troubleshooting

### Проблема: Сервер не запускается

**Решение:**
1. Проверьте .env файл:
   ```bash
   npm run verify-env
   ```

2. Проверьте занятость порта:
   ```bash
   sudo lsof -i :8081
   ```

3. Проверьте логи:
   ```bash
   npm start 2>&1 | head -50
   ```

### Проблема: Ошибка подключения к БД

**Решение:**
1. Проверьте PostgreSQL:
   ```bash
   sudo systemctl status postgresql
   ```

2. Проверьте соединение:
   ```bash
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"
   ```

3. Проверьте настройки в `.env`

### Проблема: Out of Memory

**Решение:**
1. Увеличьте лимит памяти:
   ```bash
   npm run start:high-mem
   ```

2. Или в PM2:
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'integram-backend',
       script: 'src/index.js',
       node_args: '--max-old-space-size=4096'
     }]
   };
   ```

### Проблема: SSL_ERROR_RX_RECORD_TOO_LONG

**Причина:** Попытка обратиться по HTTPS к HTTP порту

**Решение:**
- Если используете Nginx: установите `HTTPS_ENABLED=false`
- Если прямое HTTPS: проверьте пути к сертификатам

### Проблема: AI чат не работает

**Решение:**
Проверьте наличие хотя бы одного AI API ключа:
```bash
grep -E "(POLZA|DEEPSEEK|ANTHROPIC|OPENAI)_API_KEY" .env
```

---

## API Документация

### Основные эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/login` | Авторизация |
| POST | `/api/auth/register` | Регистрация |
| GET | `/api/v2/integram/databases/{db}/types/{type}/objects` | Получение объектов |
| POST | `/api/v2/integram/databases/{db}/objects` | Создание объекта |
| GET | `/api/organizations` | Список организаций |
| GET | `/api/health` | Health check |

### Swagger документация

Доступна по адресу: `http://localhost:8081/api/docs`

---

## Обновление

### Git Pull

```bash
# Остановка сервера
pm2 stop integram-backend

# Обновление кода
git pull origin master

# Обновление зависимостей
cd backend/monolith && npm install

# Перезапуск
pm2 restart integram-backend
```

### Docker

```bash
docker-compose down
git pull origin master
docker-compose build
docker-compose up -d
```

---

## Связанные документы

- [DEPLOYMENT.md](../DEPLOYMENT.md) - Общее руководство по развёртыванию
- [BACKEND_COMPONENTIZATION_PLAN.md](BACKEND_COMPONENTIZATION_PLAN.md) - План компонентизации
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) - API документация
- [README.md](../backend/monolith/README.md) - README backend

---

**Версия:** 1.0
**Последнее обновление:** Февраль 2026
**Issue:** [#121](https://github.com/unidel2035/integram-standalone/issues/121)
