# Dockerfile для production PHP Integram сервера (интеграм.рф)
# Сервер: YOUR_SERVER_IP

FROM php:8.0-apache

# Установка расширений PHP
RUN apt-get update && apt-get install -y \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    zip \
    unzip \
    git \
    curl \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) gd \
    && docker-php-ext-install pdo pdo_mysql mysqli zip \
    && a2enmod rewrite ssl headers proxy proxy_http \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Копирование всех файлов PHP Integram приложения
COPY . /var/www/html/

# Копирование Apache конфигурации
COPY apache-config/integram-rf.conf /etc/apache2/sites-available/integram.conf
COPY apache-config/integram-dual.conf /etc/apache2/conf-available/integram-dual.conf

# Включение конфигураций
RUN a2ensite integram.conf && \
    a2enconf integram-dual && \
    a2dissite 000-default.conf

# Создание директорий для логов
RUN mkdir -p /var/log/httpd && \
    ln -sf /var/log/apache2/error.log /var/log/httpd/integram-rf-error.log && \
    ln -sf /var/log/apache2/access.log /var/log/httpd/integram-rf-access.log

# Установка прав доступа
RUN chown -R www-data:www-data /var/www/html && \
    chmod 755 /var/www/html && \
    chmod 755 /var/www/html/app && \
    chmod 644 /var/www/html/*.php && \
    chmod 644 /var/www/html/*.html && \
    chmod 755 /var/www/html/.htaccess

# Создание самоподписанного SSL сертификата для разработки
RUN mkdir -p /etc/letsencrypt/live/integram && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/letsencrypt/live/integram/privkey.pem \
    -out /etc/letsencrypt/live/integram/fullchain.pem \
    -subj "/C=RU/ST=Moscow/L=Moscow/O=Integram/CN=integram.local"

# Обновление путей к SSL в конфиге
RUN sed -i 's|/etc/letsencrypt/live/xn--80afflxcxn.xn--p1ai|/etc/letsencrypt/live/integram|g' /etc/apache2/sites-available/integram.conf

# Создание директории для логов приложения
RUN mkdir -p /var/www/html/logs && \
    chown www-data:www-data /var/www/html/logs

EXPOSE 80 443

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

CMD ["apache2-foreground"]
