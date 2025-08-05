#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { gmail_v1 } from "googleapis";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import * as http from "http";
import * as url from "url";
import open from "open";
import * as fs from "fs";
import * as path from "path";

// Gmail API interface
let gmailClient: gmail_v1.Gmail | null = null;

// OAuth2 configuration
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose'
];

const TOKEN_PATH = path.join(process.cwd(), 'gmail-token.json');
const REDIRECT_URI = 'http://localhost:3000/oauth/callback';

// OAuth2 helper functions
function saveToken(token: any): void {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.error('Token saved to', TOKEN_PATH);
}

function loadToken(): any {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const token = fs.readFileSync(TOKEN_PATH, 'utf8');
      return JSON.parse(token);
    }
  } catch (error) {
    console.error('Error loading token:', error);
  }
  return null;
}

async function getAuthUrlAndWaitForCallback(oauth2Client: OAuth2Client): Promise<void> {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.error('\n=== Gmail MCP Server Authentication ===');
  console.error('Opening browser for Google OAuth2 authentication...');
  console.error('If browser doesn\'t open, visit this URL:');
  console.error(authUrl);
  console.error('\nWaiting for authentication...\n');

  // Open the browser
  try {
    await open(authUrl);
  } catch (error) {
    console.error('Failed to open browser automatically. Please visit the URL above manually.');
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url?.startsWith('/oauth/callback')) {
          const query = url.parse(req.url, true).query;
          const code = query.code as string;

          if (code) {
            // Exchange the code for tokens
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);
            saveToken(tokens);

            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                  <h1>Authentication Successful!</h1>
                  <p>You can now close this browser tab and return to the terminal.</p>
                  <p>The Gmail MCP Server is ready to use.</p>
                </body>
              </html>
            `);

            server.close();
            console.error('✅ Authentication successful! Gmail MCP Server is ready.');
            resolve();
          } else {
            throw new Error('No authorization code received');
          }
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
              <h1 style="color: #f44336;">❌ Authentication Failed</h1>
              <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
              <p>Please close this tab and try again.</p>
            </body>
          </html>
        `);
        server.close();
        reject(error);
      }
    });

    server.listen(3000, () => {
      console.error('Temporary OAuth callback server started on http://localhost:3000');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 300000);
  });
}

async function authenticateOAuth2(): Promise<OAuth2Client> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(`
Missing OAuth2 credentials. Please set environment variables:
- GOOGLE_CLIENT_ID=your-client-id.googleusercontent.com
- GOOGLE_CLIENT_SECRET=your-client-secret

Get these from: https://console.cloud.google.com/apis/credentials
Make sure to add http://localhost:3000/oauth/callback to your authorized redirect URIs.
    `);
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

  // Try to load existing token
  const savedToken = loadToken();
  if (savedToken) {
    oauth2Client.setCredentials(savedToken);

    // Check if token is still valid
    try {
      await oauth2Client.getAccessToken();
      console.error('✅ Using saved authentication token');
      return oauth2Client;
    } catch (error) {
      console.error('⚠️ Saved token expired, requesting new authentication...');
    }
  }

  // Need new authentication
  await getAuthUrlAndWaitForCallback(oauth2Client);
  return oauth2Client;
}

// Helper function to extract email body content recursively
function extractEmailContent(payload: any): { text: string; html: string; attachments: any[] } {
  let textContent = '';
  let htmlContent = '';
  const attachments: any[] = [];

  function processPayload(part: any) {
    if (part.body?.data) {
      const content = Buffer.from(part.body.data, 'base64').toString('utf8');
      if (part.mimeType === 'text/plain') {
        textContent += content;
      } else if (part.mimeType === 'text/html') {
        htmlContent += content;
      }
    }

    if (part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename || `attachment-${part.body.attachmentId}`,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0
      });
    }

    if (part.parts) {
      part.parts.forEach((subpart: any) => processPayload(subpart));
    }
  }

  processPayload(payload);
  return { text: textContent, html: htmlContent, attachments };
}

