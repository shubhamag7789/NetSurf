'use strict';

const db = require('../storage/db');
const {
  classifyTask: classifyTaskService,
  extractLaptopConstraints,
  extractJobCriteria,
  extractTravelCriteria,
  extractProductCriteria,
} = require('../services/searchService');
require('dotenv').config();

let lastLlmError = null;
let lastLlmErrorCategory = null;

// Official Gemini Models as documented and supported by Google
const OFFICIAL_GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Next-gen thinking and multimodal model' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'High-speed multimodal generation with sub-second latency' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Optimized for high throughput and ultra-low cost/latency' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast, high-efficiency model for general text and reasoning tasks' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Advanced reasoning, math, and code generation with 2M token context' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Google API Endpoint)', description: 'Latest model referenced by Google generative language service' },
];

function getOfficialGeminiModels() {
  return OFFICIAL_GEMINI_MODELS;
}

function getActiveLlmProvider() {
  try {
    const dbProv = db.getSetting('model_provider');
    if (dbProv && dbProv.trim()) return dbProv.trim().toLowerCase();
  } catch {}
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('your-')) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-your-')) return 'anthropic';
  return 'gemini';
}

// ── 1. Google Gemini AI Integration ────────────────────────────────────────

function getGeminiApiKey() {
  try {
    const dbKey = db.getSetting('gemini_api_key');
    if (dbKey && dbKey.trim() && !dbKey.startsWith('your-gemini') && !dbKey.startsWith('AIza-your-key')) {
      return dbKey.trim();
    }
  } catch {}
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim() && !envKey.startsWith('your-gemini') && !envKey.startsWith('AIza-your-key')) {
    return envKey.trim();
  }
  return null;
}

function getGeminiModel() {
  try {
    const dbModel = db.getSetting('gemini_model');
    if (dbModel && dbModel.trim()) return dbModel.trim();
  } catch {}
  return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
}

/**
 * Sends a real request to the configured Gemini model using the official SDK.
 * Reports sanitized error categories:
 * - missing_credentials
 * - invalid_key
 * - unsupported_model
 * - quota_exceeded
 * - permission_denied
 * - network_failure
 * - malformed_request
 */
async function testGeminiConnection(apiKeyToTest, modelToTest) {
  const key = apiKeyToTest || getGeminiApiKey();
  if (!key) {
    return {
      connected: false,
      status: 'missing_credentials',
      label: 'Missing Credentials',
      provider: 'gemini',
      message: 'No GEMINI_API_KEY configured. Please provide a key from https://aistudio.google.com/app/apikey',
    };
  }

  const model = modelToTest || getGeminiModel();

  // Try official Google Gen AI SDK
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });

    const response = await ai.models.generateContent({
      model,
      contents: 'Respond with the single word: OK',
      config: {
        maxOutputTokens: 10,
        temperature: 0.1,
      },
    });

    const sample = response?.text?.trim() || 'OK';
    lastLlmError = null;
    lastLlmErrorCategory = null;

    return {
      connected: true,
      status: 'connected',
      label: 'Connected',
      provider: 'gemini',
      model,
      message: `Google Gemini connection verified successfully with model "${model}".`,
      sample,
    };
  } catch (sdkErr) {
    // Fallback or inspect error from Google API
    const rawMsg = sdkErr.message || '';
    const statusCode = sdkErr.status || 0;

    let errorCategory = 'request_failed';
    let label = 'Connection Test Failed';
    let cleanMessage = rawMsg;

    if (statusCode === 400 && (rawMsg.includes('API key not valid') || rawMsg.includes('API_KEY_INVALID'))) {
      errorCategory = 'invalid_key';
      label = 'Invalid API Key';
      cleanMessage = 'Gemini API key is invalid or unrecognized by Google AI Studio. Please verify your API key.';
    } else if (statusCode === 404 || rawMsg.includes('is not found') || rawMsg.includes('not supported for generateContent')) {
      errorCategory = 'unsupported_model';
      label = 'Unsupported Model';
      cleanMessage = `Model "${model}" is not a valid or accessible Google Gemini model. Please choose an official supported model such as gemini-2.0-flash, gemini-1.5-flash, or gemini-1.5-pro.`;
    } else if (statusCode === 429 || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('quota')) {
      errorCategory = 'quota_exceeded';
      label = 'Quota Exceeded';
      cleanMessage = 'Google Gemini API quota or rate limit exceeded. Please wait or check your Google AI Studio plan.';
    } else if (statusCode === 403 || rawMsg.includes('PERMISSION_DENIED')) {
      errorCategory = 'permission_denied';
      label = 'Permission Denied';
      cleanMessage = 'Permission denied or project billing disabled for this Google AI API key.';
    } else if (sdkErr.name === 'AbortError' || rawMsg.includes('ENOTFOUND') || rawMsg.includes('fetch failed')) {
      errorCategory = 'network_failure';
      label = 'Network Error';
      cleanMessage = `Network error connecting to Gemini API: ${rawMsg}`;
    } else if (statusCode === 400) {
      errorCategory = 'malformed_request';
      label = 'Malformed Request';
      cleanMessage = `Gemini API rejected request parameters: ${rawMsg}`;
    }

    lastLlmError = cleanMessage;
    lastLlmErrorCategory = errorCategory;

    return {
      connected: false,
      status: errorCategory,
      label,
      provider: 'gemini',
      model,
      statusCode,
      message: cleanMessage,
    };
  }
}

