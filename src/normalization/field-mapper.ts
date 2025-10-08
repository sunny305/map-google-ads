/**
 * Field mapper: Google Ads API → Standardized Schema
 * Maps Google Ads GAQL response fields to the canonical schema defined in plan.txt §4
 */

import { normalizeMetrics, formatMetrics, type RawMetrics } from './metrics.js';

/**
 * Standardized row schema (per plan.txt §4)
 */
export interface StandardizedRow {
  platform: 'google_ads';
  account_id: string;
  account_name: string;
  date: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: null; // Google Ads doesn't have adsets (Meta only)
  adset_name: null;
  ad_id: string | null;
  ad_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
  currency: string;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
  attribution_model: string | null;
  attribution_window: string | null;
}

/**
 * Google Ads API raw row
 */
export interface GoogleAdsRow {
  customer?: {
    id?: string;
    descriptive_name?: string;
    currency_code?: string;
  };
  campaign?: {
    id?: string;
    name?: string;
  };
  ad_group_ad?: {
    ad?: {
      id?: string;
      name?: string;
    };
  };
  segments?: {
    date?: string;
  };
  metrics?: RawMetrics;
}

/**
 * Map Google Ads row to standardized schema
 */
export function mapToStandardizedRow(
  row: GoogleAdsRow,
  defaultCurrency: string = 'USD'
): StandardizedRow {
  // Extract base fields
  const accountId = row.customer?.id?.toString() || '';
  const accountName = row.customer?.descriptive_name || '';
  const currency = row.customer?.currency_code || defaultCurrency;
  const date = row.segments?.date || null;

  // Campaign fields
  const campaignId = row.campaign?.id?.toString() || null;
  const campaignName = row.campaign?.name || null;

  // Ad fields
  const adId = row.ad_group_ad?.ad?.id?.toString() || null;
  const adName = row.ad_group_ad?.ad?.name || null;

  // Normalize and format metrics
  const rawMetrics = row.metrics || {};
  const normalized = normalizeMetrics(rawMetrics);
  const formatted = formatMetrics(normalized);

  // TODO: Extract attribution model and window when available
  // Google Ads stores this in customer.conversion_tracking_setting
  const attributionModel = null;
  const attributionWindow = null;

  return {
    platform: 'google_ads',
    account_id: accountId,
    account_name: accountName,
    date,
    campaign_id: campaignId,
    campaign_name: campaignName,
    adset_id: null, // Google Ads doesn't have adsets
    adset_name: null,
    ad_id: adId,
    ad_name: adName,
    spend: formatted.spend,
    impressions: formatted.impressions,
    clicks: formatted.clicks,
    conversions: formatted.conversions,
    conversion_value: formatted.conversion_value,
    currency,
    ctr: formatted.ctr,
    cpc: formatted.cpc,
    cpm: formatted.cpm,
    cpa: formatted.cpa,
    roas: formatted.roas,
    attribution_model: attributionModel,
    attribution_window: attributionWindow
  };
}

/**
 * Map array of Google Ads rows to standardized format
 */
export function mapRowsToStandardized(
  rows: GoogleAdsRow[],
  defaultCurrency?: string
): StandardizedRow[] {
  return rows.map(row => mapToStandardizedRow(row, defaultCurrency));
}

/**
 * Build GAQL field selection based on reporting level
 */
export function buildGAQLFields(level: 'ACCOUNT' | 'CAMPAIGN' | 'AD'): string[] {
  const baseFields = [
    'customer.id',
    'customer.descriptive_name',
    'customer.currency_code'
  ];

  const metricFields = [
    'metrics.cost_micros',
    'metrics.impressions',
    'metrics.clicks',
    'metrics.conversions',
    'metrics.conversions_value'
  ];

  switch (level) {
    case 'ACCOUNT':
      return [...baseFields, ...metricFields];

    case 'CAMPAIGN':
      return [
        ...baseFields,
        'campaign.id',
        'campaign.name',
        ...metricFields
      ];

    case 'AD':
      return [
        ...baseFields,
        'campaign.id',
        'campaign.name',
        'ad_group_ad.ad.id',
        'ad_group_ad.ad.name',
        ...metricFields
      ];

    default:
      return [...baseFields, ...metricFields];
  }
}

/**
 * Build GAQL resource name based on reporting level
 */
export function buildGAQLResource(level: 'ACCOUNT' | 'CAMPAIGN' | 'AD'): string {
  switch (level) {
    case 'ACCOUNT':
      return 'customer';
    case 'CAMPAIGN':
      return 'campaign';
    case 'AD':
      return 'ad_group_ad';
    default:
      return 'customer';
  }
}
