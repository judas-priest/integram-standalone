# Настройка автоматического деплоя Integram Standalone

## 📋 Требования

- Сервер: Ubuntu 20.04+ или Debian 11+
- Root доступ или sudo привилегии
- IP: YOUR_SERVER_IP
- Открытые порты: 80, 443 (для HTTP/HTTPS)

## 🚀 Быстрая установка

### Шаг 1: Подключение к серверу

```bash
ssh root@YOUR_SERVER_IP
```

### Шаг 2: Установка зависимостей

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установить Git
sudo apt install -y git

# Установить Nginx
sudo apt install -y nginx

# Установить PM2 (опционально, для управления процессами)
sudo npm install -g pm2

# Проверить установку
node --version  # должно быть v20.x.x
npm --version
git --version
nginx -v
```

### Шаг 3: Клонирование и первоначальный деплой

```bash
# Скачать deploy script
wget https://raw.githubusercontent.com/unidel2035/integram-standalone/master/deploy.sh

# Сделать исполняемым
chmod +x deploy.sh

# Запустить деплой
./deploy.sh master
```

### Шаг 4: Настройка systemd сервиса

```bash
# Скачать service файл
sudo wget -O /etc/systemd/system/integram-standalone.service \
  https://raw.githubusercontent.com/unidel2035/integram-standalone/master/integram-standalone.service

# Перезагрузить systemd
sudo systemctl daemon-reload

# Включить автозапуск
sudo systemctl enable integram-standalone

# Запустить сервис
sudo systemctl start integram-standalone

# Проверить статус
sudo systemctl status integram-standalone

# Просмотр логов
sudo journalctl -u integram-standalone -f
```

### Шаг 5: Настройка Nginx

```bash
# Скачать конфигурацию
sudo wget -O /etc/nginx/sites-available/integram-standalone \
  https://raw.githubusercontent.com/unidel2035/integram-standalone/master/nginx.conf

# Отредактировать server_name (заменить YOUR_SERVER_IP на ваш домен)
sudo nano /etc/nginx/sites-available/integram-standalone

# Создать симлинк
sudo ln -s /etc/nginx/sites-available/integram-standalone /etc/nginx/sites-enabled/

# Удалить дефолтную конфигурацию (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверить конфигурацию
sudo nginx -t

# Перезапустить Nginx
sudo systemctl restart nginx
```

### Шаг 6: Настройка переменных окружения

```bash
# Отредактировать .env файл
cd /var/www/integram-standalone
sudo nano .env
```

Пример `.env`:
```bash
# API Configuration
VITE_API_URL=http://YOUR_SERVER_IP:3000
VITE_WS_URL=ws://YOUR_SERVER_IP:3000
VITE_INTEGRAM_URL=https://dronedoc.ru

# Application Settings
VITE_APP_TITLE=Integram Standalone
VITE_APP_DESCRIPTION=Управление данными и бизнес-процессами

# Backend Configuration
PORT=3000
NODE_ENV=production
```

После редактирования:
```bash
# Перезапустить сервис
sudo systemctl restart integram-standalone
```

## 🔄 Настройка автоматического деплоя через GitHub Actions

### Шаг 1: Генерация SSH ключа на сервере

```bash
# Создать SSH ключ для деплоя
ssh-keygen -t ed25519 -C "deploy@integram-standalone" -f ~/.ssh/deploy_key -N ""

# Добавить публичный ключ в authorized_keys
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys

# Вывести приватный ключ (скопировать для GitHub Secrets)
cat ~/.ssh/deploy_key
```

### Шаг 2: Настройка GitHub Secrets

Перейдите в: `https://github.com/unidel2035/integram-standalone/settings/secrets/actions`

Добавьте следующие secrets:

| Secret Name | Value |
|-------------|-------|
| `DEPLOY_HOST` | `YOUR_SERVER_IP` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | `<содержимое ~/.ssh/deploy_key>` |
| `DEPLOY_PORT` | `22` |
| `VITE_API_URL` | `http://YOUR_SERVER_IP:3000` |
| `VITE_WS_URL` | `ws://YOUR_SERVER_IP:3000` |
| `VITE_INTEGRAM_URL` | `https://dronedoc.ru` |

### Шаг 3: Тестирование автодеплоя

```bash
# Сделать любой коммит в master ветку
# GitHub Actions автоматически запустит деплой

# Или запустить вручную:
# 1. Перейти: https://github.com/unidel2035/integram-standalone/actions
# 2. Выбрать workflow "Deploy to Production"
# 3. Нажать "Run workflow"
```

## 🔧 Ручной деплой

Если нужно обновить приложение вручную:

```bash
# Подключиться к серверу
ssh root@YOUR_SERVER_IP

# Запустить deploy script
cd /var/www/integram-standalone
./deploy.sh master
```

## 📊 Управление и мониторинг

### Просмотр логов

```bash
# Логи приложения
sudo journalctl -u integram-standalone -f

# Логи Nginx
sudo tail -f /var/log/nginx/integram-standalone-access.log
sudo tail -f /var/log/nginx/integram-standalone-error.log
```

### Управление сервисом

```bash
# Статус
sudo systemctl status integram-standalone

# Запуск
sudo systemctl start integram-standalone

# Остановка
sudo systemctl stop integram-standalone

# Перезапуск
sudo systemctl restart integram-standalone

# Включить автозапуск
sudo systemctl enable integram-standalone

# Отключить автозапуск
sudo systemctl disable integram-standalone
```

### Перезагрузка Nginx

```bash
# Проверить конфигурацию
sudo nginx -t

# Перезагрузить (без разрыва соединений)
sudo systemctl reload nginx

# Полный перезапуск
sudo systemctl restart nginx
```

## 🔒 SSL/HTTPS (опционально)

### Установка Certbot для Let's Encrypt

```bash
# Установить Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получить SSL сертификат
sudo certbot --nginx -d your-domain.com

# Автоматическое продление (cron добавляется автоматически)
sudo certbot renew --dry-run
```

## 🐛 Решение проблем

### Приложение не запускается

```bash
# Проверить логи
sudo journalctl -u integram-standalone -n 50

# Проверить права доступа
sudo chown -R www-data:www-data /var/www/integram-standalone

# Проверить Node.js версию
node --version  # должно быть v20.x.x
```

### Nginx 502 Bad Gateway

```bash
# Проверить, запущен ли backend
sudo systemctl status integram-standalone

# Проверить порт
sudo netstat -tulpn | grep :3000

# Перезапустить backend
sudo systemctl restart integram-standalone
```

### GitHub Actions deployment failed

1. Проверить GitHub Secrets (правильность SSH ключа)
2. Проверить SSH доступ с локальной машины
3. Проверить логи workflow в GitHub Actions

## 📝 Дополнительно

### Обновление Node.js

```bash
# Установить новую версию
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Перезапустить сервис
sudo systemctl restart integram-standalone
```

### Очистка старых логов

```bash
# Очистить systemd журналы старше 7 дней
sudo journalctl --vacuum-time=7d

# Ротация Nginx логов
sudo logrotate -f /etc/logrotate.d/nginx
```

## 🎉 Готово!

Приложение должно быть доступно по адресу:
- **HTTP:** http://YOUR_SERVER_IP
- **HTTPS:** https://your-domain.com (если настроен SSL)

При любом push в master ветку GitHub Actions автоматически обновит приложение на сервере.
