// Only the pure commission-math export is under test here — requiring the
// controller also constructs the shared pg Pool (via ../config/db), but
// constructing a Pool doesn't open a connection until a query actually
// runs, so this needs no live database.
const { computeExpectedCommission, round2 } = require('../commissionReconciliationController');

describe('round2', () => {
  test('rounds without floating-point drift', () => {
    expect(round2(1132.7999999)).toBeCloseTo(1132.8, 2);
  });
});

describe('computeExpectedCommission', () => {
  test('brok_percent applies to the whole premium when nothing is TP-flagged', () => {
    // Matches the real scenario verified live: 8000 premium, 12% brokerage, 18% GST.
    const result = computeExpectedCommission({
      non_tp_premium: 8000, tp_premium: 0, brok_percent: 12, tp_brok_percent: null, commission_gst_percent: 18,
    });
    expect(result.pretax).toBe(960);
    expect(result.gstAmount).toBe(172.8);
    expect(result.total).toBe(1132.8);
  });

  test('splits OD and TP premium at their own rates', () => {
    // Matches the real scenario verified live: 8000 OD @15%, 2000 TP @5%, 18% GST.
    const result = computeExpectedCommission({
      non_tp_premium: 8000, tp_premium: 2000, brok_percent: 15, tp_brok_percent: 5, commission_gst_percent: 18,
    });
    // 8000*0.15 + 2000*0.05 = 1200 + 100 = 1300; +18% GST = 1534
    expect(result.pretax).toBe(1300);
    expect(result.total).toBe(1534);
  });

  test('TP premium falls back to brok_percent when tp_brok_percent is unset', () => {
    const withFallback = computeExpectedCommission({
      non_tp_premium: 5000, tp_premium: 1000, brok_percent: 10, tp_brok_percent: null, commission_gst_percent: 0,
    });
    const allAtBrokPercent = computeExpectedCommission({
      non_tp_premium: 6000, tp_premium: 0, brok_percent: 10, tp_brok_percent: null, commission_gst_percent: 0,
    });
    expect(withFallback.pretax).toBe(allAtBrokPercent.pretax);
  });

  test('GST defaults to 18% when not set on the commission row', () => {
    const result = computeExpectedCommission({
      non_tp_premium: 1000, tp_premium: 0, brok_percent: 10, tp_brok_percent: null, commission_gst_percent: null,
    });
    expect(result.gstPercent).toBe(18);
    expect(result.total).toBe(118); // 100 pretax + 18% GST
  });

  test('a policy with no commission set (all null/zero) expects zero', () => {
    const result = computeExpectedCommission({
      non_tp_premium: 8000, tp_premium: 0, brok_percent: null, tp_brok_percent: null, commission_gst_percent: 18,
    });
    expect(result.total).toBe(0);
  });

  test('reward_percent applies to the whole premium (non-TP + TP combined), on top of brokerage', () => {
    // 8000 OD @15%, 2000 TP @5%, plus 2% reward on the full 10000, 18% GST.
    // Brokerage: 8000*0.15 + 2000*0.05 = 1300. Reward: 10000*0.02 = 200. Pretax = 1500; +18% GST = 1770.
    const result = computeExpectedCommission({
      non_tp_premium: 8000, tp_premium: 2000, brok_percent: 15, tp_brok_percent: 5, reward_percent: 2, commission_gst_percent: 18,
    });
    expect(result.pretax).toBe(1500);
    expect(result.total).toBe(1770);
  });

  test('reward_percent is optional and defaults to zero when unset', () => {
    const withoutReward = computeExpectedCommission({
      non_tp_premium: 8000, tp_premium: 0, brok_percent: 12, tp_brok_percent: null, reward_percent: null, commission_gst_percent: 18,
    });
    expect(withoutReward.total).toBe(1132.8);
  });
});
