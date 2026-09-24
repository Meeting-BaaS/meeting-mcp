/**
 * Meeting BaaS MCP Server
 *
 * Connects Claude and other AI assistants to Meeting BaaS API,
 * allowing them to manage recordings, transcripts, and calendar data.
 */

import { FastMCP } from 'fastmcp';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { SERVER_CONFIG } from './config.js';
import {
  getHeader,
  isLoopbackAddress,
  isOriginAllowed,
  parseAllowedOrigins,
} from './utils/security.js';

// Import tools from the consolidated export
import {
  cancelRecordingTool,
  cancelRecordingWithCredentialsTool,
  checkCalendarIntegrationTool,
  deleteCalendarTool,
  deleteDataTool,
  findKeyMomentsTool,
  generateQRCodeTool,
  getCalendarTool,
  getEventTool,
  getMeetingDataTool,
  getMeetingDataWithCredentialsTool,
  getTranscriptTool,
  // Meeting tools
  joinMeetingTool,
  leaveMeetingTool,
  listBotsWithMetadataTool,
  listCalendarsTool,
  listEventsTool,
  listEventsWithCredentialsTool,
  listRawCalendarsTool,
  listUpcomingMeetingsTool,
  // Calendar tools
  oauthGuidanceTool,
  resyncAllCalendarsTool,
  retranscribeTool,
  scheduleRecordingTool,
  scheduleRecordingWithCredentialsTool,
  // Environment tools
  selectEnvironmentTool,
  setupCalendarOAuthTool,
  // Link tools
  shareableMeetingLinkTool,
  shareMeetingSegmentsTool,
} from './tools/index.js';

// Import resources
import { meetingMetadataResource, meetingTranscriptResource } from './resources/index.js';

// Define session auth type
type SessionAuth = { apiKey: string };

// Set up proper error logging
// This ensures logs go to stderr instead of stdout to avoid interfering with JSON communication
import { createServerLogger, setupPingFiltering } from './utils/logging.js';

// Set up ping message filtering to reduce log noise
setupPingFiltering();

const serverLog = createServerLogger('MCP Server');

// Add global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  // Check if this is a connection closed error from the MCP protocol
  const error = reason as any;
  if (error && error.code === -32000 && error.message?.includes('Connection closed')) {
    serverLog(`Connection closed gracefully, ignoring error`);
  } else {
    serverLog(`Unhandled Rejection: ${error?.message || String(reason)}`);
    console.error('[MCP Server] Error details:', reason);
  }
});

process.on('uncaughtException', (error) => {
  // Check if this is a connection closed error from the MCP protocol
  const err = error as any; // Cast to any to access non-standard properties
  if (err && err.code === 'ERR_UNHANDLED_ERROR' && err.context?.error?.code === -32000) {
    serverLog(`Connection closed gracefully, ignoring exception`);
  } else {
    serverLog(`Uncaught Exception: ${error?.message || String(error)}`);
    console.error('[MCP Server] Exception details:', error);
  }
});

// Log startup information
serverLog('========== SERVER STARTUP ==========');
serverLog(`Server version: ${SERVER_CONFIG.version}`);
serverLog(`Node version: ${process.version}`);
serverLog(`Running from Claude: ${process.env.MCP_FROM_CLAUDE === 'true' ? 'Yes' : 'No'}`);
serverLog(`Process ID: ${process.pid}`);

