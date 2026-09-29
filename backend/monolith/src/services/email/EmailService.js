/**
 * Email Service for Meeting Invitations
 *
 * Handles sending email invitations, reminders, and meeting updates.
 * Supports SMTP and can be configured to use SendGrid, AWS SES, or other providers.
 *
 * NOTE: This service uses nodemailer for SMTP. For production, configure
 * SMTP credentials in environment variables or integrate with SendGrid/AWS SES.
 *
 * @module EmailService
 */

import logger from '../../utils/logger.js';

/**
 * Email Service Class
 */
class EmailService {
  constructor(config = {}) {
    // Parse SMTP_HOST to handle host:port format (Issue #5136)
    let smtpHost = config.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
    let smtpPort = config.smtpPort || process.env.SMTP_PORT || 587;

    // Check if SMTP_HOST contains port (e.g., "YOUR_SERVER_IP:587")
    if (typeof smtpHost === 'string' && smtpHost.includes(':')) {
      const parts = smtpHost.split(':');
      smtpHost = parts[0]; // Extract host
      if (!config.smtpPort && !process.env.SMTP_PORT) {
        smtpPort = parseInt(parts[1], 10); // Extract port if not explicitly set
      }
      logger.info(`Parsed SMTP_HOST: ${smtpHost}:${smtpPort} (from combined format)`);
    }

    this.config = {
      // SMTP configuration (can be replaced with SendGrid/SES)
      smtpHost,
      smtpPort: parseInt(smtpPort, 10),
      smtpSecure: config.smtpSecure || process.env.SMTP_SECURE === 'true' || false,
      smtpUser: config.smtpUser || process.env.SMTP_USER || '',
      smtpPassword: config.smtpPassword || process.env.SMTP_PASSWORD || '',
      fromEmail: config.fromEmail || process.env.FROM_EMAIL || 'noreply@drondoc.ru',
      fromName: config.fromName || process.env.FROM_NAME || 'DronDoc Conferences',
      ...config
    };

    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialize email transporter
   */
  async initialize() {
    if (this.initialized) {
      logger.debug('Email service already initialized, skipping...');
      return;
    }

    logger.info('='.repeat(70));
    logger.info('📧 EMAIL SERVICE INITIALIZATION (Issue #5136)');
    logger.info('='.repeat(70));
    logger.info(`SMTP Host: ${this.config.smtpHost}`);
    logger.info(`SMTP Port: ${this.config.smtpPort}`);
    logger.info(`SMTP Secure: ${this.config.smtpSecure}`);
    logger.info(`SMTP User: ${this.config.smtpUser || '(none - trusted network)'}`);
    logger.info(`From Email: ${this.config.fromEmail}`);
    logger.info(`From Name: ${this.config.fromName}`);
    logger.info('-'.repeat(70));

    // Dynamic import of nodemailer
    try {
      const nodemailer = (await import('nodemailer')).default;
      logger.info('✓ nodemailer loaded successfully');

      // Configure transporter (auth is optional for trusted networks)
      const transportConfig = {
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpSecure,
        requireTLS: true,
        tls: {
          rejectUnauthorized: false
        },
        // Enable debug logging (Issue #5136)
        debug: true,
        logger: true
      };

      // Add auth only if credentials are provided
      if (this.config.smtpUser && this.config.smtpPassword) {
        transportConfig.auth = {
          user: this.config.smtpUser,
          pass: '***' // Don't log password
        };
        logger.info('✓ SMTP authentication enabled');
        logger.info(`  User: ${this.config.smtpUser}`);
      } else {
        logger.info('✓ SMTP authentication disabled (using trusted network mode)');
      }

      logger.info('Creating nodemailer transporter...');
      this.transporter = nodemailer.createTransport(transportConfig);
      logger.info('✓ Transporter created');

      // Verify connection
      logger.info('Verifying SMTP connection...');
      try {
        await this.transporter.verify();
        logger.info('✓ SMTP connection verified successfully');
        logger.info(`✓ Email service ready: ${this.config.smtpHost}:${this.config.smtpPort}`);
        logger.info('='.repeat(70));
      } catch (error) {
        logger.error('✗ Email service verification failed');
        logger.error(`  Error: ${error.message}`);
        logger.error(`  Code: ${error.code}`);
        logger.error(`  Command: ${error.command}`);
        logger.error('  Full error:', error);
        logger.warn('⚠ Falling back to mock mode (emails will be logged, not sent)');
        logger.info('='.repeat(70));
        this.transporter = null; // Reset transporter on failure
      }
    } catch (error) {
      logger.error('✗ Failed to load nodemailer');
      logger.error(`  Error: ${error.message}`);
      logger.warn('⚠ Using mock mode (emails will be logged, not sent)');
      logger.info('='.repeat(70));
    }

    this.initialized = true;
  }

  /**
   * Send meeting invitation email
   *
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.meetingTitle - Meeting title
   * @param {string} options.startTime - Meeting start time (ISO 8601)
   * @param {string} options.endTime - Meeting end time (ISO 8601)
   * @param {string} options.timezone - Timezone
   * @param {string} options.joinUrl - Join URL
   * @param {string} options.passcode - Meeting passcode (optional)
   * @param {string} options.organizerName - Organizer name
   * @param {string} options.organizerEmail - Organizer email
   * @param {string} options.description - Meeting description
   * @returns {Promise<Object>} Send result
   */
  async sendMeetingInvitation(options) {
    await this.initialize();

    const {
      to,
      meetingTitle,
      startTime,
      endTime,
      timezone,
      joinUrl,
      passcode,
      organizerName,
      organizerEmail,
      description
    } = options;

    const formattedStartTime = new Date(startTime).toLocaleString('ru-RU', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'short'
    });

    const formattedEndTime = new Date(endTime).toLocaleTimeString('ru-RU', {
      timeZone: timezone,
      timeStyle: 'short'
    });

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 Приглашение на видеоконференцию</h1>
          </div>
          <div class="content">
            <h2>${meetingTitle}</h2>
            ${description ? `<p>${description}</p>` : ''}

            <div class="info-box">
              <p><strong>📆 Дата и время:</strong></p>
              <p>${formattedStartTime} - ${formattedEndTime}</p>
              <p><strong>🌍 Часовой пояс:</strong> ${timezone}</p>
            </div>

            <div class="info-box">
              <p><strong>👤 Организатор:</strong></p>
              <p>${organizerName} (${organizerEmail})</p>
            </div>

            ${passcode ? `
            <div class="info-box">
              <p><strong>🔐 Код доступа:</strong></p>
              <p style="font-size: 18px; font-weight: bold; letter-spacing: 2px;">${passcode}</p>
            </div>
            ` : ''}

            <div style="text-align: center;">
              <a href="${joinUrl}" class="button">🎥 Присоединиться к встрече</a>
            </div>

            <p style="margin-top: 20px;">Ссылка для присоединения:</p>
            <p style="background: #fff; padding: 10px; word-break: break-all;">
              <a href="${joinUrl}">${joinUrl}</a>
            </p>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              Вы можете присоединиться к конференции, перейдя по ссылке выше за несколько минут до начала встречи.
            </p>
          </div>
          <div class="footer">
            <p>Это автоматическое письмо от платформы DronDoc</p>
            <p>Если у вас есть вопросы, свяжитесь с организатором встречи.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailText = `
Приглашение на видеоконференцию

${meetingTitle}
${description ? '\n' + description + '\n' : ''}

📆 Дата и время: ${formattedStartTime} - ${formattedEndTime}
🌍 Часовой пояс: ${timezone}
👤 Организатор: ${organizerName} (${organizerEmail})
${passcode ? '🔐 Код доступа: ' + passcode : ''}

🎥 Ссылка для присоединения:
${joinUrl}

Вы можете присоединиться к конференции, перейдя по ссылке выше за несколько минут до начала встречи.

---
Это автоматическое письмо от платформы DronDoc
Если у вас есть вопросы, свяжитесь с организатором встречи.
    `;

    const mailOptions = {
      from: `${this.config.fromName} <${this.config.fromEmail}>`,
      to,
      subject: `Приглашение: ${meetingTitle}`,
      text: emailText,
      html: emailHtml,
      // Calendar invitation (iCalendar format)
      icalEvent: this._generateICalEvent(options)
    };

    return this._sendEmail(mailOptions);
  }