// ── 2. Anthropic Claude Integration ────────────────────────────────────────

function getAnthropicApiKey() {
  try {
    const dbKey = db.getSetting('anthropic_api_key');
    if (dbKey && dbKey.trim() && !dbKey.startsWith('sk-ant-your-key')) {
      return dbKey.trim();
    }
  } catch {}
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.trim() && !envKey.startsWith('sk-ant-your-key')) {
    return envKey.trim();
  }
  return null;
}

function getAnthropicClient() {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    return new Anthropic.default({ apiKey });
  } catch (err) {
    console.warn('[Planner] Failed to instantiate Anthropic client:', err.message);
    return null;
  }
}

async function testAnthropicConnection(apiKeyToTest) {
  const key = apiKeyToTest || getAnthropicApiKey();
  if (!key) {
    return {
      connected: false,
      status: 'missing_credentials',
      label: 'Missing Credentials',
      message: 'No Anthropic API key configured.',
    };
  }

  const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: key });
    const response = await client.messages.create({
      model: modelName,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Respond with the single word: OK' }],
    });
    lastLlmError = null;
    lastLlmErrorCategory = null;
    return {
      connected: true,
      status: 'connected',
      label: 'Connected',
      provider: 'anthropic',
      model: modelName,
      message: `Anthropic connection verified with ${modelName}.`,
      sample: response.content[0]?.text || 'OK',
    };
  } catch (err) {
    lastLlmError = err.message;
    lastLlmErrorCategory = 'request_failed';
    return {
      connected: false,
      status: 'request_failed',
      label: 'Connection Test Failed',
      provider: 'anthropic',
      model: modelName,
      message: `Anthropic API test failed: ${err.message}`,
    };
  }
}

// ── Provider Status Checker ───────────────────────────────────────────────

