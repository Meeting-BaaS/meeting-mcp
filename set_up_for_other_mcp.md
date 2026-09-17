# Meeting BaaS MCP Server Setup Guide

This guide explains how to set up a Meeting BaaS MCP server that connects AI assistants to the Meeting BaaS API for managing recordings, transcripts, and calendar data.

## Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher)
- Redis (optional, for state management)

## Project Setup

1. Create a new directory for your project and initialize it:

```bash
mkdir my-mcp-server
cd my-mcp-server
npm init -y
```

2. Update your package.json with the necessary dependencies:

```json
{
  "name": "meetingbaas-mcp",
  "version": "1.0.0",
  "description": "Meeting BaaS MCP Server",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-esm src/index.ts",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "prepare": "husky install"
  },
  "dependencies": {
    "@meeting-baas/sdk": "^0.2.0",
    "axios": "^1.6.0",
    "express": "^4.18.2",
    "fastmcp": "^1.20.2",
    "redis": "^4.6.13",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.19",
    "@types/redis": "^4.0.11",
    "husky": "^8.0.3",
    "prettier": "^3.1.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

3. Install the dependencies:

```bash
npm install
```

4. Create a TypeScript configuration file (tsconfig.json):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  },
  "include": ["src/**/*", "lib/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## File Structure

Create the following directory structure:

```
my-mcp-server/
├── lib/
│   ├── mcp-api-handler.ts
│   └── tool-adapter.ts
├── src/
│   ├── api/
│   │   └── client.ts
│   ├── tools/
│   │   ├── index.ts
│   │   ├── calendar.ts
│   │   ├── deleteData.ts
│   │   ├── environment.ts
│   │   ├── links.ts
│   │   ├── listBots.ts
│   │   ├── meeting.ts
│   │   ├── qrcode.ts
│   │   ├── retranscribe.ts
│   │   └── search.ts
│   ├── utils/
│   │   ├── logging.ts
│   │   └── tool-types.ts
│   └── index.ts
└── tsconfig.json
```

## Key Files Implementation

### 1. lib/mcp-api-handler.ts

```typescript
import type { Request, Response } from 'express';
import type { Context, FastMCP } from 'fastmcp';
import { createClient } from 'redis';

interface McpApiHandlerOptions {
  capabilities?: {
    tools?: Record<string, { description: string }>;
  };
  port?: number;
  transportType?: 'stdio' | 'sse';
  sse?: {
    endpoint: `/${string}`;
  };
}

