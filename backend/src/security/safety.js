'use strict';

require('dotenv').config();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
  .split(',')
  .map(s => s.trim().toLowerCase());

const APPROVAL_REQUIRED_ACTIONS = (process.env.APPROVAL_REQUIRED_ACTIONS || 'submit_form,purchase,delete,send_message')
  .split(',')
  .map(s => s.trim().toLowerCase());

const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];

// Validate a URL before navigation
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { allowed: false, reason: 'URL is missing or not a string.' };
  }

  const lowerUrl = url.toLowerCase().trim();

  for (const scheme of DANGEROUS_SCHEMES) {
    if (lowerUrl.startsWith(scheme)) {
      return { allowed: false, reason: `Dangerous URL scheme "${scheme}" is not permitted.` };
    }
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: `Invalid URL: "${url}"` };
  }

  const origin = parsed.origin.toLowerCase();
  const isAllowed = ALLOWED_ORIGINS.some(allowed => {
    // Allow exact match or same host (ignore trailing slash)
    return origin === allowed || origin.startsWith(allowed);
  });

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Navigation to "${origin}" is not in the approved origin list. Allowed: ${ALLOWED_ORIGINS.join(', ')}`
    };
  }

  return { allowed: true };
}

// Check if an action type requires user approval
function requiresApproval(actionType) {
  return APPROVAL_REQUIRED_ACTIONS.includes(actionType.toLowerCase());
}

// Validate the action schema — prevent arbitrary code execution
const VALID_ACTION_TYPES = new Set([
  'navigate', 'inspect_page', 'click', 'fill', 'select_option',
  'scroll', 'extract_information', 'wait', 'verify', 'finish',
  'search_jobs', 'search_travel', 'compare_travel', 'search_products', 'search_web', 'verify_results', 'summarize_results', 'explain_limitation',
  ...APPROVAL_REQUIRED_ACTIONS
]);

function validateAction(action) {
  if (!action || typeof action !== 'object') {
    return { valid: false, reason: 'Action must be a non-null object.' };
  }

  if (!action.type) {
    return { valid: false, reason: 'Action is missing required field: type.' };
  }

  if (!VALID_ACTION_TYPES.has(action.type)) {
    return {
      valid: false,
      reason: `Action type "${action.type}" is not in the permitted action schema. Permitted: ${[...VALID_ACTION_TYPES].join(', ')}`
    };
  }

  // Type-specific validation
  if (action.type === 'navigate') {
    const urlCheck = validateUrl(action.url);
    if (!urlCheck.allowed) {
      return { valid: false, reason: urlCheck.reason };
    }
  }

  if (action.type === 'fill' && !action.value && action.value !== '') {
    return { valid: false, reason: 'Fill action requires a "value" field.' };
  }

  return { valid: true };
}

// Sanitize LLM output — strip any attempt to inject system instructions
function sanitizePageContent(text) {
  if (typeof text !== 'string') return '';
  // Remove content that looks like system-level instructions embedded in page data
  return text
    .replace(/<!--[\s\S]*?-->/g, '') // strip HTML comments
    .substring(0, 50000); // cap size
}

function getAllowedOrigins() {
  return [...ALLOWED_ORIGINS];
}

function getApprovalRequiredActions() {
  return [...APPROVAL_REQUIRED_ACTIONS];
}

module.exports = {
  validateUrl,
  requiresApproval,
  validateAction,
  sanitizePageContent,
  getAllowedOrigins,
  getApprovalRequiredActions,
  VALID_ACTION_TYPES,
};