function getPlannerStatus() {
  const provider = getActiveLlmProvider();

  if (provider === 'gemini') {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

    if (!apiKey) {
      return {
        status: 'missing_credentials',
        provider: 'gemini',
        model,
        fallbackActive: true,
        hasKey: false,
        label: 'Missing Credentials (Fallback Active)',
        message: 'No GEMINI_API_KEY configured. Configure your free Gemini key in Settings or .env to enable model-driven planning.',
        setupUrl: 'https://aistudio.google.com/app/apikey',
      };
    }

    const maskedKey = `${apiKey.substring(0, 6)}••••••••${apiKey.substring(Math.max(0, apiKey.length - 4))}`;

    if (lastLlmError) {
      return {
        status: lastLlmErrorCategory || 'request_failed',
        provider: 'gemini',
        model,
        fallbackActive: true,
        hasKey: true,
        maskedKey,
        label: 'Request Failed (Fallback Active)',
        message: `Last Gemini API invocation failed: ${lastLlmError}. Deterministic fallback active.`,
        setupUrl: 'https://aistudio.google.com/app/apikey',
      };
    }

    return {
      status: 'configured',
      provider: 'gemini',
      model,
      fallbackActive: false,
      hasKey: true,
      maskedKey,
      label: 'Configured',
      message: `Google Gemini configured with model "${model}". Live model-driven planning enabled.`,
      setupUrl: 'https://aistudio.google.com/app/apikey',
    };
  }

  // Anthropic Claude Status
  const apiKey = getAnthropicApiKey();
  const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

  if (!apiKey) {
    return {
      status: 'missing_credentials',
      provider: 'anthropic',
      model: modelName,
      fallbackActive: true,
      hasKey: false,
      label: 'Missing Credentials (Fallback Active)',
      message: 'No ANTHROPIC_API_KEY configured. Deterministic fallback planner will handle supported workflows.',
      setupUrl: 'https://console.anthropic.com/settings/keys',
    };
  }

  const maskedKey = `${apiKey.substring(0, 7)}••••••••${apiKey.substring(Math.max(0, apiKey.length - 4))}`;

  if (lastLlmError) {
    return {
      status: 'request_failed',
      provider: 'anthropic',
      model: modelName,
      fallbackActive: true,
      hasKey: true,
      maskedKey,
      label: 'Request Failed (Fallback Active)',
      message: `Anthropic API error: ${lastLlmError}. Deterministic fallback active.`,
      setupUrl: 'https://console.anthropic.com/settings/keys',
    };
  }

  return {
    status: 'configured',
    provider: 'anthropic',
    model: modelName,
    fallbackActive: false,
    hasKey: true,
    maskedKey,
    label: 'Configured',
    message: `Anthropic API configured with ${modelName}. Live model-driven planning enabled.`,
    setupUrl: 'https://console.anthropic.com/settings/keys',
  };
}

// ── Plan Schema Validation ────────────────────────────────────────────────

const VALID_STEP_TYPES = [
  'navigate', 'inspect_page', 'click', 'fill', 'select_option',
  'scroll', 'extract_information', 'wait', 'verify', 'finish',
  'search_jobs', 'search_travel', 'compare_travel', 'search_products', 'search_web',
  'verify_results', 'summarize_results', 'explain_limitation'
];

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.steps)) {
    return { valid: false, reason: 'Plan must have a "steps" array.' };
  }
  if (plan.steps.length === 0) {
    return { valid: false, reason: 'Plan must have at least one step.' };
  }
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (!step.type || !VALID_STEP_TYPES.includes(step.type)) {
      return { valid: false, reason: `Step ${i}: invalid type "${step.type}". Permitted: ${VALID_STEP_TYPES.join(', ')}` };
    }
    if (!step.description) {
      return { valid: false, reason: `Step ${i}: missing "description" field.` };
    }
    if (step.type === 'navigate' && !step.url) {
      return { valid: false, reason: `Step ${i} (navigate) must have a "url" property.` };
    }
  }
  return { valid: true };
}

// ── Intent Classification & Task Routing ──────────────────────────────────

const DEMO_SITE_URL = `http://localhost:${process.env.DEMO_SITE_PORT || 3001}`;

function classifyTask(userRequest) {
  return classifyTaskService(userRequest);
}

function extractConstraints(userRequest) {
  return extractLaptopConstraints(userRequest);
}

// ── Automatic Workflow Memory Adaptation ──────────────────────────────────

function adaptPlanFromMemory(memoryRecord, userRequest, intentResult) {
  const steps = [];
  const template = memoryRecord.plan_template || [];
  const constraints = intentResult.criteria || {};

  for (const step of template) {
    const s = JSON.parse(JSON.stringify(step));

    if (s.target && (s.target.name === 'maxPrice' || s.target.id === 'max-price')) {
      if (constraints.maxPrice) {
        s.value = String(constraints.maxPrice);
        s.description = `Set maximum price filter to ₹${constraints.maxPrice.toLocaleString('en-IN')} (adapted from memory)`;
        steps.push(s);
      }
      continue;
    }

    if (s.target && (s.target.name === 'minRam' || s.target.id === 'min-ram')) {
      if (constraints.minRam) {
        s.value = String(constraints.minRam);
        s.description = `Set minimum RAM filter to ${constraints.minRam}GB (adapted from memory)`;
        steps.push(s);
      }
      continue;
    }

    if (s.type === 'verify') {
      s.constraints = constraints;
      s.description = `Verify extracted products meet current constraints: price ≤ ₹${constraints.maxPrice?.toLocaleString('en-IN') || 'any'}, RAM ≥ ${constraints.minRam || 'any'}GB (adapted from memory)`;
      steps.push(s);
      continue;
    }

    if (s.type === 'search_jobs' || s.type === 'verify_results') {
      s.criteria = constraints;
      steps.push(s);
      continue;
    }

    steps.push(s);
  }

  return {
    taskCategory: memoryRecord.task_category,
    intent: intentResult.intent,
    criteria: constraints,
    userRequest,
    generatedBy: 'adapted_from_memory',
    isFallback: false,
    reusedMemoryId: memoryRecord.id,
    reusedPattern: memoryRecord.user_request_pattern,
    steps,
  };
}

