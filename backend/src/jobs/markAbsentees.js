const db = require('../config/db');

// A day with no attendance row is "nothing recorded", not "absent" — see
// 018_attendance.sql. This job closes that gap after the fact: any active
// employee with no row for a past day (no check-in, no manual half-day/
// leave/absent mark, no approved-leave row) gets an explicit 'absent' row
// inserted for it. Only Mon-Sat count (Sunday is a standing weekly off);
// today is never touched since the day isn't over yet. Bounded to a
// lookback window rather than an employee's whole joining-to-date history,
// so a dev-machine outage (server not running for a stretch) gets caught
// up without mass-backfilling years of old data the first time this job
// ships.
const LOOKBACK_DAYS = 30;

// "Today" here must agree with the rest of the app (attendanceController's
// todayIsoDate(), same toLocaleDateString('en-CA') pattern) — using
// Postgres's own CURRENT_DATE instead would silently disagree with it
// whenever the DB server's timezone isn't the same as the app's.
function todayIsoDate() {
  return new Date().toLocaleDateString('en-CA');
}

async function markAbsentees() {
  try {
    const today = todayIsoDate();
    const result = await db.query(
      `INSERT INTO attendance (employee_id, date, status)
       SELECT e.id, d::date, 'absent'
       FROM employees e
       CROSS JOIN generate_series($2::date - $1::int, $2::date - 1, INTERVAL '1 day') AS d
       WHERE e.is_active = TRUE
         AND e.date_of_joining <= d::date
         AND (e.date_of_resign IS NULL OR e.date_of_resign >= d::date)
         AND EXTRACT(DOW FROM d) != 0
         AND NOT EXISTS (
           SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.date = d::date
         )
       ON CONFLICT (employee_id, date) DO NOTHING`,
      [LOOKBACK_DAYS, today]
    );
    if (result.rowCount > 0) {
      console.log(`[markAbsentees] marked ${result.rowCount} day(s) absent for missing check-ins`);
    }
  } catch (err) {
    console.error('[markAbsentees] failed:', err.message);
  }
}

function start() {
  markAbsentees();
  setInterval(markAbsentees, 6 * 60 * 60 * 1000);
}

module.exports = { start, markAbsentees };
