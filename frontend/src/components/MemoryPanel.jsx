import React, { useState, useEffect } from 'react';
import { Database, Trash2, RefreshCw, Cpu, Check, ShieldCheck, Info } from 'lucide-react';
import { apiClient } from '../api/client';

export default function MemoryPanel() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchMemory = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getMemory();
      setMemories(data.memory || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this workflow memory?')) return;
    try {
      await apiClient.deleteMemory(id);
      setMessage('Memory record deleted successfully.');
      setTimeout(() => setMessage(''), 3000);
      fetchMemory();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={20} color="#10b981" />
            <span>Automatic Workflow Memory</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Stores generalized strategy patterns from successful runs — NO manual workflow recording.
          </p>
        </div>

        <button onClick={fetchMemory} className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {message && (
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.6rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.85rem' }}>
          {message}
        </div>
      )}

      {/* Architectural Guarantee Note */}
      <div style={{
        background: 'rgba(59, 130, 246, 0.08)',
        borderLeft: '4px solid #3b82f6',
        padding: '0.75rem 1rem',
        borderRadius: 4,
        fontSize: '0.8rem',
        color: '#93c5fd',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <Info size={16} />
        <span>
          <strong>How Netsurf Memory Works:</strong> When a task succeeds, Netsurf saves its generalized plan structure. When a similar task arrives, Netsurf retrieves the pattern, adapts it to the new constraints, and observes the live page again rather than blindly replaying old coordinates or stale selectors.
        </span>
      </div>

      {memories.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
          No workflow memories stored yet. Successfully complete a task to auto-save its generalized execution plan!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {memories.map((m) => (
            <div
              key={m.id}
              style={{
                background: 'rgba(31, 41, 55, 0.5)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.1)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: 4,
                }}>
                  {m.task_category}
                </span>

                <button
                  onClick={() => handleDelete(m.id)}
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem', color: '#f87171', border: 'none' }}
                  title="Delete memory record"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f9fafb', marginBottom: '0.5rem' }}>
                Pattern: "{m.user_request_pattern}"
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                Reused {m.success_count || 1} time{m.success_count !== 1 ? 's' : ''} • Last: {m.last_used ? new Date(m.last_used).toLocaleDateString() : 'recent'}
              </div>

              <div style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '0.6rem',
                borderRadius: 6,
                fontSize: '0.725rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                marginTop: 'auto',
              }}>
                <div style={{ fontWeight: 600, color: '#93c5fd', marginBottom: '0.25rem' }}>Generalized Steps ({m.plan_template?.length || 0}):</div>
                {m.plan_template?.slice(0, 4).map((s, idx) => (
                  <div key={idx} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {idx + 1}. {s.type} - {s.description}
                  </div>
                ))}
                {m.plan_template?.length > 4 && (
                  <div style={{ color: 'var(--text-dim)' }}>+ {m.plan_template.length - 4} more steps...</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
