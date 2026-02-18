// index.js - Monolithic Integram Backend Server
// IMPORTANT: Load environment variables FIRST, before any other imports
// Issue #1402: Database pool creation requires env vars to be loaded
import './config/env.js';

import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { TaskQueue } from './core/TaskQueue.js';
import { AgentRegistry } from './core/AgentRegistry.js';
import { Coordinator } from './core/Coordinator.js';
import { MessageQueue } from './core/MessageQueue.js';
import { AgentManager } from './services/AgentManager.js';
import { MultiAgentOrchestrator } from './services/MultiAgentOrchestrator.js';
import { createTaskRoutes } from './api/routes/tasks.js';
import { createAgentRoutes } from './api/routes/agents.js';
import { createOrchestratorRoutes } from './api/routes/orchestrator.js';
import { createMemoryCacheAgentRoutes } from './api/routes/memory-cache-agent.js';
import { createHealthRoutes } from './api/routes/health.js';
import { createDeploymentInfoRoutes } from './api/routes/deployment-info.js';
import { createWebhookRoutes } from './api/routes/webhook.js';
import { createMenuConfigRoutes } from './api/routes/menuConfig.js';
import { createMenuConfigUnifiedRoutes } from './api/routes/menuConfigUnified.js';
import { createRecordingRoutes } from './api/routes/recording.js';
import { createCloudRecordingRoutes } from './api/routes/cloudRecording.js';
import { createScheduledMeetingsRoutes } from './api/routes/scheduledMeetings.js';
import { createTgstatRoutes } from './api/routes/tgstat.js';
import { createYouTubeRoutes } from './api/routes/youtube.js';
import aiTokenRoutes from './api/routes/ai-tokens.js';
import aiCellRoutes from './api/routes/ai-cell.js';
import { createScraperRoutes } from './api/routes/scraper.js';
import { createKnowledgeRoutes } from './api/routes/knowledge.js';
import { createKAGRoutes } from './api/routes/kag.js';
import { createKAGMCPRoutes } from './api/routes/mcp-kag.js';
import { createGroupParserRoutes } from './api/routes/group-parser.js';
import { createTelegramUserAuthRoutes } from './api/routes/telegram-user-auth.js';
import { createTelegramLeadAgentRoutes } from './api/routes/telegram-lead-agent.js';
import { createMarketplaceAnalyticsRoutes } from './api/routes/marketplace-analytics.js';
import businessMetricsRoutes from './api/routes/business-metrics.js';
import feedbackRoutes from './api/routes/feedback.js';
import generalChatRoutes from './api/routes/general-chat.js';
import { createVKParserRoutes } from './api/routes/vk-parser.js';
import { createVKSubscriberBotRoutes } from './api/routes/vk-subscriber-bot.js';
import { createPublicChannelParserRoutes } from './api/routes/public-channel-parser.js';
import torgiParserRoutes from './api/routes/torgi-parser.js';
import agroProductsRoutes from './api/routes/agro-products.js';
import agroRecipesRoutes from './api/routes/agro-recipes.js';
import recipeCalculatorRoutes from './api/routes/recipe-calculator.js';
import { createAgriculturalMissionRoutes } from './api/routes/agricultural-missions.js';
import { createMissionOperationRoutes } from './api/routes/mission-operations.js';
import { createCalculatorRoutes } from './api/routes/agricultural-calculators.js';
import agriculturalAiRoutes from './api/routes/agricultural-ai.js';
import { createAeroDronesRoutes } from './api/routes/aero-drones.js';
import { createAeroMissionsRoutes } from './api/routes/aero-missions.js';
import { createAeroDataRoutes } from './api/routes/aero-data.js';
import { createAeroAnalyticsRoutes } from './api/routes/aero-analytics.js';
import youtubeAiRoutes from './api/routes/youtube-ai.js';
import integrationAgentRoutes from './api/routes/integration-agent.js';
import externalIntegrationsRoutes from './api/routes/external-integrations.js';
import webhooksRoutes from './api/routes/webhooks.js';
import onecAgentRoutes from './api/routes/onec-agent.js';
import voiceAgentRoutes from './api/routes/voice-agent.js';
import autoCallRoutes from './api/routes/auto-call.js';
import { createSalesAgentRoutes } from './api/routes/sales-agent.js';
import { createMonitoringAlertsRoutes } from './api/routes/monitoring-alerts.js';
import { createBillingRoutes } from './api/routes/billing.js';
import { createPaymentRoutes } from './api/routes/payments.js';
import customerSupportRoutes from './api/routes/customer-support.js';
import devHelperRoutes from './api/routes/dev-helper.js';
import customerSupportBotRoutes from './api/routes/customer-support-bot.js';
import customerJourneyRoutes from './api/routes/customer-journey.js';
import guestUsersRoutes from './api/routes/guest-users.js';
import contentMarketingRoutes from './api/routes/content-marketing.js';
import leadsRoutes from './api/routes/leads.js';
import crmIntegrationRoutes from './api/routes/crm-integration.js';
import { createMCPRoutes } from './api/routes/mcp.js';
import chatRoutes from './api/routes/chat.js'; // UNIFIED CHAT ENDPOINT
// DEPRECATED: Direct provider endpoints removed - use /api/chat instead
// import { createClaudeChatRoutes } from './api/routes/claude-chat.js';
import { createWorkspaceChatRoutes } from './api/routes/workspace-chat.js';
import { createWorkspaceAgentRoutes } from './api/routes/workspace-agent.js';
import workspaceAiAgentRoutes from './api/workspace-ai-agent.js';
import cliRoutes from './api/cli.js';
import terminalRoutes from './api/terminal.js';
import { createGitHubAPIRoutes } from './api/routes/github-api.js';
import { createGitAuthRoutes } from './api/routes/git-auth.js';
import { createClaudeProxyRoutes } from './api/routes/claude-proxy.js';
import { createClaudeCodeProxyRoutes } from './api/routes/claude-code-proxy.js';
import { createClaudeProxyLayerRoutes } from './api/routes/claude-proxy-layer.js';
import { createDeepAssistantRoutes } from './api/routes/deep-assistant.js';
import travelAccommodationRoutes from './api/routes/travel-accommodation.js';
import { createAccountingRoutes } from './api/routes/accounting.js';
import messagingRoutes from './api/routes/messaging.js';
import authRoutes from './api/routes/auth.js';
import emailAuthRoutes from './api/routes/email-auth.js';
import legacyCompatRoutes from './api/routes/legacy-compat.js';
import path from 'path';
import { fileURLToPath } from 'url';
import adminRoutes from './api/routes/admin.js';
import userSyncRoutes from './api/routes/user-sync.js';
import tokenManagementRoutes from './api/routes/token-management.js';
import oauthRoutes from './api/routes/oauth.js';
import unifiedAuthRoutes from './api/routes/unified-auth.js';
import securityRoutes from './api/routes/security.js';
import errorReportsRoutes from './api/routes/error-reports.js';
import innParserRoutes from './api/routes/innParser.js';
import egrulRoutes from './api/routes/egrul.js';
import egrulItsoftRoutes from './api/routes/egrul-itsoft.js';
import egrulExtractIntegramRoutes from './api/routes/egrul-extract-integram.js';
import egrulFullImportRoutes from './api/routes/egrul-full-import.js';
import fsspRoutes from './api/routes/fssp.js';
import chatAgentRoutes from './api/routes/chat-agent.js';
import { createHHProxyRoutes } from './api/routes/hh-proxy.js';
import codeReviewRoutes from './api/routes/code-review.js';
import codeAnalyzerRoutes from './api/routes/code-analyzer.js';
import techDebtRoutes from './api/routes/tech-debt.js';
import { createTestRunnerRoutes } from './api/routes/test-runner.js';
import { createCICDTestingRoutes } from './api/routes/ci-cd-testing.js';
import { createSelfHealingRoutes } from './api/routes/self-healing.js';
import { createSystemResourcesRoutes } from './api/routes/system-resources.js';
import { createStorageManagementRoutes } from './api/routes/storage-management.js';
import { createAutoScalingRoutes } from './api/routes/auto-scaling.js';
import anomalyDetectionRoutes from './api/routes/anomaly-detection.js';
import syntheticMonitoringRoutes from './api/routes/synthetic-monitoring.js';
import purchaseJourneyTestingRoutes from './api/routes/purchase-journey-testing.js';
import { createExternalApiMonitorRoutes } from './api/routes/external-api-monitor.js';
import loggingAuditRoutes from './api/routes/logging-audit.js';
import backupRoutes from './api/routes/backup.js';
import dataSyncRoutes from './api/routes/data-sync.js';
import notificationsRoutes from './api/routes/notifications.js';
import { createDatabaseManagerRoutes } from './api/routes/database-manager.js';
import databaseAgentRoutes from './api/routes/database-agent.js';
import mlopsAgentRoutes from './api/routes/mlops-agent.js';
import featureFlagsRoutes from './api/routes/feature-flags.js';
import githubPagesRoutes from './api/routes/github-pages.js';
import { createRoleSetRoutes } from './api/routes/role-sets.js';
import { createLogsRoutes } from './api/routes/logs.js';
import backendDashboardRoutes from './api/routes/backend-dashboard.js';
import { createSolveRoutes } from './api/routes/solve.js';
import { createProcessExecutionRoutes } from './api/routes/process-execution.js';
import secretsRoutes from './api/routes/secrets.js';
import organizationsRoutes from './api/routes/organizations.js';
import organizationSecretsRoutes from './api/routes/organization-secrets.js';
import healthChecksRoutes from './api/routes/health-checks.js';
import { createPolzaRoutes } from './api/routes/polza.js';
import dataSourcesRoutes from './api/routes/data-sources.js';
import agentRegistryRoutes from './api/routes/agent-registry.js';
import agentInstancesRoutes from './api/routes/agent-instances.js';
import customAgentsRoutes from './api/routes/custom-agents.js';
import drondocAgentsRoutes from './api/routes/drondoc-agents.js';
import { createIntegramAgentsIntegramRoutes } from './api/routes/integram-agents.js';
import ensemblesRoutes from './api/routes/ensembles.js';
import { createApiGatewayRoutes } from './api/routes/api-gateway.js';
import { createAgentCreatorRoutes } from './api/routes/agent-creator.js';
import orbityRoutes from './api/routes/orbity.js';
import sgrAgentsRoutes from './api/routes/sgr-agents.js';
import configRoutes from './api/routes/config.js';
import unifiedInterfaceRoutes from './api/routes/unified-interface.js';
import integramOrganizationsRoutes from './api/routes/integram-organizations.js';
import profileRoutes from './api/routes/profile.js';
import proposalGeneratorRoutes from './api/routes/proposal-generator.js';
import { OrchestratorWebSocket } from './api/websocket.js';
import { ClaudeTerminalHandler } from './api/handlers/claudeTerminalHandler.js';
import { notificationTrigger } from './services/notifications/notificationTriggerService.js';
import initDefaultUser from './scripts/init-default-user.js';
import { errorHandler } from './api/middleware/errorHandler.js';
import { selfHealingErrorHandler, setupProcessErrorHandlers } from './api/middleware/selfHealingErrorHandler.js';
import { requestLogger } from './api/middleware/requestLogger.js';
import logger from './utils/logger.js';
import BackendHealthMonitor from './services/health/BackendHealthMonitor.js';
import { MemoryMonitor } from './utils/memoryOptimization.js';