  /**
   * Send meeting reminder
   *
   * @param {Object} options - Reminder options
   * @param {string} options.to - Recipient email
   * @param {string} options.meetingTitle - Meeting title
   * @param {string} options.startTime - Meeting start time
   * @param {string} options.joinUrl - Join URL
   * @param {number} options.minutesBefore - Minutes until meeting starts
   * @returns {Promise<Object>} Send result
   */
  async sendMeetingReminder(options) {
    await this.initialize();

    const { to, meetingTitle, startTime, joinUrl, minutesBefore } = options;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background: #FF9800; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .alert { background: #FFF3CD; border-left: 4px solid #FF9800; padding: 15px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Напоминание о встрече</h1>
          </div>
          <div class="content">
            <div class="alert">
              <p><strong>Ваша встреча начнется через ${minutesBefore} минут!</strong></p>
            </div>

            <h2>${meetingTitle}</h2>
            <p><strong>⏰ Время начала:</strong> ${new Date(startTime).toLocaleString('ru-RU')}</p>

            <div style="text-align: center;">
              <a href="${joinUrl}" class="button">🎥 Присоединиться сейчас</a>
            </div>

            <p style="margin-top: 20px;">Ссылка для присоединения:</p>
            <p style="background: #fff; padding: 10px; word-break: break-all;">
              <a href="${joinUrl}">${joinUrl}</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `${this.config.fromName} <${this.config.fromEmail}>`,
      to,
      subject: `⏰ Напоминание: ${meetingTitle} начнется через ${minutesBefore} мин`,
      html: emailHtml
    };

