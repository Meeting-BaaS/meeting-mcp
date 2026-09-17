/**
 * MCP tools for calendar integration
 *
 * This module provides a comprehensive set of tools for integrating with
 * Google and Microsoft calendars through the Meeting BaaS API. It includes
 * tools for OAuth setup, calendar management, event management, and recording scheduling.
 */

import type { Context, TextContent } from 'fastmcp';
import { z } from 'zod';
import { apiRequest } from '../api/client.js';
import { redactSecrets } from '../utils/security.js';
import { Calendar, CalendarEvent } from '../types/index.js';

// Define our session auth type
type SessionAuth = { apiKey: string };

// Define parameter schemas
const emptyParams = z.object({});

// Schema for OAuth setup and raw calendar listing
const oauthSetupParams = z.object({
  platform: z
    .enum(['Google', 'Microsoft'])
    .describe('The calendar provider platform (Google or Microsoft)'),
  clientId: z
    .string()
    .describe('OAuth client ID obtained from Google Cloud Console or Microsoft Azure portal'),
  clientSecret: z
    .string()
    .describe('OAuth client secret obtained from Google Cloud Console or Microsoft Azure portal'),
  refreshToken: z
    .string()
    .describe('OAuth refresh token obtained after user grants calendar access'),
  rawCalendarId: z
    .string()
    .optional()
    .describe(
      'Optional ID of specific calendar to integrate (from listRawCalendars). If not provided, the primary calendar is used',
    ),
});

const calendarIdParams = z.object({
  calendarId: z.string().uuid().describe('UUID of the calendar to query'),
});

const upcomingMeetingsParams = z.object({
  calendarId: z.string().uuid().describe('UUID of the calendar to query'),
  status: z
    .enum(['upcoming', 'past', 'all'])
    .optional()
    .default('upcoming')
    .describe("Filter for meeting status: 'upcoming' (default), 'past', or 'all'"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Maximum number of events to return'),
});

const listEventsParams = z.object({
  calendarId: z.string().uuid().describe('UUID of the calendar to query'),
  status: z
    .enum(['upcoming', 'past', 'all'])
    .optional()
    .default('upcoming')
    .describe("Filter for meeting status: 'upcoming' (default), 'past', or 'all'"),
  startDateGte: z
    .string()
    .optional()
    .describe(
      "Filter events with start date ≥ this ISO-8601 timestamp (e.g., '2023-01-01T00:00:00Z')",
    ),
  startDateLte: z
    .string()
    .optional()
    .describe(
      "Filter events with start date ≤ this ISO-8601 timestamp (e.g., '2023-12-31T23:59:59Z')",
    ),
  attendeeEmail: z
    .string()
    .email()
    .optional()
    .describe('Filter events including this attendee email'),
  organizerEmail: z.string().email().optional().describe('Filter events with this organizer email'),
  updatedAtGte: z
    .string()
    .optional()
    .describe('Filter events updated at or after this ISO-8601 timestamp'),
  cursor: z.string().optional().describe('Pagination cursor from previous response'),
});

const eventIdParams = z.object({
  eventId: z.string().uuid().describe('UUID of the calendar event to query'),
});

const scheduleRecordingParams = z.object({
  eventId: z.string().uuid().describe('UUID of the calendar event to record'),
  botName: z.string().describe('Name to display for the bot in the meeting'),
  botImage: z.string().url().optional().describe("URL to an image for the bot's avatar (optional)"),
  entryMessage: z
    .string()
    .optional()
    .describe('Message the bot will send when joining the meeting (optional)'),
  recordingMode: z
    .enum(['speaker_view', 'gallery_view', 'audio_only'] as const)
    .default('speaker_view')
    .describe("Recording mode: 'speaker_view' (default), 'gallery_view', or 'audio_only'"),
  speechToTextProvider: z
    .enum(['Gladia', 'Runpod', 'Default'] as const)
    .optional()
    .describe('Provider for speech-to-text transcription (optional)'),
  speechToTextApiKey: z
    .string()
    .optional()
    .describe('API key for the speech-to-text provider if required (optional)'),
  extra: z
    .record(z.any())
    .optional()
    .describe('Additional metadata about the meeting (e.g., meetingType, participants)'),
  allOccurrences: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'For recurring events, schedule recording for all occurrences (true) or just this instance (false)',
    ),
});

