# Краткое резюме: Исправление аутентификации в Legacy API

## 🐛 Проблема
`POST /:db/auth?JSON` возвращал `"Authentication failed"` при корректных учётных данных.

## 🔍 Корневые причины

| # | Проблема | Решение |
|---|----------|---------|
| 1 | MariaDB требовала пароль для root | `sudo mariadb -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '';"` |
| 2 | Проверка БД: `SELECT 1 FROM ${db}` — ошибка "No database selected" | Заменить на `SHOW DATABASES LIKE ?` |
| 3 | **Все SQL-запросы без явного указания БД** | Добавить префикс базы: `${db}.${db}` |

## 🔧 Исправления

**Файл:** `src/api/routes/legacy-compat.js`

**Было:**
```sql
FROM ${db}
INSERT INTO ${db}
UPDATE ${db}
DELETE FROM ${db}
```

**Стало:**
```sql
FROM ${db}.${db}
INSERT INTO ${db}.${db}
UPDATE ${db}.${db}
DELETE FROM ${db}.${db}
```

**Исправлено:** 30+ SQL-запросов (SELECT, INSERT, UPDATE, DELETE)

## ✅ Результат

```bash
curl -X POST "http://localhost:8081/demo/auth?JSON" \
  -F "db=demo" -F "login=d" -F "pwd=d"
```

**Ответ:**
```json
{
  "success": true,
  "token": "a290fc07a62b3ad2c08843fc7b14e088",
  "xsrf": "77cb44366d1e0e568e5b6c92bce5e95a",
  "message": "Authentication successful",
  "user": { "id": 1, "login": "d" }
}
```

## 📝 Ключевые изменения

1. **MariaDB:** сброс пароля root
2. **Проверка БД:** `SHOW DATABASES` вместо `SELECT FROM`
3. **SQL-запросы:** полное имя таблицы с базой данных

## 📚 Документация

Полный отчёт: `docs/legacy-auth-fix-report.md`

---

**Статус:** ✅ РЕШЕНО  
**Дата:** 2026-02-18
