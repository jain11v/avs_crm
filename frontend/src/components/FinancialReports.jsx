import { useEffect, useState } from 'react';
import api from '../api/axios';

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function formatMonth(monthValue) {
  return new Date(monthValue).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

const PERIODS = [
  { key: '1m', label: 'This month' },
  { key: '6m', label: 'Last 6 months' },
  { key: '12m', label: 'Last 12 months' },
];

function periodRange(key) {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const start = new Date(today);
  if (key === '1m') start.setDate(1);
  else if (key === '6m') start.setMonth(start.getMonth() - 5, 1);
  else start.setMonth(start.getMonth() - 11, 1);
  return { from: start.toISOString().slice(0, 10), to };
}

const BAR_HEIGHT = 110;

// Company-wide financial overview for the dashboard — P&L, cash flow,
// revenue trend, expense by category. Gated by the 'financial_reports'
// permission (Dashboard.jsx only renders this when hasPermission() is
// true), so whether this shows up at all is already decided by the time
// it mounts. All figures are cash-basis, built from the same `transactions`
// ledger every other money page in the app reads from.
export default function FinancialReports() {
  const [period, setPeriod] = useState('12m');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const { from, to } = periodRange(period);
    api.get('/financial-reports/summary', { params: { from, to } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load financial reports.'));
  }, [period]);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <p className="subtitle">Loading…</p>;

  const { pnl, cashflow, revenue_trend: revenueTrend, expense_by_category: expenseByCategory } = data;
  const trendMax = Math.max(1, ...revenueTrend.map((r) => r.amount));
  const cashflowMax = Math.max(1, ...cashflow.flatMap((c) => [c.inflow, c.outflow]));
  const categoryMax = Math.max(1, ...expenseByCategory.map((c) => c.amount));

  return (
    <>
      <div className="dashboard-section-header">
        <h3>Financials</h3>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <span className="summary-label">Revenue (commission received)</span>
          <span className="summary-value">{formatMoney(pnl.revenue)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Cashback paid</span>
          <span className="summary-value">{formatMoney(pnl.cashback)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Expenses</span>
          <span className="summary-value">{formatMoney(pnl.expenses)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Net</span>
          <span className="summary-value" style={{ color: pnl.net >= 0 ? '#256b46' : 'var(--danger)' }}>
            {formatMoney(pnl.net)}
          </span>
        </div>
      </div>

      <div className="financial-charts">
        <div className="financial-chart-block">
          <h4>Revenue trend</h4>
          <div className="bar-chart">
            {revenueTrend.map((r) => (
              <div key={r.month} className="bar-chart-col" title={`${formatMonth(r.month)}: ${formatMoney(r.amount)}`}>
                <div className="bar-chart-bar" style={{ height: `${Math.round((r.amount / trendMax) * BAR_HEIGHT)}px` }} />
              </div>
            ))}
          </div>
          <div className="bar-chart-labels">
            {revenueTrend.map((r) => <span key={r.month}>{formatMonth(r.month)}</span>)}
          </div>
        </div>

        <div className="financial-chart-block">
          <h4>Cash flow</h4>
          <div className="bar-chart">
            {cashflow.map((c) => (
              <div key={c.month} className="bar-chart-col" title={`${formatMonth(c.month)}: in ${formatMoney(c.inflow)} / out ${formatMoney(c.outflow)}`}>
                <div className="bar-chart-group">
                  <div className="bar-chart-bar bar-chart-bar-in" style={{ height: `${Math.round((c.inflow / cashflowMax) * BAR_HEIGHT)}px` }} />
                  <div className="bar-chart-bar bar-chart-bar-out" style={{ height: `${Math.round((c.outflow / cashflowMax) * BAR_HEIGHT)}px` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="bar-chart-labels">
            {cashflow.map((c) => <span key={c.month}>{formatMonth(c.month)}</span>)}
          </div>
          <div className="bar-chart-legend">
            <span><i className="legend-dot legend-dot-in" />Inflow</span>
            <span><i className="legend-dot legend-dot-out" />Outflow</span>
          </div>
        </div>
      </div>

      <div className="financial-chart-block">
        <h4>Expense by category</h4>
        {expenseByCategory.length === 0 ? (
          <p className="subtitle">No expenses in this period.</p>
        ) : (
          <div className="category-bars">
            {expenseByCategory.map((c) => (
              <div key={c.head} className="category-bar-row">
                <span className="category-bar-label">{c.head}</span>
                <div className="category-bar-track">
                  <div className="category-bar-fill" style={{ width: `${(c.amount / categoryMax) * 100}%` }} />
                </div>
                <span className="category-bar-value">{formatMoney(c.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