const cancelRecordingParams = z.object({
  eventId: z.string().uuid().describe('UUID of the calendar event to cancel recording for'),
  allOccurrences: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'For recurring events, cancel recording for all occurrences (true) or just this instance (false)',
    ),
});

// Tool type with correct typing
type Tool<P extends z.ZodType<any, any>> = {
  name: string;
  description: string;
  parameters: P;
  execute: (
    args: z.infer<P>,
    context: Context<SessionAuth>,
  ) => Promise<string | { content: TextContent[] }>;
};

/**
 * List available calendars
 */
export const listCalendarsTool: Tool<typeof emptyParams> = {
  name: 'listCalendars',
  description: 'List all calendars integrated with Meeting BaaS',
  parameters: emptyParams,
  execute: async (_args, context) => {
    const { session, log } = context;
    log.info('Listing calendars');

    const response = await apiRequest(session, 'get', '/calendars/');

    if (response.length === 0) {
      return 'No calendars found. You can add a calendar using the setupCalendarOAuth tool.';
    }

    const calendarList = response
      .map((cal: Calendar) => `- ${cal.name} (${cal.email}) [ID: ${cal.uuid}]`)
      .join('\n');

    return `Found ${response.length} calendars:\n\n${calendarList}`;
  },
};

/**
 * Get calendar details
 */
export const getCalendarTool: Tool<typeof calendarIdParams> = {
  name: 'getCalendar',
  description: 'Get detailed information about a specific calendar integration',
  parameters: calendarIdParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Getting calendar details', { calendarId: args.calendarId });

    const response = await apiRequest(session, 'get', `/calendars/${args.calendarId}`);

    return `Calendar Details:
Name: ${response.name}
Email: ${response.email}
Platform ID: ${response.google_id || response.microsoft_id}
UUID: ${response.uuid}
${response.resource_id ? `Resource ID: ${response.resource_id}` : ''}`;
  },
};

/**
 * List raw calendars (before integration)
 */
export const listRawCalendarsTool: Tool<typeof oauthSetupParams> = {
  name: 'listRawCalendars',
  description: 'List available calendars from Google or Microsoft before integration',
  parameters: oauthSetupParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Listing raw calendars', { platform: args.platform });

    const payload = {
      oauth_client_id: args.clientId,
      oauth_client_secret: args.clientSecret,
      oauth_refresh_token: args.refreshToken,
      platform: args.platform,
    };

    try {
      const response = await apiRequest(session, 'post', '/calendars/raw', payload);

      if (!response.calendars || response.calendars.length === 0) {
        return 'No calendars found. Please check your OAuth credentials.';
      }

      const calendarList = response.calendars
        .map((cal: any) => {
          const isPrimary = cal.is_primary ? ' (Primary)' : '';
          return `- ${cal.email}${isPrimary} [ID: ${cal.id}]`;
        })
        .join('\n');

      return `Found ${response.calendars.length} raw calendars. You can use the setupCalendarOAuth tool to integrate any of these:\n\n${calendarList}\n\nGuidance: Copy the ID of the calendar you want to integrate and use it as the rawCalendarId parameter in setupCalendarOAuth.`;
    } catch (error) {
      return `Error listing raw calendars: ${error instanceof Error ? error.message : String(error)}\n\nGuidance for obtaining OAuth credentials:\n\n1. For Google:\n   - Go to Google Cloud Console (https://console.cloud.google.com)\n   - Create a project and enable the Google Calendar API\n   - Create OAuth 2.0 credentials (client ID and secret)\n   - Set up consent screen with calendar scopes\n   - Use OAuth playground (https://developers.google.com/oauthplayground) to get a refresh token\n\n2. For Microsoft:\n   - Go to Azure Portal (https://portal.azure.com)\n   - Register an app in Azure AD\n   - Add Microsoft Graph API permissions for calendars\n   - Create a client secret\n   - Use a tool like Postman to get a refresh token`;
    }
  },
};

/**
 * Setup calendar OAuth integration
 */
