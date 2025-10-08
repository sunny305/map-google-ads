#!/usr/bin/env node

/**
 * Google Ads MCP HTTP/SSE Server
 * For cloud deployment (Render, Railway, etc.)
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { getAccounts, GetAccountsRequest } from './tools/get-accounts.js';
import { getCampaigns } from './tools/get-campaigns.js';
import { getAds } from './tools/get-ads.js';
import { getReport } from './tools/get-report.js';
import { getRateLimitStatus, GetRateLimitStatusRequest } from './tools/get-rate-limit-status.js';
import { healthcheck, HealthcheckRequest } from './tools/healthcheck.js';
import {
  GetCampaignsRequest,
  GetAdsRequest,
  GetReportRequest,
  createErrorResponse
} from './validation/schemas.js';
import { createLogger, generateRequestId } from './utils/logger.js';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    // dotenv not available, skip
  }
}

/**
 * Tool definitions matching mcp-manifest.json
 */
const TOOLS: Tool[] = [
  {
    name: 'get_accounts',
    description: 'List all accessible Google Ads customer accounts',
    inputSchema: {
      type: 'object',
      properties: {
        user_credentials: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'User OAuth refresh token (REQUIRED)'
            },
            login_customer_id: {
              type: 'string',
              description: 'Manager account ID (optional, for MCC accounts)'
            }
          },
          required: ['refresh_token']
        }
      },
      required: ['user_credentials'],
      additionalProperties: false
    }
  },
  {
    name: 'get_campaigns',
    description: 'Retrieve campaigns for specified accounts and date range',
    inputSchema: {
      type: 'object',
      properties: {
        account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of customer IDs'
        },
        date_range: {
          type: 'object',
          properties: {
            preset: {
              type: 'string',
              enum: ['LAST_7_DAYS', 'LAST_30_DAYS', 'MTD', 'YTD']
            },
            start_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            end_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
          }
        },
        campaign_ids: {
          type: 'array',
          items: { type: 'string' }
        },
        timezone: {
          type: 'string',
          default: 'Asia/Kolkata'
        },
        user_credentials: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'User OAuth refresh token (REQUIRED)'
            },
            login_customer_id: {
              type: 'string',
              description: 'Manager account ID (optional)'
            }
          },
          required: ['refresh_token']
        }
      },
      required: ['date_range', 'user_credentials']
    }
  },
  {
    name: 'get_ads',
    description: 'Retrieve ads for specified accounts and date range',
    inputSchema: {
      type: 'object',
      properties: {
        account_ids: { type: 'array', items: { type: 'string' } },
        date_range: { type: 'object' },
        campaign_ids: { type: 'array', items: { type: 'string' } },
        ad_ids: { type: 'array', items: { type: 'string' } },
        timezone: { type: 'string', default: 'Asia/Kolkata' },
        user_credentials: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'User OAuth refresh token (REQUIRED)'
            },
            login_customer_id: {
              type: 'string',
              description: 'Manager account ID (optional)'
            }
          },
          required: ['refresh_token']
        }
      },
      required: ['date_range', 'user_credentials']
    }
  },
  {
    name: 'get_report',
    description: 'Get normalized performance report with metrics',
    inputSchema: {
      type: 'object',
      properties: {
        account_ids: { type: 'array', items: { type: 'string' } },
        date_range: { type: 'object' },
        level: {
          type: 'string',
          enum: ['ACCOUNT', 'CAMPAIGN', 'AD']
        },
        fields: { type: 'array', items: { type: 'string' } },
        filters: { type: 'array' },
        breakdowns: { type: 'array', items: { type: 'string' } },
        timezone: { type: 'string', default: 'Asia/Kolkata' },
        paging: { type: 'object' },
        user_credentials: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'User OAuth refresh token (REQUIRED)'
            },
            login_customer_id: {
              type: 'string',
              description: 'Manager account ID (optional)'
            }
          },
          required: ['refresh_token']
        }
      },
      required: ['date_range', 'level', 'user_credentials']
    }
  },
  {
    name: 'get_rate_limit_status',
    description: 'Get current rate limit status and quotas',
    inputSchema: {
      type: 'object',
      properties: {
        user_credentials: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'User OAuth refresh token (REQUIRED)'
            },
            login_customer_id: {
              type: 'string',
              description: 'Manager account ID (optional)'
            }
          },
          required: ['refresh_token']
        }
      },
      required: ['user_credentials'],
      additionalProperties: false
    }
  },
  {
    name: 'healthcheck',
    description: 'Check API connectivity and return server version',
    inputSchema: {
      type: 'object',
      properties: {
        user_credentials: {
          type: 'object',
          properties: {
            refresh_token: {
              type: 'string',
              description: 'User OAuth refresh token (REQUIRED)'
            },
            login_customer_id: {
              type: 'string',
              description: 'Manager account ID (optional)'
            }
          },
          required: ['refresh_token']
        }
      },
      required: ['user_credentials'],
      additionalProperties: false
    }
  }
];

/**
 * Create a new MCP server instance with handlers
 */
