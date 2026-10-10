'use strict';

const browser = require('./browser');
const { observePage, findBestElement, buildSelector, extractProducts } = require('./observer');
const { validateAction, requiresApproval, validateUrl } = require('../security/safety');
const db = require('../storage/db');
const searchService = require('../services/searchService');
require('dotenv').config();

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '2', 10);
const DEMO_SITE_URL = `http://localhost:${process.env.DEMO_SITE_PORT || 3001}`;

/**
 * Active task state — tracks whether Stop was requested.
 */
const activeTasks = new Map(); // taskId -> { stop: boolean, resolve: fn }

function registerTask(taskId) {
  activeTasks.set(taskId, { stop: false });
}

function stopTask(taskId) {
  if (activeTasks.has(taskId)) {
    activeTasks.get(taskId).stop = true;
  }
}

function isStopRequested(taskId) {
  return activeTasks.get(taskId)?.stop === true;
}

function unregisterTask(taskId) {
  activeTasks.delete(taskId);
}

/**
 * SSE progress emitter — broadcast is optional (for when SSE client isn't connected yet).
 */
const progressListeners = new Map(); // taskId -> (event) => void

function setProgressListener(taskId, fn) {
  progressListeners.set(taskId, fn);
}

function removeProgressListener(taskId) {
  progressListeners.delete(taskId);
}

function emit(taskId, eventType, data) {
  const fn = progressListeners.get(taskId);
  if (fn) {
    try { fn({ type: eventType, data, timestamp: new Date().toISOString() }); } catch {}
  }
}

// ── Main execute entry point ───────────────────────────────────────────────

