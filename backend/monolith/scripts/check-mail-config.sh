#!/bin/bash
# Скрипт автоматической проверки конфигурации mail.example.integram.io
# Версия: 1.0
# Дата: 2025-12-15

DOMAIN="example.integram.io"
MAIL_SERVER="mail.example.integram.io"
MAIL_IP="YOUR_SERVER_IP"

echo "╔════════════════════════════════════════════════════════╗"
echo "║   Проверка конфигурации почтового сервера DronDoc      ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

score=0
max_score=7

# Функция для вывода результата
print_result() {
    local test_name=$1
    local result=$2
    local details=$3

    if [ "$result" = "pass" ]; then
        echo -e "${GREEN}✅ PASS${NC} - $test_name"
        ((score++))
    elif [ "$result" = "fail" ]; then
        echo -e "${RED}❌ FAIL${NC} - $test_name"
    else
        echo -e "${YELLOW}⚠️  WARN${NC} - $test_name"
    fi

    if [ -n "$details" ]; then
        echo "   $details"
    fi
    echo ""
}

# 1. Проверка MX записей
echo "1️⃣  Проверка MX записей..."
mx_record=$(dig MX $DOMAIN +short 2>/dev/null | head -1)
if echo "$mx_record" | grep -q "mail.example.integram.io"; then
    print_result "MX запись" "pass" "Найдено: $mx_record"
else
    print_result "MX запись" "fail" "Не найдено корректной MX записи"
fi

# 2. Проверка A записи
echo "2️⃣  Проверка A записи mail сервера..."
a_record=$(dig A $MAIL_SERVER +short 2>/dev/null)
if [ "$a_record" = "$MAIL_IP" ]; then
    print_result "A запись" "pass" "IP: $a_record"
else
    print_result "A запись" "fail" "Ожидался $MAIL_IP, получен: $a_record"
fi

# 3. Проверка SPF записи
echo "3️⃣  Проверка SPF записи..."
spf_record=$(dig TXT $DOMAIN +short 2>/dev/null | grep -i "v=spf1")
if [ -n "$spf_record" ]; then
    if echo "$spf_record" | grep -q "mail.example.integram.io"; then
        print_result "SPF запись" "pass" "$spf_record"
    else
        print_result "SPF запись" "warn" "Найдена, но без mail.example.integram.io: $spf_record"
    fi
else
    print_result "SPF запись" "fail" "SPF запись не найдена"
fi

# 4. Проверка DMARC записи
echo "4️⃣  Проверка DMARC записи..."
dmarc_record=$(dig TXT _dmarc.$DOMAIN +short 2>/dev/null)
if [ -n "$dmarc_record" ]; then
    print_result "DMARC запись" "pass" "$dmarc_record"
else
    print_result "DMARC запись" "fail" "DMARC запись не найдена (рекомендуется добавить)"
fi

# 5. Проверка DKIM записи
echo "5️⃣  Проверка DKIM записи (selector: default)..."
dkim_record=$(dig TXT default._domainkey.$DOMAIN +short 2>/dev/null)
if [ -n "$dkim_record" ]; then
    if echo "$dkim_record" | grep -q "v=DKIM1"; then
        print_result "DKIM запись" "pass" "DKIM настроен"
    else
        print_result "DKIM запись" "warn" "Найдена запись, но формат неверный"
    fi
else
    print_result "DKIM запись" "fail" "DKIM запись не найдена (требуется настройка)"
fi

# 6. Проверка Reverse DNS
echo "6️⃣  Проверка Reverse DNS (PTR)..."
ptr_record=$(dig -x $MAIL_IP +short 2>/dev/null)
if echo "$ptr_record" | grep -q "mail.example.integram.io"; then
    print_result "Reverse DNS" "pass" "PTR: $ptr_record"
else
    print_result "Reverse DNS" "fail" "PTR указывает на: $ptr_record (должен быть mail.example.integram.io)"
fi

# 7. Проверка SMTP соединения
echo "7️⃣  Проверка SMTP соединения..."
smtp_test=$(timeout 5 bash -c "echo QUIT | nc $MAIL_SERVER 25" 2>/dev/null | head -1)
if echo "$smtp_test" | grep -q "220"; then
    print_result "SMTP соединение" "pass" "Сервер отвечает: $smtp_test"
else
    print_result "SMTP соединение" "fail" "Сервер не отвечает на порту 25"
fi

# Итоговая оценка
echo "════════════════════════════════════════════════════════"
percentage=$((score * 100 / max_score))
echo "Оценка: $score/$max_score ($percentage%)"

if [ $percentage -ge 90 ]; then
    echo -e "${GREEN}Отлично!${NC} Конфигурация почти идеальна."
elif [ $percentage -ge 70 ]; then
    echo -e "${YELLOW}Хорошо${NC}, но есть что улучшить."
elif [ $percentage -ge 50 ]; then
    echo -e "${YELLOW}Средне${NC}. Рекомендуется улучшение."
else
    echo -e "${RED}Плохо${NC}. Требуется срочная настройка."
fi

echo ""
echo "Рекомендации:"
if [ $score -lt $max_score ]; then
    echo "  • Прочитайте MAIL_SERVER_IMPROVEMENTS.md для деталей"
    echo "  • Приоритеты: Reverse DNS > DKIM > DMARC > TLS"
    echo "  • Проверьте доставляемость на https://www.mail-tester.com/"
fi

echo "════════════════════════════════════════════════════════"
echo ""

exit 0
