/**
 * Google Ads API Client Wrapper
 * Handles authentication, connection, and query execution
 */

import { GoogleAdsApi, Customer } from 'google-ads-api';
import { withRetry } from '../utils/retry.js';
import { createErrorResponse } from '../validation/schemas.js';

export interface GoogleAdsConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  developer_token: string;
  login_customer_id?: string;
}

export interface QueryOptions {
  customer_id: string;
  page_token?: string;
  limit?: number;
}

export class GoogleAdsClient {
  private client: GoogleAdsApi;
  private config: GoogleAdsConfig;
  private rateLimitInfo: RateLimitInfo = {
    quotaRemaining: null,
    quotaLimit: null,
    lastUpdated: null
  };

  constructor(config: GoogleAdsConfig) {
    this.config = config;

    // Initialize Google Ads API client
    this.client = new GoogleAdsApi({
      client_id: config.client_id,
      client_secret: config.client_secret,
      developer_token: config.developer_token
    });
  }

  /**
   * Get customer client for a specific account
   */
  private getCustomer(customerId: string): Customer {
    return this.client.Customer({
      customer_id: customerId,
      refresh_token: this.config.refresh_token,
      login_customer_id: this.config.login_customer_id
    });
  }

  /**
   * Execute a GAQL query with retry logic
   */
  async query<T = any>(
    customerId: string,
    gaqlQuery: string,
    options?: { page_token?: string }
  ): Promise<{ results: T[]; next_page_token?: string }> {
    return withRetry(async () => {
      try {
        const customer = this.getCustomer(customerId);

        const response = await customer.query(gaqlQuery, {
          page_token: options?.page_token
        });

        // Update rate limit info if available
        this.updateRateLimitInfo(response);

        return {
          results: response as T[],
          next_page_token: (response as any).next_page_token
        };
      } catch (error: any) {
        throw this.normalizeError(error);
      }
    });
  }

  /**
   * List all accessible customer accounts
   */
  async listAccessibleCustomers(): Promise<Array<{ id: string; descriptive_name: string }>> {
    return withRetry(async () => {
      try {
        // Use the first customer from accessible customers
        const accessibleCustomers = await this.client.listAccessibleCustomers(
          this.config.refresh_token
        );

        const accounts: Array<{ id: string; descriptive_name: string }> = [];

        // Fetch details for each accessible customer
        const resourceNames = accessibleCustomers.resource_names || [];
        for (const resourceName of resourceNames) {
          // Extract customer ID from resource name (format: customers/1234567890)
          const customerId = resourceName.split('/')[1];

          const customer = this.getCustomer(customerId);

          const query = `
            SELECT
              customer.id,
              customer.descriptive_name
            FROM customer
            LIMIT 1
          `;

          const results = await customer.query(query);

          if (results && results.length > 0) {
            const row = results[0] as any;
            accounts.push({
              id: row.customer.id.toString(),
              descriptive_name: row.customer.descriptive_name
            });
          }
        }

        return accounts;
      } catch (error: any) {
        throw this.normalizeError(error);
      }
    });
  }

