/**
 * Validation schemas using Zod
 * TODO: Link to /shared/schemas once Terminal 1 completes them
 */

import { z } from 'zod';

// Date range preset enum
export const DateRangePreset = z.enum(['LAST_7_DAYS', 'LAST_30_DAYS', 'MTD', 'YTD']);

// Date string pattern (YYYY-MM-DD)
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// Date range schema
export const DateRangeSchema = z.object({
  preset: DateRangePreset.optional(),
  start_date: DateString.optional(),
  end_date: DateString.optional()
}).refine(
  data => data.preset || (data.start_date && data.end_date),
  'Either preset or both start_date and end_date must be provided'
);

// Reporting level
export const ReportingLevel = z.enum(['ACCOUNT', 'CAMPAIGN', 'AD']);

// Available metric fields
export const MetricField = z.enum([
  'spend',
  'impressions',
  'clicks',
  'conversions',
  'conversion_value',
  'ctr',
  'cpc',
  'cpm',
  'cpa',
  'roas'
]);

// Filter operator
export const FilterOperator = z.enum(['IN', 'EQ', 'GT', 'LT', 'GTE', 'LTE']);

// Filter schema
export const FilterSchema = z.object({
  field: z.string(),
  op: FilterOperator,
  values: z.array(z.string())
});

// Pagination schema
export const PagingSchema = z.object({
  limit: z.number().min(1).max(10000).optional().default(500),
  cursor: z.string().optional().nullable()
});

// ========================================
// User Credentials Schema (REQUIRED per-request)
// ========================================

/**
 * User-specific credentials that MUST be passed in every request
 *
 * App-level credentials (client_id, client_secret, developer_token)
 * MUST be in .env and CANNOT be passed as parameters for security.
 *
 * User-specific credentials REQUIRED per request:
 * - refresh_token: User's OAuth refresh token (REQUIRED - no fallback)
 * - login_customer_id: Manager account ID (optional, for MCC accounts)
 */
export const UserCredentialsSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
  login_customer_id: z.string().optional()
});

export type UserCredentials = z.infer<typeof UserCredentialsSchema>;

// ========================================
// Tool Request Schemas
// ========================================

// get_campaigns request
export const GetCampaignsRequest = z.object({
  account_ids: z.array(z.string()).optional(),
  date_range: DateRangeSchema,
  campaign_ids: z.array(z.string()).optional(),
  timezone: z.string().default('Asia/Kolkata'),
  user_credentials: UserCredentialsSchema  // REQUIRED user-specific credentials
});

export type GetCampaignsRequest = z.infer<typeof GetCampaignsRequest>;

// get_ads request
export const GetAdsRequest = z.object({
  account_ids: z.array(z.string()).optional(),
  date_range: DateRangeSchema,
  campaign_ids: z.array(z.string()).optional(),
  ad_ids: z.array(z.string()).optional(),
  timezone: z.string().default('Asia/Kolkata'),
  user_credentials: UserCredentialsSchema  // REQUIRED user-specific credentials
});

export type GetAdsRequest = z.infer<typeof GetAdsRequest>;

// get_report request
export const GetReportRequest = z.object({
  account_ids: z.array(z.string()).optional(),
  date_range: DateRangeSchema,
  level: ReportingLevel,
  fields: z.array(MetricField).optional(),
  filters: z.array(FilterSchema).optional(),
  breakdowns: z.array(z.string()).optional(),
  timezone: z.string().default('Asia/Kolkata'),
  paging: PagingSchema.optional(),
  user_credentials: UserCredentialsSchema  // REQUIRED user-specific credentials
});

export type GetReportRequest = z.infer<typeof GetReportRequest>;

// ========================================
// Error Schema
// ========================================

export const ErrorType = z.enum([
  'AUTH',
  'VALIDATION',
  'RATE_LIMIT',
  'NOT_FOUND',
  'UPSTREAM',
  'UNKNOWN'
]);

export const ErrorResponseSchema = z.object({
  error: z.object({
    type: ErrorType,
    message: z.string(),
    upstream_code: z.string().optional().nullable(),
    retry_after_seconds: z.number().optional().nullable()
  })
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ========================================
// Helper Functions
// ========================================

/**
 * Create standardized error response
 */
export function createErrorResponse(
  type: z.infer<typeof ErrorType>,
  message: string,
  upstreamCode?: string,
  retryAfterSeconds?: number
): ErrorResponse {
  return {
    error: {
      type,
      message,
      upstream_code: upstreamCode || null,
      retry_after_seconds: retryAfterSeconds || null
    }
  };
}

/**
 * Parse and resolve date range
 */
export function resolveDateRange(dateRange: z.infer<typeof DateRangeSchema>): {
  start_date: string;
  end_date: string;
} {
  if (dateRange.start_date && dateRange.end_date) {
    return {
      start_date: dateRange.start_date,
      end_date: dateRange.end_date
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (dateRange.preset) {
    case 'LAST_7_DAYS': {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      return {
        start_date: formatDate(startDate),
        end_date: formatDate(new Date(today.getTime() - 86400000)) // yesterday
      };
    }

    case 'LAST_30_DAYS': {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      return {
        start_date: formatDate(startDate),
        end_date: formatDate(new Date(today.getTime() - 86400000))
      };
    }

    case 'MTD': {
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        start_date: formatDate(startDate),
        end_date: formatDate(new Date(today.getTime() - 86400000))
      };
    }

    case 'YTD': {
      const startDate = new Date(today.getFullYear(), 0, 1);
      return {
        start_date: formatDate(startDate),
        end_date: formatDate(new Date(today.getTime() - 86400000))
      };
    }

    default:
      throw new Error('Invalid date range configuration');
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Merge user credentials with app-level credentials from environment
 *
 * App-level credentials (client_id, client_secret, developer_token)
 * MUST come from environment variables for security.
 *
 * User-level credentials (refresh_token, login_customer_id) MUST be
 * passed per request - NO fallback to environment variables.
 *
 * @param userCreds - User-specific credentials from request (REQUIRED, no optional fallback)
 * @returns Complete credentials object for API calls
 */
export function mergeCredentials(userCreds: UserCredentials): {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  loginCustomerId?: string;
} {
  // App-level credentials - ALWAYS from environment (security)
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;

  // User-level credentials - provided in request (validated by Zod)
  const refreshToken = userCreds.refresh_token;
  const loginCustomerId = userCreds.login_customer_id;

  // Validate app-level credentials are in environment
  if (!clientId || !clientSecret || !developerToken) {
    throw createErrorResponse(
      'AUTH',
      'Missing app-level credentials in environment. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_DEVELOPER_TOKEN in .env',
      'MISSING_APP_CREDENTIALS'
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    developerToken,
    loginCustomerId
  };
}
