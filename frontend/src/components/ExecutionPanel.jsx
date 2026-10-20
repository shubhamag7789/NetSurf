import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertTriangle, ArrowRight, RefreshCw, ShieldAlert, Eye, Terminal } from 'lucide-react';

export default function ExecutionPanel({ plan, logs, status, currentStepIndex }) {
  if (!plan && (!logs || logs.length === 0)) {
    return (
      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
        <Terminal size={36} color="var(--text-dim)" style={{ margin: '0 auto 0.75rem' }} />
        <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Execution Console Ready</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', maxWidth: 400, margin: '0.5rem auto 0' }}>
          Enter a task instruction above to generate an execution plan and watch the browser agent navigate and verify in real time.
        </p>
      </div>
    );
  }

  const steps = plan?.steps || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(350px, 1.2fr)', gap: '1.25rem', marginBottom: '1.5rem' }}>
      {/* Plan Steps Column */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Structured Action Plan</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              ({plan?.generatedBy || 'planner'})
            </span>
          </h3>
          <span className={`badge badge-${status || 'pending'}`}>
            {status || 'pending'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 420, overflowY: 'auto' }}>
          {steps.map((step, idx) => {
            const isCurrent = currentStepIndex === idx && status === 'running';
            const logEntry = logs?.find(l => l.step_index === idx || l.stepIndex === idx);
            const stepStatus = logEntry?.status || (idx < currentStepIndex ? 'success' : isCurrent ? 'running' : 'pending');

            return (
              <div
                key={idx}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 8,
                  background: isCurrent ? 'rgba(59, 130, 246, 0.12)' : 'rgba(31, 41, 55, 0.4)',
                  border: isCurrent ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ marginTop: 2 }}>
                  {stepStatus === 'success' && <CheckCircle2 size={16} color="#10b981" />}
                  {stepStatus === 'running' && <RefreshCw size={16} color="#3b82f6" className="animate-spin" />}
                  {stepStatus === 'pending' && <Clock size={16} color="var(--text-dim)" />}
                  {stepStatus === 'failed' && <XCircle size={16} color="#ef4444" />}
                  {stepStatus === 'ambiguous' && <AlertTriangle size={16} color="#f59e0b" />}
                  {stepStatus === 'blocked' && <ShieldAlert size={16} color="#f43f5e" />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase' }}>
                      Step {idx + 1}: {step.type}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {step.timeout ? `${step.timeout / 1000}s` : ''}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-main)', marginTop: '0.15rem' }}>
                    {step.description}
                  </p>
                  {step.expectedOutcome && (
                    <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontStyle: 'italic' }}>
                      ↳ Expected: {step.expectedOutcome}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Logs & Observability Column */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={16} color="#06b6d4" />
            <span>Agent Observation & Action Stream</span>
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {logs?.length || 0} events
          </span>
        </div>

        <div style={{
          flex: 1,
          background: 'rgba(11, 17, 32, 0.9)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.775rem',
          maxHeight: 420,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          {(!logs || logs.length === 0) ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem 0' }}>
              Awaiting execution telemetry...
            </div>
          ) : (
            logs.map((log, i) => {
              const actionType = log.action_type || log.type;
              const isError = log.status === 'failed' || log.status === 'blocked';
              const isWarning = log.status === 'ambiguous';
              const isSuccess = log.status === 'success';

              const isVerified = log.result?.verified || log.type === 'verify';
              const isAdaptive = log.result?.adaptiveRecovery || Boolean(log.result?.recoveryNote);

              return (
                <div
                  key={i}
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: 4,
                    background: isError ? 'rgba(239, 68, 68, 0.1)' : isWarning ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                    borderLeft: `3px solid ${isError ? '#ef4444' : isWarning ? '#f59e0b' : isVerified ? '#10b981' : '#3b82f6'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>[{new Date(log.timestamp || Date.now()).toLocaleTimeString()}]</span>
                      <strong style={{ color: '#93c5fd' }}>[{actionType?.toUpperCase()}]</strong>
                      {isVerified && (
                        <span style={{ color: '#34d399', fontSize: '0.65rem', background: 'rgba(16,185,129,0.15)', padding: '0.1rem 0.35rem', borderRadius: 3 }}>
                          ✓ VERIFIED
                        </span>
                      )}
                      {isAdaptive && (
                        <span style={{ color: '#fbbf24', fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', padding: '0.1rem 0.35rem', borderRadius: 3 }}>
                          ⚡ ADAPTIVE RECOVERY
                        </span>
                      )}
                    </div>
                    {log.duration_ms && <span>{log.duration_ms}ms</span>}
                  </div>

                  <div style={{ color: isError ? '#fca5a5' : isWarning ? '#fcd34d' : '#e2e8f0', marginTop: '0.25rem', lineHeight: 1.4 }}>
                    {log.result?.summary || log.error || log.description || log.result?.message || 'Action executed'}
                  </div>

                  {log.candidates && (
                    <div style={{ marginTop: '0.35rem', padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: 4, color: '#fbbf24', fontSize: '0.725rem' }}>
                      ⚠️ Ambiguity halted: {log.candidates.map(c => `"${c.label}"`).join(' vs ')}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
