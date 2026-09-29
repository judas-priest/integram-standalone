# Подключение базы данных Integram

Руководство по настройке подключения к базе данных для Node.js backend Integram Standalone.

## Содержание

1. [Обзор](#обзор)
2. [Поддерживаемые СУБД](#поддерживаемые-субд)
3. [Настройка MySQL/MariaDB](#настройка-mysqlmariadb)
4. [Конфигурация окружения](#конфигурация-окружения)
5. [Режимы работы](#режимы-работы)
6. [Миграция данных](#миграция-данных)
7. [Troubleshooting](#troubleshooting)

---

## Обзор

Node.js backend Integram использует MySQL/MariaDB для обеспечения полной совместимости с legacy PHP backend. Backend автоматически определяет наличие подключения к базе данных и работает в соответствующем режиме.

### Архитектура данных

```
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Backend                          │
│                   (index-minimal.js)                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  mysql2/promise │
                    │  (Connection    │
                    │     Pool)       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  MySQL/MariaDB  │
                    │                 │
                    │  ┌───────────┐  │
                    │  │  my       │  │  ← База данных "my"
                    │  │  (table)  │  │
                    │  └───────────┘  │
                    │  ┌───────────┐  │
                    │  │  a2025    │  │  ← База данных "a2025"
                    │  │  (table)  │  │
                    │  └───────────┘  │
                    │  ┌───────────┐  │
                    │  │  company  │  │  ← База данных "company"
                    │  │  (table)  │  │
                    │  └───────────┘  │
                    └─────────────────┘
```

### Структура таблицы (EAV)

Каждая "база данных" Integram представлена одной таблицей с Entity-Attribute-Value структурой:

```sql
CREATE TABLE `{database_name}` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `up` INT NOT NULL DEFAULT 0,           -- ID родительского объекта
  `ord` INT NOT NULL DEFAULT 0,          -- Порядковый номер
  `t` INT NOT NULL DEFAULT 0,            -- ID типа объекта
  `val` VARCHAR(10000) DEFAULT NULL,     -- Значение
  INDEX `idx_up` (`up`),
  INDEX `idx_t` (`t`),
  INDEX `idx_up_t` (`up`, `t`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Поддерживаемые СУБД

| СУБД | Версия | Статус | Примечания |
|------|--------|--------|------------|
| MySQL | 8.0+ | Полная поддержка | Рекомендуется |
| MariaDB | 10.5+ | Полная поддержка | Совместима с MySQL |
| PostgreSQL | 14+ | Планируется | Через миграцию |

---

## Настройка MySQL/MariaDB

### Шаг 1: Установка MySQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server mysql-client
sudo systemctl start mysql
sudo systemctl enable mysql
```

**CentOS/RHEL:**
```bash
sudo yum install mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

**macOS (Homebrew):**
```bash
brew install mysql
brew services start mysql
```

### Шаг 2: Создание пользователя и базы данных

```bash
# Подключение к MySQL
sudo mysql -u root -p
```

```sql
-- Создание базы данных
CREATE DATABASE integram CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Создание пользователя
CREATE USER 'integram'@'localhost' IDENTIFIED BY 'your_secure_password';

-- Выдача прав
GRANT ALL PRIVILEGES ON integram.* TO 'integram'@'localhost';
FLUSH PRIVILEGES;

-- Создание таблицы "my" (основная база)
USE integram;

CREATE TABLE `my` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `up` INT NOT NULL DEFAULT 0,
  `ord` INT NOT NULL DEFAULT 0,
  `t` INT NOT NULL DEFAULT 0,
  `val` VARCHAR(10000) DEFAULT NULL,
  INDEX `idx_up` (`up`),
  INDEX `idx_t` (`t`),
  INDEX `idx_up_t` (`up`, `t`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

\q
```

### Шаг 3: Инициализация базовых типов

Для полноценной работы необходимо создать базовые типы данных:

```sql
USE integram;

-- Базовые типы (metadata)
INSERT INTO my (id, up, ord, t, val) VALUES
(2, 0, 1, 2, 'HTML'),
(3, 0, 2, 3, 'SHORT'),
(4, 0, 3, 4, 'DATETIME'),
(5, 0, 4, 5, 'GRANT'),
(6, 0, 5, 6, 'PWD'),
(7, 0, 6, 7, 'BUTTON'),
(8, 0, 7, 8, 'CHARS'),
(9, 0, 8, 9, 'DATE'),
(10, 0, 9, 10, 'FILE'),
(11, 0, 10, 11, 'BOOLEAN'),
(12, 0, 11, 12, 'MEMO'),
(13, 0, 12, 13, 'NUMBER'),
(14, 0, 13, 14, 'SIGNED'),
(15, 0, 14, 15, 'CALCULATABLE'),
(16, 0, 15, 16, 'REPORT_COLUMN'),
(17, 0, 16, 17, 'PATH');

-- Тип "Пользователь"
INSERT INTO my (id, up, ord, t, val) VALUES (18, 0, 17, 8, 'Пользователь');

-- Реквизиты пользователя
INSERT INTO my (id, up, ord, t, val) VALUES
(20, 18, 1, 6, 'Пароль'),      -- PASSWORD (тип PWD)
(30, 18, 2, 8, 'Телефон'),     -- PHONE
(33, 18, 3, 8, 'Имя'),         -- NAME
(40, 18, 4, 8, 'XSRF'),        -- XSRF token
(41, 18, 5, 8, 'Email'),       -- EMAIL
(42, 0, 18, 8, 'Роль'),        -- ROLE (корневой тип)
(124, 18, 6, 4, 'Активность'), -- ACTIVITY (тип DATETIME)
(125, 18, 7, 8, 'Токен'),      -- TOKEN
(130, 18, 8, 8, 'Секрет');     -- SECRET

-- Тестовый пользователь (логин: admin, пароль: admin)
INSERT INTO my (id, up, ord, t, val) VALUES
(1000, 1, 1, 18, 'admin');

-- Пароль для admin (хэш SHA1 с солью)
-- Формула: SHA1(SALT + USERNAME_UPPER + DATABASE + PASSWORD)
-- При SALT='CHANGEME_AUTH_SALT': SHA1('CHANGEME_AUTH_SALTADMINmyadmin')
INSERT INTO my (id, up, ord, t, val) VALUES
(1001, 1000, 1, 20, '...');  -- Замените на реальный хэш
```

### Шаг 4: Проверка соединения

```bash
# Проверка подключения
mysql -h localhost -u integram -p integram -e "SELECT COUNT(*) FROM my;"
```

---

## Конфигурация окружения

Создайте файл `.env` в директории `backend/monolith/`:

```env
# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================

# MySQL/MariaDB соединение
DB_HOST=localhost
DB_PORT=3306
DB_USER=integram
DB_PASSWORD=your_secure_password
DB_CHARSET=utf8mb4

# =============================================================================
# AUTHENTICATION
# =============================================================================

# Соль для хэширования паролей (должна совпадать с PHP backend!)
AUTH_SALT=CHANGEME_AUTH_SALT

# Время жизни cookie в секундах (30 дней)
AUTH_COOKIE_EXPIRE=2592000

# =============================================================================
# SERVER
# =============================================================================

PORT=8081
HOST=0.0.0.0
NODE_ENV=production

# =============================================================================
# CORS
# =============================================================================

CORS_ORIGIN=http://localhost:5173,https://example.integram.io
```

### Важные параметры

| Параметр | Описание | Обязательный |
|----------|----------|--------------|
| `DB_HOST` | Хост базы данных | Да |
| `DB_PORT` | Порт (по умолчанию 3306) | Нет |
| `DB_USER` | Имя пользователя БД | Да |
| `DB_PASSWORD` | Пароль пользователя БД | Да |
| `AUTH_SALT` | Соль для паролей | Да (должна совпадать с PHP!) |

---

## Режимы работы

Backend автоматически определяет доступность базы данных и работает в соответствующем режиме:

### Real Authentication Mode

**Условия:** База данных доступна и настроена.

```
✅ Database connected: localhost
📦 Database: Connected to localhost
```

**Функционал:**
- Реальная аутентификация пользователей
- CRUD операции с данными
- Синхронизация токенов и сессий
- Полная совместимость с PHP backend

### Mock Mode

**Условия:** База данных недоступна или не настроена.

```
⚠️  Database not available: Connection refused
⚠️  Running in mock mode (no real authentication)
📦 Database: Not connected (mock mode)
```

**Функционал:**
- Возвращает mock-токены для разработки
- Базовые API эндпоинты работают
- Нет реальной авторизации
- Подходит для frontend разработки

---

## Миграция данных

### Экспорт из PHP backend

```bash
cd scripts/db-migration

# Экспорт базы "my" с настройками
node export-database.js my --password=secret --settings --format both
```

**Выходные файлы:**
- `exports/my_2026-02-18.json` — JSON экспорт
- `exports/my_2026-02-18.sql` — SQL дамп
- `exports/my_2026-02-18_summary.txt` — Статистика

### Импорт в новую базу

```bash
# Импорт в MySQL
node import-database.js exports/my_2026-02-18.json --target=mysql --create

# Импорт в PostgreSQL (планируется)
node import-database.js exports/my_2026-02-18.json --target=postgres --create
```

### Опции миграции

| Опция | Описание |
|-------|----------|
| `--create` | Создать базу, если не существует |
| `--drop` | Удалить существующую базу перед импортом |
| `--dry-run` | Показать что будет сделано без выполнения |
| `--batch-size=N` | Размер пакета для вставки (по умолчанию 1000) |

---

## Troubleshooting

### Ошибка: "Access denied for user"

**Причина:** Неверные учётные данные.

**Решение:**
```bash
# Проверка учётных данных
mysql -h localhost -u integram -p

# Сброс пароля (от root)
ALTER USER 'integram'@'localhost' IDENTIFIED BY 'new_password';
FLUSH PRIVILEGES;
```

### Ошибка: "Database does not exist"

**Причина:** База данных не создана.

**Решение:**
```sql
CREATE DATABASE integram CHARACTER SET utf8mb4;
```

### Ошибка: "Table doesn't exist"

**Причина:** Таблица базы данных не создана.

**Решение:**
```sql
CREATE TABLE `my` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `up` INT NOT NULL DEFAULT 0,
  `ord` INT NOT NULL DEFAULT 0,
  `t` INT NOT NULL DEFAULT 0,
  `val` VARCHAR(10000) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Ошибка: "Connection refused"

**Причина:** MySQL не запущен или неверный порт.

**Решение:**
```bash
# Проверка статуса
sudo systemctl status mysql

# Запуск MySQL
sudo systemctl start mysql

# Проверка порта
netstat -tlnp | grep 3306
```

### Ошибка аутентификации после миграции

**Причина:** Несовпадение соли (AUTH_SALT) между PHP и Node.js.

**Решение:**
1. Найти значение SALT в PHP конфигурации (`connection.php` или `config.php`)
2. Установить такое же значение в `.env`:
   ```env
   AUTH_SALT=YourExactSaltFromPHP
   ```

### Пароли не работают

**Причина:** Алгоритм хэширования отличается.

**Проверка:**
```javascript
// Node.js
const crypto = require('crypto');
const salt = 'CHANGEME_AUTH_SALT';
const username = 'ADMIN'; // uppercase
const database = 'my';
const password = 'admin';

const hash = crypto
  .createHash('sha1')
  .update(salt + username + database + password)
  .digest('hex');

console.log(hash);
```

```php
// PHP
$salt = 'CHANGEME_AUTH_SALT';
$username = strtoupper('admin');
$database = 'my';
$password = 'admin';

echo sha1($salt . $username . $database . $password);
```

Оба значения должны совпадать.

---

## Мониторинг соединения

### Health Check

```bash
curl http://localhost:8081/health
```

**Ответ:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-02-18T12:00:00Z"
}
```

### Логирование

При запуске сервер выводит статус подключения:

```
╔════════════════════════════════════════════════════════════════╗
║       Integram Standalone Backend - With DB Authentication     ║
╚════════════════════════════════════════════════════════════════╝

✅ Server running on http://0.0.0.0:8081
✅ WebSocket endpoint: ws://0.0.0.0:8081/ws
✅ Health check: http://0.0.0.0:8081/health
📦 Database: Connected to localhost

📚 Integram API routes (PHP-compatible):
   POST /api/:db/auth       - User authentication (REAL)
   GET  /api/:db/validate   - Token validation
   ...
```

---

**Версия:** 1.0.0
**Дата обновления:** 2026-02-18
**Issue:** [#121](https://github.com/unidel2035/integram-standalone/issues/121)
