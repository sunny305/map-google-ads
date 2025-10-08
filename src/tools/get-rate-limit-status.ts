/**
 * get_rate_limit_status tool
 * Get current rate limit status and quotas
 */

import { createGoogleAdsClientFromRequest } from '../api/google-ads-client.js';
import type { UserCredentials } from '../validation/schemas.js';

export interface GetRateLimitStatusRequest {
  user_credentials: UserCredentials;
}

export interface RateLimitStatus {
  quota_remaining: number | null;
  quota_limit: number | null;
  last_updated: string | null;
  note: string;
  source: {
    mcp: string;
    version: string;
  };
}

/**
 * Get rate limit status
 * Note: Google Ads API doesn't always expose rate limit info in headers
 */
export async function getRateLimitStatus(request: GetRateLimitStatusRequest): Promise<RateLimitStatus> {
  const client = createGoogleAdsClientFromRequest(request.user_credentials);
  const rateLimitInfo = client.getRateLimitStatus();

  return {
    quota_remaining: rateLimitInfo.quotaRemaining,
    quota_limit: rateLimitInfo.quotaLimit,
    last_updated: rateLimitInfo.lastUpdated,
    note: 'Google Ads API does not consistently expose rate limit headers. ' +
          'If quota information is null, it means the API has not provided this data. ' +
          'Rate limiting is enforced server-side.',
    source: {
      mcp: 'mcp-google-ads',
      version: '1.0.0'
    }
  };
}