export function initializeMcpApiHandler(
  setupServer: (server: FastMCP) => Promise<void>,
  options: McpApiHandlerOptions = {},
): (req: Request, res: Response) => Promise<void> {
  const {
    capabilities = {},
    port = 3000,
    transportType = 'sse',
    sse = { endpoint: '/mcp' },
  } = options;

  // Initialize Redis client
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  // Initialize FastMCP server
  const server = new FastMCP({
    name: 'Meeting BaaS MCP Server',
    version: '1.0.0' as const,
    authenticate: async (context: Context) => {
      const apiKey = context.request?.headers?.['x-api-key'];
      if (!apiKey) {
        throw new Error('API key required');
      }
      return { apiKey: String(apiKey) };
    },
  });

  // Set up server capabilities
  server.setCapabilities(capabilities);

  // Set up server tools
  setupServer(server).catch((error) => {
    console.error('Error setting up server:', error);
  });

  // Handle SSE transport
  if (transportType === 'sse') {
    return async (req: Request, res: Response) => {
      if (req.path !== sse.endpoint) {
        res.status(404).send('Not found');
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const transport = server.createTransport('sse', {
        request: req,
        response: res,
      });

      await server.handleTransport(transport);
    };
  }

  // Handle stdio transport
  if (transportType === 'stdio') {
    const transport = server.createTransport('stdio', {
      stdin: process.stdin,
      stdout: process.stdout,
    });

    server.handleTransport(transport).catch((error) => {
      console.error('Error handling stdio transport:', error);
    });
  }

  // Return a no-op handler for non-SSE requests
  return async (req: Request, res: Response) => {
    res.status(404).send('Not found');
  };
}
```

### 2. lib/tool-adapter.ts

```typescript
import type { Context, Tool } from 'fastmcp';
import type { SessionAuth } from '../src/api/client.js';
import type { MeetingBaaSTool } from '../src/utils/tool-types.js';

// Adapter function to convert Meeting BaaS tools to FastMCP tools
export function adaptTool<P extends Record<string, any>>(
  meetingTool: MeetingBaaSTool<any>
): Tool<SessionAuth, any> {
  return {
    name: meetingTool.name,
    description: meetingTool.description,
    parameters: meetingTool.parameters,
    execute: meetingTool.execute,
  };
}
```

### 3. src/utils/tool-types.ts

```typescript
import type { z } from 'zod';
import type { Context } from 'fastmcp';
import type { SessionAuth } from '../api/client.js';

/**
 * Type for tool execution result
 */
export type ToolResult = {
  content: { type: 'text'; text: string }[];
};

/**
 * Base type for Meeting BaaS tools
 */
export type MeetingBaaSTool<P extends z.ZodType> = {
  name: string;
  description: string;
  parameters: P;
  execute: (params: z.infer<P>, context: Context<SessionAuth>) => Promise<ToolResult>;
};

/**
 * Helper function to create a Meeting BaaS tool with the correct type
 */
export function createTool<P extends z.ZodType>(
  name: string,
  description: string,
  parameters: P,
  execute: (params: z.infer<P>, context: Context<SessionAuth>) => Promise<ToolResult>
): MeetingBaaSTool<P> {
  return {
    name,
    description,
    parameters,
    execute,
  };
}
```

### 4. src/utils/logging.ts

```typescript
/**
 * Creates a server logger
 * 
 * @param prefix - Prefix to add to log messages
 * @returns Logging function
 */
export function createServerLogger(prefix: string) {
  return function log(message: string) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${prefix}] ${message}`);
  };
}

/**
 * Sets up filtering for ping messages
 * 
 * This reduces log noise by filtering out the periodic ping messages
 */
export function setupPingFiltering() {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  // Replace stdout.write
  process.stdout.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding,
    callback?: (err?: Error) => void
  ) => {
    // Filter out ping messages
    if (typeof chunk === 'string' && chunk.includes('"method":"ping"')) {
      return true;
    }
    return originalStdoutWrite(chunk, encoding, callback);
  }) as typeof process.stdout.write;

  // Replace stderr.write
  process.stderr.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding,
    callback?: (err?: Error) => void
  ) => {
    // Filter out ping messages
    if (typeof chunk === 'string' && chunk.includes('"method":"ping"')) {
      return true;
    }
    return originalStderrWrite(chunk, encoding, callback);
  }) as typeof process.stderr.write;
}
```

### 5. src/api/client.ts

```typescript
import axios from 'axios';

// Session auth type for authenticating with the Meeting BaaS API
export type SessionAuth = { apiKey: string };

// Create an API client with the session auth
export function createApiClient(session: SessionAuth) {
  const apiUrl = process.env.MEETING_BAAS_API_URL || 'https://api.meetingbaas.com';
  
  return axios.create({
    baseURL: apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': session.apiKey,
    },
  });
}
```

### 6. src/index.ts

```typescript
/**
 * Meeting BaaS MCP Server
 *
 * Connects Claude and other AI assistants to Meeting BaaS API,
 * allowing them to manage recordings, transcripts, and calendar data.
 */

import { BaasClient, MpcClient } from '@meeting-baas/sdk';
import type { Context } from 'fastmcp';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initializeMcpApiHandler } from '../lib/mcp-api-handler.js';
import { adaptTool } from '../lib/tool-adapter.js';
import type { SessionAuth } from './api/client.js';
import { createTool } from './utils/tool-types.js';

// Set up proper error logging
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
  const err = error as any;
  if (err && err.code === 'ERR_UNHANDLED_ERROR' && err.context?.error?.code === -32000) {
    serverLog(`Connection closed gracefully, ignoring exception`);
  } else {
    serverLog(`Uncaught Exception: ${error?.message || String(error)}`);
    console.error('[MCP Server] Exception details:', error);
  }
});

// Log startup information
serverLog('========== SERVER STARTUP ==========');
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

// Initialize the BaaS client
const baasClient = new BaasClient({
  apiKey: process.env.MEETING_BAAS_API_KEY || '',
});

// Initialize MPC client for tool registration
const mpcClient = new MpcClient({
  serverUrl: process.env.MPC_SERVER_URL || 'http://localhost:7020',
});

interface ToolParameter {
  name: string;
  required?: boolean;
  schema?: {
    type: string;
  };
}

// Helper function to convert MPC parameter definition to Zod schema
function convertToZodSchema(parameters: ToolParameter[]): z.ZodType {
  const schema: Record<string, z.ZodType> = {};
  for (const param of parameters) {
    if (param.required) {
      schema[param.name] = z.string(); // Default to string for now, can be expanded based on param.schema.type
    } else {
      schema[param.name] = z.string().optional();
    }
  }
  return z.object(schema);
}

const handler = initializeMcpApiHandler(
  async (server: FastMCP) => {
    // Register all Meeting BaaS tools automatically
    const tools = mpcClient.getRegisteredTools();
    for (const tool of tools) {
      const paramsSchema = convertToZodSchema(tool.parameters || []);
      const meetingTool = createTool(
        tool.name,
        tool.description || 'Meeting BaaS tool',
        paramsSchema,
        async (params: Record<string, unknown>, context: Context<SessionAuth>) => {
          // Handle tool execution here
          return {
            content: [{ type: 'text', text: `Tool ${tool.name} executed` }],
          };
        },
      );
      server.addTool(adaptTool(meetingTool));
    }

    // Keep the existing echo tool as an example
    const echoTool = createTool(
      'echo',
      'Echo a message',
      z.object({ message: z.string() }),
      async ({ message }: { message: string }, context: Context<SessionAuth>) => ({
        content: [{ type: 'text', text: `Tool echo: ${message}` }],
      }),
    );
    server.addTool(adaptTool(echoTool));
  },
  {
    capabilities: {
      tools: {
        echo: {
          description: 'Echo a message',
        },
        // Meeting BaaS tools will be automatically added to capabilities
      },
    },
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    transportType: process.env.MCP_FROM_CLAUDE === 'true' ? 'stdio' : 'sse',
    sse: {
      endpoint: '/mcp' as `/${string}`,
    },
  },
);

// Load the Claude Desktop config and start the server
(async () => {
  // Load and log the Claude Desktop config
  await loadClaudeDesktopConfig();

  // Start the server
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    const isClaudeDesktop = process.env.MCP_FROM_CLAUDE === 'true';

    if (!isClaudeDesktop) {
      serverLog(`Meeting BaaS MCP Server starting on http://localhost:${port}/mcp`);
    } else {
      serverLog(`Meeting BaaS MCP Server starting in stdio mode for Claude Desktop`);
    }

    // Start the server using the appropriate method based on environment
    if (isClaudeDesktop) {
      // For Claude Desktop, we use stdio transport
      process.stdin.pipe(process.stdout);
    } else {
      // For web/HTTP interface, we use the handler directly
      const http = require('http');
      const server = http.createServer(handler);
      server.listen(port, () => {
        serverLog(`Server listening on port ${port}`);
      });
    }
  } catch (error) {
    serverLog(`Error starting server: ${error}`);
  }
})();