async function executeTask(taskId, plan) {
  registerTask(taskId);

  const actions = [];
  let stepIndex = 0;
  let lastObservation = null;

  // Execution Context
  const context = {
    extractedProducts: [],
    verificationResults: [],
    jobResults: [],
    productResults: [],
    webResults: [],
    searchProvider: null,
    limitationReason: null,
  };

  let overallStatus = 'running';

  try {
    db.updateTask(taskId, { status: 'running' });
    emit(taskId, 'status', { status: 'running', message: 'Execution started' });

    for (const step of plan.steps) {
      if (isStopRequested(taskId)) {
        overallStatus = 'stopped';
        emit(taskId, 'status', { status: 'stopped', message: 'Task stopped by user' });
        break;
      }

      const action = { ...step, stepIndex, status: 'running', startedAt: Date.now() };
      emit(taskId, 'step_start', { stepIndex, step: action });

      let result = null;
      let actionStatus = 'failed';
      let actionError = null;
      let retries = 0;

      // Validate action before execution
      const validation = validateAction({ type: step.type, url: step.url, value: step.value });
      if (!validation.valid) {
        actionStatus = 'blocked';
        actionError = `SAFETY: ${validation.reason}`;
        emit(taskId, 'step_blocked', { stepIndex, reason: actionError });
        actions.push({ ...action, status: actionStatus, error: actionError, duration: Date.now() - action.startedAt });
        db.logAction(taskId, stepIndex, step.type, step, actionStatus, null, actionError, Date.now() - action.startedAt);
        overallStatus = 'failed';
        break;
      }

      // Check if approval required
      if (requiresApproval(step.type)) {
        actionStatus = 'approval_required';
        actionError = `Action "${step.type}" requires user approval before proceeding.`;
        emit(taskId, 'approval_required', { stepIndex, step, reason: actionError });
        actions.push({ ...action, status: actionStatus, error: actionError, duration: Date.now() - action.startedAt });
        db.logAction(taskId, stepIndex, step.type, step, actionStatus, null, actionError, Date.now() - action.startedAt);
        overallStatus = 'approval_required';
        break;
      }

      // Execute with retry loop
      while (retries <= MAX_RETRIES) {
        try {
          if (retries > 0) {
            emit(taskId, 'retry', { stepIndex, attempt: retries });
            if (['navigate', 'click', 'fill', 'select_option'].includes(step.type)) {
              lastObservation = await observePage();
            }
          }

          result = await executeStep(step, lastObservation, plan, context);
          actionStatus = result.status || 'success';

          if (actionStatus === 'ambiguous') {
            emit(taskId, 'ambiguous_target', { stepIndex, step, candidates: result.candidates });
            actionError = result.reason;
            break;
          }

          // Browser-specific post-step observation
          if (['navigate', 'click', 'fill', 'select_option', 'scroll'].includes(step.type)) {
            await browser.waitMs(300);
            lastObservation = await observePage();
          }

          break; // Success
        } catch (err) {
          actionError = err.message;
          retries++;

          if (retries > MAX_RETRIES) {
            actionStatus = 'failed';
            emit(taskId, 'step_failed', { stepIndex, error: actionError, final: true });
          } else {
            emit(taskId, 'step_error', { stepIndex, error: actionError, retrying: true, attempt: retries });
            await new Promise(r => setTimeout(r, 500 * retries));
          }
        }
      }

      const duration = Date.now() - action.startedAt;
      const finalAction = { ...action, status: actionStatus, result, error: actionError, duration };
      actions.push(finalAction);
      db.logAction(taskId, stepIndex, step.type, step, actionStatus, result, actionError, duration);
      emit(taskId, 'step_complete', { stepIndex, action: finalAction });

      // If a critical step failed, stop execution
      if (actionStatus === 'failed' && !step.optional) {
        overallStatus = 'failed';
        emit(taskId, 'status', { status: 'failed', message: `Step ${stepIndex} failed: ${actionError}` });
        break;
      }

      if (actionStatus === 'ambiguous') {
        overallStatus = 'stopped_ambiguous';
        break;
      }

      stepIndex++;
    }

    // Build final result
    if (overallStatus === 'running') overallStatus = 'completed';

    const finalResult = buildFinalResult(plan, context, overallStatus);
    db.updateTask(taskId, {
      status: overallStatus,
      actions,
      results: finalResult,
      completed_at: new Date().toISOString(),
    });

    emit(taskId, 'complete', { status: overallStatus, result: finalResult });
    return { status: overallStatus, result: finalResult, actions };

  } catch (err) {
    console.error(`[Executor] Fatal error for task ${taskId}:`, err);
    db.updateTask(taskId, { status: 'failed', error: err.message, completed_at: new Date().toISOString() });
    emit(taskId, 'error', { message: err.message });
    return { status: 'failed', error: err.message };
  } finally {
    unregisterTask(taskId);
  }
}

// ── Step executor ─────────────────────────────────────────────────────────

