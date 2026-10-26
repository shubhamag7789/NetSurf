/**
 * Netsurf Content Script (MV3)
 * Observes the active DOM, assigns stable numeric element IDs,
 * renders an interactive on-page Agent HUD, and executes validated browser actions.
 */

(() => {
  let elementRegistry = new Map();
  let hudContainer = null;
  let domLensActive = false;
  let domLensContainer = null;

  /**
   * Checks if an element is genuinely visible in the viewport or render tree.
   */
  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  /**
   * Unwraps Google redirect tracking links and filters out internal non-product URLs
   */
  function extractCleanDestinationUrl(rawHref) {
    if (!rawHref) return null;
    try {
      const parsed = new URL(rawHref, window.location.href);
      // Unwrap Google search redirection /url?q=... or /url?url=...
      if (parsed.hostname.includes("google.") && parsed.pathname.startsWith("/url")) {
        const target = parsed.searchParams.get("url") || parsed.searchParams.get("q");
        if (target && (target.startsWith("http://") || target.startsWith("https://"))) {
          return target;
        }
      }
      // If Google Shopping product comparison page, preserve it
      if (parsed.hostname.includes("google.") && parsed.pathname.startsWith("/search") && parsed.searchParams.get("ibp") === "oshop") {
        return parsed.href;
      }
      if (!parsed.protocol.startsWith("http")) return null;
      if (parsed.hostname.includes("google.") && (
        parsed.pathname.startsWith("/preferences") ||
        parsed.pathname.startsWith("/setprefs") ||
        parsed.pathname.startsWith("/intl") ||
        parsed.pathname === "/"
      )) {
        return null;
      }
      if (parsed.hostname.includes("accounts.google.") || parsed.hostname.includes("support.google.")) {
        return null;
      }
      return parsed.href;
    } catch {
      return null;
    }
  }

  /**
   * Resolves a human-friendly platform / store brand name from a URL or title
   */
  function identifyPlatformName(urlStr, cardEl) {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (host.includes("amazon.")) return host.endsWith(".in") ? "Amazon India" : "Amazon";
      if (host.includes("flipkart.")) return "Flipkart";
      if (host.includes("cashify.")) return "Cashify";
      if (host.includes("smartprix.")) return "Smartprix";
      if (host.includes("reliancedigital.")) return "Reliance Digital";
      if (host.includes("croma.")) return "Croma";
      if (host.includes("vijaysales.")) return "Vijay Sales";
      if (host.includes("samsung.")) return "Samsung Official Store";
      if (host.includes("motorola.")) return "Motorola Official Store";
      if (host.includes("apple.")) return "Apple Official Store";
      if (host.includes("mi.com") || host.includes("xiaomi.")) return "Mi / Xiaomi Store";
      if (host.includes("oneplus.")) return "OnePlus Store";
      if (host.includes("gadgets360.")) return "Gadgets360";
      if (host.includes("91mobiles.")) return "91mobiles";
      if (host.includes("gsmarena.")) return "GSMArena";

      if (cardEl) {
        const cardText = cardEl.innerText || "";
        if (/flipkart/i.test(cardText)) return "Flipkart";
        if (/amazon/i.test(cardText)) return "Amazon India";
        if (/croma/i.test(cardText)) return "Croma";
        if (/cashify/i.test(cardText)) return "Cashify";
        if (/reliance\s*digital/i.test(cardText)) return "Reliance Digital";
      }

      const domainParts = host.split(".")[0];
      return domainParts.charAt(0).toUpperCase() + domainParts.slice(1);
    } catch {
      return "Store Platform";
    }
  }

  /**
   * Ensures a product link points directly to the product or its dedicated search page
   * on that platform, rather than a generic root homepage.
   */
  function buildDirectPlatformProductUrl(platform, productTitle, existingUrl) {
    const query = encodeURIComponent((productTitle || "").trim());
    const pLower = (platform || "").toLowerCase();

    if (existingUrl) {
      try {
        const u = new URL(existingUrl);
        const host = u.hostname.toLowerCase();
        // If we are currently browsing directly on that platform's website, keep the authentic DOM product link
        if (window.location.hostname.includes(host) || host.includes(window.location.hostname.replace(/^www\./, ""))) {
          if (u.pathname.length > 3 && (u.pathname.includes("/dp/") || u.pathname.includes("/p/") || u.search.length > 3)) {
            return existingUrl;
          }
        }
        // If already a valid store search query, keep it
        if ((host.includes("amazon") || pLower.includes("amazon")) && (u.searchParams.has("k") || u.searchParams.has("field-keywords"))) {
          return existingUrl;
        }
        if ((host.includes("flipkart") || pLower.includes("flipkart")) && u.searchParams.has("q")) {
          return existingUrl;
        }
      } catch { }
    }

    if (pLower.includes("amazon")) {
      return `https://www.amazon.in/s?k=${query}`;
    }
    if (pLower.includes("flipkart")) {
      return `https://www.flipkart.com/search?q=${query}`;
    }
    if (pLower.includes("cashify")) {
      return `https://www.cashify.in/search?q=${query}`;
    }
    if (pLower.includes("croma")) {
      return `https://www.croma.com/searchB?q=${query}`;
    }
    if (pLower.includes("reliance")) {
      return `https://www.reliancedigital.in/search?q=${query}`;
    }
    if (pLower.includes("smartprix")) {
      return `https://www.smartprix.com/search?q=${query}`;
    }
    if (pLower.includes("vijay")) {
      return `https://www.vijaysales.com/search/${query}`;
    }
    if (pLower.includes("samsung")) {
      return `https://www.samsung.com/in/multistore/search/?searchvalue=${query}`;
    }

    return existingUrl || `https://www.google.com/search?q=${encodeURIComponent((platform ? platform + " " : "") + productTitle)}`;
  }

  /**
   * Scans the active page specifically for product listings, pricing cards,
   * search result items, and e-commerce platform purchase links.
   */
  function extractPlatformAndProductLinks() {
    const results = [];
    const seenUrls = new Set();

    // 1. Structured search result cards & shopping cards (Google, Bing, Amazon, Flipkart, etc.)
    const cardSelectors = [
      "div.g", "div.tF2Cxc", "div[data-hveid]", "div[data-sokoban-container]",
      "div.pla-unit", "div[data-item-title]", "div.xpd", ".commercial-unit",
      "[data-component-type='s-search-result']", "div._1AtVbE", "div.tUxRFH",
      ".product_pod", "article.product", ".product-card", "div[data-asin]",
      "div.sh-dgr__grid-result", "div.sh-np__click-target", "div[data-docid]"
    ];

    const cards = document.querySelectorAll(cardSelectors.join(","));
    for (const card of cards) {
      if (!isElementVisible(card)) continue;
      const anchor = card.querySelector("a[href]") || card.closest("a[href]");
      if (!anchor) continue;

      const rawHref = anchor.getAttribute("data-url") ||
        anchor.getAttribute("data-merchant-url") ||
        anchor.getAttribute("href") ||
        anchor.href;
      const cleanUrl = extractCleanDestinationUrl(rawHref);
      if (!cleanUrl || seenUrls.has(cleanUrl)) continue;

      const titleEl = card.querySelector("h2, h3, [data-item-title], .title, .s-title-instructions-style, ._4rR01T, .KzDlHZ, .tAxLfb");
      const title = (titleEl ? titleEl.innerText : anchor.innerText || "").trim().replace(/\s+/g, " ").slice(0, 90);
      if (!title || title.length < 3) continue;

      const cardText = card.innerText || "";
      const priceMatch = cardText.match(/(?:₹|Rs\.?|INR)\s*([0-9]{1,2}(?:,[0-9]{2,3})+|[0-9]{4,6})/i) ||
        cardText.match(/(?:\$|£|€)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
      const price = priceMatch ? priceMatch[0].replace(/\s+/g, "") : "";

      const platform = identifyPlatformName(cleanUrl, card);
      const deepUrl = buildDirectPlatformProductUrl(platform, title, cleanUrl);
      seenUrls.add(deepUrl);

      results.push({
        platform,
        title,
        price,
        url: deepUrl
      });

      if (results.length >= 25) break;
    }

    // 2. Generic visible links on page if fewer than 5 found
    if (results.length < 5) {
      const allAnchors = document.querySelectorAll("a[href]");
      for (const a of allAnchors) {
        if (!isElementVisible(a)) continue;
        const cleanUrl = extractCleanDestinationUrl(a.href || a.getAttribute("href"));
        if (!cleanUrl || seenUrls.has(cleanUrl)) continue;

        const text = (a.innerText || a.getAttribute("title") || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
        if (text.length < 4 || text.length > 100) continue;
        if (/^(next|previous|prev|more|back|sign in|login|privacy|terms|settings|tools|help|cached|about)$/i.test(text)) continue;

        const platform = identifyPlatformName(cleanUrl, a.parentElement);
        const deepUrl = buildDirectPlatformProductUrl(platform, text, cleanUrl);
        seenUrls.add(deepUrl);

        results.push({
          platform,
          title: text,
          price: "",
          url: deepUrl
        });

        if (results.length >= 25) break;
      }
    }

    return results;
  }

  /**
   * Automatically dismisses blocking login, promotional, or signup modal popups
   * (e.g. MakeMyTrip login popup, Amazon banner popups, cookie consent overlays).
   */
  function dismissModalPopups() {
    try {
      // Broad CSS-class-agnostic close button selectors covering all major travel/shopping sites
      const closeSelectors = [
        // Generic modal close patterns
        "span.commonModal__close",
        "[data-cy='closeModal']",
        "[data-cy='commonModalClose']",
        ".loginModal .close",
        ".makeMyTripModal .close",
        "span[class*='close'][class*='modal']",
        "span[class*='ModalClose']",
        "button[aria-label='Close']",
        "button[aria-label='close']",
        "button[aria-label='Dismiss']",
        "button[aria-label='dismiss']",
        "button.close",
        ".modal-close",
        ".popup-close",
        "div[class*='closeIcon']",
        "span[class*='closeIcon']",
        "div[class*='modalClose']",
        ".overlayCrossIcon",
        "[data-testid='modal-close-btn']",
        // MakeMyTrip login modal — specific patterns
        ".loginModal",         // whole modal container → find close btn inside
        "[class*='loginModal'] [class*='close']",
        "[class*='loginModal'] button",
        "[class*='LoginModal'] [class*='close']",
        "[class*='signInModal'] [class*='close']",
        "[class*='authModal'] [class*='close']",
        "div[class*='modal'][class*='login'] button",
        "div[class*='overlay'] button[class*='close']",
        "div[class*='Overlay'] button[class*='close']",
        // Cookie consent banners
        "button[id*='accept']",
        "button[id*='cookie-accept']",
        "#onetrust-accept-btn-handler",
        ".cc-accept",
        "[aria-label*='Accept cookies']",
        // Generic dismiss patterns (last resort)
        "[class*='dismiss']",
        "[class*='Dismiss']",
        "button[class*='skip']",
        "button[class*='Skip']",
        // Role-based overlay close
        "[role='dialog'] button[aria-label]",
        "[role='alertdialog'] button[aria-label]",
      ];
      for (const sel of closeSelectors) {
        try {
          const btn = document.querySelector(sel);
          if (btn && isElementVisible(btn) && btn.tagName.match(/^(BUTTON|A|SPAN|DIV)$/i)) {
            btn.click();
            return; // stop after first successful dismiss
          }
        } catch (_) {}
      }

      // Fallback: look for ANY visible button inside a dialog/modal overlay
      // that contains close-semantic text (×, ✕, Close, Skip, Not Now, etc.)
      const CLOSE_TEXTS = /^(×|✕|✗|close|dismiss|skip|not now|no thanks|maybe later|cancel|got it)$/i;
      const overlayRoots = document.querySelectorAll(
        "[role='dialog'], [role='alertdialog'], [class*='modal'], [class*='Modal'], [class*='overlay'], [class*='Overlay'], [class*='popup'], [class*='Popup']"
      );
      for (const root of overlayRoots) {
        if (!isElementVisible(root)) continue;
        const btns = root.querySelectorAll("button, [role='button'], span[tabindex], a[href='#']");
        for (const btn of btns) {
          const txt = (btn.innerText || btn.getAttribute("aria-label") || "").trim();
          if (CLOSE_TEXTS.test(txt) && isElementVisible(btn)) {
            btn.click();
            return;
          }
        }
      }
    } catch (_) {}
  }

  /**
   * Traverses the DOM, assigns stable numeric IDs, and returns a compact observation.
   */
  function generateObservation() {
    dismissModalPopups();
    elementRegistry.clear();
    const interactiveSelectors = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "[role='button']",
      "[role='link']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='combobox']",
      "[tabindex='0']"
    ];

    const allElements = document.querySelectorAll(interactiveSelectors.join(","));
    const elementsList = [];
    let currentId = 1;

    for (const el of allElements) {
      if (!isElementVisible(el)) continue;

      el.setAttribute("data-netsurf-id", currentId.toString());
      elementRegistry.set(currentId, el);

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "button" ? "button" : tag);

      // Smart label resolution (associated label, placeholder, aria, or title)
      let rawLabel = el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "";
      if (!rawLabel && el.id) {
        try {
          const assocLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (assocLabel) rawLabel = assocLabel.innerText;
        } catch { }
      }
      if (!rawLabel && el.closest("label")) {
        rawLabel = el.closest("label").innerText;
      }
      if (!rawLabel && el.getAttribute("name")) {
        rawLabel = el.getAttribute("name");
      }
      if (!rawLabel && el.getAttribute("placeholder")) {
        rawLabel = el.getAttribute("placeholder");
      }
      if (!rawLabel && el.value && typeof el.value === "string") {
        rawLabel = el.value.slice(0, 30);
      }

      const label = rawLabel.trim().replace(/\s+/g, " ").slice(0, 80);
      const href = extractCleanDestinationUrl(el.href || el.getAttribute("href")) || el.href || null;
      const placeholder = el.getAttribute("placeholder") || null;
      const isEnabled = !el.disabled;

      elementsList.push({
        id: currentId,
        tag: tag,
        role: role,
        label: label,
        placeholder: placeholder,
        href: href,
        is_visible: true,
        is_enabled: isEnabled
      });

      currentId++;
      if (elementsList.length >= 100) break; // Extended list for thorough card indexing
    }

    // Visible text summary (cleaned and truncated)
    const bodyClone = document.body ? document.body.cloneNode(true) : null;
    let cleanText = "";
    if (bodyClone) {
      const scripts = bodyClone.querySelectorAll("script, style, noscript, svg, #netsurf-agent-hud, #netsurf-dom-lens-container");
      scripts.forEach(s => s.remove());
      cleanText = (bodyClone.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000);
    }

    // Extract detected platform & product purchase links
    const pageLinks = extractPlatformAndProductLinks();

    // Append detected platform store links to cleanText so Gemini has immediate access
    if (pageLinks.length > 0) {
      const linkLines = pageLinks.slice(0, 15).map(item => {
        let line = `- [Platform: ${item.platform}] "${item.title}"`;
        if (item.price) line += ` | Price: ${item.price}`;
        line += ` | Store Link: ${item.url}`;
        return line;
      }).join("\n");

      cleanText += "\n\n--- DETECTED PRODUCT & PLATFORM PURCHASE LINKS ---\n" + linkLines;
    }

    return {
      url: window.location.href,
      title: document.title,
      text_summary: cleanText,
      page_links: pageLinks,
      elements: elementsList
    };
  }

  // ── NetSurf Interactive In-Page HUD & Element Spotlight ────────────────────
  function ensureHud() {
    if (hudContainer && document.body && document.body.contains(hudContainer)) return hudContainer;
    hudContainer = document.createElement("div");
    hudContainer.id = "netsurf-agent-hud";
    hudContainer.style.cssText = `
      position: fixed;
      top: 14px;
      right: 18px;
      z-index: 2147483647;
      background: rgba(10, 13, 20, 0.95);
      border: 1px solid #06b6d4;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(6, 182, 212, 0.35);
      border-radius: 24px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11.5px;
      font-weight: 600;
      backdrop-filter: blur(14px);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      transform: translateY(-6px);
      user-select: none;
    `;
    hudContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="position:relative; display:inline-flex; width:8px; height:8px;">
          <span style="position:absolute; width:100%; height:100%; border-radius:50%; background:#06b6d4; opacity:0.75; animation:netsurf-ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>
          <span style="position:relative; display:inline-flex; width:8px; height:8px; border-radius:50%; background:#06b6d4;"></span>
        </span>
        <span style="color:#38bdf8; font-weight:700; letter-spacing:0.5px;">NETSURF PILOT</span>
      </div>
      <span style="color:#334155;">|</span>
      <span id="netsurf-hud-text" style="color:#f1f5f9; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Active</span>
      <span style="color:#334155;">|</span>
      <button id="netsurf-hud-lens" style="background:rgba(6,182,212,0.15); border:1px solid #06b6d4; color:#38bdf8; border-radius:12px; padding:2px 8px; font-size:10px; font-weight:700; cursor:pointer;" title="Toggle Vision Lens">👁️ Lens</button>
      <button id="netsurf-hud-close" style="background:none; border:none; color:#64748b; font-size:12px; cursor:pointer; padding:0 2px;" title="Hide HUD">✕</button>
    `;

    // Inject keyframe animation for the ping indicator
    if (!document.getElementById("netsurf-hud-style")) {
      const style = document.createElement("style");
      style.id = "netsurf-hud-style";
      style.textContent = `
        @keyframes netsurf-ping {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes netsurf-reticle-pulse {
          0% { transform: scale(0.98); box-shadow: 0 0 12px #06b6d4, inset 0 0 8px #06b6d4; }
          50% { transform: scale(1.02); box-shadow: 0 0 24px #38bdf8, inset 0 0 14px #38bdf8; }
          100% { transform: scale(0.98); box-shadow: 0 0 12px #06b6d4, inset 0 0 8px #06b6d4; }
        }
      `;
      document.head.appendChild(style);
    }

    if (document.body) {
      document.body.appendChild(hudContainer);
      requestAnimationFrame(() => {
        hudContainer.style.opacity = "1";
        hudContainer.style.transform = "translateY(0)";
      });

      // Bind HUD buttons
      const lensBtn = hudContainer.querySelector("#netsurf-hud-lens");
      if (lensBtn) {
        lensBtn.addEventListener("click", () => {
          toggleDomLens();
        });
      }
      const closeBtn = hudContainer.querySelector("#netsurf-hud-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          hideAgentHud();
        });
      }
    }
    return hudContainer;
  }

  function showAgentHud(text) {
    const hud = ensureHud();
    const textEl = hud.querySelector("#netsurf-hud-text");
    if (textEl) textEl.innerText = text;
  }

  function hideAgentHud() {
    if (hudContainer && hudContainer.parentNode) {
      hudContainer.style.opacity = "0";
      hudContainer.style.transform = "translateY(-8px)";
      setTimeout(() => {
        if (hudContainer && hudContainer.parentNode) {
          hudContainer.parentNode.removeChild(hudContainer);
        }
        hudContainer = null;
      }, 300);
    }
  }

  function spotlightElement(el, actionName) {
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const rect = el.getBoundingClientRect();
    const spotlight = document.createElement("div");
    spotlight.className = "netsurf-spotlight-box";
    spotlight.style.cssText = `
      position: absolute;
      left: ${window.scrollX + rect.left - 4}px;
      top: ${window.scrollY + rect.top - 4}px;
      width: ${rect.width + 8}px;
      height: ${rect.height + 8}px;
      border: 2px solid #06b6d4;
      border-radius: 6px;
      pointer-events: none;
      z-index: 2147483646;
      animation: netsurf-reticle-pulse 1s infinite ease-in-out;
      transition: opacity 0.3s ease;
    `;

    const tag = document.createElement("div");
    tag.style.cssText = `
      position: absolute;
      top: -22px;
      left: 0;
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      color: #0a0d14;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    `;
    tag.innerText = `NetSurf ❯ ${actionName}`;
    spotlight.appendChild(tag);
    document.body.appendChild(spotlight);

    setTimeout(() => {
      spotlight.style.opacity = "0";
      setTimeout(() => spotlight.remove(), 300);
    }, 2200);
  }

  function toggleDomLens(forceState = null) {
    domLensActive = forceState !== null ? forceState : !domLensActive;
    if (domLensContainer) {
      domLensContainer.remove();
      domLensContainer = null;
    }
    if (!domLensActive) return false;

    domLensContainer = document.createElement("div");
    domLensContainer.id = "netsurf-dom-lens-container";
    domLensContainer.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483640;
    `;

    elementRegistry.forEach((el, id) => {
      if (!isElementVisible(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const badge = document.createElement("div");
      badge.style.cssText = `
        position: absolute;
        left: ${window.scrollX + rect.left}px;
        top: ${window.scrollY + rect.top - 14}px;
        background: linear-gradient(135deg, #0284c7, #06b6d4);
        color: #fff;
        font-family: monospace;
        font-size: 9.5px;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 4px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.6);
        border: 1px solid rgba(255,255,255,0.6);
        pointer-events: auto;
        cursor: pointer;
      `;
      badge.innerText = `[#${id}]`;
      badge.title = `NetSurf Element #${id}`;
      badge.addEventListener("click", () => {
        spotlightElement(el, `Element #${id}`);
      });
      domLensContainer.appendChild(badge);
    });

    document.body.appendChild(domLensContainer);
    return true;
  }

  /**
   * Executes a validated action on the current page.
   */
  async function executeAction(actionType, params) {
    console.log(`[Netsurf Content] Executing action '${actionType}' with params:`, params);

    switch (actionType) {
      case "navigate": {
        if (!params.url) throw new Error("Missing url parameter for navigate");
        showAgentHud(`Navigating to ${params.url.slice(0, 35)}...`);
        window.location.href = params.url;
        return { success: true, message: `Navigating to ${params.url}` };
      }

      case "click": {
        if (params.id == null) throw new Error("Missing element id for click");
        const el = elementRegistry.get(Number(params.id)) || document.querySelector(`[data-netsurf-id="${params.id}"]`);
        if (!el) throw new Error(`Element with id ${params.id} not found in DOM`);

        const label = (el.innerText || el.getAttribute("aria-label") || el.tagName).slice(0, 25);
        showAgentHud(`Clicking [#${params.id}] "${label}"`);
        spotlightElement(el, `Click [#${params.id}]`);

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise(r => setTimeout(r, 250));

        el.focus();
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        el.click();

        return { success: true, message: `Clicked element id ${params.id} (${el.tagName.toLowerCase()})` };
      }

      case "type": {
        if (params.id == null) throw new Error("Missing element id for type");
        const text = params.text != null ? String(params.text) : "";
        const el = elementRegistry.get(Number(params.id)) || document.querySelector(`[data-netsurf-id="${params.id}"]`);
        if (!el) throw new Error(`Element with id ${params.id} not found in DOM`);

        showAgentHud(`Typing: "${text.slice(0, 25)}"`);
        spotlightElement(el, "Typing Query");

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise(r => setTimeout(r, 200));
        el.focus();

        const prototype = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, text);
        } else {
          el.value = text;
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));

        if (params.submit) {
          await new Promise(r => setTimeout(r, 250));
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));

          if (el.form) {
            if (typeof el.form.requestSubmit === "function") {
              el.form.requestSubmit();
            } else {
              el.form.submit();
            }
          }
        }

        return { success: true, message: `Typed text into element id ${params.id}` };
      }

      case "fill_form": {
        const data = params.data || params.fields || params;
        showAgentHud("⚡ Autofilling form semantically...");
        let result;
        if (typeof NetSurfAutofill !== "undefined" && NetSurfAutofill.semanticallyFillForm) {
          result = NetSurfAutofill.semanticallyFillForm(data);
        } else {
          result = fallbackSemanticFillForm(data);
        }
        showAgentHud(`✓ Autofilled ${result.filledCount} fields in ${result.durationMs}ms`);
        return {
          success: true,
          message: `Autofilled ${result.filledCount} form fields in ${result.durationMs}ms`,
          count: result.filledCount,
          data: result
        };
      }

      case "scroll": {
        const direction = params.direction || "down";
        const amount = Number(params.amount) || 500;
        showAgentHud(`Scanning page (${direction} ${amount}px)...`);
        if (direction === "down") {
          window.scrollBy({ top: amount, behavior: "smooth" });
        } else if (direction === "up") {
          window.scrollBy({ top: -amount, behavior: "smooth" });
        } else if (direction === "top") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (direction === "bottom") {
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        }
        await new Promise(r => setTimeout(r, 350));
        setTimeout(() => {
          if (hudContainer && document.body.contains(hudContainer)) {
            const txt = hudContainer.querySelector("#netsurf-hud-text");
            if (txt && txt.innerText.includes("Scanning")) {
              txt.innerText = "Analyzing page content...";
            }
          }
        }, 800);
        return { success: true, message: `Scrolled ${direction} by ${amount}px` };
      }

      case "wait": {
        const ms = Math.min(Number(params.ms) || 1000, 3000);
        showAgentHud(`Observing dynamic content (${ms}ms)...`);
        await new Promise(r => setTimeout(r, ms));
        return { success: true, message: `Waited for ${ms}ms` };
      }

      case "extract": {
        showAgentHud("Waiting for page to stabilise before extraction...");
        // Use DOM-mutation-based stabilization instead of fixed timeout
        await waitForDOMStable(3500, 220);
        // Dismiss any late-appearing modals/overlays before extracting
        dismissModalPopups();
        await new Promise(r => setTimeout(r, 150));
        showAgentHud("Extracting structured intelligence records...");
        const fields = params.fields || ["title", "price", "rating"];
        const records = extractStructuredData(fields);
        showAgentHud(`✓ Captured ${records.length} structured records`);
        return { success: true, data: records, count: records.length };
      }

      case "done": {
        showAgentHud("✓ Mission Successfully Completed");
        setTimeout(hideAgentHud, 3500);
        return { success: true, summary: params.summary || "Task completed" };
      }

      case "fail": {
        showAgentHud(`✗ Halted: ${params.reason || "Task failed"}`);
        setTimeout(hideAgentHud, 4000);
        return { success: false, reason: params.reason || "Task failed" };
      }

      default:
        throw new Error(`Unsupported action type '${actionType}'`);
    }
  }

  /**
   * Waits for DOM to stabilize (no new mutations for ≥3 consecutive checks).
   * Replaces fixed-timeout waits with mutation-observer based stabilization.
   * @param {number} timeout  Max total wait in ms (default 3500)
   * @param {number} interval Poll interval in ms (default 220)
   * @returns {Promise<void>}
   */
  function waitForDOMStable(timeout = 3500, interval = 220) {
    return new Promise(resolve => {
      let lastMutationCount = 0;
      let observer = null;
      let stableRounds = 0;
      let elapsed = 0;
      const REQUIRED_STABLE_ROUNDS = 3; // DOM must be unchanged for 3 × interval before we proceed

      observer = new MutationObserver(() => {
        lastMutationCount++;
        stableRounds = 0; // Reset stability counter on each mutation
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });

      const id = setInterval(() => {
        stableRounds++;
        elapsed += interval;
        if (stableRounds >= REQUIRED_STABLE_ROUNDS || elapsed >= timeout) {
          clearInterval(id);
          observer.disconnect();
          resolve();
        }
        // Keep resetting stableRounds — the MutationObserver callback handles that
        // If no new mutations arrived since last tick, stableRounds increments naturally
      }, interval);

      // Absolute safety: resolve after timeout regardless
      setTimeout(() => {
        clearInterval(id);
        try { observer.disconnect(); } catch (_) {}
        resolve();
      }, timeout + 100);
    });
  }

  /**
   * Extracts structured records from cards, lists, tables or search engine results.
   */
  /**
   * Universal, site-independent extraction from schema.org JSON-LD (Product, Article, NewsArticle,
   * ItemList, JobPosting, Hotel, ...). Works on any site that publishes structured data, so it does not
   * depend on brittle per-site CSS selectors. Only values actually present on the page are returned.
   */
  function extractJsonLdRecords(limit = 30) {
    const out = [];
    const pageUrl = window.location.href;
    const nodes = [];
    const walk = (n, depth = 0) => {
      if (!n || depth > 6) return;
      if (Array.isArray(n)) { n.forEach(x => walk(x, depth + 1)); return; }
      if (typeof n !== "object") return;
      nodes.push(n);
      if (n["@graph"]) walk(n["@graph"], depth + 1);
      if (n.itemListElement) walk(n.itemListElement, depth + 1);
      if (n.item) walk(n.item, depth + 1);
      if (n.mainEntity) walk(n.mainEntity, depth + 1);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(sc => {
      try { walk(JSON.parse(sc.textContent)); } catch (e) { /* malformed block: ignore */ }
    });
    const TYPES = /^(Product|Article|NewsArticle|BlogPosting|Report|JobPosting|Hotel|LodgingBusiness|Event|Movie|Recipe|Book|SoftwareApplication|Offer)$/i;
    const first = v => Array.isArray(v) ? first(v[0]) : v;
    const seen = new Set();
    for (const n of nodes) {
      const types = [].concat(n["@type"] || []).map(String);
      if (!types.some(t => TYPES.test(t))) continue;
      const title = first(n.name || n.headline || n.title);
      if (!title || typeof title !== "string") continue;
      const offer = first(n.offers) || {};
      const url = first(n.url) || first(n.mainEntityOfPage && (n.mainEntityOfPage["@id"] || n.mainEntityOfPage)) || "";
      const absUrl = (() => { try { return new URL(typeof url === "string" ? url : "", pageUrl).href; } catch (e) { return pageUrl; } })();
      const key = absUrl + "#" + title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const price = offer.price != null ? `${offer.priceCurrency || ""} ${offer.price}`.trim() : "";
      const rating = n.aggregateRating && n.aggregateRating.ratingValue;
      const brand = first(n.brand);
      out.push({
        record_id: `ld_${out.length + 1}_${absHash(key)}`,
        title: title.trim(),
        name: title.trim(),
        category: types[0].toLowerCase(),
        price: price,
        rating: rating != null ? String(rating) : "",
        brand: brand && (brand.name || brand) ? String(brand.name || brand) : "",
        snippet: String(first(n.description) || "").slice(0, 320),
        published_at: first(n.datePublished || n.dateCreated || n.startDate) || "",
        company: n.hiringOrganization && n.hiringOrganization.name || "",
        link: absUrl,
        product_url: absUrl,
        source_url: absUrl,
        source_website: identifyPlatformName(pageUrl),
        extraction_timestamp: new Date().toISOString(),
        validation_status: "valid"
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Generic feed fallback: <article> blocks with a heading link and a <time datetime>. */
  function extractTimedArticleRecords(limit = 30) {
    const out = [];
    const seen = new Set();
    document.querySelectorAll("article, li, div[class*='post'], div[class*='story'], div[class*='news']").forEach(el => {
      if (out.length >= limit) return;
      const time = el.querySelector("time[datetime]");
      const a = el.querySelector("h1 a[href], h2 a[href], h3 a[href], h4 a[href]");
      if (!time || !a) return;
      const title = a.innerText.trim();
      if (title.length < 8 || seen.has(a.href)) return;
      seen.add(a.href);
      const p = el.querySelector("p");
      out.push({
        record_id: `tm_${out.length + 1}_${absHash(a.href)}`,
        title, name: title, category: "article",
        snippet: p ? p.innerText.trim().slice(0, 320) : "",
        published_at: time.getAttribute("datetime"),
        link: a.href, product_url: a.href, source_url: a.href,
        source_website: identifyPlatformName(window.location.href),
        extraction_timestamp: new Date().toISOString(),
        validation_status: "valid"
      });
    });
    return out;
  }

  function extractStructuredData(fields) {
    const records = [];
    const currentUrl = window.location.href;
    const pageTitle = document.title || "";

    // ── 0. FLIGHT LISTING CARDS (MakeMyTrip, Google Flights, Skyscanner, Cleartrip, Yatra, EaseMyTrip) ──
    const AIRLINE_REGEX = /(IndiGo|Air India(?:\s*Express)?|SpiceJet|Vistara|Akasa(?:\s*Air)?|AirAsia|Emirates|Qatar Airways|Lufthansa|British Airways|Singapore Airlines|Flydubai|Etihad(?:\s*Airways)?|Gulf Air|Oman Air|Saudia|Kuwait Airways|FlyArystan|Air Arabia)/i;
    const FLIGHT_CODE_REGEX = /\b([A-Z0-9]{2}\s*[-–]\s*\d{3,4}|[A-Z0-9]{2}\s+\d{3,4})\b/;
    const TIME_REGEX = /(?:[01]?\d|2[0-3]):[0-5]\d/g;
    const AIRPORT_REGEX = /\b([A-Z]{3})\b/g;
    const DURATION_REGEX = /\b(\d{1,2}h(?:\s*\d{1,2}m)?|\d{1,2}\s*hrs?(?:\s*\d{1,2}\s*mins?)?)\b/i;
    const STOPS_REGEX = /\b(non[-\s]?stop|\d+\s*stops?)\b/i;

    let flightPods = Array.from(document.querySelectorAll(
      ".listingCard, .listingCardWrap, div[id^='listing-id'], .fli-list, .flightItem, .splitViewListing, " +
      "div[class*='listingCard'], div[class*='listingRow'], div[class*='clusterViewListing'], div[class*='flightListing'], " +
      "div[class*='flightCard'], div[class*='flightItem'], div[class*='clusterViewPrice'], " +
      "div[class*='innerFlightListing'], div[class*='itineraryCard'], div[class*='itinerary-card'], " +
      "div[class*='tupleContainer'], div[class*='tupleCard'], div[class*='flightTuple'], div[class*='flightList'], " +
      "[data-testid*='flight-card'], .flight-card, li.pIav2d, div[role='listitem'][jsaction*='flight'], div[class*='simpleListingCard'], " +
      "div[class*='FlightCard'], div[class*='AirSearchResult'], div[class*='flight_card']"
    ));

    // Universal DOM heuristic discovery for flights:
    // If standard selectors matched 0 items, find each airline text node, flight timing, or booking button
    // and ascend up the tree to the nearest card container containing (Airline + Time)
    if (flightPods.length === 0) {
      const anchors = Array.from(document.querySelectorAll("button, a, span, p, div, b, strong")).filter(el => {
        const t = (el.innerText || "").trim();
        return /^(view prices|book now|select|view fares|more flight details)/i.test(t) ||
               (t.length < 35 && AIRLINE_REGEX.test(t));
      });

      const cardSet = new Set();
      for (const anchor of anchors) {
        let curr = anchor.parentElement;
        let depth = 0;
        let foundCard = null;
        while (curr && depth < 25 && curr !== document.body && curr !== document.documentElement) {
          const text = curr.innerText || "";
          if (text.length >= 30 && text.length <= 2500) {
            const hasAirline = AIRLINE_REGEX.test(text);
            const hasTime = /\b\d{1,2}:\d{2}\b/.test(text);
            const hasFare = (/(?:₹|Rs\.?|INR|\$|€|£)\s*[\d,]+/i.test(text) || /\b[1-9]\d{0,2},\d{3}\b/.test(text));
            if (hasAirline && hasTime && (hasFare || depth >= 5)) {
              foundCard = curr;
              // If we found a container with fare, stop at smallest card
              if (hasFare) break;
            }
          }
          curr = curr.parentElement;
          depth++;
        }
        if (foundCard && !cardSet.has(foundCard)) {
          cardSet.add(foundCard);
          flightPods.push(foundCard);
        }
      }
    }

    if (flightPods.length > 0) {
      const processedPods = new Set();

      for (const pod of flightPods) {
        // Prevent duplicate processing
        if (processedPods.has(pod)) continue;
        processedPods.add(pod);

        const podText = pod.innerText || "";
        const hasPrice = /(?:₹|Rs\.?|INR|\$|€|£)\s*[\d,]+/i.test(podText) || /\b[1-9]\d{0,2},\d{3}\b/.test(podText);
        const hasFlightContext = AIRLINE_REGEX.test(podText) || DURATION_REGEX.test(podText) || STOPS_REGEX.test(podText) || currentUrl.includes("/flight") || currentUrl.includes("itinerary=");
        if (!hasPrice && !hasFlightContext) continue;

        // Reset regex indices
        TIME_REGEX.lastIndex = 0;
        AIRPORT_REGEX.lastIndex = 0;

        // 1. Airline Name
        let airlineName = "";
        const airlineEl = pod.querySelector(
          ".airlineName, .airline-name, span.airways-name, p.airline-info, [class*='airlineName'], [class*='airline-name'], .airwaysData p, span.flightName, p.flightName, [class*='flightName'], [class*='airline']"
        );
        if (airlineEl) {
          const m = airlineEl.innerText.trim().match(AIRLINE_REGEX);
          if (m) airlineName = m[0];
          else if (airlineEl.innerText.trim().length < 30 && !/\d{1,2}:\d{2}/.test(airlineEl.innerText)) {
            airlineName = airlineEl.innerText.trim();
          }
        }
        if (!airlineName) {
          const imgEl = pod.querySelector("img[alt], img[title]");
          if (imgEl) {
            const altText = (imgEl.getAttribute("alt") || imgEl.getAttribute("title") || "").trim();
            const m = altText.match(AIRLINE_REGEX);
            if (m) airlineName = m[0];
          }
        }
        if (!airlineName) {
          const m = podText.match(AIRLINE_REGEX);
          if (m) airlineName = m[0];
        }
        if (!airlineName) airlineName = "Scheduled Airline";

        // 2. Flight Code
        let flightCode = "";
        const codeEl = pod.querySelector("p.flightCode, .flight-code, p.font12, [class*='flightCode']");
        if (codeEl) {
          const cm = codeEl.innerText.match(FLIGHT_CODE_REGEX);
          if (cm) flightCode = cm[0];
        }
        if (!flightCode) {
          const cm = podText.match(FLIGHT_CODE_REGEX);
          if (cm) flightCode = cm[0];
        }

        // 3. Timings & Route
        const times = podText.match(TIME_REGEX) || [];
        const depTime = times[0] || "";
        const arrTime = times[1] || "";

        const airportMatches = Array.from(podText.matchAll(AIRPORT_REGEX)).map(m => m[0]);
        const excludedCodes = new Set(["INR", "IDR", "USD", "EUR", "GBP", "ALL", "NEW", "OFF", "FOR", "GST", "NON", "STOP", "VIE", "TOP"]);
        const airports = airportMatches.filter(c => !excludedCodes.has(c));
        const depAirport = airports[0] || "";
        const arrAirport = airports[1] || "";
        const routeText = (depAirport && arrAirport && depAirport !== arrAirport) ? `${depAirport} → ${arrAirport}` : "";

        // 4. Duration & Stops
        const durMatch = podText.match(DURATION_REGEX);
        const duration = durMatch ? durMatch[0] : "";
        const stopMatch = podText.match(STOPS_REGEX);
        const stops = stopMatch ? stopMatch[0] : "Direct";

        // 5. Price (select primary fare, not lock/insurance add-ons)
        let cleanPrice = "";
        let numericPrice = null;
        let currency = "INR";

        // Never include generic utility classes like .blackText alone in price selectors!
        const priceEl = pod.querySelector(
          ".actual-price, [class*='actualPrice'], [class*='clusterViewPrice'], [class*='fare-summary'], span[class*='fontSize18'], div[class*='priceSection'], [data-test*='price'], p[class*='fontSize24'], p[class*='font24'], span[class*='blackFont'], div[class*='blackText'], span[class*='rupee']"
        );
        if (priceEl) {
          const pm = priceEl.innerText.match(/(?:₹|Rs\.?|INR|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i);
          if (pm) {
            const candidateNum = parseFloat(pm[1].replace(/,/g, ''));
            if (!isNaN(candidateNum) && candidateNum >= 800) {
              cleanPrice = pm[0].trim();
              numericPrice = candidateNum;
            }
          }
        }
        if (!cleanPrice) {
          // Look for price patterns with currency symbol
          const allPricesWithCurrency = Array.from(podText.matchAll(/(?:₹|Rs\.?|INR|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)/gi));
          const parsed = allPricesWithCurrency.map(m => ({
            raw: m[0].trim(),
            num: parseFloat(m[1].replace(/,/g, ''))
          })).filter(p => !isNaN(p.num) && p.num >= 1500 && p.num <= 500000); // Filter out micro-fees (e.g. ₹149/₹474 lock price)

          if (parsed.length > 0) {
            parsed.sort((a, b) => a.num - b.num); // Sort ascending to capture lowest available fare for this flight
            cleanPrice = parsed[0].raw;
            numericPrice = parsed[0].num;
          }
        }
        if (!cleanPrice) {
          // Fallback: search for standard 4-to-6 digit fare with commas (e.g., 4,850 or 12,350)
          const commaPrices = Array.from(podText.matchAll(/\b([1-9]\d{0,2},\d{3})\b/g));
          const parsedComma = commaPrices.map(m => ({
            raw: `₹ ${m[1]}`,
            num: parseFloat(m[1].replace(/,/g, ''))
          })).filter(p => !isNaN(p.num) && p.num >= 1500 && p.num <= 200000);

          if (parsedComma.length > 0) {
            parsedComma.sort((a, b) => a.num - b.num);
            cleanPrice = parsedComma[0].raw;
            numericPrice = parsedComma[0].num;
          }
        }
        if (!cleanPrice) {
          // Fallback: search for 4-to-6 digit raw numbers without commas (e.g. 5840 or 14850)
          const rawPrices = Array.from(podText.matchAll(/\b([1-9]\d{3,5})\b/g));
          const parsedRaw = rawPrices.map(m => ({
            raw: `₹ ${Number(m[1]).toLocaleString('en-IN')}`,
            num: parseFloat(m[1])
          })).filter(p => !isNaN(p.num) && p.num >= 2100 && p.num <= 200000 && !/^(2024|2025|2026|2027)$/.test(String(p.num)) && !flightCode.includes(String(p.num)));

          if (parsedRaw.length > 0) {
            parsedRaw.sort((a, b) => a.num - b.num);
            cleanPrice = parsedRaw[0].raw;
            numericPrice = parsedRaw[0].num;
          }
        }
        if (cleanPrice && !cleanPrice.includes("₹") && !cleanPrice.includes("£") && !cleanPrice.includes("$")) {
          cleanPrice = "₹ " + cleanPrice;
        }

        // 6. Title & Specifications
        let fullTitle = airlineName;
        if (flightCode) fullTitle += ` ${flightCode}`;
        if (routeText) fullTitle += ` (${routeText})`;

        const specParts = [];
        if (duration) specParts.push(duration);
        if (stops) specParts.push(stops);
        if (depTime && arrTime) specParts.push(`Dep: ${depTime} Arr: ${arrTime}`);
        const specsText = specParts.join(" • ") || "Scheduled Flight";

        const linkEl = pod.querySelector("a[href]");
        const rawLink = linkEl ? linkEl.href : currentUrl;
        const cleanLink = extractCleanDestinationUrl(rawLink) || rawLink;

        // Detect sponsored status
        const isSponsored = Boolean(
          pod.closest(".pla-unit") ||
          pod.querySelector("[class*='sponsored'], [class*='ad-badge'], [data-ad]") ||
          /sponsored|promoted/i.test(podText.slice(0, 80))
        );

        records.push({
          record_id: `flight_${records.length + 1}_${absHash(fullTitle + cleanPrice)}`,
          title: fullTitle,
          name: fullTitle,
          category: "flight",
          airline: airlineName,
          flight_code: flightCode,
          route: routeText,
          departure_time: depTime,
          arrival_time: arrTime,
          duration: duration,
          stops: stops,
          price: cleanPrice || "Check site",
          numeric_price: numericPrice,
          currency: currency,
          raw_price: cleanPrice,
          rating: null, // Transparent factual value: flights do not invent ratings
          specs: specsText,
          link: cleanLink,
          product_url: cleanLink,
          source_url: currentUrl,
          source_website: identifyPlatformName(currentUrl, pod),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: pod.tagName.toLowerCase() + (pod.className ? '.' + pod.className.split(' ').join('.') : '') },
          sponsored_status: isSponsored,
          validation_status: (cleanPrice && airlineName) ? "valid" : "incomplete"
        });

        if (records.length >= 25) break;
      }

      if (records.length > 0) return records;
    }

    // Secondary fallback for flights on travel domains (MakeMyTrip, Cleartrip, Yatra, Google Flights)
    if (currentUrl.includes("/flight") || currentUrl.includes("itinerary=") || currentUrl.includes("travel/flights")) {
      const allDivs = Array.from(document.querySelectorAll("div, article, li, section"));
      const fallbackPods = allDivs.filter(div => {
        const t = (div.innerText || "");
        if (t.length < 30 || t.length > 1200) return false;
        const hasCarrier = AIRLINE_REGEX.test(t);
        const hasTime = /\b\d{1,2}:\d{2}\b/.test(t);
        const hasPrice = /(?:₹|Rs\.?|INR|\$|€|£)\s*[\d,]+/i.test(t) || /\b[1-9]\d{0,2},\d{3}\b/.test(t);
        return hasCarrier && hasTime && hasPrice;
      });

      // Filter out parents whose child is also in fallbackPods (keep innermost cards)
      const leafPods = fallbackPods.filter(pod => {
        return !fallbackPods.some(other => other !== pod && pod.contains(other));
      });

      for (const pod of leafPods) {
        const podText = pod.innerText || "";
        const m = podText.match(AIRLINE_REGEX);
        const airlineName = m ? m[0] : "Scheduled Airline";
        const codeMatch = podText.match(FLIGHT_CODE_REGEX);
        const flightCode = codeMatch ? codeMatch[0] : "";
        const times = podText.match(TIME_REGEX) || [];
        const depTime = times[0] || "";
        const arrTime = times[1] || "";
        const durMatch = podText.match(DURATION_REGEX);
        const duration = durMatch ? durMatch[0] : "";
        const stopMatch = podText.match(STOPS_REGEX);
        const stops = stopMatch ? stopMatch[0] : "Direct";

        let cleanPrice = "";
        let numPrice = null;
        const priceMatch = podText.match(/(?:₹|Rs\.?|INR|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (priceMatch) {
          cleanPrice = priceMatch[0].trim();
          numPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
        } else {
          const commaM = podText.match(/\b([1-9]\d{0,2},\d{3})\b/);
          if (commaM) {
            cleanPrice = `₹ ${commaM[1]}`;
            numPrice = parseFloat(commaM[1].replace(/,/g, ""));
          } else {
            const rawM = podText.match(/\b([1-9]\d{3,5})\b/);
            if (rawM) {
              const val = parseFloat(rawM[1]);
              if (val >= 2100 && val <= 200000 && !/^(2024|2025|2026|2027)$/.test(String(val))) {
                cleanPrice = `₹ ${val.toLocaleString("en-IN")}`;
                numPrice = val;
              }
            }
          }
        }

        let fullTitle = airlineName;
        if (flightCode) fullTitle += ` ${flightCode}`;

        records.push({
          record_id: `flight_fallback_${records.length + 1}_${absHash(fullTitle + cleanPrice)}`,
          title: fullTitle,
          name: fullTitle,
          category: "flight",
          airline: airlineName,
          flight_code: flightCode,
          departure_time: depTime,
          arrival_time: arrTime,
          duration: duration,
          stops: stops,
          price: cleanPrice || "Check site",
          numeric_price: numPrice,
          currency: "INR",
          raw_price: cleanPrice,
          rating: null,
          specs: [duration, stops, depTime && arrTime ? `Dep: ${depTime} Arr: ${arrTime}` : ""].filter(Boolean).join(" • "),
          link: currentUrl,
          product_url: currentUrl,
          source_url: currentUrl,
          source_website: identifyPlatformName(currentUrl, pod),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: pod.tagName.toLowerCase() },
          sponsored_status: false,
          validation_status: (cleanPrice && airlineName) ? "valid" : "incomplete"
        });

        if (records.length >= 25) break;
      }
      if (records.length > 0) return records;
    }

    // ── 1. HOTEL LISTINGS (Booking.com, MakeMyTrip, Agoda, Google Travel, TripAdvisor) ──
    const hotelPods = document.querySelectorAll(
      "[data-testid='property-card'], .hotel-card, .listing-card, .hotel-item, .sr_item, .c-hotel-card, [data-hotel-id], div[data-testid='hotel-card'], .property-card"
    );
    if (hotelPods.length > 0) {
      for (const pod of hotelPods) {
        if (!isElementVisible(pod)) continue;
        const titleEl = pod.querySelector("[data-testid='title'], .hotel-name, h3, h2, a.property-title");
        const priceEl = pod.querySelector("[data-testid='price-and-discounted-price'], .price, .final-price, .total-price, .rate-per-night, span[data-testid='price-amount']");
        const ratingEl = pod.querySelector("[data-testid='review-score'], .rating, .hotel-rating, [aria-label*='rated'], .score-badge");
        const locationEl = pod.querySelector("[data-testid='address'], .location, .hotel-address, .distance");
        const linkEl = pod.querySelector("a[href]");
        const amenityEls = pod.querySelectorAll(".amenity, .badge, [data-testid='facility-list'] span, .feature-tag, .facility-badge");

        const titleText = titleEl ? titleEl.innerText.trim() : null;
        if (!titleText && !priceEl) continue;

        const amenitiesList = Array.from(amenityEls).map(el => el.innerText.trim()).filter(Boolean);
        const rawLink = linkEl ? linkEl.href : currentUrl;
        const cleanLink = extractCleanDestinationUrl(rawLink) || rawLink;

        let numPrice = null;
        let rawPriceStr = priceEl ? priceEl.innerText.trim() : "";
        if (rawPriceStr) {
          const pm = rawPriceStr.match(/([\d,]+(?:\.\d{1,2})?)/);
          if (pm) numPrice = parseFloat(pm[1].replace(/,/g, ''));
        }

        let ratingVal = null;
        if (ratingEl) {
          const rm = ratingEl.innerText.match(/\b([1-5](?:\.\d)?)\b/);
          if (rm) ratingVal = parseFloat(rm[1]);
        }

        records.push({
          record_id: `hotel_${records.length + 1}_${absHash(titleText || "")}`,
          title: titleText || "Verified Hotel",
          name: titleText || "Verified Hotel",
          category: "hotel",
          price: rawPriceStr || "Check availability",
          numeric_price: numPrice,
          currency: "INR",
          raw_price: rawPriceStr,
          rating: ratingVal,
          location: locationEl ? locationEl.innerText.trim() : "",
          amenities: amenitiesList,
          link: cleanLink,
          product_url: cleanLink,
          source_url: currentUrl,
          source_website: identifyPlatformName(currentUrl, pod),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: pod.tagName.toLowerCase() },
          sponsored_status: Boolean(pod.querySelector("[class*='sponsored'], [class*='ad']")),
          validation_status: titleText ? "valid" : "incomplete"
        });
        if (records.length >= 25) break;
      }
      if (records.length > 0) return records;
    }

    // ── 2. JOB POSTINGS (LinkedIn, Naukri, Indeed, Career portals) ──
    const isJobContext = currentUrl.includes("/job") || currentUrl.includes("naukri.com") || currentUrl.includes("linkedin.com/jobs") || currentUrl.includes("indeed.com") || currentUrl.includes("career");
    const jobPods = document.querySelectorAll(
      ".job-card, .job-item, .jobTuple, .srp-jobtuple-wrapper, [data-testid*='job'], .job_seen_beacon, div[class*='jobCard'], div[class*='JobCard'], article[class*='job']"
    );
    if (jobPods.length > 0 || isJobContext) {
      const candidates = jobPods.length > 0 ? jobPods : document.querySelectorAll("div[class*='card'], li[class*='card'], article");
      for (const pod of candidates) {
        if (!isElementVisible(pod)) continue;
        const text = pod.innerText || "";
        if (text.length < 20 || text.length > 1800) continue;

        const titleEl = pod.querySelector("h2, h3, [class*='title'], a.title, [class*='jobTitle']");
        const compEl = pod.querySelector("[class*='company'], [class*='employer'], .comp-name, [data-testid*='company']");
        const locEl = pod.querySelector("[class*='location'], .loc-name, [data-testid*='location']");
        const salEl = pod.querySelector("[class*='salary'], .sal-name, [data-testid*='salary']");
        const expEl = pod.querySelector("[class*='experience'], .exp-name, [data-testid*='experience']");

        const titleText = titleEl ? titleEl.innerText.trim() : "";
        if (!titleText || titleText.length < 3 || /^(sign in|login|jobs|apply)$/i.test(titleText)) continue;

        const compText = compEl ? compEl.innerText.trim() : "";
        const locText = locEl ? locEl.innerText.trim() : "";
        const salText = salEl ? salEl.innerText.trim() : "";
        const expText = expEl ? expEl.innerText.trim() : "";

        const linkEl = pod.querySelector("a[href]") || pod.closest("a[href]");
        const rawLink = linkEl ? linkEl.href : currentUrl;
        const cleanLink = extractCleanDestinationUrl(rawLink) || rawLink;

        let numSalary = null;
        if (salText) {
          const sm = salText.match(/([\d,]+(?:\.\d{1,2})?)/);
          if (sm) numSalary = parseFloat(sm[1].replace(/,/g, ''));
        }

        records.push({
          record_id: `job_${records.length + 1}_${absHash(titleText + compText)}`,
          title: titleText,
          name: titleText,
          category: "job",
          company: compText || null,
          location: locText || null,
          salary: salText || null,
          experience: expText || null,
          price: salText || "Competitive",
          numeric_price: numSalary,
          currency: "INR",
          raw_price: salText,
          rating: null,
          specs: [compText, locText, expText].filter(Boolean).join(" • "),
          link: cleanLink,
          product_url: cleanLink,
          source_url: currentUrl,
          source_website: identifyPlatformName(currentUrl, pod),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: pod.tagName.toLowerCase() },
          sponsored_status: Boolean(pod.querySelector("[class*='sponsored'], [class*='promoted']")),
          validation_status: titleText ? "valid" : "incomplete"
        });

        if (records.length >= 25) break;
      }
      if (records.length > 0) return records;
    }

    // ── 3. MOVIE SHOWTIMES & TICKETS (BookMyShow, Cinema portals) ──
    const isMovieContext = currentUrl.includes("bookmyshow.com") || currentUrl.includes("pvrcinemas.com") || currentUrl.includes("inoxmovies.com") || currentUrl.includes("/movies") || currentUrl.includes("/cinema");
    const moviePods = document.querySelectorAll(
      ".listing-info, .showtime-pill, .venue-container, div[class*='venue'], div[class*='showtime'], div[class*='cinema-card'], [data-testid*='movie']"
    );
    if (moviePods.length > 0 || isMovieContext) {
      const candidates = moviePods.length > 0 ? moviePods : document.querySelectorAll("div[class*='card'], li[class*='card']");
      for (const pod of candidates) {
        if (!isElementVisible(pod)) continue;
        const text = pod.innerText || "";
        if (text.length < 15 || text.length > 1500) continue;

        const titleEl = pod.querySelector("h2, h3, [class*='title'], [class*='movie-name'], [class*='cinema-name']");
        const timeEl = pod.querySelector("[class*='time'], .showtime, [class*='pill']");
        const priceEl = pod.querySelector("[class*='price'], .ticket-price");

        const titleText = titleEl ? titleEl.innerText.trim() : "";
        if (!titleText || titleText.length < 3) continue;

        const timeText = timeEl ? timeEl.innerText.trim() : "";
        const priceText = priceEl ? priceEl.innerText.trim() : "";

        let numPrice = null;
        if (priceText) {
          const pm = priceText.match(/([\d,]+(?:\.\d{1,2})?)/);
          if (pm) numPrice = parseFloat(pm[1].replace(/,/g, ''));
        }

        const linkEl = pod.querySelector("a[href]") || pod.closest("a[href]");
        const rawLink = linkEl ? linkEl.href : currentUrl;
        const cleanLink = extractCleanDestinationUrl(rawLink) || rawLink;

        records.push({
          record_id: `movie_${records.length + 1}_${absHash(titleText + timeText)}`,
          title: titleText,
          name: titleText,
          category: "movie",
          cinema: titleText,
          showtime: timeText || null,
          price: priceText || "Standard rates",
          numeric_price: numPrice,
          currency: "INR",
          raw_price: priceText,
          rating: null,
          specs: [timeText, priceText].filter(Boolean).join(" • "),
          link: cleanLink,
          product_url: cleanLink,
          source_url: currentUrl,
          source_website: identifyPlatformName(currentUrl, pod),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: pod.tagName.toLowerCase() },
          sponsored_status: false,
          validation_status: titleText ? "valid" : "incomplete"
        });

        if (records.length >= 25) break;
      }
      if (records.length > 0) return records;
    }

    // ── 4. GOOGLE SHOPPING PLA UNITS (Ads & Sponsored Shopping Units) ──
    const plaPods = document.querySelectorAll(
      "div.pla-unit, div.sh-dgr__content, div[data-docid], div.mnr-c div.pla-unit, div.KZmu8e, .pla-unit-container, div.commercial-unit-desktop-top div.pla-unit, div.commercial-unit-desktop-rhs div.pla-unit, div.xcR77"
    );
    if (plaPods.length > 0) {
      for (const pod of plaPods) {
        if (!isElementVisible(pod)) continue;
        const titleEl = pod.querySelector(".pla-unit-title, .sh-np__product-title, .pymv4e, a.clickable-card, .pla-unit-title-link, h3, a[title]");
        const priceEl = pod.querySelector(".e10pkf, span[data-a-color='price'], .a8Pemb, .kHq0Fc, .XrAfOe, b, .dD8iuc, .h16Sm");
        const merchantEl = pod.querySelector(".IuHnof, .LbUacb, .zPEcEc, .VZqbb, .h16Sm, .pla-unit-title-link + div");
        const ratingEl = pod.querySelector("span.Fam1ne, [aria-label*='stars'], [aria-label*='rated'], .taw");
        const linkEl = pod.querySelector("a[href]");

        const titleText = titleEl ? (titleEl.getAttribute("title") || titleEl.innerText).trim() : null;
        if (!titleText || titleText.length < 3 || /^(product|shopping|ad)$/i.test(titleText)) continue;

        let cleanPrice = priceEl ? priceEl.innerText.trim() : "";
        let numPrice = null;
        if (cleanPrice) {
          const pm = cleanPrice.match(/([\d,]+(?:\.\d{1,2})?)/);
          if (pm) numPrice = parseFloat(pm[1].replace(/,/g, ''));
        }
        if (cleanPrice && !cleanPrice.includes("₹") && !cleanPrice.includes("£") && !cleanPrice.includes("$")) {
          cleanPrice = "₹ " + cleanPrice;
        }

        const rawLink = linkEl ? linkEl.href : currentUrl;
        const cleanLink = extractCleanDestinationUrl(rawLink) || rawLink;
        const merchant = merchantEl ? merchantEl.innerText.trim() : "";

        let ratingVal = null;
        if (ratingEl) {
          const rm = ratingEl.innerText.match(/\b([1-5](?:\.\d)?)\b/);
          if (rm) ratingVal = parseFloat(rm[1]);
        }

        // Brand is derived server-side from the item itself (no hardcoded vocabulary)
        const brand = null;

        records.push({
          record_id: `product_${records.length + 1}_${absHash(titleText)}`,
          title: titleText,
          name: titleText,
          category: "smartphone",
          brand: brand,
          price: cleanPrice || "Check site",
          numeric_price: numPrice,
          currency: "INR",
          raw_price: cleanPrice,
          rating: ratingVal, // Transparent: null if not present
          specs: merchant ? `Available on ${merchant}` : "Verified product listing",
          link: cleanLink,
          product_url: cleanLink,
          source_url: currentUrl,
          source_website: merchant || identifyPlatformName(cleanLink, pod),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: ".pla-unit" },
          sponsored_status: true, // PLA units are inherently sponsored
          validation_status: (titleText && numPrice) ? "valid" : "incomplete"
        });

        if (records.length >= 12) break;
      }
      // Do not exit early here; allow organic search results from other top platforms (Amazon, Flipkart, Croma, etc.) to be combined!
    }

    // ── 5. E-COMMERCE PRODUCT LISTINGS (Amazon, Flipkart, Croma, Brand stores) ──
    const productPods = document.querySelectorAll(
      ".product_pod, .item, .book-item, article.product, [data-component-type='s-search-result'], div._1AtVbE, div.tUxRFH, .s-card-container, .product-card, div[data-asin]"
    );
    if (productPods.length > 0) {
      for (const pod of productPods) {
        if (!isElementVisible(pod)) continue;
        const titleEl = pod.querySelector("h3 a, .title, a[title], h2 a span, ._4rR01T, .KzDlHZ, .s-title-instructions-style");
        const priceEl = pod.querySelector(".price_color, .price, .product-price, .a-price-whole, ._30jeq3, .Nx9bqj, span[data-a-color='price']");
        const ratingEl = pod.querySelector(".star-rating, .rating, .a-icon-alt, ._3LWZlK, [aria-label*='stars'], [aria-label*='rating']");
        const linkEl = pod.querySelector("a[href]");
        const specsEl = pod.querySelector("ul._1xgFaf, .specs, .spec-list, .a-section.a-spacing-none, .description");

        const titleText = titleEl ? (titleEl.getAttribute("title") || titleEl.innerText).trim() : null;
        // Never treat generic labels like "Product" as title
        if (!titleText || titleText.length < 4 || /^(product|item|view item|buy now)$/i.test(titleText)) continue;

        let cleanPrice = priceEl ? priceEl.innerText.trim() : "";
        let numPrice = null;
        if (cleanPrice) {
          const pm = cleanPrice.match(/([\d,]+(?:\.\d{1,2})?)/);
          if (pm) numPrice = parseFloat(pm[1].replace(/,/g, ''));
        }
        if (cleanPrice && !cleanPrice.includes("₹") && !cleanPrice.includes("£") && !cleanPrice.includes("$")) {
          cleanPrice = "₹ " + cleanPrice;
        }

        const specsText = specsEl ? specsEl.innerText.replace(/\s+/g, ' ').trim() : "";
        const rawLink = linkEl ? linkEl.href : currentUrl;
        const cleanLink = extractCleanDestinationUrl(rawLink) || rawLink;

        let ratingVal = null;
        if (ratingEl) {
          const rm = ratingEl.innerText.match(/\b([1-5](?:\.\d)?)\b/) || (ratingEl.getAttribute("aria-label") || "").match(/\b([1-5](?:\.\d)?)\b/);
          if (rm) ratingVal = parseFloat(rm[1]);
        }

        // Brand is derived server-side from the item itself (no hardcoded vocabulary)
        const brand = null;

        const isSponsored = Boolean(
          pod.closest(".pla-unit") ||
          pod.querySelector("[class*='sponsored'], [class*='s-sponsored-label'], [data-ad]") ||
          /sponsored|promoted/i.test(pod.innerText.slice(0, 100))
        );

        records.push({
          record_id: `product_${records.length + 1}_${absHash(titleText)}`,
          title: titleText,
          name: titleText,
          category: "smartphone",
          brand: brand,
          price: cleanPrice || "Check site",
          numeric_price: numPrice,
          currency: "INR",
          raw_price: cleanPrice,
          rating: ratingVal, // Factual: null if no rating on page
          specs: specsText,
          link: cleanLink,
          product_url: cleanLink,
          source_url: currentUrl,
          source_website: identifyPlatformName(currentUrl, pod),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: pod.tagName.toLowerCase() },
          sponsored_status: isSponsored,
          validation_status: (titleText && (numPrice || specsText)) ? "valid" : "incomplete"
        });

        if (records.length >= 25) break;
      }
      if (records.length > 0) return records;
    }

    // ── 6. ORGANIC SEARCH ENGINE RESULTS (Google, Bing, DuckDuckGo) ──
    const searchResults = document.querySelectorAll("div.g, div.tF2Cxc, div[data-sokoban-container], li.b_algo, .mw-search-result, .result__body");
    if (searchResults.length > 0) {
      const SERP_NOISE = /^(web results|people also ask|related searches|videos|images|shopping|search results|more results|discussions and forums|news|explore more|perspectives|filter results)$/i;

      // Infer category from page title or query context
      let inferredSerpCat = "generic";
      const qLower = (pageTitle + " " + currentUrl).toLowerCase();
      if (/(phone|smartphone|laptop|gadget|specs|camera|galaxy|iphone|redmi|oneplus)/i.test(qLower)) inferredSerpCat = "smartphone";
      else if (/(flight|fly|airline|airfare|itinerary)/i.test(qLower)) inferredSerpCat = "flight";
      else if (/(hotel|stay|resort|accommodation)/i.test(qLower)) inferredSerpCat = "hotel";
      else if (/(job|jobs|career|fresher|hiring)/i.test(qLower)) inferredSerpCat = "job";
      else if (/(admission|eligibility|syllabus|policy|procedure|documentation|process)/i.test(qLower)) inferredSerpCat = "research";

      for (const res of searchResults) {
        if (!isElementVisible(res)) continue;
        const titleEl = res.querySelector("h3, .mw-search-result-heading a");
        const linkEl = res.querySelector("a[href]");
        const snippetEl = res.querySelector(".VwiC3b, .b_caption p, .searchresult, .result__snippet, [data-sncf]");

        if (!titleEl) continue;
        const rawTitle = titleEl.innerText.trim();
        if (!rawTitle || SERP_NOISE.test(rawTitle) || rawTitle.length < 4) continue;

        const rawHref = linkEl ? linkEl.href : "";
        const cleanLink = extractCleanDestinationUrl(rawHref) || rawHref;

        // Skip internal search links or anchors
        if (cleanLink.includes("google.com/search") || cleanLink.includes("google.com/url?q=https://www.google.com")) {
          continue;
        }

        // Prevent duplicate title or link
        if (records.some(r => r.title === rawTitle || r.link === cleanLink)) continue;

        const snippetText = snippetEl ? snippetEl.innerText.trim() : "";
        const combinedText = `${rawTitle} ${snippetText}`;

        const priceMatch = combinedText.match(/(?:₹|Rs\.?|INR|\$)\s*([\d,]+(?:\.\d{1,2})?)/i);
        const extractedPrice = priceMatch ? priceMatch[0].trim() : "";
        const numPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

        const ratingMatch = combinedText.match(/\b([1-5](?:\.\d)?)\s*(?:★|\/5|out of 5|stars)/i);
        const ratingVal = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        // Brand is derived server-side from the item itself (no hardcoded vocabulary)
        const brand = null;

        records.push({
          record_id: `serp_${records.length + 1}_${absHash(rawTitle)}`,
          title: rawTitle,
          name: rawTitle,
          category: inferredSerpCat,
          brand: brand,
          price: extractedPrice || "Check site",
          numeric_price: numPrice,
          currency: "INR",
          raw_price: extractedPrice,
          rating: ratingVal,
          snippet: snippetText || "Verified research finding on destination page.",
          specs: snippetText.slice(0, 160),
          link: cleanLink || currentUrl,
          product_url: cleanLink || currentUrl,
          source_url: currentUrl,
          source_website: identifyPlatformName(cleanLink || currentUrl, res),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: "div.g" },
          // A search result is a page ABOUT items (article, thread, listicle), not an item itself.
          record_kind: "search_result",
          sponsored_status: false,
          validation_status: rawTitle ? "valid" : "incomplete"
        });
        if (records.length >= 25) break;
      }
      if (records.length > 0) return records;
    }

    // ── 7. UNIVERSAL REPETITIVE CARD EXTRACTOR (Dynamic E-commerce / Travel Sites) ──
    const cardPriceRegex = /(?:₹|Rs\.?|INR|\$|€|£)\s*[\d,]+(?:\.\d{1,2})?/i;
    const candidateNodes = document.querySelectorAll(
      "div[class*='card'], div[class*='item'], div[class*='listing'], div[class*='product'], div[class*='flight'], div[class*='hotel'], div[class*='result'], li[class*='card'], li[class*='item'], article"
    );

    if (candidateNodes.length >= 2) {
      const cardRecords = [];
      const seenTitles = new Set();

      for (const card of candidateNodes) {
        if (!isElementVisible(card)) continue;
        const text = card.innerText ? card.innerText.trim() : "";
        if (text.length < 20 || text.length > 1800) continue;

        const priceMatch = text.match(cardPriceRegex);
        if (!priceMatch) continue;

        // Skip if nested inside an already matched card
        let isNested = false;
        for (const existing of cardRecords) {
          if (existing._el && existing._el.contains(card)) {
            isNested = true;
            break;
          }
        }
        if (isNested) continue;

        const titleEl = card.querySelector("h2, h3, h4, h5, [class*='title'], [class*='name'], [class*='bold'], strong, b, img[alt]");
        let titleText = titleEl ? (titleEl.getAttribute("alt") || titleEl.innerText).trim() : "";
        if (!titleText || titleText.length < 3 || /^(product|item|view item)$/i.test(titleText)) {
          const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 3 && !cardPriceRegex.test(l));
          titleText = lines[0] || "";
        }
        if (!titleText || titleText.length < 3 || seenTitles.has(titleText.toLowerCase())) continue;
        seenTitles.add(titleText.toLowerCase());

        let ratingVal = null;
        const ratingMatch = text.match(/\b([1-5](?:\.\d)?)\s*(?:★|\/5|out of 5|stars)\b/);
        if (ratingMatch) ratingVal = parseFloat(ratingMatch[1]);

        let numPrice = null;
        const pm = priceMatch[0].match(/([\d,]+(?:\.\d{1,2})?)/);
        if (pm) numPrice = parseFloat(pm[1].replace(/,/g, ''));

        const cleanLines = text.split("\n").map(l => l.trim()).filter(l => l && l !== titleText && !cardPriceRegex.test(l));
        const specsText = cleanLines.slice(0, 3).join(" • ");

        const linkEl = card.querySelector("a[href]") || card.closest("a[href]");
        const rawLink = linkEl ? linkEl.href : currentUrl;
        const cleanLink = extractCleanDestinationUrl(rawLink) || rawLink;

        let itemCat = "product";
        if (/(flight|airline|dep|arr|stop|flightcode)/i.test(text)) itemCat = "flight";
        else if (/(hotel|room|night|stay|resort|villa)/i.test(text)) itemCat = "hotel";

        // Brand is derived server-side from the item itself (no hardcoded vocabulary)
        const brand = null;

        const isSponsored = Boolean(
          card.querySelector("[class*='sponsored'], [class*='ad-badge'], [data-ad]") ||
          /sponsored|promoted/i.test(text.slice(0, 80))
        );

        cardRecords.push({
          record_id: `rep_${cardRecords.length + 1}_${absHash(titleText)}`,
          title: titleText,
          name: titleText,
          category: itemCat,
          brand: brand,
          price: priceMatch[0].trim(),
          numeric_price: numPrice,
          currency: "INR",
          raw_price: priceMatch[0].trim(),
          rating: ratingVal,
          specs: specsText.slice(0, 160),
          link: cleanLink,
          product_url: cleanLink,
          source_url: currentUrl,
          source_website: identifyPlatformName(currentUrl, card),
          extraction_timestamp: new Date().toISOString(),
          evidence: { selector: card.tagName.toLowerCase() },
          sponsored_status: isSponsored,
          validation_status: titleText ? "valid" : "incomplete",
          _el: card
        });

        if (cardRecords.length >= 25) break;
      }

      if (cardRecords.length >= 2) {
        return cardRecords.map(({ _el, ...rest }) => rest);
      }
    }

    // ── 8. STRUCTURED HTML TABLES ──
    const tableRows = document.querySelectorAll("table tr");
    if (tableRows.length > 1) {
      const headers = Array.from(tableRows[0].querySelectorAll("th, td")).map(th => th.innerText.trim().toLowerCase());
      for (let i = 1; i < tableRows.length; i++) {
        const cells = Array.from(tableRows[i].querySelectorAll("td")).map(td => td.innerText.trim());
        if (cells.length > 0 && cells.some(c => c.length > 0)) {
          const record = {
            record_id: `table_row_${i}`,
            title: cells[0] || `Row ${i}`,
            name: cells[0] || `Row ${i}`,
            category: "table",
            source_url: currentUrl,
            source_website: identifyPlatformName(currentUrl),
            extraction_timestamp: new Date().toISOString(),
            validation_status: "valid"
          };
          headers.forEach((h, idx) => {
            record[h || `col_${idx}`] = cells[idx] || "";
          });
          records.push(record);
        }
      }
      if (records.length > 0) return records;
    }

    // ── 8.5 UNIVERSAL STRUCTURED DATA (JSON-LD / timed articles): site-independent ──
    {
      const isKnownCommerce = /makemytrip|amazon|flipkart|booking\.com|agoda|skyscanner|cleartrip|yatra|easemytrip/i.test(currentUrl);
      if (!isKnownCommerce) {
        const ld = extractJsonLdRecords();
        if (ld.length > 0) return ld;
        const timed = extractTimedArticleRecords();
        if (timed.length >= 2) return timed;
      }
    }

    // ── 9. RESEARCH & ARTICLE SECTIONS (Wikipedia, Documentation, Blogs) ──
    const isCommercialDomain = /makemytrip|amazon|flipkart|booking\.com|agoda|myntra|ajio|croma|reliancedigital|skyscanner|cleartrip|yatra|easemytrip|indigo\.in|airindia/i.test(currentUrl);
    if (!isCommercialDomain) {
      const articleHeadings = document.querySelectorAll("main h2, article h2, .mw-parser-output > h2, h2");
      if (articleHeadings.length > 0) {
        for (const h of articleHeadings) {
          const hText = h.innerText.trim();
          if (!hText || ["contents", "navigation", "references", "external links", "see also"].includes(hText.toLowerCase())) continue;
          if (/^(makemytrip|amazon|flipkart|google|booking|sign up|sign in|login|privacy|terms|menu|navigation)$/i.test(hText)) continue;

          let nextP = h.nextElementSibling;
          while (nextP && nextP.tagName.toLowerCase() !== "p" && nextP.tagName.toLowerCase() !== "h2") {
            nextP = nextP.nextElementSibling;
          }

          records.push({
            record_id: `sec_${records.length + 1}_${absHash(hText)}`,
            title: hText,
            name: hText,
            category: "article",
            snippet: nextP ? nextP.innerText.trim().slice(0, 320) : hText,
            specs: nextP ? nextP.innerText.trim().slice(0, 160) : "",
            link: currentUrl,
            product_url: currentUrl,
            source_url: currentUrl,
            source_website: identifyPlatformName(currentUrl),
            extraction_timestamp: new Date().toISOString(),
            validation_status: "valid"
          });
          if (records.length >= 15) break;
        }
        if (records.length > 0) return records;
      }
    }

    // ── 10. NO VALID DATA FOUND: RETURN EMPTY ARRAY (Never invent fake fallback records!) ──
    return [];
  }

  function absHash(str) {
    let hash = 0;
    for (let i = 0; i < (str || "").length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // Listen for messages from the Side Panel / Agent Loop
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_OBSERVATION") {
    const obs = generateObservation();
    sendResponse({ observation: obs });
    return true;
  }

  if (request.type === "EXECUTE_ACTION") {
    executeAction(request.action, request.params)
      .then(result => sendResponse({ result }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (request.type === "TOGGLE_DOM_LENS") {
    const active = toggleDomLens(request.forceState);
    sendResponse({ active });
    return true;
  }

  if (request.type === "PING_CONTENT") {
    sendResponse({ status: "alive", url: window.location.href });
    return true;
  }

  if (request.type === "DETECT_PAGE_FORMS") {
    try {
      let detection;
      if (typeof NetSurfAutofill !== "undefined" && NetSurfAutofill.detectPageForms) {
        detection = NetSurfAutofill.detectPageForms();
      } else {
        const forms = document.querySelectorAll("form");
        const inputs = document.querySelectorAll("input:not([type='hidden']), select, textarea");
        detection = { hasForm: inputs.length > 0, formCount: forms.length, fieldCount: inputs.length, fields: [] };
      }
      sendResponse({ success: true, ...detection });
    } catch (err) {
      sendResponse({ success: false, error: err.message, hasForm: false, formCount: 0, fieldCount: 0 });
    }
    return true;
  }

  if (request.type === "PREVIEW_AUTOFILL") {
    try {
      let preview;
      if (typeof NetSurfAutofill !== "undefined" && NetSurfAutofill.previewFormMappings) {
        preview = NetSurfAutofill.previewFormMappings(request.profileData || {});
      } else {
        preview = { hasForm: false, totalFields: 0, matchedCount: 0, fields: [] };
      }
      sendResponse({ success: true, ...preview });
    } catch (err) {
      sendResponse({ success: false, error: err.message, fields: [] });
    }
    return true;
  }

  if (request.type === "FILL_CONFIRMED_FIELDS") {
    try {
      let result;
      if (typeof NetSurfAutofill !== "undefined" && NetSurfAutofill.fillConfirmedFields) {
        result = NetSurfAutofill.fillConfirmedFields(request.mappings || []);
      } else {
        result = fallbackSemanticFillForm(request.mappings || {});
      }
      showAgentHud(`✓ Autofilled ${result.filledCount} fields in ${result.durationMs || 100}ms (Submit manually)`);
      sendResponse({ success: true, ...result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (request.type === "EXTRACT_ACTIVE_PAGE_DATA") {
    (async () => {
      try {
        showAgentHud("Waiting for page to fully load...");
        // DOM-stabilization: wait for lazy content and dynamic elements
        await waitForDOMStable(3000, 220);
        // Dismiss any overlays/modals that could block content
        dismissModalPopups();
        await new Promise(r => setTimeout(r, 180));

        showAgentHud("Inspecting active webpage content...");
        const url = window.location.href;
        const title = document.title;
        let pageType = "generic";
        const urlLower = url.toLowerCase();
        if (urlLower.includes("/flight") || urlLower.includes("flights") || urlLower.includes("skyscanner") || urlLower.includes("itinerary=")) pageType = "flight";
        else if (urlLower.includes("/hotel") || urlLower.includes("hotels") || urlLower.includes("booking.com") || urlLower.includes("agoda.com")) pageType = "hotel";
        else if (urlLower.includes("amazon.") || urlLower.includes("flipkart.") || urlLower.includes("croma.com") || urlLower.includes("/dp/") || urlLower.includes("/p/")) pageType = "shopping";
        else if (urlLower.includes("/job") || urlLower.includes("jobs") || urlLower.includes("linkedin.com/jobs") || urlLower.includes("naukri.com") || urlLower.includes("indeed.com")) pageType = "jobs";
        else if (urlLower.includes("bookmyshow.com") || urlLower.includes("/movies") || urlLower.includes("/cinema")) pageType = "movies";
        else if (document.querySelector("article, .post-content, .article-body")) pageType = "article";
        else if (document.querySelector("table")) pageType = "table";

        const records = extractStructuredData(["title", "price", "rating", "link", "snippet"]);
        showAgentHud(`✓ Extracted ${records.length} structured records (${pageType})`);
        setTimeout(hideAgentHud, 2500);

        sendResponse({
          success: true,
          pageType,
          title,
          url,
          count: records.length,
          records
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message, records: [] });
      }
    })();
    return true; // async sendResponse
  }

  if (request.type === "AUTOFILL_FORM_DIRECT") {
    try {
      let result;
      if (typeof NetSurfAutofill !== "undefined" && NetSurfAutofill.semanticallyFillForm) {
        result = NetSurfAutofill.semanticallyFillForm(request.profileData || {});
      } else {
        result = fallbackSemanticFillForm(request.profileData || {});
      }
      showAgentHud(`✓ Autofilled ${result.filledCount} fields in ${result.durationMs}ms`);
      sendResponse({ success: true, result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (request.type === "GET_TOP_DESTINATION_URL") {
    try {
      const bestUrl = findTopAuthoritativeDestinationUrl();
      sendResponse({ success: true, url: bestUrl });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (request.type === "HIDE_HUD") {
    hideAgentHud();
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Discovers the most authoritative destination link on an organic search results page.
 * Strips search redirects and prioritizes official domains (.ac.in, .edu, .gov, .org, official portals).
 */
function findTopAuthoritativeDestinationUrl() {
  const h3Links = Array.from(document.querySelectorAll("h3"))
    .map(h3 => h3.closest("a[href]"))
    .filter(Boolean);
  const candidateNodes = [
    ...h3Links,
    ...document.querySelectorAll(
      "div.g a[href], div.tF2Cxc a[href], div[data-header-feature] a[href], div[data-sokoban-container] a[href], li.b_algo h2 a, .result__body a.result__url, #search a[href]"
    )
  ];

  const candidates = [];
  const seenUrls = new Set();

  for (const node of candidateNodes) {
    const rawHref = node.getAttribute("href") || node.href || "";
    const cleanUrl = extractCleanDestinationUrl(rawHref);
    if (!cleanUrl || !cleanUrl.startsWith("http")) continue;

    try {
      const u = new URL(cleanUrl);
      const host = u.hostname.toLowerCase();
      // Skip search engines, ad links, social networks, video sites
      if (host.includes("google.") || host.includes("bing.") || host.includes("duckduckgo.") ||
          host.includes("youtube.") || host.includes("facebook.") || host.includes("instagram.") ||
          host.includes("twitter.") || host.includes("x.com") || host.includes("pinterest.") ||
          cleanUrl.includes("/search?") || cleanUrl.includes("webcache.googleusercontent.com")) {
        continue;
      }

      // Skip paid ad placements entirely (Google/Bing ad redirects and ad containers)
      if (/(googleadservices\.|\/aclk\?|doubleclick\.|bing\.com\/aclick)/i.test(rawHref) ||
          node.closest("[data-text-ad], [data-ad-slot], .ads-ad, #tads, #tadsb, .b_ad, .ad_sc")) {
        continue;
      }

      if (seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);

      let score = 10;
      // Primary/reference sources beat user-generated content and SEO aggregators
      if (/(^|\.)(reddit|quora|medium|tumblr|blogspot|wordpress|scribd|slideshare|answers\.yahoo|brainly|tiktok|linkedin)\./i.test(host)) score -= 45;
      else if (/(^|\.)(wikipedia|britannica|who\.int|nih\.gov|mozilla|w3|github|docs?\.)/i.test(host)) score += 25;
      // Institutional / Authoritative TLD bonuses
      if (/\.(ac\.in|edu\.in|edu|gov\.in|gov|org|res\.in|nic\.in)$/i.test(host)) score += 60;
      else if (/\.(in|org|net)$/i.test(host)) score += 20;

      // Official domain / keyword clues in title or URL
      const text = (node.innerText || "").toLowerCase();
      if (text.includes("official") || text.includes("admission") || text.includes("portal") || text.includes("policy")) score += 25;
      if (cleanUrl.toLowerCase().includes("admission") || cleanUrl.toLowerCase().includes("policy") || cleanUrl.toLowerCase().includes("apply")) score += 20;

      // Position bonus: earlier results ranked higher by search engine
      score += Math.max(0, 30 - candidates.length * 4);

      candidates.push({ url: cleanUrl, score, title: node.innerText.trim() });
    } catch (e) {}
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].url;
  }

  // Fallback: look for any valid non-search external link in body
  for (const a of document.querySelectorAll("a[href]")) {
    const h = extractCleanDestinationUrl(a.href);
    if (h && h.startsWith("http") && !h.includes("google.") && !h.includes("youtube.") && !h.includes("/search")) {
      return h;
    }
  }
  return null;
}

function fallbackSemanticFillForm(data) {
  if (typeof NetSurfAutofill !== "undefined" && NetSurfAutofill.semanticallyFillForm) {
    return NetSurfAutofill.semanticallyFillForm(data);
  }
  // Basic fallback if helper module loading delayed
  let count = 0;
  const inputs = document.querySelectorAll("input:not([type='hidden']), select, textarea");
  for (const el of inputs) {
    const name = (el.name || el.id || el.placeholder || "").toLowerCase();
    for (const [k, v] of Object.entries(data)) {
      if (name.includes(k.toLowerCase()) && v) {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        count++;
        break;
      }
    }
  }
  return { success: true, filledCount: count, durationMs: 40 };
}

console.log("[Netsurf] Content script active & ready on:", window.location.href);
}) ();
