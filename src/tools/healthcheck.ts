/**
 * healthcheck tool
 * Check API connectivity and return server version
 */

import type { GoogleAdsClient } from '../api/google-ads-client.js';

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
    stack?: string;
  };
}

/**
 * Perform health check
 */
export async function healthcheck(client: GoogleAdsClient): Promise<HealthcheckResponse> {
  const timestamp = new Date().toISOString();

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