// Helper function for error handling
function handleError(error: unknown, operation: string): { content: Array<{ type: "text"; text: string }> } {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`${operation} failed:`, message);
  return {
    content: [
      {
        type: "text",
        text: `Failed to ${operation}: ${message}`,
      },
    ],
  };
}

// Initialize Gmail client
async function initializeGmailClient(): Promise<gmail_v1.Gmail> {
  if (gmailClient) {
    return gmailClient;
  }

  try {
    let auth;

    // Check if using service account credentials
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error('🔐 Using service account authentication');
      auth = new GoogleAuth({
        scopes: SCOPES
      });
    } else {
      // Use OAuth2 browser flow
      console.error('🔐 Using OAuth2 browser authentication');
      auth = await authenticateOAuth2();
    }

    gmailClient = google.gmail({ version: 'v1', auth });
    return gmailClient;
  } catch (error) {
    throw new Error(`Failed to initialize Gmail client: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to encode email content
function createEmailMessage(to: string[], subject: string, body: string, options: {
  cc?: string[];
  bcc?: string[];
  htmlBody?: string;
  mimeType?: string;
  inReplyTo?: string;
  threadId?: string;
}): string {
  const {
    cc = [],
    bcc = [],
    htmlBody,
    mimeType = 'text/plain',
    inReplyTo,
    threadId
  } = options;

  const headers = [
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
  ];

  if (cc.length > 0) {
    headers.push(`Cc: ${cc.join(', ')}`);
  }
  if (bcc.length > 0) {
    headers.push(`Bcc: ${bcc.join(', ')}`);
  }
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (threadId) {
    headers.push(`References: ${threadId}`);
  }

  let emailContent: string;

  if (mimeType === 'text/html' || htmlBody) {
    headers.push('Content-Type: text/html; charset=utf-8');
    emailContent = htmlBody || body;
  } else if (mimeType === 'multipart/alternative' && htmlBody) {
    const boundary = `boundary_${Date.now()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    emailContent = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody,
      '',
      `--${boundary}--`
    ].join('\n');
  } else {
    headers.push('Content-Type: text/plain; charset=utf-8');
    emailContent = body;
  }

  const email = headers.join('\n') + '\n\n' + emailContent;
  return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Create server instance
const server = new McpServer({
  name: "gmail-mcp-server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Tool 1: gmail_send_email
server.tool(
  "gmail_send_email",
  "Sends a new email via Gmail",
  {
    to: z.array(z.string()).describe("List of recipient email addresses"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body content (used for text/plain or when htmlBody not provided)"),
    cc: z.array(z.string()).optional().describe("List of CC recipients"),
    bcc: z.array(z.string()).optional().describe("List of BCC recipients"),
    htmlBody: z.string().optional().describe("HTML version of the email body"),
    mimeType: z.enum(['text/plain', 'text/html', 'multipart/alternative']).default('text/plain').describe("Email content type"),
    inReplyTo: z.string().optional().describe("Message ID being replied to"),
    threadId: z.string().optional().describe("Thread ID to reply to"),
  },
  async ({ to, subject, body, cc, bcc, htmlBody, mimeType, inReplyTo, threadId }) => {
    try {
      const gmail = await initializeGmailClient();

      const raw = createEmailMessage(to, subject, body, {
        cc, bcc, htmlBody, mimeType, inReplyTo, threadId
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId
        }
      });

      return {
        content: [
          {
            type: "text",
            text: `Email sent successfully. Message ID: ${response.data.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool 2: gmail_draft_email
server.tool(
  "gmail_draft_email",
  "Creates a draft email in Gmail",
  {
    to: z.array(z.string()).describe("List of recipient email addresses"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body content (used for text/plain or when htmlBody not provided)"),
    cc: z.array(z.string()).optional().describe("List of CC recipients"),
    bcc: z.array(z.string()).optional().describe("List of BCC recipients"),
    htmlBody: z.string().optional().describe("HTML version of the email body"),
    mimeType: z.enum(['text/plain', 'text/html', 'multipart/alternative']).default('text/plain').describe("Email content type"),
    inReplyTo: z.string().optional().describe("Message ID being replied to"),
    threadId: z.string().optional().describe("Thread ID to reply to"),
  },
  async ({ to, subject, body, cc, bcc, htmlBody, mimeType, inReplyTo, threadId }) => {
    try {
      const gmail = await initializeGmailClient();

      const raw = createEmailMessage(to, subject, body, {
        cc, bcc, htmlBody, mimeType, inReplyTo, threadId
      });

      const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw,
            threadId
          }
        }
      });

      return {
        content: [
          {
            type: "text",
            text: `Draft created successfully. Draft ID: ${response.data.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to create draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool 3: gmail_read_email
server.tool(
  "gmail_read_email",
  "Retrieves the content of a specific email",
  {
    messageId: z.string().describe("ID of the email message to retrieve"),
  },
  async ({ messageId }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload?.headers || [];

      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      // Extract email content using enhanced helper
      const { text, html, attachments } = extractEmailContent(message.payload || {});

      // Use plain text if available, otherwise HTML
      const body = text || html || '';
      const contentTypeNote = !text && html ? '[HTML content converted to text]\n\n' : '';

      // Format attachment info
      const attachmentInfo = attachments.length > 0
        ? `\n\nAttachments (${attachments.length}):\n` +
          attachments.map(a => `- ${a.filename} (${a.mimeType}, ${Math.round(a.size/1024)} KB, ID: ${a.id})`).join('\n')
        : '';

      return {
        content: [
          {
            type: "text",
            text: `Thread ID: ${message.threadId}\nMessage ID: ${messageId}\nSubject: ${getHeader('Subject')}\nFrom: ${getHeader('From')}\nTo: ${getHeader('To')}\nDate: ${getHeader('Date')}\n\n${contentTypeNote}${body}${attachmentInfo}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to read email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool 4: gmail_search_emails
server.tool(
  "gmail_search_emails",
  "Searches for emails using Gmail search syntax",
  {
    query: z.string().describe("Gmail search query (e.g., 'from:example@gmail.com')"),
    maxResults: z.number().optional().describe("Maximum number of results to return"),
  },
  async ({ query, maxResults }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: maxResults
      });

      const messages = response.data.messages || [];

      if (messages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No messages found matching the search query.",
            },
          ],
        };
      }

      const results = [];
      for (const message of messages.slice(0, Math.min(10, messages.length))) {
        try {
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date']
          });

          const headers = fullMessage.data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          results.push({
            id: message.id,
            subject: getHeader('Subject'),
            from: getHeader('From'),
            date: getHeader('Date')
          });
        } catch (e) {
          // Skip messages that can't be retrieved
          continue;
        }
      }

      const resultText = results.map(r =>
        `ID: ${r.id}\nSubject: ${r.subject}\nFrom: ${r.from}\nDate: ${r.date}\n---`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `Found ${messages.length} messages. Showing first ${results.length}:\n\n${resultText}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to search emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool 5: gmail_modify_email
server.tool(
  "gmail_modify_email",
  "Modifies email labels (move to different folders)",
  {
    messageId: z.string().describe("ID of the email message to modify"),
    addLabelIds: z.array(z.string()).optional().describe("List of label IDs to add to the message"),
    removeLabelIds: z.array(z.string()).optional().describe("List of label IDs to remove from the message"),
  },
  async ({ messageId, addLabelIds, removeLabelIds }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: addLabelIds || [],
          removeLabelIds: removeLabelIds || []
        }
      });

      return {
        content: [
          {
            type: "text",
            text: `Email labels modified successfully. Message ID: ${response.data.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to modify email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool 6: gmail_delete_email
server.tool(
  "gmail_delete_email",
  "Permanently deletes an email",
  {
    messageId: z.string().describe("ID of the email message to delete"),
  },
  async ({ messageId }) => {
    try {
      const gmail = await initializeGmailClient();

      await gmail.users.messages.delete({
        userId: 'me',
        id: messageId
      });

      return {
        content: [
          {
            type: "text",
            text: `Email deleted successfully. Message ID: ${messageId}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to delete email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool 7: gmail_batch_modify_emails
server.tool(
  "gmail_batch_modify_emails",
  "Modifies labels for multiple emails in batches",
  {
    messageIds: z.array(z.string()).describe("List of message IDs to modify"),
    addLabelIds: z.array(z.string()).optional().describe("List of label IDs to add to all messages"),
    removeLabelIds: z.array(z.string()).optional().describe("List of label IDs to remove from all messages"),
    batchSize: z.number().default(50).describe("Number of messages to process in each batch (default: 50)"),
  },
  async ({ messageIds, addLabelIds, removeLabelIds, batchSize }) => {
    try {
      const gmail = await initializeGmailClient();
      const results = [];

      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);

        const batchPromises = batch.map(async (messageId) => {
          try {
            await gmail.users.messages.modify({
              userId: 'me',
              id: messageId,
              requestBody: {
                addLabelIds: addLabelIds || [],
                removeLabelIds: removeLabelIds || []
              }
            });
            return { messageId, success: true };
          } catch (error) {
            return {
              messageId,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        content: [
          {
            type: "text",
            text: `Batch modify completed. Successfully modified: ${successful}, Failed: ${failed}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to batch modify emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Tool 8: gmail_batch_delete_emails
server.tool(
  "gmail_batch_delete_emails",
  "Permanently deletes multiple emails in batches",
  {
    messageIds: z.array(z.string()).describe("List of message IDs to delete"),
    batchSize: z.number().default(50).describe("Number of messages to process in each batch (default: 50)"),
  },
  async ({ messageIds, batchSize }) => {
    try {
      const gmail = await initializeGmailClient();
      const results = [];

      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);

        const batchPromises = batch.map(async (messageId) => {
          try {
            await gmail.users.messages.delete({
              userId: 'me',
              id: messageId
            });
            return { messageId, success: true };
          } catch (error) {
            return {
              messageId,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        content: [
          {
            type: "text",
            text: `Batch delete completed. Successfully deleted: ${successful}, Failed: ${failed}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'batch delete emails');
    }
  }
);

// Tool 9: gmail_list_labels
server.tool(
  "gmail_list_labels",
  "Lists all Gmail labels (folders)",
  {},
  async () => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.labels.list({
        userId: 'me'
      });

      const labels = response.data.labels || [];
      const systemLabels = labels.filter(l => l.type === 'system');
      const userLabels = labels.filter(l => l.type === 'user');

      const formatLabels = (labelList: any[]) =>
        labelList.map(l => `ID: ${l.id}\nName: ${l.name}`).join('\n\n');

      return {
        content: [
          {
            type: "text",
            text: `Found ${labels.length} labels (${systemLabels.length} system, ${userLabels.length} user):\n\n` +
                  `SYSTEM LABELS:\n${formatLabels(systemLabels)}\n\n` +
                  `USER LABELS:\n${formatLabels(userLabels)}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'list labels');
    }
  }
);

// Tool 10: gmail_create_label
server.tool(
  "gmail_create_label",
  "Creates a new Gmail label",
  {
    name: z.string().describe("Name for the new label"),
    messageListVisibility: z.enum(['show', 'hide']).optional().describe("Whether to show or hide the label in the message list"),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe("Visibility of the label in the label list"),
  },
  async ({ name, messageListVisibility, labelListVisibility }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          messageListVisibility,
          labelListVisibility
        }
      });

      return {
        content: [
          {
            type: "text",
            text: `Label created successfully:\nID: ${response.data.id}\nName: ${response.data.name}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'create label');
    }
  }
);

// Tool 11: gmail_delete_label
server.tool(
  "gmail_delete_label",
  "Deletes a Gmail label",
  {
    labelId: z.string().describe("ID of the label to delete"),
  },
  async ({ labelId }) => {
    try {
      const gmail = await initializeGmailClient();

      await gmail.users.labels.delete({
        userId: 'me',
        id: labelId
      });

      return {
        content: [
          {
            type: "text",
            text: `Label deleted successfully. Label ID: ${labelId}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'delete label');
    }
  }
);

// Tool 12: gmail_get_draft
server.tool(
  "gmail_get_draft",
  "Retrieves a specific draft by ID",
  {
    draftId: z.string().describe("ID of the draft to retrieve"),
  },
  async ({ draftId }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.drafts.get({
        userId: 'me',
        id: draftId,
        format: 'full'
      });

      const draft = response.data;
      const message = draft.message;
      const headers = message?.payload?.headers || [];

      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const { text, html, attachments } = extractEmailContent(message?.payload || {});
      const body = text || html || '';

      const attachmentInfo = attachments.length > 0
        ? `\n\nAttachments (${attachments.length}):\n` +
          attachments.map(a => `- ${a.filename} (${a.mimeType})`).join('\n')
        : '';

      return {
        content: [
          {
            type: "text",
            text: `Draft ID: ${draft.id}\nMessage ID: ${message?.id}\nSubject: ${getHeader('Subject')}\nTo: ${getHeader('To')}\nCC: ${getHeader('CC') || 'None'}\nBCC: ${getHeader('BCC') || 'None'}\n\n${body}${attachmentInfo}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'get draft');
    }
  }
);

// Tool 13: gmail_list_drafts
server.tool(
  "gmail_list_drafts",
  "Lists all draft emails",
  {
    maxResults: z.number().optional().describe("Maximum number of drafts to return"),
    query: z.string().optional().describe("Search query to filter drafts"),
  },
  async ({ maxResults, query }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.drafts.list({
        userId: 'me',
        maxResults: maxResults,
        q: query
      });

      const drafts = response.data.drafts || [];

      if (drafts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No drafts found.",
            },
          ],
        };
      }

      const results = [];
      for (const draft of drafts) {
        const draftDetail = await gmail.users.drafts.get({
          userId: 'me',
          id: draft.id!,
          format: 'full'
        });

        const headers = draftDetail.data.message?.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        results.push({
          id: draft.id,
          subject: getHeader('Subject') || '(No Subject)',
          to: getHeader('To') || '(No Recipients)',
          date: getHeader('Date') || 'No Date'
        });
      }

      const resultText = results.map(r =>
        `ID: ${r.id}\nSubject: ${r.subject}\nTo: ${r.to}\nDate: ${r.date}\n---`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `Found ${drafts.length} drafts:\n\n${resultText}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'list drafts');
    }
  }
);

// Tool 14: gmail_send_draft
server.tool(
  "gmail_send_draft",
  "Sends an existing draft email",
  {
    draftId: z.string().describe("ID of the draft to send"),
  },
  async ({ draftId }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: {
          id: draftId
        }
      });

      return {
        content: [
          {
            type: "text",
            text: `Draft sent successfully. Message ID: ${response.data.id}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'send draft');
    }
  }
);

// Tool 15: gmail_delete_draft
server.tool(
  "gmail_delete_draft",
  "Deletes a draft email",
  {
    draftId: z.string().describe("ID of the draft to delete"),
  },
  async ({ draftId }) => {
    try {
      const gmail = await initializeGmailClient();

      await gmail.users.drafts.delete({
        userId: 'me',
        id: draftId
      });

      return {
        content: [
          {
            type: "text",
            text: `Draft deleted successfully. Draft ID: ${draftId}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'delete draft');
    }
  }
);

// Tool 16: gmail_get_attachment
server.tool(
  "gmail_get_attachment",
  "Downloads an email attachment",
  {
    messageId: z.string().describe("ID of the email message containing the attachment"),
    attachmentId: z.string().describe("ID of the attachment to download"),
  },
  async ({ messageId, attachmentId }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId
      });

      const attachmentData = response.data;
      const size = attachmentData.size || 0;
      const data = attachmentData.data || '';

      return {
        content: [
          {
            type: "text",
            text: `Attachment downloaded successfully:\nAttachment ID: ${attachmentId}\nSize: ${Math.round(size/1024)} KB\nData: ${data.substring(0, 100)}...`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'download attachment');
    }
  }
);

// Tool 17: gmail_trash_message
server.tool(
  "gmail_trash_message",
  "Moves an email to trash",
  {
    messageId: z.string().describe("ID of the email message to move to trash"),
  },
  async ({ messageId }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.messages.trash({
        userId: 'me',
        id: messageId
      });

      return {
        content: [
          {
            type: "text",
            text: `Email moved to trash successfully. Message ID: ${response.data.id}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'trash message');
    }
  }
);

// Tool 18: gmail_untrash_message
server.tool(
  "gmail_untrash_message",
  "Removes an email from trash",
  {
    messageId: z.string().describe("ID of the email message to remove from trash"),
  },
  async ({ messageId }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.messages.untrash({
        userId: 'me',
        id: messageId
      });

      return {
        content: [
          {
            type: "text",
            text: `Email removed from trash successfully. Message ID: ${response.data.id}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'untrash message');
    }
  }
);

// Tool 19: gmail_get_thread
server.tool(
  "gmail_get_thread",
  "Gets an email conversation thread",
  {
    threadId: z.string().describe("ID of the thread to retrieve"),
    format: z.enum(['minimal', 'full', 'metadata']).optional().default('full').describe("Format of the response"),
  },
  async ({ threadId, format }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: format
      });

      const thread = response.data;
      const messages = thread.messages || [];

      if (messages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No messages found in this thread.",
            },
          ],
        };
      }

      const threadInfo = messages.map((message, index) => {
        const headers = message.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        const { text, html } = extractEmailContent(message.payload || {});
        const body = (text || html || '').substring(0, 200) + (text?.length > 200 ? '...' : '');

        return `Message ${index + 1}:\nID: ${message.id}\nFrom: ${getHeader('From')}\nDate: ${getHeader('Date')}\nSubject: ${getHeader('Subject')}\nPreview: ${body}\n---`;
      }).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `Thread ID: ${threadId}\nMessages: ${messages.length}\n\n${threadInfo}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'get thread');
    }
  }
);

// Tool 20: gmail_list_threads
server.tool(
  "gmail_list_threads",
  "Lists email conversation threads",
  {
    query: z.string().optional().describe("Search query to filter threads"),
    maxResults: z.number().optional().describe("Maximum number of threads to return"),
    labelIds: z.array(z.string()).optional().describe("Only return threads with labels that match all of the specified label IDs"),
  },
  async ({ query, maxResults, labelIds }) => {
    try {
      const gmail = await initializeGmailClient();

      const response = await gmail.users.threads.list({
        userId: 'me',
        q: query,
        maxResults: maxResults,
        labelIds: labelIds
      });

      const threads = response.data.threads || [];

      if (threads.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No threads found matching the criteria.",
            },
          ],
        };
      }

      const results = [];
      for (const thread of threads.slice(0, 10)) {
        const threadDetail = await gmail.users.threads.get({
          userId: 'me',
          id: thread.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        });

        const firstMessage = threadDetail.data.messages?.[0];
        const headers = firstMessage?.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        results.push({
          id: thread.id,
          historyId: thread.historyId,
          messageCount: threadDetail.data.messages?.length || 0,
          subject: getHeader('Subject') || '(No Subject)',
          participants: getHeader('From') || 'Unknown',
          lastDate: getHeader('Date') || 'No Date'
        });
      }

      const resultText = results.map(r =>
        `Thread ID: ${r.id}\nMessages: ${r.messageCount}\nSubject: ${r.subject}\nParticipants: ${r.participants}\nLast Activity: ${r.lastDate}\n---`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `Found ${threads.length} threads. Showing first ${results.length}:\n\n${resultText}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'list threads');
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gmail MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