  /**
   * Test API connectivity
   */
  async healthcheck(): Promise<{
    status: 'ok' | 'error';
    version: string;
    message?: string;
    error_details?: {
      type: string;
      code: string | null;
      message: string;
      originalMessage?: string;
      details?: any;
      stack?: string;
    };
  }> {
    try {
      const accounts = await this.listAccessibleCustomers();

      return {
        status: 'ok',
        version: '1.0.0',
        message: `Connected successfully. ${accounts.length} accessible accounts.`
      };
    } catch (error: any) {
      // Check if there's an original error from normalizeError
      const originalError = error.originalError || error;

      // Log the raw error for debugging
      console.error('[Google Ads API Healthcheck Error]', {
        name: originalError.name,
        message: originalError.message,
        code: originalError.code,
        details: originalError.details,
        metadata: originalError.metadata,
        stack: originalError.stack
      });

      // Return detailed error information for debugging
      return {
        status: 'error',
        version: '1.0.0',
        message: error.message || originalError.message || 'Authentication failed',
        error_details: {
          type: error.errorResponse?.error?.type || error.name || 'UNKNOWN',
          code: originalError.code || error.code || error.errorResponse?.error?.upstream_code || null,
          message: error.message || originalError.message || 'Unknown error occurred',
          originalMessage: originalError.message !== error.message ? originalError.message : undefined,
          details: originalError.details,
          stack: process.env.NODE_ENV === 'development' ? originalError.stack : undefined
        }
      };
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitInfo {
    return this.rateLimitInfo;
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(response: any): void {
    // Google Ads API doesn't always expose rate limit headers directly
    // This is a placeholder for when/if they become available
    if (response?.headers) {
      // TODO: Parse rate limit headers when available
      this.rateLimitInfo.lastUpdated = new Date().toISOString();
    }
  }

  /**
   * Normalize Google Ads API errors to standard format
   */
  private normalizeError(error: any): Error {
    // Log the full error for debugging
    console.error('[GoogleAdsClient Error]', {
      message: error.message,
      code: error.code,
      name: error.name,
      details: error.details,
      metadata: error.metadata,
      stack: error.stack?.split('\n').slice(0, 3)
    });

    // Authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('unauthorized')) {
      const errResponse = createErrorResponse(
        'AUTH',
        `Authentication failed: ${error.message}`,
        error.code
      );
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 401,
        errorResponse: errResponse,
        originalError: error
      });
    }

    // Rate limit errors
    if (
      error.message?.includes('RATE_EXCEEDED') ||
      error.message?.includes('RESOURCE_EXHAUSTED')
    ) {
      const errResponse = createErrorResponse(
        'RATE_LIMIT',
        `Rate limit exceeded: ${error.message}`,
        error.code,
        60 // Suggest 60 second retry
      );
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 429,
        retryAfterSeconds: 60,
        errorResponse: errResponse,
        originalError: error
      });
    }

    // Not found errors
    if (error.message?.includes('NOT_FOUND') || error.message?.includes('does not exist')) {
      const errResponse = createErrorResponse(
        'NOT_FOUND',
        `Resource not found: ${error.message}`,
        error.code
      );
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 404,
        errorResponse: errResponse,
        originalError: error
      });
    }

    // Validation errors
    if (error.message?.includes('INVALID') || error.message?.includes('validation')) {
      const errResponse = createErrorResponse('VALIDATION', error.message, error.code);
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 400,
        errorResponse: errResponse,
        originalError: error
      });
    }

    // Generic upstream error - preserve all error details
    const errorMessage = error.message || error.details || 'Unknown error from Google Ads API';
    const fullMessage = error.details
      ? `${errorMessage} | Details: ${JSON.stringify(error.details)}`
      : errorMessage;

    const errResponse = createErrorResponse(
      'UPSTREAM',
      fullMessage,
      error.code || error.status_code
    );
    return Object.assign(new Error(errResponse.error.message), {
      statusCode: error.statusCode || 500,
      errorResponse: errResponse,
      originalError: error
    });
  }
}

/**
 * Rate limit information
 */
interface RateLimitInfo {
  quotaRemaining: number | null;
  quotaLimit: number | null;
  lastUpdated: string | null;
}

/**
 * Create Google Ads client from request credentials
 *
 * App-level credentials (client_id, client_secret, developer_token) are read from
 * environment variables for security.
 *
 * User-level credentials (refresh_token, login_customer_id) MUST be provided
 * in every request - no fallback to environment variables.
 *
 * @param userCreds - User-specific credentials (REQUIRED - refresh_token must be provided)
 * @returns GoogleAdsClient instance configured with merged credentials
 */
export function createGoogleAdsClientFromRequest(userCreds: {
  refresh_token: string;
  login_customer_id?: string;
}): GoogleAdsClient {
  // App-level credentials - ALWAYS from environment (security)
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;

  // User-level credentials - provided in request (validated by caller)
  const refreshToken = userCreds.refresh_token;
  const loginCustomerId = userCreds.login_customer_id;

  // Validate app-level credentials are in environment
  if (!clientId || !clientSecret || !developerToken) {
    const errorResponse = createErrorResponse(
      'AUTH',
      'Missing app-level credentials in environment. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_DEVELOPER_TOKEN in .env',
      'MISSING_APP_CREDENTIALS'
    );
    throw Object.assign(new Error(errorResponse.error.message), {
      statusCode: 401,
      errorResponse
    });
  }

  const config: GoogleAdsConfig = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    developer_token: developerToken,
    login_customer_id: loginCustomerId
  };

  return new GoogleAdsClient(config);
}
