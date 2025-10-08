/**
 * get_accounts tool
 * Lists all accessible Google Ads customer accounts
 */

import { createGoogleAdsClientFromRequest } from '../api/google-ads-client.js';
import type { UserCredentials } from '../validation/schemas.js';

export interface GetAccountsRequest {
  user_credentials: UserCredentials;
}

export interface AccountInfo {
  id: string;
  name: string;
  currency?: string;
}

export interface GetAccountsResponse {
  accounts: AccountInfo[];
  source: {
    mcp: string;
    version: string;
  };
}

/**
 * Get all accessible Google Ads accounts
 */
export async function getAccounts(request: GetAccountsRequest): Promise<GetAccountsResponse> {
  const client = createGoogleAdsClientFromRequest(request.user_credentials);
  const accounts = await client.listAccessibleCustomers();

  return {
    accounts: accounts.map(account => ({
      id: account.id,
      name: account.descriptive_name
    })),
    source: {
      mcp: 'mcp-google-ads',
      version: '1.0.0'
    }
  };
}