    return this._sendEmail(mailOptions);
  }

  /**
   * Send meeting cancellation notification
   *
   * @param {Object} options - Cancellation options
   * @returns {Promise<Object>} Send result
   */
  async sendMeetingCancellation(options) {
    await this.initialize();

    const { to, meetingTitle, startTime, organizerName, reason } = options;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f44336; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Встреча отменена</h1>
          </div>
          <div class="content">
            <h2>${meetingTitle}</h2>
            <p><strong>Запланированное время:</strong> ${new Date(startTime).toLocaleString('ru-RU')}</p>
            <p><strong>Организатор:</strong> ${organizerName}</p>
            ${reason ? `<p><strong>Причина отмены:</strong> ${reason}</p>` : ''}
            <p style="margin-top: 20px; color: #666;">
              Эта встреча была отменена организатором. Если у вас есть вопросы, свяжитесь с ${organizerName}.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `${this.config.fromName} <${this.config.fromEmail}>`,
      to,
      subject: `❌ Отменено: ${meetingTitle}`,
      html: emailHtml
    };

    return this._sendEmail(mailOptions);
  }

  /**
   * Generate iCalendar event for meeting invitation
   * @private
   */
  _generateICalEvent(options) {
    const {
      meetingTitle,
      description,
      startTime,
      endTime,
      joinUrl,
      organizerEmail,
      organizerName
    } = options;

    // Format dates for iCal (YYYYMMDDTHHMMSSZ)
    const formatICalDate = (dateStr) => {
      return new Date(dateStr).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DronDoc//Video Conference//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
DTSTART:${formatICalDate(startTime)}
DTEND:${formatICalDate(endTime)}
DTSTAMP:${formatICalDate(new Date().toISOString())}
ORGANIZER;CN=${organizerName}:mailto:${organizerEmail}
UID:${crypto.randomUUID()}@drondoc.ru
SUMMARY:${meetingTitle}
DESCRIPTION:${description || ''} \\n\\nJoin URL: ${joinUrl}
LOCATION:${joinUrl}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

    return {
      filename: 'invitation.ics',
      method: 'REQUEST',
      content: ical
    };
  }

  /**
   * Send email (implementation depends on configured provider)
   * @private
   */
  async _sendEmail(mailOptions) {
    logger.info('='.repeat(70));
    logger.info('📧 SENDING EMAIL (Issue #5136 Debug)');
    logger.info('='.repeat(70));
    logger.info(`From: ${mailOptions.from}`);
    logger.info(`To: ${mailOptions.to}`);
    logger.info(`Subject: ${mailOptions.subject}`);
    logger.info(`Has HTML: ${!!mailOptions.html}`);
    logger.info(`Has Text: ${!!mailOptions.text}`);
    logger.info(`Transporter Ready: ${!!this.transporter}`);
    logger.info('-'.repeat(70));

    // Check if transporter is configured
    if (!this.transporter) {
      // Mock implementation - log email instead of sending
      logger.warn('⚠ MOCK MODE - Email will NOT be actually sent');
      logger.info('Reason: SMTP transporter not configured or verification failed');
      logger.info('-'.repeat(70));
      logger.info('Email Content Preview (first 500 chars):');
      const content = mailOptions.html || mailOptions.text || '';
      logger.info(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      logger.info('='.repeat(70));

      return {
        success: true,
        messageId: 'mock-' + Date.now(),
        mock: true,
        message: 'Email logged (not sent). Configure SMTP credentials to enable real email sending.'
      };
    }

    // Real email sending with nodemailer
    logger.info('Attempting to send email via SMTP...');
    logger.info(`SMTP: ${this.config.smtpHost}:${this.config.smtpPort}`);
    try {
      const startTime = Date.now();
      const info = await this.transporter.sendMail(mailOptions);
      const duration = Date.now() - startTime;

      logger.info('✓ EMAIL SENT SUCCESSFULLY!');
      logger.info(`  Message ID: ${info.messageId}`);
      logger.info(`  Response: ${info.response}`);
      logger.info(`  Duration: ${duration}ms`);
      logger.info(`  Accepted: ${info.accepted?.join(', ') || 'N/A'}`);
      logger.info(`  Rejected: ${info.rejected?.length > 0 ? info.rejected.join(', ') : 'None'}`);
      logger.info('='.repeat(70));

      return {
        success: true,
        messageId: info.messageId,
        mock: false,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected
      };
    } catch (error) {
      logger.error('✗ FAILED TO SEND EMAIL');
      logger.error(`  Error Type: ${error.constructor.name}`);
      logger.error(`  Error Message: ${error.message}`);
      logger.error(`  Error Code: ${error.code}`);
      logger.error(`  Command: ${error.command}`);
      logger.error(`  Response Code: ${error.responseCode}`);
      logger.error(`  Response: ${error.response}`);
      logger.error('  Full Error Stack:');
      logger.error(error.stack);
      logger.info('='.repeat(70));
      throw error;
    }
  }

  /**
   * Send generic email
   *
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text content
   * @param {string} options.html - HTML content (optional)
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(options) {
    await this.initialize();

    const { to, subject, text, html } = options;

    const mailOptions = {
      from: `${this.config.fromName} <${this.config.fromEmail}>`,
      to,
      subject,
      text,
      html: html || text
    };

    return this._sendEmail(mailOptions);
  }
}

// Singleton instance
export const emailService = new EmailService();

export default emailService;