// ── Deterministic Fallback Planner ────────────────────────────────────────

function generateDeterministicPlan(userRequest, intentResult) {
  const { intent, criteria = {} } = intentResult;

  const base = {
    taskCategory: intent,
    intent,
    criteria,
    userRequest,
    generatedBy: 'deterministic_fallback',
    isFallback: true,
    generatedAt: new Date().toISOString(),
  };

  // 1. TRAVEL COMPARISON (e.g. cheapest train tickets from Delhi to Patna)
  if (intent === 'travel_comparison') {
    const origin = criteria.origin || 'Delhi';
    const destination = criteria.destination || 'Patna';

    return {
      ...base,
      plannerNote: `Travel comparison intent detected: comparing train fares, journey duration, and schedules from ${origin} to ${destination}.`,
      steps: [
        {
          type: 'search_travel',
          description: `Retrieve train schedules, fare options, and booking links from ${origin} to ${destination}`,
          criteria,
          expectedOutcome: 'Structured train comparison data and authentic booking portal links',
          timeout: 10000,
        },
        {
          type: 'compare_travel',
          description: `Compare cheapest fare, fastest journey, and berth availability trade-offs for ${origin} to ${destination}`,
          criteria,
          expectedOutcome: 'Comparison matrix and recommendations compiled',
          timeout: 5000,
        },
        {
          type: 'finish',
          description: 'Present finalized travel comparison with verified booking links',
          expectedOutcome: 'Travel comparison concluded',
          timeout: 3000,
        },
      ],
    };
  }

  // 2. JOB SEARCH (Strictly respects requested role, e.g. Data Analyst)
  if (intent === 'job_search') {
    const role = criteria.role || 'Software Developer';
    const location = criteria.country || criteria.location || 'India';
    const exp = criteria.experience || 'Fresher';

    return {
      ...base,
      plannerNote: `Job search intent detected: searching live web for ${role} positions (${exp}) in ${location}.`,
      steps: [
        {
          type: 'search_jobs',
          description: `Search live web for ${role} job openings for ${exp} in ${location}`,
          criteria,
          expectedOutcome: `Query real search engine for verified ${role} listings with genuine source URLs`,
          timeout: 15000,
        },
        {
          type: 'verify_results',
          description: `Verify retrieved job listings against requirements: role=${role}, experience=${exp}, location=${location}`,
          criteria,
          expectedOutcome: 'Check criteria match and distinguish verified job openings from search snippets',
          timeout: 5000,
        },
        {
          type: 'summarize_results',
          description: 'Format job opportunities with direct clickable links, portal names, and verification tags',
          criteria,
          expectedOutcome: 'Compile grounded job report with clickable source links',
          timeout: 5000,
        },
        {
          type: 'finish',
          description: 'Present finalized job openings with clickable links and provider transparency',
          expectedOutcome: 'Job search complete with full source URLs',
          timeout: 3000,
        },
      ],
    };
  }

  // 3. PRODUCT COMPARISON & SEARCH
  if (intent === 'product_comparison' || intent === 'product_search') {
    const prodName = criteria.productName || criteria.product || 'products';
    return {
      ...base,
      plannerNote: `Product search intent detected: querying live web for ${prodName} with pricing and merchant links.`,
      steps: [
        {
          type: 'search_products',
          description: `Search web for ${prodName} with price and merchant details`,
          criteria,
          expectedOutcome: 'Retrieve live merchant listings with real source URLs',
          timeout: 15000,
        },
        {
          type: 'verify_results',
          description: 'Verify extracted pricing and merchant domains against user query',
          criteria,
          expectedOutcome: 'Check constraints and mark verified merchant links',
          timeout: 5000,
        },
        {
          type: 'summarize_results',
          description: 'Synthesize product comparison with clickable merchant links',
          criteria,
          expectedOutcome: 'Product comparison synthesized with sources',
          timeout: 5000,
        },
        {
          type: 'finish',
          description: 'Deliver product comparison with verified merchant links',
          expectedOutcome: 'Product research concluded',
          timeout: 3000,
        },
      ],
    };
  }

  // 4. GENERAL WEB SEARCH & RESEARCH
  if (intent === 'web_search') {
    const q = criteria.query || userRequest;
    return {
      ...base,
      plannerNote: `Web research intent detected: executing web search for "${q}".`,
      steps: [
        {
          type: 'search_web',
          description: `Execute web search for: "${q}"`,
          query: q,
          expectedOutcome: 'Retrieve web search results with genuine source URLs',
          timeout: 15000,
        },
        {
          type: 'summarize_results',
          description: 'Synthesize research findings grounded in retrieved source data',
          expectedOutcome: 'Grounded summary compiled with source attribution',
          timeout: 5000,
        },
        {
          type: 'finish',
          description: 'Deliver synthesized research with clickable citations',
          expectedOutcome: 'Web research complete',
          timeout: 3000,
        },
      ],
    };
  }

  // 5. LOCAL DEMO STORE LAPTOP CATALOG (Explicit demo store only)
  if (intent === 'demo_store_laptop') {
    const steps = [
      {
        type: 'navigate',
        description: 'Navigate to the Netsurf demo laptop store sandbox',
        url: DEMO_SITE_URL,
        expectedOutcome: 'Demo store catalog loaded on localhost:3001',
        timeout: 10000,
      },
      {
        type: 'inspect_page',
        description: 'Inspect catalog to observe search bar and specification filters',
        expectedOutcome: 'Search and filter controls identified in live DOM',
        timeout: 5000,
      },
      {
        type: 'fill',
        description: 'Enter search term "laptop" in the catalog search box',
        target: { role: 'searchbox', text: 'Search', label: 'Search laptops', id: 'search-input' },
        value: 'laptop',
        expectedOutcome: 'Search box contains "laptop"',
        timeout: 5000,
      },
      {
        type: 'click',
        description: 'Click search button to filter synthetic laptops',
        target: { role: 'button', text: 'Search' },
        expectedOutcome: 'Search query executed',
        timeout: 5000,
      },
    ];

    if (criteria.maxPrice) {
      steps.push({
        type: 'fill',
        description: `Set maximum price filter to ₹${criteria.maxPrice.toLocaleString('en-IN')}`,
        target: { id: 'max-price', name: 'maxPrice', label: 'Max Price' },
        value: String(criteria.maxPrice),
        expectedOutcome: 'Price filter populated',
        timeout: 5000,
      });
    }

    if (criteria.minRam) {
      steps.push({
        type: 'select_option',
        description: `Set minimum RAM filter to ${criteria.minRam}GB`,
        target: { id: 'min-ram', name: 'minRam' },
        value: String(criteria.minRam),
        expectedOutcome: 'RAM option selected',
        timeout: 5000,
      });
    }

    steps.push(
      {
        type: 'click',
        description: 'Apply selected specification filters',
        target: { role: 'button', text: 'Apply Filters', id: 'apply-filters-btn' },
        expectedOutcome: 'Filtered results rendered in product grid',
        timeout: 8000,
      },
      {
        type: 'wait',
        description: 'Wait for filtered results to stabilize in DOM',
        ms: 1000,
        expectedOutcome: 'Product grid stabilized',
        timeout: 5000,
      },
      {
        type: 'extract_information',
        description: 'Extract laptop specifications (price, RAM, CPU, storage) from DOM',
        target: 'product_cards',
        expectedOutcome: 'Structured product records extracted from DOM',
        timeout: 5000,
      },
      {
        type: 'verify',
        description: `Verify extracted laptops meet criteria: price ≤ ₹${criteria.maxPrice?.toLocaleString('en-IN') || 'any'}, RAM ≥ ${criteria.minRam || 'any'}GB`,
        constraints: criteria,
        expectedOutcome: 'All product specifications verified against criteria',
        timeout: 3000,
      },
      {
        type: 'finish',
        description: 'Formulate grounded recommendation from verified demo laptops',
        expectedOutcome: 'Demo store recommendation complete',
        timeout: 3000,
      }
    );

    return {
      ...base,
      plannerNote: `Demo store laptop search: applying local catalog filters (maxPrice: ₹${criteria.maxPrice || 'any'}, minRam: ${criteria.minRam || 'any'}GB).`,
      steps,
    };
  }

  // 6. UNSUPPORTED OR AMBIGUOUS TASK
  return {
    ...base,
    plannerNote: 'Unsupported or ambiguous instruction: explaining limitation to user without executing unrelated actions.',
    steps: [
      {
        type: 'explain_limitation',
        description: 'Communicate limitation and ask for clarification',
        reason: intentResult.reason || 'Netsurf supports General Research, Product Comparisons, Travel Comparisons, Job Searches, and the local synthetic Demo Store. Please clarify your request.',
        expectedOutcome: 'Honest communication of task boundary',
        timeout: 3000,
      },
      {
        type: 'finish',
        description: 'Conclude task safely without navigating to unrelated websites',
        expectedOutcome: 'Execution safely finished',
        timeout: 3000,
      },
    ],
  };
}

