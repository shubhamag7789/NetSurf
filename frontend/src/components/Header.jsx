import { Compass, Shield, Database, Settings as SettingsIcon, History, User } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, health }) {
  return (
    <header style={{
      borderBottom: '1px solid var(--border-color)',
      background: 'rgba(17, 24, 39, 0.8)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '0.85rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
            width: 38,
            height: 38,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)',
          }}>
            <Compass size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
                Net<span style={{ color: '#38bdf8' }}>surf</span>
              </span>
              <span style={{
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.45rem',
                borderRadius: 4,
              }}>
                AGENTIC BROWSER
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Observe • Reason • Act • Verify • Recover
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-secondary)', padding: '0.3rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
          {[
            { id: 'agent', label: 'Agent Console', icon: Compass },
            { id: 'dashboard', label: 'My Dashboard', icon: User },
            { id: 'history', label: 'Task History', icon: History },
            { id: 'memory', label: 'Workflow Memory', icon: Database },
            { id: 'settings', label: 'Settings', icon: SettingsIcon },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.9rem',
                  borderRadius: 7,
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.775rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            padding: '0.35rem 0.75rem',
            borderRadius: 999,
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: health?.status === 'healthy' ? '#10b981' : '#ef4444',
              boxShadow: health?.status === 'healthy' ? '0 0 8px #10b981' : 'none',
            }} />
            <span style={{ color: 'var(--text-muted)' }}>
              Backend: <strong style={{ color: '#fff' }}>{health?.status || 'Connecting...'}</strong>
            </span>
          </div>

          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '0.775rem',
              color: '#38bdf8',
              textDecoration: 'none',
              padding: '0.35rem 0.75rem',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 999,
              background: 'rgba(56, 189, 248, 0.08)',
            }}
          >
            Demo Store ↗
          </a>
        </div>
      </div>
    </header>
  );
}
