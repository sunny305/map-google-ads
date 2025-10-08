#!/usr/bin/env node

/**
 * Google Ads MCP Server
 * Entry point for the Model Context Protocol server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { getAccounts } from './tools/get-accounts.js';
import { getCampaigns } from './tools/get-campaigns.js';
import { getAds } from './tools/get-ads.js';
import { getReport } from './tools/get-report.js';
import { getRateLimitStatus } from './tools/get-rate-limit-status.js';
import { healthcheck } from './tools/healthcheck.js';
import {
  GetCampaignsRequest,
  GetAdsRequest,
  GetReportRequest,
  createErrorResponse
} from './validation/schemas.js';
import { createLogger, generateRequestId } from './utils/logger.js';

// Load environment variables (for development)
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
 * Main server class
 */
class GoogleAdsMCPServer {
  private server: Server;

  constructor() {
    const logger = createLogger({ service: 'mcp-google-ads' });

    this.server = new Server(
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

    logger.info('Google Ads MCP Server initialized successfully');
    this.setupHandlers();
  }

  /**
   * Setup request handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS
    }));

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.handleToolCall(request.params.name, request.params.arguments || {})
    );
  }

  /**
   * Handle tool calls
   */
  private async handleToolCall(toolName: string, args: any): Promise<any> {
    const requestId = generateRequestId();
    const logger = createLogger({ service: 'mcp-google-ads' }).withRequestId(requestId).withTool(toolName);
    const startTime = Date.now();

    logger.info(`Tool call started`, { args });

    try {
      switch (toolName) {
        case 'get_accounts': {
          const result = await getAccounts(args);
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
          const result = await getRateLimitStatus(args);
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
          const result = await healthcheck(args);
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
      logger.error('Tool call failed', error, { duration_ms: Date.now() - startTime });

      // Handle validation errors
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

      // Handle other errors
      const errorResponse = (error as any).errorResponse || createErrorResponse(
        'UNKNOWN',
        error.message,
        error.code
      );

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
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const logger = createLogger({ service: 'mcp-google-ads' });
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Google Ads MCP Server running on stdio');
  }
}

/**
 * Start the server
 */
const server = new GoogleAdsMCPServer();
const logger = createLogger({ service: 'mcp-google-ads' });
server.start().catch((error) => {
  logger.error('Fatal error starting server', error);
  process.exit(1);
});
