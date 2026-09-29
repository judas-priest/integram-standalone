#!/usr/bin/env node

/**
 * Telegram Lead Generation MCP Server
 *
 * Model Context Protocol (MCP) server for automated Telegram lead generation.
 * Provides tools for:
 * - User authentication (MTProto)
 * - Group/channel scanning and message retrieval
 * - Lead parsing and contact extraction
 * - Automated message sending (commercial proposals)
 *
 * This server acts as a "browser automation for Telegram" similar to Playwright MCP,
 * but operates through Telegram's MTProto API as a regular user account.
 *
 * USAGE PATTERN:
 * 1. Authenticate user with phone number and code
 * 2. Get list of available chats/groups
 * 3. Scan messages from target groups for potential leads
 * 4. Parse contact information (phones, emails, usernames)
 * 5. Generate and send personalized commercial proposals
 * 6. Track sent messages and responses
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

// Telegram API credentials from environment
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '35138704', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || 'CHANGEME_TG_API_HASH';

// In-memory storage for active sessions
// In production, sessions should be encrypted and stored in database
const activeSessions = new Map();
const leadDatabase = new Map(); // Store parsed leads

/**
 * Get or create a Telegram client for a session
 */
async function getClient(sessionString = '') {
  const stringSession = new StringSession(sessionString);
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
    useWSS: false,
    timeout: 30000,
  });

  await client.connect();
  return client;
}

/**
 * Parse lead information from message text
 * Extracts phones, emails, Telegram usernames, company names
 */
function parseLeadFromMessage(messageText, sender) {
  const lead = {
    text: messageText,
    sender: sender,
    contacts: {
      phones: [],
      emails: [],
      usernames: [],
      websites: []
    },
    keywords: []
  };

  // Extract phone numbers (various formats)
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  lead.contacts.phones = [...new Set((messageText.match(phoneRegex) || []).map(p => p.trim()))];

  // Extract emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  lead.contacts.emails = [...new Set(messageText.match(emailRegex) || [])];

  // Extract Telegram usernames
  const usernameRegex = /@([a-zA-Z0-9_]{5,})/g;
  const usernames = messageText.match(usernameRegex) || [];
  lead.contacts.usernames = [...new Set(usernames.map(u => u.substring(1)))];

  // Extract websites
  const websiteRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
  lead.contacts.websites = [...new Set(messageText.match(websiteRegex) || [])];

  // Extract potential keywords (for lead qualification)
  const keywords = ['ищу', 'нужен', 'требуется', 'куплю', 'заказ', 'проект',
                    'разработка', 'автоматизация', 'интеграция', 'бот', 'агент', 'ai', 'ии'];
  lead.keywords = keywords.filter(kw => messageText.toLowerCase().includes(kw));

  return lead;
}

/**
 * MCP Server
 */
