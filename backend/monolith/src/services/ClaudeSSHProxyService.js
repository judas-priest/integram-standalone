// ClaudeSSHProxyService.js - Proxy service for Claude via SSH tunnel
// Issue #2309: Support remote Claude servers via SSH
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * ClaudeSSHProxyService - Execute Claude commands on remote server via SSH
 *
 * This service allows using Claude installed on a remote server
 * instead of calling Anthropic API directly.
 *
 * Configuration (via environment variables):
 * - CLAUDE_SSH_HOST: Remote server (e.g., root@YOUR_DEV_SERVER_IP)
 * - CLAUDE_SSH_PASSWORD: SSH password (optional, use SSH keys in production)
 * - CLAUDE_SSH_USER: User to run Claude as (e.g., hive)
 * - CLAUDE_SSH_COMMAND: Command to run Claude (e.g., "claude chat")
 */
class ClaudeSSHProxyService {
  constructor() {
    this.sshHost = process.env.CLAUDE_SSH_HOST || null;
    this.sshPassword = process.env.CLAUDE_SSH_PASSWORD || null;
    this.sshUser = process.env.CLAUDE_SSH_USER || 'hive';
    this.claudeCommand = process.env.CLAUDE_SSH_COMMAND || 'claude chat';
    this.enabled = !!this.sshHost;

    if (this.enabled) {
      logger.info({
        sshHost: this.sshHost,
        sshUser: this.sshUser,
        claudeCommand: this.claudeCommand
      }, 'ClaudeSSHProxyService enabled');
    } else {
      logger.debug('ClaudeSSHProxyService disabled (no CLAUDE_SSH_HOST configured)');
    }
  }

  /**
   * Check if SSH proxy is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Build SSH command with authentication
   * @param {string} remoteCommand - Command to execute on remote server
   * @returns {string} - Full SSH command
   */
  buildSSHCommand(remoteCommand) {
    const sshOptions = [
      '-o StrictHostKeyChecking=no',
      '-o UserKnownHostsFile=/dev/null',
      '-o ConnectTimeout=10'
    ].join(' ');

    // Escape single quotes in remote command
    const escapedCommand = remoteCommand.replace(/'/g, "'\\''");

    // Build command based on authentication method
    if (this.sshPassword) {
      // Use sshpass with password (not recommended for production)
      return `sshpass -p '${this.sshPassword}' ssh ${sshOptions} ${this.sshHost} "su - ${this.sshUser} -c '${escapedCommand}'"`;
    } else {
      // Use SSH keys (recommended for production)
      return `ssh ${sshOptions} ${this.sshHost} "su - ${this.sshUser} -c '${escapedCommand}'"`;
    }
  }

  /**
   * Execute Claude command on remote server
   * @param {string} prompt - User prompt
   * @param {object} options - Additional options
   * @returns {Promise<string>} - Claude response
   */
  async executeClaudeCommand(prompt, options = {}) {
    if (!this.enabled) {
      throw new Error('ClaudeSSHProxyService is not enabled. Set CLAUDE_SSH_HOST environment variable.');
    }

    try {
      // Escape prompt for shell
      const escapedPrompt = prompt.replace(/'/g, "'\\''");

      // Build Claude command
      const claudeCmd = `echo '${escapedPrompt}' | ${this.claudeCommand}`;

      // Build full SSH command
      const sshCommand = this.buildSSHCommand(claudeCmd);

      logger.debug({ claudeCmd }, 'Executing Claude via SSH');

      // Execute command with timeout
      const timeout = options.timeout || 120000; // 2 minutes default
      const { stdout, stderr } = await execAsync(sshCommand, {
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (stderr && !options.ignoreStderr) {
        logger.warn({ stderr }, 'Claude SSH command produced stderr');
      }

      logger.debug({ responseLength: stdout.length }, 'Claude SSH response received');

      return stdout.trim();
    } catch (error) {
      logger.error({
        error: error.message,
        code: error.code,
        signal: error.signal
      }, 'Failed to execute Claude via SSH');

      if (error.killed) {
        throw new Error('Claude SSH command timed out');
      }

      throw new Error(`Claude SSH execution failed: ${error.message}`);
    }
  }

  /**
   * Stream Claude response (simulated streaming from SSH output)
   * @param {string} prompt - User prompt
   * @param {Function} onChunk - Callback for each chunk
   * @param {object} options - Additional options
   * @returns {Promise<void>}
   */
  async streamClaudeResponse(prompt, onChunk, options = {}) {
    if (!this.enabled) {
      throw new Error('ClaudeSSHProxyService is not enabled');
    }

    try {
      // For SSH, we can't do true streaming, so we'll get full response
      // and simulate streaming by sending it in chunks
      const response = await this.executeClaudeCommand(prompt, options);

      // Simulate streaming by splitting response into words
      const words = response.split(' ');
      const chunkSize = 5; // Send 5 words at a time

      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
        onChunk(chunk);

        // Small delay to simulate streaming (optional)
        if (options.streamDelay) {
          await new Promise(resolve => setTimeout(resolve, options.streamDelay));
        }
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to stream Claude response via SSH');
      throw error;
    }
  }

  /**
   * Test SSH connection to remote server
   * @returns {Promise<object>} - Test result
   */
  async testConnection() {
    if (!this.enabled) {
      return {
        success: false,
        error: 'SSH proxy not enabled (CLAUDE_SSH_HOST not set)'
      };
    }

    try {
      const testCommand = 'echo "SSH connection test successful"';
      const sshCommand = this.buildSSHCommand(testCommand);

      const { stdout, stderr } = await execAsync(sshCommand, {
        timeout: 10000 // 10 seconds
      });

      return {
        success: true,
        message: stdout.trim(),
        sshHost: this.sshHost,
        sshUser: this.sshUser
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        sshHost: this.sshHost
      };
    }
  }

  /**
   * Get service status
   * @returns {object} - Service status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      sshHost: this.sshHost,
      sshUser: this.sshUser,
      claudeCommand: this.claudeCommand,
      authMethod: this.sshPassword ? 'password' : 'ssh-keys'
    };
  }
}

// Export singleton instance
const claudeSSHProxyService = new ClaudeSSHProxyService();
export default claudeSSHProxyService;