export default handler;
```

## Tool Examples

Here are examples of tools that you can implement in the tools directory:

### src/tools/environment.ts

```typescript
import { z } from 'zod';
import { createTool } from '../utils/tool-types.js';

/**
 * Tool to select the environment for API requests
 */
export const selectEnvironmentTool = createTool(
  'selectEnvironment',
  'Switch between API environments',
  z.object({
    environment: z.enum(['production', 'staging', 'development']),
  }),
  async ({ environment }, context) => {
    // Set the environment for subsequent requests
    process.env.MEETING_BAAS_API_ENVIRONMENT = environment;
    
    return {
      content: [
        { type: 'text', text: `Environment set to ${environment}` },
      ],
    };
  }
);
```

### src/tools/deleteData.ts

```typescript
import { z } from 'zod';
import { createApiClient } from '../api/client.js';
import { createTool } from '../utils/tool-types.js';

/**
 * Tool to delete data associated with a bot
 */
export const deleteDataTool = createTool(
  'deleteData',
  'Delete data associated with a bot',
  z.object({
    botId: z.string().uuid(),
  }),
  async ({ botId }, context) => {
    try {
      const client = createApiClient(context.session);
      
      // Call the API to delete bot data
      await client.delete(`/bots/${botId}/data`);
      
      return {
        content: [
          { type: 'text', text: `Successfully deleted data for bot ${botId}` },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: 'text', text: `Error deleting data: ${error.message}` },
        ],
      };
    }
  }
);
```

### src/tools/listBots.ts

```typescript
import { z } from 'zod';
import { createApiClient } from '../api/client.js';
import { createTool } from '../utils/tool-types.js';