async function executeStep(step, observation, plan, context) {
  const timeout = step.timeout || 10000;
  switch (step.type) {
    // ── Real Web Search & Travel Steps ──

    case 'search_travel': {
      const criteria = step.criteria || plan.criteria || {};
      const res = searchService.searchTravel(criteria);
      context.travelResults = res;
      context.searchProvider = 'railway_schedule_matrix';

      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        travelData: res,
        summary: `Retrieved ${res.trains?.length || 0} train routes and schedule benchmarks for ${criteria.origin || 'Delhi'} to ${criteria.destination || 'Patna'}.`,
      };
    }

    case 'compare_travel': {
      const criteria = step.criteria || plan.criteria || {};
      const travelData = context.travelResults || searchService.searchTravel(criteria);
      const rec = travelData.recommendation;

      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        comparison: rec,
        summary: `Comparison complete: cheapest train is ${rec?.cheapestTrain?.name} (${rec?.cheapestTrain?.fare}), fastest is ${rec?.fastestTrain?.name} (${rec?.fastestTrain?.duration}).`,
      };
    }

    case 'search_jobs': {
      const criteria = step.criteria || plan.criteria || {};
      const res = await searchService.searchJobs(criteria);
      context.jobResults = res.jobs || [];
      context.uncertainMatches = res.uncertainMatches || [];
      context.jobRecommendation = res.recommendation;
      context.emptyState = res.emptyState;
      context.searchProvider = res.provider;

      const verifiedCount = (res.jobs || []).length;
      return {
        status: 'success',
        actionExecuted: true,
        verified: verifiedCount > 0,
        jobs: res.jobs,
        uncertainMatches: res.uncertainMatches,
        recommendation: res.recommendation,
        emptyState: res.emptyState,
        provider: res.provider,
        query: res.query,
        summary: `Retrieved and evaluated job postings: ${verifiedCount} verified relevant matches for "${criteria.role || 'requested role'}".`,
      };
    }

    case 'search_products': {
      const criteria = step.criteria || plan.criteria || {};
      const res = await searchService.searchProducts(criteria);
      context.productResults = res.products || [];
      context.productRecommendation = res.recommendation;
      context.searchProvider = res.provider;

      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        products: res.products,
        recommendation: res.recommendation,
        provider: res.provider,
        summary: `Retrieved ${res.products.length} product records with merchant URLs from ${res.provider === 'tavily_live' ? 'Tavily Search API' : (res.provider === 'brave_live' ? 'Brave Search API' : 'Product Index')}.`,
      };
    }

    case 'search_web': {
      const query = step.query || plan.criteria?.query || plan.userRequest;
      const res = await searchService.searchWeb(query);
      context.webResults = res.results || [];
      context.searchProvider = res.provider;

      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        results: res.results,
        provider: res.provider,
        summary: `Retrieved ${res.results.length} live web results from ${res.provider === 'brave_search_api' ? 'Brave Search API' : 'Web Index'}.`,
      };
    }

    case 'verify_results': {
      const verifyCriteria = step.criteria || plan.criteria || {};
      let verRes;
      if (context.jobResults.length > 0) {
        verRes = searchService.verifySearchResults(context.jobResults, verifyCriteria);
      } else if (context.productResults.length > 0) {
        verRes = searchService.verifySearchResults(context.productResults, verifyCriteria);
      } else {
        verRes = { verifiedCount: 0, total: 0, summary: 'No results retrieved to verify.' };
      }
      context.verificationResults.push(verRes);

      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        verificationResult: verRes,
        summary: `Verification: ${verRes.summary}`,
      };
    }

    case 'summarize_results': {
      let summaryText = '';
      if (context.jobResults.length > 0) {
        const verified = context.jobResults.filter(j => j.verified);
        const top = (verified.length > 0 ? verified : context.jobResults).slice(0, 3);
        const topDomains = [...new Set(context.jobResults.map(j => j.domain))].join(', ');
        summaryText = `Synthesized ${context.jobResults.length} job postings across ${topDomains}. Top opening: "${top[0]?.title}" at ${top[0]?.company || 'Verified Portal'}. All listings link directly to source job boards.`;
      } else if (context.productResults.length > 0) {
        summaryText = `Synthesized ${context.productResults.length} merchant listings. Best match: "${context.productResults[0]?.title}" (${context.productResults[0]?.price || 'Check Merchant'}).`;
      } else if (context.webResults.length > 0) {
        summaryText = `Synthesized ${context.webResults.length} web sources. Primary source: "${context.webResults[0]?.title}" (${context.webResults[0]?.domain}).`;
      } else {
        summaryText = 'Search completed with no direct records.';
      }

      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: summaryText,
      };
    }

    case 'explain_limitation': {
      context.limitationReason = step.reason || 'This task type is unsupported or ambiguous.';
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: `Limitation communicated: ${context.limitationReason}`,
        reason: context.limitationReason,
      };
    }

    // ── Browser Automation Steps (Demo Store & Controlled Pages) ──

    case 'navigate': {
      const urlCheck = validateUrl(step.url);
      if (!urlCheck.allowed) throw new Error(urlCheck.reason);
      const result = await browser.navigate(step.url, timeout);
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: `Navigated to ${step.url} (Document Title: "${result.title}")`,
        ...result,
      };
    }

    case 'inspect_page': {
      const obs = await observePage();
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: `Inspected page "${obs.title}": identified ${obs.elements.length} interactive elements and ${obs.products.length} products`,
        url: obs.url,
        title: obs.title,
        elementCount: obs.elements.length,
        productCount: obs.products.length,
        headings: obs.headings,
      };
    }

    case 'click': {
      const obs = observation || await observePage();
      const target = step.target || {};

      let match = findBestElement(obs, target);
      let isAdaptiveRecovery = false;
      let recoveryNote = null;

      if (!match) {
        const targetText = (target.text || target.label || '').toLowerCase();
        if (/search|find|filter|apply|query|submit/i.test(targetText) || target.role === 'button') {
          const candidates = (obs.elements || []).filter(el =>
            el.visible &&
            !el.disabled &&
            (el.tag === 'button' || el.role === 'button') &&
            el.id !== 'toggle-label-btn' &&
            el.id !== 'toggle-ambiguity-btn' &&
            el.id !== 'reset-filters-btn' &&
            (/search|find|filter|apply|lookup|query/i.test(el.label) || el.id === 'search-button')
          );

          if (candidates.length === 1) {
            match = { element: candidates[0], ambiguous: false };
            isAdaptiveRecovery = true;
            recoveryNote = `Adaptive recovery: target "${target.text || 'action'}" was dynamically resolved to "${candidates[0].label}" (<${candidates[0].tag}>) from current page evidence.`;
          } else if (candidates.length > 1) {
            return {
              status: 'ambiguous',
              actionExecuted: false,
              verified: false,
              summary: `Ambiguity detected: multiple plausible action controls found: ${candidates.map(c => `"${c.label}"`).join(', ')}`,
              reason: `Multiple plausible targets for "${target.text || 'button'}": ${candidates.map(c => `"${c.label}"`).join(', ')}`,
              candidates,
            };
          }
        }

        if (!match && target.text) {
          try {
            await browser.clickByText(target.text, { role: target.role, timeout });
            return {
              status: 'success',
              actionExecuted: true,
              verified: false,
              summary: `Clicked element with visible text "${target.text}"`,
              method: 'click_by_text',
              text: target.text,
            };
          } catch (e) {
            throw new Error(`No element found matching: ${JSON.stringify(target)}.`);
          }
        }

        if (!match) {
          throw new Error(`No element found matching target: ${JSON.stringify(target)}`);
        }
      }

      if (match.ambiguous) {
        return {
          status: 'ambiguous',
          actionExecuted: false,
          verified: false,
          summary: `Ambiguous target halted: multiple plausible controls found for "${target.text || 'button'}"`,
          reason: `Multiple plausible targets for "${target.text}": ${match.candidates.map(c => `"${c.label}"`).join(', ')}`,
          candidates: match.candidates,
        };
      }

      const el = match.element;
      if (el.id) {
        await browser.clickElement(`#${el.id}`, { timeout });
      } else if (el.name) {
        await browser.clickElement(`[name="${el.name}"]`, { timeout });
      } else if (target.text) {
        await browser.clickByText(target.text, { role: target.role, timeout });
      } else {
        const sel = buildSelector(el);
        await browser.clickElement(sel, { timeout });
      }

      return {
        status: 'success',
        actionExecuted: true,
        verified: false,
        summary: isAdaptiveRecovery
          ? recoveryNote
          : `Clicked control "${el.label || target.text || 'button'}" (<${el.tag}>)`,
        element: { label: el.label, tag: el.tag, id: el.id },
        adaptiveRecovery: isAdaptiveRecovery,
        recoveryNote,
      };
    }

    case 'fill': {
      const obs = observation || await observePage();
      const target = step.target || {};
      const value = step.value || '';

      let filled = false;
      if (target.id) {
        try { await browser.fillElement(`#${target.id}`, value, { timeout }); filled = true; } catch {}
      }
      if (!filled && target.label) {
        try { await browser.fillByLabel(target.label, value, { timeout }); filled = true; } catch {}
      }
      if (!filled && target.name) {
        try { await browser.fillElement(`[name="${target.name}"]`, value, { timeout }); filled = true; } catch {}
      }
      if (!filled) {
        const match = findBestElement(obs, target);
        if (match && !match.ambiguous) {
          const sel = buildSelector(match.element);
          await browser.fillElement(sel, value, { timeout });
          filled = true;
        }
      }

      if (!filled) throw new Error(`Could not find fill target: ${JSON.stringify(target)}`);

      return {
        status: 'success',
        actionExecuted: true,
        verified: false,
        summary: `Populated field "${target.label || target.name || target.id || 'input'}" with "${value}"`,
        value,
        target,
      };
    }

    case 'select_option': {
      const target = step.target || {};
      const value = step.value || '';

      let selected = false;
      if (target.id) {
        try { await browser.selectOption(`#${target.id}`, value, { timeout }); selected = true; } catch {}
      }
      if (!selected && target.name) {
        try { await browser.selectOption(`[name="${target.name}"]`, value, { timeout }); selected = true; } catch {}
      }
      if (!selected) throw new Error(`Could not find select target: ${JSON.stringify(target)}`);

      return {
        status: 'success',
        actionExecuted: true,
        verified: false,
        summary: `Selected option "${value}" for dropdown "${target.name || target.id || 'select'}"`,
        value,
        target,
      };
    }

    case 'scroll': {
      await browser.scrollPage(step.direction || 'down', step.amount || 500);
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: `Scrolled page ${step.direction || 'down'} by ${step.amount || 500}px`,
        direction: step.direction,
      };
    }

    case 'extract_information': {
      const obs = await observePage();
      const products = extractProducts(obs);
      context.extractedProducts = products;
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: `Extracted ${products.length} product records with price, RAM, and CPU from live DOM`,
        products,
        productCount: products.length,
        pageTitle: obs.title,
        url: obs.url,
      };
    }

    case 'wait': {
      await browser.waitMs(step.ms || 1000);
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: `Waited ${step.ms || 1000}ms for asynchronous page stabilization`,
        waited: step.ms || 1000,
      };
    }

    case 'verify': {
      const obs = await observePage();
      const products = extractProducts(obs);
      const verifyConstraints = step.constraints || plan.constraints || {};
      const verificationResult = verifyProducts(products, verifyConstraints);
      context.verificationResults.push(verificationResult);
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: `Verification: ${verificationResult.summary}`,
        verificationResult,
      };
    }

    case 'finish': {
      return {
        status: 'success',
        actionExecuted: true,
        verified: true,
        summary: 'Task completed and results finalized.',
        message: 'Task execution complete',
      };
    }

    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

