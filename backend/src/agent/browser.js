'use strict';

const { chromium } = require('playwright');
require('dotenv').config();

let browserInstance = null;
let pageInstance = null;

const BROWSER_TIMEOUT = parseInt(process.env.BROWSER_TIMEOUT || '30000', 10);
const HEADLESS = process.env.BROWSER_HEADLESS !== 'false';

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

async function getPage() {
  const browser = await getBrowser();
  if (!pageInstance || pageInstance.isClosed()) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Netsurf/1.0 (Agentic Browser; not-a-real-browser)',
      javaScriptEnabled: true,
    });
    pageInstance = await context.newPage();
    pageInstance.setDefaultTimeout(BROWSER_TIMEOUT);
    pageInstance.setDefaultNavigationTimeout(BROWSER_TIMEOUT);
  }
  return pageInstance;
}

async function navigate(url, timeout) {
  const page = await getPage();
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeout || BROWSER_TIMEOUT,
  });
  return { url: page.url(), title: await page.title() };
}

async function clickElement(selector, options = {}) {
  const page = await getPage();
  const { timeout = BROWSER_TIMEOUT } = options;

  // Try multiple locate strategies
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  await locator.click({ timeout });
  return { clicked: true, selector };
}

async function clickByText(text, options = {}) {
  const page = await getPage();
  const { role, exact = false, timeout = BROWSER_TIMEOUT } = options;

  let locator;
  if (role) {
    locator = page.getByRole(role, { name: text, exact });
  } else {
    locator = page.getByText(text, { exact });
  }

  await locator.first().waitFor({ state: 'visible', timeout });
  await locator.first().click({ timeout });
  return { clicked: true, text };
}

async function fillElement(selector, value, options = {}) {
  const page = await getPage();
  const { timeout = BROWSER_TIMEOUT } = options;
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  await locator.fill(value, { timeout });
  return { filled: true, selector, value };
}

async function fillByLabel(label, value, options = {}) {
  const page = await getPage();
  const { timeout = BROWSER_TIMEOUT } = options;
  const locator = page.getByLabel(label, { exact: false });
  await locator.first().waitFor({ state: 'visible', timeout });
  await locator.first().fill(value, { timeout });
  return { filled: true, label, value };
}

async function selectOption(selector, value, options = {}) {
  const page = await getPage();
  const { timeout = BROWSER_TIMEOUT } = options;
  await page.locator(selector).first().selectOption(value, { timeout });
  return { selected: true, selector, value };
}

async function scrollPage(direction = 'down', amount = 500) {
  const page = await getPage();
  if (direction === 'down') {
    await page.evaluate((amt) => window.scrollBy(0, amt), amount);
  } else if (direction === 'up') {
    await page.evaluate((amt) => window.scrollBy(0, -amt), amount);
  } else if (direction === 'bottom') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
  return { scrolled: true, direction, amount };
}

async function waitForSelector(selector, options = {}) {
  const page = await getPage();
  const { timeout = BROWSER_TIMEOUT, state = 'visible' } = options;
  await page.waitForSelector(selector, { state, timeout });
  return { found: true, selector };
}

async function waitMs(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
  return { waited: true, ms };
}

async function takeScreenshot() {
  const page = await getPage();
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  return buffer.toString('base64');
}

async function getCurrentUrl() {
  const page = await getPage();
  return page.url();
}

async function getPageTitle() {
  const page = await getPage();
  return page.title();
}

async function closeBrowser() {
  if (pageInstance && !pageInstance.isClosed()) {
    await pageInstance.close().catch(() => {});
    pageInstance = null;
  }
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

async function isPageClosed() {
  return !pageInstance || pageInstance.isClosed();
}

// Evaluate a safe read-only expression — strictly limited
async function evaluateReadOnly(expression) {
  const page = await getPage();
  // Only allow document.querySelectorAll-style reads, never eval of arbitrary code
  // We use a whitelist approach - expression must be one of our known patterns
  const ALLOWED_PATTERNS = [
    /^document\.title$/,
    /^document\.URL$/,
    /^window\.location\.href$/,
    /^document\.querySelectorAll\(['"][^'"]+['"]\)\.length$/,
  ];
  const isAllowed = ALLOWED_PATTERNS.some(p => p.test(expression.trim()));
  if (!isAllowed) {
    throw new Error(`evaluateReadOnly: expression not in allowlist: "${expression}"`);
  }
  return page.evaluate(expression);
}

module.exports = {
  getBrowser,
  getPage,
  navigate,
  clickElement,
  clickByText,
  fillElement,
  fillByLabel,
  selectOption,
  scrollPage,
  waitForSelector,
  waitMs,
  takeScreenshot,
  getCurrentUrl,
  getPageTitle,
  closeBrowser,
  isPageClosed,
  evaluateReadOnly,
};
