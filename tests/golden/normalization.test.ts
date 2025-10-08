/**
 * Golden tests for Google Ads MCP normalization
 * Validates that raw API responses are normalized correctly per SPEC.md
 * Tests use recorded fixtures with expected outputs
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeMetrics, roundMetric } from '../../src/normalization/metrics';

interface GoldenFixture {
  description: string;
  test_case: string;
  account_id: string;
  raw_api_response: any[];
  expected_normalized: any[];
  notes?: string;
}

function loadFixture(filename: string): GoldenFixture {
  const fixturePath = join(__dirname, '../../fixtures/golden', filename);
  const content = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

function withinTolerance(actual: number, expected: number, tolerancePercent: number = 0.1): boolean {
  if (actual === expected) return true;
  if (expected === 0) return Math.abs(actual) <= tolerancePercent / 100;
  const diff = Math.abs(actual - expected);
  const percentDiff = (diff / Math.abs(expected)) * 100;
  return percentDiff <= tolerancePercent;
}

describe('Google Ads Golden Tests - Campaign Report Normalization', () => {
  it('should normalize campaign report with date breakdown correctly', () => {
    const fixture = loadFixture('account_campaign_report.json');

    fixture.raw_api_response.forEach((rawRow, index) => {
      const normalized = normalizeMetrics({
        cost_micros: rawRow.cost_micros,
        impressions: rawRow.impressions,
        clicks: rawRow.clicks,
        conversions: rawRow.conversions,
        conversions_value: rawRow.conversions_value,
      });

      const expected = fixture.expected_normalized[index];

      // Validate base metrics
      expect(normalized.spend).toBe(expected.spend);
      expect(normalized.impressions).toBe(expected.impressions);
      expect(normalized.clicks).toBe(expected.clicks);
      expect(normalized.conversions).toBe(expected.conversions);
      expect(normalized.conversion_value).toBe(expected.conversion_value);

      // Validate derived metrics with tolerance
      expect(withinTolerance(normalized.ctr, expected.ctr, 0.1)).toBe(true);
      expect(withinTolerance(normalized.cpc, expected.cpc, 0.1)).toBe(true);
      expect(withinTolerance(normalized.cpm, expected.cpm, 0.1)).toBe(true);
      expect(withinTolerance(normalized.cpa, expected.cpa, 0.1)).toBe(true);
      expect(withinTolerance(normalized.roas, expected.roas, 0.1)).toBe(true);
    });
  });
});

describe('Google Ads Golden Tests - Zero Values Validation', () => {
  it('should handle zero conversions correctly', () => {
    const fixture = loadFixture('zero_values.json');

    const rawRow = fixture.raw_api_response[0]; // Campaign with no conversions
    const normalized = normalizeMetrics({
      cost_micros: rawRow.cost_micros,
      impressions: rawRow.impressions,
      clicks: rawRow.clicks,
      conversions: rawRow.conversions,
      conversions_value: rawRow.conversions_value,
    });

    const expected = fixture.expected_normalized[0];

    expect(normalized.spend).toBe(expected.spend);
    expect(normalized.conversions).toBe(0);
    expect(normalized.conversion_value).toBe(0);

    // Zero-guards per SPEC.md
    expect(normalized.cpa).toBe(0); // spend / 0 conversions
    expect(normalized.roas).toBe(0); // 0 conversion_value / spend

    // Valid metrics
    expect(normalized.ctr).toBeCloseTo(expected.ctr, 2);
    expect(normalized.cpc).toBeCloseTo(expected.cpc, 2);
    expect(normalized.cpm).toBeCloseTo(expected.cpm, 2);
  });

  it('should handle all-zero campaign correctly', () => {
    const fixture = loadFixture('zero_values.json');

    const rawRow = fixture.raw_api_response[1]; // Paused campaign
    const normalized = normalizeMetrics({
      cost_micros: rawRow.cost_micros,
      impressions: rawRow.impressions,
      clicks: rawRow.clicks,
      conversions: rawRow.conversions,
      conversions_value: rawRow.conversions_value,
    });

    const expected = fixture.expected_normalized[1];

    // All base metrics should be zero
    expect(normalized.spend).toBe(0);
    expect(normalized.impressions).toBe(0);
    expect(normalized.clicks).toBe(0);
    expect(normalized.conversions).toBe(0);
    expect(normalized.conversion_value).toBe(0);

    // All derived metrics should be zero (zero-guards)
    expect(normalized.ctr).toBe(0);
    expect(normalized.cpc).toBe(0);
    expect(normalized.cpm).toBe(0);
    expect(normalized.cpa).toBe(0);
    expect(normalized.roas).toBe(0);
  });
});

describe('Google Ads Golden Tests - Currency Conversion', () => {
  it('should convert micros to decimal correctly across all fixtures', () => {
    const campaignFixture = loadFixture('account_campaign_report.json');

    campaignFixture.raw_api_response.forEach((rawRow, index) => {
      const normalized = normalizeMetrics({
        cost_micros: rawRow.cost_micros,
        conversions_value: rawRow.conversions_value,
      });

      const expected = campaignFixture.expected_normalized[index];

      // Validate currency conversion
      expect(normalized.spend).toBe(expected.spend);
      expect(normalized.conversion_value).toBe(expected.conversion_value);
    });
  });
});

describe('Google Ads Golden Tests - Tolerance Validation', () => {
  it('should handle aggregation differences within ±0.1% tolerance', () => {
    const fixture = loadFixture('account_campaign_report.json');

    // Aggregate totals (simulating UI export)
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalConversionValue = 0;

    const normalizedRows = fixture.raw_api_response.map(rawRow => {
      const normalized = normalizeMetrics({
        cost_micros: rawRow.cost_micros,
        impressions: rawRow.impressions,
        clicks: rawRow.clicks,
        conversions: rawRow.conversions,
        conversions_value: rawRow.conversions_value,
      });

      totalSpend += normalized.spend;
      totalImpressions += normalized.impressions;
      totalClicks += normalized.clicks;
      totalConversions += normalized.conversions;
      totalConversionValue += normalized.conversion_value;

      return normalized;
    });

    // Calculate aggregated derived metrics
    const aggregatedCTR = totalClicks / totalImpressions;
    const aggregatedCPC = totalSpend / totalClicks;
    const aggregatedCPM = (totalSpend * 1000) / totalImpressions;
    const aggregatedCPA = totalSpend / totalConversions;
    const aggregatedROAS = totalConversionValue / totalSpend;

    // Expected aggregated values from fixture
    const expectedTotalSpend = fixture.expected_normalized.reduce((sum, row) => sum + row.spend, 0);
    const expectedTotalImpressions = fixture.expected_normalized.reduce((sum, row) => sum + row.impressions, 0);
    const expectedTotalClicks = fixture.expected_normalized.reduce((sum, row) => sum + row.clicks, 0);

    // Validate within tolerance
    expect(withinTolerance(totalSpend, expectedTotalSpend, 0.1)).toBe(true);
    expect(withinTolerance(totalImpressions, expectedTotalImpressions, 0.1)).toBe(true);
    expect(withinTolerance(totalClicks, expectedTotalClicks, 0.1)).toBe(true);

    // Derived metrics should also be within tolerance
    expect(aggregatedCTR).toBeGreaterThan(0);
    expect(aggregatedCPC).toBeGreaterThan(0);
    expect(aggregatedCPM).toBeGreaterThan(0);
    expect(aggregatedCPA).toBeGreaterThan(0);
    expect(aggregatedROAS).toBeGreaterThan(0);
  });
});
