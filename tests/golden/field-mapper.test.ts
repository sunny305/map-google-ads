/**
 * Golden tests for field mapper
 * Tests stable normalization using recorded fixtures
 */

import { mapToStandardizedRow } from '../../src/normalization/field-mapper';
import campaignFixture from '../../fixtures/campaign-report.json';

describe('Field Mapper Golden Tests', () => {
  it('should normalize campaign fixture to standard schema', () => {
    const row = campaignFixture.rows[0];
    const result = mapToStandardizedRow(row);

    // Verify platform s
    expect(result.platform).toBe('google_ads');

    // Verify account fields
    expect(result.account_id).toBe('1234567890');
    expect(result.account_name).toBe('Test Account');
    expect(result.currency).toBe('USD');

    // Verify campaign fields
    expect(result.campaign_id).toBe('9876543210');
    expect(result.campaign_name).toBe('Test Campaign');

    // Verify date
    expect(result.date).toBe('2025-10-01');

    // Verify adset fields (should be null for Google Ads)
    expect(result.adset_id).toBeNull();
    expect(result.adset_name).toBeNull();

    // Verify base metrics (with currency conversion)
    expect(result.spend).toBe(120.5); // 120500000 micros → 120.5
    expect(result.impressions).toBe(25000);
    expect(result.clicks).toBe(430);
    expect(result.conversions).toBe(12);
    expect(result.conversion_value).toBe(1640); // 1640000000 micros → 1640

    // Verify derived metrics
    expect(result.ctr).toBeCloseTo(0.0172, 4); // 430/25000
    expect(result.cpc).toBeCloseTo(0.28, 2); // 120.5/430
    expect(result.cpm).toBeCloseTo(4.82, 2); // (120.5*1000)/25000
    expect(result.cpa).toBeCloseTo(10.04, 2); // 120.5/12
    expect(result.roas).toBeCloseTo(13.61, 2); // 1640/120.5
  });

  it('should handle zero values with zero-guards', () => {
    const row = {
      customer: {
        id: '1234567890',
        descriptive_name: 'Test Account',
        currency_code: 'USD'
      },
      campaign: {
        id: '9876543210',
        name: 'Test Campaign'
      },
      segments: {
        date: '2025-10-01'
      },
      metrics: {
        cost_micros: '100000000',
        impressions: '0',
        clicks: '0',
        conversions: '0',
        conversions_value: '0'
      }
    };

    const result = mapToStandardizedRow(row);

    // Base metrics
    expect(result.spend).toBe(100);
    expect(result.impressions).toBe(0);
    expect(result.clicks).toBe(0);

    // Derived metrics should all be 0 due to zero-guards
    expect(result.ctr).toBe(0);
    expect(result.cpc).toBe(0);
    expect(result.cpm).toBe(0);
    expect(result.cpa).toBe(0);
    expect(result.roas).toBe(0);
  });
});
