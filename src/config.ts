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

// Server configuration
export const SERVER_CONFIG = {
  name: 'Meeting BaaS MCP',
  version: '1.1.0',
  // Overridable so tests and alternative deployments can avoid port collisions.
  port: Number(process.env.PORT) || 7017,
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
