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
      // Log the raw error for debugging
      console.error('[Google Ads API Error]', {
        name: error.name,
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack
      });

      // Return detailed error information for debugging
      return {
        status: 'error',
        version: '1.0.0',
        message: error.message || 'Authentication failed',
        error_details: {
          type: error.errorResponse?.error?.type || error.name || 'UNKNOWN',
          code: error.code || error.errorResponse?.error?.upstream_code || null,
          message: error.message || 'Unknown error occurred',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    // Authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('unauthorized')) {
      const errResponse = createErrorResponse(
        'AUTH',
        'Authentication failed. Check your credentials.',
        error.code
      );
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 401,
        errorResponse: errResponse
      });
    }

    // Rate limit errors
    if (
      error.message?.includes('RATE_EXCEEDED') ||
      error.message?.includes('RESOURCE_EXHAUSTED')
    ) {
      const errResponse = createErrorResponse(
        'RATE_LIMIT',
        'Rate limit exceeded. Please retry after some time.',
        error.code,
        60 // Suggest 60 second retry
      );
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 429,
        retryAfterSeconds: 60,
        errorResponse: errResponse
      });
    }

    // Not found errors
    if (error.message?.includes('NOT_FOUND') || error.message?.includes('does not exist')) {
      const errResponse = createErrorResponse(
        'NOT_FOUND',
        'Requested resource not found.',
        error.code
      );
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 404,
        errorResponse: errResponse
      });
    }

    // Validation errors
    if (error.message?.includes('INVALID') || error.message?.includes('validation')) {
      const errResponse = createErrorResponse('VALIDATION', error.message, error.code);
      return Object.assign(new Error(errResponse.error.message), {
        statusCode: 400,
        errorResponse: errResponse
      });
    }

    // Generic upstream error
    const errResponse = createErrorResponse(
      'UPSTREAM',
      error.message || 'Unknown error from Google Ads API',
      error.code
    );
    return Object.assign(new Error(errResponse.error.message), {
      statusCode: 500,
      errorResponse: errResponse
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
 * Create Google Ads client from environment variables (legacy method)
 * @deprecated Use createGoogleAdsClientFromRequest for per-request credentials
 */
export function createGoogleAdsClient(): GoogleAdsClient {
  const config: GoogleAdsConfig = {
    client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN || '',
    login_customer_id: process.env.GOOGLE_LOGIN_CUSTOMER_ID
  };

  // Validate required config
  if (!config.client_id || !config.client_secret || !config.refresh_token || !config.developer_token) {
    throw new Error(
      'Missing required Google Ads configuration. Please check environment variables: ' +
      'GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_DEVELOPER_TOKEN'
    );
  }

  return new GoogleAdsClient(config);
}

/**
 * Create Google Ads client from request credentials
 * Merges user-provided credentials with app-level credentials from environment
 *
 * @param userCreds - User-specific credentials (refresh_token required, login_customer_id optional)
 * @returns GoogleAdsClient instance configured with merged credentials
 */
export function createGoogleAdsClientFromRequest(userCreds?: {
  refresh_token?: string;
  login_customer_id?: string;
}): GoogleAdsClient {
  // App-level credentials - ALWAYS from environment (security)
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;

  // User-level credentials - MUST be provided in request
  const refreshToken = userCreds?.refresh_token;
  const loginCustomerId = userCreds?.login_customer_id;

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

  // Validate user-level credentials
  if (!refreshToken) {
    const errorResponse = createErrorResponse(
      'AUTH',
      'Missing refresh_token. Must be provided via user_credentials parameter',
      'MISSING_REFRESH_TOKEN'
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
