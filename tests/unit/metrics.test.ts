/**
 * Unit tests for metrics calculations
 * Tests zero-guards, currency conversion, and derived metrics
 */

import {
  microsToDecimal,
  calculateCTR,
  calculateCPC,
  calculateCPM,
  calculateCPA,
  calculateROAS,
  normalizeMetrics,
  roundMetric
} from '../../src/normalization/metrics';

describe('Metrics Normalization', () => {
  describe('microsToDecimal', () => {
    it('should convert micros to decimal correctly', () => {
      expect(microsToDecimal(1000000)).toBe(1);
      expect(microsToDecimal(5500000)).toBe(5.5);
      expect(microsToDecimal(123456789)).toBe(123.456789);
    });

    it('should handle zero', () => {
      expect(microsToDecimal(0)).toBe(0);
    });

    it('should handle undefined and null', () => {
      expect(microsToDecimal(undefined)).toBe(0);
      expect(microsToDecimal(null as any)).toBe(0);
    });

    it('should handle string inputs', () => {
      expect(microsToDecimal('1000000')).toBe(1);
      expect(microsToDecimal('5500000')).toBe(5.5);
    });
  });

  describe('calculateCTR', () => {
    it('should calculate CTR correctly', () => {
      expect(calculateCTR(100, 1000)).toBe(0.1);
      expect(calculateCTR(50, 2000)).toBe(0.025);
    });

    it('should return 0 when impressions is 0 (zero-guard)', () => {
      expect(calculateCTR(100, 0)).toBe(0);
    });

    it('should return 0 when clicks is 0', () => {
      expect(calculateCTR(0, 1000)).toBe(0);
    });
  });

  describe('calculateCPC', () => {
    it('should calculate CPC correctly', () => {
      expect(calculateCPC(100, 50)).toBe(2);
      expect(calculateCPC(250, 100)).toBe(2.5);
    });

    it('should return 0 when clicks is 0 (zero-guard)', () => {
      expect(calculateCPC(100, 0)).toBe(0);
    });

    it('should return 0 when spend is 0', () => {
      expect(calculateCPC(0, 100)).toBe(0);
    });
  });

  describe('calculateCPM', () => {
    it('should calculate CPM correctly', () => {
      expect(calculateCPM(100, 10000)).toBe(10);
      expect(calculateCPM(50, 25000)).toBe(2);
    });

    it('should return 0 when impressions is 0 (zero-guard)', () => {
      expect(calculateCPM(100, 0)).toBe(0);
    });

    it('should return 0 when spend is 0', () => {
      expect(calculateCPM(0, 10000)).toBe(0);
    });
  });

  describe('calculateCPA', () => {
    it('should calculate CPA correctly', () => {
      expect(calculateCPA(100, 10)).toBe(10);
      expect(calculateCPA(250, 25)).toBe(10);
    });

    it('should return 0 when conversions is 0 (zero-guard)', () => {
      expect(calculateCPA(100, 0)).toBe(0);
    });

    it('should return 0 when spend is 0', () => {
      expect(calculateCPA(0, 10)).toBe(0);
    });
  });

  describe('calculateROAS', () => {
    it('should calculate ROAS correctly', () => {
      expect(calculateROAS(500, 100)).toBe(5);
      expect(calculateROAS(1000, 250)).toBe(4);
    });

    it('should return 0 when spend is 0 (zero-guard)', () => {
      expect(calculateROAS(500, 0)).toBe(0);
    });

    it('should return 0 when conversion_value is 0', () => {
      expect(calculateROAS(0, 100)).toBe(0);
    });
  });

  describe('normalizeMetrics', () => {
    it('should normalize all metrics correctly', () => {
      const raw = {
        cost_micros: 100000000, // $100
        impressions: 10000,
        clicks: 500,
        conversions: 10,
        conversions_value: 500000000 // $500
      };

      const result = normalizeMetrics(raw);

      expect(result.spend).toBe(100);
      expect(result.impressions).toBe(10000);
      expect(result.clicks).toBe(500);
      expect(result.conversions).toBe(10);
      expect(result.conversion_value).toBe(500);
      expect(result.ctr).toBe(0.05); // 500/10000
      expect(result.cpc).toBe(0.2); // 100/500
      expect(result.cpm).toBe(10); // (100*1000)/10000
      expect(result.cpa).toBe(10); // 100/10
      expect(result.roas).toBe(5); // 500/100
    });

    it('should handle missing fields', () => {
      const raw = {};
      const result = normalizeMetrics(raw);

      expect(result.spend).toBe(0);
      expect(result.impressions).toBe(0);
      expect(result.clicks).toBe(0);
      expect(result.conversions).toBe(0);
      expect(result.conversion_value).toBe(0);
      expect(result.ctr).toBe(0);
      expect(result.cpc).toBe(0);
      expect(result.cpm).toBe(0);
      expect(result.cpa).toBe(0);
      expect(result.roas).toBe(0);
    });

    it('should apply zero-guards for all derived metrics', () => {
      const raw = {
        cost_micros: 100000000,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversions_value: 0
      };

      const result = normalizeMetrics(raw);

      // All derived metrics should be 0 due to zero-guards
      expect(result.ctr).toBe(0);
      expect(result.cpc).toBe(0);
      expect(result.cpm).toBe(0);
      expect(result.cpa).toBe(0);
      expect(result.roas).toBe(0);
    });
  });

  describe('roundMetric', () => {
    it('should round to 2 decimals by default', () => {
      expect(roundMetric(1.23456)).toBe(1.23);
      expect(roundMetric(10.9876)).toBe(10.99);
    });

    it('should round to specified decimals', () => {
      expect(roundMetric(1.23456, 3)).toBe(1.235);
      expect(roundMetric(1.23456, 1)).toBe(1.2);
      expect(roundMetric(1.23456, 0)).toBe(1);
    });

    it('should handle edge cases', () => {
      expect(roundMetric(0)).toBe(0);
      expect(roundMetric(0.005)).toBe(0.01);
      expect(roundMetric(0.004)).toBe(0);
    });
  });
});

