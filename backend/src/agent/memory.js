'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../storage/db');
require('dotenv').config();

const MEMORY_ENABLED = process.env.MEMORY_ENABLED !== 'false';

// Fields that must NEVER be stored in memory (security)
const BLOCKED_FIELDS = ['password', 'token', 'apiKey', 'api_key', 'credit_card', 'cvv', 'ssn'];

function sanitizeForMemory(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (BLOCKED_FIELDS.some(f => key.toLowerCase().includes(f))) continue;
    result[key] = typeof value === 'object' ? sanitizeForMemory(value) : value;
  }
  return result;
}

/**
 * Save a successful task run to workflow memory.
 * Generalizes the plan so it can be reused with different parameters.
 */
async function saveSuccessfulRun(task) {
  if (!MEMORY_ENABLED) return null;
  if (task.status !== 'completed') return null;

  try {
    const plan = task.plan;
    if (!plan || !plan.steps) return null;

    // Generalize the plan — replace specific values with placeholders
    const generalizedSteps = plan.steps.map(step => {
      const s = { ...step };
      // Generalize specific filter values while preserving base search query
      if (s.type === 'fill' && s.value) {
        if (s.target?.name === 'maxPrice' || s.target?.id === 'max-price') {
          s.value = '{{maxPrice}}';
        } else if (s.target?.role === 'searchbox' || s.target?.id === 'search-input' || /search/i.test(s.target?.text || '')) {
          s.value = 'laptop';
        } else {
          s.value = `{{${step.target?.label || step.target?.name || 'value'}}}`;
        }
      }
      if (s.type === 'select_option' && s.value) {
        s.value = `{{${step.target?.id || step.target?.name || 'option'}}}`;
      }
      return s;
    });

    const record = {
      id: uuidv4(),
      task_category: plan.taskCategory || 'unknown',
      user_request_pattern: generalizeRequest(task.user_request),
      plan_template: generalizedSteps,
      constraints: sanitizeForMemory(plan.constraints || {}),
      successful_action_patterns: extractSuccessPatterns(task),
      failure_patterns: extractFailurePatterns(task),
      verification_conditions: extractVerificationConditions(plan),
    };

    const savedId = db.saveMemory(record);
    console.log(`[Memory] Saved workflow memory ${savedId} for category "${record.task_category}"`);
    return savedId;
  } catch (err) {
    console.error('[Memory] Failed to save:', err.message);
    return null;
  }
}

/**
 * Generalize a user request for pattern storage.
 * Replaces specific numbers and values with placeholders.
 */
function generalizeRequest(request) {
  return request
    .replace(/₹[\d,]+/g, '₹{{PRICE}}')
    .replace(/\d+\s*(?:gb|tb)/gi, '{{RAM_OR_STORAGE}}')
    .replace(/\d{4,}/g, '{{NUMBER}}');
}

function extractSuccessPatterns(task) {
  const actions = task.actions || [];
  return actions
    .filter(a => a.status === 'success')
    .map(a => ({
      type: a.type,
      targetHint: a.target?.text || a.target?.label || a.target?.id,
      note: a.description,
    }))
    .slice(0, 10); // Limit to 10 patterns
}

function extractFailurePatterns(task) {
  const actions = task.actions || [];
  return actions
    .filter(a => a.status === 'failed' || a.status === 'recovered')
    .map(a => ({
      type: a.type,
      error: a.error,
      recovery: a.recoveryNote,
    }))
    .slice(0, 5);
}

function extractVerificationConditions(plan) {
  return (plan.steps || [])
    .filter(s => s.type === 'verify')
    .map(s => s.constraints || {});
}

/**
 * Retrieve relevant memory for a task category.
 */
function getRelevantMemory(taskCategory) {
  return db.findRelevantMemory(taskCategory);
}

/**
 * Mark a memory record as used (for ranking).
 */
function markMemoryUsed(memoryId) {
  if (memoryId) {
    db.incrementMemoryUse(memoryId);
  }
}

module.exports = {
  saveSuccessfulRun,
  getRelevantMemory,
  markMemoryUsed,
  generalizeRequest,
};
