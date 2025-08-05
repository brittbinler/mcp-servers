# Gmail MCP Server

A comprehensive Model Context Protocol (MCP) server that enables seamless Gmail integration for AI assistants. This server provides 20 powerful tools for email management, from basic operations to advanced thread handling.

## Features

### 🚀 Core Email Operations
- **Send & Draft**: Create and send emails with HTML support, CC/BCC, and threading
- **Read & Search**: Advanced content extraction and Gmail search syntax support
- **Modify & Delete**: Label management and bulk operations

### 📁 Label Management
- **List, Create, Delete**: Complete label lifecycle management
- **Batch Operations**: Efficient bulk label modifications

### 📝 Draft Management
- **Full CRUD**: Create, read, update, delete drafts
- **Advanced Filtering**: Search and organize drafts

### 🔗 Advanced Features
- **Thread Support**: Handle email conversations
- **Attachment Handling**: Download and manage attachments
- **Trash Management**: Soft delete with restore capabilities

## Quick Start

### 1. Prerequisites

- Node.js 16+ 
- A Google Cloud Project with Gmail API enabled
- OAuth2 credentials from Google Cloud Console

### 2. Installation

```bash
npm install
npm run build
```

### 3. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the Gmail API
4. Create OAuth2 credentials:
   - Go to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth 2.0 Client IDs**
   - Choose **Desktop application**
   - Add `http://localhost:3000/oauth/callback` in **Authorized redirect URIs**

### 4. Authentication

Set your OAuth2 credentials:

```bash
export GOOGLE_CLIENT_ID=your-client-id.googleusercontent.com
export GOOGLE_CLIENT_SECRET=your-client-secret
```

### 5. Configure MCP Client

#### For Claude Code

Add to `~/.claude/mcp_servers.json`:

```json
{
  "gmail": {
    "command": "node",
    "args": ["/path/to/gmail-mcp-server/build/index.js"],
    "env": {
      "GOOGLE_CLIENT_ID": "your-client-id.googleusercontent.com",
      "GOOGLE_CLIENT_SECRET": "your-client-secret"
    }
  }
}
```

#### For Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/path/to/gmail-mcp-server/build/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### 6. First Run

The first time you use the server, it will:
1. 🌐 Open your browser for Google OAuth
2. ✅ Handle authentication automatically
3. 💾 Save your token for future use

## Available Tools

| Tool | Description |
|------|-------------|
| `gmail_send_email` | Send emails with HTML, CC/BCC support |
| `gmail_draft_email` | Create draft emails |
| `gmail_read_email` | Read email content with enhanced extraction |
| `gmail_search_emails` | Search using Gmail query syntax |
| `gmail_modify_email` | Modify email labels |
| `gmail_delete_email` | Permanently delete emails |
| `gmail_batch_modify_emails` | Bulk label modifications |
| `gmail_batch_delete_emails` | Bulk email deletion |
| `gmail_list_labels` | List all Gmail labels |
| `gmail_create_label` | Create custom labels |
| `gmail_delete_label` | Delete labels |
| `gmail_get_draft` | Retrieve draft details |
| `gmail_list_drafts` | List drafts with filtering |
| `gmail_send_draft` | Send existing drafts |
| `gmail_delete_draft` | Delete drafts |
| `gmail_get_attachment` | Download attachments |
| `gmail_trash_message` | Move to trash |
| `gmail_untrash_message` | Restore from trash |
| `gmail_get_thread` | Get conversation threads |
| `gmail_list_threads` | List and search threads |

## Example Usage

### Send an Email
```typescript
{
  "tool": "gmail_send_email",
  "arguments": {
    "to": ["recipient@example.com"],
    "subject": "Hello from MCP",
    "body": "This email was sent via the Gmail MCP server!",
    "mimeType": "text/plain"
  }
}
```

### Search for Unread Emails
```typescript
{
  "tool": "gmail_search_emails",
  "arguments": {
    "query": "is:unread in:inbox",
    "maxResults": 10
  }
}
```

### Create a Draft with HTML
```typescript
{
  "tool": "gmail_draft_email",
  "arguments": {
    "to": ["recipient@example.com"],
    "subject": "Rich Content Draft",
    "body": "Plain text version",
    "htmlBody": "<h1>Rich HTML Content</h1><p>This is <strong>bold</strong> text.</p>",
    "mimeType": "multipart/alternative"
  }
}
```

## Required Permissions

The server requires these Gmail API scopes:
- `gmail.readonly` - Read emails and labels
- `gmail.send` - Send emails
- `gmail.modify` - Modify labels and move emails
- `gmail.compose` - Create and manage drafts

## Security & Privacy

- 🔐 All authentication uses Google's official OAuth2 flow
- 🏠 Runs entirely locally - no data sent to third parties
- 💾 Tokens stored locally and encrypted by Google's libraries
- 🛡️ Follows Gmail API security best practices

## Development

```bash
# Install dependencies
npm install

# Build the server
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## Troubleshooting

### Authentication Issues
- Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Verify redirect URI `http://localhost:3000/oauth/callback` is in Google Cloud Console
- Check that Gmail API is enabled in your Google Cloud Project

### Permission Errors
- Verify all required OAuth scopes are approved
- Try deleting saved token file and re-authenticating

### Rate Limiting
- The server respects Gmail API rate limits
- Consider implementing delays for bulk operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- 📚 [Gmail API Documentation](https://developers.google.com/gmail/api)
- 🔧 [MCP Specification](https://spec.modelcontextprotocol.io/)
- 🐛 [Report Issues](https://github.com/brittbinler/mcp-servers/issues)