// ── Model Planner Prompt ──────────────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You are Netsurf's intelligent task planner. Convert user requests into structured JSON action plans.

SUPPORTED WORKFLOWS:
1. "travel_comparison": Use steps [search_travel, compare_travel, finish]. Compare train fares, schedules, and duration.
2. "job_search": Use steps [search_jobs, verify_results, summarize_results, finish].
3. "product_comparison": Use steps [search_products, verify_results, summarize_results, finish].
4. "web_search": Use steps [search_web, summarize_results, finish].
5. "demo_store_laptop": ONLY when the user explicitly targets the local demo store (http://localhost:3001). Use steps [navigate, inspect_page, fill, click, select_option, extract_information, verify, finish].
6. "unsupported": For instructions outside these capabilities, use [explain_limitation, finish].

RULES:
- NEVER route a job search, travel comparison, or generic web search to the local laptop store (localhost:3001).
- Ground all plans strictly in the user's explicit goals.
- Never invent URLs, companies, or commands.
- Respond with pure JSON only matching the schema.

RESPONSE FORMAT:
{
  "taskCategory": "travel_comparison|job_search|product_comparison|web_search|demo_store_laptop|unsupported",
  "intent": "travel_comparison|job_search|product_comparison|web_search|demo_store_laptop|unsupported",
  "criteria": {},
  "plannerNote": "Short explanation of the plan",
  "steps": [
    {
      "type": "search_travel|compare_travel|search_jobs|search_products|search_web|verify_results|summarize_results|navigate|inspect_page|click|fill|select_option|wait|verify|explain_limitation|finish",
      "description": "Human-readable description",
      "criteria": {},
      "query": "string (optional)",
      "url": "string (for navigate)",
      "expectedOutcome": "string",
      "timeout": 10000
    }
  ]
}`;

// ── Google Gemini Planner ──────────────────────────────────────────────────

async function planWithGemini(userRequest, intentResult, memoryHints) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const model = getGeminiModel();

  let memoryContext = '';
  if (memoryHints && memoryHints.length > 0) {
    memoryContext = `\n\nRELEVANT MEMORY FROM PREVIOUS SUCCESSFUL RUNS IN THIS CATEGORY:\n${JSON.stringify(
      memoryHints.map(m => ({
        category: m.task_category,
        pattern: m.user_request_pattern,
        planStructure: m.plan_template.map(s => `${s.type}: ${s.description}`),
      })),
      null,
      2
    )}`;
  }

  const promptText = `User request: "${userRequest}"\nDetected Intent: ${intentResult.intent}\nExtracted Criteria: ${JSON.stringify(intentResult.criteria)}${memoryContext}\n\nGenerate the structured action plan. Pure JSON only.`;

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        systemInstruction: LLM_SYSTEM_PROMPT,
      },
    });

    const rawText = response?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Gemini response');
    const parsed = JSON.parse(jsonMatch[0]);
    lastLlmError = null;
    lastLlmErrorCategory = null;
    return parsed;
  } catch (err) {
    // Fallback to direct REST fetch
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${LLM_SYSTEM_PROMPT}\n\n${promptText}` }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          lastLlmError = null;
          lastLlmErrorCategory = null;
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch {}

    lastLlmError = err.message;
    console.warn('[Planner] Gemini API call failed:', err.message);
    return null;
  }
}