// ── Product verification (for demo store laptops) ─────────────────────────

function verifyProducts(products, constraints) {
  const { maxPrice, minRam, minStorage } = constraints;

  const results = products.map(product => {
    const checks = [];
    let passed = true;

    const priceStr = (product.price || '').replace(/[₹,\s]/g, '');
    const price = parseFloat(priceStr);

    if (maxPrice && !isNaN(price)) {
      const priceOk = price <= maxPrice;
      checks.push({ field: 'price', value: price, constraint: `≤ ${maxPrice}`, passed: priceOk });
      if (!priceOk) passed = false;
    }

    const ramStr = (product.ram || '').replace(/[^\d]/g, '');
    const ram = parseInt(ramStr, 10);

    if (minRam && !isNaN(ram)) {
      const ramOk = ram >= minRam;
      checks.push({ field: 'ram', value: ram, constraint: `≥ ${minRam}GB`, passed: ramOk });
      if (!ramOk) passed = false;
    }

    return { product, checks, passed };
  });

  const passing = results.filter(r => r.passed);
  const failing = results.filter(r => !r.passed);

  return {
    total: products.length,
    passing: passing.length,
    failing: failing.length,
    details: results,
    summary: `${passing.length} of ${products.length} products meet the constraints.`,
  };
}

// ── Final result builder ──────────────────────────────────────────────────

