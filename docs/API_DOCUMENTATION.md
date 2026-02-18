# Integram Standalone API - Полная документация

Полная документация по всем API endpoints системы Integram Standalone.

## Содержание

1. [Обзор API](#обзор-api)
2. [API v1 (Legacy PHP API)](#api-v1-legacy-php-api)
3. [API v1 (Node.js Backend)](#api-v1-nodejs-backend)
4. [API v2 (JSON:API 1.1)](#api-v2-jsonapi-11)
5. [Какую версию использовать?](#какую-версию-использовать)
6. [Хосты и URL](#хосты-и-url)

---

## Обзор API

Integram Standalone имеет **две версии API**:

| Версия | Формат | Статус | Базовый путь | Описание |
|--------|--------|--------|--------------|----------|
| **v1** | Custom JSON | Stable/Production | `/api/*` | Основной API для работы с данными |
| **v2** | JSON:API 1.1 | Beta | `/api/v2/*` | Современный API с AI-friendly структурой |

### Какой API используется по умолчанию?

**API v1 используется по умолчанию.** Это основной и стабильный API для работы с системой.

API v2 находится в статусе Beta и предназначен для:
- AI-интеграций (удобный формат для LLM)
- Новых проектов с требованием JSON:API
- Постепенной миграции с v1

---

## API v1 (Legacy PHP API)

Legacy PHP API для работы напрямую с Integram базами данных.

### Базовый URL

```
https://интеграм.рф/{database}/
```

Где `{database}` — имя базы данных (например: `my`, `a2025`, `ddadmin`)

### Аутентификация

#### POST `/{database}/auth`

Аутентификация в базе данных.

**Параметры:**
- `login` (string) — имя пользователя
- `pass` (string) — пароль

**Пример запроса:**
```bash
curl -X POST "https://интеграм.рф/my/auth?JSON_KV" \
  -d "login=myuser&pass=mypassword"
```

**Ответ:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "xsrf": "abc123def456",
  "id": 12345,
  "name": "Иванов Иван"
}
```

### Получение справочника (Dictionary)

#### GET `/{database}/_dict`

Получить список всех типов (таблиц) в базе данных.

**Headers:**
- `X-Authorization: {token}`
- `X-Xsrf-Token: {xsrf}`

**Пример:**
```bash
curl "https://интеграм.рф/my/_dict?JSON_KV" \
  -H "X-Authorization: $TOKEN" \
  -H "X-Xsrf-Token: $XSRF"
```

**Ответ:**
```json
{
  "types": [
    {
      "id": 1,
      "name": "Клиенты",
      "alias": "clients"
    },
    {
      "id": 2,
      "name": "Проекты",
      "alias": "projects"
    }
  ]
}
```

### Метаданные типа

#### GET `/{database}/_d_main`

Получить структуру типа (таблицы).

**Параметры:**
- `typeId` (number) — ID типа

**Пример:**
```bash
curl "https://интеграм.рф/my/_d_main?typeId=18&JSON_KV" \
  -H "X-Authorization: $TOKEN"
```

### Список объектов

#### GET `/{database}/_list`

Получить список объектов типа.

**Параметры:**
- `typeId` (number) — ID типа
- `offset` (number) — смещение
- `limit` (number) — лимит записей

**Пример:**
```bash
curl "https://интеграм.рф/my/_list?typeId=18&offset=0&limit=50&JSON_KV" \
  -H "X-Authorization: $TOKEN"
```

---

## API v1 (Node.js Backend)

Основной Node.js backend API работает на порту `8081` (по умолчанию) или `3001` через nginx proxy.

### Базовый URL

```
https://dev.example.integram.io/api/
```

или локально:

```
http://localhost:8081/api/
```

### Аутентификация

#### POST `/api/auth/register/email`

Регистрация нового пользователя по email.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "username": "myusername",
  "displayName": "Иван Иванов"
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "user@example.com",
      "username": "myusername"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 900
  }
}
```

#### POST `/api/auth/login`

Вход в систему.

**Body:**
```json
{
  "identifier": "user@example.com",
  "password": "SecurePassword123!"
}
```

#### POST `/api/auth/refresh`

Обновление access token.

**Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### GET `/api/auth/me`

Получить информацию о текущем пользователе.

**Headers:**
- `Authorization: Bearer {accessToken}`

### Unified Authentication

#### POST `/api/unified-auth/login`

Единая авторизация для нескольких баз данных.

**Body:**
```json
{
  "username": "myuser",
  "password": "mypassword",
  "databases": ["my", "a2025"]
}
```

**Ответ:**
```json
{
  "success": true,
  "session": {
    "sessionId": "ses_abc123",
    "databases": {
      "my": {
        "token": "...",
        "xsrf": "...",
        "userId": "...",
        "userName": "Иван Иванов"
      },
      "a2025": {
        "token": "...",
        "xsrf": "..."
      }
    }
  }
}
```

#### GET `/api/unified-auth/token/{sessionId}/{database}`

Получить токен для конкретной базы данных.

### AI Chat API

#### POST `/api/chat`

Единый endpoint для AI чата (все провайдеры).

**Body:**
```json
{
  "message": "Привет! Как дела?",
  "model": "openai/gpt-4o",
  "conversationHistory": [],
  "userId": "user-123",
  "enableTools": false,
  "temperature": 0.7,
  "maxTokens": 4096,
  "stream": false
}
```

**Ответ:**
```json
{
  "success": true,
  "response": "Привет! У меня всё хорошо. Чем могу помочь?",
  "model": "gpt-4o",
  "usage": {
    "promptTokens": 10,
    "completionTokens": 15,
    "totalTokens": 25
  }
}
```

**Поддерживаемые модели:**
- OpenAI: `openai/gpt-4o`, `openai/gpt-4-turbo`, `openai/gpt-3.5-turbo`
- Anthropic: `anthropic/claude-3-opus`, `anthropic/claude-3.5-sonnet`
- DeepSeek: `deepseek/deepseek-chat`
- Polza: `polza/*`
- Kodacode: `kodacode/*`

### General Chat API (Messaging)

#### GET `/api/general-chat/rooms`

Получить список чат-комнат.

#### POST `/api/general-chat/rooms`

Создать новую чат-комнату.

**Body:**
```json
{
  "name": "Название комнаты",
  "description": "Описание"
}
```

#### GET `/api/general-chat/rooms/{roomId}/messages`

Получить сообщения комнаты.

**Query параметры:**
- `limit` (default: 50)
- `offset` (default: 0)

#### POST `/api/general-chat/rooms/{roomId}/messages`

Отправить сообщение.

**Body:**
```json
{
  "text": "Текст сообщения",
  "replyToId": null
}
```

### Health & Status

#### GET `/api/health`

Проверка состояния сервера.

**Ответ:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-26T10:00:00Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### AI Tokens Management

#### GET `/api/ai-tokens`

Получить список AI токенов пользователя.

#### POST `/api/ai-tokens`

Создать новый AI токен.

---

## API v2 (JSON:API 1.1)

Современный API с форматом JSON:API 1.1, оптимизированный для AI интеграций.

### Базовый URL

```
https://dev.example.integram.io/api/v2/
```

или локально:

```
http://localhost:8081/api/v2/
```

### Формат запросов

**Content-Type:** `application/vnd.api+json`

### API Discovery

#### GET `/api/v2`

Получить информацию об API и доступных endpoints.

**Ответ:**
```json
{
  "jsonapi": { "version": "1.1" },
  "data": {
    "type": "api-info",
    "id": "integram-api-v2",
    "attributes": {
      "version": "2.0.0",
      "name": "Integram Standalone API",
      "status": "beta",
      "features": ["json-api-1.1", "openapi-3.1", "hateoas"]
    },
    "links": {
      "self": "/api/v2",
      "documentation": "/docs/api/MODERN_API_FORMAT.md"
    }
  }
}
```

#### GET `/api/v2/health`

Health check.

**Ответ:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-26T15:30:00Z",
  "version": "2.0.0",
  "uptime": 3600,
  "memory": { "used": 128, "total": 256, "unit": "MB" }
}
```

#### GET `/api/v2/openapi.yaml`

OpenAPI спецификация в YAML формате.

#### GET `/api/v2/openapi.json`

OpenAPI спецификация в JSON формате.

### Integram Resources

#### GET `/api/v2/integram/databases/{database}/types`

Получить список всех типов (таблиц).

**Ответ:**
```json
{
  "jsonapi": { "version": "1.1" },
  "data": [
    {
      "type": "integram-type",
      "id": "type_clients",
      "attributes": {
        "typeName": "Клиенты",
        "typeAlias": "clients",
        "objectCount": 150
      },
      "links": {
        "metadata": "/api/v2/integram/databases/db1/types/type_clients/metadata",
        "objects": "/api/v2/integram/databases/db1/types/type_clients/objects"
      }
    }
  ]
}
```

#### GET `/api/v2/integram/databases/{database}/types/{typeId}/metadata`

Получить структуру типа (реквизиты/колонки).

**Ответ:**
```json
{
  "jsonapi": { "version": "1.1" },
  "data": {
    "type": "integram-type-metadata",
    "id": "type_clients",
    "attributes": {
      "typeInfo": { "typeId": "type_clients", "typeName": "Клиенты" },
      "requisites": [
        {
          "requisiteId": "req_name",
          "requisiteName": "Название",
          "dataType": "string",
          "isRequired": true
        }
      ]
    }
  }
}
```

#### GET `/api/v2/integram/databases/{database}/types/{typeId}/objects`

Получить список объектов с пагинацией.

**Query параметры:**
- `page` (default: 1) — номер страницы
- `limit` (default: 50, max: 100) — записей на странице
- `sort` — сортировка (например: `-updatedAt`, `name`)
- `filter[field]` — фильтрация

**Ответ:**
```json
{
  "jsonapi": { "version": "1.1" },
  "data": [
    {
      "type": "integram-object",
      "id": "obj_001",
      "attributes": {
        "requisites": {
          "req_name": "ООО \"Ромашка\"",
          "req_email": "info@romashka.ru"
        }
      },
      "links": { "self": "/api/v2/integram/databases/db1/objects/obj_001" }
    }
  ],
  "meta": {
    "pagination": { "page": 1, "limit": 50, "total": 150, "totalPages": 3 }
  },
  "links": {
    "self": "...?page=1",
    "next": "...?page=2",
    "last": "...?page=3"
  }
}
```

#### POST `/api/v2/integram/databases/{database}/types/{typeId}/objects`

Создать новый объект.

**Body:**
```json
{
  "data": {
    "type": "integram-object",
    "attributes": {
      "requisites": {
        "req_name": "Новая компания",
        "req_email": "info@newcompany.ru"
      }
    }
  }
}
```

**Ответ:** `201 Created`

#### GET `/api/v2/integram/databases/{database}/objects/{objectId}`

Получить объект по ID.

#### PATCH `/api/v2/integram/databases/{database}/objects/{objectId}`

Обновить объект (частичное обновление).

**Body:**
```json
{
  "data": {
    "type": "integram-object",
    "id": "obj_001",
    "attributes": {
      "requisites": { "req_status": "inactive" }
    }
  }
}
```

#### DELETE `/api/v2/integram/databases/{database}/objects/{objectId}`

Удалить объект.

**Ответ:** `204 No Content`

### Swagger UI

#### GET `/api/v2/docs`

Интерактивная документация Swagger UI.

---

## Какую версию использовать?

### Используйте API v1, если:

- Работаете с существующими интеграциями
- Нужна полная совместимость с текущим кодом
- Требуется стабильный API без breaking changes

### Используйте API v2, если:

- Разрабатываете AI интеграцию (LLM-friendly формат)
- Нужен стандартный JSON:API формат
- Начинаете новый проект с нуля
- Требуется HATEOAS навигация и самодокументируемость

---

## Хосты и URL

### Production

| Сервис | URL |
|--------|-----|
| **PHP Integram** | `https://интеграм.рф/` (xn--80afflxcxn.xn--p1ai) |
| **Node.js Backend** | `https://dev.example.integram.io/api/` |
| **API v2** | `https://dev.example.integram.io/api/v2/` |
| **Vue.js SPA** | `https://интеграм.рф/app/` |

### Development (localhost)

| Сервис | URL | Порт |
|--------|-----|------|
| **Node.js Backend** | `http://localhost:8081/api/` | 8081 |
| **API v2** | `http://localhost:8081/api/v2/` | 8081 |
| **WebSocket** | `ws://localhost:8081/ws` | 8081 |

### Nginx Proxy

Apache на production сервере проксирует запросы:

```
/api/v2/* → localhost:3001/api/v2/*
```

(Node.js backend может работать на порту 3001 при использовании PM2)

---

## Аутентификация — Сводная таблица

| Метод | Endpoint | Использование |
|-------|----------|---------------|
| JWT Cookie | `integram_access_token` | Рекомендуется для браузера |
| Authorization Header | `Bearer {token}` | Для API клиентов |
| X-Authorization | `{token}` | Legacy PHP API |
| X-Xsrf-Token | `{xsrf}` | CSRF защита (PHP API) |
| X-Integram-Token | `{token}` | Альтернативный метод |

---

## Коды ошибок

### HTTP Status Codes

| Код | Описание |
|-----|----------|
| 200 | OK — успешный запрос |
| 201 | Created — ресурс создан |
| 204 | No Content — успешное удаление |
| 400 | Bad Request — неверный формат запроса |
| 401 | Unauthorized — требуется авторизация |
| 403 | Forbidden — доступ запрещен |
| 404 | Not Found — ресурс не найден |
| 422 | Unprocessable Entity — ошибка валидации |
| 429 | Too Many Requests — rate limit превышен |
| 500 | Internal Server Error — внутренняя ошибка сервера |

### Формат ошибки (v1)

```json
{
  "success": false,
  "error": "Описание ошибки"
}
```

### Формат ошибки (v2 — JSON:API)

```json
{
  "jsonapi": { "version": "1.1" },
  "errors": [{
    "status": "400",
    "code": "VALIDATION_ERROR",
    "title": "Validation Error",
    "detail": "Поле 'email' обязательно",
    "source": { "pointer": "/data/attributes/email" }
  }]
}
```

---

## Примеры использования

### cURL — Авторизация и получение данных (v1)

```bash
# 1. Авторизация
TOKEN=$(curl -s -X POST "https://интеграм.рф/my/auth?JSON_KV" \
  -d "login=d&pass=d" | jq -r '.token')

# 2. Получить справочник
curl "https://интеграм.рф/my/_dict?JSON_KV" \
  -H "X-Authorization: $TOKEN"

# 3. Получить список объектов типа 18
curl "https://интеграм.рф/my/_list?typeId=18&JSON_KV" \
  -H "X-Authorization: $TOKEN"
```

### cURL — API v2

```bash
# Health check
curl http://localhost:8081/api/v2/health

# Получить список таблиц
curl http://localhost:8081/api/v2/integram/databases/my/types \
  -H "Accept: application/vnd.api+json" \
  -H "Authorization: Bearer $TOKEN"

# Создать объект
curl -X POST http://localhost:8081/api/v2/integram/databases/my/types/type_clients/objects \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "integram-object",
      "attributes": {
        "requisites": {
          "req_name": "Новый клиент",
          "req_email": "client@example.com"
        }
      }
    }
  }'
```

### Python — AI Chat

```python
import requests

BASE_URL = "http://localhost:8081/api"

# Chat with AI
response = requests.post(f"{BASE_URL}/chat", json={
    "message": "Привет! Расскажи о себе",
    "model": "openai/gpt-4o",
    "enableTools": False,
    "stream": False
})

print(response.json()["response"])
```

### JavaScript — API v2

```javascript
const client = {
  baseURL: 'http://localhost:8081/api/v2',
  token: null,

  setToken(token) {
    this.token = token;
  },

  async request(method, endpoint, body = null) {
    const headers = {
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json'
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    return response.json();
  }
};

// Использование
const types = await client.request('GET', '/integram/databases/my/types');
console.log(types.data);
```

---

## Дополнительные ресурсы

### Основная документация
- [Полная документация эндпоинтов](API_ENDPOINTS.md) - Все API эндпоинты с форматами запросов/ответов
- [Подключение базы данных](DATABASE_CONNECTION.md) - Настройка MySQL/MariaDB
- [План совместимости с PHP](LEGACY_PHP_COMPATIBILITY_PLAN.md) - Анализ недостающих функций

### API версии 2
- [API v2 Documentation](../backend/monolith/docs/API_V2.md)
- [Modern API Format Specification](api/MODERN_API_FORMAT.md)
- [API Examples](api/EXAMPLES.md)
- [OpenAPI Specification](api/openapi-v2.yaml)

### Миграция
- [Скрипты миграции БД](../scripts/db-migration/README.md)

---

**Версия документации:** 1.1.0
**Дата обновления:** 2026-02-18
**Статус:** Production
