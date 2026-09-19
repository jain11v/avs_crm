import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';

// Attaches files to a customer (KYC) or policy (policy PDF, proposal
// form) — embedded directly in that entity's edit page rather than a
// separate page, since "the documents for this policy" only makes sense
// in context.

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN');
}

export default function DocumentsPanel({ entityType, entityId, title = 'Documents' }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/documents', { params: { entity_type: entityType, entity_id: entityId } });
      setDocs(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFileSelected(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', entityType);
      formData.append('entity_id', entityId);
      await api.post('/documents', formData);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload that file.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/documents/${id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete that document.');
    }
  }

  async function handleDownload(doc) {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not download that file.');
    }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>{title}</h3>
      {error && <div className="form-error">{error}</div>}

      <label className="btn-secondary" style={{ display: 'inline-block', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
        {uploading ? 'Uploading…' : '+ Upload document'}
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={handleFileSelected}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>

      {loading ? (
        <p className="subtitle" style={{ marginTop: '0.6rem' }}>Loading…</p>
      ) : docs.length === 0 ? (
        <p className="subtitle" style={{ marginTop: '0.6rem' }}>No documents uploaded yet.</p>
      ) : (
        <table className="data-table" style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleDownload(d)}>
                    {d.filename}
                  </button>
                </td>
                <td>{formatSize(d.size_bytes)}</td>
                <td>{formatDate(d.created_at)}</td>
                <td>{d.uploaded_by_first_name ? `${d.uploaded_by_first_name} ${d.uploaded_by_last_name || ''}`.trim() : '—'}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleDelete(d.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