/**
 * Additional comprehensive tests per Terminal 4 requirements
 */
describe('Metrics Edge Cases - Terminal 4 Requirements', () => {
  describe('Small values', () => {
    it('should handle very small spend with single click', () => {
      const result = normalizeMetrics({
        cost_micros: 1000, // $0.001
        impressions: 100,
        clicks: 1,
        conversions: 1,
        conversions_value: 10_000_000, // $10
      });

      expect(result.spend).toBe(0.001);
      expect(result.cpc).toBe(0.001);
      expect(result.roas).toBe(10000);
    });

    it('should handle fractional conversions', () => {
      const result = normalizeMetrics({
        cost_micros: 50_000_000,
        impressions: 1000,
        clicks: 25,
        conversions: 0.5,
        conversions_value: 75_000_000,
      });

      expect(result.cpa).toBe(100); // 50/0.5
      expect(result.roas).toBe(1.5); // 75/50
    });

    it('should handle micro spend per click', () => {
      const result = normalizeMetrics({
        cost_micros: 10_000, // $0.01
        impressions: 1000,
        clicks: 100,
        conversions: 1,
        conversions_value: 5_000_000, // $5
      });

      expect(result.spend).toBe(0.01);
      expect(result.cpc).toBe(0.0001);
      expect(result.ctr).toBe(0.1);
      expect(result.roas).toBe(500);
    });
  });

  describe('Large values (extreme volumes)', () => {
    it('should handle million impressions', () => {
      const result = normalizeMetrics({
        cost_micros: 10_000_000_000, // $10,000
        impressions: 1_000_000,
        clicks: 50_000,
        conversions: 1_000,
        conversions_value: 50_000_000_000, // $50,000
      });

      expect(result.spend).toBe(10_000);
      expect(result.impressions).toBe(1_000_000);
      expect(result.clicks).toBe(50_000);
      expect(result.conversions).toBe(1_000);
      expect(result.conversion_value).toBe(50_000);
      expect(result.ctr).toBe(0.05);
      expect(result.cpc).toBe(0.2);
      expect(result.cpm).toBe(10);
      expect(result.cpa).toBe(10);
      expect(result.roas).toBe(5);
    });

    it('should handle very large spend', () => {
      const result = normalizeMetrics({
        cost_micros: 999_999_990_000, // $999,999.99
        impressions: 10_000_000,
        clicks: 500_000,
        conversions: 10_000,
        conversions_value: 5_000_000_000_000, // $5,000,000
      });

      expect(result.spend).toBe(999999.99);
      expect(result.conversion_value).toBe(5_000_000);
      expect(result.cpc).toBeCloseTo(2, 2);
      expect(result.roas).toBeCloseTo(5000.000005, 4);
    });

    it('should handle high ROAS campaign', () => {
      const result = normalizeMetrics({
        cost_micros: 1_000_000_000, // $1,000
        impressions: 100_000,
        clicks: 5_000,
        conversions: 500,
        conversions_value: 25_000_000_000, // $25,000
      });

      expect(result.roas).toBe(25);
      expect(result.cpa).toBe(2);
    });
  });

  describe('Currency micros edge cases', () => {
    it('should convert standard amount', () => {
      expect(microsToDecimal(100_000_000)).toBe(100);
    });

    it('should convert very small amount (1 micro)', () => {
      expect(microsToDecimal(1)).toBe(0.000001);
    });

    it('should convert fractional cents', () => {
      expect(microsToDecimal(12_345)).toBe(0.012345);
    });

    it('should convert large amount', () => {
      expect(microsToDecimal(999_999_999_999)).toBe(999_999.999999);
    });

    it('should handle zero', () => {
      expect(microsToDecimal(0)).toBe(0);
    });

    it('should handle negative (if API returns)', () => {
      // Note: API shouldn't return negative, but test defensively
      expect(microsToDecimal(-1_000_000)).toBe(-1);
    });
  });

  describe('Specific zero-guard scenarios', () => {
    it('should handle zero impressions with spend and conversions', () => {
      const result = normalizeMetrics({
        cost_micros: 100_000_000,
        impressions: 0,
        clicks: 0,
        conversions: 5,
        conversions_value: 500_000_000,
      });

      expect(result.ctr).toBe(0); // zero-guard: clicks/0
      expect(result.cpm).toBe(0); // zero-guard: spend*1000/0
      expect(result.cpa).toBe(20); // valid: 100/5
      expect(result.roas).toBe(5); // valid: 500/100
    });

    it('should handle zero clicks with impressions', () => {
      const result = normalizeMetrics({
        cost_micros: 100_000_000,
        impressions: 1_000,
        clicks: 0,
        conversions: 0,
        conversions_value: 0,
      });

      expect(result.ctr).toBe(0);
      expect(result.cpc).toBe(0); // zero-guard: spend/0
      expect(result.cpm).toBe(100); // valid: 100*1000/1000
    });

    it('should handle zero spend with activity', () => {
      const result = normalizeMetrics({
        cost_micros: 0,
        impressions: 1_000,
        clicks: 50,
        conversions: 5,
        conversions_value: 500_000_000,
      });

      expect(result.ctr).toBe(0.05); // valid: 50/1000
      expect(result.cpc).toBe(0); // valid: 0/50
      expect(result.cpm).toBe(0); // valid: 0*1000/1000
      expect(result.cpa).toBe(0); // valid: 0/5
      expect(result.roas).toBe(0); // zero-guard: 500/0
    });

    it('should handle all zeros', () => {
      const result = normalizeMetrics({
        cost_micros: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversions_value: 0,
      });

      expect(result.spend).toBe(0);
      expect(result.impressions).toBe(0);
      expect(result.clicks).toBe(0);
      expect(result.conversions).toBe(0);
      expect(result.conversion_value).toBe(0);
      expect(result.ctr).toBe(0);
      expect(result.cpc).toBe(0);
      expect(result.cpm).toBe(0);
      expect(result.cpa).toBe(0);
      expect(result.roas).toBe(0);
    });
  });

  describe('Precision and rounding', () => {
    it('should maintain precision for CTR', () => {
      expect(calculateCTR(1, 3)).toBeCloseTo(0.333333, 5);
      expect(calculateCTR(2, 7)).toBeCloseTo(0.285714, 5);
    });

    it('should maintain precision for ROAS', () => {
      expect(calculateROAS(1000, 3)).toBeCloseTo(333.333333, 4);
    });

    it('should handle rounding edge cases', () => {
      expect(roundMetric(1.9999, 2)).toBe(2);
      expect(roundMetric(1.9949, 2)).toBe(1.99);
      expect(roundMetric(1.9951, 2)).toBe(2);
    });
  });

  describe('String input handling', () => {
    it('should handle all string inputs', () => {
      const result = normalizeMetrics({
        cost_micros: '100000000',
        impressions: '10000',
        clicks: '500',
        conversions: '25',
        conversions_value: '1250000000',
      });

      expect(result.spend).toBe(100);
      expect(result.impressions).toBe(10_000);
      expect(result.clicks).toBe(500);
      expect(result.conversions).toBe(25);
      expect(result.conversion_value).toBe(1250);
    });

    it('should handle mixed string and number inputs', () => {
      const result = normalizeMetrics({
        cost_micros: '100000000',
        impressions: 10000,
        clicks: '500',
        conversions: 25,
        conversions_value: '1250000000',
      });

      expect(result.spend).toBe(100);
      expect(result.ctr).toBe(0.05);
    });

    it('should handle invalid strings gracefully', () => {
      const result = normalizeMetrics({
        cost_micros: 'invalid',
        impressions: 'bad',
        clicks: 'wrong',
        conversions: 'nope',
        conversions_value: 'error',
      });

      // All should default to 0 and zero-guards apply
      expect(result.spend).toBe(0);
      expect(result.impressions).toBe(0);
      expect(result.clicks).toBe(0);
      expect(result.conversions).toBe(0);
      expect(result.conversion_value).toBe(0);
      expect(result.ctr).toBe(0);
      expect(result.cpc).toBe(0);
      expect(result.cpm).toBe(0);
      expect(result.cpa).toBe(0);
      expect(result.roas).toBe(0);
    });
  });
});
