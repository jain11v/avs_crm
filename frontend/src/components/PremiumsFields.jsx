// A policy's premium is never typed in directly — it's built from its
// coverage rows. Motor policies split into exactly OD (Own Damage) and TP
// (Third Party); every other vertical has just one net premium row.
// Which slots exist is decided entirely by `isMotor` — there's no picker
// and no way to add/remove a row, so the shape can't drift from what the
// business actually uses.

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeRow(row) {
  const prem = Number(row.prem) || 0;
  const gstPercent = Number(row.gst_percent) || 0;
  const gst = round2(prem * (gstPercent / 100));
  return { prem, gstPercent, gst, final: round2(prem + gst) };
}

export function computeNetPremium(rows) {
  return round2(rows.reduce((sum, r) => sum + computeRow(r).final, 0));
}

const COVERAGE_LABELS = { OD: 'OD', TP: 'TP', NET: 'Net premium' };

function emptyRow(coverage) {
  return { coverage, sum_insured: '', prem_rate: '', prem: '', gst_percent: '', is_third_party: coverage === 'TP' };
}

export default function PremiumsFields({ isMotor, rows, onChange }) {
  const coverageKeys = isMotor ? ['OD', 'TP'] : ['NET'];

  function getRow(coverage) {
    return rows.find((r) => (r.coverage || '').toUpperCase() === coverage) || emptyRow(coverage);
  }

  function updateRow(coverage, field, value) {
    const others = rows.filter((r) => (r.coverage || '').toUpperCase() !== coverage);
    onChange([...others, { ...getRow(coverage), coverage, [field]: value }]);
  }

  const netPremium = computeNetPremium(coverageKeys.map(getRow));

  return (
    <div>
      <div className="modal-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Coverage</th>
              <th>Sum insured</th>
              <th>Rate</th>
              <th>Premium *</th>
              <th>GST %</th>
              <th>GST</th>
              <th>Final</th>
            </tr>
          </thead>
          <tbody>
            {coverageKeys.map((coverage) => {
              const row = getRow(coverage);
              const computed = computeRow(row);
              return (
                <tr key={coverage}>
                  <td><strong>{COVERAGE_LABELS[coverage]}</strong></td>
                  <td>
                    <input
                      className="table-input"
                      type="number" step="0.01" min="0"
                      value={row.sum_insured}
                      onChange={(e) => updateRow(coverage, 'sum_insured', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      value={row.prem_rate || ''}
                      onChange={(e) => updateRow(coverage, 'prem_rate', e.target.value)}
                      placeholder="optional"
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="number" step="0.01" min="0"
                      value={row.prem}
                      onChange={(e) => updateRow(coverage, 'prem', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="number" step="0.01" min="0"
                      value={row.gst_percent}
                      onChange={(e) => updateRow(coverage, 'gst_percent', e.target.value)}
                    />
                  </td>
                  <td>₹{computed.gst.toLocaleString('en-IN')}</td>
                  <td>₹{computed.final.toLocaleString('en-IN')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
        <strong>Net premium: ₹{netPremium.toLocaleString('en-IN')}</strong>
      </div>
    </div>
  );
}