export const setupCalendarOAuthTool: Tool<typeof oauthSetupParams> = {
  name: 'setupCalendarOAuth',
  description: 'Integrate a calendar using OAuth credentials',
  parameters: oauthSetupParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Setting up calendar OAuth', { platform: args.platform });

    const payload: {
      oauth_client_id: string;
      oauth_client_secret: string;
      oauth_refresh_token: string;
      platform: 'Google' | 'Microsoft';
      raw_calendar_id?: string;
    } = {
      oauth_client_id: args.clientId,
      oauth_client_secret: args.clientSecret,
      oauth_refresh_token: args.refreshToken,
      platform: args.platform,
    };

    if (args.rawCalendarId) {
      payload.raw_calendar_id = args.rawCalendarId;
    }

    try {
      const response = await apiRequest(session, 'post', '/calendars/', payload);

      return `Calendar successfully integrated!\n\nDetails:
Name: ${response.calendar.name}
Email: ${response.calendar.email}
UUID: ${response.calendar.uuid}

You can now use this UUID to list events or schedule recordings.`;
    } catch (error) {
      return `Error setting up calendar: ${error instanceof Error ? error.message : String(error)}\n\nPlease verify your OAuth credentials. Here's how to obtain them:\n\n1. For Google Calendar:\n   - Visit https://console.cloud.google.com\n   - Create a project and enable Google Calendar API\n   - Configure OAuth consent screen\n   - Create OAuth client ID and secret\n   - Use OAuth playground to get refresh token\n\n2. For Microsoft Calendar:\n   - Visit https://portal.azure.com\n   - Register an application\n   - Add Microsoft Graph calendar permissions\n   - Create client secret\n   - Complete OAuth flow to get refresh token`;
    }
  },
};

/**
 * Delete calendar integration
 */
export const deleteCalendarTool: Tool<typeof calendarIdParams> = {
  name: 'deleteCalendar',
  description: 'Permanently remove a calendar integration',
  parameters: calendarIdParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Deleting calendar', { calendarId: args.calendarId });

    try {
      await apiRequest(session, 'delete', `/calendars/${args.calendarId}`);

      return 'Calendar integration has been successfully removed. All associated events and scheduled recordings have been deleted.';
    } catch (error) {
      return `Error deleting calendar: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Force resync of all calendars
 */
export const resyncAllCalendarsTool: Tool<typeof emptyParams> = {
  name: 'resyncAllCalendars',
  description: 'Force a resync of all connected calendars',
  parameters: emptyParams,
  execute: async (_args, context) => {
    const { session, log } = context;
    log.info('Resyncing all calendars');

    try {
      const response = await apiRequest(session, 'post', '/calendars/resync_all');

      const syncedCount = response.synced_calendars?.length || 0;
      const errorCount = response.errors?.length || 0;

      let result = `Calendar sync operation completed.\n\n${syncedCount} calendars synced successfully.`;

      if (errorCount > 0) {
        result += `\n\n${errorCount} calendars failed to sync:`;
        response.errors.forEach((error: any) => {
          result += `\n- Calendar ${error[0]}: ${error[1]}`;
        });
      }

      return result;
    } catch (error) {
      return `Error resyncing calendars: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * List upcoming meetings
 */
export const listUpcomingMeetingsTool: Tool<typeof upcomingMeetingsParams> = {
  name: 'listUpcomingMeetings',
  description: 'List upcoming meetings from a calendar',
  parameters: upcomingMeetingsParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Listing upcoming meetings', {
      calendarId: args.calendarId,
      status: args.status,
    });

    const response = await apiRequest(
      session,
      'get',
      `/calendar_events/?calendar_id=${args.calendarId}&status=${args.status}`,
    );

    if (!response.data || response.data.length === 0) {
      return `No ${args.status} meetings found in this calendar.`;
    }

    const meetings = response.data.slice(0, args.limit);

    const meetingList = meetings
      .map((meeting: CalendarEvent) => {
        const startTime = new Date(meeting.start_time).toLocaleString();
        const hasBot = meeting.bot_param ? '🤖 Bot scheduled' : '';
        const meetingLink = meeting.meeting_url ? `Link: ${meeting.meeting_url}` : '';

        return `- ${meeting.name} [${startTime}] ${hasBot} ${meetingLink} [ID: ${meeting.uuid}]`;
      })
      .join('\n');

    let result = `${args.status.charAt(0).toUpperCase() + args.status.slice(1)} meetings:\n\n${meetingList}`;

    if (response.next) {
      result += `\n\nMore meetings available. Use 'cursor: ${response.next}' to see more.`;
    }

    return result;
  },
};

/**
 * List events with comprehensive filtering
 */
