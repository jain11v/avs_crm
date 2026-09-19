const { validateCommission } = require('../commissionCalc');

describe('validateCommission', () => {
  test('signals skip when the key was not in the request body at all', () => {
    expect(validateCommission(undefined)).toEqual({ skip: true });
  });

  test('signals clear when explicitly set to null (remove existing commission)', () => {
    expect(validateCommission(null)).toEqual({ clear: true });
  });

  test('defaults GST to 18% when not provided', () => {
    const { row } = validateCommission({ brok_percent: 15 });
    expect(row.gst).toBe(18);
  });

  test('honors an explicit GST override, including 0', () => {
    expect(validateCommission({ brok_percent: 15, gst: 12 }).row.gst).toBe(12);
    expect(validateCommission({ brok_percent: 15, gst: 0 }).row.gst).toBe(0);
  });

  test('allows brok_percent/tp_brok_percent to be left unset (null)', () => {
    const { row } = validateCommission({});
    expect(row.brok_percent).toBeNull();
    expect(row.tp_brok_percent).toBeNull();
  });

  test('rejects a negative brokerage percentage', () => {
    const { error } = validateCommission({ brok_percent: -5 });
    expect(error).toMatch(/brokerage/i);
  });

  test('rejects a non-numeric brokerage percentage', () => {
    const { error } = validateCommission({ brok_percent: 'abc' });
    expect(error).toMatch(/brokerage/i);
  });

  test('rejects a negative GST percentage', () => {
    const { error } = validateCommission({ gst: -1 });
    expect(error).toMatch(/gst/i);
  });

  test('carries remarks through, defaulting to null', () => {
    expect(validateCommission({ remarks: 'special rate' }).row.remarks).toBe('special rate');
    expect(validateCommission({}).row.remarks).toBeNull();
  });
});
