import { useEffect, useRef, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

// No websockets — the rest of this app's "live" data (alerts) works by
// polling, so chat follows the same pattern rather than adding new
// realtime infrastructure just for this. Every few seconds is frequent
// enough for an internal team chat without feeling like a page that never
// updates.
const POLL_MS = 4000;

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

function isAcceptedFile(f) {
  const name = f.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function Chat() {
  const { employee } = useAuth();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const lastIdRef = useRef(0);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => {
    api.get('/chat/messages').then((res) => {
      setMessages(res.data);
      if (res.data.length > 0) lastIdRef.current = res.data[res.data.length - 1].id;
      scrollToBottom();
    }).catch((err) => {
      setError(err.response?.data?.error || 'Could not load the chat.');
    }).finally(() => setLoading(false));
  }, [scrollToBottom]);

  useEffect(() => {
    const interval = setInterval(() => {
      api.get('/chat/messages', { params: { after_id: lastIdRef.current } }).then((res) => {
        if (res.data.length === 0) return;
        setMessages((prev) => [...prev, ...res.data]);
        lastIdRef.current = res.data[res.data.length - 1].id;
        scrollToBottom();
      }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [scrollToBottom]);

  async function handleSend() {
    if (!body.trim() && !file) return;
    setSending(true);
    setError('');
    try {
      const formData = new FormData();
      if (body.trim()) formData.append('body', body.trim());
      if (file) formData.append('file', file);
      const res = await api.post('/chat/messages', formData);
      setMessages((prev) => [...prev, res.data]);
      lastIdRef.current = res.data.id;
      setBody('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      scrollToBottom();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send that message.');
    } finally {
      setSending(false);
    }
  }

  async function handleDownload(msg) {
    try {
      const res = await api.get(`/chat/messages/${msg.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.file_original_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not download that file.');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Counter (not a plain boolean) because dragging over a child element
  // fires dragleave on the parent too — without it the overlay would
  // flicker off every time the cursor crosses a message bubble.
  function handleDragEnter(e) {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current += 1;
    setDragActive(true);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDragLeave(e) {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (!isAcceptedFile(dropped)) {
      setError('Only PDF, JPEG, PNG, or Word documents are supported.');
      return;
    }
    setError('');
    setFile(dropped);
  }

  return (
    <Layout>
      <h2>Team chat</h2>
      <p className="subtitle">One open chat for everyone in the company.</p>

      {error && <div className="form-error">{error}</div>}

      <div
        style={{ position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragActive && (
          <div
            style={{
              position: 'absolute',
              inset: '1rem 0 0 0',
              zIndex: 10,
              border: '2px dashed var(--accent, #2563eb)',
              borderRadius: '8px',
              background: 'var(--panel, rgba(37, 99, 235, 0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <strong>Drop file to attach</strong>
          </div>
        )}

        <div
          ref={listRef}
          style={{
            marginTop: '1rem',
            border: '1px solid var(--border, #ddd)',
            borderRadius: '8px',
            height: '58vh',
            overflowY: 'auto',
            padding: '1rem',
          }}
        >
          {loading ? (
            <p className="subtitle">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="subtitle">No messages yet — say hello.</p>
          ) : (
            messages.map((m) => {
              const mine = String(m.sender_id) === String(employee?.id);
              return (
                <div key={m.id} style={{ marginBottom: '0.9rem', textAlign: mine ? 'right' : 'left' }}>
                  <div className="subtitle" style={{ margin: 0, fontSize: '0.8rem' }}>
                    {mine ? 'You' : `${m.sender_first_name || ''} ${m.sender_last_name || ''}`.trim()} · {formatTime(m.created_at)}
                  </div>
                  <div
                    style={{
                      display: 'inline-block',
                      marginTop: '0.25rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '10px',
                      background: mine ? 'var(--accent-soft, #dbeafe)' : 'var(--panel-muted, #f3f4f6)',
                      maxWidth: '70%',
                      textAlign: 'left',
                    }}
                  >
                    {m.body && <div>{m.body}</div>}
                    {m.file_stored_name && (
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => handleDownload(m)}
                        style={{ marginTop: m.body ? '0.35rem' : 0, display: 'block' }}
                      >
                        📎 {m.file_original_name}{m.file_size_bytes ? ` (${formatSize(m.file_size_bytes)})` : ''}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message… (or drag a file in)"
            style={{ flex: 1 }}
          />
          <label className="btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
            📎 Attach
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => setFile(e.target.files[0] || null)}
              style={{ display: 'none' }}
            />
          </label>
          <button type="button" className="btn-primary btn-inline" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {file && (
          <p className="subtitle" style={{ marginTop: '0.4rem' }}>
            Attached: {file.name}{' '}
            <button type="button" className="btn-link" onClick={() => setFile(null)}>Remove</button>
          </p>
        )}
      </div>
    </Layout>
  );
}
