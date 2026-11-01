/**
 * Netsurf 2.0 Side Panel UI Controller
 * Features:
 * - Active Tab Context Awareness (title, domain, favicon tracking)
 * - Hero Prompt Workspace with Everyday Intent Chips
 * - Real-Time Gemini Co-Pilot Stream (thoughts, actions, direct answer cards)
 * - Interactive Elements Inspector (live page DOM element viewer & testing)
 * - Extracted Data Table with live filtering, CSV Export & JSON Copy
 * - On-Page DOM Vision Lens (Numeric Tags Overlay)
 * - Human-in-the-Loop Approval Modal Gate
 */

document.addEventListener("DOMContentLoaded", () => {
  const agent = new window.AgentLoop("http://127.0.0.1:8000");

  // Top Navigation & Views
  const navAssistantBtn = document.getElementById("navAssistantBtn");
  const navHistoryBtn = document.getElementById("navHistoryBtn");
  const navSavedBtn = document.getElementById("navSavedBtn");
  const navProfilesBtn = document.getElementById("navProfilesBtn");
  const navMemoryBtn = document.getElementById("navMemoryBtn");
  const navSettingsBtn = document.getElementById("navSettingsBtn");

  const viewAssistant = document.getElementById("viewAssistant");
  const viewHistory = document.getElementById("viewHistory");
  const viewSaved = document.getElementById("viewSaved");
  const viewMemory = document.getElementById("viewMemory");
  const viewSettings = document.getElementById("viewSettings");

  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const savedList = document.getElementById("savedList");

  // Saved Items & Price Tracker Elements (Phase 6)
  const btnModeSavedItems = document.getElementById("btnModeSavedItems");
  const btnModePriceTracker = document.getElementById("btnModePriceTracker");
  const paneSavedItems = document.getElementById("paneSavedItems");
  const panePriceTracker = document.getElementById("panePriceTracker");
  const savedTotalCount = document.getElementById("savedTotalCount");
  const trackerActiveCount = document.getElementById("trackerActiveCount");
  const statActiveTrackers = document.getElementById("statActiveTrackers");
  const statTargetMet = document.getElementById("statTargetMet");
  const statTotalSavings = document.getElementById("statTotalSavings");
  const btnSaveCurrentTab = document.getElementById("btnSaveCurrentTab");
  const btnCheckAllTrackersNow = document.getElementById("btnCheckAllTrackersNow");
  const priceTrackerList = document.getElementById("priceTrackerList");
  const priceHistoryModal = document.getElementById("priceHistoryModal");
  const closePriceHistoryBtn = document.getElementById("closePriceHistoryBtn");
  const historyModalTitle = document.getElementById("historyModalTitle");
  const historyModalSubtitle = document.getElementById("historyModalSubtitle");
  const priceModalSummaryRow = document.getElementById("priceModalSummaryRow");
  const priceHistoryChartContainer = document.getElementById("priceHistoryChartContainer");
  const priceObservationsList = document.getElementById("priceObservationsList");

  // Header & Status
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const syncEngineBtn = document.getElementById("syncEngineBtn");
  const toggleLensBtn = document.getElementById("toggleLensBtn");

  // Active Tab Elements
  const tabFavicon = document.getElementById("tabFavicon");
  const activeTabTitle = document.getElementById("activeTabTitle");
  const activeTabDomain = document.getElementById("activeTabDomain");

  // Prompt & Controls
  const goalInput = document.getElementById("goalInput");
  const clearPromptBtn = document.getElementById("clearPromptBtn");
  const runBtn = document.getElementById("runBtn");
  const stopBtn = document.getElementById("stopBtn");

  // Status & Progress Banner
  const statusBanner = document.getElementById("statusBanner");
  const phaseCounter = document.getElementById("phaseCounter");
  const actionCounter = document.getElementById("actionCounter");
  const statusStateBadge = document.getElementById("statusStateBadge");
  const statusMessage = document.getElementById("statusMessage");

  // Plan Section
  const planSection = document.getElementById("planSection");
  const planToggleHeader = document.getElementById("planToggleHeader");
  const planToggleArrow = document.getElementById("planToggleArrow");
  const planSummaryBadge = document.getElementById("planSummaryBadge");
  const planContainer = document.getElementById("planContainer");

  // Tabs Navigation
  const tabLogBtn = document.getElementById("tabLogBtn");
  const tabResultsBtn = document.getElementById("tabResultsBtn");
  const tabElementsBtn = document.getElementById("tabElementsBtn");
  const logContent = document.getElementById("logContent");
  const resultsContent = document.getElementById("resultsContent");
  const elementsContent = document.getElementById("elementsContent");

  // Stream Toolbar
  const clearLogBtn = document.getElementById("clearLogBtn");
  const logStream = document.getElementById("logStream");

  // Results Tab
  const resultsCount = document.getElementById("resultsCount");
  const resultsInfo = document.getElementById("resultsInfo");
  const tableFilterInput = document.getElementById("tableFilterInput");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const copyJsonBtn = document.getElementById("copyJsonBtn");
  const resultsTableContainer = document.getElementById("resultsTableContainer");

  // Elements Inspector Tab
  const elementsCount = document.getElementById("elementsCount");
  const elementFilterInput = document.getElementById("elementFilterInput");
  const refreshElementsBtn = document.getElementById("refreshElementsBtn");
  const elementsListContainer = document.getElementById("elementsListContainer");

  // Approval Modal
  const approvalModal = document.getElementById("approvalModal");
  const approvalDetails = document.getElementById("approvalDetails");
  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  // Identity & Profile Vault
  const activeProfileSelect = document.getElementById("activeProfileSelect");
  const directAutofillBtn = document.getElementById("directAutofillBtn");
  const manageVaultBtn = document.getElementById("manageVaultBtn");
  const savePromptProfileBanner = document.getElementById("savePromptProfileBanner");
  const saveProfileBannerText = document.getElementById("saveProfileBannerText");
  const savePromptProfileBtn = document.getElementById("savePromptProfileBtn");
  const dismissSaveBannerBtn = document.getElementById("dismissSaveBannerBtn");

  // Vault Modal Elements
  const vaultModal = document.getElementById("vaultModal");
  const closeVaultModalBtn = document.getElementById("closeVaultModalBtn");
  const vaultListView = document.getElementById("vaultListView");
  const vaultProfilesCount = document.getElementById("vaultProfilesCount");
  const btnResetVaultDefaults = document.getElementById("btnResetVaultDefaults");
  const btnAddNewProfile = document.getElementById("btnAddNewProfile");
  const vaultCardsList = document.getElementById("vaultCardsList");

  const vaultEditView = document.getElementById("vaultEditView");
  const vaultEditTitle = document.getElementById("vaultEditTitle");
  const profileFormName = document.getElementById("profileFormName");
  const profileFormTag = document.getElementById("profileFormTag");
  const profileSmartPasteInput = document.getElementById("profileSmartPasteInput");
  const btnApplySmartPaste = document.getElementById("btnApplySmartPaste");

  const editingProfileId = document.getElementById("editingProfileId");
  const btnCancelEditProfile = document.getElementById("btnCancelEditProfile");
  const btnSaveProfile = document.getElementById("btnSaveProfile");

  // Canonical Field Input Elements Map
  const vaultFieldInputs = {
    title: document.getElementById("vf_title"),
    firstName: document.getElementById("vf_firstName"),
    middleInitial: document.getElementById("vf_middleInitial"),
    lastName: document.getElementById("vf_lastName"),
    fullName: document.getElementById("vf_fullName"),
    email: document.getElementById("vf_email"),
    cellPhone: document.getElementById("vf_cellPhone"),
    company: document.getElementById("vf_company"),
    position: document.getElementById("vf_position"),
    address1: document.getElementById("vf_address1"),
    address2: document.getElementById("vf_address2"),
    city: document.getElementById("vf_city"),
    state: document.getElementById("vf_state"),
    country: document.getElementById("vf_country"),
    zip: document.getElementById("vf_zip"),
    userId: document.getElementById("vf_userId"),
    website: document.getElementById("vf_website"),
    comments: document.getElementById("vf_comments"),
  };

  // State
  let pendingApprovalResolve = null;
  let domLensActive = false;
  let currentGoal = "";
  let currentActiveTab = null;
  let cachedElements = [];
  let planCollapsed = false;
  let detectedPromptFields = null;

  // ── 1. ACTIVE TAB AWARENESS ───────────────────────────────────────────────
  async function updateActiveTabContext() {
    try {
      if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
        if (activeTabTitle) activeTabTitle.innerText = "Developer Active Tab";
        if (activeTabDomain) activeTabDomain.innerText = "netsurf.local";
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      currentActiveTab = tab;

      // Update favicon
      if (tab.favIconUrl && tab.favIconUrl.startsWith("http")) {
        tabFavicon.innerHTML = `<img src="${tab.favIconUrl}" style="width:16px;height:16px;border-radius:3px;" />`;
      } else {
        tabFavicon.innerText = "🌐";
      }

      // Title & Domain
      activeTabTitle.innerText = tab.title || "Untitled Tab";
      activeTabTitle.title = tab.title || "";

      if (tab.url) {
        try {
          const parsed = new URL(tab.url);
          activeTabDomain.innerText = parsed.hostname;
        } catch {
          activeTabDomain.innerText = tab.url.slice(0, 30);
        }
      } else {
        activeTabDomain.innerText = "Local/Protected Page";
      }
    } catch (e) {
      console.warn("Failed to fetch active tab:", e);
    }
  }

  // Initial update + listeners
  updateActiveTabContext();
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(updateActiveTabContext);
  }
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "complete") updateActiveTabContext();
    });
  }

  // ── 2. BACKEND HEALTH CHECK ───────────────────────────────────────────────
  let _backendWasOffline = false;

  async function checkBackendConnection() {
    const health = await agent.checkHealth();
    if (health.status === "ok") {
      // If we were previously offline, show recovery notification
      if (_backendWasOffline) {
        _backendWasOffline = false;
        showStatus("success", "✓ Backend connection restored — Netsurf is back online.");
        // Auto-clear recovery message after 3s
        setTimeout(() => {
          showStatus("idle", "Netsurf Co-Pilot ready. Enter an instruction or select an intent above.");
        }, 3000);
      }
      statusDot.className = "status-dot connected";
      const model = health.model || "Gemini";
      let shortName = "Gemini";
      if (model.includes("3.5-flash")) shortName = "Gemini 3.5";
      else if (model.includes("2.5-flash")) shortName = "Gemini 2.5";
      else if (model.includes("1.5-flash")) shortName = "Gemini 1.5";
      else if (model.includes("flash")) shortName = "Flash";
      statusText.innerText = shortName;
      statusText.title = `Model: ${health.model} | Gemini Brain Online`;
      if (health.mode === "degraded") {
        // Be honest about reduced quality instead of silently running on heuristics
        statusText.innerText = "Limited mode";
        statusText.title = health.warning || "Running without Gemini; results may be less accurate.";
        statusDot.className = "status-dot disconnected";
      }
    } else {
      _backendWasOffline = true;
      statusDot.className = "status-dot disconnected";
      statusText.innerText = "Offline";
      statusText.title = "FastAPI backend is offline (Port 8000). Run start_backend.bat";
      // If agent is running, notify user immediately with recovery guidance
      if (agent.isRunning) {
        showStatus("error", "⚠ Backend connection lost. The agent will retry automatically. Run start_backend.bat if the issue persists.");
      }
    }
  }

  checkBackendConnection();
  setInterval(checkBackendConnection, 10000);

  // ── 3. ENGINE SYNC & VISION LENS ──────────────────────────────────────────
  if (syncEngineBtn) {
    syncEngineBtn.addEventListener("click", async () => {
      syncEngineBtn.style.transform = "rotate(360deg)";
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await agent.ensureContentScriptInjected(tab.id);
        }
        await updateActiveTabContext();
        await checkBackendConnection();
        loadElementsInspector();
        showStatus("success", "✓ Co-Pilot synchronized with active tab.");
        setTimeout(() => {
          showStatus("idle", "Netsurf Co-Pilot ready. Enter an instruction or select an intent above.");
        }, 2000);
      } catch (e) {
        showStatus("error", "Sync note: " + e.message);
      } finally {
        setTimeout(() => { syncEngineBtn.style.transform = ""; }, 400);
      }
    });
  }

  if (toggleLensBtn) {
    toggleLensBtn.addEventListener("click", async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;
        await agent.ensureContentScriptInjected(tab.id);
        domLensActive = !domLensActive;
        await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_DOM_LENS", forceState: domLensActive });
        toggleLensBtn.classList.toggle("active", domLensActive);
        toggleLensBtn.title = domLensActive ? "Vision Lens Active (Click to hide tags)" : "Toggle On-Page DOM Numeric Tags";
      } catch (e) {
        console.warn("DOM Lens toggle:", e.message);
      }
    });
  }

  // ── 4. PROMPT INPUT & INTENT CHIPS ────────────────────────────────────────
  goalInput.addEventListener("input", () => {
    clearPromptBtn.style.display = goalInput.value.length > 0 ? "flex" : "none";
    autoResizeTextarea(goalInput);

    // Dynamic semantic detection of form details typed in the prompt
    if (window.NetSurfAutofill && window.NetSurfAutofill.parseFormDetailsFromText) {
      const parsed = window.NetSurfAutofill.parseFormDetailsFromText(goalInput.value);
      const keys = Object.keys(parsed);
      if (keys.length >= 2) {
        detectedPromptFields = parsed;
        const keySample = keys.slice(0, 3).map(k => k.replace(/([A-Z])/g, ' $1').toLowerCase()).join(", ");
        saveProfileBannerText.innerText = `Detected ${keys.length} form details (${keySample}...) in prompt.`;
        savePromptProfileBanner.classList.remove("hidden");
      } else {
        detectedPromptFields = null;
        savePromptProfileBanner.classList.add("hidden");
      }
    }
  });

  savePromptProfileBtn.addEventListener("click", () => {
    if (!detectedPromptFields) return;
    openVaultInEditMode(null, detectedPromptFields, "Profile from Prompt");
    savePromptProfileBanner.classList.add("hidden");
  });

  dismissSaveBannerBtn.addEventListener("click", () => {
    savePromptProfileBanner.classList.add("hidden");
  });

  clearPromptBtn.addEventListener("click", () => {
    goalInput.value = "";
    clearPromptBtn.style.display = "none";
    savePromptProfileBanner.classList.add("hidden");
    detectedPromptFields = null;
    goalInput.focus();
    autoResizeTextarea(goalInput);
  });

  goalInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runBtn.click();
    }
  });

  function autoResizeTextarea(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  // ── 4A. PHASE 1 FUNCTIONAL ACTION BUTTONS & INTERACTION MODES ────────────
  const btnQuickExtract = document.getElementById("btnQuickExtract");
  const btnQuickAutofill = document.getElementById("btnQuickAutofill");
  const btnQuickPageQA = document.getElementById("btnQuickPageQA");
  const btnQuickSummarize = document.getElementById("btnQuickSummarize");
  const activeModeBar = document.getElementById("activeModeBar");
  const btnExitMode = document.getElementById("btnExitMode");

  // Task Summary Elements
  const taskSummaryCard = document.getElementById("taskSummaryCard");
  const taskIntentBadge = document.getElementById("taskIntentBadge");
  const taskSummaryTarget = document.getElementById("taskSummaryTarget");
  const taskSummaryParams = document.getElementById("taskSummaryParams");
  const taskSummaryExpected = document.getElementById("taskSummaryExpected");
  const taskSummaryConfirmRow = document.getElementById("taskSummaryConfirmRow");
  const taskSummaryConfirm = document.getElementById("taskSummaryConfirm");

  // Page Q&A Mode State
  let isPageQAMode = false;

  function setPageQAMode(active) {
    isPageQAMode = active;
    if (activeModeBar) {
      activeModeBar.classList.toggle("hidden", !isPageQAMode);
    }
    if (btnQuickPageQA) {
      btnQuickPageQA.classList.toggle("active", isPageQAMode);
    }
    if (isPageQAMode) {
      goalInput.placeholder = "Ask a question about this active page only... (e.g. 'What is the price?', 'Summarize cancellation policy')";
      goalInput.focus();
    } else {
      goalInput.placeholder = "Tell NetSurf what to do... (e.g. 'Find flights on MakeMyTrip', 'Extract items', 'Autofill form')";
    }
  }

  if (btnQuickPageQA) {
    btnQuickPageQA.addEventListener("click", () => {
      setPageQAMode(!isPageQAMode);
    });
  }

  if (btnExitMode) {
    btnExitMode.addEventListener("click", () => {
      setPageQAMode(false);
    });
  }

  if (btnQuickSummarize) {
    btnQuickSummarize.addEventListener("click", () => {
      goalInput.value = "Summarize the main content, key takeaways, and conclusions of this page.";
      clearPromptBtn.style.display = "flex";
      autoResizeTextarea(goalInput);
      runBtn.click();
    });
  }

  // Contextual Independent Data Extraction (No prompt required!)
  if (btnQuickExtract) {
    btnQuickExtract.addEventListener("click", async () => {
      await handleContextualDataExtraction();
    });
  }

  async function handleContextualDataExtraction() {
    showStatus("Extracting", "Inspecting active webpage and extracting structured records...");
    switchTab("results");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showStatus("Failed", "No active browser tab found.");
        return;
      }

      if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("about:") || tab.url.startsWith("edge://")) {
        showStatus("Ready", "Cannot extract data from internal browser tabs.");
        resultsTableContainer.innerHTML = `
          <div class="log-empty" style="text-align:center; padding:24px 16px;">
            <div style="font-size:24px; margin-bottom:8px;">⚠️</div>
            <strong style="color:var(--text-primary); font-size:12px;">Internal Browser Page</strong>
            <p style="font-size:11px; color:var(--text-muted); margin-top:6px;">Please open a standard webpage (e.g. shopping, flights, articles, or tables) to extract structured records.</p>
          </div>`;
        return;
      }

      await agent.ensureContentScriptInjected(tab.id);

      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_ACTIVE_PAGE_DATA" }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res || { success: false, error: "No response from content script" });
          }
        });
      });

      if (!response || !response.success || !response.records || response.records.length === 0) {
        showStatus("Ready", "Page inspection completed. No tabular or catalog data detected.");
        agent.extractedRecords = [];
        agent.rankedResults = null;
        resultsCount.innerText = "0";
        resultsInfo.innerText = "0 records extracted";
        renderExtractedTable([]);
        renderRecommendationCards([], null);
        resultsTableContainer.innerHTML = `
          <div class="log-empty" style="text-align:center; padding:24px 16px;">
            <div style="font-size:24px; margin-bottom:8px;">🔍</div>
            <strong style="color:var(--text-primary); font-size:12px;">No Structured Records Found on Current View</strong>
            <p style="font-size:11px; color:var(--text-muted); margin-top:6px; line-height:1.4;">
              This page (${escapeHtml(response ? response.pageType : "generic")}) does not appear to contain product grids, flight itineraries, or data tables.
            </p>
            <p style="font-size:10.5px; color:var(--text-secondary); margin-top:6px;">
              💡 <em>Tip: Scroll down to load dynamic listings, or use <strong>Page Q&A</strong> to query text content.</em>
            </p>
          </div>`;
        return;
      }

      const records = response.records;
      agent.extractedRecords = records;
      showStatus("Verifying results", `Validating ${records.length} extracted records...`);
      await new Promise(r => setTimeout(r, 300));

      renderExtractedTable(records);
      resultsCount.innerText = records.length;
      exportCsvBtn.disabled = false;
      copyJsonBtn.disabled = false;

      renderRecommendationCards(records, null);
      if (agent && agent.rankExtractedItems) {
        agent.rankExtractedItems().then(ranked => {
          if (ranked) renderRecommendationCards(records, ranked);
        }).catch(() => { });
      }
      showStatus("Completed", `Extracted ${records.length} structured records from active ${response.pageType} page.`);
    } catch (err) {
      console.warn("Contextual extraction error:", err);
      showStatus("Failed", `Extraction error: ${err.message}`);
    }
  }

  // Autofill Preview & Confirmation Modal Logic
  const autofillPreviewModal = document.getElementById("autofillPreviewModal");
  const closeAutofillPreviewBtn = document.getElementById("closeAutofillPreviewBtn");
  const btnCancelAutofillPreview = document.getElementById("btnCancelAutofillPreview");
  const chkAutofillSelectAll = document.getElementById("chkAutofillSelectAll");
  const btnConfirmAutofill = document.getElementById("btnConfirmAutofill");

  if (closeAutofillPreviewBtn) closeAutofillPreviewBtn.addEventListener("click", () => autofillPreviewModal.classList.add("hidden"));
  if (btnCancelAutofillPreview) btnCancelAutofillPreview.addEventListener("click", () => autofillPreviewModal.classList.add("hidden"));

  if (chkAutofillSelectAll) {
    chkAutofillSelectAll.addEventListener("change", (e) => {
      const checked = e.target.checked;
      document.querySelectorAll(".chk-autofill-field").forEach(chk => { chk.checked = checked; });
    });
  }

  if (btnQuickAutofill) {
    btnQuickAutofill.addEventListener("click", async () => {
      await handleAutofillPreviewAndConfirm();
    });
  }

  async function handleAutofillPreviewAndConfirm() {
    showStatus("Interacting with page", "Scanning active page for form fields...");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showStatus("Failed", "No active browser tab found.");
        return;
      }

      await agent.ensureContentScriptInjected(tab.id);

      // 1. Detect forms
      const detectRes = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "DETECT_PAGE_FORMS" }, (res) => {
          if (chrome.runtime.lastError) resolve({ success: false });
          else resolve(res || { success: false });
        });
      });

      if (!detectRes || !detectRes.hasForm || detectRes.fieldCount === 0) {
        showStatus("Ready", "No fillable input fields detected on the active webpage.");
        alert("No fillable forms or input fields detected on the current webpage.");
        return;
      }

      // 2. Fetch active profile
      let profileData = {};
      let activeProfileName = "Default Profile";
      if (window.NetSurfProfilesVault) {
        try {
          const profile = await window.NetSurfProfilesVault.getActiveProfile();
          if (profile && profile.fields) {
            profileData = profile.fields;
            activeProfileName = profile.name || "Default Profile";
          }
        } catch { }
      }

      // 3. Request preview from content script
      const previewRes = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "PREVIEW_AUTOFILL", profileData }, (res) => {
          if (chrome.runtime.lastError) resolve({ success: false });
          else resolve(res || { success: false });
        });
      });

      if (!previewRes || !previewRes.fields || previewRes.fields.length === 0) {
        showStatus("Ready", "No mappable input fields found on this page.");
        return;
      }

      const tbody = document.getElementById("autofillPreviewTbody");
      const statusText = document.getElementById("autofillDetectionStatus");

      if (statusText) {
        statusText.innerHTML = `Found <strong>${previewRes.totalFields}</strong> inputs on page. <strong>${previewRes.matchedCount}</strong> matched with profile "<strong>${escapeHtml(activeProfileName)}</strong>".`;
      }

      if (tbody) {
        tbody.innerHTML = previewRes.fields.map((f) => `
          <tr class="${f.isMatched ? 'matched' : 'unmatched'}">
            <td>
              <input type="checkbox" class="chk-autofill-field" data-index="${f.index}" ${f.isMatched ? 'checked' : ''}>
            </td>
            <td>
              <strong>${escapeHtml(f.label || f.name || 'Field')}</strong>
              <div style="font-size:9.5px; color:var(--text-muted);">${escapeHtml(f.type || 'text')}</div>
            </td>
            <td>
              <span class="vault-field-pill">${escapeHtml(f.semanticKey)}</span>
            </td>
            <td>
              <input type="text" class="autofill-preview-val-override" data-index="${f.index}" value="${escapeHtml(f.proposedValue || '')}" style="width:100%; font-size:10.5px; padding:3px 6px; background:var(--bg-main); border:1px solid var(--border-subtle); color:var(--text-primary); border-radius:3px;">
            </td>
          </tr>
        `).join("");
      }

      if (autofillPreviewModal) autofillPreviewModal.classList.remove("hidden");
      showStatus("Needs user input", "Review and confirm form field mappings.");
    } catch (err) {
      console.warn("Autofill preview error:", err);
      showStatus("Failed", "Autofill preview error: " + err.message);
    }
  }

  if (btnConfirmAutofill) {
    btnConfirmAutofill.addEventListener("click", async () => {
      const checkboxes = document.querySelectorAll(".chk-autofill-field:checked");
      const mappingsToFill = [];

      checkboxes.forEach(chk => {
        const idx = parseInt(chk.getAttribute("data-index"), 10);
        const inputOverride = document.querySelector(`.autofill-preview-val-override[data-index="${idx}"]`);
        const val = inputOverride ? inputOverride.value : "";
        if (val) {
          mappingsToFill.push({ index: idx, value: val });
        }
      });

      if (autofillPreviewModal) autofillPreviewModal.classList.add("hidden");

      if (mappingsToFill.length === 0) {
        showStatus("Ready", "Autofill cancelled: no fields selected.");
        return;
      }

      showStatus("Interacting with page", `Filling ${mappingsToFill.length} confirmed fields...`);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      const fillRes = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "FILL_CONFIRMED_FIELDS", mappings: mappingsToFill }, (res) => {
          if (chrome.runtime.lastError) resolve({ success: false });
          else resolve(res || { success: false });
        });
      });

      if (fillRes && fillRes.success) {
        showStatus("Completed", `Autofilled ${fillRes.filledCount} fields (${fillRes.unmatchedCount || 0} unmatched). Review and submit manually!`);
      } else {
        showStatus("Failed", "Failed to fill fields on active tab.");
      }
    });
  }

  // Render Structured Task Summary Card
  function renderTaskSummaryCard(classification) {
    if (!classification) {
      if (taskSummaryCard) taskSummaryCard.classList.add("hidden");
      return;
    }
    if (taskSummaryCard) {
      taskSummaryCard.classList.remove("hidden");
      if (taskIntentBadge) taskIntentBadge.innerText = (classification.user_intent || "GENERAL").replace(/_/g, " ");
      if (taskSummaryTarget) {
        let targetText = classification.target_website_name || classification.target_website || "Active Tab";
        if (classification.is_already_open) targetText += " (Already Open)";
        taskSummaryTarget.innerText = targetText;
      }
      if (taskSummaryParams) {
        const parts = [];
        if (classification.search_parameters) {
          Object.entries(classification.search_parameters).forEach(([k, v]) => {
            if (v) parts.push(`${k}: ${v}`);
          });
        }
        taskSummaryParams.innerText = parts.length > 0 ? parts.join(" • ") : "None specified";
      }
      if (taskSummaryExpected) {
        taskSummaryExpected.innerText = classification.expected_output || "Verified task outcome";
      }
      if (taskSummaryConfirmRow && taskSummaryConfirm) {
        if (classification.requires_confirmation) {
          taskSummaryConfirmRow.classList.remove("hidden");
          taskSummaryConfirm.innerText = classification.confirmation_reason || "Requires human review before execution";
        } else {
          taskSummaryConfirmRow.classList.add("hidden");
        }
      }
    }
  }

  // ── 4B. PRIMARY TOP NAVIGATION SWITCHING ──────────────────────────────────
  const navItems = [
    { btn: navAssistantBtn, view: viewAssistant },
    { btn: navHistoryBtn, view: viewHistory, onOpen: () => renderHistoryView() },
    { btn: navSavedBtn, view: viewSaved, onOpen: () => renderSavedView() },
    { btn: navProfilesBtn, action: () => openVaultModal() },
    { btn: navMemoryBtn, view: viewMemory, onOpen: () => loadWorkflowMemory() },
    { btn: navSettingsBtn, view: viewSettings }
  ];

  function setActivePrimaryNav(activeBtn) {
    navItems.forEach(item => {
      if (item.btn) {
        item.btn.classList.toggle("active", item.btn === activeBtn);
      }
      if (item.view) {
        item.view.classList.toggle("hidden", item.btn !== activeBtn);
      }
    });
  }

  navItems.forEach(item => {
    if (item.btn) {
      item.btn.addEventListener("click", () => {
        if (item.action) {
          item.action();
        } else {
          setActivePrimaryNav(item.btn);
          if (item.onOpen) item.onOpen();
        }
      });
    }
  });

  // History Storage & Rendering
  let taskHistory = [];
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["netsurf_task_history"], (res) => {
        if (res && Array.isArray(res.netsurf_task_history)) {
          taskHistory = res.netsurf_task_history;
        }
      });
    }
  } catch { }

  function saveTaskToHistory(task) {
    taskHistory.unshift(task);
    if (taskHistory.length > 30) taskHistory = taskHistory.slice(0, 30);
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ netsurf_task_history: taskHistory });
      }
    } catch { }
  }

  function renderHistoryView() {
    if (!historyList) return;
    historyList.innerHTML = "";

    if (!currentUser) {
      const banner = document.createElement("div");
      banner.className = "guest-history-banner";
      banner.innerHTML = `
        <span class="banner-icon">☁️</span>
        <div>
          <strong>Local Session Only</strong>
          <p>Task history is not synced to cloud in Guest mode. <a href="#" id="btnHistorySignIn" style="color:#c7d2fe; text-decoration:underline;">Sign In</a> to enable persistent cross-device history.</p>
        </div>
      `;
      historyList.appendChild(banner);
      const link = banner.querySelector("#btnHistorySignIn");
      if (link) {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          openAuthModal("login", false);
        });
      }
    }

    if (!taskHistory || taskHistory.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "history-empty";
      emptyDiv.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <p>No recent tasks recorded yet.</p>
        <span>Run an instruction from the Assistant view to build history.</span>
      `;
      historyList.appendChild(emptyDiv);
      return;
    }
    taskHistory.forEach((h, idx) => {
      const card = document.createElement("div");
      card.className = "history-item-card";
      const timeStr = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <div class="history-header">
          <span class="history-prompt">${escapeHtml(h.goal)}</span>
          <span class="history-time">${timeStr}</span>
        </div>
        <div class="history-actions">
          <button class="btn-history-action btn-rerun-task" data-idx="${idx}">↻ Re-run</button>
          <button class="btn-history-action btn-copy-task" data-idx="${idx}">📋 Copy</button>
          <span class="status-pill-counter">${escapeHtml(h.domain || "Web")}</span>
        </div>
      `;
      card.querySelector(".btn-rerun-task").addEventListener("click", () => {
        goalInput.value = h.goal;
        clearPromptBtn.style.display = "flex";
        setActivePrimaryNav(navAssistantBtn);
        autoResizeTextarea(goalInput);
        goalInput.focus();
      });
      card.querySelector(".btn-copy-task").addEventListener("click", () => {
        navigator.clipboard.writeText(h.goal);
        const btn = card.querySelector(".btn-copy-task");
        btn.innerText = "✓ Copied";
        setTimeout(() => { btn.innerText = "📋 Copy"; }, 1500);
      });
      historyList.appendChild(card);
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      taskHistory = [];
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove(["netsurf_task_history"]);
        }
      } catch { }
      renderHistoryView();
    });
  }

  // ── 4. SAVED ITEMS & PRICE TRACKING CONTROLLER (PHASE 6) ───────────────────
  let cachedSavedItems = [];
  let currentSavedFilter = "all";
  let currentSavedMode = "saved"; // "saved" | "tracker"

  // Sub-Navigation Switcher (All Saved vs Price Tracker)
  const savedSearchInput = document.getElementById("savedSearchInput");
  if (savedSearchInput) {
    savedSearchInput.addEventListener("input", () => {
      renderSavedItemsList(cachedSavedItems, currentSavedFilter);
    });
  }

  if (btnModeSavedItems && btnModePriceTracker) {
    btnModeSavedItems.addEventListener("click", () => {
      currentSavedMode = "saved";
      btnModeSavedItems.classList.add("active");
      btnModePriceTracker.classList.remove("active");
      paneSavedItems.classList.remove("hidden");
      panePriceTracker.classList.add("hidden");
      renderSavedItemsList(cachedSavedItems, currentSavedFilter);
    });

    btnModePriceTracker.addEventListener("click", () => {
      currentSavedMode = "tracker";
      btnModePriceTracker.classList.add("active");
      btnModeSavedItems.classList.remove("active");
      panePriceTracker.classList.remove("hidden");
      paneSavedItems.classList.add("hidden");
      renderPriceTrackerList(cachedSavedItems);
    });
  }

  // Filter Chips for Saved Items (All, Products, Hotels, Websites, Workflows)
  const savedFilterChips = document.querySelectorAll(".saved-filter-chip");
  savedFilterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      savedFilterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentSavedFilter = chip.getAttribute("data-type") || "all";
      renderSavedItemsList(cachedSavedItems, currentSavedFilter);
    });
  });

  // Save Active Tab Button
  if (btnSaveCurrentTab) {
    btnSaveCurrentTab.addEventListener("click", async () => {
      let pageTitle = "Webpage";
      let pageUrl = "";
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            pageTitle = tab.title || "Webpage";
            pageUrl = tab.url || "";
          }
        } catch { }
      }
      if (!pageUrl && activeTabDomain) {
        pageTitle = activeTabTitle ? activeTabTitle.innerText : "Active Webpage";
        pageUrl = window.location.href;
      }
      const titlePrompt = prompt("Save active webpage to your library:", pageTitle);
      if (!titlePrompt) return;

      try {
        await saveUserItem({
          item_type: "website",
          title: titlePrompt,
          url: pageUrl,
          content: { saved_from: "active_tab", timestamp: new Date().toISOString() }
        });
        await renderSavedView();
        showStatus("success", `Saved "${titlePrompt}" to library`);
      } catch (err) {
        console.warn("Failed to save active tab:", err);
      }
    });
  }

  // Check All Active Trackers Button
  if (btnCheckAllTrackersNow) {
    btnCheckAllTrackersNow.addEventListener("click", async () => {
      btnCheckAllTrackersNow.disabled = true;
      const originalText = btnCheckAllTrackersNow.innerHTML;
      btnCheckAllTrackersNow.innerHTML = `<span>Checking...</span>`;
      try {
        const result = await checkAllPrices();
        if (result && result.notifications && result.notifications.length > 0) {
          result.notifications.forEach(n => {
            if (typeof chrome !== "undefined" && chrome.notifications) {
              chrome.notifications.create({
                type: "basic",
                iconUrl: "icons/icon128.png",
                title: n.title,
                message: n.message,
                priority: 2
              });
            }
          });
        }
        await renderSavedView();
        showStatus("success", `Price check finished: ${result ? result.checked_count : 0} items updated`);
      } catch (err) {
        console.warn("Price check-all error:", err);
      } finally {
        btnCheckAllTrackersNow.disabled = false;
        btnCheckAllTrackersNow.innerHTML = originalText;
      }
    });
  }

  // Close Price History Modal
  if (closePriceHistoryBtn && priceHistoryModal) {
    closePriceHistoryBtn.addEventListener("click", () => {
      priceHistoryModal.classList.add("hidden");
    });
    priceHistoryModal.addEventListener("click", (e) => {
      if (e.target === priceHistoryModal) {
        priceHistoryModal.classList.add("hidden");
      }
    });
  }

  // Main Render Controller for View: Saved & Price Tracker
  async function renderSavedView() {
    if (!savedList && !priceTrackerList) return;

    // Load saved items from backend or guest storage
    try {
      if (currentUser && authTokens && authTokens.access_token) {
        const resp = await fetch(`${AUTH_API_BASE}/user/saved`, {
          headers: { "Authorization": `Bearer ${authTokens.access_token}` }
        });
        if (resp.ok) {
          cachedSavedItems = await resp.json();
        } else {
          cachedSavedItems = [];
        }
      } else {
        // Guest mode storage
        let guestItems = [];
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          const res = await new Promise(r => chrome.storage.local.get(["netsurf_guest_saved_items"], r));
          guestItems = res.netsurf_guest_saved_items || [];
        } else {
          guestItems = JSON.parse(localStorage.getItem("netsurf_guest_saved_items") || "[]");
        }
        cachedSavedItems = guestItems;
      }
    } catch (err) {
      console.warn("Error fetching saved items:", err);
    }

    // Compute Summary Metrics
    const totalCount = cachedSavedItems.length;
    const activeTrackers = cachedSavedItems.filter(i => i.tracking_enabled);
    const targetMet = cachedSavedItems.filter(i =>
      i.target_price != null &&
      i.current_price != null &&
      i.current_price <= i.target_price
    );

    let totalSavings = 0;
    cachedSavedItems.forEach(i => {
      if (i.initial_price && i.current_price && i.initial_price > i.current_price) {
        totalSavings += (i.initial_price - i.current_price);
      }
    });

    if (savedTotalCount) savedTotalCount.innerText = totalCount;
    if (trackerActiveCount) trackerActiveCount.innerText = activeTrackers.length;
    if (statActiveTrackers) statActiveTrackers.innerText = activeTrackers.length;
    if (statTargetMet) statTargetMet.innerText = targetMet.length;
    if (statTotalSavings) statTotalSavings.innerText = `₹${Math.round(totalSavings).toLocaleString()}`;

    // Render active pane
    if (currentSavedMode === "tracker") {
      renderPriceTrackerList(cachedSavedItems);
    } else {
      renderSavedItemsList(cachedSavedItems, currentSavedFilter);
    }
  }

  // Render Sub-Panel 1: All Saved Items List
  function renderSavedItemsList(items, filterType = "all") {
    if (!savedList) return;
    const query = savedSearchInput ? savedSearchInput.value.trim().toLowerCase() : "";
    let filtered = filterType === "all" ? items : items.filter(i => i.item_type === filterType);
    if (query) {
      filtered = filtered.filter(i =>
        (i.title && i.title.toLowerCase().includes(query)) ||
        (i.url && i.url.toLowerCase().includes(query)) ||
        (i.item_type && i.item_type.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
      savedList.innerHTML = `
        <div class="history-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
          </svg>
          <p>No saved ${filterType === "all" ? "items" : filterType + "s"} found${query ? ` matching "${escapeHtml(query)}"` : ""}.</p>
          <span>Save extracted flights, products, jobs, hotels, or pages from the assistant to access them anytime.</span>
        </div>
      `;
      return;
    }

    let html = "";
    filtered.forEach(item => {
      const typeIcons = {
        product: "🛍️ Product",
        hotel: "🏨 Hotel",
        flight: "✈️ Flight",
        job: "💼 Job",
        website: "🌐 Website",
        workflow: "⚡ Workflow"
      };
      const badgeLabel = typeIcons[item.item_type] || "📄 Item";
      const createdStr = item.created_at ? new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
      const priceStr = item.current_price != null ? `₹${item.current_price.toLocaleString()}` : "";

      html += `
        <div class="saved-item-card" data-id="${escapeHtml(item.id)}">
          <div class="saved-item-header">
            <div style="flex:1; min-width:0;">
              <span class="saved-item-badge ${escapeHtml(item.item_type)}">${escapeHtml(badgeLabel)}</span>
              <a href="${escapeHtml(item.url || '#')}" target="_blank" class="tracker-title-link" style="margin-top:4px;" title="${escapeHtml(item.title)}">
                ${escapeHtml(item.title)}
              </a>
            </div>
            <button class="btn-tracker-sm btn-del-saved-item" data-id="${escapeHtml(item.id)}" title="Delete item">🗑️</button>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; font-size:10px; color:var(--text-muted);">
            <span>${priceStr ? `<strong style="color:var(--text-primary); font-size:11px;">${priceStr}</strong>` : (item.url ? escapeHtml(new URL(item.url, "https://web").hostname) : "Direct Save")}</span>
            <span>Saved ${createdStr}</span>
          </div>

          ${(item.item_type === "product" || item.item_type === "hotel") ? `
            <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.04); padding-top:6px; margin-top:2px;">
              <span style="font-size:9.5px; color:${item.tracking_enabled ? '#34d399' : 'var(--text-muted)'};">
                ${item.tracking_enabled ? '● Price Tracking Active' : '○ Tracking Off'}
              </span>
              <div style="display:flex; gap:6px;">
                <button class="btn-tracker-sm btn-quick-track-toggle" data-id="${escapeHtml(item.id)}" data-active="${item.tracking_enabled ? 'true' : 'false'}">
                  ${item.tracking_enabled ? 'Pause' : 'Track Price'}
                </button>
                <button class="btn-tracker-sm btn-view-history-modal" data-id="${escapeHtml(item.id)}">
                  📊 History
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    });

    savedList.innerHTML = html;

    // Attach Action Listeners
    savedList.querySelectorAll(".btn-del-saved-item").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        if (!confirm("Remove this item from your saved library?")) return;
        await deleteUserItem(id);
        await renderSavedView();
      });
    });

    savedList.querySelectorAll(".btn-quick-track-toggle").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const isActive = btn.getAttribute("data-active") === "true";
        await updateUserItem(id, { tracking_enabled: !isActive });
        await renderSavedView();
      });
    });

    savedList.querySelectorAll(".btn-view-history-modal").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        openPriceHistoryModal(id);
      });
    });
  }

  // Render Sub-Panel 2: Price Tracker Monitored Items
  function renderPriceTrackerList(items) {
    if (!priceTrackerList) return;
    const trackers = items.filter(i =>
      i.tracking_enabled ||
      i.target_price != null ||
      i.item_type === "product" ||
      i.item_type === "hotel"
    );

    if (trackers.length === 0) {
      priceTrackerList.innerHTML = `
        <div class="history-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <p>No active price monitors.</p>
          <span>Click "Track Price" on any product or hotel card to monitor price drops automatically.</span>
        </div>
      `;
      return;
    }

    let html = "";
    trackers.forEach(item => {
      const isTargetReached = item.target_price != null &&
        item.current_price != null &&
        item.current_price <= item.target_price;

      // Price Delta Calculation
      let deltaHtml = `<span class="tracker-delta-pill neutral">—</span>`;
      if (item.initial_price && item.current_price) {
        const diff = item.current_price - item.initial_price;
        const pct = Math.abs(Math.round((diff / item.initial_price) * 100));
        if (diff < 0) {
          deltaHtml = `<span class="tracker-delta-pill drop">↓ ₹${Math.abs(Math.round(diff)).toLocaleString()} (-${pct}%)</span>`;
        } else if (diff > 0) {
          deltaHtml = `<span class="tracker-delta-pill rise">↑ ₹${Math.round(diff).toLocaleString()} (+${pct}%)</span>`;
        } else {
          deltaHtml = `<span class="tracker-delta-pill neutral">No change</span>`;
        }
      }

      // Domain extraction
      let domain = "Verified Store";
      try {
        if (item.url) domain = new URL(item.url).hostname;
      } catch { }

      // Last checked format
      let lastCheckedStr = "Pending initial check";
      if (item.last_checked_at) {
        lastCheckedStr = "Checked " + new Date(item.last_checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }

      html += `
        <div class="tracker-card ${isTargetReached ? 'target-reached' : ''}" data-id="${escapeHtml(item.id)}">
          <div class="tracker-card-header">
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
                <span class="saved-item-badge ${escapeHtml(item.item_type || 'product')}">${escapeHtml(domain)}</span>
                ${isTargetReached ? '<span class="status-state-badge success" style="font-size:8.5px; padding:1px 5px;">🎯 TARGET REACHED!</span>' : ''}
              </div>
              <a href="${escapeHtml(item.url || '#')}" target="_blank" class="tracker-title-link" title="${escapeHtml(item.title)}">
                ${escapeHtml(item.title)}
              </a>
            </div>
            <label class="memory-switch" style="margin-left:8px;" title="Toggle background price tracking">
              <input type="checkbox" class="tracker-switch-input" data-id="${escapeHtml(item.id)}" ${item.tracking_enabled ? 'checked' : ''}>
              <span class="memory-switch-slider"></span>
            </label>
          </div>

          <div class="tracker-price-row">
            <div>
              <span class="tracker-current-val">
                ${item.current_price != null ? `₹${Math.round(item.current_price).toLocaleString()}` : 'Price Pending'}
              </span>
              ${deltaHtml}
            </div>
            <div class="tracker-target-val">
              Target: <strong class="tracker-target-editable" data-id="${escapeHtml(item.id)}" title="Click to edit target price">${item.target_price != null ? `₹${Math.round(item.target_price).toLocaleString()}` : 'Set Target'}</strong>
            </div>
          </div>

          <div class="tracker-footer">
            <div style="display:flex; align-items:center; gap:5px;">
              <span style="color:${item.last_status === 'blocked' ? '#f59e0b' : item.last_status === 'failed' ? '#ef4444' : 'var(--text-muted)'};">
                ${item.last_status === 'blocked' ? '⚠️ Bot Verification Protected' : lastCheckedStr}
              </span>
              ${item.consecutive_failures >= 3 ? '<span title="Repeated check failures" style="color:#ef4444;">⚠️</span>' : ''}
            </div>
            <div class="tracker-actions">
              <button class="btn-tracker-sm btn-check-single-now" data-id="${escapeHtml(item.id)}" title="Verify live price on website now">
                ⚡ Check
              </button>
              <button class="btn-tracker-sm btn-view-history-modal" data-id="${escapeHtml(item.id)}" title="View price history chart">
                📊 History
              </button>
              <button class="btn-tracker-sm btn-del-saved-item" data-id="${escapeHtml(item.id)}" title="Remove tracker">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    });

    priceTrackerList.innerHTML = html;

    // Attach Action Listeners
    priceTrackerList.querySelectorAll(".tracker-switch-input").forEach(sw => {
      sw.addEventListener("change", async () => {
        const id = sw.getAttribute("data-id");
        await updateUserItem(id, { tracking_enabled: sw.checked });
        await renderSavedView();
      });
    });

    priceTrackerList.querySelectorAll(".tracker-target-editable").forEach(el => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        const currentItem = cachedSavedItems.find(i => i.id === id);
        const currentTarget = currentItem ? currentItem.target_price : "";
        const promptVal = prompt("Enter target price (₹):", currentTarget || "");
        if (promptVal !== null) {
          const num = parseFloat(promptVal);
          if (!isNaN(num) && num > 0) {
            await updateUserItem(id, { target_price: num });
            await renderSavedView();
          }
        }
      });
    });

    priceTrackerList.querySelectorAll(".btn-check-single-now").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        btn.disabled = true;
        btn.innerText = "⏳";
        try {
          const res = await checkSinglePrice(id);
          if (res && res.notification && typeof chrome !== "undefined" && chrome.notifications) {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icons/icon128.png",
              title: res.notification.title,
              message: res.notification.message,
              priority: 2
            });
          }
          await renderSavedView();
          showStatus("success", "Price updated from source website");
        } catch (err) {
          console.warn("Check price error:", err);
        } finally {
          btn.disabled = false;
          btn.innerText = "⚡ Check";
        }
      });
    });

    priceTrackerList.querySelectorAll(".btn-view-history-modal").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openPriceHistoryModal(id);
      });
    });

    priceTrackerList.querySelectorAll(".btn-del-saved-item").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!confirm("Delete this price tracker?")) return;
        await deleteUserItem(id);
        await renderSavedView();
      });
    });
  }

  // Price History Timeline & Chart Modal Renderer
  async function openPriceHistoryModal(itemId) {
    if (!priceHistoryModal) return;
    priceHistoryModal.classList.remove("hidden");

    let historyData = null;
    try {
      if (currentUser && authTokens && authTokens.access_token) {
        const resp = await fetch(`${AUTH_API_BASE}/user/saved/${itemId}/history`, {
          headers: { "Authorization": `Bearer ${authTokens.access_token}` }
        });
        if (resp.ok) {
          historyData = await resp.json();
        }
      }
    } catch (err) {
      console.warn("Failed to fetch price history:", err);
    }

    // Fallback if guest or fetch failed
    if (!historyData) {
      const item = cachedSavedItems.find(i => i.id === itemId);
      historyData = {
        item_id: itemId,
        title: item ? item.title : "Product History",
        current_price: item ? item.current_price : null,
        target_price: item ? item.target_price : null,
        history: item && item.current_price ? [
          {
            observed_price: item.initial_price || item.current_price,
            timestamp: item.created_at || new Date().toISOString(),
            extraction_status: "verified",
            source_url: item.url
          },
          {
            observed_price: item.current_price,
            timestamp: item.last_checked_at || new Date().toISOString(),
            extraction_status: item.last_status || "verified",
            source_url: item.url
          }
        ] : []
      };
    }

    if (historyModalTitle) {
      historyModalTitle.innerText = historyData.title || "Price History Timeline";
    }
    if (historyModalSubtitle) {
      historyModalSubtitle.innerText = `Observed verified prices over time for this item`;
    }

    // Populate Summary Row
    const obs = historyData.history || [];
    let minObsPrice = historyData.current_price || 0;
    let maxObsPrice = historyData.current_price || 0;
    if (obs.length > 0) {
      const prices = obs.map(o => o.observed_price).filter(p => p != null && p > 0);
      if (prices.length > 0) {
        minObsPrice = Math.min(...prices);
        maxObsPrice = Math.max(...prices);
      }
    }

    if (priceModalSummaryRow) {
      priceModalSummaryRow.innerHTML = `
        <div class="price-chart-summary-item">
          <div class="price-chart-summary-num" style="color:var(--status-green);">
            ${historyData.current_price != null ? `₹${Math.round(historyData.current_price).toLocaleString()}` : '—'}
          </div>
          <div class="price-chart-summary-lbl">Current Price</div>
        </div>
        <div class="price-chart-summary-item">
          <div class="price-chart-summary-num" style="color:#60a5fa;">
            ${historyData.target_price != null ? `₹${Math.round(historyData.target_price).toLocaleString()}` : 'Not Set'}
          </div>
          <div class="price-chart-summary-lbl">Target Price</div>
        </div>
        <div class="price-chart-summary-item">
          <div class="price-chart-summary-num" style="color:#a78bfa;">
            ${minObsPrice > 0 ? `₹${Math.round(minObsPrice).toLocaleString()}` : '—'}
          </div>
          <div class="price-chart-summary-lbl">All-Time Low</div>
        </div>
      `;
    }

    // Render SVG Price Sparkline Chart
    if (priceHistoryChartContainer) {
      if (obs.length === 0) {
        priceHistoryChartContainer.innerHTML = `
          <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:20px;">
            No historical price records yet. Regular background checks will build your timeline.
          </div>
        `;
      } else {
        const sortedObs = [...obs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const width = 310;
        const height = 130;
        const padX = 35;
        const padY = 22;

        let yMin = minObsPrice;
        let yMax = maxObsPrice;
        if (historyData.target_price != null) {
          yMin = Math.min(yMin, historyData.target_price);
          yMax = Math.max(yMax, historyData.target_price);
        }
        if (yMin === yMax) {
          yMin = yMin * 0.9;
          yMax = yMax * 1.1;
        }
        const yRange = yMax - yMin || 1;

        // Build polyline points
        const points = sortedObs.map((pt, idx) => {
          const x = sortedObs.length === 1 ? width / 2 : padX + (idx / (sortedObs.length - 1)) * (width - padX * 2);
          const y = height - padY - ((pt.observed_price - yMin) / yRange) * (height - padY * 2);
          return { x, y, price: pt.observed_price, time: pt.timestamp, status: pt.extraction_status };
        });

        const pointsStr = points.map(p => `${p.x},${p.y}`).join(" ");

        // Target price line
        let targetLineSvg = "";
        if (historyData.target_price != null) {
          const targetY = height - padY - ((historyData.target_price - yMin) / yRange) * (height - padY * 2);
          targetLineSvg = `
            <line x1="${padX}" y1="${targetY}" x2="${width - padX}" y2="${targetY}" stroke="#10b981" stroke-dasharray="4,3" stroke-width="1.5" />
            <text x="${width - padX - 4}" y="${targetY - 4}" text-anchor="end" fill="#34d399" font-size="8.5" font-weight="bold">Target ₹${Math.round(historyData.target_price).toLocaleString()}</text>
          `;
        }

        // SVG circles
        const circlesSvg = points.map(p => `
          <circle cx="${p.x}" cy="${p.y}" r="4" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5">
            <title>₹${Math.round(p.price).toLocaleString()} - ${new Date(p.time).toLocaleDateString()}</title>
          </circle>
        `).join("");

        priceHistoryChartContainer.innerHTML = `
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible;">
            <defs>
              <linearGradient id="chartLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <!-- Max & Min Axis Labels -->
            <text x="${padX - 4}" y="${padY + 4}" text-anchor="end" fill="#94a3b8" font-size="8">₹${Math.round(yMax).toLocaleString()}</text>
            <text x="${padX - 4}" y="${height - padY + 4}" text-anchor="end" fill="#94a3b8" font-size="8">₹${Math.round(yMin).toLocaleString()}</text>

            <!-- Target Line -->
            ${targetLineSvg}

            <!-- Trend Polyline -->
            <polyline points="${pointsStr}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- Data Dots -->
            ${circlesSvg}
          </svg>
        `;
      }
    }

    // Populate Observations List
    if (priceObservationsList) {
      if (obs.length === 0) {
        priceObservationsList.innerHTML = `<div style="font-size:10px; color:var(--text-muted); text-align:center; padding:10px;">No recorded observations.</div>`;
      } else {
        const sortedObs = [...obs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        let obsHtml = "";
        sortedObs.forEach(o => {
          const dateStr = new Date(o.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          const statusBadge = o.extraction_status === "blocked" ? '<span style="color:#f59e0b; font-weight:600;">⚠️ Bot Challenge</span>' : '<span style="color:#10b981;">✓ Verified</span>';
          obsHtml += `
            <div class="price-obs-row">
              <div>
                <strong style="color:var(--text-primary); font-size:11px;">₹${Math.round(o.observed_price).toLocaleString()}</strong>
                <span style="font-size:9px; color:var(--text-muted); margin-left:6px;">${dateStr}</span>
              </div>
              <div>${statusBadge}</div>
            </div>
          `;
        });
        priceObservationsList.innerHTML = obsHtml;
      }
    }
  }

  // Helper: Save User Item (Backend or Guest fallback)
  async function saveUserItem(itemData) {
    if (currentUser && authTokens && authTokens.access_token) {
      const resp = await fetch(`${AUTH_API_BASE}/user/saved`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authTokens.access_token}`
        },
        body: JSON.stringify(itemData)
      });
      if (!resp.ok) {
        throw new Error(`Failed to save item: ${resp.status}`);
      }
      return await resp.json();
    } else {
      const newItem = {
        id: "guest_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        ...itemData,
        created_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        last_status: "verified",
        consecutive_failures: 0
      };
      let guestItems = [];
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          const res = await new Promise(r => chrome.storage.local.get(["netsurf_guest_saved_items"], r));
          guestItems = res.netsurf_guest_saved_items || [];
        } else {
          guestItems = JSON.parse(localStorage.getItem("netsurf_guest_saved_items") || "[]");
        }
      } catch { }
      guestItems.unshift(newItem);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await new Promise(r => chrome.storage.local.set({ "netsurf_guest_saved_items": guestItems }, r));
      } else {
        localStorage.setItem("netsurf_guest_saved_items", JSON.stringify(guestItems));
      }
      return newItem;
    }
  }

  // Helper: Delete User Item
  async function deleteUserItem(itemId) {
    if (currentUser && authTokens && authTokens.access_token) {
      const resp = await fetch(`${AUTH_API_BASE}/user/saved/${itemId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${authTokens.access_token}` }
      });
      return resp.ok;
    } else {
      let guestItems = [];
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          const res = await new Promise(r => chrome.storage.local.get(["netsurf_guest_saved_items"], r));
          guestItems = res.netsurf_guest_saved_items || [];
        } else {
          guestItems = JSON.parse(localStorage.getItem("netsurf_guest_saved_items") || "[]");
        }
      } catch { }
      guestItems = guestItems.filter(i => i.id !== itemId);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await new Promise(r => chrome.storage.local.set({ "netsurf_guest_saved_items": guestItems }, r));
      } else {
        localStorage.setItem("netsurf_guest_saved_items", JSON.stringify(guestItems));
      }
      return true;
    }
  }

  // Helper: Update User Item
  async function updateUserItem(itemId, updateData) {
    if (currentUser && authTokens && authTokens.access_token) {
      const resp = await fetch(`${AUTH_API_BASE}/user/saved/${itemId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authTokens.access_token}`
        },
        body: JSON.stringify(updateData)
      });
      if (resp.ok) return await resp.json();
    } else {
      let guestItems = [];
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          const res = await new Promise(r => chrome.storage.local.get(["netsurf_guest_saved_items"], r));
          guestItems = res.netsurf_guest_saved_items || [];
        } else {
          guestItems = JSON.parse(localStorage.getItem("netsurf_guest_saved_items") || "[]");
        }
      } catch { }
      const idx = guestItems.findIndex(i => i.id === itemId);
      if (idx !== -1) {
        guestItems[idx] = { ...guestItems[idx], ...updateData };
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          await new Promise(r => chrome.storage.local.set({ "netsurf_guest_saved_items": guestItems }, r));
        } else {
          localStorage.setItem("netsurf_guest_saved_items", JSON.stringify(guestItems));
        }
        return guestItems[idx];
      }
    }
  }

  // Helper: Check Single Price
  async function checkSinglePrice(itemId) {
    if (currentUser && authTokens && authTokens.access_token) {
      const resp = await fetch(`${AUTH_API_BASE}/user/saved/${itemId}/check`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${authTokens.access_token}` }
      });
      if (resp.ok) {
        return await resp.json();
      }
    }
    return null;
  }

  // Helper: Check All Prices
  async function checkAllPrices() {
    if (currentUser && authTokens && authTokens.access_token) {
      const resp = await fetch(`${AUTH_API_BASE}/user/tracking/check-all`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${authTokens.access_token}` }
      });
      if (resp.ok) {
        return await resp.json();
      }
    }
    return null;
  }

  // Helper: Track from Recommendation Cards
  async function saveAndTrackRecommendationItem(item, buttonEl) {
    if (!item) return;
    const currentPrice = item.price || item.normalized_price || null;
    let targetPrice = null;
    if (currentPrice) {
      const defaultTarget = Math.round(currentPrice * 0.95);
      const userTarget = prompt(`Set target price for "${item.name}":\nCurrent verified price: ₹${currentPrice.toLocaleString()}\nAlert when price drops to or below:`, defaultTarget);
      if (userTarget !== null) {
        targetPrice = parseFloat(userTarget) || defaultTarget;
      }
    }

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.innerText = "⏳ Saving...";
    }

    try {
      await saveUserItem({
        item_type: item.category === "hotel" || item.location ? "hotel" : "product",
        title: item.name,
        url: item.product_url || item.url || "",
        currency: item.currency || "INR",
        initial_price: currentPrice,
        current_price: currentPrice,
        target_price: targetPrice,
        tracking_enabled: true,
        content: {
          brand: item.brand,
          ram_gb: item.ram_gb,
          storage_gb: item.storage_gb,
          rating: item.rating,
          location: item.location,
          source_domain: item.source_domain,
          score: item.score
        }
      });
      if (buttonEl) {
        buttonEl.innerText = "✓ Tracking";
        buttonEl.classList.remove("btn-secondary");
        buttonEl.classList.add("btn-primary");
      }
      showStatus("success", `Added "${item.name}" to Price Tracker`);
      if (viewSaved && !viewSaved.classList.contains("hidden")) {
        renderSavedView();
      }
    } catch (err) {
      console.warn("Failed to track recommendation item:", err);
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.innerText = "★ Track Price";
      }
    }
  }

  // ── 5. TAB SWITCHING ──────────────────────────────────────────────────────
  tabLogBtn.addEventListener("click", () => switchTab("log"));
  tabResultsBtn.addEventListener("click", () => switchTab("results"));
  tabElementsBtn.addEventListener("click", () => {
    switchTab("elements");
    loadElementsInspector();
  });

  function switchTab(tabName) {
    tabLogBtn.classList.toggle("active", tabName === "log");
    tabResultsBtn.classList.toggle("active", tabName === "results");
    tabElementsBtn.classList.toggle("active", tabName === "elements");

    logContent.classList.toggle("hidden", tabName !== "log");
    resultsContent.classList.toggle("hidden", tabName !== "results");
    elementsContent.classList.toggle("hidden", tabName !== "elements");
  }

  // Clear Log Stream
  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      logStream.innerHTML = '<div class="log-empty">Action stream cleared.</div>';
    });
  }

  // ── 6. PLAN COLLAPSE / EXPAND ─────────────────────────────────────────────
  if (planToggleHeader) {
    planToggleHeader.addEventListener("click", () => {
      planCollapsed = !planCollapsed;
      planContainer.classList.toggle("hidden", planCollapsed);
      planToggleArrow.innerText = planCollapsed ? "▶" : "▼";
    });
  }

  // ── 7. RUN AGENT EXECUTION ────────────────────────────────────────────────
  runBtn.addEventListener("click", async () => {
    const goal = goalInput.value.trim();
    if (!goal) {
      goalInput.focus();
      return;
    }
    let effectiveGoal = goal;
    if (isPageQAMode && !goal.toLowerCase().includes("active page") && !goal.toLowerCase().includes("this page")) {
      effectiveGoal = `[Page Q&A on Current Tab] ${goal}`;
    }
    currentGoal = effectiveGoal;

    // Reset UI State & Clear Stale Records from previous runs
    runBtn.disabled = true;
    stopBtn.disabled = false;
    exportCsvBtn.disabled = true;
    copyJsonBtn.disabled = true;
    agent.extractedRecords = [];
    agent.rankedResults = null;
    resultsCount.innerText = "0";
    resultsInfo.innerText = "0 records extracted";
    renderExtractedTable([]);
    renderRecommendationCards([], null);
    renderTaskSummaryCard(null);

    // Switch to Stream Tab
    switchTab("log");

    // Remove welcome card if present
    const welcomeCard = logStream.querySelector(".welcome-card");
    if (welcomeCard) welcomeCard.remove();

    // Render User Goal Bubble
    appendUserGoalMessage(goal);

    // Reset Progress and clear previous run's extracted data
    phaseCounter.innerText = "Workflow phases: 0/0";
    actionCounter.innerText = "Browser actions: 0/0";
    showStatus("Understanding request", "Analyzing task and context...");
    planSection.classList.add("hidden");
    planContainer.innerHTML = "";
    agent.extractedRecords = [];
    agent.rankedResults = null;
    if (resultsCount) resultsCount.innerText = "0";
    if (resultsInfo) resultsInfo.innerText = "0 records extracted";
    renderExtractedTable([]);
    renderRecommendationCards([], null);

    // Launch Agent Loop
    if (isPageQAMode) {
      showStatus("Understanding request", "Analyzing question against active webpage content...");
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await agent.ensureContentScriptInjected(tab.id);
          const obs = await agent.getObservation(tab.id);
          showStatus("Extracting", "Retrieving relevant page sections and evidence...");

          const qaRes = await fetch(`${agent.apiBaseUrl}/page/qa`, {
            method: "POST",
            headers: agent.getHeaders(),
            body: JSON.stringify({
              question: goal,
              page_url: (obs && obs.url) || tab.url || "",
              page_title: (obs && obs.title) || tab.title || "",
              page_text: (obs && obs.text_summary) || "",
              headings: []
            })
          });

          if (qaRes.ok) {
            const data = await qaRes.json();
            renderGroundedAnswerCard(data);
            showStatus(
              data.found_on_page ? "Completed" : "Completed",
              data.found_on_page ? "Grounded answer synthesized from active page." : "Information not found on active webpage."
            );
            runBtn.disabled = false;
            stopBtn.disabled = true;
            return;
          }
        }
      } catch (qaErr) {
        console.warn("Direct Page Q&A failed, falling back to agent loop:", qaErr);
      }
    }

    await agent.start(effectiveGoal, {
      onPlan: (plan) => {
        renderStructuredPlan(plan);
      },
      onTaskUpdate: (task) => {
        updateTaskStatusInUI(task);
      },
      onProgress: (progress) => {
        phaseCounter.innerText = `Workflow phases: ${progress.completedPhases}/${progress.totalPhases}`;
        actionCounter.innerText = `Browser actions: ${progress.completedActions}/${progress.totalActions}`;
      },
      onStatus: (type, message) => {
        showStatus(type, message);
      },
      onLog: (entry) => {
        renderLogEntry(entry);
      },
      onAnswer: (answer) => {
        renderAnswerCard(answer);
      },
      onApprovalRequired: (action, reason) => {
        return new Promise((resolve) => {
          approvalDetails.innerText = `Action: ${action.action.toUpperCase()}\nDetails: ${JSON.stringify(action.params, null, 2)}\nReason: ${reason}`;
          approvalModal.classList.remove("hidden");
          pendingApprovalResolve = resolve;
        });
      },
      onExtractedData: (records) => {
        renderExtractedTable(records);
        renderRecommendationCards(records, agent.rankedResults);
        resultsCount.innerText = records.length;
        exportCsvBtn.disabled = records.length === 0;
        copyJsonBtn.disabled = records.length === 0;
      },
      onRankedResults: (rankResponse) => {
        renderRecommendationCards(agent.extractedRecords, rankResponse);
      },
      onWarning: (message) => {
        // Non-fatal: keep the run state untouched, but never fail silently.
        console.warn("[Netsurf]", message);
        renderRecommendationCards(agent.extractedRecords, null);
      },
      onFinished: (validation) => {
        runBtn.disabled = false;
        stopBtn.disabled = true;
        if (agent.extractedRecords && agent.extractedRecords.length > 0) {
          exportCsvBtn.disabled = false;
          copyJsonBtn.disabled = false;
        }
        if (validation && validation.status) {
          const type = validation.status === "completed" ? "success" : validation.status;
          showStatus(type, validation.message || "Task completed");
        }
        saveTaskToHistory({
          goal: currentGoal,
          domain: activeTabDomain ? activeTabDomain.innerText : "",
          timestamp: Date.now(),
          status: validation && validation.status ? validation.status : "completed"
        });
      }
    });
  });

  // Stop Action
  stopBtn.addEventListener("click", () => {
    agent.stop();
    runBtn.disabled = false;
    stopBtn.disabled = true;
    showStatus("error", "Agent loop stopped by user.");
  });

  // Approval Gate Handlers
  approveBtn.addEventListener("click", () => {
    approvalModal.classList.add("hidden");
    if (pendingApprovalResolve) {
      pendingApprovalResolve(true);
      pendingApprovalResolve = null;
    }
  });

  rejectBtn.addEventListener("click", () => {
    approvalModal.classList.add("hidden");
    if (pendingApprovalResolve) {
      pendingApprovalResolve(false);
      pendingApprovalResolve = null;
    }
  });

  // ── 8. STREAM RENDERING HELPERS ───────────────────────────────────────────
  const CANONICAL_STATES = [
    "Ready",
    "Understanding request",
    "Planning",
    "Navigating",
    "Interacting with page",
    "Extracting",
    "Verifying results",
    "Completed",
    "Needs user input",
    "Failed",
    "Cancelled"
  ];

  function showStatus(stateOrType, message, optType) {
    let canonicalState = "Ready";
    let bannerType = optType || "idle";

    if (CANONICAL_STATES.includes(stateOrType)) {
      canonicalState = stateOrType;
      if (canonicalState === "Completed") bannerType = "success";
      else if (canonicalState === "Failed") bannerType = "error";
      else if (canonicalState === "Cancelled") bannerType = "idle";
      else if (canonicalState === "Needs user input") bannerType = "warning";
      else if (canonicalState === "Ready") bannerType = "idle";
      else bannerType = "running";
    } else {
      if (stateOrType === "success") {
        canonicalState = "Completed";
        bannerType = "success";
      } else if (stateOrType === "error") {
        canonicalState = "Failed";
        bannerType = "error";
      } else if (stateOrType === "running") {
        const lower = (message || "").toLowerCase();
        if (lower.includes("extract")) canonicalState = "Extracting";
        else if (lower.includes("navigat") || lower.includes("opening")) canonicalState = "Navigating";
        else if (lower.includes("plan") || lower.includes("structur")) canonicalState = "Planning";
        else if (lower.includes("verify") || lower.includes("validat")) canonicalState = "Verifying results";
        else if (lower.includes("approv") || lower.includes("confirm")) canonicalState = "Needs user input";
        else if (lower.includes("interact") || lower.includes("fill") || lower.includes("click") || lower.includes("scroll")) canonicalState = "Interacting with page";
        else if (lower.includes("analyz") || lower.includes("understand") || lower.includes("initializ")) canonicalState = "Understanding request";
        else canonicalState = "Interacting with page";
        bannerType = "running";
      } else {
        canonicalState = "Ready";
        bannerType = "idle";
      }
    }

    statusBanner.className = `status-banner ${bannerType}`;
    statusStateBadge.className = `status-state-badge ${bannerType}`;
    statusStateBadge.innerText = canonicalState;
    if (message) {
      statusMessage.innerText = message;
      statusMessage.title = message;
    }
  }

  function appendUserGoalMessage(goalText) {
    const card = document.createElement("div");
    card.className = "stream-item user-goal";
    card.innerHTML = `
      <div class="stream-item-header">
        <span class="stream-tag tag-goal">User Prompt</span>
        <span class="stream-timestamp">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="stream-thought" style="font-weight:600; color:#f8fafc;">${escapeHtml(goalText)}</div>
    `;
    streamInsert(card, "goal");
    scrollStreamToBottom();
  }

  function renderLogEntry(entry) {
    const card = document.createElement("div");
    card.className = "stream-item action-card";

    const actLower = (entry.action || "").toLowerCase();
    const tagClass = `tag-${actLower}` in { "tag-click": 1, "tag-type": 1, "tag-extract": 1, "tag-scroll": 1, "tag-wait": 1, "tag-done": 1 }
      ? `tag-${actLower}`
      : "tag-click";

    let paramsPreview = "";
    if (entry.params) {
      if (entry.params.id != null) paramsPreview += `[#${entry.params.id}] `;
      if (entry.params.text) paramsPreview += `"${escapeHtml(entry.params.text.slice(0, 30))}" `;
      if (entry.params.url) paramsPreview += `${escapeHtml(entry.params.url.slice(0, 35))} `;
      if (entry.params.direction) paramsPreview += `${entry.params.direction} ${entry.params.amount || 500}px `;
    }

    card.innerHTML = `
      <div class="stream-item-header">
        <span class="stream-tag ${tagClass}">${entry.action.toUpperCase()}</span>
        <span class="stream-timestamp">${entry.timestamp || new Date().toLocaleTimeString()}</span>
      </div>
      <div class="stream-thought">${escapeHtml(entry.thought || "")}</div>
      ${paramsPreview ? `<div class="stream-params-preview">${paramsPreview}</div>` : ""}
    `;
    streamInsert(card, "entry");
    scrollStreamToBottom();
  }

  function renderAnswerCard(answerText) {
    const card = document.createElement("div");
    card.className = "stream-item answer-card";
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `
      <div class="stream-item-header">
        <div class="answer-badge-wrap">
          <div class="answer-icon-spark">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
            </svg>
          </div>
          <span class="stream-tag tag-answer">AGENT RESPONSE</span>
        </div>
        <div class="answer-header-meta">
          <span class="stream-timestamp">${timestamp}</span>
          <button class="btn-icon-copy copy-answer-top-btn" title="Copy answer to clipboard">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
          </button>
        </div>
      </div>
      <div class="answer-content">${formatMarkdownish(answerText)}</div>
      <div class="answer-actions">
        <button class="btn btn-secondary btn-sm copy-answer-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
          <span>Copy Formatted Response</span>
        </button>
      </div>
    `;

    const handleCopy = () => {
      navigator.clipboard.writeText(answerText);
      const copyBtn = card.querySelector(".copy-answer-btn");
      if (copyBtn) {
        copyBtn.innerHTML = `<span>✓ Copied to Clipboard</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
            <span>Copy Formatted Response</span>
          `;
        }, 2000);
      }
      const topBtn = card.querySelector(".copy-answer-top-btn");
      if (topBtn) {
        topBtn.style.color = "#10b981";
        setTimeout(() => { topBtn.style.color = ""; }, 2000);
      }
    };

    const copyBtn = card.querySelector(".copy-answer-btn");
    if (copyBtn) copyBtn.addEventListener("click", handleCopy);
    const topBtn = card.querySelector(".copy-answer-top-btn");
    if (topBtn) topBtn.addEventListener("click", handleCopy);

    streamInsert(card, "entry");
    scrollStreamToBottom();
  }
  window.renderAnswerCard = renderAnswerCard;

  function renderGroundedAnswerCard(data) {
    if (!data) return;
    const card = document.createElement("div");
    card.className = "stream-item answer-card grounded-qa-card";
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isFound = Boolean(data.found_on_page);
    const snippets = Array.isArray(data.evidence_snippets) ? data.evidence_snippets : [];

    const evidenceHtml = snippets.length > 0
      ? `
        <div class="grounded-evidence-wrap" style="margin-top:10px; padding:8px 10px; background:rgba(0,0,0,0.25); border-left:3px solid #10b981; border-radius:4px;">
          <div style="font-size:10px; font-weight:600; color:#34d399; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">
            📄 Verifiable Evidence from Active Page
          </div>
          <ul style="margin:0; padding-left:14px; font-size:10.5px; color:var(--text-secondary); line-height:1.4;">
            ${snippets.map(s => `<li style="margin-bottom:3px;">"${escapeHtml(s)}"</li>`).join("")}
          </ul>
        </div>
      `
      : "";

    card.innerHTML = `
      <div class="stream-item-header">
        <div class="answer-badge-wrap">
          <div class="answer-icon-spark" style="background:${isFound ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color:${isFound ? '#10b981' : '#f87171'};">
            ${isFound ? '🔍' : '⚠️'}
          </div>
          <span class="stream-tag ${isFound ? 'tag-answer' : 'tag-warning'}">
            ${isFound ? 'PAGE Q&A GROUNDED ANSWER' : 'NOT FOUND ON ACTIVE PAGE'}
          </span>
        </div>
        <div class="answer-header-meta">
          <span class="stream-timestamp">${timestamp}</span>
          <button class="btn-icon-copy copy-qa-top-btn" title="Copy answer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
          </button>
        </div>
      </div>
      <div class="answer-content" style="margin-top:8px;">
        ${formatMarkdownish(data.answer || "No response generated.")}
      </div>
      ${evidenceHtml}
      <div style="margin-top:8px; font-size:9.5px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
        <span>Source: <em>${escapeHtml(data.source_title || (data.source_url ? new URL(data.source_url, "https://web").hostname : "Active Page"))}</em></span>
        ${data.confidence ? `<span>Confidence: <strong>${Math.round(data.confidence * 100)}%</strong></span>` : ''}
      </div>
      <div class="answer-actions" style="margin-top:8px;">
        <button class="btn btn-secondary btn-sm copy-qa-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
          <span>Copy Grounded Answer</span>
        </button>
      </div>
    `;

    const handleCopy = () => {
      navigator.clipboard.writeText(data.answer || "");
      const copyBtn = card.querySelector(".copy-qa-btn");
      if (copyBtn) {
        copyBtn.innerHTML = `<span>✓ Copied to Clipboard</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
            <span>Copy Grounded Answer</span>
          `;
        }, 2000);
      }
      const topBtn = card.querySelector(".copy-qa-top-btn");
      if (topBtn) {
        topBtn.style.color = "#10b981";
        setTimeout(() => { topBtn.style.color = ""; }, 2000);
      }
    };

    const copyBtn = card.querySelector(".copy-qa-btn");
    if (copyBtn) copyBtn.addEventListener("click", handleCopy);
    const topBtn = card.querySelector(".copy-qa-top-btn");
    if (topBtn) topBtn.addEventListener("click", handleCopy);

    streamInsert(card, "entry");
    scrollStreamToBottom();
  }
  window.renderGroundedAnswerCard = renderGroundedAnswerCard;

  // Newest-first stream: each run is a group placed at the top; inside a run, the newest entry sits
  // directly under that run's prompt. The view therefore always shows the latest activity first.
  let currentRunGroup = null;
  function streamInsert(card, kind) {
    if (kind === "goal" || !currentRunGroup || !currentRunGroup.isConnected) {
      currentRunGroup = document.createElement("div");
      currentRunGroup.className = "run-group";
      logStream.prepend(currentRunGroup);
    }
    if (kind === "goal") {
      currentRunGroup.prepend(card);
    } else {
      const goalCard = currentRunGroup.querySelector(":scope > .user-goal");
      if (goalCard) goalCard.after(card); else currentRunGroup.prepend(card);
    }
    logStream.scrollTop = 0;
  }

  function scrollStreamToBottom() {
    logStream.scrollTop = 0; // newest first: keep the top (latest) in view
  }

  // ── 9. STRUCTURED PLAN RENDERING ──────────────────────────────────────────
  function renderStructuredPlan(plan) {
    if (!plan || !plan.phases || plan.phases.length === 0) return;
    if (plan.task_classification) {
      renderTaskSummaryCard(plan.task_classification);
    }
    planSection.classList.remove("hidden");
    planSummaryBadge.innerText = `${plan.phases.length} phases | ${plan.actions.length} actions`;
    planContainer.innerHTML = "";

    plan.phases.forEach(p => {
      const phaseCard = document.createElement("div");
      phaseCard.className = "plan-phase-card";
      phaseCard.id = `phaseCard_${p.id}`;
      phaseCard.innerHTML = `
        <div class="phase-header">
          <span>Phase ${p.id}: ${escapeHtml(p.title)}</span>
          <span class="phase-status-pill ${p.status || "pending"}" id="phasePill_${p.id}">${p.status || "pending"}</span>
        </div>
      `;
      planContainer.appendChild(phaseCard);
    });
  }

  function updateTaskStatusInUI(task) {
    const pill = document.getElementById(`phasePill_${task.phase_id}`);
    if (pill && task.status === "running") {
      pill.className = "phase-status-pill running";
      pill.innerText = "running";
    }
  }

  // ── 10. EXTRACTED DATA, DETERMINISTIC RECOMMENDATIONS & EXPORTS ───────────
  const btnModeCards = document.getElementById("btnModeCards");
  const btnModeTable = document.getElementById("btnModeTable");
  const resultsSortSelect = document.getElementById("resultsSortSelect");
  const checkOnlyPassing = document.getElementById("checkOnlyPassing");
  const resultsCardsContainer = document.getElementById("resultsCardsContainer");

  let currentResultsMode = "cards"; // "cards" or "table"

  if (btnModeCards && btnModeTable) {
    btnModeCards.addEventListener("click", () => {
      currentResultsMode = "cards";
      btnModeCards.classList.add("active");
      btnModeTable.classList.remove("active");
      if (resultsCardsContainer) resultsCardsContainer.classList.remove("hidden");
      if (resultsTableContainer) resultsTableContainer.classList.add("hidden");
    });

    btnModeTable.addEventListener("click", () => {
      currentResultsMode = "table";
      btnModeTable.classList.add("active");
      btnModeCards.classList.remove("active");
      if (resultsCardsContainer) resultsCardsContainer.classList.add("hidden");
      if (resultsTableContainer) resultsTableContainer.classList.remove("hidden");
    });
  }

  if (resultsSortSelect) {
    resultsSortSelect.addEventListener("change", () => {
      renderRecommendationCards(agent.extractedRecords, agent.rankedResults);
    });
  }

  if (checkOnlyPassing) {
    checkOnlyPassing.addEventListener("change", () => {
      renderRecommendationCards(agent.extractedRecords, agent.rankedResults);
    });
  }

  function renderRecommendationCards(records, rankedData = null) {
    if (!resultsCardsContainer) return;
    const hasRankedItems = Boolean(rankedData && rankedData.ranked_items && rankedData.ranked_items.length);
    if ((!records || records.length === 0) && !hasRankedItems) {
      resultsCardsContainer.innerHTML = `
        <div class="log-empty">
          No extracted items or recommendations yet. Run a product, flight, job, or research task to view candidates.
        </div>
      `;
      return;
    }

    let primaryItems = [];
    let alternativeItems = [];
    let disqualifiedItems = [];

    if (rankedData && rankedData.ranked_items) {
      const showPassingOnly = checkOnlyPassing ? checkOnlyPassing.checked : true;
      primaryItems = rankedData.ranked_items || [];
      alternativeItems = rankedData.alternative_items || [];
      disqualifiedItems = rankedData.disqualified_items || [];
      if (!showPassingOnly) {
        // Disqualified items appended at the end
      }
    } else {
      // Fallback deterministic formatting directly from extracted records
      const serpNoise = /^(web results|people also ask|related searches|videos|images|shopping|search results|more results|discussions and forums|perspectives|filter results)$/i;
      const validRecords = records.filter(r => {
        const t = (r.title || r.name || "").trim();
        return t && !serpNoise.test(t) && t.length >= 3 && !/^(product|item|view item)$/i.test(t);
      });

      primaryItems = validRecords.map((r, idx) => {
        let priceNum = r.numeric_price != null ? r.numeric_price : null;
        if (priceNum === null && r.price && r.price !== "Check site") {
          const m = String(r.price).replace(/,/g, '').match(/[\d.]+/);
          if (m) priceNum = parseFloat(m[0]);
        }
        const hasEvidence = priceNum !== null || (r.specs && r.specs.length > 5) || r.rating || r.departure_time;
        const passed = Boolean(hasEvidence);

        return {
          id: r.record_id || `item_${idx + 1}`,
          name: r.title || r.name || `Option #${idx + 1}`,
          category: r.category || "product",
          raw_price: r.raw_price || r.price || "",
          numeric_price: priceNum,
          formatted_price: (r.price && r.price !== "Check site") ? r.price : (r.raw_price || "Price unavailable"),
          rating: r.rating ? parseFloat(r.rating) : null,
          brand: r.brand || r.airline || null,
          airline: r.airline || null,
          flight_code: r.flight_code || null,
          route: r.route || null,
          departure_time: r.departure_time || null,
          arrival_time: r.arrival_time || null,
          duration: r.duration || null,
          stops: r.stops || null,
          company: r.company || null,
          location: r.location || null,
          experience: r.experience || null,
          salary: r.salary || null,
          cinema: r.cinema || null,
          showtime: r.showtime || null,
          movie_format: r.movie_format || null,
          specs: r.specs || "",
          product_url: r.link || r.url || r.source_url || "",
          source_domain: r.source_website || (r.source_url ? (r.source_url.replace(/https?:\/\/(?:www\.)?/, '').split('/')[0]) : "Web"),
          extracted_at: r.extraction_timestamp || r.extracted_at || new Date().toISOString(),
          sponsored_status: Boolean(r.sponsored_status),
          passed_filters: passed,
          disqualification_reasons: passed ? [] : ["No pricing or technical specification evidence found on page"],
          final_score: passed ? Math.max(40, 85 - (idx * 4)) : 0,
          rank: passed ? (idx + 1) : 99,
          score_breakdown: {
            rationale: passed
              ? `Verified web extraction candidate${priceNum ? ` at ${r.price || r.raw_price}` : ''}.`
              : "Disqualified: Missing pricing and technical specifications."
          }
        };
      });
    }

    // Sort function helper
    const sortVal = resultsSortSelect ? resultsSortSelect.value : "score_desc";
    const sortList = (list) => {
      list.sort((a, b) => {
        if (sortVal === "score_desc") return (b.final_score || 0) - (a.final_score || 0);
        if (sortVal === "price_asc") return (a.numeric_price || 999999) - (b.numeric_price || 999999);
        if (sortVal === "price_desc") return (b.numeric_price || 0) - (a.numeric_price || 0);
        if (sortVal === "rating_desc") return (b.rating || 0) - (a.rating || 0);
        return 0;
      });
    };
    sortList(primaryItems);
    sortList(alternativeItems);

    // Live search filter
    const query = tableFilterInput ? tableFilterInput.value.toLowerCase().trim() : "";
    const filterByQuery = (list) => {
      if (!query) return list;
      return list.filter(it =>
        (it.name && it.name.toLowerCase().includes(query)) ||
        (it.brand && it.brand.toLowerCase().includes(query)) ||
        (it.airline && it.airline.toLowerCase().includes(query)) ||
        (it.company && it.company.toLowerCase().includes(query)) ||
        (it.specs && it.specs.toLowerCase().includes(query)) ||
        (it.formatted_price && it.formatted_price.toLowerCase().includes(query))
      );
    };

    let visiblePrimary = filterByQuery(primaryItems);
    let visibleAlternatives = filterByQuery(alternativeItems);
    let visibleDisqualified = filterByQuery(disqualifiedItems);

    const showPassingOnly = checkOnlyPassing ? checkOnlyPassing.checked : true;
    let allRenderItems = [...visiblePrimary];
    let showAlternativeSection = visibleAlternatives.length > 0;
    let showDisqualifiedSection = !showPassingOnly && visibleDisqualified.length > 0;

    if (allRenderItems.length === 0 && !showAlternativeSection && !showDisqualifiedSection) {
      resultsCardsContainer.innerHTML = `
        <div class="log-empty">
          No candidates match the current filter or search criteria.
        </div>
      `;
      return;
    }

    function formatPlatformBadge(domain) {
      if (!domain) return "🌐 Web";
      const d = domain.toLowerCase();
      if (d.includes("amazon")) return "🛒 Amazon India";
      if (d.includes("flipkart")) return "🛍️ Flipkart";
      if (d.includes("croma")) return "🏪 Croma";
      if (d.includes("reliance")) return "🏢 Reliance Digital";
      if (d.includes("makemytrip")) return "✈️ MakeMyTrip";
      if (d.includes("booking")) return "🏨 Booking.com";
      if (d.includes("linkedin")) return "💼 LinkedIn";
      if (d.includes("naukri")) return "💼 Naukri";
      if (d.includes("bookmyshow")) return "🎬 BookMyShow";
      if (d.includes("samsung")) return "🏢 Samsung Store";
      if (d.includes("apple")) return "🍎 Apple Store";
      if (d.includes("ac.in") || d.includes("edu")) return "🎓 Official University Portal";
      if (d.includes("gov")) return "🏛️ Official Government Portal";
      return `🌐 ${escapeHtml(domain)}`;
    }

    const renderCardHtml = (item, index, isAlternative = false) => {
      const isTopPick = item.rank === 1 && item.passed_filters && !isAlternative;
      const isDisqualified = !item.passed_filters;
      const cardClass = `rec-card ${isTopPick ? 'top-pick' : ''} ${isDisqualified ? 'disqualified' : ''} ${isAlternative ? 'alternative' : ''}`;

      const scoreNum = item.final_score ? Math.round(item.final_score) : 75;
      const priceText = item.formatted_price || item.raw_price || "Check site";
      const ratingText = item.rating ? `★ ${item.rating}` : null;

      // Category-specific middle layout
      let middleHtml = "";
      if (item.category === "flight" || item.airline || item.departure_time) {
        const depTime = item.departure_time || "--:--";
        const arrTime = item.arrival_time || "--:--";
        const duration = item.duration || "Direct";
        const stops = item.stops || "Non-stop";
        const route = item.route || "";

        middleHtml = `
          <div class="rec-flight-itinerary">
            <div class="rec-flight-times">
              <span class="rec-flight-time-val">${escapeHtml(depTime)}</span>
              <span class="rec-flight-airport">${escapeHtml(route.split('→')[0] || 'DEP').trim()}</span>
            </div>
            <div class="rec-flight-duration-block">
              <span class="rec-flight-duration">${escapeHtml(duration)}</span>
              <div class="rec-flight-line"></div>
              <span class="rec-flight-stops">${escapeHtml(stops)}</span>
            </div>
            <div class="rec-flight-times" style="text-align: right;">
              <span class="rec-flight-time-val">${escapeHtml(arrTime)}</span>
              <span class="rec-flight-airport">${escapeHtml(route.split('→')[1] || 'ARR').trim()}</span>
            </div>
          </div>
        `;
      } else if (item.category === "job" || item.company) {
        middleHtml = `
          <div class="rec-job-meta">
            ${item.company ? `<span class="rec-spec-tag brand">🏢 ${escapeHtml(item.company)}</span>` : ''}
            ${item.location ? `<span class="rec-spec-tag">📍 ${escapeHtml(item.location)}</span>` : ''}
            ${item.experience ? `<span class="rec-spec-tag">⏳ ${escapeHtml(item.experience)}</span>` : ''}
            ${item.salary ? `<span class="rec-spec-tag price">💰 ${escapeHtml(item.salary)}</span>` : ''}
          </div>
        `;
      } else if (item.category === "movie" || item.cinema) {
        middleHtml = `
          <div class="rec-movie-meta">
            ${item.cinema ? `<span class="rec-spec-tag brand">🎬 ${escapeHtml(item.cinema)}</span>` : ''}
            ${item.showtime ? `<span class="rec-spec-tag">⏰ ${escapeHtml(item.showtime)}</span>` : ''}
            ${item.movie_format ? `<span class="rec-spec-tag">🎞️ ${escapeHtml(item.movie_format)}</span>` : ''}
          </div>
        `;
      }

      return `
        <div class="${cardClass}">
          <div class="rec-card-header">
            <div class="rec-title-wrap">
              ${isTopPick ? '<div class="rec-top-pick-badge">🏆 #1 TOP RECOMMENDATION FOR YOUR PROMPT</div>' : ''}
              ${item.sponsored_status ? '<span class="rec-sponsored-badge">🏷️ Sponsored</span>' : ''}
              <a href="${escapeHtml(item.product_url || '#')}" target="_blank" class="rec-title-link" title="${escapeHtml(item.name)}">
                ${escapeHtml(item.name)}
              </a>
            </div>
            <div class="rec-score-pill" title="Deterministic Recommendation Score">
              <span class="rec-score-num">${scoreNum}</span>
              <span class="rec-score-lbl">SCORE</span>
            </div>
          </div>

          <div class="rec-price-row">
            <span class="rec-price-highlight">${escapeHtml(priceText)}</span>
            ${item.raw_price && item.raw_price !== priceText ? `<span class="rec-price-raw">${escapeHtml(item.raw_price)}</span>` : ''}
          </div>

          ${middleHtml}

          <div class="rec-tags-row">
            ${item.category === 'flight' ? '<span class="rec-spec-tag flight" style="background: rgba(59, 130, 246, 0.18); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35); font-weight: 600;">✈️ Flight</span>' : ''}
            ${item.category === 'hotel' ? '<span class="rec-spec-tag hotel" style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); font-weight: 600;">🏨 Hotel</span>' : ''}
            ${item.category === 'job' ? '<span class="rec-spec-tag" style="background: rgba(168, 85, 247, 0.18); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); font-weight: 600;">💼 Career</span>' : ''}
            ${item.brand ? `<span class="rec-spec-tag brand">${escapeHtml(item.brand)}</span>` : ''}
            ${item.ram_gb ? `<span class="rec-spec-tag">${item.ram_gb}GB RAM</span>` : ''}
            ${item.storage_gb ? `<span class="rec-spec-tag">${item.storage_gb >= 1024 ? `${item.storage_gb / 1024}TB` : `${item.storage_gb}GB`} Storage</span>` : ''}
            ${ratingText ? `<span class="rec-spec-tag rating">${escapeHtml(ratingText)}</span>` : ''}
            ${item.specs && !item.ram_gb && !item.storage_gb && item.category !== 'flight' ? `<span class="rec-spec-tag specs" style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.specs)}">${escapeHtml(item.specs)}</span>` : ''}
            ${item.amenities && item.amenities.length > 0 ? item.amenities.slice(0, 3).map(a => `<span class="rec-spec-tag">${escapeHtml(a)}</span>`).join('') : ''}
          </div>

          ${item.applied_preferences && item.applied_preferences.length > 0 ? `
            <div class="rec-applied-prefs-row" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:5px;">
              ${item.applied_preferences.map(p => `<span class="rec-spec-tag pref-applied" style="background:rgba(16,185,129,0.12); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-size:9px;">${escapeHtml(p)}</span>`).join('')}
            </div>
          ` : ''}

          ${item.requirements_satisfied && item.requirements_satisfied.length > 0 ? `
            <div class="rec-satisfied-box">
              <strong>✓ Satisfied Constraints:</strong> ${escapeHtml(item.requirements_satisfied.join('; '))}
            </div>
          ` : ''}

          ${isDisqualified ? `
            <div class="rec-violation-box">
              <strong>⚠️ Constraint Violation:</strong>
              ${escapeHtml((item.requirements_violated && item.requirements_violated.length > 0 ? item.requirements_violated : item.disqualification_reasons || []).join('; '))}
            </div>
          ` : `
            <div class="rec-why-box">
              💡 ${escapeHtml(item.score_breakdown && item.score_breakdown.rationale ? item.score_breakdown.rationale : `Deterministic score: ${scoreNum}/100 based on price, verified specs, and ratings.`)}
              ${item.score_breakdown && item.score_breakdown.price_score != null ? `
                <div style="margin-top: 3px; font-size: 8.5px; color: var(--text-muted);">
                  Weighted Points: Price ${Math.round(item.score_breakdown.price_score)} • Specs/Dur ${Math.round(item.score_breakdown.spec_score || 0)} • Rating ${Math.round(item.score_breakdown.rating_score || 0)} • Prefs ${Math.round(item.score_breakdown.preference_score || 0)}
                </div>
              ` : ''}
            </div>
          `}

          <div class="rec-card-footer">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="rec-domain-badge">
                ${formatPlatformBadge(item.source_domain)}
              </span>
              <span class="rec-verification-pill ${isDisqualified ? 'failed' : 'verified'}">
                ${isDisqualified ? '⚠️ Disqualified' : '✓ Verified'}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <button class="btn-tracker-sm btn-save-rec-item" data-id="${item.id}" title="Save item directly to library">
                💾 Save Item
              </button>
              <button class="btn-tracker-sm btn-track-rec-item" data-id="${item.id}" title="Save item and track price drops">
                ★ Track Price
              </button>
            </div>
          </div>
        </div>
      `;
    };

    let cardsHtml = "";
    // 1. Primary Ranked Items
    allRenderItems.forEach((it, idx) => {
      cardsHtml += renderCardHtml(it, idx, false);
    });

    // 2. Alternative Brands (when user requested a specific brand like Samsung)
    if (showAlternativeSection) {
      cardsHtml += `
        <div class="rec-section-divider">
          <span>💡 Alternative Brand Options within Budget (${visibleAlternatives.length})</span>
        </div>
      `;
      visibleAlternatives.forEach((it, idx) => {
        cardsHtml += renderCardHtml(it, idx + allRenderItems.length, true);
      });
    }

    // 3. Disqualified Items (when showPassingOnly is unchecked)
    if (showDisqualifiedSection) {
      cardsHtml += `
        <div class="rec-section-divider" style="color: #f87171; border-color: rgba(239, 68, 68, 0.25);">
          <span>⚠️ Disqualified Items (${visibleDisqualified.length})</span>
        </div>
      `;
      visibleDisqualified.forEach((it, idx) => {
        cardsHtml += renderCardHtml(it, idx + allRenderItems.length + visibleAlternatives.length, false);
      });
    }

    resultsCardsContainer.innerHTML = cardsHtml;

    // Combined items registry for button click bindings
    const registryMap = new Map();
    [...allRenderItems, ...visibleAlternatives, ...visibleDisqualified].forEach(it => {
      registryMap.set(it.id, it);
    });

    // Attach Save Item listener
    resultsCardsContainer.querySelectorAll(".btn-save-rec-item").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const targetItem = registryMap.get(id);
        if (targetItem) {
          btn.disabled = true;
          btn.innerText = "⏳ Saving...";
          try {
            const currentPrice = targetItem.numeric_price || null;
            let itemType = targetItem.category || "product";

            await saveUserItem({
              item_type: itemType,
              title: targetItem.name || targetItem.title || "Saved Item",
              url: targetItem.product_url || targetItem.url || targetItem.link || "",
              currency: targetItem.currency || "INR",
              initial_price: currentPrice,
              current_price: currentPrice,
              tracking_enabled: false,
              content: {
                brand: targetItem.brand,
                rating: targetItem.rating,
                source_domain: targetItem.source_domain,
                specs: targetItem
              }
            });
            btn.innerText = "✓ Saved";
            btn.classList.add("btn-primary");
            showStatus("Completed", `Saved "${targetItem.name || targetItem.title}" to library.`);
            if (viewSaved && !viewSaved.classList.contains("hidden")) {
              renderSavedView();
            }
          } catch (err) {
            btn.disabled = false;
            btn.innerText = "💾 Save Item";
            console.warn("Failed to save item:", err);
          }
        }
      });
    });

    // Attach Track Price listener
    resultsCardsContainer.querySelectorAll(".btn-track-rec-item").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const targetItem = registryMap.get(id);
        if (targetItem) {
          await saveAndTrackRecommendationItem(targetItem, btn);
        }
      });
    });
  }
  window.renderRecommendationCards = renderRecommendationCards;

  function renderExtractedTable(records) {
    if (!records || records.length === 0) {
      resultsTableContainer.innerHTML = '<div class="log-empty">No extracted records yet.</div>';
      resultsCount.innerText = "0";
      resultsInfo.innerText = "0 records extracted";
      return;
    }

    resultsCount.innerText = records.length;
    resultsInfo.innerText = `${records.length} records extracted`;

    // Detect category for dynamic column adaptation
    const first = records[0] || {};
    const category = first.category || (first.airline ? "flight" : (first.company ? "job" : (first.cinema ? "movie" : "product")));

    let columns = [];
    if (category === "flight" || first.airline) {
      columns = [
        { key: "airline", label: "Airline" },
        { key: "flight_code", label: "Flight #" },
        { key: "route", label: "Route" },
        { key: "departure_time", label: "Departure" },
        { key: "arrival_time", label: "Arrival" },
        { key: "duration", label: "Duration" },
        { key: "stops", label: "Stops" },
        { key: "price", label: "Fare" },
        { key: "link", label: "Action" }
      ];
    } else if (category === "job" || first.company) {
      columns = [
        { key: "title", label: "Job Title" },
        { key: "company", label: "Company" },
        { key: "location", label: "Location" },
        { key: "experience", label: "Experience" },
        { key: "price", label: "Salary" },
        { key: "link", label: "Action" }
      ];
    } else if (category === "movie" || first.cinema) {
      columns = [
        { key: "title", label: "Movie" },
        { key: "cinema", label: "Cinema" },
        { key: "showtime", label: "Showtime" },
        { key: "movie_format", label: "Format" },
        { key: "price", label: "Price" },
        { key: "link", label: "Action" }
      ];
    } else {
      columns = [
        { key: "brand", label: "Brand" },
        { key: "title", label: "Product Name" },
        { key: "price", label: "Price" },
        { key: "rating", label: "Rating" },
        { key: "specs", label: "Specifications" },
        { key: "link", label: "Action" }
      ];
    }

    let tableHtml = '<table class="extracted-table"><thead><tr>';
    columns.forEach(col => {
      tableHtml += `<th>${escapeHtml(col.label)}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    records.forEach(r => {
      tableHtml += '<tr>';
      columns.forEach(col => {
        const val = r[col.key] != null ? String(r[col.key]) : "";
        if (col.key === "link" || col.key === "product_url" || (val.startsWith("http") && col.key !== "title")) {
          const destUrl = r.link || r.product_url || r.source_url || val;
          tableHtml += `<td><a href="${escapeHtml(destUrl)}" target="_blank" class="table-action-link">🔗 Open Link</a></td>`;
        } else if (col.key === "rating") {
          tableHtml += `<td>${val ? `★ ${escapeHtml(val)}` : '--'}</td>`;
        } else if (col.key === "specs" || col.key === "title") {
          tableHtml += `<td class="table-cell-ellipsis" title="${escapeHtml(val)}">${escapeHtml(val || '--')}</td>`;
        } else {
          tableHtml += `<td>${escapeHtml(val || '--')}</td>`;
        }
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';

    resultsTableContainer.innerHTML = tableHtml;
  }
  window.renderExtractedTable = renderExtractedTable;

  // Live filter on cards & table
  if (tableFilterInput) {
    tableFilterInput.addEventListener("input", () => {
      renderRecommendationCards(agent.extractedRecords, agent.rankedResults);
      const q = tableFilterInput.value.toLowerCase();
      const rows = resultsTableContainer.querySelectorAll("tbody tr");
      rows.forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  // Export CSV (Enhanced with Deterministic Ranking & Evidence)
  exportCsvBtn.addEventListener("click", () => {
    if (!agent.extractedRecords || agent.extractedRecords.length === 0) return;
    if (!currentUser) {
      showGuestUpgradeNotice(
        "CSV Spreadsheet Export",
        "1-Click CSV export is a NetSurf Pro feature. Sign in or create a free account to export spreadsheets. You can still use 'Copy JSON' in Guest mode."
      );
      return;
    }

    let csvRows = [];
    if (agent.rankedResults && agent.rankedResults.ranked_items) {
      const headers = [
        "Rank", "Name", "Category", "Price", "Numeric Price", "Currency",
        "Brand", "RAM (GB)", "Storage (GB)", "Rating", "Final Score",
        "Status", "Disqualification Reason", "Source URL", "Extracted At"
      ];
      csvRows.push(headers.join(","));

      const allItems = [
        ...(agent.rankedResults.ranked_items || []),
        ...(agent.rankedResults.disqualified_items || [])
      ];

      allItems.forEach((it, idx) => {
        const row = [
          it.rank || (idx + 1),
          `"${(it.name || '').replace(/"/g, '""')}"`,
          `"${it.category || 'product'}"`,
          `"${it.formatted_price || it.raw_price || ''}"`,
          it.numeric_price != null ? it.numeric_price : "",
          `"${it.currency || 'INR'}"`,
          `"${it.brand || ''}"`,
          it.ram_gb != null ? it.ram_gb : "",
          it.storage_gb != null ? it.storage_gb : "",
          it.rating != null ? it.rating : "",
          it.final_score != null ? it.final_score : "",
          it.passed_filters ? '"PASSED"' : '"DISQUALIFIED"',
          `"${(it.disqualification_reasons || []).join('; ').replace(/"/g, '""')}"`,
          `"${(it.product_url || it.source_url || '').replace(/"/g, '""')}"`,
          `"${it.extracted_at || ''}"`
        ];
        csvRows.push(row.join(","));
      });
    } else {
      const records = agent.extractedRecords;
      const headers = Array.from(new Set(records.flatMap(Object.keys)));
      csvRows.push(headers.join(","));

      records.forEach(r => {
        const row = headers.map(h => {
          const val = r[h] == null ? "" : String(r[h]);
          return `"${val.replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(","));
      });
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `netsurf_extracted_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Copy JSON
  copyJsonBtn.addEventListener("click", () => {
    if (!agent.extractedRecords || agent.extractedRecords.length === 0) return;
    const exportPayload = agent.rankedResults ? agent.rankedResults : agent.extractedRecords;
    navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
    copyJsonBtn.innerText = "✓ Copied!";
    setTimeout(() => { copyJsonBtn.innerText = "📋 JSON"; }, 2000);
  });

  // ── 11. ELEMENTS INSPECTOR TAB ────────────────────────────────────────────
  async function loadElementsInspector() {
    elementsListContainer.innerHTML = '<div class="log-empty"><div class="spinner"></div> Scanning active tab DOM...</div>';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        elementsListContainer.innerHTML = '<div class="log-empty">No active tab found.</div>';
        return;
      }
      await agent.ensureContentScriptInjected(tab.id);
      const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_OBSERVATION" });
      if (res && res.observation && res.observation.elements) {
        cachedElements = res.observation.elements;
        renderElementsList(cachedElements, tab.id);
      } else {
        elementsListContainer.innerHTML = '<div class="log-empty">No interactive elements found on this page.</div>';
      }
    } catch (err) {
      elementsListContainer.innerHTML = `<div class="log-empty">Error inspecting tab: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderElementsList(elements, tabId) {
    elementsCount.innerText = elements.length;
    if (elements.length === 0) {
      elementsListContainer.innerHTML = '<div class="log-empty">No interactive elements detected.</div>';
      return;
    }

    elementsListContainer.innerHTML = "";
    elements.forEach(el => {
      const item = document.createElement("div");
      item.className = "element-item";
      const lbl = el.label || el.placeholder || el.href || "Unlabeled Element";
      item.innerHTML = `
        <span class="element-badge-id">#${el.id}</span>
        <div class="element-details">
          <span class="element-label" title="${escapeHtml(lbl)}">${escapeHtml(lbl)}</span>
          <span class="element-tag-pill">&lt;${el.tag}&gt; ${el.role ? `role="${el.role}"` : ""}</span>
        </div>
        <button class="btn-element-action" data-action="click" data-id="${el.id}">Click</button>
      `;

      const clickBtn = item.querySelector(".btn-element-action");
      clickBtn.addEventListener("click", async () => {
        clickBtn.innerText = "Clicking...";
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: "EXECUTE_ACTION",
            action: "click",
            params: { id: el.id }
          });
          clickBtn.innerText = "✓ Clicked";
          setTimeout(() => { clickBtn.innerText = "Click"; }, 1500);
        } catch (e) {
          clickBtn.innerText = "Error";
          console.warn(e);
        }
      });

      elementsListContainer.appendChild(item);
    });
  }

  if (elementFilterInput) {
    elementFilterInput.addEventListener("input", () => {
      const q = elementFilterInput.value.toLowerCase();
      const filtered = cachedElements.filter(el => {
        const text = `${el.id} ${el.tag} ${el.label || ""} ${el.placeholder || ""}`.toLowerCase();
        return text.includes(q);
      });
      if (currentActiveTab) renderElementsList(filtered, currentActiveTab.id);
    });
  }

  if (refreshElementsBtn) {
    refreshElementsBtn.addEventListener("click", loadElementsInspector);
  }

  // ── 12. UTILITY FUNCTIONS & LINK HANDLERS ─────────────────────────────────
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cleanProductTitleForSearch(text) {
    if (!text) return "";
    return text
      .replace(/<[^>]+>/g, "")
      .replace(/\*\*/g, "")
      .replace(/\s*\([^)]*(?:pick|choice|recommended|winner|top|budget|value)[^)]*\)/gi, "")
      .replace(/[*#_~]/g, "")
      .trim();
  }

  function resolveDeepPlatformUrl(label, urlStr, contextSnippet) {
    try {
      const u = new URL(urlStr);
      const host = u.hostname.toLowerCase();
      const lbl = (label || "").toLowerCase();

      // If already a valid platform search query with non-empty search parameter, keep it!
      if ((host.includes("amazon") || lbl.includes("amazon")) && (u.searchParams.has("k") || u.searchParams.has("field-keywords"))) {
        return urlStr;
      }
      if ((host.includes("flipkart") || lbl.includes("flipkart")) && u.searchParams.has("q")) {
        return urlStr;
      }
      if ((host.includes("cashify") || lbl.includes("cashify")) && u.searchParams.has("q")) {
        return urlStr;
      }
      if ((host.includes("croma") || lbl.includes("croma")) && u.searchParams.has("q")) {
        return urlStr;
      }
      if ((host.includes("reliance") || lbl.includes("reliance")) && u.searchParams.has("q")) {
        return urlStr;
      }
      if ((host.includes("vijay") || lbl.includes("vijay")) && u.pathname.includes("/search/")) {
        return urlStr;
      }

      // If it's a known shopping platform with an unverified slug, /dp/, /p/, or bare homepage,
      // extract product name from contextSnippet
      let prodName = "";
      if (contextSnippet) {
        // 1. Check HTML table cells preceding this link (last <td> is the item column)
        const tdMatches = [...contextSnippet.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (tdMatches.length > 0) {
          const candidate = tdMatches[tdMatches.length - 1][1];
          prodName = cleanProductTitleForSearch(candidate);
        }
        // 2. Check markdown table row
        if (!prodName) {
          const tableColMatch = contextSnippet.match(/\|\s*([^|\n]+?)\s*\|[^|\n]*$/);
          if (tableColMatch && tableColMatch[1]) {
            prodName = cleanProductTitleForSearch(tableColMatch[1]);
          }
        }
        // 3. Check headings or lists
        if (!prodName) {
          const titleMatch = contextSnippet.match(/(?:###|\d+\.|\*\*)\s*(?:Overall Best Choice:|[A-Za-z0-9\s]+:)?\s*([A-Za-z0-9\s\+\-]+?)(?:\n|\*\*|\-|$)/);
          if (titleMatch && titleMatch[1]) {
            prodName = cleanProductTitleForSearch(titleMatch[1]);
          }
        }
      }

      // 4. If prodName is still empty or generic, extract from URL slug
      if (!prodName || prodName.length < 3 || prodName.toLowerCase() === "smartphone" || prodName.toLowerCase() === "product") {
        let slug = u.pathname;
        for (const marker of ["/p/", "/dp/", "/product/"]) {
          if (slug.includes(marker)) {
            slug = slug.split(marker)[0];
          }
        }
        slug = slug.replace(/^\//, "").replace(/[-_/]/g, " ").trim();
        const slugWords = slug.split(/\s+/).filter(w => !["p", "dp", "product", "buy", "online", "store", "itme"].includes(w.toLowerCase()));
        if (slugWords.length >= 2) {
          prodName = slugWords.slice(0, 5).join(" ");
        }
      }

      if (!prodName || prodName.length < 3) {
        prodName = label;
      }

      const q = encodeURIComponent(prodName);

      if (host.includes("amazon") || lbl.includes("amazon")) return `https://www.amazon.in/s?k=${q}`;
      if (host.includes("flipkart") || lbl.includes("flipkart")) return `https://www.flipkart.com/search?q=${q}`;
      if (host.includes("cashify") || lbl.includes("cashify")) return `https://www.cashify.in/search?q=${q}`;
      if (host.includes("croma") || lbl.includes("croma")) return `https://www.croma.com/searchB?q=${q}`;
      if (host.includes("reliance") || lbl.includes("reliance")) return `https://www.reliancedigital.in/search?q=${q}`;
      if (host.includes("smartprix") || lbl.includes("smartprix")) return `https://www.smartprix.com/search?q=${q}`;
      if (host.includes("vijay") || lbl.includes("vijay")) return `https://www.vijaysales.com/search/${q}`;

      return urlStr;
    } catch {
      return urlStr;
    }
  }

  function parseMarkdownTables(text) {
    const lines = text.split("\n");
    const out = [];
    let i = 0;

    const isTableRow = (l) => {
      if (!l || !l.includes("|")) return false;
      const parts = l.replace(/^\|/, "").replace(/\|$/, "").split("|");
      return parts.length >= 2 && parts.some(p => p.trim().length > 0);
    };

    const isDelimiterRow = (row) => {
      return /^[\s|:-]+$/.test(row) && row.includes("-");
    };

    while (i < lines.length) {
      const line = lines[i];

      if (isTableRow(line)) {
        const tableLines = [];
        while (i < lines.length && isTableRow(lines[i])) {
          tableLines.push(lines[i]);
          i++;
        }

        if (tableLines.length >= 2) {
          const parseCells = (row) => row.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());

          let headerCells = [];
          let bodyRows = [];

          if (tableLines.length >= 3 && isDelimiterRow(tableLines[1])) {
            headerCells = parseCells(tableLines[0]);
            bodyRows = tableLines.slice(2).filter(r => !isDelimiterRow(r)).map(parseCells);
          } else {
            headerCells = parseCells(tableLines[0]);
            bodyRows = tableLines.slice(1).filter(r => !isDelimiterRow(r)).map(parseCells);
          }

          let html = '<div class="answer-table-wrapper"><table class="answer-table"><thead><tr>';
          headerCells.forEach(h => {
            html += `<th>${h}</th>`;
          });
          html += '</tr></thead><tbody>';
          bodyRows.forEach(row => {
            html += '<tr>';
            for (let c = 0; c < headerCells.length; c++) {
              const val = row[c] !== undefined ? row[c] : "";
              html += `<td>${val}</td>`;
            }
            html += '</tr>';
          });
          html += '</tbody></table></div>';
          out.push(html);
          continue;
        } else {
          out.push(...tableLines);
          continue;
        }
      }

      out.push(line);
      i++;
    }

    return out.join("\n");
  }

  function formatMarkdownish(text) {
    if (!text) return "";

    // Normalize newlines
    let src = text.replace(/\r\n/g, "\n");

    // 1. Separate headings stuck to previous text without a preceding double newline
    src = src.replace(/([^\n])\s*(#{1,6}\s+[^\n]+)/g, "$1\n\n$2");

    // 2. Separate bullet items clumped on the same line (after punctuation or closing paren)
    src = src.replace(/([.:;!?\)])\s*([*•+]\s+[A-Za-z0-9"'])/g, "$1\n$2");

    // 3. Separate numbered list items clumped together
    src = src.replace(/([.:;!?\)])\s*(\d+\.\s+[A-Za-z0-9"'])/g, "$1\n$2");

    let safe = escapeHtml(src);

    // 4. Parse Tables (both standard GFM tables and divider-free pipe tables)
    safe = parseMarkdownTables(safe);

    // 5. Fenced Code Blocks (```lang ... ```)
    safe = safe.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<div class="answer-code-block"><div class="code-block-header"><span>${lang ? lang.toUpperCase() : "CODE"}</span></div><pre><code>${code.trim()}</code></pre></div>`;
    });

    // 6. Inline code `code`
    safe = safe.replace(/`([^`]+)`/g, "<code class='answer-inline-code'>$1</code>");

    // 7. File paths and module references in single quotes (handling &#039; from escapeHtml)
    safe = safe.replace(/(?:'|&#039;)([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]{1,5})(?:'|&#039;)/g, "<code class='answer-file-ref'>$1</code>");

    // 8. Markdown Links: [Label](https://...) -> Interactive badge with arrow (and deep URL resolution)
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, (match, label, url, offset, fullStr) => {
      const cleanUrl = url.replace(/&amp;/g, "&");
      const snippet = fullStr.slice(Math.max(0, offset - 250), offset);
      const deepUrl = resolveDeepPlatformUrl(label, cleanUrl, snippet);
      return `<a href="${deepUrl}" target="_blank" rel="noopener noreferrer" class="answer-link" title="Open ${label}"><span class="link-label">${label}</span> <span class="link-arrow">↗</span></a>`;
    });

    // 9. Standalone URLs
    safe = safe.replace(/(?<!href=")(https?:\/\/[^\s<)]+)/g, (match, url) => {
      const cleanUrl = url.replace(/&amp;/g, "&");
      try {
        const domain = new URL(cleanUrl).hostname.replace(/^www\./, "");
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="answer-link" title="Open ${domain} in browser tab"><span class="link-label">${domain}</span> <span class="link-arrow">↗</span></a>`;
      } catch {
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="answer-link"><span class="link-label">${url}</span> <span class="link-arrow">↗</span></a>`;
      }
    });

    // 10. Headings (supports # through #####)
    safe = safe.replace(/^#####\s+(.*)$/gm, "<h6 class='answer-h6'>$1</h6>");
    safe = safe.replace(/^####\s+(.*)$/gm, "<h5 class='answer-h5'>$1</h5>");
    safe = safe.replace(/^###\s+(.*)$/gm, "<h4 class='answer-h4'>$1</h4>");
    safe = safe.replace(/^##\s+(.*)$/gm, "<h3 class='answer-h3'>$1</h3>");
    safe = safe.replace(/^#\s+(.*)$/gm, "<h2 class='answer-h2'>$1</h2>");

    // 11. Horizontal dividers
    safe = safe.replace(/^(?:---|___|\*\*\*)$/gm, "<hr class='answer-divider' />");

    // 12. Bold: **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong class='answer-strong'>$1</strong>");

    // 13. Numbered lists (1. Item, 2. Item)
    safe = safe.replace(/^(\d+)\.\s+(.*)$/gm, "<div class='answer-numbered-row'><span class='answer-num-badge'>$1</span><div class='answer-num-text'>$2</div></div>");

    // 14. Bullet points (-, *, •, +)
    safe = safe.replace(/^[ \t]*[•\-\*\+]\s+(.*)$/gm, "<div class='answer-bullet-row'><span class='answer-bullet-glyph'>✦</span><div class='answer-bullet-text'>$1</div></div>");

    // 15. Split multi-newlines into clean spaced paragraph blocks
    const chunks = safe.split(/\r?\n\r?\n/);
    safe = chunks.map(chunk => {
      const trimmed = chunk.trim();
      if (!trimmed) return "";
      if (/^<(?:h[2-6]|div|table|hr|pre)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p class="answer-p">${trimmed.replace(/\r?\n/g, "<br/>")}</p>`;
    }).filter(Boolean).join("");

    return safe;
  }

  // ── 12. IDENTITY & PROFILE VAULT CONTROLLER ──────────────────────────────
  async function refreshProfilesDropdown() {
    if (!window.NetSurfProfilesVault) return;
    try {
      const profiles = await window.NetSurfProfilesVault.getAllProfiles();
      const activeId = await window.NetSurfProfilesVault.getActiveProfileId();

      activeProfileSelect.innerHTML = "";
      if (profiles.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.innerText = "No profiles saved";
        activeProfileSelect.appendChild(opt);
        return;
      }

      profiles.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.innerText = `${p.name} (${p.tag || "Profile"})`;
        if (p.id === activeId) opt.selected = true;
        activeProfileSelect.appendChild(opt);
      });
    } catch (e) {
      console.warn("[NetSurf] Error refreshing profiles:", e);
    }
  }

  activeProfileSelect.addEventListener("change", async () => {
    const selectedId = activeProfileSelect.value;
    if (selectedId && window.NetSurfProfilesVault) {
      await window.NetSurfProfilesVault.setActiveProfileId(selectedId);
      const selText = activeProfileSelect.options[activeProfileSelect.selectedIndex].text;
      showStatus("idle", `Active profile: ${selText}`);
    }
  });

  // Direct 1-Click Instant Autofill
  directAutofillBtn.addEventListener("click", async () => {
    if (!window.NetSurfProfilesVault) {
      showStatus("error", "Vault module not available.");
      return;
    }

    const activeProfile = await window.NetSurfProfilesVault.getActiveProfile();
    if (!activeProfile || !activeProfile.fields) {
      showStatus("error", "No active profile selected. Click '⚙️ Vault' to create or select a profile.");
      openVaultModal();
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showStatus("error", "No active browser tab found.");
        return;
      }

      directAutofillBtn.disabled = true;
      directAutofillBtn.innerText = "⚡ Filling...";
      showStatus("running", `⚡ Autofilling form with "${activeProfile.name}"...`);

      const result = await agent.autofillCurrentForm(activeProfile.fields, tab.id);

      directAutofillBtn.disabled = false;
      directAutofillBtn.innerText = "⚡ Fill Now";

      if (result && result.success) {
        showStatus("success", `✓ Autofilled ${result.filledCount} fields in ${result.durationMs || 100}ms!`);

        // Log to stream
        const card = document.createElement("div");
        card.className = "stream-item answer-card";
        card.innerHTML = `
          <div class="stream-item-header">
            <span class="stream-tag tag-done">⚡ FAST AUTOFILL COMPLETE</span>
            <span class="stream-timestamp">${new Date().toLocaleTimeString()}</span>
          </div>
          <div class="stream-thought">
            Successfully autofilled <strong>${result.filledCount} form fields</strong> in <strong>${result.durationMs || 100}ms</strong> using profile <strong>${escapeHtml(activeProfile.name)}</strong>.
          </div>
        `;
        streamInsert(card, "entry");
        scrollStreamToBottom();
      } else {
        showStatus("error", "Autofill failed: " + (result ? result.error : "Unknown error"));
      }
    } catch (e) {
      directAutofillBtn.disabled = false;
      directAutofillBtn.innerText = "⚡ Fill Now";
      showStatus("error", "Autofill error: " + e.message);
    }
  });

  // Open Vault Modal
  manageVaultBtn.addEventListener("click", () => {
    openVaultModal();
  });

  closeVaultModalBtn.addEventListener("click", () => {
    vaultModal.classList.add("hidden");
  });

  async function openVaultModal() {
    vaultModal.classList.remove("hidden");
    await renderVaultListView();
  }

  async function renderVaultListView() {
    vaultListView.classList.remove("hidden");
    vaultEditView.classList.add("hidden");

    if (!window.NetSurfProfilesVault) return;
    const profiles = await window.NetSurfProfilesVault.getAllProfiles();
    const activeId = await window.NetSurfProfilesVault.getActiveProfileId();

    vaultProfilesCount.innerText = `${profiles.length} Profile${profiles.length === 1 ? '' : 's'} Saved`;
    vaultCardsList.innerHTML = "";

    if (!currentUser) {
      const guestBanner = document.createElement("div");
      guestBanner.className = "guest-vault-banner";
      guestBanner.innerHTML = `
        <span class="guest-banner-icon">⚡</span>
        <span>Guest Tier: 1 profile allowed. <strong id="btnVaultSignIn">Sign In</strong> to unlock unlimited personas &amp; cloud sync.</span>
      `;
      vaultCardsList.appendChild(guestBanner);
      const signBtn = guestBanner.querySelector("#btnVaultSignIn");
      if (signBtn) {
        signBtn.addEventListener("click", () => {
          vaultModal.classList.add("hidden");
          openAuthModal("login", false);
        });
      }
    }

    if (profiles.length === 0) {
      vaultCardsList.innerHTML = `
        <div class="log-empty">No profiles saved yet. Click "+ Add New Profile" to create one.</div>
      `;
      return;
    }

    profiles.forEach(p => {
      const card = document.createElement("div");
      const isActive = p.id === activeId;
      card.className = `vault-profile-card ${isActive ? 'active-profile' : ''}`;

      const f = p.fields || {};
      const tag = p.tag || "Personal";
      const tagLower = tag.toLowerCase();

      // Icon determination
      let iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
      if (tagLower === "work") {
        iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>';
      } else if (tagLower === "billing" || tagLower === "shipping") {
        iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"></rect><line x1="2" x2="22" y1="10" y2="10"></line></svg>';
      }

      const fullName = f.fullName || `${f.firstName || ''} ${f.lastName || ''}`.trim() || p.name;
      const phone = f.cellPhone || f.phone || "";
      const companyRole = [f.company, f.position].filter(Boolean).join(" • ");
      const addressParts = [f.address1, f.city, f.state, f.country].filter(Boolean).join(", ");

      const attrRows = [];
      if (fullName) {
        attrRows.push(`
          <div class="profile-attr-row">
            <span class="attr-icon">👤</span>
            <div class="attr-body"><span class="attr-key">Full Name</span><span class="attr-value">${escapeHtml(fullName)}</span></div>
          </div>
        `);
      }
      if (f.email) {
        attrRows.push(`
          <div class="profile-attr-row">
            <span class="attr-icon">✉️</span>
            <div class="attr-body"><span class="attr-key">Email</span><span class="attr-value">${escapeHtml(f.email)}</span></div>
          </div>
        `);
      }
      if (phone) {
        attrRows.push(`
          <div class="profile-attr-row">
            <span class="attr-icon">📞</span>
            <div class="attr-body"><span class="attr-key">Phone</span><span class="attr-value">${escapeHtml(phone)}</span></div>
          </div>
        `);
      }
      if (companyRole) {
        attrRows.push(`
          <div class="profile-attr-row">
            <span class="attr-icon">🏢</span>
            <div class="attr-body"><span class="attr-key">Company</span><span class="attr-value">${escapeHtml(companyRole)}</span></div>
          </div>
        `);
      }
      if (addressParts) {
        attrRows.push(`
          <div class="profile-attr-row attr-row-full">
            <span class="attr-icon">📍</span>
            <div class="attr-body"><span class="attr-key">Location</span><span class="attr-value">${escapeHtml(addressParts)}</span></div>
          </div>
        `);
      }

      card.innerHTML = `
        <div class="profile-card-header">
          <div class="profile-card-identity">
            <div class="profile-avatar ${tagLower}">
              ${iconSvg}
            </div>
            <div class="profile-title-group">
              <span class="profile-card-name">${escapeHtml(p.name)}</span>
              <span class="profile-tag-badge tag-${tagLower}">${escapeHtml(tag)}</span>
            </div>
          </div>
          ${isActive ? '<span class="active-badge"><span class="active-badge-dot"></span> Active</span>' : ''}
        </div>
        <div class="profile-attributes-grid">
          ${attrRows.join("") || '<div class="profile-field-empty">No canonical details configured yet</div>'}
        </div>
        <div class="profile-card-actions">
          ${!isActive ? `<button class="btn-card-action btn-card-activate" data-act="activate" data-id="${p.id}">⭐ Set Active</button>` : ''}
          <button class="btn-card-action btn-card-fill" data-act="fill" data-id="${p.id}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>Fill Page</span>
          </button>
          <button class="btn-card-action btn-card-edit" data-act="edit" data-id="${p.id}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Edit</span>
          </button>
          <button class="btn-card-action btn-card-delete" data-act="delete" data-id="${p.id}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>Delete</span>
          </button>
        </div>
      `;

      // Event delegation for card action buttons
      card.querySelectorAll("button[data-act]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const act = btn.getAttribute("data-act");
          const pid = btn.getAttribute("data-id");

          if (act === "activate") {
            await window.NetSurfProfilesVault.setActiveProfileId(pid);
            await refreshProfilesDropdown();
            await renderVaultListView();
          } else if (act === "fill") {
            await window.NetSurfProfilesVault.setActiveProfileId(pid);
            await refreshProfilesDropdown();
            vaultModal.classList.add("hidden");
            directAutofillBtn.click();
          } else if (act === "edit") {
            openVaultInEditMode(pid);
          } else if (act === "delete") {
            if (confirm(`Delete profile "${p.name}"?`)) {
              await window.NetSurfProfilesVault.deleteProfile(pid);
              await refreshProfilesDropdown();
              await renderVaultListView();
            }
          }
        });
      });

      vaultCardsList.appendChild(card);
    });
  }

  // Reset to Defaults Button
  if (btnResetVaultDefaults) {
    btnResetVaultDefaults.addEventListener("click", async () => {
      if (confirm("Reset profile vault to default clean templates?")) {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          await new Promise(r => chrome.storage.local.remove(["netsurf_autofill_profiles", "netsurf_active_profile_id"], r));
        }
        await window.NetSurfProfilesVault.getAllProfiles();
        await refreshProfilesDropdown();
        await renderVaultListView();
      }
    });
  }

  // Switch to Edit View
  btnAddNewProfile.addEventListener("click", async () => {
    if (!currentUser) {
      const profiles = await window.NetSurfProfilesVault.getAllProfiles();
      if (profiles.length >= 1) {
        showGuestUpgradeNotice(
          "Multiple Identity Profiles",
          "Guest mode is limited to 1 profile. Sign in with a free NetSurf account to add unlimited personas (Work, Personal, Billing) and sync them across devices."
        );
        return;
      }
    }
    openVaultInEditMode(null);
  });

  btnCancelEditProfile.addEventListener("click", () => {
    vaultEditView.classList.add("hidden");
    vaultListView.classList.remove("hidden");
  });

  async function openVaultInEditMode(profileId = null, prefillFields = null, defaultName = "") {
    openVaultModal();
    vaultListView.classList.add("hidden");
    vaultEditView.classList.remove("hidden");
    profileSmartPasteInput.value = "";

    // Clear all fields first
    profileFormName.value = defaultName || "";
    profileFormTag.value = "Personal";
    editingProfileId.value = profileId || "";

    Object.keys(vaultFieldInputs).forEach(k => {
      if (vaultFieldInputs[k]) vaultFieldInputs[k].value = "";
    });

    if (profileId) {
      vaultEditTitle.innerText = "Edit Identity Profile";
      const profile = await window.NetSurfProfilesVault.getProfile(profileId);
      if (profile) {
        profileFormName.value = profile.name || "";
        profileFormTag.value = profile.tag || "Personal";
        const f = profile.fields || {};
        Object.keys(vaultFieldInputs).forEach(k => {
          if (vaultFieldInputs[k] && f[k] !== undefined) {
            vaultFieldInputs[k].value = f[k];
          }
        });
      }
    } else {
      vaultEditTitle.innerText = "Create New Profile";
      if (prefillFields) {
        Object.keys(vaultFieldInputs).forEach(k => {
          if (vaultFieldInputs[k] && prefillFields[k] !== undefined) {
            vaultFieldInputs[k].value = prefillFields[k];
          }
        });
        if (!profileFormName.value) {
          const person = prefillFields.fullName || prefillFields.firstName || "New Persona";
          profileFormName.value = `${person} Profile`;
        }
      }
    }
  }

  // Smart Paste Parser inside Edit Modal
  btnApplySmartPaste.addEventListener("click", () => {
    const text = profileSmartPasteInput.value.trim();
    if (!text) return;
    if (window.NetSurfAutofill && window.NetSurfAutofill.parseFormDetailsFromText) {
      const parsed = window.NetSurfAutofill.parseFormDetailsFromText(text);
      let appliedCount = 0;
      Object.keys(parsed).forEach(k => {
        if (vaultFieldInputs[k]) {
          vaultFieldInputs[k].value = parsed[k];
          appliedCount++;
        }
      });
      if (!profileFormName.value && (parsed.fullName || parsed.firstName)) {
        profileFormName.value = `${parsed.fullName || parsed.firstName} (Parsed)`;
      }
      btnApplySmartPaste.innerText = `✓ Parsed ${appliedCount} fields!`;
      setTimeout(() => { btnApplySmartPaste.innerText = "Parse & Fill Below"; }, 2000);
    }
  });

  // Save Profile Handler
  btnSaveProfile.addEventListener("click", async () => {
    const name = profileFormName.value.trim();
    if (!name) {
      alert("Please provide a name or label for this profile (e.g. Work or Rahul).");
      profileFormName.focus();
      return;
    }

    const fields = {};
    Object.keys(vaultFieldInputs).forEach(k => {
      const el = vaultFieldInputs[k];
      if (el && el.value.trim()) {
        fields[k] = el.value.trim();
      }
    });

    // Auto compute fullName if only firstName & lastName were given
    if (!fields.fullName && (fields.firstName || fields.lastName)) {
      fields.fullName = [fields.title, fields.firstName, fields.middleInitial, fields.lastName].filter(Boolean).join(" ");
    }

    const id = editingProfileId.value || undefined;
    const tag = profileFormTag.value || "Personal";

    await window.NetSurfProfilesVault.saveProfile({
      id,
      name,
      tag,
      fields
    });

    await refreshProfilesDropdown();
    await renderVaultListView();
  });

  // Initialize profiles dropdown on load
  refreshProfilesDropdown();

  // ── 13. USER AUTHENTICATION & MULTI-USER STATE ──────────────────────────
  const AUTH_STORAGE_KEY = "netsurf_auth_tokens";
  const AUTH_API_BASE = "http://127.0.0.1:8000";
  let currentUser = null;
  let authTokens = null; // { access_token, refresh_token }

  const btnHeaderAccount = document.getElementById("btnHeaderAccount");
  const authModal = document.getElementById("authModal");
  const closeAuthModalBtn = document.getElementById("closeAuthModalBtn");
  const tabAuthLogin = document.getElementById("tabAuthLogin");
  const tabAuthRegister = document.getElementById("tabAuthRegister");
  const authModalTitle = document.getElementById("authModalTitle");
  const authErrorBanner = document.getElementById("authErrorBanner");
  const authErrorText = document.getElementById("authErrorText");
  const loginForm = document.getElementById("loginForm");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const btnSubmitLogin = document.getElementById("btnSubmitLogin");
  const registerForm = document.getElementById("registerForm");
  const registerName = document.getElementById("registerName");
  const registerEmail = document.getElementById("registerEmail");
  const registerPassword = document.getElementById("registerPassword");
  const btnSubmitRegister = document.getElementById("btnSubmitRegister");
  const btnContinueGuest = document.getElementById("btnContinueGuest");

  const accountModal = document.getElementById("accountModal");
  const closeAccountModalBtn = document.getElementById("closeAccountModalBtn");
  const accAvatar = document.getElementById("accAvatar");
  const accDisplayName = document.getElementById("accDisplayName");
  const accEmail = document.getElementById("accEmail");
  const accUserId = document.getElementById("accUserId");
  const accMemberSince = document.getElementById("accMemberSince");
  const btnAccountLogout = document.getElementById("btnAccountLogout");

  function getStoredTokens() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([AUTH_STORAGE_KEY], (res) => {
          resolve(res[AUTH_STORAGE_KEY] || null);
        });
      } else {
        try {
          const raw = localStorage.getItem(AUTH_STORAGE_KEY);
          resolve(raw ? JSON.parse(raw) : null);
        } catch {
          resolve(null);
        }
      }
    });
  }

  function setStoredTokens(tokens) {
    return new Promise((resolve) => {
      authTokens = tokens;
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        if (tokens) {
          chrome.storage.local.set({ [AUTH_STORAGE_KEY]: tokens }, resolve);
        } else {
          chrome.storage.local.remove([AUTH_STORAGE_KEY], resolve);
        }
      } else {
        if (tokens) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
        resolve();
      }
    });
  }

  const authUpgradeBanner = document.getElementById("authUpgradeBanner");
  const authUpgradeTitle = document.getElementById("authUpgradeTitle");
  const authUpgradeDesc = document.getElementById("authUpgradeDesc");

  function hideAuthUpgrade() {
    if (authUpgradeBanner) authUpgradeBanner.classList.add("hidden");
  }

  function showGuestUpgradeNotice(featureName, desc) {
    if (authUpgradeBanner && authUpgradeTitle && authUpgradeDesc) {
      authUpgradeTitle.innerText = `NetSurf Pro Feature: ${featureName}`;
      authUpgradeDesc.innerText = desc;
      authUpgradeBanner.classList.remove("hidden");
    }
    openAuthModal("login", false);
  }

  function updateAuthHeaderUI() {
    if (!btnHeaderAccount) return;
    if (currentUser) {
      btnHeaderAccount.className = "btn-header-account is-authenticated";
      btnHeaderAccount.title = `Signed in as ${currentUser.email} (${currentUser.name || currentUser.full_name || 'User'}) — Click for Account Details`;
      const initial = (currentUser.name || currentUser.full_name || currentUser.email || 'U')[0].toUpperCase();
      btnHeaderAccount.innerHTML = `
        <span class="account-header-initial">${initial}</span>
        <span class="account-header-dot"></span>
      `;
    } else {
      btnHeaderAccount.className = "btn-header-account is-guest";
      btnHeaderAccount.title = "Guest Mode — Click to Sign In & Unlock Cloud Sync";
      btnHeaderAccount.innerHTML = `
        <span class="guest-status-dot"></span>
        <span class="guest-label">Guest</span>
      `;
    }
  }

  async function fetchCurrentUser(accessToken) {
    try {
      const resp = await fetch(`${AUTH_API_BASE}/auth/me`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (resp.ok) {
        return await resp.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  async function refreshAuthSession() {
    if (!authTokens || !authTokens.refresh_token) return false;
    try {
      const resp = await fetch(`${AUTH_API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: authTokens.refresh_token })
      });
      if (resp.ok) {
        const data = await resp.json();
        await setStoredTokens({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
        if (window.agent && window.agent.setAuthToken) {
          window.agent.setAuthToken(data.access_token);
        }
        currentUser = await fetchCurrentUser(data.access_token);
        updateAuthHeaderUI();
        return true;
      }
    } catch (e) {
      console.warn("Token refresh failed:", e);
    }
    await setStoredTokens(null);
    currentUser = null;
    if (window.agent && window.agent.setAuthToken) {
      window.agent.setAuthToken(null);
    }
    updateAuthHeaderUI();
    return false;
  }

  async function initAuth() {
    authTokens = await getStoredTokens();
    if (authTokens && authTokens.access_token) {
      currentUser = await fetchCurrentUser(authTokens.access_token);
      if (!currentUser && authTokens.refresh_token) {
        await refreshAuthSession();
      } else if (currentUser) {
        if (window.agent && window.agent.setAuthToken) {
          window.agent.setAuthToken(authTokens.access_token);
        }
        updateAuthHeaderUI();
      }
    } else {
      updateAuthHeaderUI();
    }

    // LANDING GATE: If unauthenticated and user has not chosen guest mode in this session, display landing page
    if (!currentUser) {
      const hasChosenGuest = sessionStorage.getItem("netsurf_guest_session") === "true";
      if (!hasChosenGuest) {
        openAuthModal("login", true);
      }
    }
  }

  function showAuthError(msg) {
    if (!authErrorBanner || !authErrorText) return;
    if (msg === "Failed to fetch" || (typeof msg === "string" && msg.includes("Failed to fetch"))) {
      msg = "Cannot connect to backend server at http://127.0.0.1:8000. Please ensure the backend is started.";
    }
    authErrorText.innerText = msg;
    authErrorBanner.classList.remove("hidden");
  }

  function hideAuthError() {
    if (authErrorBanner) authErrorBanner.classList.add("hidden");
  }

  function openAuthModal(mode = "login", asLandingGate = false) {
    hideAuthError();
    if (!asLandingGate && authUpgradeBanner && !authUpgradeBanner.classList.contains("hidden")) {
      // Retain upgrade notice
    } else {
      hideAuthUpgrade();
    }

    authModal.classList.remove("hidden");

    if (closeAuthModalBtn) {
      if (asLandingGate) {
        closeAuthModalBtn.classList.add("hidden");
      } else {
        closeAuthModalBtn.classList.remove("hidden");
      }
    }

    if (mode === "register") {
      tabAuthRegister.classList.add("active");
      tabAuthLogin.classList.remove("active");
      registerForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
      authModalTitle.innerText = "Create NetSurf Account";
      registerName.focus();
    } else {
      tabAuthLogin.classList.add("active");
      tabAuthRegister.classList.remove("active");
      loginForm.classList.remove("hidden");
      registerForm.classList.add("hidden");
      authModalTitle.innerText = "Sign In to NetSurf";
      loginEmail.focus();
    }
  }

  function openAccountModal() {
    if (!currentUser) return;
    accDisplayName.innerText = currentUser.name || currentUser.full_name || "NetSurf User";
    accEmail.innerText = currentUser.email;
    accUserId.innerText = currentUser.id ? currentUser.id.slice(0, 8) + "..." : "Local-Sync";
    accMemberSince.innerText = currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString() : "Active Member";
    accAvatar.innerText = (currentUser.name || currentUser.full_name || currentUser.email || "U")[0].toUpperCase();
    accountModal.classList.remove("hidden");
  }

  if (btnHeaderAccount) {
    btnHeaderAccount.addEventListener("click", () => {
      if (currentUser) {
        openAccountModal();
      } else {
        openAuthModal("login", false);
      }
    });
  }

  if (closeAuthModalBtn) {
    closeAuthModalBtn.addEventListener("click", () => {
      authModal.classList.add("hidden");
      hideAuthUpgrade();
    });
  }

  if (closeAccountModalBtn) {
    closeAccountModalBtn.addEventListener("click", () => {
      accountModal.classList.add("hidden");
    });
  }

  if (btnContinueGuest) {
    btnContinueGuest.addEventListener("click", () => {
      sessionStorage.setItem("netsurf_guest_session", "true");
      authModal.classList.add("hidden");
      hideAuthUpgrade();
      updateAuthHeaderUI();
      showStatus("ready", "Continuing as Guest. 1 Profile & Local Session History active.");
    });
  }

  if (tabAuthLogin) {
    tabAuthLogin.addEventListener("click", () => openAuthModal("login"));
  }

  if (tabAuthRegister) {
    tabAuthRegister.addEventListener("click", () => openAuthModal("register"));
  }

  function formatApiError(data, fallback = "An error occurred") {
    if (!data) return fallback;
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map(d => d.msg || (typeof d === "string" ? d : JSON.stringify(d))).join(", ");
    }
    if (typeof data.detail === "object" && data.detail !== null) {
      return data.detail.msg || JSON.stringify(data.detail);
    }
    if (typeof data.message === "string") return data.message;
    return fallback;
  }

  function setupPasswordToggle(inputEl, btnEl) {
    if (!inputEl || !btnEl) return;
    btnEl.addEventListener("click", () => {
      const isPassword = inputEl.type === "password";
      inputEl.type = isPassword ? "text" : "password";
      const eyeOpen = btnEl.querySelector(".eye-open-icon");
      const eyeClosed = btnEl.querySelector(".eye-closed-icon");
      if (eyeOpen && eyeClosed) {
        if (isPassword) {
          eyeOpen.classList.add("hidden");
          eyeClosed.classList.remove("hidden");
          btnEl.title = "Hide password";
        } else {
          eyeOpen.classList.remove("hidden");
          eyeClosed.classList.add("hidden");
          btnEl.title = "Show password";
        }
      }
    });
  }

  setupPasswordToggle(loginPassword, document.getElementById("toggleLoginPasswordBtn"));
  setupPasswordToggle(registerPassword, document.getElementById("toggleRegisterPasswordBtn"));

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAuthError();
      const email = loginEmail.value.trim();
      const password = loginPassword.value;
      if (!email || !password) return;

      btnSubmitLogin.disabled = true;
      btnSubmitLogin.innerHTML = `<span>Signing in...</span>`;

      try {
        const resp = await fetch(`${AUTH_API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(formatApiError(data, "Authentication failed. Please verify your email and password."));
        }

        await setStoredTokens({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
        currentUser = data.user || (await fetchCurrentUser(data.access_token));
        if (window.agent && window.agent.setAuthToken) {
          window.agent.setAuthToken(data.access_token);
        }
        updateAuthHeaderUI();
        authModal.classList.add("hidden");
        loginPassword.value = "";
        showStatus("success", `Signed in as ${currentUser.full_name || currentUser.name || currentUser.email}`);
      } catch (err) {
        showAuthError(err.message || "Failed to sign in. Please verify your credentials.");
      } finally {
        btnSubmitLogin.disabled = false;
        btnSubmitLogin.innerHTML = `<span>Sign In</span>`;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAuthError();
      const full_name = registerName.value.trim();
      const email = registerEmail.value.trim();
      const password = registerPassword.value;
      if (!email || !password) return;

      btnSubmitRegister.disabled = true;
      btnSubmitRegister.innerHTML = `<span>Creating account...</span>`;

      try {
        const resp = await fetch(`${AUTH_API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: full_name, full_name, email, password })
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(formatApiError(data, "Failed to create account. Please verify your details."));
        }

        await setStoredTokens({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
        currentUser = data.user || (await fetchCurrentUser(data.access_token));
        if (window.agent && window.agent.setAuthToken) {
          window.agent.setAuthToken(data.access_token);
        }
        updateAuthHeaderUI();
        authModal.classList.add("hidden");
        registerPassword.value = "";
        showStatus("success", `Welcome to NetSurf, ${currentUser.full_name || currentUser.name || currentUser.email}!`);
      } catch (err) {
        showAuthError(err.message || "Failed to create account. Please try another email.");
      } finally {
        btnSubmitRegister.disabled = false;
        btnSubmitRegister.innerHTML = `<span>Create Account</span>`;
      }
    });
  }

  if (btnAccountLogout) {
    btnAccountLogout.addEventListener("click", async () => {
      if (authTokens && authTokens.refresh_token) {
        try {
          await fetch(`${AUTH_API_BASE}/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: authTokens.refresh_token })
          });
        } catch (e) {
          console.warn("Logout notification failed:", e);
        }
      }
      await setStoredTokens(null);
      currentUser = null;
      if (window.agent && window.agent.setAuthToken) {
        window.agent.setAuthToken(null);
      }
      updateAuthHeaderUI();
      accountModal.classList.add("hidden");
      showStatus("ready", "Signed out successfully. Continuing as Guest.");
      loadUserPreferences();
    });
  }

  // ── 14. USER PREFERENCES CONTROLLER (PHASE 3) ───────────────────────────
  const PREF_LOCAL_STORAGE_KEY = "netsurf_user_preferences";

  const prefSyncIndicator = document.getElementById("prefSyncIndicator");
  const prefSyncLabel = document.getElementById("prefSyncLabel");
  const prefTabBtns = document.querySelectorAll(".pref-tab-btn");
  const prefSections = {
    shopping: document.getElementById("prefSectionShopping"),
    travel: document.getElementById("prefSectionTravel"),
    general: document.getElementById("prefSectionGeneral"),
    system: document.getElementById("prefSectionSystem")
  };

  const prefShopMinBudget = document.getElementById("prefShopMinBudget");
  const prefShopMaxBudget = document.getElementById("prefShopMaxBudget");
  const prefShopMinRam = document.getElementById("prefShopMinRam");
  const prefShopMinStorage = document.getElementById("prefShopMinStorage");
  const prefShopBrands = document.getElementById("prefShopBrands");
  const prefShopExcludedBrands = document.getElementById("prefShopExcludedBrands");
  const prefShopExclusiveBrands = document.getElementById("prefShopExclusiveBrands");
  const prefShopCategories = document.getElementById("prefShopCategories");
  const prefShopPriorities = document.getElementById("prefShopPriorities");

  const prefTravelDestinations = document.getElementById("prefTravelDestinations");
  const prefTravelHotelBudget = document.getElementById("prefTravelHotelBudget");
  const prefTravelMinRating = document.getElementById("prefTravelMinRating");
  const prefTravelGuests = document.getElementById("prefTravelGuests");
  const prefTravelAirlines = document.getElementById("prefTravelAirlines");
  const prefTravelExcludedAirlines = document.getElementById("prefTravelExcludedAirlines");
  const prefTravelFlightBudget = document.getElementById("prefTravelFlightBudget");
  const prefTravelMaxStops = document.getElementById("prefTravelMaxStops");
  const prefTravelCategories = document.getElementById("prefTravelCategories");
  const prefTravelAmenities = document.getElementById("prefTravelAmenities");

  const prefGeneralWebsites = document.getElementById("prefGeneralWebsites");
  const prefGeneralCurrency = document.getElementById("prefGeneralCurrency");
  const prefGeneralLanguage = document.getElementById("prefGeneralLanguage");

  const btnSavePreferences = document.getElementById("btnSavePreferences");
  const btnSavePrefText = document.getElementById("btnSavePrefText");
  const btnResetPreferences = document.getElementById("btnResetPreferences");

  // Tab switching inside Preferences
  if (prefTabBtns && prefTabBtns.length > 0) {
    prefTabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        prefTabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tabKey = btn.getAttribute("data-pref-tab");
        Object.keys(prefSections).forEach(k => {
          if (prefSections[k]) {
            if (k === tabKey) {
              prefSections[k].classList.remove("hidden");
            } else {
              prefSections[k].classList.add("hidden");
            }
          }
        });
      });
    });
  }

  function getCheckedValues(container) {
    if (!container) return [];
    const checks = container.querySelectorAll("input[type='checkbox']:checked");
    return Array.from(checks).map(c => c.value);
  }

  function setCheckedValues(container, values) {
    if (!container || !values) return;
    const set = new Set(values);
    const checks = container.querySelectorAll("input[type='checkbox']");
    checks.forEach(c => {
      c.checked = set.has(c.value);
    });
  }

  function populatePreferencesForm(prefs) {
    if (!prefs) return;
    const shop = prefs.shopping || {};
    if (prefShopMinBudget) prefShopMinBudget.value = shop.min_budget || "";
    if (prefShopMaxBudget) prefShopMaxBudget.value = shop.max_budget || "";
    if (prefShopMinRam) prefShopMinRam.value = shop.min_ram || "";
    if (prefShopMinStorage) prefShopMinStorage.value = shop.min_storage || "";
    if (prefShopBrands) prefShopBrands.value = (shop.preferred_brands || []).join(", ");
    if (prefShopExcludedBrands) prefShopExcludedBrands.value = (shop.excluded_brands || []).join(", ");
    if (prefShopExclusiveBrands) prefShopExclusiveBrands.checked = Boolean(shop.exclusive_brands);
    setCheckedValues(prefShopCategories, shop.product_categories);
    setCheckedValues(prefShopPriorities, shop.priorities);

    const travel = prefs.travel || {};
    if (prefTravelDestinations) prefTravelDestinations.value = (travel.preferred_destinations || []).join(", ");
    if (prefTravelHotelBudget) prefTravelHotelBudget.value = travel.hotel_budget || "";
    if (prefTravelMinRating) prefTravelMinRating.value = travel.min_hotel_rating || "";
    if (prefTravelGuests) prefTravelGuests.value = travel.num_guests || 2;
    if (prefTravelAirlines) prefTravelAirlines.value = (travel.preferred_airlines || []).join(", ");
    if (prefTravelExcludedAirlines) prefTravelExcludedAirlines.value = (travel.excluded_airlines || []).join(", ");
    if (prefTravelFlightBudget) prefTravelFlightBudget.value = travel.max_budget || "";
    if (prefTravelMaxStops) prefTravelMaxStops.value = travel.max_stops != null ? String(travel.max_stops) : "";
    setCheckedValues(prefTravelCategories, travel.preferred_hotel_categories);
    setCheckedValues(prefTravelAmenities, travel.amenities);

    const gen = prefs.general || {};
    if (prefGeneralWebsites) prefGeneralWebsites.value = (gen.preferred_websites || []).join(", ");
    if (prefGeneralCurrency) prefGeneralCurrency.value = gen.default_currency || "INR";
    if (prefGeneralLanguage) prefGeneralLanguage.value = gen.language || "English";
  }

  function collectPreferencesFromForm() {
    return {
      shopping: {
        min_budget: prefShopMinBudget && prefShopMinBudget.value ? parseFloat(prefShopMinBudget.value) : null,
        max_budget: prefShopMaxBudget && prefShopMaxBudget.value ? parseFloat(prefShopMaxBudget.value) : null,
        min_ram: prefShopMinRam && prefShopMinRam.value ? parseInt(prefShopMinRam.value, 10) : null,
        min_storage: prefShopMinStorage && prefShopMinStorage.value ? parseInt(prefShopMinStorage.value, 10) : null,
        preferred_brands: prefShopBrands && prefShopBrands.value ? prefShopBrands.value.split(",").map(s => s.trim()).filter(Boolean) : [],
        excluded_brands: prefShopExcludedBrands && prefShopExcludedBrands.value ? prefShopExcludedBrands.value.split(",").map(s => s.trim()).filter(Boolean) : [],
        exclusive_brands: Boolean(prefShopExclusiveBrands && prefShopExclusiveBrands.checked),
        product_categories: getCheckedValues(prefShopCategories),
        priorities: getCheckedValues(prefShopPriorities)
      },
      travel: {
        preferred_destinations: prefTravelDestinations && prefTravelDestinations.value ? prefTravelDestinations.value.split(",").map(s => s.trim()).filter(Boolean) : [],
        hotel_budget: prefTravelHotelBudget && prefTravelHotelBudget.value ? parseFloat(prefTravelHotelBudget.value) : null,
        min_hotel_rating: prefTravelMinRating && prefTravelMinRating.value ? parseFloat(prefTravelMinRating.value) : null,
        num_guests: prefTravelGuests && prefTravelGuests.value ? parseInt(prefTravelGuests.value, 10) : 2,
        preferred_airlines: prefTravelAirlines && prefTravelAirlines.value ? prefTravelAirlines.value.split(",").map(s => s.trim()).filter(Boolean) : [],
        excluded_airlines: prefTravelExcludedAirlines && prefTravelExcludedAirlines.value ? prefTravelExcludedAirlines.value.split(",").map(s => s.trim()).filter(Boolean) : [],
        max_budget: prefTravelFlightBudget && prefTravelFlightBudget.value ? parseFloat(prefTravelFlightBudget.value) : null,
        max_stops: prefTravelMaxStops && prefTravelMaxStops.value !== "" ? parseInt(prefTravelMaxStops.value, 10) : null,
        preferred_hotel_categories: getCheckedValues(prefTravelCategories),
        amenities: getCheckedValues(prefTravelAmenities)
      },
      general: {
        preferred_websites: prefGeneralWebsites && prefGeneralWebsites.value ? prefGeneralWebsites.value.split(",").map(s => s.trim()).filter(Boolean) : [],
        default_currency: prefGeneralCurrency ? prefGeneralCurrency.value : "INR",
        language: prefGeneralLanguage ? prefGeneralLanguage.value : "English"
      }
    };
  }

  async function loadUserPreferences() {
    let prefs = null;
    if (currentUser && authTokens && authTokens.access_token) {
      try {
        const resp = await fetch(`${AUTH_API_BASE}/user/preferences`, {
          headers: { "Authorization": `Bearer ${authTokens.access_token}` }
        });
        if (resp.ok) {
          prefs = await resp.json();
          if (prefSyncIndicator && prefSyncLabel) {
            prefSyncIndicator.className = "pref-sync-indicator synced";
            prefSyncLabel.innerText = "Cloud Synced";
            prefSyncIndicator.title = `Preferences synced with account: ${currentUser.email}`;
          }
        }
      } catch (e) {
        console.warn("Failed to load user preferences from backend:", e);
      }
    }

    if (!prefs) {
      const local = await new Promise(res => {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get([PREF_LOCAL_STORAGE_KEY], r => res(r[PREF_LOCAL_STORAGE_KEY] || null));
        } else {
          try {
            res(JSON.parse(localStorage.getItem(PREF_LOCAL_STORAGE_KEY) || "null"));
          } catch {
            res(null);
          }
        }
      });
      prefs = local || {
        shopping: { priorities: ["price", "performance", "battery", "camera", "rating"] },
        travel: { num_guests: 2 },
        general: { default_currency: "INR", language: "English" }
      };
      if (prefSyncIndicator && prefSyncLabel) {
        prefSyncIndicator.className = "pref-sync-indicator";
        prefSyncLabel.innerText = "Local Only";
        prefSyncIndicator.title = "Local preferences. Sign in to sync across devices.";
      }
    }

    populatePreferencesForm(prefs);
    if (prefs && prefs.enable_workflow_memory !== undefined && toggleMemoryReuse) {
      toggleMemoryReuse.checked = Boolean(prefs.enable_workflow_memory);
    }
    if (window.agent && window.agent.setUserPreferences) {
      window.agent.setUserPreferences(prefs);
    }
  }

  if (btnSavePreferences) {
    btnSavePreferences.addEventListener("click", async () => {
      const prefs = collectPreferencesFromForm();
      btnSavePreferences.disabled = true;
      btnSavePrefText.innerText = "Saving...";

      try {
        if (currentUser && authTokens && authTokens.access_token) {
          const resp = await fetch(`${AUTH_API_BASE}/user/preferences`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${authTokens.access_token}`
            },
            body: JSON.stringify(prefs)
          });
          if (!resp.ok) throw new Error("Backend save failed");
        }

        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          await new Promise(res => chrome.storage.local.set({ [PREF_LOCAL_STORAGE_KEY]: prefs }, res));
        } else {
          localStorage.setItem(PREF_LOCAL_STORAGE_KEY, JSON.stringify(prefs));
        }

        if (window.agent && window.agent.setUserPreferences) {
          window.agent.setUserPreferences(prefs);
        }

        btnSavePrefText.innerText = "✓ Saved!";
        const prefSavedBanner = document.getElementById("prefSavedConfirmation");
        if (prefSavedBanner) {
          prefSavedBanner.classList.remove("hidden");
          setTimeout(() => { prefSavedBanner.classList.add("hidden"); }, 3500);
        }
        setTimeout(() => { btnSavePrefText.innerText = "Save Preferences"; }, 2000);
      } catch (err) {
        console.error("Save preferences error:", err);
        btnSavePrefText.innerText = "Save Failed";
        setTimeout(() => { btnSavePrefText.innerText = "Save Preferences"; }, 2000);
      } finally {
        btnSavePreferences.disabled = false;
      }
    });
  }

  if (btnResetPreferences) {
    btnResetPreferences.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to reset all preferences to system defaults?")) return;
      btnResetPreferences.disabled = true;

      try {
        if (currentUser && authTokens && authTokens.access_token) {
          await fetch(`${AUTH_API_BASE}/user/preferences`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${authTokens.access_token}` }
          });
        }
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          await new Promise(res => chrome.storage.local.remove([PREF_LOCAL_STORAGE_KEY], res));
        } else {
          localStorage.removeItem(PREF_LOCAL_STORAGE_KEY);
        }
        await loadUserPreferences();
      } catch (e) {
        console.warn("Reset preferences error:", e);
      } finally {
        btnResetPreferences.disabled = false;
      }
    });
  }

  // Reload preferences when navigation to Settings is clicked
  if (navSettingsBtn) {
    navSettingsBtn.addEventListener("click", () => {
      loadUserPreferences();
    });
  }

  // Reload workflow memory when navigation to Memory is clicked
  if (navMemoryBtn) {
    navMemoryBtn.addEventListener("click", () => {
      loadWorkflowMemory();
    });
  }

  // ── 15. ADAPTIVE WORKFLOW MEMORY CONTROLLER (PHASE 5) ─────────────────────
  const toggleMemoryReuse = document.getElementById("toggleMemoryReuse");
  const memStatCount = document.getElementById("memStatCount");
  const memStatReuseCount = document.getElementById("memStatReuseCount");
  const memStatSuccessRate = document.getElementById("memStatSuccessRate");
  const memorySearchInput = document.getElementById("memorySearchInput");
  const workflowMemoryList = document.getElementById("workflowMemoryList");
  const btnClearAllMemory = document.getElementById("btnClearAllMemory");

  let cachedWorkflowMemories = [];

  async function loadWorkflowMemory() {
    if (!workflowMemoryList) return;

    if (currentUser && authTokens && authTokens.access_token) {
      try {
        const resp = await fetch(`${AUTH_API_BASE}/user/memory`, {
          headers: { "Authorization": `Bearer ${authTokens.access_token}` }
        });
        if (resp.ok) {
          cachedWorkflowMemories = await resp.json();
        } else {
          cachedWorkflowMemories = [];
        }
      } catch (e) {
        console.warn("Failed to fetch user workflow memory:", e);
        cachedWorkflowMemories = [];
      }
    } else {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const data = await new Promise(res => chrome.storage.local.get(["netsurf_guest_workflow_memory"], res));
        cachedWorkflowMemories = data.netsurf_guest_workflow_memory || [];
      } else {
        const local = localStorage.getItem("netsurf_guest_workflow_memory");
        cachedWorkflowMemories = local ? JSON.parse(local) : [];
      }
    }

    updateMemoryStatistics(cachedWorkflowMemories);
    renderWorkflowMemory(cachedWorkflowMemories);
  }

  function updateMemoryStatistics(memories) {
    if (!memories) return;
    const totalCount = memories.length;
    let totalReuses = 0;
    let totalSuccess = 0;
    let totalAttempts = 0;

    memories.forEach(m => {
      totalReuses += (m.reuse_count || 0);
      const sc = m.success_count != null ? m.success_count : (m.success_rate > 0 ? 1 : 0);
      const fc = m.failure_count || 0;
      totalSuccess += sc;
      totalAttempts += (sc + fc);
    });

    if (memStatCount) memStatCount.innerText = totalCount;
    if (memStatReuseCount) memStatReuseCount.innerText = totalReuses;
    if (memStatSuccessRate) {
      if (totalAttempts === 0 || totalCount === 0) {
        memStatSuccessRate.innerText = "N/A";
      } else {
        const avgRate = Math.round((totalSuccess / totalAttempts) * 100);
        memStatSuccessRate.innerText = `${avgRate}%`;
      }
    }
  }

  function renderWorkflowMemory(memories) {
    if (!workflowMemoryList) return;

    const query = memorySearchInput ? memorySearchInput.value.toLowerCase().trim() : "";
    const filtered = (memories || []).filter(m => {
      if (!query) return true;
      const patternMatch = (m.task_pattern || "").toLowerCase().includes(query);
      const categoryMatch = (m.category || "").toLowerCase().includes(query);
      const descMatch = (m.description || "").toLowerCase().includes(query);
      const paramMatch = (m.parameters || []).some(p => p.toLowerCase().includes(query));
      return patternMatch || categoryMatch || descMatch || paramMatch;
    });

    if (filtered.length === 0) {
      workflowMemoryList.innerHTML = `
        <div class="history-empty" id="workflowMemoryEmpty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"></path>
          </svg>
          <p>${query ? 'No workflow patterns match "' + escapeHtml(query) + '"' : 'No learned workflow patterns yet.'}</p>
          <span>${query ? 'Try a different keyword or category.' : 'Complete browser tasks like hotel search or price comparison to train the memory engine.'}</span>
        </div>
      `;
      return;
    }

    let cardsHtml = "";
    filtered.forEach(item => {
      const cat = (item.category || "general").toLowerCase();
      const params = Array.isArray(item.parameters) ? item.parameters : [];
      const rate = item.success_rate != null ? Math.round(item.success_rate * 100) : 100;
      const reuseCount = item.reuse_count || 0;
      const actionsCount = Array.isArray(item.action_sequence) ? item.action_sequence.length : (item.learned_solution ? item.learned_solution.length : 0);

      let lastRunText = "Never";
      if (item.last_executed_at) {
        try {
          lastRunText = new Date(item.last_executed_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        } catch (_) {
          lastRunText = String(item.last_executed_at);
        }
      }

      cardsHtml += `
        <div class="memory-card" data-id="${item.id}">
          <div class="memory-card-header">
            <div class="memory-card-title-group">
              <span class="memory-category-badge ${cat}">${cat.toUpperCase()}</span>
              <div class="memory-card-pattern">${escapeHtml(item.description || item.task_pattern)}</div>
            </div>
            <button class="btn-delete-mem" data-id="${item.id}" title="Delete workflow pattern">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>

          ${params.length > 0 ? `
            <div class="memory-param-tags">
              ${params.map(p => `<span class="memory-param-chip">{${escapeHtml(p)}}</span>`).join("")}
            </div>
          ` : ""}

          <div class="memory-steps-preview">
            ⚡ <strong>Pattern:</strong> ${escapeHtml(item.task_pattern)} (${actionsCount} autonomous action${actionsCount === 1 ? '' : 's'})
          </div>

          <div class="memory-meta-row">
            <div class="memory-meta-stats">
              <span class="memory-stat-pill success" title="Workflow execution success rate">
                ✓ ${rate}% Success
              </span>
              <span class="memory-stat-pill reuse" title="Number of times replayed">
                🔁 ${reuseCount} reuses
              </span>
            </div>
            <span title="Last executed timestamp">Last: ${lastRunText}</span>
          </div>
        </div>
      `;
    });

    workflowMemoryList.innerHTML = cardsHtml;

    // Attach individual delete listeners
    workflowMemoryList.querySelectorAll(".btn-delete-mem").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const memId = btn.getAttribute("data-id");
        if (!memId) return;
        btn.disabled = true;

        if (currentUser && authTokens && authTokens.access_token) {
          try {
            const resp = await fetch(`${AUTH_API_BASE}/user/memory/${memId}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${authTokens.access_token}` }
            });
            if (resp.ok) {
              cachedWorkflowMemories = cachedWorkflowMemories.filter(m => m.id !== memId);
              updateMemoryStatistics(cachedWorkflowMemories);
              renderWorkflowMemory(cachedWorkflowMemories);
            }
          } catch (err) {
            console.warn("Delete workflow memory error:", err);
          }
        } else {
          cachedWorkflowMemories = cachedWorkflowMemories.filter(m => m.id !== memId);
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            await new Promise(res => chrome.storage.local.set({ "netsurf_guest_workflow_memory": cachedWorkflowMemories }, res));
          } else {
            localStorage.setItem("netsurf_guest_workflow_memory", JSON.stringify(cachedWorkflowMemories));
          }
          updateMemoryStatistics(cachedWorkflowMemories);
          renderWorkflowMemory(cachedWorkflowMemories);
        }
      });
    });
  }

  // Master Toggle: Enable / Disable Workflow Memory Reuse
  if (toggleMemoryReuse) {
    toggleMemoryReuse.addEventListener("change", async () => {
      const isEnabled = toggleMemoryReuse.checked;
      if (currentUser && authTokens && authTokens.access_token) {
        try {
          await fetch(`${AUTH_API_BASE}/user/preferences`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${authTokens.access_token}`
            },
            body: JSON.stringify({ enable_workflow_memory: isEnabled })
          });
        } catch (e) {
          console.warn("Failed to update enable_workflow_memory:", e);
        }
      }
    });
  }

  // Clear All Memory button
  if (btnClearAllMemory) {
    btnClearAllMemory.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete all learned workflow memory patterns?")) return;

      if (currentUser && authTokens && authTokens.access_token) {
        try {
          const resp = await fetch(`${AUTH_API_BASE}/user/memory`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${authTokens.access_token}` }
          });
          if (resp.ok) {
            cachedWorkflowMemories = [];
            updateMemoryStatistics([]);
            renderWorkflowMemory([]);
          }
        } catch (e) {
          console.warn("Clear memory error:", e);
        }
      } else {
        cachedWorkflowMemories = [];
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          await new Promise(res => chrome.storage.local.remove(["netsurf_guest_workflow_memory"], res));
        } else {
          localStorage.removeItem("netsurf_guest_workflow_memory");
        }
        updateMemoryStatistics([]);
        renderWorkflowMemory([]);
      }
    });
  }

  // Real-time memory pattern search filter
  if (memorySearchInput) {
    memorySearchInput.addEventListener("input", () => {
      renderWorkflowMemory(cachedWorkflowMemories);
    });
  }

  // Initialize auth session and load preferences & memory
  initAuth().then(() => {
    loadUserPreferences();
    loadWorkflowMemory();
  });

  // Handle all external link clicks in sidepanel cleanly via chrome.tabs.create
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (link && link.href && (link.href.startsWith("http://") || link.href.startsWith("https://"))) {
      e.preventDefault();
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: link.href });
      } else {
        window.open(link.href, "_blank", "noopener,noreferrer");
      }
    }
  });
});
