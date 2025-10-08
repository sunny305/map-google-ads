/**
 * get_accounts tool
 * Lists all accessible Google Ads customer accounts
 */

import type { GoogleAdsClient } from '../api/google-ads-client.js';

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
export async function getAccounts(client: GoogleAdsClient): Promise<GetAccountsResponse> {
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
