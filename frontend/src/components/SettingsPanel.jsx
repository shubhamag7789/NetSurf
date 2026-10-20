import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Sliders,
  Save,
  Key,
  Globe,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react';
import { apiClient } from '../api/client';

export default function SettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Connection testing states
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState(null);
  const [testingSearch, setTestingSearch] = useState(false);
  const [searchTestResult, setSearchTestResult] = useState(null);

  const [geminiModels, setGeminiModels] = useState([
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Recommended)' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Experimental' },
  ]);
  const [isCustomModel, setIsCustomModel] = useState(false);

  const [formData, setFormData] = useState({
    model_provider: 'gemini',
    gemini_model: 'gemini-2.0-flash',
    model_name: 'gemini-2.0-flash',
    search_provider: 'tavily',
    gemini_api_key: '',
    tavily_api_key: '',
    anthropic_api_key: '',
    brave_search_api_key: '',
    browser_headless: 'false',
    browser_timeout: '30000',
    max_retries: '2',
    memory_enabled: 'true',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [data, modelsData] = await Promise.all([
        apiClient.getSettings(),
        apiClient.getGeminiModels().catch(() => ({ models: [] })),
      ]);
      if (modelsData?.models?.length > 0) {
        setGeminiModels(modelsData.models);
      }
      setSettings(data.settings);
      const activeModel = data.settings.gemini_model || 'gemini-2.0-flash';
      const knownIds = (modelsData?.models || geminiModels).map(m => m.id);
      setIsCustomModel(!knownIds.includes(activeModel));
      setFormData(prev => ({
        ...prev,
        model_provider: data.settings.model_provider || 'gemini',
        gemini_model: activeModel,
        model_name: activeModel,
        search_provider: data.settings.search_provider || 'tavily',
        browser_headless: data.settings.browser_headless || 'false',
        browser_timeout: data.settings.browser_timeout || '30000',
        max_retries: data.settings.max_retries || '2',
        memory_enabled: data.settings.memory_enabled || 'true',
        // Never prepopulate secrets
        gemini_api_key: '',
        tavily_api_key: '',
        anthropic_api_key: '',
        brave_search_api_key: '',
      }));
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to fetch settings from backend');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const payload = { ...formData };
      if (!payload.gemini_api_key) delete payload.gemini_api_key;
      if (!payload.tavily_api_key) delete payload.tavily_api_key;
      if (!payload.anthropic_api_key) delete payload.anthropic_api_key;
      if (!payload.brave_search_api_key) delete payload.brave_search_api_key;

      await apiClient.updateSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      fetchSettings();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmTestResult(null);
    try {
      if (formData.model_provider === 'gemini') {
        const result = await apiClient.testGemini(
          formData.gemini_api_key || undefined,
          formData.gemini_model || undefined
        );
        setLlmTestResult(result);
      } else {
        const result = await apiClient.testLlm(
          formData.anthropic_api_key || undefined,
          formData.model_name || undefined,
          'anthropic'
        );
        setLlmTestResult(result);
      }
    } catch (err) {
      setLlmTestResult({ connected: false, message: err.message, status: 'request_failed' });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleTestSearch = async () => {
    setTestingSearch(true);
    setSearchTestResult(null);
    try {
      if (formData.search_provider === 'tavily') {
        const result = await apiClient.testTavily(formData.tavily_api_key || undefined);
        setSearchTestResult(result);
      } else {
        const result = await apiClient.testSearch(formData.brave_search_api_key || undefined, 'brave');
        setSearchTestResult(result);
      }
    } catch (err) {
      setSearchTestResult({ success: false, message: err.message, status: 'request_failed' });
    } finally {
      setTestingSearch(false);
    }
  };

  const plannerStatus = settings?.planner_status;
  const searchStatus = settings?.search_status;

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', maxWidth: 840, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <SettingsIcon size={22} color="#38bdf8" />
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Settings & AI Integrations</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Configure Google Gemini AI, Tavily Web Search, and sandbox safety controls.
          </p>
        </div>
      </div>

      {saved && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '0.6rem 1rem',
          borderRadius: 6,
          marginBottom: '1rem',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Check size={16} />
          <span>Settings successfully updated and validated.</span>
        </div>
      )}

      {errorMsg && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#fca5a5',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          padding: '0.6rem 1rem',
          borderRadius: 6,
          marginBottom: '1rem',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* ── 1. LLM Planner Configuration (Gemini AI) ── */}
        <div style={{ background: 'rgba(31, 41, 55, 0.4)', padding: '1.15rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={16} color="#38bdf8" />
              1. AI Task Planner (Google Gemini AI)
            </h3>
            <span className={`badge ${
              plannerStatus?.status === 'connected' ? 'badge-success' :
              plannerStatus?.status === 'request_failed' ? 'badge-failed' :
              'badge-ambiguous'
            }`}>
              {plannerStatus?.label || (settings?.has_gemini_api_key ? 'Configured' : 'Missing Credentials (Fallback Active)')}
            </span>
          </div>

          <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.45 }}>
            Powers natural-language task understanding, intent classification, constraint extraction, and action plan generation.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.85rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                AI Model Provider
              </label>
              <select
                value={formData.model_provider}
                onChange={(e) => setFormData({ ...formData, model_provider: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
              >
                <option value="gemini">Google Gemini AI (Free Tier Supported)</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                {formData.model_provider === 'gemini' ? 'Gemini Model' : 'Anthropic Model'}
              </label>
              {formData.model_provider === 'gemini' ? (
                <div>
                  <select
                    value={isCustomModel ? 'custom' : formData.gemini_model}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomModel(true);
                      } else {
                        setIsCustomModel(false);
                        setFormData({ ...formData, gemini_model: e.target.value, model_name: e.target.value });
                      }
                    }}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)', marginBottom: isCustomModel ? '0.4rem' : '0' }}
                  >
                    {geminiModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name || m.id}</option>
                    ))}
                    <option value="custom">Custom Model ID...</option>
                  </select>
                  {isCustomModel && (
                    <input
                      type="text"
                      placeholder="e.g. gemini-2.0-flash"
                      value={formData.gemini_model}
                      onChange={(e) => setFormData({ ...formData, gemini_model: e.target.value.trim(), model_name: e.target.value.trim() })}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: '#090e17', color: '#fff', border: '1px solid rgba(56, 189, 248, 0.4)', fontSize: '0.8rem' }}
                    />
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={formData.model_name}
                  onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
                />
              )}
            </div>
          </div>

          {/* Gemini Key Input */}
          {formData.model_provider === 'gemini' ? (
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Gemini API Key {settings?.gemini_key_masked && <span style={{ color: '#34d399' }}>(Saved: {settings.gemini_key_masked})</span>}
              </label>
              <input
                type="password"
                placeholder={settings?.has_gemini_api_key ? '•••••••••••••••••••••••• (Leave blank to keep current)' : 'AIzaSy...'}
                value={formData.gemini_api_key}
                onChange={(e) => setFormData({ ...formData, gemini_api_key: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  Stored securely in backend environment or SQLite. Never exposed to browser.
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.72rem', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none' }}
                >
                  Get Free Gemini API Key <ExternalLink size={11} />
                </a>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Anthropic API Key {settings?.anthropic_key_masked && <span style={{ color: '#34d399' }}>(Saved: {settings.anthropic_key_masked})</span>}
              </label>
              <input
                type="password"
                placeholder={settings?.has_anthropic_api_key ? '•••••••••••••••••••••••• (Leave blank to keep current)' : 'sk-ant-api03-...'}
                value={formData.anthropic_api_key}
                onChange={(e) => setFormData({ ...formData, anthropic_api_key: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  Stored securely in backend environment or SQLite. Never exposed to browser.
                </span>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.72rem', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none' }}
                >
                  Get Anthropic Key <ExternalLink size={11} />
                </a>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestLlm}
              disabled={testingLlm}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              <RefreshCw size={14} className={testingLlm ? 'spin' : ''} />
              <span>{testingLlm ? 'Testing API...' : `Test ${formData.model_provider === 'gemini' ? 'Gemini' : 'Anthropic'} Connection`}</span>
            </button>
          </div>

          {llmTestResult && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.65rem 0.85rem',
              borderRadius: 6,
              fontSize: '0.8rem',
              background: llmTestResult.connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${llmTestResult.connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: llmTestResult.connected ? '#34d399' : '#fca5a5',
            }}>
              <strong>{llmTestResult.label || (llmTestResult.connected ? 'Success' : 'Error')}:</strong> {llmTestResult.message}
            </div>
          )}
        </div>

        {/* ── 2. Real Web Search Provider (Tavily Search API) ── */}
        <div style={{ background: 'rgba(31, 41, 55, 0.4)', padding: '1.15rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Search size={16} color="#38bdf8" />
              2. Web Search Provider (Tavily AI Search)
            </h3>
            <span className={`badge ${
              searchStatus?.status === 'connected' ? 'badge-success' : 'badge-ambiguous'
            }`}>
              {searchStatus?.label || (settings?.has_tavily_api_key ? 'Configured' : 'Missing Credentials (Fallback Active)')}
            </span>
          </div>

          <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.45 }}>
            Powers real-time internet search for job openings, products, and general web information.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.85rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Search Provider
              </label>
              <select
                value={formData.search_provider}
                onChange={(e) => setFormData({ ...formData, search_provider: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
              >
                <option value="tavily">Tavily Search API (Official Endpoint)</option>
                <option value="brave">Brave Search API</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                {formData.search_provider === 'tavily' ? 'Tavily API Key' : 'Brave API Token'}
                {formData.search_provider === 'tavily' && settings?.tavily_key_masked && (
                  <span style={{ color: '#34d399' }}> (Saved: {settings.tavily_key_masked})</span>
                )}
                {formData.search_provider === 'brave' && settings?.brave_key_masked && (
                  <span style={{ color: '#34d399' }}> (Saved: {settings.brave_key_masked})</span>
                )}
              </label>
              {formData.search_provider === 'tavily' ? (
                <input
                  type="password"
                  placeholder={settings?.has_tavily_api_key ? '•••••••••••••••••••••••• (Leave blank to keep current)' : 'tvly-...'}
                  value={formData.tavily_api_key}
                  onChange={(e) => setFormData({ ...formData, tavily_api_key: e.target.value })}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
                />
              ) : (
                <input
                  type="password"
                  placeholder={settings?.has_brave_api_key ? '•••••••••••••••••••••••• (Leave blank to keep current)' : 'BSA...'}
                  value={formData.brave_search_api_key}
                  onChange={(e) => setFormData({ ...formData, brave_search_api_key: e.target.value })}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              {formData.search_provider === 'tavily'
                ? 'Endpoint: api.tavily.com/search'
                : 'Endpoint: api.search.brave.com/res/v1/web/search'}
            </span>
            <a
              href={formData.search_provider === 'tavily' ? 'https://app.tavily.com' : 'https://brave.com/search/api/'}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.72rem', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none' }}
            >
              Get Free {formData.search_provider === 'tavily' ? 'Tavily' : 'Brave'} API Key <ExternalLink size={11} />
            </a>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestSearch}
              disabled={testingSearch}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              <RefreshCw size={14} className={testingSearch ? 'spin' : ''} />
              <span>{testingSearch ? 'Testing API...' : `Test ${formData.search_provider === 'tavily' ? 'Tavily' : 'Brave'} Connection`}</span>
            </button>
          </div>

          {searchTestResult && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.65rem 0.85rem',
              borderRadius: 6,
              fontSize: '0.8rem',
              background: searchTestResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${searchTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: searchTestResult.success ? '#34d399' : '#fca5a5',
            }}>
              <strong>{searchTestResult.success ? 'Success' : 'Error'}:</strong> {searchTestResult.message}
            </div>
          )}
        </div>

        {/* ── 3. Browser & Execution Engine Limits ── */}
        <div style={{ background: 'rgba(31, 41, 55, 0.4)', padding: '1.15rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Sliders size={16} color="#38bdf8" />
            3. Browser Engine Controls
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Headless Mode
              </label>
              <select
                value={formData.browser_headless}
                onChange={(e) => setFormData({ ...formData, browser_headless: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
              >
                <option value="false">Visible Browser (Headed)</option>
                <option value="true">Headless Background</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Step Timeout (ms)
              </label>
              <input
                type="number"
                step="1000"
                value={formData.browser_timeout}
                onChange={(e) => setFormData({ ...formData, browser_timeout: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Max Retries
              </label>
              <input
                type="number"
                min="0"
                max="5"
                value={formData.max_retries}
                onChange={(e) => setFormData({ ...formData, max_retries: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 6, background: '#0b1120', color: '#fff', border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>
        </div>

        {/* ── 4. Security Allowlist & Enforced Policies ── */}
        <div style={{ background: 'rgba(31, 41, 55, 0.4)', padding: '1.15rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Shield size={16} color="#10b981" />
            4. Security Allowlist & Enforced Policies
          </h3>

          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div>
              <strong style={{ color: '#fff' }}>Allowed Origins:</strong> {settings?.allowed_origins?.join(', ') || 'http://localhost:3001'}
            </div>
            <div>
              <strong style={{ color: '#fff' }}>Approval-Required Actions:</strong> {settings?.approval_required_actions?.join(', ') || 'submit_form, purchase, delete, send_message'}
            </div>
            <div>
              <strong style={{ color: '#fff' }}>Arbitrary Code Execution:</strong> <span style={{ color: '#34d399' }}>STRICTLY DISABLED</span> (Only validated schema actions permitted)
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.6rem 1.25rem' }}>
          <Save size={16} />
          <span>Save & Apply Settings</span>
        </button>
      </form>
    </div>
  );
}
