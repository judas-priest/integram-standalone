/**
 * @integram/auth-service - OAuth Service Tests
 *
 * Tests for OAuthService.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthService } from '../src/services/OAuthService.js';

// Mock database service
const createMockDatabase = () => ({
  execSql: vi.fn().mockResolvedValue({ rows: [] }),
  insert: vi.fn().mockResolvedValue(1),
  updateVal: vi.fn().mockResolvedValue(true),
});

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('OAuthService', () => {
  let service;
  let mockDb;
  let mockLogger;

  beforeEach(() => {
    mockDb = createMockDatabase();
    mockLogger = createMockLogger();
    service = new OAuthService({
      database: mockDb,
      logger: mockLogger,
      redirectBase: 'https://app.integram.io',
    });
  });

  describe('provider management', () => {
    it('should list supported providers', () => {
      const providers = service.getSupportedProviders();

      expect(providers).toContain('yandex');
      expect(providers).toContain('vk');
      expect(providers).toContain('mailru');
      expect(providers).toContain('google');
      expect(providers).toContain('github');
    });

    it('should check if provider is supported', () => {
      expect(service.isProviderSupported('yandex')).toBe(true);
      expect(service.isProviderSupported('YANDEX')).toBe(true); // Case insensitive
      expect(service.isProviderSupported('unknown')).toBe(false);
    });

    it('should get provider display name', () => {
      expect(service.getProviderName('yandex')).toBe('Yandex');
      expect(service.getProviderName('vk')).toBe('VKontakte');
      expect(service.getProviderName('google')).toBe('Google');
    });

    it('should check if provider is enabled', () => {
      // Providers without env vars are not enabled
      expect(service.isProviderEnabled('yandex')).toBe(false);

      // Configure a provider
      service.providers.yandex.clientId = 'test-client-id';
      service.providers.yandex.clientSecret = 'test-client-secret';

      expect(service.isProviderEnabled('yandex')).toBe(true);
    });
  });

  describe('state management', () => {
    it('should generate state with database info', () => {
      const state = service.generateState('mydb');

      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(10);
    });

    it('should parse state correctly', () => {
      const state = service.generateState('mydb');
      const parsed = service.parseState(state);

      expect(parsed).toBeDefined();
      expect(parsed.database).toBe('mydb');
      expect(parsed.random).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });

    it('should handle invalid state', () => {
      expect(service.parseState('invalid')).toBeNull();
      expect(service.parseState('')).toBeNull();
      expect(service.parseState(null)).toBeNull();
    });
  });

  describe('authorization URL', () => {
    beforeEach(() => {
      // Configure Yandex provider for testing
      service.providers.yandex.clientId = 'test-client-id';
    });

    it('should generate Yandex authorization URL', () => {
      const url = service.getAuthorizationUrl('yandex', {
        state: 'test-state',
      });

      expect(url).toContain('https://oauth.yandex.ru/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('response_type=code');
      expect(url).toContain('state=test-state');
    });

    it('should generate Google authorization URL', () => {
      service.providers.google.clientId = 'google-client-id';

      const url = service.getAuthorizationUrl('google');

      expect(url).toContain('https://accounts.google.com');
      expect(url).toContain('client_id=google-client-id');
      expect(url).toContain('scope=openid');
    });

    it('should throw for unconfigured provider', () => {
      service.providers.vk.clientId = null;

      expect(() => {
        service.getAuthorizationUrl('vk');
      }).toThrow('not configured');
    });

    it('should throw for unknown provider', () => {
      expect(() => {
        service.getAuthorizationUrl('unknown');
      }).toThrow('Unknown OAuth provider');
    });
  });

  describe('account linking', () => {
    it('should link OAuth account to user', async () => {
      const oauthUser = {
        id: 'oauth-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      // Mock no existing link
      mockDb.execSql.mockResolvedValueOnce({ rows: [] });

      await service.linkAccount('mydb', 1, 'yandex', oauthUser);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'OAuth account linked',
        expect.objectContaining({ provider: 'yandex' })
      );
    });

    it('should update existing OAuth link', async () => {
      const oauthUser = {
        id: 'oauth-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      // Mock existing link
      mockDb.execSql.mockResolvedValueOnce({ rows: [{ id: 999 }] });

      await service.linkAccount('mydb', 1, 'yandex', oauthUser);

      expect(mockDb.updateVal).toHaveBeenCalled();
    });

    it('should unlink OAuth account', async () => {
      await service.unlinkAccount('mydb', 1, 'yandex');

      expect(mockDb.execSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        expect.any(Array),
        expect.any(String)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'OAuth account unlinked',
        expect.objectContaining({ provider: 'yandex' })
      );
    });
  });

  describe('getLinkedAccounts', () => {
    it('should return empty object when no accounts linked', async () => {
      mockDb.execSql.mockResolvedValue({ rows: [] });

      const accounts = await service.getLinkedAccounts('mydb', 1);

      expect(accounts).toEqual({});
    });

    it('should parse linked account data', async () => {
      // Mock finding a linked account for first provider query
      mockDb.execSql
        .mockResolvedValueOnce({
          rows: [{
            val: JSON.stringify({ id: '123', email: 'test@yandex.ru' }),
          }],
        })
        .mockResolvedValue({ rows: [] }); // Rest return empty

      const accounts = await service.getLinkedAccounts('mydb', 1);

      expect(accounts.yandex).toBeDefined();
      expect(accounts.yandex.id).toBe('123');
    });
  });

  describe('error handling', () => {
    it('should handle network errors in exchangeCode', async () => {
      service.providers.yandex.clientId = 'test-client-id';
      service.providers.yandex.clientSecret = 'test-client-secret';

      // Mock fetch to fail
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.exchangeCode('yandex', 'test-code'))
        .rejects.toThrow('Network error');

      global.fetch = originalFetch;
    });
  });
});
