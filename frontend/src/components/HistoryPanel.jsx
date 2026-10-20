import React, { useState, useEffect } from 'react';
import { History, RefreshCw, Eye, Calendar, Clock, ChevronRight } from 'lucide-react';
import { apiClient } from '../api/client';

export default function HistoryPanel({ onSelectTask }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState(null);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getTasks();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleView = async (id) => {
    try {
      const data = await apiClient.getTask(id);
      setSelectedTaskDetail(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={20} color="#38bdf8" />
            <span>Persistent Task History</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            All past runs, action traces, and verification logs persisted in SQLite.
          </p>
        </div>

        <button onClick={fetchTasks} className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No previous tasks recorded yet. Run a task to start tracking history!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedTaskDetail ? '1fr 1fr' : '1fr', gap: '1.25rem' }}>
          {/* Table List */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-dim)' }}>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Status</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Instruction</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Started</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: selectedTaskDetail?.task?.id === t.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <span className={`badge badge-${t.status}`}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.user_request}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-dim)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      {t.started_at ? new Date(t.started_at).toLocaleTimeString() : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <button
                        onClick={() => handleView(t.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        <Eye size={12} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Details Drawer */}
          {selectedTaskDetail && (
            <div style={{
              background: 'rgba(11, 17, 32, 0.95)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: '1.25rem',
              maxHeight: 500,
              overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Task Inspection</h3>
                <button
                  onClick={() => setSelectedTaskDetail(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>Instruction:</strong>
                  <p style={{ color: '#fff', marginTop: 2 }}>{selectedTaskDetail.task?.user_request}</p>
                </div>
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>Status:</strong>{' '}
                  <span className={`badge badge-${selectedTaskDetail.task?.status}`}>{selectedTaskDetail.task?.status}</span>
                </div>
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>Action Logs ({selectedTaskDetail.logs?.length || 0}):</strong>
                  <div style={{
                    marginTop: '0.5rem',
                    background: 'rgba(0,0,0,0.4)',
                    padding: '0.5rem',
                    borderRadius: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.725rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}>
                    {selectedTaskDetail.logs?.map((l, i) => (
                      <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.25rem' }}>
                        <span style={{ color: '#38bdf8' }}>[{l.action_type}]</span> {l.status} — {l.result?.summary || l.error || JSON.stringify(l.action_data || {})}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
