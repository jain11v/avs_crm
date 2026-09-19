const { computePremiums, round2 } = require('../premiumCalc');

describe('round2', () => {
  test('rounds to 2 decimal places without floating-point drift', () => {
    expect(round2(1.005)).toBeCloseTo(1.01, 2);
    expect(round2(10.1 + 0.2)).toBe(10.3);
  });
});

describe('computePremiums', () => {
  test('rejects an empty or missing array', () => {
    expect(computePremiums(undefined).error).toMatch(/at least one/i);
    expect(computePremiums([]).error).toMatch(/at least one/i);
  });

  test('rejects a row with no coverage name', () => {
    const { error } = computePremiums([{ coverage: '  ', prem: 100 }]);
    expect(error).toMatch(/coverage name/i);
  });

  test('rejects a negative or non-numeric premium', () => {
    expect(computePremiums([{ coverage: 'OD', prem: -1 }]).error).toMatch(/valid premium/i);
    expect(computePremiums([{ coverage: 'OD', prem: 'abc' }]).error).toMatch(/valid premium/i);
  });

  test('rejects a negative GST %', () => {
    const { error } = computePremiums([{ coverage: 'OD', prem: 100, gst_percent: -5 }]);
    expect(error).toMatch(/valid gst/i);
  });

  test('computes GST and net premium for a single row', () => {
    const { rows, netPremium, error } = computePremiums([
      { coverage: 'Own Damage', prem: 8000, gst_percent: 18 },
    ]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ coverage: 'Own Damage', prem: 8000, gst_percent: 18, gst: 1440 });
    expect(netPremium).toBe(9440);
  });

  test('sums multiple coverage rows into net premium', () => {
    const { rows, netPremium } = computePremiums([
      { coverage: 'OD', prem: 8000, gst_percent: 18 },
      { coverage: 'TP', prem: 2000, gst_percent: 0 },
    ]);
    expect(rows).toHaveLength(2);
    // 8000 + 1440 (18% GST) + 2000 + 0 = 11440
    expect(netPremium).toBe(11440);
  });

  test('defaults GST % to 0 when omitted, and preserves the is_third_party flag', () => {
    const { rows } = computePremiums([
      { coverage: 'TP', prem: 2000, is_third_party: true },
      { coverage: 'OD', prem: 8000 },
    ]);
    expect(rows[0]).toMatchObject({ gst_percent: 0, gst: 0, is_third_party: true });
    expect(rows[1].is_third_party).toBe(false);
  });

  test('treats a blank sum_insured as null rather than 0', () => {
    const { rows } = computePremiums([{ coverage: 'OD', prem: 100, sum_insured: '' }]);
    expect(rows[0].sum_insured).toBeNull();
  });
});
