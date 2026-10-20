import React, { useState, useEffect } from 'react';
import {
  Compass,
  Play,
  Bookmark,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Search,
  Laptop,
  Briefcase,
  Train,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Cpu,
  Globe,
  Settings,
  Database,
  ArrowRight,
  User
} from 'lucide-react';
import { apiClient } from '../api/client';

export default function ProfileDashboard({ onRunTask, setActiveTab }) {
  const [profile, setProfile] = useState(null);
  const [savedSearches, setSavedSearches] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const [newSearchQuery, setNewSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    display_name: 'Engineer',
    preferred_locations: 'India',
    preferred_job_roles: '',
    apply_profile_to_tasks: false,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [profData, tasksRes, settingsRes] = await Promise.all([
        apiClient.getProfile().catch(() => ({})),
        apiClient.getTasks().catch(() => ({ tasks: [] })),
        apiClient.getSettings().catch(() => ({ settings: {} })),
      ]);

      if (profData.profile) {
        setProfile(profData.profile);
        setFormData({
          display_name: profData.profile.display_name || 'Engineer',
          preferred_locations: profData.profile.preferred_locations || 'India',
          preferred_job_roles: profData.profile.preferred_job_roles || '',
          apply_profile_to_tasks: Boolean(profData.profile.apply_profile_to_tasks),
        });
      }
      setSavedSearches(profData.savedSearches || []);
      setRecentTasks((tasksRes.tasks || []).slice(0, 6));
      setSettings(settingsRes.settings || {});
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchTask = (taskQuery) => {
    if (!taskQuery || !taskQuery.trim()) return;
    setActiveTab('agent');
    onRunTask(taskQuery.trim());
  };

  const handleQuickSubmit = (e) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    handleLaunchTask(quickInput);
  };

  const handleSavePreferences = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.updateProfile(formData);
      setProfile(res.profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert(`Failed to save preferences: ${err.message}`);
    }
  };

  const handleAddSavedSearch = async (e) => {
    e.preventDefault();
    if (!newSearchQuery.trim()) return;
    try {
      await apiClient.saveSearch(newSearchQuery.trim(), 'general', {});
      setNewSearchQuery('');
      const profData = await apiClient.getProfile();
      setSavedSearches(profData.savedSearches || []);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteSavedSearch = async (id) => {
    try {
      await apiClient.deleteSavedSearch(id);
      setSavedSearches(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const suggestedTasks = [
    {
      category: 'Web Research',
      icon: <Globe size={18} color="#38bdf8" />,
      title: 'AI Agent Security Analysis',
      query: 'Research agentic browsers and summarize their security risks',
      badge: 'Grounded Synthesis',
    },
    {
      category: 'Product Comparison',
      icon: <Laptop size={18} color="#a78bfa" />,
      title: 'Budget 16GB Laptops',
      query: 'Find laptops under ₹50,000 with at least 16 GB RAM',
      badge: 'Specs & Prices',
    },
    {
      category: 'Travel Comparison',
      icon: <Train size={18} color="#fbbf24" />,
      title: 'Delhi to Patna Trains',
      query: 'Find the cheapest train tickets from Delhi to Patna',
      badge: 'Fares & Duration',
    },
    {
      category: 'Job Discovery',
      icon: <Briefcase size={18} color="#34d399" />,
      title: 'Entry-Level Analytics',
      query: 'Search jobs for Data Analyst for freshers in India',
      badge: 'Relevance Filtered',
    },
    {
      category: 'Educational Research',
      icon: <Compass size={18} color="#f472b6" />,
      title: 'Python Language Deep-Dive',
      query: 'Find a website that explains Python decorators',
      badge: 'Docs & Tutorials',
    },
    {
      category: 'Browser Automation',
      icon: <Cpu size={18} color="#f97316" />,
      title: 'Local Demo Store Sandbox',
      query: 'Explore and filter synthetic laptops on the local demo store',
      badge: 'Sandbox Playwright',
    },
  ];

  const plannerStatus = settings?.planner_status;
  const searchStatus = settings?.search_status;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── 1. Hero / General Agent Workspace ── */}
      <div className="glass-panel" style={{
        padding: '2rem',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))',
        border: '1px solid rgba(56, 189, 248, 0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
          <Compass size={28} color="#38bdf8" />
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f8fafc' }}>
            Adaptive Agentic Browser Workspace
          </h1>
        </div>
        <p style={{ fontSize: '0.925rem', color: '#94a3b8', maxWidth: 820, lineHeight: 1.55, marginBottom: '1.5rem' }}>
          Netsurf is a general-purpose intelligent browser agent. Describe any web task in natural language — 
          from cross-site product and travel comparisons to job discovery, structured research, and multi-step browser workflows.
        </p>

        {/* Quick Task Launcher Input */}
        <form onSubmit={handleQuickSubmit} style={{ display: 'flex', gap: '0.75rem', maxWidth: 860 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="What task should Netsurf perform today? (e.g. Compare train fares, research security risks, compare laptops...)"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              style={{
                width: '100%',
                padding: '0.85rem 1rem 0.85rem 2.85rem',
                borderRadius: 8,
                background: '#090e17',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#fff',
                fontSize: '0.95rem',
              }}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              padding: '0 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}
          >
            <Play size={16} fill="currentColor" />
            <span>Run Task</span>
          </button>
        </form>
      </div>

      {/* ── 2. Live Agent Health Diagnostics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {/* Gemini AI Status */}
        <div className="glass-panel" style={{ padding: '1.1rem', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
              AI Task Planner
            </span>
            <span className={`badge ${
              plannerStatus?.status === 'configured' || plannerStatus?.status === 'connected' ? 'badge-success' : 'badge-ambiguous'
            }`}>
              {plannerStatus?.status === 'configured' || plannerStatus?.status === 'connected' ? 'LIVE LLM' : 'FALLBACK ACTIVE'}
            </span>
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Cpu size={16} color="#38bdf8" />
            <span>Google Gemini</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Model: <strong style={{ color: '#e2e8f0' }}>{settings?.gemini_model || 'gemini-2.0-flash'}</strong>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
            {plannerStatus?.message || 'Ready for structured task planning'}
          </div>
        </div>

        {/* Web Search Provider */}
        <div className="glass-panel" style={{ padding: '1.1rem', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
              Web Search Engine
            </span>
            <span className={`badge ${
              searchStatus?.status === 'configured' || searchStatus?.status === 'connected' ? 'badge-success' : 'badge-ambiguous'
            }`}>
              {searchStatus?.status === 'configured' || searchStatus?.status === 'connected' ? 'LIVE SEARCH' : 'CURATED INDEX'}
            </span>
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Globe size={16} color="#34d399" />
            <span>Tavily Search API</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Status: <strong style={{ color: '#e2e8f0' }}>{settings?.has_tavily_api_key ? 'Authenticated' : 'Offline Fallback'}</strong>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
            {searchStatus?.message || 'Web citation & evidence retrieval active'}
          </div>
        </div>

        {/* Browser Automation */}
        <div className="glass-panel" style={{ padding: '1.1rem', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
              Browser Automation
            </span>
            <span className="badge badge-success">READY</span>
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={16} color="#a78bfa" />
            <span>Playwright Engine</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Origin: <strong style={{ color: '#e2e8f0' }}>http://localhost:3001 (Sandbox)</strong>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
            Action validation and user approval gates active
          </div>
        </div>

        {/* Workflow Memory */}
        <div className="glass-panel" style={{ padding: '1.1rem', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
              Workflow Memory
            </span>
            <span className="badge badge-success">ACTIVE</span>
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Database size={16} color="#fbbf24" />
            <span>Adaptive SQLite DB</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Mode: <strong style={{ color: '#e2e8f0' }}>Category Isolated</strong>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
            Auto-records generalized verified task patterns
          </div>
        </div>
      </div>

      {/* ── 3. Suggested Tasks (All Core Capabilities) ── */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} color="#fbbf24" />
              <span>Suggested Multi-Category Tasks</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Click any example to instantly observe how Netsurf plans, executes, and compares results.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {suggestedTasks.map((t, idx) => (
            <div
              key={idx}
              onClick={() => handleLaunchTask(t.query)}
              style={{
                background: 'rgba(30, 41, 59, 0.45)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.background = 'rgba(30, 41, 59, 0.45)';
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
                    {t.icon}
                    <span>{t.category}</span>
                  </div>
                  <span style={{ fontSize: '0.675rem', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.45rem', borderRadius: 4, color: '#cbd5e1' }}>
                    {t.badge}
                  </span>
                </div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem' }}>
                  {t.title}
                </h4>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.4 }}>
                  "{t.query}"
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#38bdf8', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.75rem' }}>
                <span>Launch in Console</span>
                <ArrowRight size={12} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Recent Tasks & Saved Workflows ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        {/* Recent Tasks */}
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} color="#38bdf8" />
              <span>Recent Executions</span>
            </h3>
            <button
              onClick={() => setActiveTab('history')}
              style={{ fontSize: '0.75rem', color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              View Full History →
            </button>
          </div>

          {recentTasks.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No tasks executed yet. Run an instruction above to see results.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {recentTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleLaunchTask(t.user_request)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    padding: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <div style={{ maxWidth: '75%' }}>
                    <div style={{ fontSize: '0.85rem', color: '#f1f5f9', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.user_request}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                      {new Date(t.started_at || t.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className={`badge ${
                    t.status === 'completed' ? 'badge-success' : t.status === 'failed' ? 'badge-failed' : 'badge-ambiguous'
                  }`} style={{ fontSize: '0.675rem' }}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saved Research & Quick Instructions */}
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 8 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <Bookmark size={16} color="#fbbf24" />
            <span>Saved Tasks & Quick Workflows</span>
          </h3>

          <form onSubmit={handleAddSavedSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Save custom instruction for one-click reuse..."
              value={newSearchQuery}
              onChange={(e) => setNewSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: 6,
                background: '#0b1120',
                border: '1px solid var(--border-color)',
                color: '#fff',
                fontSize: '0.825rem',
              }}
            />
            <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.825rem' }}>
              <Plus size={14} /> Save
            </button>
          </form>

          {savedSearches.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No saved tasks yet. Save frequent research tasks or comparison queries here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {savedSearches.map((s) => (
                <div
                  key={s.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    onClick={() => handleLaunchTask(s.query)}
                    style={{ fontSize: '0.825rem', color: '#e2e8f0', cursor: 'pointer', flex: 1 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#38bdf8'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#e2e8f0'}
                  >
                    {s.query}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleLaunchTask(s.query)}
                      style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '0.2rem' }}
                      title="Run task"
                    >
                      <Play size={13} fill="currentColor" />
                    </button>
                    <button
                      onClick={() => handleDeleteSavedSearch(s.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem' }}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Optional User Profile & Defaults ── */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <User size={16} color="#94a3b8" />
              <span>Optional General Preferences</span>
            </h3>
            <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)' }}>
              Configure optional defaults. Explicit natural-language task instructions always override these defaults.
            </p>
          </div>

          {saved && (
            <span style={{ fontSize: '0.8rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <CheckCircle2 size={14} /> Preferences Saved
            </span>
          )}
        </div>

        <form onSubmit={handleSavePreferences} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
              Display Name
            </label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
              Default Geographic Region
            </label>
            <input
              type="text"
              placeholder="e.g. India, Remote, US"
              value={formData.preferred_locations}
              onChange={(e) => setFormData({ ...formData, preferred_locations: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-secondary" style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem' }}>
              Save Preferences
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