function createMCPServer(): Server {
  const logger = createLogger({ service: 'mcp-google-ads-http' });

  const server = new Server(
    {
      name: 'mcp-google-ads',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  logger.info('Google Ads MCP HTTP Server initialized successfully');

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const requestId = generateRequestId();
    const logger = createLogger({ service: 'mcp-google-ads-http' }).withRequestId(requestId).withTool(request.params.name);
    const startTime = Date.now();

    logger.info(`Tool call started`, { args: request.params.arguments });

    try {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      switch (toolName) {
        case 'get_accounts': {
          const result = await getAccounts(args as unknown as GetAccountsRequest);
          logger.info(`Tool call completed`, { duration_ms: Date.now() - startTime });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'get_campaigns': {
          const validated = GetCampaignsRequest.parse(args);
          const result = await getCampaigns(validated);
          logger.info(`Tool call completed`, { duration_ms: Date.now() - startTime });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'get_ads': {
          const validated = GetAdsRequest.parse(args);
          const result = await getAds(validated);
          logger.info(`Tool call completed`, { duration_ms: Date.now() - startTime });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'get_report': {
          const validated = GetReportRequest.parse(args);
          const result = await getReport(validated);
          logger.info(`Tool call completed`, { duration_ms: Date.now() - startTime });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'get_rate_limit_status': {
          const result = await getRateLimitStatus(args as unknown as GetRateLimitStatusRequest);
          logger.info(`Tool call completed`, { duration_ms: Date.now() - startTime });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'healthcheck': {
          const result = await healthcheck(args as unknown as HealthcheckRequest);
          logger.info(`Tool call completed`, { duration_ms: Date.now() - startTime });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        default:
          logger.error(`Unknown tool: ${toolName}`);
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      const originalError = error.originalError || error;

      logger.error('Tool call failed', originalError, {
        duration_ms: Date.now() - startTime,
        hasOriginalError: !!error.originalError,
        errorType: error.name,
        errorCode: error.code || originalError.code
      });

      if (error.name === 'ZodError') {
        const errResponse = createErrorResponse(
          'VALIDATION',
          `Validation error: ${error.message}`,
          'VALIDATION_ERROR'
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(errResponse, null, 2)
            }
          ],
          isError: true
        };
      }

      let errorResponse;

      if (error.errorResponse) {
        errorResponse = {
          ...error.errorResponse,
          error: {
            ...error.errorResponse.error,
            original_message: originalError.message !== error.message ? originalError.message : undefined,
            details: originalError.details || undefined,
            metadata: originalError.metadata || undefined
          }
        };
      } else {
        errorResponse = createErrorResponse(
          'UNKNOWN',
          originalError.message || error.message || 'Unknown error occurred',
          originalError.code || error.code
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2)
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

/**
 * Main HTTP server
 */
const app = express();
const PORT = process.env.PORT || 3000;
const logger = createLogger({ service: 'mcp-google-ads-http' });

app.use(cors());
app.use(express.json());

// Store active SSE transports by session ID
const transports = new Map<string, SSEServerTransport>();

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MCP SSE endpoint - GET to establish connection
app.get('/mcp/sse', async (_req: Request, res: Response) => {
  logger.info('New SSE connection request (GET)');

  // Create a new MCP server instance for this connection
  const server = createMCPServer();

  // Create SSE transport
  const transport = new SSEServerTransport('/mcp/sse', res);
  transports.set(transport.sessionId, transport);

  // Clean up on close
  transport.onclose = () => {
    logger.info('SSE connection closed', { sessionId: transport.sessionId });
    transports.delete(transport.sessionId);
  };

  // Connect server to transport
  await server.connect(transport);

  logger.info('SSE connection established', { sessionId: transport.sessionId });
});

// MCP SSE endpoint - POST for messages
app.post('/mcp/sse', async (req: Request, res: Response) => {
  logger.info('SSE message received (POST)', { query: req.query });

  let sessionId = req.query.sessionId as string;

  // If no sessionId, create a new session
  if (!sessionId) {
    logger.info('No sessionId provided, creating new session');

    // Create a new MCP server instance for this connection
    const server = createMCPServer();

    // Create a dummy response object for SSE transport
    // Since we're handling POST directly, we need to work around the SSE transport
    const transport = new SSEServerTransport('/mcp/sse', res);
    sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    // Clean up on close
    transport.onclose = () => {
      logger.info('SSE connection closed', { sessionId });
      transports.delete(sessionId);
    };

    // Connect server to transport
    await server.connect(transport);
    logger.info('New SSE session created', { sessionId });

    // Handle the POST message with the new transport
    try {
      await transport.handlePostMessage(req, res);
    } catch (error: any) {
      logger.error('Error handling POST message', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
    return;
  }

  // Existing session
  const transport = transports.get(sessionId);

  if (!transport) {
    logger.error('Session not found', { sessionId });
    res.status(404).json({ error: 'Session not found. Session may have expired.' });
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error: any) {
    logger.error('Error handling POST message', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// MCP message endpoint (POST)
app.post('/mcp/message', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId' });
    return;
  }

  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error: any) {
    logger.error('Error handling POST message', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Google Ads MCP HTTP Server running on port ${PORT}`);
  logger.info(`SSE endpoint: http://localhost:${PORT}/mcp/sse`);
  logger.info(`Message endpoint: http://localhost:${PORT}/mcp/message`);
});
