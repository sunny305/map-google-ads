/**
 * healthcheck tool
 * Check API connectivity and return server version
 */

import { createGoogleAdsClientFromRequest } from '../api/google-ads-client.js';
import type { UserCredentials } from '../validation/schemas.js';

export interface HealthcheckRequest {
  user_credentials: UserCredentials;
}

export interface HealthcheckResponse {
  status: 'ok' | 'error';
  version: string;
  message: string;
  timestamp: string;
  source: {
    mcp: string;
    version: string;
  };
  error_details?: {
    type: string;
    code: string | null;
    message: string;
    originalMessage?: string;
    details?: any;
    stack?: string;
  };
}

/**
 * Perform health check
 */
export async function healthcheck(request: HealthcheckRequest): Promise<HealthcheckResponse> {
  const timestamp = new Date().toISOString();
  const client = createGoogleAdsClientFromRequest(request.user_credentials);

  const result = await client.healthcheck();

  return {
    status: result.status,
    version: result.version,
    message: result.message || 'API connection successful',
    timestamp,
    source: {
      mcp: 'mcp-google-ads',
      version: '1.0.0'
    },
    ...(result.error_details && { error_details: result.error_details })
  };
}
