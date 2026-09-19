const { diffFields } = require('../auditLog');

// diffFields/normalize exist specifically because of a real bug found in
// this app: pg's DATE parser returns a JS Date built from local server
// time, and naively comparing that against a plain 'YYYY-MM-DD' string
// from a request body reported a change that never happened — and did so
// asymmetrically depending on the server's timezone offset from UTC. That
// bug silently corrupted policy_start_date/policy_end_date on every edit
// before it was caught. These cases pin the fix down.

describe('diffFields', () => {
  test('a JS Date and the equivalent plain date string are not a change', () => {
    // Date constructed the way pg's own type parser builds it: local
    // calendar fields, not UTC.
    const asDate = new Date(2026, 8, 18); // 18 Sep 2026, local midnight
    const changes = diffFields({ policy_start_date: asDate }, { policy_start_date: '2026-09-18' }, ['policy_start_date']);
    expect(changes).toEqual({});
  });

  test('a genuinely different date is still detected as a change', () => {
    const asDate = new Date(2026, 8, 18);
    const changes = diffFields({ policy_start_date: asDate }, { policy_start_date: '2026-09-19' }, ['policy_start_date']);
    expect(changes.policy_start_date).toEqual({ from: asDate, to: '2026-09-19' });
  });

  test('a full ISO timestamp and a bare date string for the same day are not a change', () => {
    const changes = diffFields(
      { d: '2026-09-18T00:00:00.000Z' },
      { d: '2026-09-18' },
      ['d']
    );
    expect(changes).toEqual({});
  });

  test('a numeric-string from pg ("5000.00") and a JS number (5000) are not a change', () => {
    const changes = diffFields({ premium_amount: '5000.00' }, { premium_amount: 5000 }, ['premium_amount']);
    expect(changes).toEqual({});
  });

  test('a genuinely different amount is still detected, even with mixed types', () => {
    const changes = diffFields({ premium_amount: '5000.00' }, { premium_amount: 5200 }, ['premium_amount']);
    expect(changes.premium_amount).toEqual({ from: '5000.00', to: 5200 });
  });

  test('null/undefined/empty-string are treated as the same "no value"', () => {
    expect(diffFields({ remarks: null }, { remarks: undefined }, ['remarks'])).toEqual({});
    expect(diffFields({ remarks: '' }, { remarks: null }, ['remarks'])).toEqual({});
  });

  test('create (before: null) reports every populated field as from: null', () => {
    const changes = diffFields(null, { status: 'Active', premium_amount: 5000 }, ['status', 'premium_amount']);
    expect(changes).toEqual({
      status: { from: null, to: 'Active' },
      premium_amount: { from: null, to: 5000 },
    });
  });

  test('delete (after: null) reports every prior field as to: null', () => {
    const changes = diffFields({ status: 'Active' }, null, ['status']);
    expect(changes).toEqual({ status: { from: 'Active', to: null } });
  });

  test('only fields in the given list are compared, even if other fields differ', () => {
    const changes = diffFields({ a: 1, b: 'x' }, { a: 1, b: 'y' }, ['a']);
    expect(changes).toEqual({});
  });

  test('a non-numeric string is compared literally, not coerced', () => {
    const changes = diffFields({ policy_number: 'ABC-001' }, { policy_number: 'ABC-002' }, ['policy_number']);
    expect(changes.policy_number).toEqual({ from: 'ABC-001', to: 'ABC-002' });
  });
});
