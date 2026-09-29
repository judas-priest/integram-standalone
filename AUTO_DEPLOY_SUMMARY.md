# Автоматический деплой Integram Standalone

## Настройка завершена ✓

### Компоненты

1. **Скрипт деплоя**: `/usr/local/bin/integram-autodeploy.sh`
   - Проверяет обновления с GitHub
   - Выполняет git reset --hard origin/master
   - Устанавливает зависимости (npm install)
   - Собирает frontend (npm run build)

2. **Systemd сервис**: `/etc/systemd/system/integram-autodeploy.service`
   - Запускает скрипт деплоя
   - Логи в journalctl

3. **Systemd таймер**: `/etc/systemd/system/integram-autodeploy.timer`
   - Запускается каждые 30 минут
   - Первый запуск через 5 минут после загрузки

### Управление

```bash
# Проверить статус автодеплоя
systemctl status integram-autodeploy.timer

# Запустить деплой вручную
systemctl start integram-autodeploy.service

# Посмотреть логи
tail -f /var/log/integram-autodeploy.log
journalctl -u integram-autodeploy -f

# Остановить автодеплой
systemctl stop integram-autodeploy.timer
systemctl disable integram-autodeploy.timer

# Запустить заново
systemctl enable integram-autodeploy.timer
systemctl start integram-autodeploy.timer
```

### Расписание

- **Интервал**: Каждые 30 минут
- **Первый запуск**: Через 5 минут после загрузки системы
- **Следующий запуск**: Через 30 минут после последнего

Проверить расписание:
```bash
systemctl list-timers integram-autodeploy.timer
```

### Логи

**Лог деплоя**: `/var/log/integram-autodeploy.log`
```bash
[2025-12-25 20:39:51] Deploy completed successfully!
```

**Systemd журнал**:
```bash
journalctl -u integram-autodeploy.service -n 50
```

### Процесс автодеплоя

1. Запускается по таймеру каждые 30 минут
2. Проверяет `git fetch origin master`
3. Сравнивает локальный и remote HEAD
4. Если обновления есть:
   - `git reset --hard origin/master` (перезаписывает локальные изменения!)
   - `npm install` (обновляет зависимости)
   - `npm run build` (собирает frontend)
5. Если обновлений нет - завершается без действий

### Что обновляется

✅ **Автоматически обновляется:**
- Frontend код (src/*)
- package.json зависимости
- Vite конфигурация
- Собранный dist/

❌ **НЕ обновляется:**
- Node.js backend (нет в репозитории)
- Nginx конфигурация
- Apache настройки
- Systemd сервисы

### Изменения в коде

**1. Динамические API пути** (`src/axios2.js`)
```javascript
// Автоопределение сервера
const hostname = window.location.hostname
const protocol = window.location.protocol

// IP адреса используют текущий протокол
if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
  return `${protocol}//${hostname}/${db}/`
}

// Доменные имена → всегда https
return `https://${hostname}/${db}/`
```

**2. Кнопка "Войти"** (`src/components/onboarding/WelcomeScreen.vue`)
- Изменено: "Начать" → "Войти"
- Редирект: `/dashboard?startTour=true` → `/login`

**3. Зависимости** (`package.json`)
Добавлены:
- html2canvas
- jspdf
- xlsx
- marked
- dompurify
- sortablejs

### Проверка работы

**Доступ к интерфейсам:**
- Старый PHP: http://YOUR_SERVER_IP/
- Новый Vue.js: http://YOUR_SERVER_IP/app/welcome

**API запросы:**
- Автоматически используют http://YOUR_SERVER_IP/a2025/
- Вместо hardcoded https://dronedoc.ru/a2025/

**Следующий автодеплой:**
```bash
systemctl list-timers integram-autodeploy.timer
# NEXT: через ~30 минут после последнего запуска
```

### Troubleshooting

**Проблема: Build failed**
```bash
# Проверить логи
tail -50 /var/log/integram-autodeploy.log

# Попробовать вручную
cd /var/www/integram-standalone
git status
npm install
npm run build
```

**Проблема: Git errors**
```bash
# Проверить состояние репозитория
cd /var/www/integram-standalone
git status
git log -3

# Сбросить если нужно
git reset --hard origin/master
```

**Проблема: Timer не запускается**
```bash
systemctl status integram-autodeploy.timer
systemctl restart integram-autodeploy.timer
```

---

**Создано**: 2025-12-25  
**Сервер**: YOUR_SERVER_IP  
**Интервал**: 30 минут  
**Статус**: ✅ Работает
