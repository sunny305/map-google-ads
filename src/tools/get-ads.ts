/**
 * get_ads tool
 * Retrieves ads for specified accounts and date range
 */

import type { GoogleAdsClient } from '../api/google-ads-client.js';
import { GetAdsRequest, resolveDateRange } from '../validation/schemas.js';

export interface AdInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_name: string;
}

export interface GetAdsResponse {
  ads: AdInfo[];
  source: {
    mcp: string;
    version: string;
  };
}

/**
 * Get ads for specified accounts
 */
export async function getAds(
  client: GoogleAdsClient,
  request: GetAdsRequest
): Promise<GetAdsResponse> {
  const { start_date, end_date } = resolveDateRange(request.date_range);

  // If no account_ids provided, get all accessible accounts
  let accountIds = request.account_ids;
  if (!accountIds || accountIds.length === 0) {
    const accounts = await client.listAccessibleCustomers();
    accountIds = accounts.map(acc => acc.id);
  }

  const allAds: AdInfo[] = [];

  // Query each account
  for (const accountId of accountIds) {
    // Build GAQL query
    let query = `
      SELECT
        customer.id,
        customer.descriptive_name,
        campaign.id,
        campaign.name,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.status
      FROM ad_group_ad
      WHERE segments.date BETWEEN '${start_date}' AND '${end_date}'
    `;

    // Add campaign ID filter if provided
    if (request.campaign_ids && request.campaign_ids.length > 0) {
      const campaignIdList = request.campaign_ids.join(', ');
      query += ` AND campaign.id IN (${campaignIdList})`;
    }

    // Add ad ID filter if provided
    if (request.ad_ids && request.ad_ids.length > 0) {
      const adIdList = request.ad_ids.join(', ');
      query += ` AND ad_group_ad.ad.id IN (${adIdList})`;
    }

    try {
      const { results } = await client.query(accountId, query);

      // Process results
      const ads = results.map((row: any) => ({
        id: row.ad_group_ad.ad.id.toString(),
        name: row.ad_group_ad.ad.name || 'Unnamed Ad',
        type: row.ad_group_ad.ad.type,
        status: row.ad_group_ad.status,
        campaign_id: row.campaign.id.toString(),
        campaign_name: row.campaign.name,
        account_id: row.customer.id.toString(),
        account_name: row.customer.descriptive_name
      }));

      allAds.push(...ads);
    } catch (error) {
      console.error(`Error querying account ${accountId}:`, error);
      // Continue with other accounts
    }
  }

  // Deduplicate ads
  const uniqueAds = Array.from(
    new Map(allAds.map(a => [a.id, a])).values()
  );

  return {
    ads: uniqueAds,
    source: {
      mcp: 'mcp-google-ads',
      version: '1.0.0'
    }
  };
}