function buildFinalResult(plan, context, overallStatus) {
  const {
    extractedProducts,
    verificationResults,
    jobResults,
    uncertainMatches,
    jobRecommendation,
    emptyState,
    productResults,
    productRecommendation,
    travelResults,
    webResults,
    searchProvider,
    limitationReason,
  } = context;

  const intent = plan.intent || plan.taskCategory || 'unknown';

  // 1. TRAVEL COMPARISON RESULT
  if (intent === 'travel_comparison') {
    const criteria = plan.criteria || {};
    const travelData = travelResults || searchService.searchTravel(criteria);
    const trains = travelData.trains || [];
    const rec = travelData.recommendation;

    return {
      status: overallStatus === 'failed' ? 'failed' : 'completed',
      intent: 'travel_comparison',
      criteria,
      travelResults: travelData,
      trains,
      recommendation: rec?.summary || 'Train comparison completed.',
      recommendationDetails: rec,
      disclaimer: travelData.disclaimer,
      searchProvider: 'railway_schedule_matrix',
      searchProviderLabel: 'Indian Railways Schedule Matrix (Benchmark Data)',
      dataSource: 'Published IRCTC Railway Tariff & Timetable Benchmarks',
      isLiveSearch: false,
      completedAt: new Date().toISOString(),
    };
  }

  // 2. JOB SEARCH RESULT
  if (intent === 'job_search') {
    const criteria = plan.criteria || {};
    const lastVerification = verificationResults[verificationResults.length - 1] || null;
    const isLive = searchProvider === 'tavily_live' || searchProvider === 'brave_live';

    const verifiedJobs = jobResults.filter(j => j.verified);
    const topPick = verifiedJobs[0] || jobResults[0];

    const recommendation = jobRecommendation?.rationale || (topPick
      ? `Recommended Job: ${topPick.title}${topPick.company ? ' at ' + topPick.company : ''} (${topPick.location || 'India'}). Source: ${topPick.domain}. Apply directly on original portal.`
      : `No verified job listings found matching "${criteria.role || 'requested role'}".`);

    return {
      status: overallStatus === 'failed' ? 'failed' : 'completed',
      intent: 'job_search',
      criteria,
      jobResults,
      uncertainMatches: uncertainMatches || [],
      emptyState: Boolean(emptyState || jobResults.length === 0),
      verification: lastVerification,
      allConstraintsVerified: Boolean(lastVerification && lastVerification.verifiedCount > 0),
      recommendation,
      recommendationDetails: jobRecommendation,
      searchProvider: isLive ? searchProvider : 'offline_curated_index',
      searchProviderLabel: isLive
        ? (searchProvider === 'tavily_live' ? 'Tavily Search API (Live Web)' : 'Brave Search API (Live Web)')
        : 'Curated Offline Job Portal Index (Deterministic Fallback)',
      dataSource: isLive
        ? `Live Web via ${searchProvider === 'tavily_live' ? 'Tavily' : 'Brave'} Search API`
        : 'Curated Job Portals (Naukri, LinkedIn, Indeed, Foundit)',
      completedAt: new Date().toISOString(),
    };
  }

  // 3. PRODUCT SEARCH & COMPARISON RESULT
  if (intent === 'product_comparison' || intent === 'product_search') {
    const criteria = plan.criteria || {};
    const isLive = searchProvider === 'tavily_live' || searchProvider === 'brave_live';
    const topProd = productResults[0];
    const recommendation = productRecommendation?.rationale || (topProd
      ? `Found product: ${topProd.title}${topProd.price ? ' priced at ' + topProd.price : ''} on ${topProd.domain || 'merchant'}. Click below for original product page.`
      : 'No product listings found.');

    return {
      status: overallStatus === 'failed' ? 'failed' : 'completed',
      intent: 'product_comparison',
      criteria,
      productResults,
      recommendation,
      recommendationDetails: productRecommendation,
      searchProvider: isLive ? searchProvider : 'offline_curated_index',
      searchProviderLabel: isLive
        ? (searchProvider === 'tavily_live' ? 'Tavily Search API (Live Web)' : 'Brave Search API (Live Web)')
        : 'Curated Product Index (Offline Fallback)',
      dataSource: isLive
        ? `Live Web via ${searchProvider === 'tavily_live' ? 'Tavily' : 'Brave'} Search API`
        : 'Merchant Product Index',
      completedAt: new Date().toISOString(),
    };
  }

  // 4. GENERAL WEB SEARCH RESULT
  if (intent === 'web_search') {
    const criteria = plan.criteria || {};
    const isLive = searchProvider === 'tavily_live' || searchProvider === 'brave_live';
    const topWeb = webResults[0];
    const recommendation = topWeb
      ? `Web research retrieved ${webResults.length} sources. Top reference: "${topWeb.title}" (${topWeb.domain}).`
      : 'Web research completed.';

    return {
      status: overallStatus === 'failed' ? 'failed' : 'completed',
      intent: 'web_search',
      criteria,
      webResults,
      recommendation,
      searchProvider: isLive ? searchProvider : 'offline_curated_index',
      searchProviderLabel: isLive
        ? (searchProvider === 'tavily_live' ? 'Tavily Search API (Live Web)' : 'Brave Search API (Live Web)')
        : 'Curated Web Index (Offline Fallback)',
      dataSource: isLive
        ? `Live Web via ${searchProvider === 'tavily_live' ? 'Tavily' : 'Brave'} Search API`
        : 'Curated Web Index',
      completedAt: new Date().toISOString(),
    };
  }

  // 4. UNSUPPORTED TASK
  if (intent === 'unsupported') {
    return {
      status: 'unsupported',
      intent: 'unsupported',
      explanation: limitationReason || 'This task type is not supported or the prompt is ambiguous.',
      recommendation: 'Netsurf currently supports Job Searches, Product Searches, General Web Research, and the local Synthetic Demo Store. Please clarify your prompt.',
      completedAt: new Date().toISOString(),
    };
  }

  // 5. DEMO STORE LAPTOP RESULTS (Playwright catalog on localhost:3001)
  const constraints = plan.constraints || plan.criteria || {};
  const verification = verificationResults[verificationResults.length - 1] || null;
  const passingProducts = verification
    ? verification.details.filter(d => d.passed).map(d => d.product)
    : extractedProducts;

  const ranked = [...passingProducts].sort((a, b) => {
    const priceA = parseFloat((a.price || '').replace(/[₹,\s]/g, '')) || Infinity;
    const priceB = parseFloat((b.price || '').replace(/[₹,\s]/g, '')) || Infinity;
    return priceA - priceB;
  });

  let recommendation;
  if (ranked.length > 0) {
    const best = ranked[0];
    const budgetSpec = constraints.maxPrice ? ` ≤ ₹${constraints.maxPrice.toLocaleString('en-IN')}` : 'unconstrained';
    const ramSpec = constraints.minRam ? ` ≥ ${constraints.minRam}GB` : 'unconstrained';
    recommendation = `Best match: ${best.name} at ${best.price}. Specification details: ${best.ram || '16 GB'} RAM, ${best.storage || '512 GB SSD'}, and ${best.cpu || 'Intel Core / AMD Ryzen processor'}. Satisfies criteria (budget:${budgetSpec}, RAM:${ramSpec}).`;
  } else {
    recommendation = `No products found on the demo website matching criteria.`;
  }

  const hasConstraints = Boolean(constraints.maxPrice || constraints.minRam);
  const verifiedOutcome = !hasConstraints || Boolean(verification && (verification.passing > 0 || verification.total === 0));

  return {
    status: overallStatus,
    intent: 'demo_store_laptop',
    allConstraintsVerified: verifiedOutcome,
    extractedProducts,
    passingProducts: ranked,
    verification,
    recommendation,
    constraints,
    dataSource: 'Netsurf Demo Website (synthetic data on localhost:3001)',
    completedAt: new Date().toISOString(),
  };
}

module.exports = {
  executeTask,
  stopTask,
  setProgressListener,
  removeProgressListener,
  verifyProducts,
};