// ── Claude LLM Planner ────────────────────────────────────────────────────

async function planWithClaude(userRequest, intentResult, memoryHints) {
  const client = getAnthropicClient();
  if (!client) return null;

  const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

  let memoryContext = '';
  if (memoryHints && memoryHints.length > 0) {
    memoryContext = `\n\nRELEVANT MEMORY FROM PREVIOUS SUCCESSFUL RUNS IN THIS CATEGORY:\n${JSON.stringify(
      memoryHints.map(m => ({
        category: m.task_category,
        pattern: m.user_request_pattern,
        planStructure: m.plan_template.map(s => `${s.type}: ${s.description}`),
      })),
      null,
      2
    )}`;
  }

  const userMessage = `User request: "${userRequest}"\nDetected Intent: ${intentResult.intent}\nExtracted Criteria: ${JSON.stringify(intentResult.criteria)}${memoryContext}\n\nGenerate the structured action plan. JSON only.`;

  try {
    const response = await client.messages.create({
      model: modelName,
      max_tokens: 2000,
      messages: [{ role: 'user', content: userMessage }],
      system: LLM_SYSTEM_PROMPT,
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');
    const parsed = JSON.parse(jsonMatch[0]);
    lastLlmError = null;
    lastLlmErrorCategory = null;
    return parsed;
  } catch (err) {
    lastLlmError = err.message;
    lastLlmErrorCategory = 'request_failed';
    console.warn('[Planner] Claude API call failed:', err.message);
    return null;
  }
}

// ── Main Planner Entry ────────────────────────────────────────────────────

async function generatePlan(userRequest) {
  const intentResult = classifyTask(userRequest);
  const taskCategory = intentResult.intent;

  const memoryHints = taskCategory !== 'unsupported' ? findRelevantMemory(taskCategory) : [];

  // 1. Check if memory has an exact / highly similar reusable workflow
  if (memoryHints.length > 0 && taskCategory === 'demo_store_laptop') {
    const bestMemory = memoryHints[0];
    const adapted = adaptPlanFromMemory(bestMemory, userRequest, intentResult);
    const validation = validatePlan(adapted);
    if (validation.valid) {
      console.log(`[Planner] Reusing and adapting workflow memory ${bestMemory.id} for category ${taskCategory}`);
      return adapted;
    }
  }

  // 2. Try configured LLM (Gemini or Claude)
  const activeProvider = getActiveLlmProvider();
  if (activeProvider === 'gemini') {
    const geminiPlan = await planWithGemini(userRequest, intentResult, memoryHints);
    if (geminiPlan) {
      const validation = validatePlan(geminiPlan);
      if (validation.valid) {
        console.log(`[Planner] Generated valid model plan using Google Gemini (${getGeminiModel()})`);
        return {
          ...geminiPlan,
          generatedBy: 'google_gemini',
          model: getGeminiModel(),
          isFallback: false,
        };
      }
    }
  } else if (activeProvider === 'anthropic') {
    const claudePlan = await planWithClaude(userRequest, intentResult, memoryHints);
    if (claudePlan) {
      const validation = validatePlan(claudePlan);
      if (validation.valid) {
        console.log('[Planner] Generated valid model plan using Claude');
        return {
          ...claudePlan,
          generatedBy: 'anthropic_claude',
          isFallback: false,
        };
      }
    }
  }

  // 3. Fallback to deterministic planner
  console.log(`[Planner] Using deterministic planner for intent "${taskCategory}"`);
  const deterministicPlan = generateDeterministicPlan(userRequest, intentResult);
  const validation = validatePlan(deterministicPlan);
  if (!validation.valid) {
    throw new Error(`Fallback plan invalid: ${validation.reason}`);
  }

  return deterministicPlan;
}

// ── Memory helper ──────────────────────────────────────────────────────────

function findRelevantMemory(taskCategory) {
  try {
    return db.findRelevantMemory(taskCategory);
  } catch (err) {
    console.warn('[Planner] Failed to retrieve memory:', err.message);
    return [];
  }
}

module.exports = {
  generatePlan,
  validatePlan,
  classifyTask,
  extractConstraints,
  getPlannerStatus,
  testGeminiConnection,
  testAnthropicConnection,
  getGeminiApiKey,
  getGeminiModel,
  getActiveLlmProvider,
  getOfficialGeminiModels,
  OFFICIAL_GEMINI_MODELS,
};
