import React, { useState } from 'react';
import { Play, Square, Sparkles, AlertCircle } from 'lucide-react';

const EXAMPLE_TASKS = [
  {
    title: 'Live Job Search (Fresher / India)',
    badge: 'Live Web',
    prompt: 'search jobs for software developer for freshers in India',
  },
  {
    title: 'Real Product Search & Pricing',
    badge: 'Merchant Web',
    prompt: 'Search for mechanical keyboards with wireless bluetooth under ₹5000',
  },
  {
    title: 'Demo Store: Laptops under ₹50k (16GB RAM)',
    badge: 'Demo Sandbox',
    prompt: 'Find laptops under ₹50,000 with at least 16 GB RAM in the demo store, compare specifications, and recommend the best match.',
  },
  {
    title: 'Demo Store: Laptops under ₹60k (32GB RAM)',
    badge: 'Demo Sandbox',
    prompt: 'Find laptops under ₹60,000 with at least 32 GB RAM in the demo store, compare specifications, and recommend the best match.',
  },
];

export default function TaskInput({ onRunTask, onStopTask, isRunning, activeTaskId }) {
  const [prompt, setPrompt] = useState(EXAMPLE_TASKS[0].prompt);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || isRunning) return;
    onRunTask(prompt.trim());
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <label htmlFor="task-prompt" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={16} color="#38bdf8" />
            Natural-Language Task Instruction
          </label>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            AI-planned & autonomously verified
          </span>
        </div>

        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <textarea
            id="task-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRunning}
            rows={3}
            placeholder="Describe what you want the browser to accomplish..."
            style={{
              width: '100%',
              background: 'rgba(11, 17, 32, 0.8)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: '0.85rem 1rem',
              color: 'var(--text-main)',
              fontSize: '0.925rem',
              fontFamily: 'var(--font-sans)',
              resize: 'vertical',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border-color)')}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="submit"
              disabled={isRunning || !prompt.trim()}
              className="btn btn-primary"
            >
              <Play size={16} />
              <span>Run Task</span>
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={() => onStopTask(activeTaskId)}
                className="btn btn-danger"
              >
                <Square size={16} />
                <span>Stop Task</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <AlertCircle size={14} color="#f59e0b" />
            <span>Executes real browser actions on the sandbox origin</span>
          </div>
        </div>
      </form>

      {/* Quick Example Presets */}
      <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem', fontWeight: 600 }}>
          RECOMMENDED DEMONSTRATION PRESETS:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.6rem' }}>
          {EXAMPLE_TASKS.map((ex, i) => (
            <button
              key={i}
              type="button"
              disabled={isRunning}
              onClick={() => setPrompt(ex.prompt)}
              style={{
                background: 'rgba(31, 41, 55, 0.4)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '0.6rem 0.8rem',
                textAlign: 'left',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => !isRunning && (e.currentTarget.style.borderColor = '#38bdf8')}
              onMouseLeave={(e) => !isRunning && (e.currentTarget.style.borderColor = 'var(--border-color)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f3f4f6' }}>{ex.title}</span>
                <span style={{
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: 4,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  fontWeight: 600
                }}>
                  {ex.badge}
                </span>
              </div>
              <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ex.prompt}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
