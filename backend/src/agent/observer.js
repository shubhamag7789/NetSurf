'use strict';

const { getPage } = require('./browser');
const { sanitizePageContent } = require('../security/safety');

/**
 * Observe the current page and return a structured snapshot.
 * This is the Netsurf "observe" step — used before and after actions.
 */
async function observePage() {
  const page = await getPage();

  const [url, title] = await Promise.all([
    page.url(),
    page.title(),
  ]);

  // Extract semantic structure
  const semanticSnapshot = await page.evaluate(() => {
    const elements = [];
    const seenNodes = new Set();

    // Collect interactive elements
    const interactiveSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="searchbox"]',
      '[role="combobox"]', '[role="textbox"]', '[role="menuitem"]'
    ];

    for (const sel of interactiveSelectors) {
      const nodes = document.querySelectorAll(sel);
      for (const node of nodes) {
        if (seenNodes.has(node)) continue;
        seenNodes.add(node);

        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue; // not visible

        const label =
          node.getAttribute('aria-label') ||
          node.getAttribute('placeholder') ||
          node.getAttribute('title') ||
          node.textContent?.trim().substring(0, 80) ||
          node.getAttribute('name') ||
          node.getAttribute('id') || '';

        elements.push({
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute('role') || (node.tagName === 'BUTTON' ? 'button' : node.tagName === 'A' ? 'link' : null),
          type: node.getAttribute('type') || null,
          id: node.getAttribute('id') || null,
          name: node.getAttribute('name') || null,
          label: label.trim(),
          href: node.getAttribute('href') || null,
          value: node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA'
            ? node.value : null,
          disabled: node.disabled || node.getAttribute('aria-disabled') === 'true',
          visible: rect.width > 0 && rect.height > 0,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        });
      }
    }

    // Collect headings
    const headings = [];
    for (const h of document.querySelectorAll('h1,h2,h3,h4')) {
      headings.push({ level: parseInt(h.tagName[1]), text: h.textContent?.trim().substring(0, 200) });
    }

    // Collect visible text blocks (paragraphs + list items + table cells)
    const textBlocks = [];
    for (const el of document.querySelectorAll('p, li, td, th, .product-name, .price, .spec, [data-testid]')) {
      const text = el.textContent?.trim();
      if (text && text.length > 2 && text.length < 500) {
        textBlocks.push(text);
      }
    }

    // Collect product cards if on a product listing page
    const products = [];
    for (const card of document.querySelectorAll('.product-card, [data-product-id]')) {
      products.push({
        id: card.getAttribute('data-product-id'),
        name: card.querySelector('.product-name')?.textContent?.trim(),
        price: card.querySelector('.price')?.textContent?.trim(),
        ram: card.querySelector('[data-spec="ram"]')?.textContent?.trim() ||
             card.querySelector('.spec-ram')?.textContent?.trim(),
        storage: card.querySelector('[data-spec="storage"]')?.textContent?.trim() ||
                 card.querySelector('.spec-storage')?.textContent?.trim(),
        cpu: card.querySelector('[data-spec="cpu"]')?.textContent?.trim() ||
             card.querySelector('.spec-cpu')?.textContent?.trim(),
      });
    }

    return { elements, headings, textBlocks: textBlocks.slice(0, 100), products };
  });

  return {
    url,
    title: sanitizePageContent(title),
    elements: semanticSnapshot.elements,
    headings: semanticSnapshot.headings,
    textBlocks: semanticSnapshot.textBlocks.map(sanitizePageContent),
    products: semanticSnapshot.products,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Find an element matching target criteria from the page snapshot.
 * Returns best candidate or null.
 */
function findBestElement(snapshot, criteria) {
  const { text, role, type, id, name, label: critLabel } = criteria;
  const elements = snapshot.elements || [];

  const searchText = (text || critLabel || '').toLowerCase().trim();

  // Score each element
  const scored = elements.map(el => {
    let score = 0;
    const elLabel = (el.label || '').toLowerCase().trim();

    if (id && el.id === id) score += 120;
    if (name && el.name === name) score += 90;
    if (role && (el.role === role || el.tag === role)) score += 30;
    if (type && el.type === type) score += 20;

    if (searchText) {
      if (elLabel === searchText) {
        score += 80;
      } else if (elLabel.includes(searchText)) {
        score += 35;
      } else if (searchText.includes(elLabel) && elLabel.length > 2) {
        score += 20;
      }
    }

    // Don't match disabled or invisible elements
    if (el.disabled) score -= 200;
    if (!el.visible) score -= 100;

    return { el, score };
  });

  const validScored = scored.filter(s => s.score >= 20).sort((a, b) => b.score - a.score);
  if (validScored.length === 0) return null;

  const best = validScored[0];

  // Ambiguity check: if multiple distinct elements share identical or indistinguishable top scores (e.g. duplicate buttons)
  if (validScored.length >= 2) {
    const second = validScored[1];
    const isDistinctElement = (best.el.id !== second.el.id || !best.el.id) && (best.el.x !== second.el.x || best.el.y !== second.el.y);
    const scoreDiff = Math.abs(best.score - second.score);

    // If both are buttons with identical text/label and close scores
    if (isDistinctElement && scoreDiff <= 10 && best.score >= 50 && (!id || best.el.id !== id)) {
      return { element: best.el, ambiguous: true, candidates: [best.el, second.el] };
    }
  }

  return { element: best.el, ambiguous: false };
}

/**
 * Build a CSS selector hint from element metadata.
 * Prefers semantic over fragile selectors.
 */
function buildSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.name) return `[name="${el.name}"]`;
  if (el.role) return `[role="${el.role}"]`;
  return `${el.tag}`;
}

/**
 * Extract product data from current page snapshot.
 */
function extractProducts(snapshot) {
  return snapshot.products.filter(p => p.name); // Remove empty entries
}

/**
 * Extract text content matching a pattern.
 */
function extractTextMatching(snapshot, pattern) {
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  return snapshot.textBlocks.filter(t => re.test(t));
}

module.exports = {
  observePage,
  findBestElement,
  buildSelector,
  extractProducts,
  extractTextMatching,
};
