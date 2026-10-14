'use strict';

const assert = require('assert');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BROWSER_HEADLESS = 'true';
process.env.PORT = '3000';
process.env.DEMO_SITE_PORT = '3001';

const { startServers } = require('../src/index');
const db = require('../src/storage/db');
const {
  generatePlan,
  extractConstraints,
  classifyTask,
  getPlannerStatus,
  testGeminiConnection,
  testAnthropicConnection,
  getOfficialGeminiModels,
} = require('../src/agent/planner');
const { executeTask, stopTask } = require('../src/agent/executor');
const { saveSuccessfulRun } = require('../src/agent/memory');
const { validateUrl, validateAction, requiresApproval } = require('../src/security/safety');
const { closeBrowser } = require('../src/agent/browser');
const searchService = require('../src/services/searchService');

const DEMO_URL = 'http://localhost:3001';

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 NETSURF AGENTIC BROWSER — COMPREHENSIVE REGRESSION AUDIT');
  console.log('================================================================\n');

  try {
    const healthRes = await fetch('http://localhost:3000/api/health').catch(() => null);
    if (!healthRes || !healthRes.ok) {
      startServers();
      await wait(1000);
    }
  } catch {
    startServers();
    await wait(1000);
  }

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`Testing: ${name} ... `);
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  try {
    // ── Test A: Correct job relevance (Data Analyst) ──
    await test('A. Data Analyst job search strictly matches analytics roles, rejecting Full Stack/Developer contamination', async () => {
      const prompt = 'search jobs for data analyst for freshers in India';
      const classification = searchService.classifyTask(prompt);
      assert.strictEqual(classification.intent, 'job_search');
      assert.strictEqual(classification.criteria.role, 'Data Analyst');

      const plan = await generatePlan(prompt);
      assert.strictEqual(plan.intent, 'job_search');

      const taskId = uuidv4();
      db.createTask(taskId, prompt);
      db.updateTask(taskId, { plan });

      const outcome = await executeTask(taskId, plan);
      assert.strictEqual(outcome.status, 'completed');
      assert.strictEqual(outcome.result.intent, 'job_search');

      const verifiedJobs = outcome.result.jobResults;
      assert.ok(verifiedJobs.length > 0, 'Must return verified matches for Data Analyst');

      for (const job of verifiedJobs) {
        const text = `${job.title} ${job.snippet || ''}`.toLowerCase();
        const hasAnalytics = text.includes('data') || text.includes('analyst') || text.includes('analytics') || text.includes('bi');
        assert.ok(hasAnalytics, `Job "${job.title}" must match data analyst role, not unrelated developer role`);
        const isUnrelatedFullStack = text.includes('full stack') && !text.includes('data');
        assert.ok(!isUnrelatedFullStack, `Unrelated Full Stack Developer job must NOT appear for Data Analyst: ${job.title}`);
      }
    });

    // ── Test B: Different job role (Full Stack Developer) ──
    await test('B. Full Stack Developer search matches Full Stack roles without applying Data Analyst constraints', async () => {
      const prompt = 'search jobs for full stack developer for freshers in India';
      const classification = searchService.classifyTask(prompt);
      assert.strictEqual(classification.intent, 'job_search');
      assert.strictEqual(classification.criteria.role, 'Full Stack Developer');

      const plan = await generatePlan(prompt);
      const taskId = uuidv4();
      db.createTask(taskId, prompt);
      db.updateTask(taskId, { plan });

      const outcome = await executeTask(taskId, plan);
      assert.strictEqual(outcome.status, 'completed');

      const jobs = outcome.result.jobResults;
      assert.ok(jobs.length > 0);
      const hasFullStack = jobs.some(j => (j.title + ' ' + j.snippet).toLowerCase().includes('full stack') || (j.title + ' ' + j.snippet).toLowerCase().includes('software'));
      assert.ok(hasFullStack, 'Full stack search must contain relevant developer listings');
    });

    // ── Test C: Travel and Train Comparison ──
    await test('C. Travel query (cheapest train tickets Delhi to Patna) builds structured fare & duration comparison table', async () => {
      const prompt = 'cheapest train tickets from Delhi to Patna';
      const classification = searchService.classifyTask(prompt);
      assert.strictEqual(classification.intent, 'travel_comparison');
      assert.strictEqual(classification.criteria.origin, 'Delhi');
      assert.strictEqual(classification.criteria.destination, 'Patna');

      const plan = await generatePlan(prompt);
      assert.strictEqual(plan.intent, 'travel_comparison');
      assert.ok(plan.steps.some(s => s.type === 'search_travel'));

      const taskId = uuidv4();
      db.createTask(taskId, prompt);
      db.updateTask(taskId, { plan });

      const outcome = await executeTask(taskId, plan);
      assert.strictEqual(outcome.status, 'completed');
      assert.strictEqual(outcome.result.intent, 'travel_comparison');

      const trains = outcome.result.trains;
      assert.ok(Array.isArray(trains) && trains.length >= 3, 'Must compare multiple trains');
      
      const trainNames = trains.map(t => t.trainName);
      assert.ok(trainNames.some(n => n.includes('Sampoorna Kranti')), 'Must include Sampoorna Kranti Express');
      assert.ok(trainNames.some(n => n.includes('Rajdhani')), 'Must include Rajdhani Express');

      for (const t of trains) {
        assert.ok(t.cheapestFare > 0, 'Must have fare information');
        assert.ok(t.duration, 'Must have journey duration');
        assert.ok(t.departureTime && t.arrivalTime, 'Must have departure and arrival times');
        assert.ok(t.bookingUrl.startsWith('http'), 'Must have authentic booking portal link');
      }

      assert.ok(outcome.result.recommendation, 'Must provide grounded agent recommendation');
      assert.ok(outcome.result.recommendationDetails.cheapestTrain, 'Must specify cheapest train');
      assert.ok(outcome.result.recommendationDetails.fastestTrain, 'Must specify fastest train');
    });

    // ── Test D: Product comparison ──
    await test('D. Product comparison (laptops under ₹50,000 with 16GB RAM) compares specs and ranks value', async () => {
      const prompt = 'find laptops under ₹50,000 with at least 16 GB RAM';
      const classification = searchService.classifyTask(prompt);
      assert.strictEqual(classification.intent, 'product_comparison');

      const plan = await generatePlan(prompt);
      assert.ok(plan.intent === 'product_comparison' || plan.intent === 'product_search');

      const taskId = uuidv4();
      db.createTask(taskId, prompt);
      db.updateTask(taskId, { plan });

      const outcome = await executeTask(taskId, plan);
      assert.strictEqual(outcome.status, 'completed');
      assert.ok(outcome.result.productResults.length > 0, 'Must retrieve product candidates');

      for (const prod of outcome.result.productResults) {
        assert.ok(prod.title, 'Product must have title/model');
        assert.ok(prod.url.startsWith('http'), 'Product must have valid merchant URL');
      }

      assert.ok(outcome.result.recommendation, 'Must formulate product recommendation');
    });

    // ── Test E: General web research ──
    await test('E. General research (agentic browsers and security risks) produces grounded synthesis, NOT a job search', async () => {
      const prompt = 'research agentic browsers and summarize their security risks';
      const classification = searchService.classifyTask(prompt);
      assert.strictEqual(classification.intent, 'web_search');

      const plan = await generatePlan(prompt);
      assert.strictEqual(plan.intent, 'web_search');
      assert.strictEqual(plan.steps.filter(s => s.type === 'search_jobs').length, 0);

      const taskId = uuidv4();
      db.createTask(taskId, prompt);
      db.updateTask(taskId, { plan });

      const outcome = await executeTask(taskId, plan);
      assert.strictEqual(outcome.status, 'completed');
      assert.strictEqual(outcome.result.intent, 'web_search');
      assert.ok(outcome.result.webResults.length > 0);
      assert.ok(outcome.result.webResults.some(r => r.url.includes('arxiv.org') || r.url.includes('owasp.org') || r.snippet.toLowerCase().includes('security')));
    });

    // ── Test F: Educational topic ──
    await test('F. Educational query (website that explains Python decorators) retrieves documentation, not demo store', async () => {
      const prompt = 'find a website that explains Python decorators';
      const classification = searchService.classifyTask(prompt);
      assert.strictEqual(classification.intent, 'web_search');

      const plan = await generatePlan(prompt);
      assert.strictEqual(plan.intent, 'web_search');
      assert.strictEqual(plan.steps.filter(s => s.type === 'navigate').length, 0, 'Must NOT navigate to demo store');

      const taskId = uuidv4();
      db.createTask(taskId, prompt);
      db.updateTask(taskId, { plan });

      const outcome = await executeTask(taskId, plan);
      assert.strictEqual(outcome.status, 'completed');
      assert.ok(outcome.result.webResults.some(r => r.url.includes('python.org') || r.url.includes('realpython.com') || r.title.toLowerCase().includes('decorator')));
    });

    // ── Test G: Gemini configuration & model validation ──
    await test('G. Gemini connection test sanitizes error categories and catches invalid model IDs', async () => {
      const models = getOfficialGeminiModels();
      assert.ok(Array.isArray(models) && models.length >= 3);
      assert.ok(models.some(m => m.id === 'gemini-2.0-flash'));
      assert.ok(models.some(m => m.id === 'gemini-1.5-flash'));

      // Test with invalid model ID
      const invalidModelRes = await testGeminiConnection('invalid-test-key-1234', 'gemini-3.8-flash');
      assert.strictEqual(invalidModelRes.connected, false);
      assert.ok(
        invalidModelRes.status === 'unsupported_model' || invalidModelRes.status === 'invalid_key' || invalidModelRes.status === 'request_failed',
        `Status must be a sanitized category: ${invalidModelRes.status}`
      );
    });

    // ── Test H: Search failure honesty ──
    await test('H. Search provider failure reports error truthfully without pretending live search', async () => {
      const invalidSearch = await searchService.testTavilyConnection('invalid-tavily-key-xyz');
      assert.strictEqual(invalidSearch.success, false);
      assert.ok(['invalid_key', 'request_failed'].includes(invalidSearch.status));

      // Curated fallback should explicitly indicate isLiveSearch: false and offline provider
      const fallbackResults = searchService.generateCuratedSearchResults('test query without keys', 5, false);
      assert.strictEqual(fallbackResults.isLiveSearch, false, 'Fallback search must NOT pretend to be live');
      assert.strictEqual(fallbackResults.provider, 'offline_curated_index');
      assert.ok(fallbackResults.results.length > 0);
    });

    // ── Test I: Workflow memory isolation ──
    await test('I. Workflow memory maintains category isolation across tasks', async () => {
      const jobMem = db.findRelevantMemory('job_search');
      for (const m of jobMem) {
        assert.strictEqual(m.task_category, 'job_search');
      }
      const travelMem = db.findRelevantMemory('travel_comparison');
      for (const m of travelMem) {
        assert.strictEqual(m.task_category, 'travel_comparison');
      }
    });

    // ── Test J: General dashboard settings & profile API ──
    await test('J. Profile and dashboard APIs support general agent workspace without forcing job roles', async () => {
      const profile = db.getUserProfile();
      assert.ok(profile);
      assert.ok(profile.display_name);

      const settingsRes = await fetch('http://localhost:3000/api/settings');
      const settingsData = await settingsRes.json();
      assert.strictEqual(settingsRes.status, 200);
      assert.ok(settingsData.settings.model_provider);
      assert.ok(settingsData.settings.search_provider);
    });

    // ── Test K: Safety & secret redaction ──
    await test('K. API keys and secrets are never leaked in settings responses', async () => {
      const res = await fetch('http://localhost:3000/api/settings');
      const data = await res.json();
      assert.strictEqual(data.settings.gemini_api_key, undefined);
      assert.strictEqual(data.settings.tavily_api_key, undefined);
      assert.strictEqual(data.settings.anthropic_api_key, undefined);
    });

    // ── Test L: Unsupported prompt handling ──
    await test('L. Unsupported prompt explains boundary without running unwanted steps', async () => {
      const weirdPrompt = 'format c: and hack the mainframe download ram';
      const classification = searchService.classifyTask(weirdPrompt);
      assert.strictEqual(classification.intent, 'unsupported');

      const plan = await generatePlan(weirdPrompt);
      assert.strictEqual(plan.intent, 'unsupported');
      assert.ok(plan.steps.some(s => s.type === 'explain_limitation'));
    });

  } finally {
    console.log('\n================================================================');
    console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('================================================================');

    await closeBrowser();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
