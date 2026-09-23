import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import CustomerPicker from '../components/CustomerPicker';
import PremiumsFields, { computeNetPremium } from '../components/PremiumsFields';
import CommissionFields from '../components/CommissionFields';
import RiskDetailsModal from '../components/RiskDetailsModal';
import DocumentsPanel from '../components/DocumentsPanel';
import { getRiskFields } from '../riskSchemas';
import { useAuth } from '../context/AuthContext';
import { uploadFiles } from '../utils/uploadFiles';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// One year of cover, expressed the way insurance policies actually run:
// same date next year, minus a day (e.g. 18 Sep 2026 -> 17 Sep 2027).
function oneYearCoverEndIsoDate(fromIsoDate) {
  const d = new Date(fromIsoDate);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function addOneDayIso(fromIsoDate) {
  const d = new Date(fromIsoDate);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// A new policy defaults to starting today and running a year — both stay
// editable, this just saves re-typing the common case. Type of business
// defaults to 'new' here and is never hand-picked — it's set to 'old' on
// the renewal-prefill path below instead. Status isn't entered here at
// all; the backend always creates a policy as 'Active' — it only ever
// becomes 'Renewed' or 'Not Renewed' later, from the Renewals page.
// Assigned employee isn't entered here either — the backend sets it to
// whoever is creating the policy (see policyController.create).
function getEmptyForm() {
  const start = todayIsoDate();
  return {
    policy_number: '',
    customer_id: '',
    customer_label: '',
    insurer_id: '',
    insurer_branch_id: '',
    vertical_id: '',
    sub_vertical_id: '',
    type_of_business: 'new',
    sum_insured: '',
    policy_start_date: start,
    policy_end_date: oneYearCoverEndIsoDate(start),
    renewable: true,
    issued_from_branch_id: '',
    telecaller: '',
    remarks: '',
  };
}

const EMPTY_PAYMENT_FORM = {
  customer_amount: '',
  customer_bank_account_id: '',
  customer_payment_date: todayIsoDate(),
  customer_reference_id: '',

  insurer_bank_account_id: '',
  insurer_payment_date: todayIsoDate(),
  insurer_reference_id: '',

  adjustment_type: 'discount',
  adjustment_amount: '',
  adjustment_bank_account_id: '',
  adjustment_remarks: '',
};

export default function PolicyForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { employee } = useAuth();
  const isChecker = employee?.role === 'admin' || employee?.is_elevated;
  const [searchParams] = useSearchParams();
  const renewFromId = !isEdit ? searchParams.get('renew_from') : null;

  const [form, setForm] = useState(getEmptyForm);
  const [insurers, setInsurers] = useState([]);
  const [insurerBranches, setInsurerBranches] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [subVerticals, setSubVerticals] = useState([]);
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [premiumRows, setPremiumRows] = useState([]);
  const [commission, setCommission] = useState(null);
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [riskDetails, setRiskDetails] = useState({});
  const [riskDetailsModalOpen, setRiskDetailsModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [loading, setLoading] = useState(isEdit || Boolean(renewFromId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [renewSource, setRenewSource] = useState(null);
  const [renewedFrom, setRenewedFrom] = useState(null);
  const [renewedTo, setRenewedTo] = useState(null);
  const [openTasks, setOpenTasks] = useState([]);
  const [fromTaskId, setFromTaskId] = useState('');

  useEffect(() => {
    api.get('/lookups/insurers').then((res) => setInsurers(res.data));
    api.get('/lookups/verticals').then((res) => setVerticals(res.data));
    api.get('/lookups/branches').then((res) => setBranches(res.data));
    api.get('/lookups/employees').then((res) => setEmployees(res.data));
    if (!isEdit) {
      api.get('/lookups/bank-accounts').then((res) => setBankAccounts(res.data));
      api.get('/tasks/mine').then((res) => setOpenTasks(res.data.filter((t) => t.outcome === 'pending')));
    }
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/policies/${id}`)
      .then((res) => {
        const p = res.data;
        setForm({
          policy_number: p.policy_number || '',
          customer_id: p.customer_id || '',
          customer_label: p.customer_name || '',
          insurer_id: p.insurer_id || '',
          insurer_branch_id: p.insurer_branch_id || '',
          vertical_id: p.vertical_id || '',
          sub_vertical_id: p.sub_vertical_id || '',
          type_of_business: p.type_of_business || 'new',
          sum_insured: p.sum_insured || '',
          policy_start_date: p.policy_start_date ? p.policy_start_date.slice(0, 10) : '',
          policy_end_date: p.policy_end_date ? p.policy_end_date.slice(0, 10) : '',
          renewable: p.renewable ?? true,
          issued_from_branch_id: p.issued_from_branch_id || '',
          telecaller: p.telecaller || '',
          remarks: p.remarks || '',
        });
        setRiskDetails(p.risk_details || {});
        setRenewedFrom(p.renewed_from_id ? { id: p.renewed_from_id, policy_number: p.renewed_from_policy_number } : null);
        setRenewedTo(p.renewed_to_id ? { id: p.renewed_to_id, policy_number: p.renewed_to_policy_number } : null);
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load policy.'))
      .finally(() => setLoading(false));
    api.get('/premiums', { params: { policy_id: id } }).then((res) => setPremiumRows(res.data));
    api.get('/commission', { params: { policy_id: id } }).then((res) => setCommission(res.data));
  }, [id, isEdit]);

  // Renewing: pre-fill from the source policy — customer, insurer, coverage
  // and commission carry over, dates roll forward a year, and the policy
  // number is left blank since it's a new number from the insurer.
  useEffect(() => {
    if (isEdit || !renewFromId) return;
    Promise.all([
      api.get(`/policies/${renewFromId}`),
      api.get('/premiums', { params: { policy_id: renewFromId } }),
      api.get('/commission', { params: { policy_id: renewFromId } }),
    ])
      .then(([policyRes, premiumsRes, commissionRes]) => {
        const p = policyRes.data;
        const start = p.policy_end_date ? addOneDayIso(p.policy_end_date.slice(0, 10)) : todayIsoDate();
        setForm((f) => ({
          ...f,
          customer_id: p.customer_id || '',
          customer_label: p.customer_name || '',
          insurer_id: p.insurer_id || '',
          insurer_branch_id: p.insurer_branch_id || '',
          vertical_id: p.vertical_id || '',
          sub_vertical_id: p.sub_vertical_id || '',
          type_of_business: 'old',
          sum_insured: p.sum_insured || '',
          policy_start_date: start,
          policy_end_date: oneYearCoverEndIsoDate(start),
          renewable: true,
          issued_from_branch_id: p.issued_from_branch_id || '',
          telecaller: p.telecaller || '',
        }));
        setPremiumRows(
          premiumsRes.data.map((r) => ({
            coverage: r.coverage,
            sum_insured: r.sum_insured ?? '',
            prem_rate: r.prem_rate ?? '',
            prem: r.prem,
            gst_percent: r.gst_percent ?? '',
            is_third_party: r.is_third_party,
          }))
        );
        if (commissionRes.data) {
          setCommission(commissionRes.data);
          setCommissionTouched(true);
        }
        setRiskDetails(p.risk_details || {});
        setRenewSource({ id: p.id, policy_number: p.policy_number, policy_end_date: p.policy_end_date });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load the policy to renew.'))
      .finally(() => setLoading(false));
  }, [isEdit, renewFromId]);

  // Cascade: insurer -> its branches
  useEffect(() => {
    if (!form.insurer_id) {
      setInsurerBranches([]);
      return;
    }
    api.get('/lookups/insurer-branches', { params: { insurer_id: form.insurer_id } }).then((res) => {
      setInsurerBranches(res.data);
    });
  }, [form.insurer_id]);

  // Cascade: vertical -> its sub-verticals
  useEffect(() => {
    if (!form.vertical_id) {
      setSubVerticals([]);
      return;
    }
    api.get('/lookups/sub-verticals', { params: { vertical_id: form.vertical_id } }).then((res) => {
      setSubVerticals(res.data);
    });
  }, [form.vertical_id]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setForm((f) => ({
      ...f,
      [name]: val,
      ...(name === 'insurer_id' ? { insurer_branch_id: '' } : {}),
      ...(name === 'vertical_id' ? { sub_vertical_id: '' } : {}),
    }));
    if (name === 'vertical_id' || name === 'sub_vertical_id') {
      setRiskDetails({});
    }
    // Premium/commission shape (OD+TP vs a single net figure) is decided by
    // whether the vertical is Motor — switching away from/into Motor drops
    // whichever rows no longer apply rather than leaving mismatched data
    // sitting in state unseen.
    if (name === 'vertical_id') {
      const nowMotor = verticals.find((v) => String(v.id) === String(value))?.name === 'Motor';
      const validCoverages = nowMotor ? ['OD', 'TP'] : ['NET'];
      setPremiumRows((rows) => rows.filter((r) => validCoverages.includes((r.coverage || '').toUpperCase())));
      if (!nowMotor) {
        setCommission((c) => (c ? { ...c, tp_brok_percent: null } : c));
      }
    }
  }

  const selectedVertical = verticals.find((v) => String(v.id) === String(form.vertical_id));
  const isMotor = selectedVertical?.name === 'Motor';
  const selectedSubVertical = subVerticals.find((sv) => String(sv.id) === String(form.sub_vertical_id));
  const riskFields = selectedSubVertical ? getRiskFields(selectedSubVertical.name) : null;
  const riskDetailsFilledCount = riskFields
    ? riskFields.filter((f) => {
        const v = riskDetails[f.key];
        return f.type === 'member_list' ? (v || []).length > 0 : v !== '' && v !== undefined && v !== null && v !== false;
      }).length
    : 0;

  function handleCustomerSelect(customerId, label) {
    setForm((f) => ({ ...f, customer_id: customerId || '', customer_label: label }));
  }

  // Files picked before the policy exists yet — held here and uploaded
  // right after creation succeeds (see handleSubmit), once there's a
  // policy id to attach them to.
  function handlePendingFilesSelected(e) {
    // Read the files synchronously here, before clearing the input below —
    // the functional setState updater can run after this handler returns,
    // by which point e.target.files would already be empty if read there.
    const selected = Array.from(e.target.files || []);
    setPendingFiles((prev) => [...prev, ...selected]);
    e.target.value = '';
  }

  function removePendingFile(index) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCommissionDecision(decision) {
    try {
      await api.patch(`/commission/${id}/decision`, { decision });
      const res = await api.get('/commission', { params: { policy_id: id } });
      setCommission(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not record that decision.');
    }
  }

  function handlePaymentChange(e) {
    const { name, value } = e.target;
    setPaymentForm((f) => ({ ...f, [name]: value }));
  }

  function validatePayment() {
    const hasCustomer = Number(paymentForm.customer_amount) > 0;
    const hasAdjustment = Number(paymentForm.adjustment_amount) > 0;

    if (hasCustomer && !paymentForm.customer_bank_account_id) {
      return 'Select the account the customer payment was received into.';
    }
    if (hasAdjustment && paymentForm.adjustment_type === 'cashback' && !paymentForm.adjustment_bank_account_id) {
      return 'A cashback needs a bank account to pay it from.';
    }
    return '';
  }

  // Records whichever payment/discount sections were filled in, against the
  // policy that was just created. Called only after the policy itself has
  // saved successfully.
  async function recordPayments(policyId, customerId) {
    if (Number(paymentForm.customer_amount) > 0) {
      await api.post('/customer-payments', {
        customer_id: customerId,
        amount: paymentForm.customer_amount,
        bank_account_id: paymentForm.customer_bank_account_id,
        payment_date: paymentForm.customer_payment_date,
        reference_id: paymentForm.customer_reference_id || null,
        allocations: [{ policy_id: policyId, amount: paymentForm.customer_amount }],
      });
    }
    if (paymentForm.insurer_bank_account_id) {
      await api.post('/insurer-payments', {
        policy_id: policyId,
        amount: computeNetPremium(premiumRows),
        bank_account_id: paymentForm.insurer_bank_account_id,
        payment_date: paymentForm.insurer_payment_date,
        reference_id: paymentForm.insurer_reference_id || null,
      });
    }
    if (Number(paymentForm.adjustment_amount) > 0) {
      await api.post('/policy-adjustments', {
        policy_id: policyId,
        type: paymentForm.adjustment_type,
        amount: paymentForm.adjustment_amount,
        bank_account_id: paymentForm.adjustment_type === 'cashback' ? paymentForm.adjustment_bank_account_id : null,
        remarks: paymentForm.adjustment_remarks || null,
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.customer_id) {
      setError('Please select a customer from the search results.');
      return;
    }
    if (form.policy_start_date && form.policy_end_date && form.policy_end_date <= form.policy_start_date) {
      setError('Policy end date must be after the start date.');
      return;
    }
    if (premiumRows.length === 0) {
      setError('Add at least one premium coverage in the "Premium coverages" section below.');
      return;
    }
    if (!isEdit) {
      const paymentError = validatePayment();
      if (paymentError) {
        setError(paymentError);
        return;
      }
    }

    setSaving(true);

    const { customer_label, ...rest } = form;
    const payload = Object.fromEntries(
      Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v])
    );
    payload.premiums = premiumRows.map((r) => ({
      coverage: r.coverage,
      sum_insured: r.sum_insured === '' ? null : r.sum_insured,
      prem_rate: r.prem_rate || null,
      prem: r.prem,
      gst_percent: r.gst_percent === '' ? 0 : r.gst_percent,
      is_third_party: Boolean(r.is_third_party),
    }));
    if (commissionTouched) {
      payload.commission = commission;
    }
    payload.risk_details = Object.keys(riskDetails).length > 0 ? riskDetails : null;
    if (renewFromId) {
      payload.renewed_from_policy_id = renewFromId;
    }
    if (!isEdit && fromTaskId) {
      payload.from_task_id = fromTaskId;
    }

    try {
      if (isEdit) {
        await api.put(`/policies/${id}`, payload);
        navigate('/policies');
      } else {
        const res = await api.post('/policies', payload);
        try {
          await recordPayments(res.data.id, form.customer_id);
          if (pendingFiles.length > 0) {
            await uploadFiles(pendingFiles, 'policy', res.data.id);
          }
          navigate('/policies');
        } catch (followUpErr) {
          // Policy was created; only a follow-up step (payment or document
          // upload) failed — send them to the policy's own page (carrying
          // the error along) so nothing recorded is lost from view and they
          // can retry from there.
          const message = followUpErr.response?.data?.error || 'Policy was created, but the payment or documents could not be recorded.';
          navigate(`/policies/${res.data.id}/finance`, { state: { error: message } });
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save policy.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="subtitle">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>{isEdit ? 'Edit policy' : renewFromId ? 'Renew policy' : 'Add policy'}</h2>
          <p className="subtitle">
            {isEdit
              ? 'Update policy details.'
              : renewFromId
              ? renewSource
                ? `Renewing policy #${renewSource.policy_number} (expired ${new Date(renewSource.policy_end_date).toLocaleDateString('en-IN')}). Customer, insurer, and coverage carried over — update the policy number and dates as needed.`
                : 'Loading the policy to renew…'
              : 'Create a new policy record.'}
          </p>
          {isEdit && renewedFrom && (
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Renewed from policy{' '}
              <Link to={`/policies/${renewedFrom.id}/edit`}>#{renewedFrom.policy_number}</Link>
            </p>
          )}
        </div>
        {isEdit && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link to={`/policies/${id}/finance`} className="btn-secondary">
              Payments &amp; balance
            </Link>
            {renewedTo ? (
              <Link to={`/policies/${renewedTo.id}/edit`} className="btn-secondary">
                Renewed as #{renewedTo.policy_number}
              </Link>
            ) : (
              <Link to={`/policies/new?renew_from=${id}`} className="btn-secondary">
                Renew
              </Link>
            )}
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Policy number *</label>
            <input name="policy_number" value={form.policy_number} onChange={handleChange} required />
          </div>

          {!isEdit && !renewFromId && openTasks.length > 0 && (
            <div className="field field-wide">
              <label>This policy is for task</label>
              <select value={fromTaskId} onChange={(e) => setFromTaskId(e.target.value)}>
                <option value="">— not linked to a task —</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              {fromTaskId && (
                <p className="subtitle" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
                  On save, that task's documents move onto this policy and it's marked converted.
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label>Customer *</label>
            <CustomerPicker
              customerId={form.customer_id}
              customerLabel={form.customer_label}
              onSelect={handleCustomerSelect}
            />
          </div>

          <div className="field">
            <label>Insurer *</label>
            <select name="insurer_id" value={form.insurer_id} onChange={handleChange} required>
              <option value="">—</option>
              {insurers.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Insurer branch *</label>
            <select
              name="insurer_branch_id"
              value={form.insurer_branch_id}
              onChange={handleChange}
              disabled={!form.insurer_id}
              required
            >
              <option value="">—</option>
              {insurerBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Vertical</label>
            <select name="vertical_id" value={form.vertical_id} onChange={handleChange}>
              <option value="">—</option>
              {verticals.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Sub-vertical</label>
            <select
              name="sub_vertical_id"
              value={form.sub_vertical_id}
              onChange={handleChange}
              disabled={!form.vertical_id}
            >
              <option value="">—</option>
              {subVerticals.map((sv) => (
                <option key={sv.id} value={sv.id}>{sv.name}</option>
              ))}
            </select>
          </div>

          {riskFields && (
            <div className="field">
              <label>Risk details</label>
              <button type="button" className="btn-secondary" onClick={() => setRiskDetailsModalOpen(true)}>
                {riskDetailsFilledCount > 0 ? 'Manage risk details' : 'Add risk details'}
              </button>
              {riskDetailsFilledCount > 0 && (
                <p className="subtitle" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
                  {riskDetailsFilledCount} field{riskDetailsFilledCount > 1 ? 's' : ''} filled
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label>Sum insured</label>
            <input
              type="number" step="0.01" min="0"
              name="sum_insured" value={form.sum_insured} onChange={handleChange}
            />
          </div>

          <div className="field">
            <label>Policy start date *</label>
            <input type="date" name="policy_start_date" value={form.policy_start_date} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Policy end date *</label>
            <input type="date" name="policy_end_date" value={form.policy_end_date} onChange={handleChange} required />
          </div>

          <div className="field checkbox-field">
            <label>
              <input type="checkbox" name="renewable" checked={form.renewable} onChange={handleChange} />
              {' '}Renewable
            </label>
          </div>

          <div className="field">
            <label>Issued from branch</label>
            <select name="issued_from_branch_id" value={form.issued_from_branch_id} onChange={handleChange}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Telecaller</label>
            <select name="telecaller" value={form.telecaller} onChange={handleChange}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="field field-wide">
            <label>Remarks</label>
            <input name="remarks" value={form.remarks} onChange={handleChange} maxLength={150} />
          </div>
        </div>

        <h3 style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>Premium coverages *</h3>
        <PremiumsFields isMotor={isMotor} rows={premiumRows} onChange={setPremiumRows} />

        <h3 style={{ marginTop: '2rem', marginBottom: '0.25rem' }}>Commission</h3>
        <p className="subtitle" style={{ marginTop: 0 }}>Optional — leave blank if this policy doesn't earn brokerage.</p>
        {commission && (
          <p style={{ margin: '0 0 0.75rem' }}>
            <span style={{
              color: commission.status === 'approved' ? '#15803d' : commission.status === 'rejected' ? '#b91c1c' : '#b45309',
              fontWeight: 600,
            }}>
              {commission.status === 'approved' ? 'Approved' : commission.status === 'rejected' ? 'Rejected' : 'Pending approval'}
            </span>
            {commission.status === 'pending' && isChecker && (
              <span style={{ marginLeft: '0.75rem' }}>
                <button type="button" className="btn-link" onClick={() => handleCommissionDecision('approved')}>
                  Approve
                </button>
                {' · '}
                <button type="button" className="btn-link" onClick={() => handleCommissionDecision('rejected')}>
                  Reject
                </button>
              </span>
            )}
          </p>
        )}
        <CommissionFields
          isMotor={isMotor}
          commission={commission}
          onChange={(next) => {
            setCommission(next);
            setCommissionTouched(true);
          }}
        />

        {!isEdit && (
          <>
            <h3 style={{ marginTop: '2rem', marginBottom: '0.25rem' }}>Documents</h3>
            <p className="subtitle" style={{ marginTop: 0 }}>
              Optional — attach policy documents now, or add them later from this policy's page.
            </p>
            <label className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
              + Add files
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handlePendingFilesSelected}
                style={{ display: 'none' }}
              />
            </label>
            {pendingFiles.length > 0 && (
              <ul style={{ marginTop: '0.6rem', paddingLeft: '1.2rem' }}>
                {pendingFiles.map((f, i) => (
                  <li key={i} style={{ marginBottom: '0.2rem' }}>
                    {f.name}{' '}
                    <button type="button" className="btn-link" onClick={() => removePendingFile(i)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!isEdit && (
          <>
            <h3 style={{ marginTop: '2rem', marginBottom: '0.25rem' }}>Payment</h3>
            <p className="subtitle" style={{ marginTop: 0 }}>
              Optional — record what's been paid so far. Leave any section blank to skip it and record it later from this policy's Finance page.
            </p>

            <h4 style={{ marginBottom: '0.6rem' }}>Customer payment</h4>
            <div className="form-grid">
              <div className="field">
                <label>Amount received</label>
                <input
                  type="number" step="0.01" min="0"
                  name="customer_amount" value={paymentForm.customer_amount} onChange={handlePaymentChange}
                />
              </div>
              <div className="field">
                <label>Balance</label>
                <input
                  type="text" readOnly
                  value={`₹${(computeNetPremium(premiumRows) - (Number(paymentForm.customer_amount) || 0)).toLocaleString('en-IN')}`}
                />
              </div>
              <div className="field">
                <label>Received into account</label>
                <select name="customer_bank_account_id" value={paymentForm.customer_bank_account_id} onChange={handlePaymentChange}>
                  <option value="">—</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Payment date</label>
                <input type="date" name="customer_payment_date" value={paymentForm.customer_payment_date} onChange={handlePaymentChange} />
              </div>
              <div className="field">
                <label>Reference / cheque no.</label>
                <input name="customer_reference_id" value={paymentForm.customer_reference_id} onChange={handlePaymentChange} maxLength={100} />
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '0.6rem' }}>Insurer payment</h4>
            <p className="subtitle" style={{ marginTop: 0 }}>Always the full premium — that's what gets remitted to the insurer.</p>
            <div className="form-grid">
              <div className="field">
                <label>Amount paid</label>
                <input
                  type="text" readOnly
                  value={`₹${computeNetPremium(premiumRows).toLocaleString('en-IN')}`}
                />
              </div>
              <div className="field">
                <label>Paid from account</label>
                <select name="insurer_bank_account_id" value={paymentForm.insurer_bank_account_id} onChange={handlePaymentChange}>
                  <option value="">—</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Payment date</label>
                <input type="date" name="insurer_payment_date" value={paymentForm.insurer_payment_date} onChange={handlePaymentChange} />
              </div>
              <div className="field">
                <label>Reference / cheque no.</label>
                <input name="insurer_reference_id" value={paymentForm.insurer_reference_id} onChange={handlePaymentChange} maxLength={100} />
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem', marginBottom: '0.6rem' }}>Discount / cashback</h4>
            <p className="subtitle" style={{ marginTop: 0 }}>Needs a senior's approval before it counts.</p>
            <div className="form-grid">
              <div className="field">
                <label>Type</label>
                <select name="adjustment_type" value={paymentForm.adjustment_type} onChange={handlePaymentChange}>
                  <option value="discount">Discount</option>
                  <option value="cashback">Cashback</option>
                </select>
              </div>
              <div className="field">
                <label>Amount</label>
                <input
                  type="number" step="0.01" min="0"
                  name="adjustment_amount" value={paymentForm.adjustment_amount} onChange={handlePaymentChange}
                />
              </div>
              {paymentForm.adjustment_type === 'cashback' && (
                <div className="field">
                  <label>Pay from account</label>
                  <select name="adjustment_bank_account_id" value={paymentForm.adjustment_bank_account_id} onChange={handlePaymentChange}>
                    <option value="">—</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field field-wide">
                <label>Remarks</label>
                <input name="adjustment_remarks" value={paymentForm.adjustment_remarks} onChange={handlePaymentChange} maxLength={255} />
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/policies')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create policy'}
          </button>
        </div>
      </form>

      <RiskDetailsModal
        open={riskDetailsModalOpen}
        subVerticalName={selectedSubVertical?.name}
        fields={riskFields}
        initialValues={riskDetails}
        onClose={() => setRiskDetailsModalOpen(false)}
        onSave={(values) => {
          setRiskDetails(values);
          setRiskDetailsModalOpen(false);
        }}
      />

      {isEdit && <DocumentsPanel entityType="policy" entityId={id} />}
    </Layout>
  );
}