/**
 * Tool to list bots with metadata
 */
export const listBotsWithMetadataTool = createTool(
  'listBotsWithMetadata',
  'List all bots with their metadata',
  z.object({}),
  async (_, context) => {
    try {
      const client = createApiClient(context.session);
      
      // Call the API to get bots
      const response = await client.get('/bots');
      const bots = response.data;
      
      return {
        content: [
          { type: 'text', text: JSON.stringify(bots, null, 2) },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: 'text', text: `Error listing bots: ${error.message}` },
        ],
      };
    }
  }
);
```

### src/tools/index.ts

```typescript
// Export all tools
export { deleteDataTool } from './deleteData.js';
export { listBotsWithMetadataTool } from './listBots.js';
export { selectEnvironmentTool } from './environment.js';
// Add exports for other tools
```

## Running the Server

1. Build the project:

```bash
npm run build
```

2. Start the server:

```bash
npm start
```

## Environment Variables

The server supports the following environment variables:

- `MEETING_BAAS_API_KEY`: API key for authenticating with the Meeting BaaS API. For HTTP/SSE transports the key must instead be supplied by the caller in the `x-api-key` header on every request; this variable is only honoured by the stdio transport.
- `MEETING_BAAS_API_URL`: Base URL for the Meeting BaaS API (default: https://api.meetingbaas.com)
- `PORT`: Port to run the server on (default: 3000)
- `MCP_FROM_CLAUDE`: Set to 'true' when running from Claude Desktop
- `MCP_ALLOW_REMOTE`: Set to 'true' to accept HTTP/SSE connections from non-loopback addresses (default: loopback-only)
- `MCP_ALLOWED_ORIGINS`: Comma-separated list of permitted browser `Origin` values for HTTP/SSE
- `REDIS_URL`: URL for Redis connection (optional)
- `MPC_SERVER_URL`: URL for the MPC server (default: http://localhost:7020)
- `MEETING_BOT_NAME`: Default name for bots
- `MEETING_BOT_IMAGE`: Default image URL for bots
- `MEETING_BOT_ENTRY_MESSAGE`: Default entry message for bots
- `MEETING_BOT_EXTRA`: JSON string with extra bot configuration

## Additional Resources

- [FastMCP Documentation](https://github.com/fastmcp/fastmcp)
- [Meeting BaaS SDK Documentation](https://github.com/meeting-baas/sdk)
- [Zod Documentation](https://github.com/colinhacks/zod)