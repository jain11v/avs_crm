import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

// Headline numbers for the top of the dashboard — a quick "state of the
// business" glance before the task/alert detail below. Which cards show
// up depends entirely on what backend/dashboardController returned
// (itself gated by the same page permissions as everything else), so a
// role with no customers/policies access just sees fewer cards rather
// than an error.
export default function DashboardStats() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get('/dashboard/summary').then((res) => setSummary(res.data)).catch(() => {});
  }, []);

  if (!summary) return null;

  const cards = [
    summary.customers !== undefined && { label: 'Customers', value: summary.customers.toLocaleString('en-IN'), link: '/customers' },
    summary.active_policies !== undefined && { label: 'Active policies', value: summary.active_policies.toLocaleString('en-IN'), link: '/policies' },
    summary.new_policies_this_month !== undefined && { label: 'New policies this month', value: summary.new_policies_this_month.toLocaleString('en-IN'), link: '/policies' },
    summary.premium_this_month !== undefined && { label: 'Premium written this month', value: formatMoney(summary.premium_this_month), link: '/policies' },
    summary.my_lost_leads !== undefined && { label: 'Your lost leads', value: summary.my_lost_leads.toLocaleString('en-IN') },
  ].filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <div className="summary-cards" style={{ marginTop: '1.5rem' }}>
      {cards.map((c) => (
        c.link ? (
          <Link key={c.label} to={c.link} className="summary-card" style={{ textDecoration: 'none' }}>
            <span className="summary-label">{c.label}</span>
            <span className="summary-value">{c.value}</span>
          </Link>
        ) : (
          <div key={c.label} className="summary-card">
            <span className="summary-label">{c.label}</span>
            <span className="summary-value">{c.value}</span>
          </div>
        )
      ))}
    </div>
  );
}
