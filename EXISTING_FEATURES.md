# NETSURF — Existing Features Inventory

**Date:** 2026-11-21  
**Auditor:** Senior Software Architect  
**Scope:** Complete functional inventory across the Chrome Extension MV3, FastAPI Reasoning Backend, and Legacy Modules.

---

## 1. Chrome Extension (MV3) — User-Facing Features

The Chrome Extension is the primary user interface and runtime engine for NetSurf. All extension features operate in [extension/](file:///d:/Netsurf/extension/).

### 1.1 Side Panel User Interface (`sidepanel.html`, `sidepanel.js`, `sidepanel.css`)
- **Docked Side Panel Console:** Runs as an unobtrusive companion directly alongside active browser tabs using Chrome's native Side Panel API (`chrome.sidePanel`).
- **Real-Time Backend Status Badge:** Shows live health status (`Connected` / `Connecting...` / `Offline`) by polling `GET /health` on the FastAPI backend.
- **Active Tab Context Card:** Displays the favicon, title, and hostname of the currently focused tab, updating automatically when tabs switch or navigate.
- **Agent Prompt & Instructions Input:** Multiline textarea with `Ctrl + Enter` execution shortcut, dynamic auto-expansion, and quick clear button.
- **Quick Intent Chips:** One-click shortcuts for everyday browsing patterns:
  - 📝 **Summarize Page:** In-depth page analysis and bulleted takeaways on the active tab without navigating away.
  - 📊 **Extract Data:** Scrapes records, cards, and tables into a clean downloadable structure.
  - ✍️ **Autofill Form:** Triggers form field detection and autofill assistance.
  - 🔍 **Find & Click:** Locates and interacts with navigation or search controls.
  - ❓ **Page Q&A:** Synthesizes answers directly from page content.
- **Dual Progress Tracking Counters:** Displays both `Workflow phases: X/Y` and `Browser actions: A/B` alongside a live state badge (`Ready`, `Running`, `Retrying`, `Success`, `Error`).
- **Structured Execution Plan Accordion:** Expandable/collapsible checklist displaying planned phases and individual actions with dynamic status icons (`⏳ Pending`, `🔄 Running`, `✓ Completed`, `⏭ Skipped`, `✗ Failed`).
- **Interactive Three-Tab Workspace:**
  1. **Agent Stream Tab:** Chronological action log stream displaying thoughts, actions, verification outcomes, and rich markdown answers.
  2. **Extracted Data Tab:** Searchable data grid displaying structured records with live text filter, record count badge, 📋 **Copy JSON**, and 📥 **Export CSV** buttons.
  3. **Elements Inspector Tab:** Interactive DOM viewer listing all indexed elements on the page with tags, stable numeric IDs, visibility flags, text labels, and a live search filter.

### 1.2 On-Page HUD & Visual Action Spotlighting (`content_script.js`)
- **Live In-Page Agent HUD:** Floating status card injected into the page displaying what the agent is currently doing (e.g., `⚡ Autofilling form...`, `Clicking [#12] "Submit"`, `Scanning page (down 500px)...`). Automatically dismisses when tasks finish.
- **Visual Action Spotlight:** Highlights targeted elements with a glowing cyan animated outline and badge (`Click [#ID]`, `Typing Query`) before interaction.
- **DOM Vision Lens (Numeric Tags):** Toggled via the 👁️ toolbar button. Injects persistent numbered badges on all interactive buttons, links, inputs, and controls for explainability and inspection.

### 1.3 Identity & Profile Vault (`profiles_vault.js`)
- **Multiple Personas & Identity Management:** Stores named profiles (e.g., "Work", "Personal") in `chrome.storage.local`.
- **Profile Fields Supported:** Full name, first name, last name, middle initial, honorific title, company, job title, address line 1, address line 2, city, state, country, postal zip code, email, work phone, cell phone, website.
- **Default Profile Designation:** Allows designating a primary profile for 1-click autofill.
- **Prompt Data Extraction Banner:** Detects when a user types form details (name, email, address) into the natural language prompt and offers a 1-click **"💾 Save to Vault"** button to store them permanently.
- **Vault Management Modal:** In-extension dialog to create, edit, delete, export, and import profiles as JSON.

### 1.4 High-Speed Semantic Autofill Engine (`semantic_autofill.js`)
- **1-Click Batch Autofill:** Fills complete multi-field forms instantly without requiring slow individual LLM step queries per field.
- **22-Field Canonical Semantic Dictionary:** Maps arbitrary field names, IDs, placeholders, labels, and ARIA attributes to standard fields.
- **Contextual Field Inspection:** Gathers text from `<label for="...">`, wrapping `<label>`, placeholder, title, ARIA label, preceding siblings, and table headers.
- **React Synthetic Event Dispatching:** Uses prototype property setters (`Object.getOwnPropertyDescriptor.set`) and fires `input` and `change` events so React, Vue, and Angular controlled inputs accept the values.

### 1.5 Human Approval Safety Gate Modal (`sidepanel.html`)
- **Consequential Action Interception:** Pauses execution whenever the agent attempts purchases, checkout, data deletion, or sensitive typing.
- **Modal Dialog:** Highlights the exact target button, input, or action parameters with a clear explanation of why approval is required.
- **Dual Outcomes:** User can click **"✓ Approve Action"** to execute, or **"✕ Reject & Halt"** to immediately cancel.

### 1.6 Data Extraction & RFC-4180 CSV Export (`content_script.js`, `agent_loop.js`)
- **Multi-Source Scraping:** Automatically extracts records from e-commerce product cards, search engine result listings, HTML tables, or article heading sections.
- **Mandatory Source URL Preservation:** Enforces `record.source_url = currentUrl` on every extracted record.
- **RFC-4180 CSV Export:** Exports with double-quote escaping (`""`), line breaks, and UTF-8 BOM (`\uFEFF`) for compatibility with Excel and data tools.

---

## 2. FastAPI Reasoning Backend — Core Features

The backend runs in [fastapi_backend/](file:///d:/Netsurf/fastapi_backend/) on Port 8000.

### 2.1 Structured Plan Generation (`POST /agent/plan`)
- Evaluates the user goal and initial DOM observation.
- Employs Google GenAI SDK (`google-genai`) with structured JSON schema output to decompose goals into phases, actions, and criteria.
- **Deterministic Domain Builders:** Provides fallback structured plans tailored for:
  - Page Summarization and Q&A on active tab.
  - Multi-platform shopping search and spec comparison.
  - Fast batch semantic form filling.
  - External website navigation.

### 2.2 Next-Step Reasoning & Action Binding (`POST /agent/step`)
- Receives the execution history, current DOM observation, and active planned task.
- Queries Gemini with quarantined observation text or applies local action binding against DOM elements.
- Binds element IDs dynamically based on visible text, tags, and roles.
- Checks approval gate heuristics and CAPTCHA challenge patterns.

### 2.3 Comprehensive Output Synthesis & Link Enrichment (`planner.py`)
- **Rich Markdown Formatting:** Synthesizes final answers with markdown comparison tables (`| Product | Price & Store Link | Key Specs | Highlights | Trade-offs |`).
- **Deep Store URL Enrichment:** Transforms hallucinated or generic store URLs into verified, clickable search URLs for 14 major retail platforms (Amazon, Flipkart, Cashify, Croma, Reliance Digital, Vijay Sales, Booking.com, MakeMyTrip, Agoda, etc.).

### 2.4 Action Outcome Verifier (`POST /agent/verify`)
- Compares pre-action and post-action DOM states:
  - **`navigate`:** Verifies URL transition to destination.
  - **`click`:** Verifies navigation, title change, or element count shifts.
  - **`type`:** Verifies input focus and value dispatch.
  - **`extract`:** Verifies that records contain non-empty field values.
  - **`scroll` / `wait` / `fill_form`:** Verifies smooth completion and filled field counts.

### 2.5 Strict Completion Validation Gate (`POST /agent/validate_completion`)
- Evaluates overall task status:
  - Confirms zero pending required actions.
  - Validates minimum extracted record counts (`min_records`).
  - Confirms required fields are present and non-empty.
  - Confirms all records preserve `source_url`.
  - Confirms export was generated if required.
  - Emits final status: `"completed"`, `"partial"`, or `"failed"`.

---

## 3. Comparison with Legacy Node.js Backend Features

The Node.js backend (`backend/src/`) contains several specialized comparison algorithms that were developed for the earlier standalone prototype.

| Capability | In Chrome Extension / FastAPI Stack | In Legacy Node.js Stack | Architectural Status |
| :--- | :--- | :--- | :--- |
| **Agent Execution Loop** | In extension (`agent_loop.js`) | In Node server (`executor.js`) | Extension loop is the primary architecture. |
| **Browser Driver** | Live Chrome tab via Content Script | Server-side Headless Playwright | Extension content script is the primary driver. |
| **Form Autofill** | `NetSurfAutofill` (22 fields, 1-click batch) | Basic Playwright input typing | Extension engine is significantly more advanced. |
| **Profile Management** | `NetSurfProfilesVault` in `chrome.storage.local` | SQLite `user_profile` table | Extension storage is native and self-contained. |
| **Safety & Approval Gate** | `safety.py` + Side Panel Modal | `safety.js` (approval heuristics) | FastAPI + Side Panel is the primary safety gate. |
| **Job Relevance Ranking** | Not currently implemented | `validateJobRelevance` & `compareAndRankJobs` | **High-value algorithm:** candidate for migration into FastAPI. |
| **Train Schedule Comparison**| Not currently implemented | `buildTrainComparison` (Delhi-Patna routes) | Algorithm exists, but relies on hardcoded data. |
| **Hardware Spec Comparison** | Prompt-driven in Gemini `planner.py` | `compareAndRankProducts` (Price & RAM filter)| Algorithmic filtering can augment Gemini output. |
| **Search Engine Web API** | Direct browser navigation | Tavily and Brave Search API clients | Extension uses native web navigation. |
| **Long-Term Memory** | History passed in request context | SQLite `memory` table (plan templates) | Stateless context is current architecture. |
