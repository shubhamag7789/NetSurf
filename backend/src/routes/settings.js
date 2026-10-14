'use strict';

const express = require('express');
const db = require('../storage/db');
const { getAllowedOrigins, getApprovalRequiredActions } = require('../security/safety');
const {
  getPlannerStatus,
  testGeminiConnection,
  testAnthropicConnection,
  getGeminiApiKey,
  getGeminiModel,
  getActiveLlmProvider,
} = require('../agent/planner');
const {
  getSearchProviderStatus,
  testTavilyConnection,
  testBraveConnection,
  getTavilyApiKey,
  getActiveSearchProvider,
} = require('../services/searchService');

const router = express.Router();

// GET /api/settings - get current settings (strictly omitting secret API keys)
router.get('/', (req, res) => {
  const settings = db.getAllSettings();
  const plannerStatus = getPlannerStatus();
  const searchStatus = getSearchProviderStatus();

  const geminiKey = getGeminiApiKey();
  const tavilyKey = getTavilyApiKey();

  // Expose safe view of settings; secrets are NEVER exposed in response
  const safeSettings = {
    ...settings,
    model_provider: getActiveLlmProvider(),
    gemini_model: getGeminiModel(),
    has_gemini_api_key: Boolean(geminiKey),
    gemini_key_masked: geminiKey ? `${geminiKey.substring(0, 6)}••••••••${geminiKey.substring(Math.max(0, geminiKey.length - 4))}` : null,
    has_anthropic_api_key: plannerStatus.hasKey,
    anthropic_key_masked: plannerStatus.maskedKey || null,

    search_provider: getActiveSearchProvider(),
    has_tavily_api_key: Boolean(tavilyKey),
    tavily_key_masked: tavilyKey ? `${tavilyKey.substring(0, 5)}••••••••${tavilyKey.substring(Math.max(0, tavilyKey.length - 4))}` : null,
    has_brave_api_key: searchStatus.hasKey,
    brave_key_masked: searchStatus.maskedKey || null,

    planner_status: plannerStatus,
    search_status: searchStatus,
    allowed_origins: getAllowedOrigins(),
    approval_required_actions: getApprovalRequiredActions(),
  };

  // Strip raw keys if present
  delete safeSettings.gemini_api_key;
  delete safeSettings.tavily_api_key;
  delete safeSettings.anthropic_api_key;
  delete safeSettings.brave_search_api_key;

  res.json({ settings: safeSettings });
});

// GET /api/settings/gemini-models - get official Google Gemini model definitions
router.get('/gemini-models', (req, res) => {
  const { getOfficialGeminiModels } = require('../agent/planner');
  res.json({ models: getOfficialGeminiModels() });
});

// POST /api/settings/test-llm - test active LLM connection (Gemini or Anthropic)
router.post('/test-llm', async (req, res) => {
  const { provider, apiKey, model } = req.body || {};
  const activeProvider = provider || getActiveLlmProvider();

  if (activeProvider === 'anthropic') {
    const result = await testAnthropicConnection(apiKey);
    return res.json(result);
  }

  // Default to Gemini
  const result = await testGeminiConnection(apiKey, model);
  res.json(result);
});

// POST /api/settings/test-gemini - test Google Gemini AI connection
router.post('/test-gemini', async (req, res) => {
  const { apiKey, model } = req.body || {};
  const result = await testGeminiConnection(apiKey, model);
  res.json(result);
});

// POST /api/settings/test-connection - legacy alias for LLM connection test
router.post('/test-connection', async (req, res) => {
  const { apiKey, model, provider } = req.body || {};
  const activeProvider = provider || getActiveLlmProvider();
  if (activeProvider === 'anthropic') {
    const result = await testAnthropicConnection(apiKey);
    return res.json(result);
  }
  const result = await testGeminiConnection(apiKey, model);
  res.json(result);
});

// POST /api/settings/test-search - test active Search connection (Tavily or Brave)
router.post('/test-search', async (req, res) => {
  const { provider, apiKey } = req.body || {};
  const activeProvider = provider || getActiveSearchProvider();

  if (activeProvider === 'brave') {
    const result = await testBraveConnection(apiKey);
    return res.json(result);
  }

  // Default to Tavily
  const result = await testTavilyConnection(apiKey);
  res.json(result);
});

// POST /api/settings/test-tavily - test Tavily Search connection explicitly
router.post('/test-tavily', async (req, res) => {
  const { apiKey } = req.body || {};
  const result = await testTavilyConnection(apiKey);
  res.json(result);
});

// POST /api/settings - update settings securely
router.post('/', (req, res) => {
  const {
    model_provider,
    model_name,
    gemini_model,
    search_provider,
    browser_headless,
    browser_timeout,
    max_retries,
    memory_enabled,
    gemini_api_key,
    tavily_api_key,
    anthropic_api_key,
    brave_search_api_key,
  } = req.body;

  if (model_provider !== undefined) db.setSetting('model_provider', model_provider);
  if (model_name !== undefined) db.setSetting('model_name', model_name);
  if (gemini_model !== undefined) db.setSetting('gemini_model', gemini_model);
  if (search_provider !== undefined) db.setSetting('search_provider', search_provider);
  if (browser_headless !== undefined) db.setSetting('browser_headless', String(browser_headless));
  if (browser_timeout !== undefined) db.setSetting('browser_timeout', String(browser_timeout));
  if (max_retries !== undefined) db.setSetting('max_retries', String(max_retries));
  if (memory_enabled !== undefined) db.setSetting('memory_enabled', String(memory_enabled));

  // Handle credentials securely — store in backend DB only, never log or echo
  if (gemini_api_key && typeof gemini_api_key === 'string' && gemini_api_key.trim()) {
    db.setSetting('gemini_api_key', gemini_api_key.trim());
  }
  if (tavily_api_key && typeof tavily_api_key === 'string' && tavily_api_key.trim()) {
    db.setSetting('tavily_api_key', tavily_api_key.trim());
  }
  if (anthropic_api_key && typeof anthropic_api_key === 'string' && anthropic_api_key.trim()) {
    db.setSetting('anthropic_api_key', anthropic_api_key.trim());
  }
  if (brave_search_api_key && typeof brave_search_api_key === 'string' && brave_search_api_key.trim()) {
    db.setSetting('brave_search_api_key', brave_search_api_key.trim());
  }

  const safeSettings = db.getAllSettings();
  delete safeSettings.gemini_api_key;
  delete safeSettings.tavily_api_key;
  delete safeSettings.anthropic_api_key;
  delete safeSettings.brave_search_api_key;

  res.json({
    message: 'Settings updated successfully.',
    settings: safeSettings,
    planner_status: getPlannerStatus(),
    search_status: getSearchProviderStatus(),
  });
});

module.exports = router;
