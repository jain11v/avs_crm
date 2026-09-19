import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const NOTE_TYPES = ['call', 'email', 'meeting', 'note', 'other'];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(d) {
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN');
}

export default function CustomerNotes() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [noteType, setNoteType] = useState('call');
  const [content, setContent] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [customerRes, notesRes] = await Promise.all([
        api.get(`/customers/${id}`),
        api.get('/customer-notes', { params: { customer_id: id } }),
      ]);
      setCustomer(customerRes.data);
      setNotes(notesRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this customer.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddNote(e) {
    e.preventDefault();
    if (!content.trim()) {
      setError('Enter a note before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/customer-notes', {
        customer_id: id,
        note_type: noteType,
        content: content.trim(),
        follow_up_date: followUpDate || null,
      });
      setContent('');
      setFollowUpDate('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save that note.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleFollowUp(note) {
    try {
      await api.patch(`/customer-notes/${note.id}/done`, { follow_up_done: !note.follow_up_done });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update that follow-up.');
    }
  }

  async function handleDelete(noteId) {
    try {
      await api.delete(`/customer-notes/${noteId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete that note.');
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
          <h2>{customer?.name} — Notes &amp; follow-ups</h2>
          <p className="subtitle">Calls, emails, meetings, and anything else worth remembering about this customer.</p>
        </div>
        <Link to={`/customers/${id}/edit`} className="btn-secondary">
          Back to customer
        </Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleAddNote} style={{ marginBottom: '2rem' }}>
        <div className="form-grid">
          <div className="field">
            <label>Type</label>
            <select value={noteType} onChange={(e) => setNoteType(e.target.value)}>
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Follow up on (optional)</label>
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} min={todayIsoDate()} />
          </div>
          <div className="field field-wide">
            <label>Note *</label>
            <input value={content} onChange={(e) => setContent(e.target.value)} maxLength={1000} placeholder="What happened / what's next…" />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="subtitle">No notes yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Note</th>
              <th>Follow-up</th>
              <th>By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <td>{formatDateTime(n.created_at)}</td>
                <td style={{ textTransform: 'capitalize' }}>{n.note_type}</td>
                <td>{n.content}</td>
                <td>
                  {n.follow_up_date ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={n.follow_up_done} onChange={() => handleToggleFollowUp(n)} />
                      <span style={{ textDecoration: n.follow_up_done ? 'line-through' : 'none' }}>
                        {formatDate(n.follow_up_date)}
                      </span>
                    </label>
                  ) : '—'}
                </td>
                <td>{n.employee_first_name ? `${n.employee_first_name} ${n.employee_last_name || ''}`.trim() : '—'}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleDelete(n.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
