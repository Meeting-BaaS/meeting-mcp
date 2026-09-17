/**
 * Authentication utilities for handling API keys and sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionAuth } from '../api/client.js';

// Define a minimal logger interface rather than importing from fastmcp
interface Logger {
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

/**
 * Get an API key with fallback mechanisms.
 * Tries, in order:
 * 1. Session object (the only source for HTTP/SSE transports)
 * 2. Environment variable (stdio only)
 * 3. Claude Desktop config file (stdio only)
 *
 * Environment and config-file fallbacks are restricted to the stdio transport,
 * which is launched by the trusted local client. Enabling them for HTTP/SSE
 * would let any caller act with the operator's key.
 *
 * @param session The session object, which may contain an API key
 * @param log Optional logger for debugging
 * @returns An object with { apiKey, source } or null if no API key was found
 */
export function getApiKeyWithFallbacks(
  session: any | undefined,
  log?: Logger,
): { apiKey: string; source: string } | null {
  // Try to get API key from session
  if (session?.apiKey) {
    log?.debug('Using API key from session');
    return { apiKey: session.apiKey, source: 'session' };
  }

  // Only the stdio transport may fall back to ambient credentials.
  if (process.env.MCP_FROM_CLAUDE !== 'true') {
    log?.error(
      'No API key in session; environment and config fallbacks are disabled for HTTP transports',
    );
    return null;
  }

  // Try to get API key from environment variable
  if (process.env.MEETING_BAAS_API_KEY) {
    log?.debug('Using API key from environment variable');
    return { apiKey: process.env.MEETING_BAAS_API_KEY, source: 'environment' };
  }

  // Try to get API key from Claude Desktop config
  try {
    const claudeDesktopConfigPath = path.join(
      os.homedir(),
      'Library/Application Support/Claude/claude_desktop_config.json',
    );
    if (fs.existsSync(claudeDesktopConfigPath)) {
      const configContent = fs.readFileSync(claudeDesktopConfigPath, 'utf8');
      const configJson = JSON.parse(configContent);

      if (configJson.mcpServers?.meetingbaas?.headers?.['x-api-key']) {
        const apiKey = configJson.mcpServers.meetingbaas.headers['x-api-key'];
        log?.debug('Using API key from Claude Desktop config');
        return { apiKey, source: 'claude_config' };
      }
    }
  } catch (error) {
    log?.error('Error reading Claude Desktop config', { error });
  }

  // No API key found
  log?.error('No API key found in session, environment, or Claude Desktop config');
  return null;
}

/**
 * Creates a valid session object with an API key
 *
 * @param session The original session, which may be incomplete
 * @param log Optional logger for debugging
 * @returns A valid session object or null if no API key could be found
 */
export function createValidSession(session: any | undefined, log?: Logger): SessionAuth | null {
  const apiKeyInfo = getApiKeyWithFallbacks(session, log);

  if (!apiKeyInfo) {
    return null;
  }

  return { apiKey: apiKeyInfo.apiKey };
}