// Function to load and process the Claude Desktop config file
async function loadClaudeDesktopConfig() {
  try {
    // Define the expected config path
    const configPath = path.join(
      os.homedir(),
      'Library/Application Support/Claude/claude_desktop_config.json',
    );

    const fileExists = await fs
      .stat(configPath)
      .then(() => true)
      .catch(() => false);
    if (fileExists) {
      serverLog(`Loading config from: ${configPath}`);
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        const configJson = JSON.parse(configContent);

        // Check for meetingbaas server config
        if (configJson.mcpServers && configJson.mcpServers.meetingbaas) {
          const serverConfig = configJson.mcpServers.meetingbaas;

          // Check for headers
          if (serverConfig.headers) {
            // Check for API key header and set it as an environment variable
            if (serverConfig.headers['x-api-key']) {
              const apiKey = serverConfig.headers['x-api-key'];
              process.env.MEETING_BAAS_API_KEY = apiKey;
              serverLog(`API key loaded from config`);
            }

            // Check for QR code API key in headers (distinct from the Meeting BaaS key)
            if (serverConfig.headers['x-qrcode-api-key']) {
              const qrCodeApiKey = serverConfig.headers['x-qrcode-api-key'];
              process.env.QRCODE_API_KEY = qrCodeApiKey;
              serverLog(`QR code API key loaded from config`);
            }
          }

          // Check for bot configuration
          if (serverConfig.botConfig) {
            const botConfig = serverConfig.botConfig;
            let configItems = [];

            // Set bot name if available
            if (botConfig.name) {
              process.env.MEETING_BOT_NAME = botConfig.name;
              configItems.push('name');
            }

            // Set bot image if available
            if (botConfig.image) {
              process.env.MEETING_BOT_IMAGE = botConfig.image;
              configItems.push('image');
            }

            // Set bot entry message if available
            if (botConfig.entryMessage) {
              process.env.MEETING_BOT_ENTRY_MESSAGE = botConfig.entryMessage;
              configItems.push('message');
            }

            // Set extra fields if available
            if (botConfig.extra) {
              process.env.MEETING_BOT_EXTRA = JSON.stringify(botConfig.extra);
              configItems.push('extra');
            }

            if (configItems.length > 0) {
              serverLog(`Bot configuration loaded from config: ${configItems.join(', ')}`);
            }
          }
        }
      } catch (parseError) {
        serverLog(`Error parsing config file: ${parseError}`);
      }
    } else {
      serverLog(`Config file not found at ${configPath}`);
    }
  } catch (error) {
    serverLog(`Error loading config file: ${error}`);
  }
}

