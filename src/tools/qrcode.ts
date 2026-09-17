/**
 * QR Code Generation Tool
 *
 * This tool generates an AI-powered QR code image that can be used as a bot avatar.
 * It calls the odin.qrcode-ai.com API to generate a customized QR code based on AI prompts.
 */

import { z } from 'zod';
import { UserError } from 'fastmcp';
import { createTool, MeetingBaaSTool } from '../utils/tool-types.js';

// API configuration
const QR_API_ENDPOINT = 'https://odin.qrcode-ai.com/api/qrcode';

// Define available QR code styles
const QR_STYLES = ['style_default', 'style_dots', 'style_rounded', 'style_crystal'] as const;

// Define QR code types
const QR_TYPES = ['url', 'email', 'phone', 'sms', 'text'] as const;

// Define the parameters for the generate QR code tool
const generateQRCodeParams = z.object({
  type: z.enum(QR_TYPES).describe('Type of QR code (url, email, phone, sms, text)'),
  to: z.string().describe('Destination for the QR code (URL, email, phone number, or text)'),
  prompt: z
    .string()
    .max(1000)
    .describe(
      'AI prompt to customize the QR code (max 1000 characters). You can also include your API key in the prompt using format "API key: qrc_your_key"',
    ),
  style: z.enum(QR_STYLES).default('style_default').describe('Style of the QR code'),
  useAsBotImage: z
    .boolean()
    .default(true)
    .describe('Whether to use the generated QR code as the bot avatar'),
  template: z.string().optional().describe('Template ID for the QR code (optional)'),
  apiKey: z
    .string()
    .optional()
    .describe(
      'Your QR Code AI API key (optional; falls back to the QRCODE_API_KEY environment variable)',
    ),
});

/**
 * Extracts a QR Code API key from the prompt text
 *
 * @param prompt The prompt text that might contain an API key
 * @returns The extracted API key or null if not found
 */
function extractApiKeyFromPrompt(prompt: string): string | null {
  const patterns = [
    /api\s*key\s*[=:]\s*(qrc_[a-zA-Z0-9_-]+)/i,
    /using\s*api\s*key\s*[=:]\s*(qrc_[a-zA-Z0-9_-]+)/i,
    /with\s*api\s*key\s*[=:]\s*(qrc_[a-zA-Z0-9_-]+)/i,
    /api\s*key\s*is\s*(qrc_[a-zA-Z0-9_-]+)/i,
    /api\s*key\s*(qrc_[a-zA-Z0-9_-]+)/i,
    /(qrc_[a-zA-Z0-9_-]+)/i, // Last resort to just look for the key format
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Cleans the prompt by removing any API key mentions
 *
 * @param prompt The original prompt text
 * @returns The cleaned prompt without API key mentions
 */
function cleanPrompt(prompt: string): string {
  // Remove API key phrases
  let cleaned = prompt.replace(/(\s*api\s*key\s*[=:]\s*qrc_[a-zA-Z0-9_-]+)/gi, '');
  cleaned = cleaned.replace(/(\s*using\s*api\s*key\s*[=:]\s*qrc_[a-zA-Z0-9_-]+)/gi, '');
  cleaned = cleaned.replace(/(\s*with\s*api\s*key\s*[=:]\s*qrc_[a-zA-Z0-9_-]+)/gi, '');
  cleaned = cleaned.replace(/(\s*api\s*key\s*is\s*qrc_[a-zA-Z0-9_-]+)/gi, '');
  cleaned = cleaned.replace(/(\s*api\s*key\s*qrc_[a-zA-Z0-9_-]+)/gi, '');

  // Remove just the key if it exists independently
  cleaned = cleaned.replace(/(\s*qrc_[a-zA-Z0-9_-]+)/gi, '');

  // Trim and clean up double spaces
  cleaned = cleaned.trim().replace(/\s+/g, ' ');

  return cleaned;
}

/**
 * Generate QR Code Tool
 *
 * This tool generates an AI-powered QR code that can be used as a bot avatar.
 */
export const generateQRCodeTool: MeetingBaaSTool<typeof generateQRCodeParams> = createTool(
  'generateQRCode',
  'Generate an AI-powered QR code that can be used as a bot avatar. You can include your API key directly in the prompt by saying "API key: qrc_your_key".',
  generateQRCodeParams,
  async (args, context) => {
    const { log } = context;

    // 1. Look for API key in the prompt text
    const promptApiKey = extractApiKeyFromPrompt(args.prompt);

    // 2. Clean the prompt by removing API key mentions if found
    const cleanedPrompt = cleanPrompt(args.prompt);

    // 3. Determine which API key to use (priority: 1. Param API key, 2. Prompt API key, 3. Environment variable)
    const environmentApiKey = process.env.QRCODE_API_KEY || '';
    const effectiveApiKey = args.apiKey || promptApiKey || environmentApiKey;

    // Log only non-sensitive metadata. Never log the raw prompt (it may embed a
    // key) and never log the key itself.
    log.info('Generating QR code', { type: args.type, style: args.style });

    if (!effectiveApiKey) {
      throw new UserError(
        'No QR Code API key configured. Provide one via the apiKey parameter, include "API key: qrc_..." in the prompt, or set the QRCODE_API_KEY environment variable.',
      );
    }

    // Log which key is being used (without revealing the actual key)
    log.info(
      `Using QR Code API key from: ${args.apiKey ? 'parameter' : promptApiKey ? 'prompt' : 'environment'}`,
    );

    try {
      const response = await fetch(QR_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveApiKey,
        },
        body: JSON.stringify({
          type: args.type,
          to: args.to,
          prompt: cleanedPrompt, // Use the cleaned prompt without API key
          style: args.style,
          template: args.template || '67d30dd4d22a25b77317f407', // Default template
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }

        log.error('QR Code API error:', { status: response.status, error: errorData });
        return {
          content: [
            {
              type: 'text' as const,
              text: `QR code generation failed: ${response.status} ${errorData.message || errorText}`,
            },
          ],
          isError: true,
        };
      }

      const data = await response.json();

      if (!data.qrcode?.url) {
        log.error('QR code URL not found in response', { data });
        return {
          content: [
            {
              type: 'text' as const,
              text: 'QR code URL not found in response',
            },
          ],
          isError: true,
        };
      }

      // Return the QR code URL
      const qrCodeUrl = data.qrcode.url;
      const responseText =
        `QR code generated successfully!\n\n` +
        `URL: ${qrCodeUrl}\n\n` +
        `This image ${args.useAsBotImage ? 'can be used' : 'will not be used'} as a bot avatar.\n\n` +
        `To create a bot with this QR code image, use the joinMeeting tool with botImage: "${qrCodeUrl}"`;

      return {
        content: [
          {
            type: 'text' as const,
            text: responseText,
          },
        ],
        isError: false,
        metadata: {
          qrCodeUrl: qrCodeUrl,
          useAsBotImage: args.useAsBotImage,
        },
      };
    } catch (error: unknown) {
      log.error('Error generating QR code', { error: String(error) });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error generating QR code: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);
