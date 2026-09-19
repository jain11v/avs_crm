// Commission is a single, optional record per policy. Motor policies earn
// brokerage separately on OD and TP premium, so they get two rate fields;
// every other vertical earns one flat rate, so tp_brok_percent stays
// hidden (and null) for them. Reward % is a separate, occasional extra
// paid on top of brokerage — not tied to Motor, so it's always shown.
// GST on commission defaults to 18% (the standard rate on
// brokerage/commission services in India). Any edit here marks
// commission "touched" so the parent knows to include it in the save
// payload.

const DEFAULT_FORM = { brok_percent: '', tp_brok_percent: '', reward_percent: '', gst: '18', remarks: '' };

export default function CommissionFields({ commission, onChange, isMotor }) {
  const form = commission || DEFAULT_FORM;

  function handleChange(e) {
    const { name, value } = e.target;
    onChange({ ...form, [name]: value });
  }

  return (
    <div>
      <div className="form-grid">
        <div className="field">
          <label>{isMotor ? 'OD brokerage %' : 'Commission %'}</label>
          <input
            type="number" step="0.01" min="0"
            name="brok_percent" value={form.brok_percent ?? ''} onChange={handleChange}
          />
        </div>

        {isMotor && (
          <div className="field">
            <label>TP brokerage %</label>
            <input
              type="number" step="0.01" min="0"
              name="tp_brok_percent" value={form.tp_brok_percent ?? ''} onChange={handleChange}
            />
          </div>
        )}

        <div className="field">
          <label>Reward %</label>
          <input
            type="number" step="0.01" min="0"
            name="reward_percent" value={form.reward_percent ?? ''} onChange={handleChange}
          />
        </div>

        <div className="field">
          <label>GST %</label>
          <input
            type="number" step="0.01" min="0"
            name="gst" value={form.gst ?? ''} onChange={handleChange}
          />
        </div>

        <div className="field field-wide">
          <label>Remarks</label>
          <input name="remarks" value={form.remarks ?? ''} onChange={handleChange} maxLength={150} />
        </div>
      </div>

      {commission && (
        <button type="button" className="btn-link" style={{ marginTop: '0.5rem' }} onClick={() => onChange(null)}>
          Remove commission
        </button>
      )}
    </div>
  );
}