// Load the Claude Desktop config and set up the server
(async () => {
  // Load and log the Claude Desktop config
  await loadClaudeDesktopConfig();

  // Transport security configuration (read once at startup).
  const allowRemote = process.env.MCP_ALLOW_REMOTE === 'true';
  const allowedOrigins = parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS);

  // Configure the server
  const server = new FastMCP<SessionAuth>({
    name: SERVER_CONFIG.name,
    version: '1.1.0', // Using explicit semantic version format
    authenticate: async (request: any) => {
      // FastMCP passes the Node `http.IncomingMessage` for HTTP/SSE transports.
      // Support both shapes for forward compatibility.
      const req = request?.request ?? request;
      const headers = req?.headers ?? {};
      const remoteAddress: string | undefined =
        req?.socket?.remoteAddress ?? req?.connection?.remoteAddress;
      const origin = getHeader(headers, 'origin');

      try {
        // 1. Local-only by default. The bundled `mcp-proxy` binds every
        //    interface, so reject non-loopback peers unless explicitly allowed.
        if (!allowRemote && !isLoopbackAddress(remoteAddress)) {
          serverLog(`Rejected request from non-loopback address: ${remoteAddress ?? 'unknown'}`);
          throw new Response(null, { status: 403, statusText: 'Forbidden' });
        }

        // 2. Optional Origin allowlist (defense in depth for browser clients).
        if (!isOriginAllowed(origin, allowedOrigins)) {
          serverLog(`Rejected request from disallowed origin: ${origin}`);
          throw new Response(null, { status: 403, statusText: 'Forbidden' });
        }

        // 3. An API key must be supplied by the caller on every request.
        //    Deliberately no environment-variable fallback here: doing so would
        //    authenticate any caller as the operator.
        const apiKey = getHeader(headers, 'x-api-key');
        if (!apiKey) {
          serverLog('Authentication failed: no x-api-key header supplied');
          throw new Response(null, {
            status: 401,
            statusText: 'API key required in x-api-key header',
          });
        }

        return { apiKey };
      } catch (error) {
        // Preserve the intended HTTP status of our own control-flow responses.
        if (error instanceof Response) {
          throw error;
        }
        serverLog(`Authentication error: ${error}`);
        throw new Response(null, { status: 500, statusText: 'Authentication error' });
      }
    },
  });

  // Register tools and add debug event listeners
  server.on('connect', (event) => {
    serverLog(`Client connected`);
  });

  server.on('disconnect', (event) => {
    serverLog(`Client disconnected`);
  });

  // Register tools using our helper function - only register the ones we've updated with MeetingBaaSTool
  registerTool(server, joinMeetingTool);
  registerTool(server, leaveMeetingTool);
  registerTool(server, getMeetingDataTool);
  registerTool(server, getMeetingDataWithCredentialsTool);
  registerTool(server, retranscribeTool);

  // For the rest, use the original method until we refactor them
  server.addTool(getTranscriptTool);
  server.addTool(oauthGuidanceTool);
  server.addTool(listRawCalendarsTool);
  server.addTool(setupCalendarOAuthTool);
  server.addTool(listCalendarsTool);
  server.addTool(getCalendarTool);
  server.addTool(deleteCalendarTool);
  server.addTool(resyncAllCalendarsTool);
  server.addTool(listUpcomingMeetingsTool);
  server.addTool(listEventsTool);
  server.addTool(listEventsWithCredentialsTool);
  server.addTool(getEventTool);
  server.addTool(scheduleRecordingTool);
  server.addTool(scheduleRecordingWithCredentialsTool);
  server.addTool(cancelRecordingTool);
  server.addTool(cancelRecordingWithCredentialsTool);
  server.addTool(checkCalendarIntegrationTool);
  server.addTool(shareableMeetingLinkTool);
  server.addTool(shareMeetingSegmentsTool);
  server.addTool(findKeyMomentsTool);
  server.addTool(deleteDataTool);
  server.addTool(listBotsWithMetadataTool);
  server.addTool(selectEnvironmentTool);
  server.addTool(generateQRCodeTool);

  // Register resources
  server.addResourceTemplate(meetingTranscriptResource);
  server.addResourceTemplate(meetingMetadataResource);

  // Determine transport type based on environment
  // If run from Claude Desktop, use stdio transport
  // Otherwise use SSE transport for web/HTTP interfaces
  const isClaudeDesktop = process.env.MCP_FROM_CLAUDE === 'true';

  const transportConfig = isClaudeDesktop
    ? {
        transportType: 'stdio' as const,
        debug: true,
      }
    : {
        transportType: 'sse' as const,
        sse: {
          endpoint: '/mcp' as `/${string}`,
          port: SERVER_CONFIG.port,
        },
      };

  // Start the server
  try {
    server.start(transportConfig);

    if (!isClaudeDesktop) {
      serverLog(`Meeting BaaS MCP Server started on http://localhost:${SERVER_CONFIG.port}/mcp`);
      serverLog(
        `Security: ${allowRemote ? 'remote clients allowed (MCP_ALLOW_REMOTE=true)' : 'loopback-only'}; ` +
          `allowed origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'any (x-api-key still required)'}`,
      );
    } else {
      serverLog(`Meeting BaaS MCP Server started in stdio mode for Claude Desktop`);
    }
  } catch (error) {
    serverLog(`Error starting server: ${error}`);
  }
})();

import type { Tool } from 'fastmcp';
import type { MeetingBaaSTool } from './utils/tool-types.js';

/**
 * Helper function to safely register tools with the FastMCP server
 *
 * This function handles the type casting needed to satisfy TypeScript
 * while still using our properly designed MeetingBaaSTool interface
 */
function registerTool<P extends z.ZodType>(
  server: FastMCP<SessionAuth>,
  tool: MeetingBaaSTool<P>,
): void {
  // Cast to any to bypass TypeScript's strict type checking
  // This is safe because our MeetingBaaSTool interface ensures compatibility
  server.addTool(tool as unknown as Tool<SessionAuth, P>);
}
