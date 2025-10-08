#!/usr/bin/env node

/**
 * Google Ads MCP JSON-RPC Server
 * For cloud deployment (Render, Railway, etc.)
 */

import express, { Request, Response } from 'express';
import cors from 'cors';

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
const TOOLS = [
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
 * Main HTTP server
 */
const app = express();
const PORT = process.env.PORT || 3000;
const logger = createLogger({ service: 'mcp-google-ads-jsonrpc' });

app.use(cors());
app.use(express.json());

// Request timeout middleware (30 seconds)
app.use((req: Request, res: Response, next) => {
  req.setTimeout(30000, () => {
    logger.error('Request timeout', { url: req.url, method: req.method });
    if (!res.headersSent) {
      res.status(408).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Request timeout'
        },
        id: null
      });
    }
  });
  next();
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
  logger.error('Unhandled error in request', err);
  if (!res.headersSent) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error',
        data: process.env.NODE_ENV === 'development' ? err.message : undefined
      },
      id: null
    });
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint - API info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'mcp-google-ads',
    version: '1.0.0',
    description: 'Google Ads MCP Server with JSON-RPC transport',
    endpoints: {
      health: '/health',
      mcp: '/mcp (POST - JSON-RPC)'
    },
    documentation: 'https://github.com/your-repo/mcp-google-ads'
  });
});

// JSON-RPC endpoint for MCP
app.post('/mcp', async (req: Request, res: Response) => {
  // Set response timeout
  res.setTimeout(25000, () => {
    logger.error('Response timeout');
    if (!res.headersSent) {
      res.status(504).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Gateway timeout'
        },
        id: null
      });
    }
  });

  logger.info('MCP JSON-RPC request received', { method: req.body?.method });

  try {
    const request = req.body;

    if (!request || !request.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: request?.id || null
      });
      return;
    }

    // Handle notifications (no response needed)
    if (request.method?.startsWith('notifications/')) {
      logger.info('Notification received', { method: request.method });
      res.status(200).end();
      return;
    }

    // Route to appropriate handler
    if (request.method === 'initialize') {
      res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'mcp-google-ads',
            version: '1.0.0'
          }
        },
        id: request.id
      });
      return;
    } else if (request.method === 'tools/list') {
      res.json({
        jsonrpc: '2.0',
        result: {
          tools: TOOLS
        },
        id: request.id
      });
      return;
    } else if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;

      const requestId = generateRequestId();
      const toolLogger = createLogger({ service: 'mcp-google-ads-jsonrpc' })
        .withRequestId(requestId)
        .withTool(name);
      const startTime = Date.now();

      toolLogger.info(`Tool call started`, { args });

      try {
        let result;

        switch (name) {
          case 'get_accounts': {
            const toolResult = await getAccounts(args as unknown as GetAccountsRequest);
            result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult, null, 2)
                }
              ]
            };
            break;
          }

          case 'get_campaigns': {
            const validated = GetCampaignsRequest.parse(args);
            const toolResult = await getCampaigns(validated);
            result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult, null, 2)
                }
              ]
            };
            break;
          }

          case 'get_ads': {
            const validated = GetAdsRequest.parse(args);
            const toolResult = await getAds(validated);
            result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult, null, 2)
                }
              ]
            };
            break;
          }

          case 'get_report': {
            const validated = GetReportRequest.parse(args);
            const toolResult = await getReport(validated);
            result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult, null, 2)
                }
              ]
            };
            break;
          }

          case 'get_rate_limit_status': {
            const toolResult = await getRateLimitStatus(args as unknown as GetRateLimitStatusRequest);
            result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult, null, 2)
                }
              ]
            };
            break;
          }

          case 'healthcheck': {
            const toolResult = await healthcheck(args as unknown as HealthcheckRequest);
            result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult, null, 2)
                }
              ]
            };
            break;
          }

          default:
            toolLogger.error(`Unknown tool: ${name}`);
            throw new Error(`Unknown tool: ${name}`);
        }

        toolLogger.info(`Tool call completed`, { duration_ms: Date.now() - startTime });

        res.json({
          jsonrpc: '2.0',
          result: result,
          id: request.id
        });
        return;
      } catch (error: any) {
        const originalError = error.originalError || error;

        toolLogger.error('Tool call failed', originalError, {
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
          res.json({
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(errResponse, null, 2)
                }
              ],
              isError: true
            },
            id: request.id
          });
          return;
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

        res.json({
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(errorResponse, null, 2)
              }
            ],
            isError: true
          },
          id: request.id
        });
      }
    } else {
      logger.info('Unknown method received', { method: request.method, params: request.params });
      res.status(501).json({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: `Method not found: ${request.method}. Supported: initialize, tools/list, tools/call`
        },
        id: request.id
      });
      return;
    }
  } catch (error: any) {
    logger.error('Error handling JSON-RPC request', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      },
      id: req.body?.id || null
    });
    return;
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Google Ads MCP JSON-RPC Server running on port ${PORT}`);
  logger.info(`Endpoints:`);
  logger.info(`  - Health: http://localhost:${PORT}/health`);
  logger.info(`  - MCP: http://localhost:${PORT}/mcp (POST)`);
});
