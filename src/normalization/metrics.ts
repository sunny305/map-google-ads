/**
 * Metrics normalization and derived metric calculations
 * All derived metrics include zero-guards to prevent division by zero
 */

export interface RawMetrics {
  cost_micros?: number | string;
  impressions?: number | string;
  clicks?: number | string;
  conversions?: number | string;
  conversions_value?: number | string;
  all_conversions?: number | string;
  all_conversions_value?: number | string;
}

export interface NormalizedMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
}

/**
 * Convert micros to decimal (Google Ads uses micros for currency)
 * 1 micros = 0.000001 units
 */
export function microsToDecimal(micros: number | string | undefined): number {
  if (micros === undefined || micros === null) {
    return 0;
  }

  const value = typeof micros === 'string' ? parseInt(micros, 10) : micros;

  if (isNaN(value)) {
    return 0;
  }

  return value / 1_000_000;
}

/**
 * Safely convert to number
 */
function toNumber(value: number | string | undefined): number {
  if (value === undefined || value === null) {
    return 0;
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  return isNaN(num) ? 0 : num;
}

/**
 * Calculate CTR (Click-Through Rate)
 * Formula: clicks / impressions
 */
export function calculateCTR(clicks: number, impressions: number): number {
  if (impressions === 0) {
    return 0;
  }

  return clicks / impressions;
}

/**
 * Calculate CPC (Cost Per Click)
 * Formula: spend / clicks
 */
export function calculateCPC(spend: number, clicks: number): number {
  if (clicks === 0) {
    return 0;
  }

  return spend / clicks;
}

/**
 * Calculate CPM (Cost Per Mille/Thousand Impressions)
 * Formula: (spend * 1000) / impressions
 */
export function calculateCPM(spend: number, impressions: number): number {
  if (impressions === 0) {
    return 0;
  }

  return (spend * 1000) / impressions;
}

/**
 * Calculate CPA (Cost Per Acquisition/Conversion)
 * Formula: spend / conversions
 */
export function calculateCPA(spend: number, conversions: number): number {
  if (conversions === 0) {
    return 0;
  }

  return spend / conversions;
}

/**
 * Calculate ROAS (Return On Ad Spend)
 * Formula: conversion_value / spend
 */
export function calculateROAS(conversionValue: number, spend: number): number {
  if (spend === 0) {
    return 0;
  }

  return conversionValue / spend;
}

/**
 * Normalize raw metrics from Google Ads API to standardized schema
 */
export function normalizeMetrics(raw: RawMetrics): NormalizedMetrics {
  // Base metrics with currency conversion
  const spend = microsToDecimal(raw.cost_micros);
  const impressions = toNumber(raw.impressions);
  const clicks = toNumber(raw.clicks);
  const conversions = toNumber(raw.conversions);
  const conversion_value = microsToDecimal(raw.conversions_value);

  // Derived metrics with zero-guards
  const ctr = calculateCTR(clicks, impressions);
  const cpc = calculateCPC(spend, clicks);
  const cpm = calculateCPM(spend, impressions);
  const cpa = calculateCPA(spend, conversions);
  const roas = calculateROAS(conversion_value, spend);

  return {
    spend,
    impressions,
    clicks,
    conversions,
    conversion_value,
    ctr,
    cpc,
    cpm,
    cpa,
    roas
  };
}

/**
 * Round metric to specified decimal places
 */
export function roundMetric(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format metrics for display (with rounding)
 */
export function formatMetrics(metrics: NormalizedMetrics): NormalizedMetrics {
  return {
    spend: roundMetric(metrics.spend, 2),
    impressions: Math.round(metrics.impressions),
    clicks: Math.round(metrics.clicks),
    conversions: roundMetric(metrics.conversions, 2),
    conversion_value: roundMetric(metrics.conversion_value, 2),
    ctr: roundMetric(metrics.ctr, 4),
    cpc: roundMetric(metrics.cpc, 2),
    cpm: roundMetric(metrics.cpm, 2),
    cpa: roundMetric(metrics.cpa, 2),
    roas: roundMetric(metrics.roas, 2)
  };
}