const server = new Server(
  {
    name: 'telegram-lead-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List all available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'telegram_lead_authenticate',
        description: 'Authenticate Telegram user with phone number and verification code. Returns session string for future operations.',
        inputSchema: {
          type: 'object',
          properties: {
            phone_number: {
              type: 'string',
              description: 'Phone number in international format (e.g., +79001234567)'
            },
            code: {
              type: 'string',
              description: 'Verification code sent to the phone (optional, only needed after send_code)'
            },
            password: {
              type: 'string',
              description: '2FA password if enabled (optional)'
            },
            session: {
              type: 'string',
              description: 'Existing session string to restore (optional)'
            }
          }
        }
      },
      {
        name: 'telegram_lead_get_groups',
        description: 'Get list of groups/channels user is subscribed to. Returns filterable list of chats.',
        inputSchema: {
          type: 'object',
          properties: {
            session: {
              type: 'string',
              description: 'Session string from authentication'
            },
            filter_type: {
              type: 'string',
              description: 'Filter by type: all, groups, supergroups, channels, private',
              enum: ['all', 'groups', 'supergroups', 'channels', 'private']
            },
            limit: {
              type: 'number',
              description: 'Maximum number of chats to return (default: 100)',
              default: 100
            }
          },
          required: ['session']
        }
      },
      {
        name: 'telegram_lead_scan_messages',
        description: 'Scan messages from a specific group/channel for potential leads. Extracts contacts and keywords.',
        inputSchema: {
          type: 'object',
          properties: {
            session: {
              type: 'string',
              description: 'Session string from authentication'
            },
            chat_id: {
              type: 'string',
              description: 'Chat/group ID or username to scan'
            },
            limit: {
              type: 'number',
              description: 'Number of messages to scan (default: 100)',
              default: 100
            },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keywords to filter messages (optional)'
            },
            min_date: {
              type: 'string',
              description: 'Filter messages after this date (ISO format, optional)'
            }
          },
          required: ['session', 'chat_id']
        }
      },
      {
        name: 'telegram_lead_parse_leads',
        description: 'Parse contact information from messages. Extracts phones, emails, usernames, websites.',
        inputSchema: {
          type: 'object',
          properties: {
            session: {
              type: 'string',
              description: 'Session string'
            },
            chat_id: {
              type: 'string',
              description: 'Chat ID'
            },
            message_ids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Array of message IDs to parse (optional, scans recent if omitted)'
            },
            limit: {
              type: 'number',
              description: 'Number of messages to parse if message_ids not provided',
              default: 50
            }
          },
          required: ['session', 'chat_id']
        }
      },
      {
        name: 'telegram_lead_send_proposal',
        description: 'Send personalized commercial proposal to a user. Requires message template.',
        inputSchema: {
          type: 'object',
          properties: {
            session: {
              type: 'string',
              description: 'Session string'
            },
            user_id: {
              type: 'string',
              description: 'User ID or username to send message to'
            },
            message: {
              type: 'string',
              description: 'Message text (commercial proposal)'
            },
            delay: {
              type: 'number',
              description: 'Delay in seconds before sending (to avoid spam detection)',
              default: 5
            }
          },
          required: ['session', 'user_id', 'message']
        }
      },
      {
        name: 'telegram_lead_get_user_info',
        description: 'Get detailed information about a user/contact.',
        inputSchema: {
          type: 'object',
          properties: {
            session: {
              type: 'string',
              description: 'Session string'
            },
            user_id: {
              type: 'string',
              description: 'User ID or username'
            }
          },
          required: ['session', 'user_id']
        }
      },
      {
        name: 'telegram_lead_get_sent_messages',
        description: 'Get list of sent messages (proposals) for tracking.',
        inputSchema: {
          type: 'object',
          properties: {
            session: {
              type: 'string',
              description: 'Session string'
            },
            limit: {
              type: 'number',
              description: 'Number of messages to retrieve',
              default: 20
            }
          },
          required: ['session']
        }
      },
      {
        name: 'telegram_lead_logout',
        description: 'Logout user and clear session.',
        inputSchema: {
          type: 'object',
          properties: {
            session: {
              type: 'string',
              description: 'Session string to invalidate'
            }
          },
          required: ['session']
        }
      }
    ]
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'telegram_lead_authenticate': {
        const { phone_number, code, password, session: existingSession } = args;

        if (existingSession) {
          // Restore existing session
          const client = await getClient(existingSession);
          const me = await client.getMe();

          activeSessions.set(existingSession, {
            client,
            user: me,
            timestamp: Date.now()
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                session: existingSession,
                user: {
                  id: me.id?.toString(),
                  first_name: me.firstName,
                  username: me.username
                }
              }, null, 2)
            }]
          };
        }

        if (!phone_number) {
          throw new Error('phone_number is required for new authentication');
        }

        const client = await getClient();

        if (!code) {
          // Step 1: Send verification code
          const result = await client.sendCode(
            { apiId: API_ID, apiHash: API_HASH },
            phone_number
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                step: 'code_sent',
                phone_code_hash: result.phoneCodeHash,
                message: 'Verification code sent. Please call this tool again with the code.'
              }, null, 2)
            }]
          };
        }

        // Step 2: Verify code and authenticate
        try {
          await client.start({
            phoneNumber: phone_number,
            phoneCode: async () => code,
            password: async () => password || '',
            onError: (err) => { throw err; }
          });

          const me = await client.getMe();
          const sessionString = client.session.save();

          activeSessions.set(sessionString, {
            client,
            user: me,
            timestamp: Date.now()
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                session: sessionString,
                user: {
                  id: me.id?.toString(),
                  first_name: me.firstName,
                  last_name: me.lastName,
                  username: me.username,
                  phone: me.phone
                }
              }, null, 2)
            }]
          };
        } catch (error) {
          if (error.message?.includes('SESSION_PASSWORD_NEEDED') && !password) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  requires_password: true,
                  message: '2FA is enabled. Please call again with password parameter.'
                }, null, 2)
              }]
            };
          }
          throw error;
        }
      }

      case 'telegram_lead_get_groups': {
        const { session, filter_type = 'all', limit = 100 } = args;

        if (!activeSessions.has(session)) {
          const client = await getClient(session);
          const me = await client.getMe();
          activeSessions.set(session, { client, user: me, timestamp: Date.now() });
        }

        const { client } = activeSessions.get(session);
        const dialogs = await client.getDialogs({ limit });

        let chats = dialogs.map(dialog => {
          const entity = dialog.entity;
          let type = 'private';

          if (entity?.className === 'Channel') {
            type = entity.broadcast ? 'channel' : 'supergroup';
          } else if (entity?.className === 'Chat') {
            type = 'group';
          }

          return {
            id: dialog.id?.toString(),
            title: dialog.title || dialog.name || 'Unknown',
            username: entity?.username || null,
            type,
            members_count: entity?.participantsCount || 0,
            unread_count: dialog.unreadCount || 0
          };
        });

        // Filter by type
        if (filter_type !== 'all') {
          const typeMap = {
            'groups': 'group',
            'supergroups': 'supergroup',
            'channels': 'channel',
            'private': 'private'
          };
          chats = chats.filter(c => c.type === typeMap[filter_type]);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, chats, total: chats.length }, null, 2)
          }]
        };
      }

      case 'telegram_lead_scan_messages': {
        const { session, chat_id, limit = 100, keywords = [], min_date } = args;

        if (!activeSessions.has(session)) {
          const client = await getClient(session);
          activeSessions.set(session, { client, timestamp: Date.now() });
        }

        const { client } = activeSessions.get(session);
        const messages = await client.getMessages(chat_id, { limit });

        let scannedMessages = messages.map(msg => ({
          id: msg.id,
          date: msg.date,
          text: msg.text || '',
          sender_id: msg.senderId?.toString(),
          sender_name: msg.sender?.firstName || msg.sender?.title || 'Unknown',
          views: msg.views || 0,
          has_media: !!msg.media
        }));

        // Filter by date
        if (min_date) {
          const minTimestamp = new Date(min_date).getTime() / 1000;
          scannedMessages = scannedMessages.filter(m => m.date >= minTimestamp);
        }

        // Filter by keywords
        if (keywords.length > 0) {
          scannedMessages = scannedMessages.filter(m =>
            keywords.some(kw => m.text.toLowerCase().includes(kw.toLowerCase()))
          );
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              messages: scannedMessages,
              total: scannedMessages.length,
              chat_id
            }, null, 2)
          }]
        };
      }

      case 'telegram_lead_parse_leads': {
        const { session, chat_id, message_ids, limit = 50 } = args;

        if (!activeSessions.has(session)) {
          const client = await getClient(session);
          activeSessions.set(session, { client, timestamp: Date.now() });
        }

        const { client } = activeSessions.get(session);

        let messages;
        if (message_ids && message_ids.length > 0) {
          messages = await client.getMessages(chat_id, { ids: message_ids });
        } else {
          messages = await client.getMessages(chat_id, { limit });
        }

        const leads = messages
          .filter(msg => msg.text && msg.text.length > 0)
          .map(msg => {
            const sender = {
              id: msg.senderId?.toString(),
              name: msg.sender?.firstName || msg.sender?.title || 'Unknown',
              username: msg.sender?.username || null
            };
            const lead = parseLeadFromMessage(msg.text, sender);
            lead.message_id = msg.id;
            lead.date = msg.date;
            return lead;
          })
          .filter(lead =>
            lead.contacts.phones.length > 0 ||
            lead.contacts.emails.length > 0 ||
            lead.contacts.usernames.length > 0 ||
            lead.keywords.length > 0
          );

        // Store leads in memory
        leads.forEach(lead => {
          const leadId = `${chat_id}_${lead.message_id}`;
          leadDatabase.set(leadId, lead);
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              leads,
              total: leads.length,
              chat_id
            }, null, 2)
          }]
        };
      }

      case 'telegram_lead_send_proposal': {
        const { session, user_id, message, delay = 5 } = args;

        if (!activeSessions.has(session)) {
          const client = await getClient(session);
          activeSessions.set(session, { client, timestamp: Date.now() });
        }

        const { client } = activeSessions.get(session);

        // Add delay to avoid spam detection
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }

        // Send message
        const result = await client.sendMessage(user_id, { message });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message_id: result.id,
              date: result.date,
              recipient: user_id,
              message: 'Proposal sent successfully'
            }, null, 2)
          }]
        };
      }

      case 'telegram_lead_get_user_info': {
        const { session, user_id } = args;

        if (!activeSessions.has(session)) {
          const client = await getClient(session);
          activeSessions.set(session, { client, timestamp: Date.now() });
        }

        const { client } = activeSessions.get(session);
        const user = await client.getEntity(user_id);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              user: {
                id: user.id?.toString(),
                first_name: user.firstName,
                last_name: user.lastName,
                username: user.username,
                phone: user.phone,
                bot: user.bot || false,
                verified: user.verified || false
              }
            }, null, 2)
          }]
        };
      }

      case 'telegram_lead_get_sent_messages': {
        const { session, limit = 20 } = args;

        if (!activeSessions.has(session)) {
          const client = await getClient(session);
          activeSessions.set(session, { client, timestamp: Date.now() });
        }

        const { client } = activeSessions.get(session);
        const me = await client.getMe();

        // Get messages sent by the user (from "Saved Messages")
        const messages = await client.getMessages('me', { limit });

        const sentMessages = messages.map(msg => ({
          id: msg.id,
          date: msg.date,
          text: msg.text || '',
          to_id: msg.peerId?.userId?.toString()
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              messages: sentMessages,
              total: sentMessages.length
            }, null, 2)
          }]
        };
      }

      case 'telegram_lead_logout': {
        const { session } = args;

        if (activeSessions.has(session)) {
          const { client } = activeSessions.get(session);
          try {
            await client.invoke(new Api.auth.LogOut());
            await client.disconnect();
          } catch (e) {
            // Ignore errors on logout
          }
          activeSessions.delete(session);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, message: 'Logged out successfully' }, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error.message,
          tool: name
        }, null, 2)
      }],
      isError: true
    };
  }
});

/**
 * Start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Telegram Lead Generation MCP Server running on stdio');
}

main().catch(console.error);