// Security middleware (Issue #77, #1890, #66)
import {
  securityHeaders,
  additionalSecurityHeaders,
  corsOptions as secureCorsOptions,
  ensureCorsHeaders,
  developmentSecurityHeaders
} from './middleware/security/securityHeaders.js';
import { generateCspNonce } from './middleware/security/cspNonce.js';
import {
  apiLimiter,
  authLimiter,
  registerLimiter,
  passwordResetLimiter,
  verificationLimiter,
  burstLimiter,
} from './middleware/security/rateLimiter.js';
import {
  checkIPBlock,
  botDetection,
  trackFailedLogin,
  credentialStuffingDetection,
} from './middleware/security/abuseDetection.js';
import {
  blockBlacklistedIPs,
  markWhitelistedIPs,
} from './middleware/security/ipFilter.js';
import {
  validatePayloadSize,
  validateQueryParams,
  validateRequestBody,
} from './middleware/security/requestValidation.js';

/**
 * Integram Monolithic Backend
 * Consolidates: Orchestrator, YouTube Analytics, MCP Server, Accounting App
 */
class IntegramBackend {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 8081,
      httpsEnabled: config.httpsEnabled || process.env.HTTPS_ENABLED === 'true',
      sslCertPath: config.sslCertPath || process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/drondoc.ru/fullchain.pem',
      sslKeyPath: config.sslKeyPath || process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/drondoc.ru/privkey.pem',
      ...config
    };

    // Initialize core orchestrator components
    this.taskQueue = new TaskQueue({
      maxRetries: this.config.maxRetries || 3,
      taskTimeout: this.config.taskTimeout || 300000
    });

    this.agentRegistry = new AgentRegistry({
      heartbeatInterval: this.config.heartbeatInterval || 30000,
      heartbeatTimeout: this.config.heartbeatTimeout || 90000
    });

    this.coordinator = new Coordinator(this.taskQueue, this.agentRegistry, {
      pollInterval: this.config.pollInterval || 1000,
      assignmentStrategy: this.config.assignmentStrategy || 'round-robin'
    });

    // Initialize AgentManager for advanced agent orchestration (Issue #2459)
    this.agentManager = new AgentManager({
      registry: this.agentRegistry
    });

    // Initialize MultiAgentOrchestrator for multi-agent network management (Issue #2700, #2701)
    this.multiAgentOrchestrator = new MultiAgentOrchestrator({
      agentRegistry: this.agentRegistry,
      agentManager: this.agentManager
    });

    this.messageQueue = null;
    this.app = null;
    this.server = null;
    this.websocket = null;
    this.healthMonitor = null;
    this.memoryMonitor = null;

    logger.info('Integram Monolithic Backend initialized', this.config);
  }

  /**
   * Initialize Express app and all routes
   */
  setupExpress() {
    this.app = express();

    // ========================================
    // Security Middleware (Issue #77, #1890)
    // Apply BEFORE all other middleware
    // ========================================

    // 1. Trust proxy (for correct IP detection behind reverse proxy)
    this.app.set('trust proxy', 1);

    // 2. Generate CSP nonce for each request (Issue #66)
    // This must be BEFORE security headers so the nonce is available for CSP
    this.app.use(generateCspNonce);

    // 3. Ensure CORS headers on all responses (Issue #1890)
    // This must be BEFORE other middleware to ensure headers are set even on errors
    this.app.use(ensureCorsHeaders);

    // 4. Security headers (Helmet)
    this.app.use(securityHeaders);
    this.app.use(additionalSecurityHeaders);
    if (process.env.NODE_ENV === 'development') {
      this.app.use(developmentSecurityHeaders);
    }

    // 5. CORS with security options (additional layer)
    this.app.use(cors(secureCorsOptions));

    // 6. IP filtering (block blacklisted, mark whitelisted)
    this.app.use(blockBlacklistedIPs);
    this.app.use(markWhitelistedIPs);

    // 7. Request validation
    this.app.use(validatePayloadSize);
    this.app.use(validateQueryParams);

    // 8. Body parsing with size limits
    this.app.use(express.json({ limit: '10mb' })); // Reduced from 50mb for security
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 9. Request body validation (after parsing)
    this.app.use(validateRequestBody);

    // 10. Request logging
    this.app.use(requestLogger);

    // ========================================
    // Health Check Routes (BEFORE rate limiting)
    // Issue #2633: Health endpoints must be accessible for monitoring
    // and should not be rate-limited
    // ========================================
    this.app.use('/api', createHealthRoutes(this));

    // ========================================
    // Deployment Info Routes (Issue #5069)
    // Display last update time and branch status
    // ========================================
    this.app.use('/api', createDeploymentInfoRoutes());
    console.log('✅ [MONOLITH] Deployment Info routes registered at /api/deployment-info (Issue #5069)');

    // ========================================
    // GitHub Webhook Routes
    // Auto-deployment on push to dev branch
    // ========================================
    this.app.use('/api/webhook', createWebhookRoutes());
    console.log('✅ [MONOLITH] GitHub Webhook routes registered at /api/webhook/github');

    // ========================================
    // Backend Dashboard and Logs Routes (BEFORE rate limiting)
    // Issue #4034: Dashboard and logs endpoints need unrestricted access
    // for system monitoring and debugging
    // ========================================
    this.app.use('/api/backend-dashboard', backendDashboardRoutes);
    this.app.use('/api/logs', createLogsRoutes());

    // 10. Abuse detection
    this.app.use(checkIPBlock);
    this.app.use(botDetection);
    this.app.use(trackFailedLogin);
    this.app.use(credentialStuffingDetection);

    // 11. Global burst protection (prevents rapid-fire requests)
    this.app.use(burstLimiter);

    // 12. General API rate limiting
    this.app.use('/api/', apiLimiter);

    // ========================================
    // Core Orchestrator Routes
    // ========================================
    this.app.use('/api/tasks', createTaskRoutes(this));
    this.app.use('/api/agents', createAgentRoutes(this));
    this.app.use('/api/orchestrator', createOrchestratorRoutes(this.multiAgentOrchestrator));
    this.app.use('/api/memory-cache', createMemoryCacheAgentRoutes(this));
    // Unified menu configuration with file-based storage (Issue #2271)
    // Note: LinkDB routes have been moved to @unidel2035/links-client package (Issue #2414)
    this.app.use('/api', createMenuConfigUnifiedRoutes());
    // Keep legacy routes available for backward compatibility
    this.app.use('/api/menu-legacy', createMenuConfigRoutes());

    // ========================================
    // YouTube Analytics Routes
    // ========================================
    this.app.use('/api/youtube', createYouTubeRoutes());
    this.app.use('/api/telegram', createYouTubeRoutes()); // Telegram endpoints are part of YouTube routes

    // ========================================
    // Marketplace Analytics Routes
    // ========================================
    this.app.use('/api/marketplace-analytics', createMarketplaceAnalyticsRoutes());

    // ========================================
    // Business Metrics Routes (Issue #2477)
    // ========================================
    this.app.use('/api/business-metrics', businessMetricsRoutes);
    console.log('✅ [MONOLITH] Business Metrics routes registered at /api/business-metrics (Issue #2477)');

    // ========================================
    // Quality and Feedback Routes (Issue #3044)
    // ========================================
    this.app.use('/api/feedback', feedbackRoutes);
    console.log('✅ [MONOLITH] Quality and Feedback Agent routes registered at /api/feedback (Issue #3044)');

    // ========================================
    // General Chat Routes (Real-time messaging, NOT AI chat)
    // ========================================
    this.app.use('/api/general-chat', generalChatRoutes);
    console.log('✅ [MONOLITH] General Chat routes registered at /api/general-chat');

    // ========================================
    // AI & Agent Routes
    // ========================================
    this.app.use('/api/ai-tokens', aiTokenRoutes);
    this.app.use('/api/ai-cell', aiCellRoutes);
    console.log('✅ [MONOLITH] AI Cell routes registered at /api/ai-cell (Issue #115)');
    this.app.use('/api/ai/youtube', youtubeAiRoutes);
    this.app.use('/api/ai/agriculture', agriculturalAiRoutes);
    this.app.use('/api/integration-agent', integrationAgentRoutes);
    this.app.use('/api/integrations', externalIntegrationsRoutes);
    this.app.use('/api/webhooks', webhooksRoutes);
    this.app.use('/api/onec-agent', onecAgentRoutes);
    this.app.use('/api/voice-agent', voiceAgentRoutes);
    this.app.use('/api/auto-call', autoCallRoutes);
    console.log('✅ [MONOLITH] Auto Call Agent routes registered at /api/auto-call (Issue #4286)');
    this.app.use('/api/sales-agent', createSalesAgentRoutes());
    this.app.use('/api/monitoring-alerts', createMonitoringAlertsRoutes());
    this.app.use('/api', innParserRoutes);
    console.log('✅ [MONOLITH] INN Parser routes registered at /api/inn-parser (web scraping list-org.com)');
    this.app.use('/api/egrul', egrulRoutes);
    console.log('✅ [MONOLITH] EGRUL Parser routes registered at /api/egrul (official FNS registry, Issue #5005)');
    this.app.use('/api/egrul-itsoft', egrulItsoftRoutes);
    console.log('✅ [MONOLITH] EGRUL ITSoft Parser routes registered at /api/egrul-itsoft (egrul.itsoft.ru mirror with accounting reports)');
    this.app.use('/api/egrul', egrulExtractIntegramRoutes);
    console.log('✅ [MONOLITH] EGRUL→Integram routes registered at /api/egrul/save-extract-to-integram (auto-save extracts to organization table)');
    this.app.use('/api/egrul-full-import', egrulFullImportRoutes);
    console.log('✅ [MONOLITH] EGRUL Full Import routes registered at /api/egrul-full-import (auto: create org → fetch FNS → update → download extract → create requisites)');
    this.app.use('/api/fssp', fsspRoutes);
    console.log('✅ [MONOLITH] FSSP Agent routes registered at /api/fssp (debt check via FSSP API)');
    this.app.use('/api/chat-agent', chatAgentRoutes);
    console.log('✅ [MONOLITH] Chat Agent routes registered at /api/chat-agent (web search)');
    this.app.use('/api/hh', createHHProxyRoutes());
    console.log('✅ [MONOLITH] HeadHunter Proxy routes registered at /api/hh (HH.ru API proxy)');
    console.log('✅ [MONOLITH] Monitoring and Alerts Agent routes registered at /api/monitoring-alerts (Issue #3045)');
    this.app.use('/api/billing', createBillingRoutes());
    console.log('✅ [MONOLITH] Billing and Payment Agent routes registered at /api/billing (Issue #3043)');
    this.app.use('/api/payments', createPaymentRoutes(this.db));
    console.log('✅ [MONOLITH] Payment routes with agent activation registered at /api/payments (Issue #5030)');
    this.app.use('/api/customer-support', customerSupportRoutes);
    this.app.use('/api/dev-helper', devHelperRoutes);
    this.app.use('/api/customer-support-bot', customerSupportBotRoutes);

    // Debug middleware to track ALL requests to /api/customer-journey
    this.app.use('/api/customer-journey', (req, res, next) => {
      const logMessage = `[${new Date().toISOString()}] MIDDLEWARE: ${req.method} /api/customer-journey${req.url}\n`;
      fs.appendFileSync('/tmp/middleware-debug.log', logMessage);
      console.log(`[MIDDLEWARE] ${req.method} /api/customer-journey${req.url}`);
      next();
    });

    this.app.use('/api/customer-journey', customerJourneyRoutes);
    console.log('✅ [MONOLITH] Customer Journey routes registered at /api/customer-journey (Issue #5170)');
    this.app.use('/api/guest-users', guestUsersRoutes);
    console.log('✅ [MONOLITH] Guest Users routes registered at /api/guest-users (Issue #5170)');
    this.app.use('/api/leads', leadsRoutes);
    console.log('✅ [MONOLITH] Lead Qualification Agent routes registered at /api/leads (Issue #3039)');
    this.app.use('/api/crm', crmIntegrationRoutes);
    console.log('✅ [MONOLITH] CRM Integration routes registered at /api/crm (Issue #3041)');
    this.app.use('/api/agent-creator', createAgentCreatorRoutes());
    console.log('✅ [MONOLITH] Agent Creator routes registered at /api/agent-creator (Issue #2631)');

    // ========================================
    // Integram Organizations Routes (INN Analytics)
    // ========================================
    this.app.use('/api/integram/organizations', integramOrganizationsRoutes);
    console.log('✅ [MONOLITH] Integram Organizations routes registered at /api/integram/organizations');

    // ========================================
    // Profile API Routes (Issue #5139)
    // Proxy for Integram user profile operations (avoids CORS)
    // ========================================
    this.app.use('/api/profile', profileRoutes);
    console.log('✅ [MONOLITH] Profile routes registered at /api/profile (Issue #5139)');

    // ========================================
    // Content Marketing Agent Routes (Issue #4032)
    // ========================================
    this.app.use('/api/content-marketing', contentMarketingRoutes);
    console.log('✅ [MONOLITH] Content Marketing Agent routes registered at /api/content-marketing (Issue #4032)');

    // ========================================
    // UNIFIED CHAT API - Single Entry Point
    // ========================================
    this.app.use('/api/chat', chatRoutes);
    console.log('✅ [MONOLITH] Unified Chat API registered at /api/chat (routes to all providers via coordinator)');

    // DEPRECATED: Direct provider endpoints - use /api/chat instead
    // this.app.use('/api/polza', createPolzaRoutes());
    // console.log('✅ [MONOLITH] Polza.ai integration routes registered at /api/polza');

    // ========================================
    // SGR Agents Routes (Issue #2754)
    // Schema-Guided Reasoning research agents
    // ========================================
    this.app.use('/api/sgr', sgrAgentsRoutes);
    console.log('✅ [MONOLITH] SGR Agents routes registered at /api/sgr (Issue #2754)');

    // ========================================
    // Proposal Generator Routes (Issue #4467)
    // Business Intelligence-driven Proposal Generator
    // ========================================
    this.app.use('/api/proposal-generator', proposalGeneratorRoutes);
    console.log('✅ [MONOLITH] Proposal Generator routes registered at /api/proposal-generator (Issue #4467)');

    this.app.use('/api/orbity', orbityRoutes);
    console.log('✅ [MONOLITH] Orbity routes registered at /api/orbity (Issue #2990)');

    // ========================================
    // Configuration Management Routes (Issue #2968)
    // ========================================
    this.app.use('/api/config', configRoutes);
    console.log('✅ [MONOLITH] Configuration routes registered at /api/config (Issue #2968)');

    // ========================================
    // MCP (Model Context Protocol) Routes
    // ========================================
    this.app.use('/api/mcp', createMCPRoutes());

    // DEPRECATED: Direct provider chat endpoints - use /api/chat instead
    // ========================================
    // Claude Chat Routes (Issue #2276) - REMOVED
    // ========================================
    // this.app.use('/api/claude-chat', createClaudeChatRoutes());

    // ========================================
    // Workspace Chat Routes (Issue #3600)
    // Chat with Claude using workspace tools (file ops, commands, etc.)
    // ========================================
    this.app.use('/api/workspace-chat', createWorkspaceChatRoutes());
    console.log('✅ [MONOLITH] Workspace Chat routes registered at /api/workspace-chat (Issue #3600)');

    // ========================================
    // Workspace Autonomous Agent Routes
    // Code analysis, suggestions, and automated fixes
    // ========================================
    this.app.use('/api/workspace-agent', createWorkspaceAgentRoutes());
    console.log('✅ [MONOLITH] Workspace Agent routes registered at /api/workspace-agent');

    // ========================================
    // Workspace AI Agent Routes (Issue #4403)
    // Natural language interface for workspace operations
    // Inspired by Hives Modern CLI with streaming and tool calling
    // ========================================
    this.app.use('/api/workspace-ai-agent', workspaceAiAgentRoutes);
    console.log('✅ [MONOLITH] Workspace AI Agent routes registered at /api/workspace-ai-agent (Issue #4403)');

    // ========================================
    // CLI API Routes (Issue #4471)
    // API endpoints for Integram CLI tool with model selection support
    // ========================================
    this.app.use('/api/cli', cliRoutes);
    console.log('✅ [MONOLITH] CLI API routes registered at /api/cli (Issue #4471)');

    // ========================================
    // Terminal API Routes (Issue #4673)
    // Modern CLI Terminal with isolated execution environment
    // ========================================
    this.app.use('/api/terminal', terminalRoutes);
    console.log('✅ [MONOLITH] Terminal API routes registered at /api/terminal (Issue #4673)');

    // ========================================
    // Deep Assistant Agent Routes (Issue #4392)
    // Integration with github.com/deep-assistant/agent (Bun-based CLI agent with 13 tools)
    // ========================================
    this.app.use('/api/deep-assistant', createDeepAssistantRoutes());
    console.log('✅ [MONOLITH] Deep Assistant Agent routes registered at /api/deep-assistant (Issue #4392)');

    // ========================================
    // GitHub API Routes (Issue #4052)
    // GitHub operations without cloning (read files, branches, commits, issues, PRs)
    // ========================================
    this.app.use('/api/github', createGitHubAPIRoutes());
    console.log('✅ [MONOLITH] GitHub API routes registered at /api/github (Issue #4052)');

    // ========================================
    // Git Authorization Routes (Issue #4052)
    // Store and retrieve Git tokens in Integram /my database
    // ========================================
    this.app.use('/api/git-auth', createGitAuthRoutes());
    console.log('✅ [MONOLITH] Git Auth routes registered at /api/git-auth (Issue #4052)');

    // ========================================
    // Claude Proxy Routes (Issue #2607)
    // Proxy layer: Chat.vue → Monolith → Intermediate Server → Claude
    // ========================================
    this.app.use('/api/claude-proxy', createClaudeProxyRoutes());
    console.log('✅ [MONOLITH] Claude Proxy routes registered at /api/claude-proxy (Issue #2607)');

    // Claude Code proxy: Direct Claude Code integration via headless mode
    // Issue #3107: Chat.vue → Monolith → Claude Code (headless)
    // ========================================
    this.app.use('/api/claude-code', createClaudeCodeProxyRoutes());
    console.log('✅ [MONOLITH] Claude Code Proxy routes registered at /api/claude-code (Issue #3107)');

    // ========================================
    // Claude Proxy Layer Routes (Issue #3241)
    // Chat.vue → Monolith → claude-proxy-layer → Claude Code (OAuth)
    // ========================================
    this.app.use('/api/claude-proxy-layer', createClaudeProxyLayerRoutes());
    console.log('✅ [MONOLITH] Claude Proxy Layer routes registered at /api/claude-proxy-layer (Issue #3241)');

    // ========================================
    // Accounting Routes
    // ========================================
    this.app.use('/api/accounting', createAccountingRoutes());

    // ========================================
    // Authentication Routes
    // ========================================
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/auth/oauth', oauthRoutes);

    // ========================================
    // Email Authentication Routes (Issue #4995)
    // Email-based user registration, verification, password reset
    // Integrates with Integram user database (table 18)
    // ========================================
    this.app.use('/api/email-auth', emailAuthRoutes);
    console.log('✅ [MONOLITH] Email authentication routes registered at /api/email-auth (Issue #4995)');

    // ========================================
    // Unified Authentication Routes (Issue #3554)
    // ========================================
    this.app.use('/api/unified-auth', unifiedAuthRoutes);
    console.log('✅ [MONOLITH] Unified authentication routes registered at /api/unified-auth (Issue #3554)');

    // ========================================
    // Admin Authentication Routes (Issue #3158)
    // ========================================
    this.app.use('/api/admin', adminRoutes);
    console.log('✅ [MONOLITH] Admin authentication routes registered at /api/admin (Issue #3158)');

    // ========================================
    // User Sync Routes (Issue #2782)
    // ========================================
    this.app.use('/api/user-sync', userSyncRoutes);
    console.log('✅ [MONOLITH] User sync routes registered at /api/user-sync (Issue #2782)');

    // ========================================
    // Token Management Routes (Issue #2784 - Phase 2)
    // ========================================
    this.app.use('/api/tokens', tokenManagementRoutes);
    console.log('✅ [MONOLITH] Token management routes registered at /api/tokens (Issue #2784)');

    // ========================================
    // Security Management Routes (Issue #77)
    // ========================================
    this.app.use('/api/security', securityRoutes);

    // ========================================
    // Secrets Management Routes (Issue #2471)
    // ========================================
    this.app.use('/api/secrets', secretsRoutes);
    console.log('✅ [MONOLITH] Secrets Management routes registered at /api/secrets (Issue #2471)');

    // ========================================
    // Organization Management Routes (Issue #2963)
    // ========================================
    this.app.use('/api/organizations', organizationsRoutes);
    this.app.use('/api/organizations', organizationSecretsRoutes);
    console.log('✅ [MONOLITH] Organization & Organization Secrets routes registered at /api/organizations (Issue #2963)');

    // ========================================
    // Unified Interface Management Routes (Issue #3559)
    // ========================================
    this.app.use('/api/unified-interface', unifiedInterfaceRoutes);
    console.log('✅ [MONOLITH] Unified Interface routes registered at /api/unified-interface (Issue #3559)');

    // ========================================
    // Health Checks & Incident Management Routes (Issue #3196)
    // ========================================
    this.app.use('/api', healthChecksRoutes);
    console.log('✅ [MONOLITH] Health Checks & Incident Management routes registered at /api/health-checks, /api/incidents (Issue #3196)');

    // ========================================
    // Data Sources Management Routes (Issue #3194)
    // ========================================
    this.app.use('/api/data-sources', dataSourcesRoutes);
    console.log('✅ [MONOLITH] Data Sources Management routes registered at /api/data-sources (Issue #3194)');

    // ========================================
    // Agent Registry & Instances Routes (Issue #3112 - Phase 0)
    // ========================================
    this.app.use('/api/agent-registry', agentRegistryRoutes);
    this.app.use('/api/agent-instances', agentInstancesRoutes);
    // Register organization agent routes separately (for /api/organizations/:orgId/agents paths)
    this.app.use('/api/organizations', agentInstancesRoutes);
    console.log('✅ [MONOLITH] Agent Registry & Instances routes registered (Issue #3112)');

    // ========================================
    // Custom Agents System Routes (Issue #3463)
    // Create, edit, and execute custom agents with dynamic UI and code
    // ========================================
    this.app.use('/api/custom-agents', customAgentsRoutes);
    console.log('✅ [MONOLITH] Custom Agents System routes registered at /api/custom-agents (Issue #3463)');

    // ========================================
    // Integram Unified Agent API (Issue #4692)
    // Unified API for agent creation and management
    // Combines: Agent Registry, Agent Instances, Integram, MCP, AI Tokens
    // ========================================
    this.app.use('/api/drondoc-agents', drondocAgentsRoutes);
    console.log('✅ [MONOLITH] Integram Unified Agent API routes registered at /api/drondoc-agents (Issue #4692)');

    // ========================================
    // Integram Agents Integram Persistence
    // Save/load agent instances to/from Integram database
    // ========================================
    this.app.use('/api/drondoc-agents/integram', createIntegramAgentsIntegramRoutes());
    console.log('✅ [MONOLITH] Integram Agents Integram routes registered at /api/drondoc-agents/integram');

    // ========================================
    // Ensemble Deployment Routes (Issue #3114 - Phase 2)
    // ========================================
    this.app.use('/api', ensemblesRoutes);
    console.log('✅ [MONOLITH] Ensemble deployment routes registered at /api/ensembles (Issue #3114)');

    // ========================================
    // Knowledge Management Routes (Issue #2489)
    // ========================================
    this.app.use('/api/knowledge', createKnowledgeRoutes());
    console.log('✅ [MONOLITH] Knowledge Management routes registered at /api/knowledge (Issue #2489)');

    // ========================================
    // KAG (Knowledge Augmented Generation) Routes (Issue #5005, #5097)
    // Uses lazy initialization to prevent blocking backend startup
    // ========================================
    this.app.use('/api/kag', createKAGRoutes());
    console.log('✅ [MONOLITH] KAG routes registered at /api/kag (Issue #5005, lazy init #5097)');

    // KAG Memory MCP Server HTTP API
    this.app.use('/api/mcp/kag', createKAGMCPRoutes());
    console.log('✅ [MONOLITH] KAG Memory MCP routes registered at /api/mcp/kag (Issue #5126)');

    // ========================================
    // Web Scraping Routes
    // ========================================
    this.app.use('/api/scraper', createScraperRoutes());
    this.app.use('/api/group-parser', createGroupParserRoutes());
    this.app.use('/api/telegram-user-auth', createTelegramUserAuthRoutes());
    this.app.use('/api/telegram-lead-agent', createTelegramLeadAgentRoutes());
    this.app.use('/api/public-channel-parser', createPublicChannelParserRoutes());
    this.app.use('/api/vk-parser', createVKParserRoutes());
    this.app.use('/api/vk-subscriber-bot', createVKSubscriberBotRoutes());
    console.log('✅ [MONOLITH] VK Subscriber Bot routes registered at /api/vk-subscriber-bot (Issue #4954)');
    this.app.use('/api/tgstat', createTgstatRoutes());
    this.app.use('/api/torgi-parser', torgiParserRoutes);

    // ========================================
    // Recording & Voice Routes
    // ========================================
    this.app.use('/api/recording', createRecordingRoutes());
    this.app.use('/api/cloud-recording', createCloudRecordingRoutes());

    // ========================================
    // Scheduled Meetings Routes (Issue #2355)
    // ========================================
    this.app.use('/api/scheduled-meetings', createScheduledMeetingsRoutes());

    // ========================================
    // Error Reporting Routes
    // ========================================
    this.app.use('/api/error-reports', errorReportsRoutes);

    // ========================================
    // Code Review Routes
    // ========================================
    this.app.use('/api/code-review', codeReviewRoutes);

    // ========================================
    // Code Analyzer Routes (Issue #4508)
    // ========================================
    this.app.use('/api/code-analyzer', codeAnalyzerRoutes);
    console.log('✅ [MONOLITH] Code Analyzer Agent routes registered at /api/code-analyzer (Issue #4508)');

    // ========================================
    // Tech Debt Management Routes
    // ========================================
    this.app.use('/api/tech-debt', techDebtRoutes);

    // ========================================
    // Test Runner Routes
    // ========================================
    this.app.use('/api/test-runner', createTestRunnerRoutes());

    // ========================================
    // CI/CD Testing Agent Routes (Issue #2484)
    // ========================================
    this.app.use('/api/ci-cd-testing', createCICDTestingRoutes());

    // ========================================
    // Self-Healing System Routes (Issue #1674)
    // ========================================
    this.app.use('/api/self-healing', createSelfHealingRoutes());

    // ========================================
    // System Resources Monitoring Routes (Issue #2469)
    // ========================================
    this.app.use('/api/system-resources', createSystemResourcesRoutes());

    // ========================================
    // Storage Management Routes (Issue #2670)
    // ========================================
    this.app.use('/api/storage-management', createStorageManagementRoutes());
    console.log('✅ [MONOLITH] Storage Management routes registered at /api/storage-management (Issue #2670)');

    // ========================================
    // Auto-Scaling Agent Routes (Issue #2475)
    // ========================================
    this.app.use('/api/auto-scaling', createAutoScalingRoutes());

    // ========================================
    // Anomaly Detection Routes (Issue #2472)
    // ========================================
    this.app.use('/api/anomaly-detection', anomalyDetectionRoutes);

    // ========================================
    // Synthetic Monitoring Routes (Issue #2485)
    // ========================================
    this.app.use('/api/synthetic-monitoring', syntheticMonitoringRoutes);
    console.log('✅ [MONOLITH] Synthetic Monitoring routes registered at /api/synthetic-monitoring (Issue #2485)');

    // ========================================
    // Purchase Journey Testing Routes (PR #5000)
    // ========================================
    this.app.use('/api/purchase-journey-testing', purchaseJourneyTestingRoutes);
    console.log('✅ [MONOLITH] Purchase Journey Testing routes registered at /api/purchase-journey-testing (PR #5000)');

    // ========================================
    // External API Monitoring Routes (Issue #2493)
    // ========================================
    this.app.use('/api/external-api-monitor', createExternalApiMonitorRoutes());
    console.log('✅ [MONOLITH] External API Monitoring routes registered at /api/external-api-monitor (Issue #2493)');

    // ========================================
    // Logging and Audit Routes (Issue #2473)
    // ========================================
    this.app.use('/api/logging-audit', loggingAuditRoutes);

    // ========================================
    // Backup and Disaster Recovery Routes (Issue #69)
    // ========================================
    this.app.use('/api/backup', backupRoutes);

    // ========================================
    // Data Sync Agent Routes (Issue #2490)
    // ========================================
    this.app.use('/api/data-sync', dataSyncRoutes);
    console.log('✅ [MONOLITH] Data Sync routes registered at /api/data-sync (Issue #2490)');

    // ========================================
    // Database Agent Routes (Issue #2474)
    // ========================================
    this.app.use('/api/database-agent', databaseAgentRoutes);
    console.log('✅ [MONOLITH] Database Agent routes registered at /api/database-agent (Issue #2474)');

    // ========================================
    // MLOps Agent Routes (Issue #2486)
    // ========================================
    this.app.use('/api/mlops-agent', mlopsAgentRoutes);
    console.log('✅ [MONOLITH] MLOps Agent routes registered at /api/mlops-agent (Issue #2486)');

    // ========================================
    // Feature Flags Agent Routes (Issue #2488)
    // ========================================
    this.app.use('/api/feature-flags', featureFlagsRoutes);
    console.log('✅ [MONOLITH] Feature Flags Agent routes registered at /api/feature-flags (Issue #2488)');

    // ========================================
    // Agricultural Routes
    // ========================================
    this.app.use('/api/agro-products', agroProductsRoutes);
    this.app.use('/api/agro-recipes', agroRecipesRoutes);
    this.app.use('/api/recipe-calculator', recipeCalculatorRoutes);
    this.app.use('/api/agriculture', createAgriculturalMissionRoutes());
    this.app.use('/api/agriculture', createMissionOperationRoutes());
    this.app.use('/api/agriculture/calculator', createCalculatorRoutes());

    // ========================================
    // Aero Monitoring Routes (Issue #5195, #5199)
    // ========================================
    this.app.use('/api/aero/drones', createAeroDronesRoutes());
    this.app.use('/api/aero/missions', createAeroMissionsRoutes());
    this.app.use('/api/aero/data', createAeroDataRoutes()); // Issue #5199 - Data upload
    this.app.use('/api/aero/analytics', createAeroAnalyticsRoutes({
      db: this.db,
      llmCoordinator: this.llmCoordinator
    })); // Issue #5199 - AI analytics

    // ========================================
    // Messaging Routes (Telegram Analog)
    // ========================================
    this.app.use('/api/messaging', messagingRoutes);

    // ========================================
    // Notifications Routes (Issue #246)
    // ========================================
    this.app.use('/api/notifications', notificationsRoutes);

    // ========================================
    // Database Manager Routes (Issue #1802)
    // ========================================
    this.app.use('/api/databases', createDatabaseManagerRoutes(this));

    // ========================================
    // Travel Accommodation Routes (Issue #1806)
    // ========================================
    this.app.use('/api/travel-accommodation', travelAccommodationRoutes);

    // ========================================
    // GitHub Pages Routes (Issue #1945)
    // ========================================
    this.app.use('/api/github-pages', githubPagesRoutes);

    // ========================================
    // Role-Sets Routes (Flow Editor Phase 7, Issue #1907)
    // ========================================
    this.app.use('/api/role-sets', createRoleSetRoutes());

    // ========================================
    // Process Execution Routes (Phase 3, Issue #2460)
    // ========================================
    this.app.use('/api/process-execution', createProcessExecutionRoutes());
    console.log('✅ [MONOLITH] Process Execution routes registered at /api/process-execution (Issue #2460)');
    console.log('   Endpoints available:');
    console.log('   - POST   /api/process-execution/start');
    console.log('   - GET    /api/process-execution/instances');
    console.log('   - GET    /api/process-execution/instances/:id');
    console.log('   - POST   /api/process-execution/instances/:id/pause');
    console.log('   - POST   /api/process-execution/instances/:id/resume');
    console.log('   - POST   /api/process-execution/instances/:id/cancel');
    console.log('   - GET    /api/process-execution/tasks');
    console.log('   - GET    /api/process-execution/tasks/:id');
    console.log('   - POST   /api/process-execution/tasks/:id/complete');
    console.log('   - GET    /api/process-execution/events');
    console.log('   - POST   /api/process-execution/events/trigger');
    console.log('   - GET    /api/process-execution/snapshots');
    console.log('   - GET    /api/process-execution/stats');
    console.log('   - GET    /api/process-execution/health');

    // ========================================
    // Backend Dashboard Routes (Issue #2160, #4034)
    // NOTE: Moved before rate limiting - see line 270
    // ========================================

    // ========================================
    // API Gateway Routes (Issue #2483)
    // ========================================
    this.app.use('/api/gateway', createApiGatewayRoutes());
    console.log('✅ [MONOLITH] API Gateway routes registered at /api/gateway (Issue #2483)');
    console.log('   Endpoints available:');
    console.log('   - GET    /api/gateway/status');
    console.log('   - GET    /api/gateway/analytics');
    console.log('   - POST   /api/gateway/analytics/reset');
    console.log('   - GET    /api/gateway/routes');
    console.log('   - POST   /api/gateway/routes');
    console.log('   - GET    /api/gateway/services');
    console.log('   - POST   /api/gateway/services');
    console.log('   - POST   /api/gateway/health-check');
    console.log('   - GET    /api/gateway/metrics');
    console.log('   - POST   /api/gateway/record-request');
    console.log('   - POST   /api/gateway/record-auth');
    console.log('   - POST   /api/gateway/record-rate-limit');

    // ========================================
    // Logs Routes (Issue #2140, #4034)
    // NOTE: Moved before rate limiting - see line 271
    // ========================================

    // ========================================
    // Solve Routes (Issue #2208, #2274)
    // ========================================
    this.app.use('/api', createSolveRoutes());
    console.log('✅ [MONOLITH] Solve routes registered at /api/solve (Issue #2208, #2274)');
    console.log('   Endpoints available:');
    console.log('   - POST   /api/solve');
    console.log('   - GET    /api/solve/sessions');
    console.log('   - GET    /api/solve/sessions/:sessionId');
    console.log('   - DELETE /api/solve/sessions/:sessionId');
    console.log('   - GET    /api/solve/sessions/:sessionId/logs');
    console.log('   - GET    /api/solve/queue');
    console.log('   - POST   /api/solve/cleanup');

    // ========================================
    // Legacy PHP Compatibility Layer (Issue #121)
    // Allows legacy HTML frontend to work with new Node.js backend
    // Maps old PHP URL patterns (/{db}/auth, etc.) to new API
    // ========================================
    this.app.use('/', legacyCompatRoutes);
    console.log('✅ [MONOLITH] Legacy PHP Compatibility routes registered (Issue #121)');
    console.log('   Endpoints available:');
    console.log('   - POST   /:db/auth          (PHP-compatible authentication)');
    console.log('   - GET    /:db/validate      (Token validation)');
    console.log('   - POST   /:db/getcode       (One-time code request)');
    console.log('   - POST   /:db/checkcode     (One-time code verification)');
    console.log('   - POST   /my/register       (User registration)');
    console.log('   - ALL    /:db/exit          (Logout)');
    console.log('   - POST   /:db/:action       (Legacy API actions: _m_*, _d_*, etc.)');

    // ========================================
    // Static Files for Legacy HTML Frontend (Issue #121)
    // Serve legacy HTML/CSS/JS files from integram-server directory
    // ========================================
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const legacyStaticPath = path.resolve(__dirname, '../../../integram-server');

    // Serve static assets (CSS, JS, images)
    this.app.use('/css', express.static(path.join(legacyStaticPath, 'css')));
    this.app.use('/js', express.static(path.join(legacyStaticPath, 'js')));
    this.app.use('/i', express.static(path.join(legacyStaticPath, 'i')));
    this.app.use('/templates', express.static(path.join(legacyStaticPath, 'templates')));
    this.app.use('/ace', express.static(path.join(legacyStaticPath, 'ace')));
    this.app.use('/app', express.static(path.join(legacyStaticPath, 'app')));
    console.log('✅ [MONOLITH] Legacy static files served from', legacyStaticPath);
    console.log('   Static paths: /css, /js, /i, /templates, /ace, /app');

    // ========================================
    // Root Endpoint - API Documentation
    // ========================================
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Integram Monolithic Backend',
        version: '1.0.0',
        status: 'running',
        architecture: 'monolithic',
        description: 'Unified backend consolidating orchestrator, YouTube analytics, MCP, accounting, and authentication services',
        services: {
          orchestrator: 'Agent orchestration and task management',
          youtube: 'YouTube channel analytics',
          mcp: 'Model Context Protocol integration',
          accounting: 'Accounting automation and financial management',
          auth: 'User authentication and authorization',
          ai: 'AI tokens and agent services',
          agricultural: 'Agricultural drone operations',
          recording: 'Voice recording and transcription',
          scraper: 'Web scraping and data extraction',
          codeReview: 'AI-powered automated code review for pull requests',
          messaging: 'Real-time messaging system (Telegram analog)',
          selfHealing: 'Backend self-healing and error monitoring (Issue #1674)',
          roleSets: 'Role-Sets conceptual framework for flow editor (Phase 7)',
          logs: 'Log file retrieval and management (Issue #2140)'
        },
        endpoints: {
          // Core
          health: '/api/health',
          metrics: '/api/metrics',
          tasks: '/api/tasks',
          agents: '/api/agents',
          menuConfig: '/api/menu/config',

          // YouTube
          youtube: '/api/youtube',
          telegram: '/api/telegram',
          youtubeAI: '/api/ai/youtube',

          // AI & Agents
          aiTokens: '/api/ai-tokens',
          integrationAgent: '/api/integration-agent',
          voiceAgent: '/api/voice-agent',
          autoCall: '/api/auto-call',
          salesAgent: '/api/sales-agent',
          monitoringAlerts: '/api/monitoring-alerts',
          customerSupport: '/api/customer-support',

          // MCP
          mcp: '/api/mcp',

          // Accounting
          accounting: '/api/accounting',

          // Authentication
          auth: '/api/auth',
          oauth: '/api/auth/oauth',

          // Scraping
          scraper: '/api/scraper',
          groupParser: '/api/group-parser',
          vkParser: '/api/vk-parser',
          tgstat: '/api/tgstat',

          // Recording
          recording: '/api/recording',
          cloudRecording: '/api/cloud-recording',
          scheduledMeetings: '/api/scheduled-meetings',

          // Error Reporting
          errorReports: '/api/error-reports',

          // Code Review
          codeReview: '/api/code-review',

          // Agricultural
          agroProducts: '/api/agro-products',
          agroRecipes: '/api/agro-recipes',
          recipeCalculator: '/api/recipe-calculator',
          agriculture: '/api/agriculture',
          missions: '/api/agriculture/missions',
          calculator: '/api/agriculture/calculator',
          agriculturalAI: '/api/ai/agriculture',

          // Messaging (Telegram Analog)
          messaging: '/api/messaging',

          // Self-Healing (Issue #1674)
          selfHealing: '/api/self-healing',

          // GitHub Pages (Issue #1945)
          githubPages: '/api/github-pages',

          // Role-Sets (Flow Editor Phase 7, Issue #1907)
          roleSets: '/api/role-sets',
          things: '/api/role-sets/things',
          prisms: '/api/role-sets/prisms',
          roles: '/api/role-sets/roles',
          roleBindings: '/api/role-sets/role-bindings',
          pqExecute: '/api/role-sets/pq/execute',

          // Logs (Issue #2140)
          logs: '/api/logs',
          logsList: 'GET /api/logs - List available logs',
          logsView: 'GET /api/logs/:logKey - View log content',
          logsDownload: 'GET /api/logs/:logKey/download - Download log file',

          // WebSocket
          websocket: '/ws'
        }
      });
    });

    // ========================================
    // 404 Handler - Must be BEFORE error handler
    // Returns JSON for API routes, otherwise passes to error handler
    // Issue #4728: Fix JSON parsing error for 404 responses
    // ========================================
    this.app.use((req, res, next) => {
      // Check if this is an API request
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({
          success: false,
          error: `Cannot ${req.method} ${req.path}`,
          code: 'NOT_FOUND',
          path: req.path,
          method: req.method
        });
      }

      // For non-API routes, pass to error handler
      const error = new Error(`Cannot ${req.method} ${req.path}`);
      error.statusCode = 404;
      next(error);
    });

    // Error handlers (must be last)
    // Use self-healing error handler instead of basic error handler
    this.app.use(selfHealingErrorHandler);

    logger.info('Express app configured with all routes');
  }

  /**
   * Initialize in-memory message queue
   * Issue #2185: Replaced Redis with in-memory implementation
   */
  async setupMessageQueue() {
    try {
      this.messageQueue = new MessageQueue();
      await this.messageQueue.connect();
      logger.info('MessageQueue connected (in-memory mode)');
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to initialize MessageQueue');
      this.messageQueue = null;
    }
  }

  /**
   * Start the monolithic backend server
   */
  async start() {
    try {
      logger.info('Starting Integram Monolithic Backend...');

      // Setup Express
      this.setupExpress();

      // Create HTTP or HTTPS server based on configuration
      if (this.config.httpsEnabled) {
        try {
          // Log certificate loading attempt
          logger.info('🔐 Loading SSL certificates...', {
            certPath: this.config.sslCertPath,
            keyPath: this.config.sslKeyPath
          });
          console.log('🔐 Loading SSL certificates...');
          console.log(`   Certificate: ${this.config.sslCertPath}`);
          console.log(`   Private Key: ${this.config.sslKeyPath}`);

          const httpsOptions = {
            cert: fs.readFileSync(this.config.sslCertPath),
            key: fs.readFileSync(this.config.sslKeyPath)
          };

          // Log successful certificate loading
          logger.info('✅ SSL certificates loaded successfully');
          console.log('✅ SSL certificates loaded successfully');
          console.log(`   Certificate size: ${httpsOptions.cert.length} bytes`);
          console.log(`   Private key size: ${httpsOptions.key.length} bytes`);

          this.server = https.createServer(httpsOptions, this.app);

          // Log HTTPS server creation success
          logger.info('✅ HTTPS server created successfully', {
            port: this.config.port,
            protocol: 'https',
            certPath: this.config.sslCertPath,
            keyPath: this.config.sslKeyPath
          });
          console.log('✅ HTTPS server created successfully');
          console.log(`   Protocol: HTTPS`);
          console.log(`   Port: ${this.config.port}`);
          console.log(`   Access URL: https://localhost:${this.config.port}`);
        } catch (error) {
          // Enhanced error logging for SSL certificate failures
          logger.error({
            error: error.message,
            stack: error.stack,
            certPath: this.config.sslCertPath,
            keyPath: this.config.sslKeyPath
          }, '❌ Failed to load SSL certificates, falling back to HTTP');
          console.error('❌ Failed to load SSL certificates');
          console.error(`   Error: ${error.message}`);
          console.error(`   Certificate path: ${this.config.sslCertPath}`);
          console.error(`   Private key path: ${this.config.sslKeyPath}`);
          console.error('⚠️  FALLING BACK TO HTTP SERVER');
          console.error('⚠️  WARNING: Server will run on HTTP, but HTTPS access will fail with SSL_ERROR_RX_RECORD_TOO_LONG');
          console.error('⚠️  To fix: Either disable HTTPS_ENABLED or provide valid SSL certificates');

          this.server = http.createServer(this.app);

          // Log HTTP fallback server creation
          logger.info('HTTP server created (fallback from failed HTTPS)', {
            port: this.config.port,
            protocol: 'http',
            reason: 'SSL certificate loading failed'
          });
          console.log('ℹ️  HTTP server created (fallback mode)');
          console.log(`   Protocol: HTTP`);
          console.log(`   Port: ${this.config.port}`);
          console.log(`   Access URL: http://localhost:${this.config.port}`);
        }
      } else {
        this.server = http.createServer(this.app);
        logger.info('HTTP server created (HTTPS disabled)', {
          port: this.config.port,
          protocol: 'http',
          httpsEnabled: false
        });
        console.log('ℹ️  HTTP server created (HTTPS disabled in configuration)');
        console.log(`   Protocol: HTTP`);
        console.log(`   Port: ${this.config.port}`);
        console.log(`   Access URL: http://localhost:${this.config.port}`);
        console.log('   To enable HTTPS: Set HTTPS_ENABLED=true and provide SSL certificate paths');
      }

      // Setup Claude Terminal WebSocket handler
      console.log('🔄 Creating ClaudeTerminalHandler...');
      this.claudeTerminal = new ClaudeTerminalHandler(this.server);
      console.log('✅ ClaudeTerminalHandler created successfully');

      // Setup WebSocket (OrchestratorWebSocket)
      this.websocket = new OrchestratorWebSocket(this.server, this);

      // Setup central WebSocket upgrade handler (both use noServer mode)
      this.server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;

        // Add timeout for hanging connections (30 seconds)
        const timeout = setTimeout(() => {
          logger.warn({ pathname }, 'WebSocket upgrade timeout, destroying socket');
          socket.destroy();
        }, 30000);

        // Clear timeout on socket close
        socket.on('close', () => clearTimeout(timeout));

        // Handle socket errors during upgrade
        socket.on('error', (err) => {
          clearTimeout(timeout);
          logger.error({ error: err.message, pathname }, 'Socket error during upgrade');
          socket.destroy();
        });

        if (pathname === '/wsclaude' || pathname.startsWith('/wsclaude?')) {
          console.log('🔌 [Upgrade] Routing to ClaudeTerminalHandler:', pathname);
          this.claudeTerminal.handleUpgrade(request, socket, head);
          clearTimeout(timeout);
        } else if (pathname === '/ws' || pathname.startsWith('/ws?')) {
          this.websocket.handleUpgrade(request, socket, head);
          clearTimeout(timeout);
        } else {
          console.log('🔌 [Upgrade] Unknown path, destroying socket:', pathname);
          clearTimeout(timeout);
          socket.destroy();
        }
      });
      console.log('✅ WebSocket upgrade handler registered for /ws and /wsclaude');

      // Make WebSocket accessible to routes via req.app.websocket
      this.app.websocket = this.websocket;

      // Setup notification trigger service with WebSocket
      notificationTrigger.setWebSocket(this.websocket);
      logger.info('Notification trigger service initialized with WebSocket');

      // Setup message queue (optional)
      await this.setupMessageQueue();

      // Setup process error handlers with self-healing (Issue #1674)
      await setupProcessErrorHandlers();

      // Initialize health monitoring (Issue #1674)
      // DISABLED: Health monitoring requires PostgreSQL which is not used in this project
      // The project uses only Integram API for data storage (Issue #2155)
      // this.healthMonitor = new BackendHealthMonitor({
      //   serviceName: 'backend',
      //   checkInterval: 60000 // 1 minute
      // });
      // await this.healthMonitor.start();
      logger.info('Health monitoring disabled (no PostgreSQL database)');

      // Initialize memory monitoring (Issue #2157)
      this.memoryMonitor = new MemoryMonitor({
        checkInterval: 60000, // 1 minute
        warnThreshold: 0.75, // Warn at 75% heap usage
        criticalThreshold: 0.85 // Critical at 85% heap usage
      });
      this.memoryMonitor.start();
      logger.info('Memory monitoring started');

      // Initialize GitHub webhook queue worker (Issue #5079)
      try {
        const { getWebhookQueue } = await import('./services/kag/WebhookQueue.js');
        const { getWebhookService } = await import('./services/kag/WebhookService.js');

        const webhookQueue = getWebhookQueue();
        const webhookService = getWebhookService();

        // Start processing webhook events with concurrency of 3
        webhookQueue.process((job) => webhookService.processWebhookEvent(job), { concurrency: 3 });

        logger.info('[KAG Webhook] Queue worker initialized (concurrency: 3)');
        console.log('✅ [KAG] GitHub webhook auto-indexing enabled (Issue #5079)');
      } catch (error) {
        logger.warn('[KAG Webhook] Failed to initialize webhook queue worker', { error: error.message });
        console.log('⚠️  [KAG] Webhook auto-indexing disabled (queue initialization failed)');
      }

      // Start coordinator
      this.coordinator.start();

      // Start HTTP server - bind to 0.0.0.0 to accept connections from all interfaces
      await new Promise((resolve, reject) => {
        this.server.listen(this.config.port, '0.0.0.0', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Determine actual protocol based on server type
      const isHttpsServer = this.server instanceof https.Server;
      const protocol = isHttpsServer ? 'https' : 'http';
      const wsProtocol = isHttpsServer ? 'wss' : 'ws';

      // Console output with clear visual formatting
      console.log('\n' + '='.repeat(70));
      console.log('🚀 Integram Monolithic Backend Started Successfully');
      console.log('='.repeat(70));
      console.log(`📡 Server Protocol: ${protocol.toUpperCase()}`);
      console.log(`🔌 Port: ${this.config.port}`);
      console.log(`🌐 Listening on: 0.0.0.0:${this.config.port}`);
      console.log('-'.repeat(70));
      console.log('📍 API Endpoints:');
      console.log(`   REST API:      ${protocol}://localhost:${this.config.port}/api`);
      console.log(`   WebSocket:     ${wsProtocol}://localhost:${this.config.port}/ws`);
      console.log(`   Claude Term:   ${wsProtocol}://localhost:${this.config.port}/wsclaude`);
      console.log(`   Health Check:  ${protocol}://localhost:${this.config.port}/api/health`);
      console.log(`   Documentation: ${protocol}://localhost:${this.config.port}/`);
      console.log('-'.repeat(70));

      if (isHttpsServer) {
        console.log('🔐 HTTPS Mode: ENABLED');
        console.log(`   Certificate: ${this.config.sslCertPath}`);
        console.log(`   Private Key: ${this.config.sslKeyPath}`);
        console.log('   ✅ SSL certificates loaded and active');
        console.log('   ✅ Secure HTTPS connections enabled');
      } else {
        console.log('ℹ️  HTTP Mode: Running without SSL/TLS encryption');
        if (this.config.httpsEnabled) {
          console.log('   ⚠️  HTTPS was requested but SSL certificates failed to load');
          console.log('   ⚠️  Server is running on HTTP (fallback mode)');
          console.log('   ⚠️  Accessing via HTTPS will result in SSL_ERROR_RX_RECORD_TOO_LONG');
          console.log('   💡 Fix: Provide valid SSL certificates or set HTTPS_ENABLED=false');
        } else {
          console.log('   ℹ️  HTTPS is disabled in configuration (HTTPS_ENABLED=false)');
          console.log('   💡 To enable HTTPS: Set HTTPS_ENABLED=true and provide SSL certificates');
        }
      }

      console.log('='.repeat(70) + '\n');

      // Initialize default user (Issue #2975)
      try {
        await initDefaultUser();
        logger.info('Default user initialization completed');
      } catch (error) {
        logger.warn({ error: error.message }, 'Default user initialization skipped');
      }

      // Initialize Claude Code Service (Issue #3107)
      try {
        const { default: claudeCodeService } = await import('./services/ClaudeCodeService.js');
        await claudeCodeService.initialize();
        logger.info('Claude Code Service initialized successfully');
      } catch (error) {
        logger.warn({ error: error.message }, 'Claude Code Service initialization skipped');
      }

      // Initialize Workspace Service (Issue #3600)
      try {
        const { default: workspaceService } = await import('./services/WorkspaceService.js');
        await workspaceService.initialize();
        logger.info('Workspace Service initialized successfully');
        console.log('✅ [MONOLITH] Workspace Service initialized (Issue #3600)');
      } catch (error) {
        logger.warn({ error: error.message }, 'Workspace Service initialization failed');
        console.warn('⚠️  Workspace Service initialization failed:', error.message);
      }

      // Initialize Purchase Journey Testing Agent (Issue #5111)
      // Auto-start agent on backend init if configured
      if (process.env.JOURNEY_AUTO_START !== 'false') {
        try {
          const { startPurchaseJourneyAgent } = await import('./api/routes/purchase-journey-testing.js');
          const result = await startPurchaseJourneyAgent();

          if (result.success) {
            logger.info('✅ Purchase Journey Testing Agent auto-started successfully');
            console.log('✅ [MONOLITH] Purchase Journey Testing Agent auto-started (Issue #5111)');
          } else {
            logger.warn({ error: result.error }, '⚠️  Purchase Journey Agent auto-start failed');
            console.warn('⚠️  Purchase Journey Agent auto-start failed:', result.message);
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Failed to auto-start Purchase Journey Agent');
          console.error('❌ Failed to auto-start Purchase Journey Agent:', error.message);
        }
      } else {
        logger.info('Purchase Journey Agent auto-start disabled (JOURNEY_AUTO_START=false)');
        console.log('ℹ️  [MONOLITH] Purchase Journey Agent auto-start disabled (JOURNEY_AUTO_START=false)');
      }

      // Structured logging for log files
      logger.info(`Integram Monolithic Backend started successfully`);
      logger.info(`Port: ${this.config.port}`);
      logger.info(`Protocol: ${protocol.toUpperCase()}`);
      logger.info(`Is HTTPS Server: ${isHttpsServer}`);
      logger.info(`HTTPS Enabled Config: ${this.config.httpsEnabled}`);
      logger.info(`REST API: ${protocol}://0.0.0.0:${this.config.port}/api`);
      logger.info(`WebSocket: ${wsProtocol}://0.0.0.0:${this.config.port}/ws`);
      logger.info(`Documentation: ${protocol}://0.0.0.0:${this.config.port}/`);

      // Log GitHub token configuration status (Issue #2266)
      logger.info('='.repeat(70));
      logger.info('GitHub Integration Configuration:');
      logger.info(`GITHUB_TOKEN environment variable: ${process.env.GITHUB_TOKEN ? 'SET (length: ' + process.env.GITHUB_TOKEN.length + ')' : 'NOT SET'}`);
      logger.info(`GH_TOKEN environment variable: ${process.env.GH_TOKEN ? 'SET (length: ' + process.env.GH_TOKEN.length + ')' : 'NOT SET'}`);
      logger.info(`GITHUB_OWNER: ${process.env.GITHUB_OWNER || 'unidel2035 (default)'}`);
      logger.info(`GITHUB_REPO: ${process.env.GITHUB_REPO || 'dronedoc2025 (default)'}`);
      if (process.env.GITHUB_TOKEN) {
        logger.info(`GitHub token preview: ${process.env.GITHUB_TOKEN.substring(0, 10)}***`);
      } else if (process.env.GH_TOKEN) {
        logger.info(`GH_TOKEN token preview: ${process.env.GH_TOKEN.substring(0, 10)}***`);
      } else {
        logger.warn('⚠️  No GitHub token found in environment variables!');
        logger.warn('⚠️  Error reports and solve functionality will fail with 401 errors');
        logger.warn('💡 Set GITHUB_TOKEN environment variable or add GitHub API key via /api/ai-tokens/provider-keys');
      }
      logger.info('='.repeat(70));

    } catch (error) {
      logger.error({ error: error.message }, 'Failed to start backend');
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down Integram Backend...');

    try {
      // Stop coordinator
      await this.coordinator.shutdown();

      // Cleanup notification trigger service WebSocket
      if (notificationTrigger && typeof notificationTrigger.cleanup === 'function') {
        notificationTrigger.cleanup();
      }

      // Close WebSocket
      if (this.websocket) {
        this.websocket.close();
      }

      // Close Claude Terminal WebSocket
      if (this.claudeTerminal) {
        this.claudeTerminal.close();
      }

      // Disconnect message queue
      if (this.messageQueue) {
        await this.messageQueue.disconnect();
      }

      // Stop health monitoring (Issue #1674)
      if (this.healthMonitor) {
        this.healthMonitor.stop();
      }

      // Stop memory monitoring (Issue #2157)
      if (this.memoryMonitor) {
        this.memoryMonitor.stop();
      }

      // Cleanup task queue (Issue #2157)
      if (this.taskQueue) {
        this.taskQueue.shutdown();
      }

      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }

      // Cleanup agent registry
      this.agentRegistry.shutdown();

      logger.info('Backend shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error: error.message }, 'Error during shutdown');
      process.exit(1);
    }
  }
}

// Start backend if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const backend = new IntegramBackend();

  // Graceful shutdown handlers
  process.on('SIGINT', () => backend.shutdown());
  process.on('SIGTERM', () => backend.shutdown());

  backend.start().catch((error) => {
    logger.error({ error: error.message }, 'Failed to start backend');
    process.exit(1);
  });
}

// Export for testing and integration
export { IntegramBackend };
