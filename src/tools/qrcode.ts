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
  prompt: z.string().max(1000).describe('AI prompt to customize the QR code (max 1000 characters)'),
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
 * Generate QR Code Tool
 *
 * This tool generates an AI-powered QR code that can be used as a bot avatar.
 */
export const generateQRCodeTool: MeetingBaaSTool<typeof generateQRCodeParams> = createTool(
  'generateQRCode',
  'Generate an AI-powered QR code that can be used as a bot avatar. The QR Code AI API key is taken from the apiKey parameter or the QRCODE_API_KEY environment variable; never put it in the prompt.',
  generateQRCodeParams,
  async (args, context) => {
    const { log } = context;

    // The QR Code API key comes only from an explicit parameter or the
    // environment. Prompt-based keys are not supported: the prompt enters the
    // model/client context and may be retained in conversation history.
    const environmentApiKey = process.env.QRCODE_API_KEY || '';
    const effectiveApiKey = args.apiKey || environmentApiKey;

    // Log only non-sensitive metadata. Never log the raw prompt and never log
    // the key itself.
    log.info('Generating QR code', { type: args.type, style: args.style });

    if (!effectiveApiKey) {
      throw new UserError(
        'No QR Code API key configured. Provide one via the apiKey parameter or set the QRCODE_API_KEY environment variable.',
      );
    }

    // Log which key is being used (without revealing the actual key)
    log.info(`Using QR Code API key from: ${args.apiKey ? 'parameter' : 'environment'}`);

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
          prompt: args.prompt,
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
