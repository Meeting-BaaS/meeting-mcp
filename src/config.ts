/**
 * Configuration and constants for the MeetingBaaS MCP server
 */

// Environment configuration
export type Environment = 'gmeetbot' | 'preprod' | 'prod' | 'local';

// Current active environment (default to prod)
let currentEnvironment: Environment = 'prod';

// API base URLs for different environments
const API_URLS = {
  gmeetbot: 'https://api.gmeetbot.com',
  preprod: 'https://api.pre-prod-meetingbaas.com',
  prod: 'https://api.meetingbaas.com',
  local: 'http://localhost:3001',
};

// Get current API base URL based on the active environment
export const getApiBaseUrl = (): string => {
  return API_URLS[currentEnvironment];
};

// Set the active environment
export const setEnvironment = (env: Environment): void => {
  currentEnvironment = env;
  console.error(`[MCP Server] Environment switched to: ${env} (${API_URLS[env]})`);
};

// For backward compatibility and direct access
export const API_BASE_URL = API_URLS[currentEnvironment];

/**
 * Resolves the listen port from the `PORT` environment variable.
 *
 * Accepts an integer in [0, 65535] (0 requests an ephemeral port) and falls
 * back to 7017 only when `PORT` is unset. Invalid values fail fast rather than
 * silently binding a different port than the operator configured.
 */
export function resolvePort(raw: string | undefined, fallback = 7017): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value "${raw}": expected an integer between 0 and 65535.`);
  }

  return parsed;
}

// Server configuration
export const SERVER_CONFIG = {
  name: 'Meeting BaaS MCP',
  version: '1.1.0',
  port: resolvePort(process.env.PORT),
  endpoint: '/mcp',
};

// Bot configuration from environment variables (set in index.ts when loading Claude Desktop config)
export const BOT_CONFIG = {
  // Default bot name displayed in meetings
  defaultBotName: process.env.MEETING_BOT_NAME || null,
  // Default bot image URL
  defaultBotImage: process.env.MEETING_BOT_IMAGE || null,
  // Default bot entry message
  defaultEntryMessage: process.env.MEETING_BOT_ENTRY_MESSAGE || null,
  // Default extra metadata
  defaultExtra: process.env.MEETING_BOT_EXTRA ? JSON.parse(process.env.MEETING_BOT_EXTRA) : null,
};

// Log bot configuration at startup
if (
  BOT_CONFIG.defaultBotName ||
  BOT_CONFIG.defaultBotImage ||
  BOT_CONFIG.defaultEntryMessage ||
  BOT_CONFIG.defaultExtra
) {
  console.error(
    '[MCP Server] Bot configuration loaded:',
    BOT_CONFIG.defaultBotName ? `name="${BOT_CONFIG.defaultBotName}"` : '',
    BOT_CONFIG.defaultBotImage ? 'image=✓' : '',
    BOT_CONFIG.defaultEntryMessage ? 'message=✓' : '',
    BOT_CONFIG.defaultExtra ? 'extra=✓' : '',
  );
}

// Recording modes
export const RECORDING_MODES = ['speaker_view', 'gallery_view', 'audio_only'] as const;
export type RecordingMode = (typeof RECORDING_MODES)[number];

// Speech-to-text providers
export const SPEECH_TO_TEXT_PROVIDERS = ['Gladia', 'Runpod', 'Default'] as const;
export type SpeechToTextProvider = (typeof SPEECH_TO_TEXT_PROVIDERS)[number];

// Audio frequencies
export const AUDIO_FREQUENCIES = ['16khz', '24khz'] as const;
export type AudioFrequency = (typeof AUDIO_FREQUENCIES)[number];
