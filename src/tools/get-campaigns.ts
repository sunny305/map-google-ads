/**
 * get_campaigns tool
 * Retrieves campaigns for specified accounts and date range
 */

import { createGoogleAdsClientFromRequest } from '../api/google-ads-client.js';
import { GetCampaignsRequest, resolveDateRange } from '../validation/schemas.js';

export interface CampaignInfo {
  id: string;
  name: string;
  status: string;
  account_id: string;
  account_name: string;
}

export interface GetCampaignsResponse {
  campaigns: CampaignInfo[];
  source: {
    mcp: string;
    version: string;
  };
}

/**
 * Get campaigns for specified accounts
 */
export async function getCampaigns(
  request: GetCampaignsRequest
): Promise<GetCampaignsResponse> {
  const client = createGoogleAdsClientFromRequest(request.user_credentials);
  const { start_date, end_date } = resolveDateRange(request.date_range);

  // If no account_ids provided, we'll need to get all accessible accounts
  let accountIds = request.account_ids;
  if (!accountIds || accountIds.length === 0) {
    const accounts = await client.listAccessibleCustomers();
    accountIds = accounts.map(acc => acc.id);
  }

  const allCampaigns: CampaignInfo[] = [];

  // Query each account
  for (const accountId of accountIds) {
    // Build GAQL query
    let query = `
      SELECT
        customer.id,
        customer.descriptive_name,
        campaign.id,
        campaign.name,
        campaign.status
      FROM campaign
      WHERE segments.date BETWEEN '${start_date}' AND '${end_date}'
    `;

    // Add campaign ID filter if provided
    if (request.campaign_ids && request.campaign_ids.length > 0) {
      const campaignIdList = request.campaign_ids.join(', ');
      query += ` AND campaign.id IN (${campaignIdList})`;
    }

    try {
      const { results } = await client.query(accountId, query);

      // Process results
      const campaigns = results.map((row: any) => ({
        id: row.campaign.id.toString(),
        name: row.campaign.name,
        status: row.campaign.status,
        account_id: row.customer.id.toString(),
        account_name: row.customer.descriptive_name
      }));

      allCampaigns.push(...campaigns);
    } catch (error) {
      console.error(`Error querying account ${accountId}:`, error);
      // Continue with other accounts
    }
  }

  // Deduplicate campaigns (same campaign might appear multiple times due to date segments)
  const uniqueCampaigns = Array.from(
    new Map(allCampaigns.map(c => [c.id, c])).values()
  );

  return {
    campaigns: uniqueCampaigns,
    source: {
      mcp: 'mcp-google-ads',
      version: '1.0.0'
    }
  };
}
