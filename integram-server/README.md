# Integram Server (интеграм.рф)

**Production server:** YOUR_SERVER_IP
**Domain:** https://интеграм.рф (xn--80afflxcxn.xn--p1ai)
**Synced:** 2025-12-26 22:19 MSK

## 🚀 Быстрый запуск с Docker

```bash
# Запустить всё одной командой
cd integram-server/
docker-compose up -d

# Или использовать скрипт
./quick-start.sh
```

**Приложение доступно на:**
- HTTP: http://localhost:8080
- HTTPS: https://localhost:8443

**Подробная документация:** [DOCKER.md](DOCKER.md)

## Описание

Это производственный код PHP Integram приложения с сервера YOUR_SERVER_IP.

Код синхронизирован с сервера `/var/www/html/` в git репозиторий для централизованного управления версиями.

## Структура

```
integram-server/
├── index.php              # Main PHP application
├── db.php                 # Database API (466KB)
├── auth.php               # Authentication
├── login.html             # Login page
├── index.html             # Alternative HTML interface
├── .htaccess              # URL routing rules
├── upload.php             # File upload handler
│
├── app/                   # Vue.js SPA
│   ├── index.html
│   ├── assets/
│   └── meta/
│
├── css/                   # Stylesheets
├── js/                    # JavaScript files
├── fonts/                 # Web fonts
├── i/                     # Images
├── include/               # PHP includes
├── templates/             # HTML templates
├── ace/                   # ACE editor files
├── download/              # Downloads directory
│
├── apache-config/         # Apache VirtualHost configs
│   ├── integram-rf.conf   # Main domain config
│   └── integram-dual.conf # /app alias config
│
└── Docker                 # Docker deployment
    ├── Dockerfile         # PHP 8.0 + Apache image
    ├── docker-compose.yml # Full stack (PHP + MySQL)
    ├── DOCKER.md          # Подробная документация
    ├── quick-start.sh     # Скрипт быстрого запуска
    └── .env.example       # Пример конфигурации
```

## Apache Конфигурация

### Основные настройки

**DocumentRoot:** `/var/www/html`
**PHP Version:** 8.0.30
**Web Server:** Apache/2.4.62 (AlmaLinux) + OpenSSL/3.5.1
**SSL:** Let's Encrypt certificates

### URL Routing

| URL | Destination | Description |
|-----|-------------|-------------|
| `/` | DocumentRoot | PHP Integram app |
| `/my` | index.php routing | Integram база "my" |
| `/a2025` | index.php routing | Integram база "a2025" |
| `/app/` | /var/www/html/app | Vue.js SPA |
| `/api/v2/` | localhost:3001 | Node.js backend proxy |

### .htaccess Routing

```apache
RewriteEngine On
Options -Indexes
Options +FollowSymLinks
DirectoryIndex index.html

RewriteBase /
RewriteCond %{HTTP:Authorization} ^(.+)$
RewriteRule .* - [e=HTTP_AUTHORIZATION:%1]

# Если файл/директория не существует → index.php
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php [L,QSA]
```

## Endpoints

### 1. PHP Integram Application

```
https://интеграм.рф/my
https://интеграм.рф/a2025
```

- Redirects to login page if not authenticated
- Full database management interface
- Uses index.php for routing

### 2. API Endpoints

```
https://интеграм.рф/my/auth?JSON_KV
https://интеграм.рф/my/_dict?JSON_KV
https://интеграм.рф/my/_d_main?typeId=18&JSON_KV
https://интеграм.рф/my/_list?typeId=18&JSON_KV
```

### 3. Vue.js SPA

```
https://интеграм.рф/app/
```

- Modern single-page application
- Vue Router with fallback routing
- Static assets cached for 1 year

## Deployment

### На production сервере:

```bash
# SSH доступ
ssh root@YOUR_SERVER_IP

# Директория приложения
cd /var/www/html

# Перезапуск Apache
systemctl restart httpd

# Проверка логов
tail -f /var/log/httpd/integram-rf-error.log
tail -f /var/log/httpd/integram-rf-access.log
```

### Из git репозитория на сервер:

```bash
# 1. Commit изменения в git
cd /home/hive/dronedoc2025
git add backend/integram-server/
git commit -m "Update Integram server code"
git push origin dev

# 2. Pull на сервере
ssh root@YOUR_SERVER_IP
cd /var/www/html
# Скопировать изменённые файлы с локального git репозитория
# или использовать git clone/pull если на сервере есть git

# 3. Применить права доступа
chown -R apache:apache /var/www/html
chmod 755 /var/www/html
chmod 644 /var/www/html/*.php
chmod 644 /var/www/html/*.html

# 4. Перезапустить Apache
systemctl restart httpd
```

## Database Credentials

**Production server:** YOUR_SERVER_IP
**MySQL:** localhost (internal)

**Test credentials (база my):**
- Login: `d`
- Password: `d`

## SSL Certificates

**Provider:** Let's Encrypt
**Domain:** xn--80afflxcxn.xn--p1ai (интеграм.рф punycode)

**Certificates:**
```
/etc/letsencrypt/live/xn--80afflxcxn.xn--p1ai/fullchain.pem
/etc/letsencrypt/live/xn--80afflxcxn.xn--p1ai/privkey.pem
```

**Renewal:**
```bash
certbot renew
systemctl reload httpd
```

## DNS Configuration

**Domain:** интеграм.рф (xn--80afflxcxn.xn--p1ai)
**Nameservers:** ns1.reg.ru, ns2.reg.ru
**A Record:** YOUR_SERVER_IP
**TTL:** ~3.5 hours

## Troubleshooting

### 404 Not Found на /my или /a2025

**Проблема:** Неправильная конфигурация Alias в Apache

**Решение:**
1. Убедитесь что DocumentRoot = /var/www/html
2. Удалите Alias директивы для /my и /a2025
3. Проверьте .htaccess routing
4. Перезапустите Apache

### 403 Forbidden на /app/

**Проблема:** Неправильные права доступа

**Решение:**
```bash
chmod 755 /var/www/html/app
chmod -R 644 /var/www/html/app/*
chmod 755 /var/www/html/app/assets
systemctl restart httpd
```

### SSL Certificate Warning

**Проблема:** Сертификат не включает Cyrillic имя домена

**Решение:** Используется punycode (xn--80afflxcxn.xn--p1ai) - это нормально

## Git Sync

Этот код синхронизирован с production сервера для:
1. Version control
2. Backup
3. Collaborative development
4. Deployment automation

**Последняя синхронизация:** 2025-12-26 22:19 MSK
**Git branch:** dev

## Support

**Documentation:** See INTEGRAM_RF_FIX_REPORT.md for recent fixes
**Issues:** Check Apache logs at /var/log/httpd/

## License

Internal DronDoc project
