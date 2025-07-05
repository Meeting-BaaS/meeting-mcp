[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/meeting-baas-meeting-mcp-badge.png)](https://mseep.ai/app/meeting-baas-meeting-mcp)

# Meeting BaaS MCP Server
[![Project Logo](MCPServer@2x.png)](https://meetingBaaS.com)

<p align="center"><a href="https://discord.com/invite/dsvFgDTr6c"><img height="60px" src="https://user-images.githubusercontent.com/31022056/158916278-4504b838-7ecb-4ab9-a900-7dc002aade78.png" alt="Join our Discord!"></a></p>

A Model Context Protocol (MCP) server that provides tools for managing meeting data, including transcripts, recordings, calendar events, and search functionality.

## QUICK START: Claude Desktop Integration

To use Meeting BaaS with Claude Desktop:

1. Edit the Claude Desktop configuration file:
   ```bash
   vim ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Add the Meeting BaaS configuration:
   ```json
   "meetingbaas": {
     "command": "/bin/bash",
     "args": [
       "-c",
       "cd /path/to/meeting-mcp && (npm run build 1>&2) && export MCP_FROM_CLAUDE=true && node dist/index.js"
     ],
     "headers": {
       "x-api-key": "YOUR_API_KEY"
     }
   }
   ```

3. For calendar integration, you can add the `calendarOAuth` section to your `botConfig`:
   ```json
   "botConfig": {
     "calendarOAuth": {
       "platform": "Google",  // or "Microsoft"
       "clientId": "YOUR_OAUTH_CLIENT_ID",
       "clientSecret": "YOUR_OAUTH_CLIENT_SECRET", 
       "refreshToken": "YOUR_REFRESH_TOKEN",
       "rawCalendarId": "primary@gmail.com"  // Optional
     }
   }
   ```

4. Save the file and restart Claude Desktop.

> **Note:** Calendar integration is optional. Meeting BaaS can be used without connecting a calendar by simply omitting the `calendarOAuth` section.

## Overview

This project implements a Model Context Protocol (MCP) server that allows AI assistants like Claude and Cursor to access and manipulate meeting data. It exposes a set of tools and resources that can be used to:

- **Invite Meeting Bots**: Create and invite bots to your video conferences that automatically record and transcribe meetings

  ```
  "Create a new meeting bot for my Zoom call tomorrow"
  ```

- **Query Meeting Data**: Search through meeting transcripts and find specific information without watching entire recordings

  ```
  "Search my recent meetings for discussions about the quarterly budget"
  "Find all mentions of Project Apollo in yesterday's team meeting"
  "Show me parts of the meeting where Jane was speaking"
  ```

- **Manage Calendar Events**: View and organize calendar entries and upcoming meetings

- **Access Recording Information**: Get metadata about meeting recordings and their status

## Prerequisites

- Node.js (v16 or later)
- npm
- **MeetingBaaS Account**: You need access to a MeetingBaaS account using your corporate email address
  - All logs, bots, and shared links are available to colleagues with the same corporate domain (not personal emails like gmail.com)
  - This enables seamless collaboration where all team members can access meeting recordings and transcripts created by anyone in your organization

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd mcp-baas
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Usage

Start the server:

```bash
npm run start
```

By default, the server runs on port 7017 and exposes the MCP endpoint at `http://localhost:7017/mcp`.

## Available Tools

The server exposes several tools through the MCP protocol:

### Calendar Tools

- `oauthGuidance`: Get detailed step-by-step instructions on setting up OAuth for Google or Microsoft calendars
  - No parameters required
  - Returns comprehensive instructions for obtaining OAuth credentials and setting up calendar integration

- `listRawCalendars`: Lists available calendars from Google or Microsoft before integration
  - Parameters: `platform` ("Google" or "Microsoft"), `clientId`, `clientSecret`, `refreshToken`
  - Returns a list of available calendars with their IDs and primary status

- `setupCalendarOAuth`: Integrates a calendar using OAuth credentials
  - Parameters: `platform` ("Google" or "Microsoft"), `clientId`, `clientSecret`, `refreshToken`, `rawCalendarId` (optional)
  - Returns confirmation of successful integration with calendar details

- `listCalendars`: Lists all integrated calendars
  - No parameters required
  - Returns a list of all calendars with their names, email addresses, and UUIDs

- `getCalendar`: Gets detailed information about a specific calendar integration
  - Parameters: `calendarId` (UUID of the calendar)
  - Returns comprehensive calendar details

- `deleteCalendar`: Permanently removes a calendar integration
  - Parameters: `calendarId` (UUID of the calendar)
  - Returns confirmation of successful deletion

- `resyncAllCalendars`: Forces a refresh of all connected calendars
  - No parameters required
  - Returns the status of the sync operation

- `listUpcomingMeetings`: Lists upcoming meetings from a calendar
  - Parameters: `calendarId`, `status` (optional: "upcoming", "past", "all"), `limit` (optional)
  - Returns a list of meetings with their names, times, and recording status

- `listEvents`: Lists calendar events with comprehensive filtering options
  - Parameters: `calendarId`, plus optional filters like `startDateGte`, `startDateLte`, `attendeeEmail`, etc.
  - Returns detailed event listings with rich information

- `listEventsWithCredentials`: Lists calendar events with credentials provided directly in the query
  - Parameters: `calendarId`, `apiKey`, plus same optional filters as `listEvents`
  - Returns the same detailed information as `listEvents` but with direct authentication

- `getEvent`: Gets detailed information about a specific calendar event
  - Parameters: `eventId` (UUID of the event)
  - Returns comprehensive event details including attendees and recording status

- `scheduleRecording`: Schedules a bot to record an upcoming meeting
  - Parameters: `eventId`, `botName`, plus optional settings like `botImage`, `recordingMode`, etc.
  - Returns confirmation of successful scheduling

- `scheduleRecordingWithCredentials`: Schedules recording with credentials provided directly in the query
  - Parameters: `eventId`, `apiKey`, `botName`, plus same optional settings as `scheduleRecording`
  - Returns confirmation of successful scheduling

- `cancelRecording`: Cancels a previously scheduled recording
  - Parameters: `eventId`, `allOccurrences` (optional, for recurring events)
  - Returns confirmation of successful cancellation

- `cancelRecordingWithCredentials`: Cancels recording with credentials provided directly in the query
  - Parameters: `eventId`, `apiKey`, `allOccurrences` (optional)
  - Returns confirmation of successful cancellation

- `checkCalendarIntegration`: Checks and diagnoses calendar integration status
  - No parameters required
  - Returns a comprehensive status report and troubleshooting tips

### Meeting Tools

- `createBot`: Creates a meeting bot that can join video conferences to record and transcribe meetings
  - Parameters: 
    - `meeting_url` (URL of the meeting to join)
    - `name` (optional bot name)
    - `botImage` (optional URL to an image for the bot's avatar) 
    - `entryMessage` (optional message the bot will send when joining)
    - `deduplicationKey` (optional key to override the 5-minute restriction on joining the same meeting)
    - `nooneJoinedTimeout` (optional timeout in seconds for bot to leave if no one joins)
    - `waitingRoomTimeout` (optional timeout in seconds for bot to leave if stuck in waiting room)
    - `speechToTextProvider` (optional provider for transcription: "Gladia", "Runpod", or "Default")
    - `speechToTextApiKey` (optional API key for the speech-to-text provider)
    - `streamingInputUrl` (optional WebSocket URL to stream audio input)
    - `streamingOutputUrl` (optional WebSocket URL to stream audio output)
    - `streamingAudioFrequency` (optional frequency for streaming: "16khz" or "24khz")
    - `extra` (optional object with additional metadata about the meeting, such as meeting type, custom summary prompt, search keywords)
  - Returns: Bot details including ID and join status
- `getBots`: Lists all bots and their associated meetings
- `getBotsByMeeting`: Gets bots for a specific meeting URL
- `getRecording`: Retrieves recording information for a specific bot/meeting
- `getRecordingStatus`: Checks the status of a recording in progress
- `getMeetingData`: Gets transcript and recording data for a specific meeting
  - Parameters: `meetingId` (ID of the meeting to get data for)
  - Returns: Information about the meeting recording including duration and transcript segment count
- `getMeetingDataWithCredentials`: Gets transcript and recording data using direct API credentials
  - Parameters: `meetingId` (ID of the meeting), `apiKey` (API key for authentication)
  - Returns: Same information as `getMeetingData` but with direct authentication

### Transcript Tools

- `getMeetingTranscript`: Gets a meeting transcript with speaker names and content grouped by speaker
  - Parameters: `botId` (the bot that recorded the meeting)
  - Returns: Complete transcript with speaker information, formatted as paragraphs grouped by speaker
  - Example output:
    ```
    Meeting: "Weekly Team Meeting"
    Duration: 45m 30s
    Transcript:

    John Smith: Hello everyone, thanks for joining today's call. We have a lot to cover regarding the Q3 roadmap and our current progress on the platform redesign.

    Sarah Johnson: Thanks John. I've prepared some slides about the user testing results we got back yesterday. The feedback was generally positive but there are a few areas we need to address.
    ```

- `findKeyMoments`: Automatically identifies and shares links to important moments in a meeting
  - Parameters: `botId`, optional `meetingTitle`, optional list of `topics` to look for, and optional `maxMoments`
  - Returns: Markdown-formatted list of key moments with links, automatically detected based on transcript
  - Uses AI-powered analysis to find significant moments without requiring manual timestamp selection

### QR Code Tools

- `generateQRCode`: Creates an AI-generated QR code image that can be used as a bot avatar
  - Parameters:
    - `type`: Type of QR code (url, email, phone, sms, text)
    - `to`: Destination for the QR code (URL, email, phone number, or text)
    - `prompt`: AI prompt to customize the QR code (max 1000 characters). You can include your API key directly in the prompt text by typing "API key: qrc_your_key" or similar phrases.
    - `style`: Style of the QR code (style_default, style_dots, style_rounded, style_crystal)
    - `useAsBotImage`: Whether to use the generated QR code as the bot avatar (default: true)
    - `template`: Template ID for the QR code (optional)
    - `apiKey`: Your QR Code AI API key (optional, will use default if not provided)
  - Returns: URL to the generated QR code image that can be used directly with the joinMeeting tool
  - Example usage:
    ```
    "Generate a QR code with my email lazare@spoke.app that looks like a Tiger in crystal style"
    ```
  - Example with API key in the prompt:
    ```
    "Generate a QR code for my website https://example.com that looks like a mountain landscape. Use API key: qrc_my-personal-api-key-123456"
    ```
  - Example with formal parameter:
    ```
    "Generate a QR code with the following parameters:
    - Type: email
    - To: john.doe@example.com
    - Prompt: Create a QR code that looks like a mountain landscape
    - Style: style_rounded
    - API Key: qrc_my-personal-api-key-123456"
    ```

### Link Sharing Tools

- `shareableMeetingLink`: Generates a nicely formatted, shareable link to a meeting recording
  - Parameters: `botId`, plus optional `timestamp`, `title`, `speakerName`, and `description`
  - Returns: Markdown-formatted link with metadata that can be shared directly in chat
  - Example: 
    ```
    📽️ **Meeting Recording: Weekly Team Sync**
    ⏱️ Timestamp: 00:12:35
    🎤 Speaker: Sarah Johnson
    📝 Discussing the new product roadmap

    🔗 [View Recording](https://meetingbaas.com/viewer/abc123?t=755)
    ```

- `shareMeetingSegments`: Creates a list of links to multiple important moments in a meeting
  - Parameters: `botId` and an array of `segments` with timestamps, speakers, and descriptions
  - Returns: Markdown-formatted list of segments with direct links to each moment
  - Useful for creating a table of contents for a long meeting

## Example Workflows

### Recording a Meeting

1. Create a bot for your upcoming meeting:

   ```
   "Create a bot for my Zoom meeting at https://zoom.us/j/123456789"
   ```

2. The bot joins the meeting automatically and begins recording.

3. Check recording status:
   ```
   "What's the status of my meeting recording for the Zoom call I started earlier?"
   ```

### Calendar Integration and Automatic Recording

1. Get guidance on obtaining OAuth credentials:

   ```
   "I want to integrate my Google Calendar. How do I get OAuth credentials?"
   ```

2. List your available calendars before integration:

   ```
   "List my available Google calendars. Here are my OAuth credentials:
   - Client ID: my-client-id-123456789.apps.googleusercontent.com
   - Client Secret: my-client-secret-ABCDEF123456
   - Refresh Token: my-refresh-token-ABCDEF123456789"
   ```

3. Set up calendar integration with a specific calendar:

   ```
   "Integrate my Google Calendar using these credentials:
   - Platform: Google
   - Client ID: my-client-id-123456789.apps.googleusercontent.com
   - Client Secret: my-client-secret-ABCDEF123456
   - Refresh Token: my-refresh-token-ABCDEF123456789
   - Raw Calendar ID: primary@gmail.com"
   ```

4. View your upcoming meetings:

   ```
   "Show me my upcoming meetings from calendar 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
   ```

5. Schedule recording for an upcoming meeting:

   ```
   "Schedule a recording for my team meeting with event ID 7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d.
   Configure the bot with:
   - Name: Team Meeting Bot
   - Recording Mode: gallery_view
   - Entry Message: Hello everyone, I'm here to record the meeting"
   ```

6. Check all recordings scheduled in your calendar:

   ```
   "Show me all meetings in my calendar that have recordings scheduled"
   ```

7. Cancel a previously scheduled recording:

   ```
   "Cancel the recording for event 7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d"
   ```

8. Refresh calendar data if meetings are missing:

   ```
   "Force a resync of all my connected calendars"
   ```

### Analyzing Meeting Content

1. Get the full transcript of a meeting:

   ```
   "Get the transcript from my team meeting with bot ID abc-123"
   ```

2. Find key moments in a meeting:

   ```
   "Identify key moments from yesterday's product planning meeting with bot ID xyz-456"
   ```

3. Share a specific moment from a meeting:

   ```
   "Create a shareable link to the part of meeting abc-123 at timestamp 12:45 where John was talking about the budget"
   ```

### Using Direct Credential Tools

You can provide API credentials directly in your queries:

1. List events with direct credentials:

   ```
   "List events from calendar 5c99f8a4-f498-40d0-88f0-29f698c53c51 using API key tesban where attendee is philipe@spoke.app"
   ```

2. Schedule a recording with direct credentials:

   ```
   "Schedule a recording for event 78d06b42-794f-4efe-8195-62db1f0052d5 using API key tesban with bot name 'Weekly Meeting Bot'"
   ```

3. Cancel a recording with direct credentials:

   ```
   "Cancel the recording for event 97cd62f0-ea9b-42b3-add5-7a607ce6d80f using API key tesban"
   ```

4. Get meeting data with direct credentials:

   ```
   "Get meeting data for meeting 47de9462-bea7-406c-b79a-fd6b82c3de76 using API key tesban"
   ```

### Using AI-Generated QR Codes as Bot Avatars

1. Generate a QR code with your contact information and a custom design:

   ```
   "Generate a QR code with the following parameters:
   - Type: email
   - To: john.doe@company.com
   - Prompt: Create a professional-looking QR code with abstract blue patterns that resemble a corporate logo
   - Style: style_crystal"
   ```

2. Use the generated QR code as a bot avatar in a meeting:

   ```
   "Join my Zoom meeting at https://zoom.us/j/123456789 with the following parameters:
   - Bot name: QR Code Assistant
   - Bot image: [URL from the generated QR code]
   - Entry message: Hello everyone, I'm here to record the meeting. You can scan my avatar to get my contact information."
   ```

3. Generate a QR code with a meeting link for easy sharing:

   ```
   "Generate a QR code with the following parameters:
   - Type: url
   - To: https://zoom.us/j/123456789
   - Prompt: Create a colorful QR code with a calendar icon in the center
   - Style: style_rounded"
   ```

### Accessing Meeting Recordings

Meeting recordings can be accessed directly through the Meeting BaaS viewer using the bot ID:

```
https://meetingbaas.com/viewer/{BOT_ID}
```

For example:
```
https://meetingbaas.com/viewer/67738f48-2360-4f9e-a999-275a74208ff5
```

This viewer provides:
- The meeting video recording
- Synchronized transcript with speaker identification
- Navigation by speaker or topic
- Direct link sharing with teammates

When using the `createBot`, `getBots`, or search tools, you'll receive bot IDs that can be used to construct these viewer URLs for easy access to recordings.

> **Important**: All meeting recordings and links are automatically shared with colleagues who have the same corporate email domain (e.g., @yourcompany.com). This allows your entire team to access recordings without requiring individual permissions, creating a collaborative environment where meeting knowledge is accessible to everyone in your organization.

## Configuration

The server can be configured through environment variables or by editing the `src/config.ts` file.

Key configuration options:

- `PORT`: The port the server listens on (default: 7017)
- `API_BASE_URL`: The base URL for the Meeting BaaS API
- `DEFAULT_API_KEY`: Default API key for testing

## Integration with Cursor

To integrate with Cursor:

1. Open Cursor
2. Go to Settings
3. Navigate to "Model Context Protocol"
4. Add a new server with:
   - Name: "Meeting BaaS MCP"
   - Type: "sse"
   - Server URL: "http://localhost:7017/mcp"
   - Optionally add headers if authentication is required

## Development

### Build

```bash
npm run build
```

### Test with MCP Inspector

```bash
npm run inspect
```

### Development mode (with auto-reload)

```bash
npm run dev
```

### Log Management

The server includes optimized logging with:

```bash
npm run cleanup
```

This command:
- Cleans up unnecessary log files and cached data
- Filters out repetitive ping messages from logs
- Reduces disk usage while preserving important log information
- Maintains a smaller log footprint for long-running servers

## Project Structure

- `src/index.ts`: Main entry point
- `src/tools/`: Tool implementations
- `src/resources/`: Resource definitions
- `src/api/`: API client for the Meeting BaaS backend
- `src/types/`: TypeScript type definitions
- `src/config.ts`: Server configuration
- `src/utils/`: Utility functions
  - `logging.ts`: Log filtering and management
  - `tinyDb.ts`: Persistent bot tracking database

## Authentication

The server expects an API key in the `x-api-key` header for authentication. You can configure the default API key in the configuration.

Direct authentication is also supported in many tools (named with "WithCredentials") where you can provide the API key directly as a parameter rather than in headers.

## License

[MIT](LICENSE)

## QR Code API Key Configuration

The QR code generator tool requires an API key from QR Code AI API. There are several ways to provide this:

1. **Directly in the prompt**: Include your API key directly in the prompt text when using the `generateQRCode` tool, e.g., "Generate a QR code for my website https://example.com with API key: qrc_your_key"

2. **As a parameter**: Provide your API key as the `apiKey` parameter when using the `generateQRCode` tool

3. **Environment variable**: Set the `QRCODE_API_KEY` environment variable

4. **Claude Desktop config**: Add the API key to your Claude Desktop configuration file located at:
   - Mac/Linux: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

   Example configuration:
   ```json
   {
     "headers": {
       "x-api-key": "qrc_your_key_here" 
     }
   }
   ```

The tool will check for the API key in the order listed above. If no API key is provided, the default API key will be used if available.

You can obtain an API key by signing up at [QR Code AI API](https://qrcode-ai.com).