export const listEventsTool: Tool<typeof listEventsParams> = {
  name: 'listEvents',
  description: 'List calendar events with comprehensive filtering options',
  parameters: listEventsParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Listing calendar events', {
      calendarId: args.calendarId,
      filters: redactSecrets(args),
    });

    // Build the query parameters
    let queryParams = `calendar_id=${args.calendarId}`;
    if (args.status) queryParams += `&status=${args.status}`;
    if (args.startDateGte)
      queryParams += `&start_date_gte=${encodeURIComponent(args.startDateGte)}`;
    if (args.startDateLte)
      queryParams += `&start_date_lte=${encodeURIComponent(args.startDateLte)}`;
    if (args.attendeeEmail)
      queryParams += `&attendee_email=${encodeURIComponent(args.attendeeEmail)}`;
    if (args.organizerEmail)
      queryParams += `&organizer_email=${encodeURIComponent(args.organizerEmail)}`;
    if (args.updatedAtGte)
      queryParams += `&updated_at_gte=${encodeURIComponent(args.updatedAtGte)}`;
    if (args.cursor) queryParams += `&cursor=${encodeURIComponent(args.cursor)}`;

    try {
      const response = await apiRequest(session, 'get', `/calendar_events/?${queryParams}`);

      if (!response.data || response.data.length === 0) {
        return 'No events found matching your criteria.';
      }

      const eventList = response.data
        .map((event: CalendarEvent) => {
          const startTime = new Date(event.start_time).toLocaleString();
          const endTime = new Date(event.end_time).toLocaleString();
          const hasBot = event.bot_param ? '🤖 Bot scheduled' : '';
          const meetingLink = event.meeting_url ? `\n   Link: ${event.meeting_url}` : '';
          const attendees =
            event.attendees && event.attendees.length > 0
              ? `\n   Attendees: ${event.attendees.map((a: { name?: string; email: string }) => a.name || a.email).join(', ')}`
              : '';

          return `- ${event.name}\n   From: ${startTime}\n   To: ${endTime}${meetingLink}${attendees}\n   ${hasBot} [ID: ${event.uuid}]`;
        })
        .join('\n\n');

      let result = `Events (${response.data.length}):\n\n${eventList}`;

      if (response.next) {
        result += `\n\nMore events available. Use cursor: "${response.next}" to see more.`;
      }

      return result;
    } catch (error) {
      return `Error listing events: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Get event details
 */
export const getEventTool: Tool<typeof eventIdParams> = {
  name: 'getEvent',
  description: 'Get detailed information about a specific calendar event',
  parameters: eventIdParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Getting event details', { eventId: args.eventId });

    try {
      const event = await apiRequest(session, 'get', `/calendar_events/${args.eventId}`);

      const startTime = new Date(event.start_time).toLocaleString();
      const endTime = new Date(event.end_time).toLocaleString();

      const attendees =
        event.attendees && event.attendees.length > 0
          ? event.attendees
              .map(
                (a: { name?: string; email: string }) => `   - ${a.name || 'Unnamed'} (${a.email})`,
              )
              .join('\n')
          : '   None';

      let botDetails = 'None';
      if (event.bot_param) {
        botDetails = `
   Name: ${event.bot_param.bot_name}
   Recording Mode: ${event.bot_param.recording_mode || 'speaker_view'}
   Meeting Type: ${event.bot_param.extra?.meetingType || 'Not specified'}`;
      }

      return `Event Details:
Title: ${event.name}
Time: ${startTime} to ${endTime}
Meeting URL: ${event.meeting_url || 'Not available'}
Is Organizer: ${event.is_organizer ? 'Yes' : 'No'}
Is Recurring: ${event.is_recurring ? 'Yes' : 'No'}
${event.recurring_event_id ? `Recurring Event ID: ${event.recurring_event_id}` : ''}

Attendees:
${attendees}

Bot Configuration:
${botDetails}

Event ID: ${event.uuid}`;
    } catch (error) {
      return `Error getting event details: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Schedule a recording bot
 */
export const scheduleRecordingTool: Tool<typeof scheduleRecordingParams> = {
  name: 'scheduleRecording',
  description: 'Schedule a bot to record an upcoming meeting from your calendar',
  parameters: scheduleRecordingParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Scheduling meeting recording', {
      eventId: args.eventId,
      botName: args.botName,
      recordingMode: args.recordingMode,
      allOccurrences: args.allOccurrences,
    });

    const payload: any = {
      bot_name: args.botName,
      extra: args.extra || {},
    };

    if (args.botImage) payload.bot_image = args.botImage;
    if (args.entryMessage) payload.enter_message = args.entryMessage;
    if (args.recordingMode) payload.recording_mode = args.recordingMode;

    if (args.speechToTextProvider) {
      payload.speech_to_text = {
        provider: args.speechToTextProvider,
      };

      if (args.speechToTextApiKey) {
        payload.speech_to_text.api_key = args.speechToTextApiKey;
      }
    }

    try {
      let url = `/calendar_events/${args.eventId}/bot`;
      if (args.allOccurrences) {
        url += `?all_occurrences=true`;
      }

      const response = await apiRequest(session, 'post', url, payload);

      // Check if we got a successful response with event data
      if (Array.isArray(response) && response.length > 0) {
        const eventCount = response.length;
        const firstEventName = response[0].name;

        if (eventCount === 1) {
          return `Recording has been scheduled successfully for "${firstEventName}".`;
        } else {
          return `Recording has been scheduled successfully for ${eventCount} instances of "${firstEventName}".`;
        }
      }

      return 'Recording has been scheduled successfully.';
    } catch (error) {
      return `Error scheduling recording: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Cancel a scheduled recording
 */
export const cancelRecordingTool: Tool<typeof cancelRecordingParams> = {
  name: 'cancelRecording',
  description: 'Cancel a previously scheduled recording',
  parameters: cancelRecordingParams,
  execute: async (args, context) => {
    const { session, log } = context;
    log.info('Canceling recording', {
      eventId: args.eventId,
      allOccurrences: args.allOccurrences,
    });

    try {
      let url = `/calendar_events/${args.eventId}/bot`;
      if (args.allOccurrences) {
        url += `?all_occurrences=true`;
      }

      const response = await apiRequest(session, 'delete', url);

      // Check if we got a successful response with event data
      if (Array.isArray(response) && response.length > 0) {
        const eventCount = response.length;
        const firstEventName = response[0].name;

        if (eventCount === 1) {
          return `Recording has been canceled successfully for "${firstEventName}".`;
        } else {
          return `Recording has been canceled successfully for ${eventCount} instances of "${firstEventName}".`;
        }
      }

      return 'Recording has been canceled successfully.';
    } catch (error) {
      return `Error canceling recording: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Provides guidance on setting up OAuth for calendar integration
 */
export const oauthGuidanceTool: Tool<typeof emptyParams> = {
  name: 'oauthGuidance',
  description: 'Get detailed guidance on setting up OAuth for calendar integration',
  parameters: emptyParams,
  execute: async (_args, context) => {
    const { log } = context;
    log.info('Providing OAuth guidance');

    return `# Calendar Integration Options

## Quick Integration Options

You have two simple ways to integrate your calendar:

### Option 1: Provide credentials directly in this chat
You can simply provide your credentials right here:

\`\`\`
"Set up my calendar with these credentials:
- Platform: Google (or Microsoft)
- Client ID: your-client-id-here
- Client Secret: your-client-secret-here
- Refresh Token: your-refresh-token-here
- Raw Calendar ID: primary@gmail.com (optional)"
\`\`\`

### Option 2: Configure once in Claude Desktop settings (recommended)
For a more permanent solution that doesn't require entering credentials each time:

1. Edit your configuration file:
   \`\`\`bash
   vim ~/Library/Application\\ Support/Claude/claude_desktop_config.json
   \`\`\`

2. Add the \`calendarOAuth\` section to your botConfig:
   \`\`\`json
   "botConfig": {
     // other bot configuration...
     
     "calendarOAuth": {
       "platform": "Google",  // or "Microsoft"
       "clientId": "YOUR_OAUTH_CLIENT_ID",
       "clientSecret": "YOUR_OAUTH_CLIENT_SECRET", 
       "refreshToken": "YOUR_REFRESH_TOKEN",
       "rawCalendarId": "primary@gmail.com"  // Optional
     }
   }
   \`\`\`

3. Save the file and restart Claude Desktop

> **Note:** Calendar integration is completely optional. You can use Meeting BaaS without connecting a calendar.

## Need OAuth Credentials?

If you need to obtain OAuth credentials first, here's how:

<details>
<summary>## Detailed Google Calendar OAuth Setup Instructions</summary>

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google Calendar API for your project

### Step 2: Set Up OAuth Consent Screen
1. Go to "OAuth consent screen" in the left sidebar
2. Select user type (Internal or External)
3. Fill in required app information
4. Add scopes for Calendar API:
   - \`https://www.googleapis.com/auth/calendar.readonly\`
   - \`https://www.googleapis.com/auth/calendar.events.readonly\`

### Step 3: Create OAuth Client ID
1. Go to "Credentials" in the left sidebar
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application" as application type
4. Add authorized redirect URIs (including \`https://developers.google.com/oauthplayground\` for testing)
5. Save your Client ID and Client Secret

### Step 4: Get Refresh Token
1. Go to [OAuth Playground](https://developers.google.com/oauthplayground)
2. Click the gear icon (settings) and check "Use your own OAuth credentials"
3. Enter your Client ID and Client Secret
4. Select Calendar API scopes and authorize
5. Exchange authorization code for tokens
6. Save the refresh token
</details>

<details>
<summary>## Detailed Microsoft Calendar OAuth Setup Instructions</summary>

### Step 1: Register Application in Azure
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "App registrations" and create a new registration
3. Set redirect URIs (web or mobile as appropriate)

### Step 2: Set API Permissions
1. Go to "API permissions" in your app registration
2. Add Microsoft Graph permissions:
   - \`Calendars.Read\`
   - \`User.Read\`
3. Grant admin consent if required

### Step 3: Create Client Secret
1. Go to "Certificates & secrets"
2. Create a new client secret and save the value immediately

### Step 4: Get Refresh Token
1. Use Microsoft's OAuth endpoints to get an authorization code
2. Exchange the code for an access token and refresh token
3. Save the refresh token
</details>

## Using the Integration Tools

Once you have your credentials, you can:

1. Use \`listRawCalendars\` to see available calendars
2. Use \`setupCalendarOAuth\` to integrate a specific calendar
3. Use \`listCalendars\` to verify the integration

Need help with a specific step? Just ask!`;
  },
};

/**
 * Helper function to check if a calendar has the Meeting BaaS integration
 */
export const checkCalendarIntegrationTool: Tool<typeof emptyParams> = {
  name: 'checkCalendarIntegration',
  description: 'Check and diagnose calendar integration status',
  parameters: emptyParams,
  execute: async (_args, context) => {
    const { session, log } = context;
    log.info('Checking calendar integration status');

    try {
      // List calendars
      const calendars = await apiRequest(session, 'get', '/calendars/');

      if (!calendars || calendars.length === 0) {
        return `No calendars integrated. To integrate a calendar:

1. You need Google/Microsoft OAuth credentials:
   - Client ID
   - Client Secret
   - Refresh Token

2. Use the \`oauthGuidance\` tool for detailed steps to obtain these credentials.

3. Use the \`setupCalendarOAuth\` tool to connect your calendar.

Example command:
"Connect my Google Calendar using these OAuth credentials: [client-id], [client-secret], [refresh-token]"`;
      }

      // List some recent events to check functionality
      const calendarId = calendars[0].uuid;
      const events = await apiRequest(
        session,
        'get',
        `/calendar_events/?calendar_id=${calendarId}&status=upcoming`,
      );

      let eventStatus = '';
      if (!events.data || events.data.length === 0) {
        eventStatus = 'No upcoming events found in this calendar.';
      } else {
        const eventCount = events.data.length;
        const scheduledCount = events.data.filter((e: any) => e.bot_param).length;
        eventStatus = `Found ${eventCount} upcoming events, ${scheduledCount} have recording bots scheduled.`;
      }

      return `Calendar integration status: ACTIVE

Found ${calendars.length} integrated calendar(s):
${calendars.map((cal: any) => `- ${cal.name} (${cal.email}) [ID: ${cal.uuid}]`).join('\n')}

${eventStatus}

To schedule recordings for upcoming meetings:
1. Use \`listUpcomingMeetings\` to see available meetings
2. Use \`scheduleRecording\` to set up a recording bot for a meeting

To manage calendar integrations:
- Use \`resyncAllCalendars\` to force a refresh of calendar data
- Use \`deleteCalendar\` to remove a calendar integration`;
    } catch (error) {
      return `Error checking calendar integration: ${error instanceof Error ? error.message : String(error)}

This could indicate:
- API authentication issues
- Missing or expired OAuth credentials
- Network connectivity problems

Try the following:
1. Verify your API key is correct
2. Check if OAuth credentials need to be refreshed
3. Use \`oauthGuidance\` for help setting up OAuth correctly`;
    }
  },
};

/**
 * List events with comprehensive filtering - VERSION WITH DYNAMIC CREDENTIALS
 */
const listEventsWithCredentialsParams = z.object({
  calendarId: z.string().describe('UUID of the calendar to retrieve events from'),
  apiKey: z.string().describe('API key for authentication'),
  status: z
    .enum(['upcoming', 'past', 'all'])
    .optional()
    .describe('Filter events by status (upcoming, past, all)'),
  startDateGte: z
    .string()
    .optional()
    .describe('Filter events with start date greater than or equal to (ISO format)'),
  startDateLte: z
    .string()
    .optional()
    .describe('Filter events with start date less than or equal to (ISO format)'),
  attendeeEmail: z.string().optional().describe('Filter events with specific attendee email'),
  organizerEmail: z.string().optional().describe('Filter events with specific organizer email'),
  updatedAtGte: z
    .string()
    .optional()
    .describe('Filter events updated after specified date (ISO format)'),
  cursor: z.string().optional().describe('Pagination cursor for retrieving more results'),
  limit: z.number().optional().describe('Maximum number of events to return'),
});

export const listEventsWithCredentialsTool: Tool<typeof listEventsWithCredentialsParams> = {
  name: 'listEventsWithCredentials',
  description:
    'List calendar events with comprehensive filtering options using directly provided credentials',
  parameters: listEventsWithCredentialsParams,
  execute: async (args, context) => {
    const { log } = context;

    // Create a session with the provided API key
    const session = { apiKey: args.apiKey };

    log.info('Listing calendar events with provided credentials', {
      calendarId: args.calendarId,
      filters: redactSecrets(args),
    });

    // Build the query parameters
    let queryParams = `calendar_id=${args.calendarId}`;
    if (args.status) queryParams += `&status=${args.status}`;
    if (args.startDateGte)
      queryParams += `&start_date_gte=${encodeURIComponent(args.startDateGte)}`;
    if (args.startDateLte)
      queryParams += `&start_date_lte=${encodeURIComponent(args.startDateLte)}`;
    if (args.attendeeEmail)
      queryParams += `&attendee_email=${encodeURIComponent(args.attendeeEmail)}`;
    if (args.organizerEmail)
      queryParams += `&organizer_email=${encodeURIComponent(args.organizerEmail)}`;
    if (args.updatedAtGte)
      queryParams += `&updated_at_gte=${encodeURIComponent(args.updatedAtGte)}`;
    if (args.cursor) queryParams += `&cursor=${encodeURIComponent(args.cursor)}`;
    if (args.limit) queryParams += `&limit=${args.limit}`;

    try {
      const response = await apiRequest(session, 'get', `/calendar_events/?${queryParams}`);

      if (!response.data || response.data.length === 0) {
        return 'No events found matching your criteria.';
      }

      const eventList = response.data
        .map((event: CalendarEvent) => {
          const startTime = new Date(event.start_time).toLocaleString();
          const endTime = new Date(event.end_time).toLocaleString();
          const hasBot =
            event.bot_param && typeof event.bot_param === 'object' && 'uuid' in event.bot_param;
          const meetingStatus = hasBot ? '🟢 Recording scheduled' : '⚪ No recording';

          // Get attendee names
          const attendeeList =
            (event.attendees || []).map((a) => a.name || a.email).join(', ') || 'None listed';

          return (
            `## ${event.name}\n` +
            `**Time**: ${startTime} to ${endTime}\n` +
            `**Status**: ${meetingStatus}\n` +
            `**Event ID**: ${event.uuid}\n` +
            `**Organizer**: ${event.is_organizer ? 'You' : 'Other'}\n` +
            `**Attendees**: ${attendeeList}\n`
          );
        })
        .join('\n\n');

      let result = `Calendar Events:\n\n${eventList}`;

      if (response.next) {
        result += `\n\nMore events available. Use 'cursor: ${response.next}' to see more.`;
      }

      return result;
    } catch (error) {
      return `Error listing events: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Schedule a recording with direct credentials
 */
const scheduleRecordingWithCredentialsParams = z.object({
  eventId: z.string().uuid().describe('UUID of the calendar event to record'),
  apiKey: z.string().describe('API key for authentication'),
  botName: z.string().describe('Name to display for the bot in the meeting'),
  botImage: z.string().url().optional().describe("URL to an image for the bot's avatar (optional)"),
  entryMessage: z
    .string()
    .optional()
    .describe('Message the bot will send when joining the meeting (optional)'),
  recordingMode: z
    .enum(['speaker_view', 'gallery_view', 'audio_only'] as const)
    .default('speaker_view')
    .describe("Recording mode: 'speaker_view' (default), 'gallery_view', or 'audio_only'"),
  speechToTextProvider: z
    .enum(['Gladia', 'Runpod', 'Default'] as const)
    .optional()
    .describe('Provider for speech-to-text transcription (optional)'),
  speechToTextApiKey: z
    .string()
    .optional()
    .describe('API key for the speech-to-text provider if required (optional)'),
  extra: z
    .record(z.any())
    .optional()
    .describe('Additional metadata about the meeting (e.g., meetingType, participants)'),
  allOccurrences: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'For recurring events, schedule recording for all occurrences (true) or just this instance (false)',
    ),
});

export const scheduleRecordingWithCredentialsTool: Tool<
  typeof scheduleRecordingWithCredentialsParams
> = {
  name: 'scheduleRecordingWithCredentials',
  description: 'Schedule a bot to record an upcoming meeting using directly provided credentials',
  parameters: scheduleRecordingWithCredentialsParams,
  execute: async (args, context) => {
    const { log } = context;

    // Create a session with the provided API key
    const session = { apiKey: args.apiKey };

    log.info('Scheduling meeting recording with provided credentials', {
      eventId: args.eventId,
      botName: args.botName,
      recordingMode: args.recordingMode,
      allOccurrences: args.allOccurrences,
    });

    const payload: any = {
      bot_name: args.botName,
      extra: args.extra || {},
    };

    if (args.botImage) payload.bot_image = args.botImage;
    if (args.entryMessage) payload.enter_message = args.entryMessage;
    if (args.recordingMode) payload.recording_mode = args.recordingMode;

    if (args.speechToTextProvider) {
      payload.speech_to_text = {
        provider: args.speechToTextProvider,
      };

      if (args.speechToTextApiKey) {
        payload.speech_to_text.api_key = args.speechToTextApiKey;
      }
    }

    try {
      let url = `/calendar_events/${args.eventId}/bot`;
      if (args.allOccurrences) {
        url += `?all_occurrences=true`;
      }

      const response = await apiRequest(session, 'post', url, payload);

      // Check if we got a successful response with event data
      if (Array.isArray(response) && response.length > 0) {
        const eventCount = response.length;
        const firstEventName = response[0].name;

        if (eventCount === 1) {
          return `Recording has been scheduled successfully for "${firstEventName}".`;
        } else {
          return `Recording has been scheduled successfully for ${eventCount} instances of "${firstEventName}".`;
        }
      }

      return 'Recording has been scheduled successfully.';
    } catch (error) {
      return `Error scheduling recording: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Cancel a scheduled recording with direct credentials
 */
const cancelRecordingWithCredentialsParams = z.object({
  eventId: z.string().uuid().describe('UUID of the calendar event to cancel recording for'),
  apiKey: z.string().describe('API key for authentication'),
  allOccurrences: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'For recurring events, cancel recording for all occurrences (true) or just this instance (false)',
    ),
});

export const cancelRecordingWithCredentialsTool: Tool<typeof cancelRecordingWithCredentialsParams> =
  {
    name: 'cancelRecordingWithCredentials',
    description: 'Cancel a previously scheduled recording using directly provided credentials',
    parameters: cancelRecordingWithCredentialsParams,
    execute: async (args, context) => {
      const { log } = context;

      // Create a session with the provided API key
      const session = { apiKey: args.apiKey };

      log.info('Canceling recording with provided credentials', {
        eventId: args.eventId,
        allOccurrences: args.allOccurrences,
      });

      try {
        let url = `/calendar_events/${args.eventId}/bot`;
        if (args.allOccurrences) {
          url += `?all_occurrences=true`;
        }

        await apiRequest(session, 'delete', url);

        return `Recording has been successfully canceled for event ${args.eventId}${args.allOccurrences ? ' and all its occurrences' : ''}.`;
      } catch (error) {
        return `Error canceling recording: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
