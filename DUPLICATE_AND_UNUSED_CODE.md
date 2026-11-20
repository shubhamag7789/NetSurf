# NETSURF — Duplicate, Redundant, and Unused Code Audit

**Date:** 2026-11-21  
**Auditor:** Senior Software Architect  
**Purpose:** Identify redundant architectures, dead code, duplicate dependencies, and obsolete artifacts across the NetSurf project.

---

## 1. Executive Summary

NetSurf currently contains two parallel implementations of an agentic browser:
1. **The Modern Manifest V3 Chrome Extension + FastAPI Architecture** (`extension/` + `fastapi_backend/`). This is the target architecture governed by the architectural rules.
2. **The Legacy Standalone Node.js + React Dashboard Architecture** (`backend/` + `frontend/`).

Because the Chrome extension communicates exclusively with FastAPI on Port 8000, the entire `backend/` directory (Node.js/Express, Playwright runner, SQLite database) and `frontend/` directory (React/Vite dashboard) are completely uncalled and unused by the Chrome extension.

---

## 2. Unused Architectures & Modules

### 2.1 The Legacy Node.js Backend (`backend/`)
- **Location:** [backend/](file:///d:/Netsurf/backend/)
- **Total Files:** 15 files, ~175 KB of code + 7.4 MB SQLite database files (`netsurf.db`, `netsurf.db-wal`, `netsurf.db-shm`).
- **Dependencies:** `express`, `playwright`, `better-sqlite3`, `dotenv`, `cors`, `@google/genai`, `@anthropic-ai/sdk`, `uuid`.
- **Reason for Unused Status:**
  - NetSurf's primary interface is the Chrome Side Panel. Browser automation happens inside the user's active Chrome tab via [extension/content_script.js](file:///d:/Netsurf/extension/content_script.js).
  - The Node.js backend attempts to automate the browser using server-side headless Playwright in [backend/src/agent/browser.js](file:///d:/Netsurf/backend/src/agent/browser.js). This creates two conflicting execution models.
  - The extension never issues HTTP requests or WebSocket connections to Port 3000.
- **Valuable Components to Salvage:**
  - The job relevance matching algorithm (`validateJobRelevance` in [backend/src/services/comparisonEngine.js](file:///d:/Netsurf/backend/src/services/comparisonEngine.js)).
  - Product price and constraint filtering (`compareAndRankProducts`).
  - These algorithms should be ported to Python in `fastapi_backend/` and retired from Node.js.

### 2.2 The React Frontend Dashboard (`frontend/`)
- **Location:** [frontend/](file:///d:/Netsurf/frontend/)
- **Total Files:** 16 files, ~430 KB of code.
- **Dependencies:** React 18, Vite, Lucide-React.
- **Reason for Unused Status:**
  - The architectural rules state: *"Chrome Side Panel must remain the primary user interface. No separate user-facing website dashboard. Do not assume the React frontend is required by the extension."*
  - The React app in `frontend/` is a separate website that communicates with the Node.js backend on Port 3000 via Vite's proxy (`/api -> http://localhost:3000`).
  - It is completely disconnected from the Chrome extension.

---

## 3. Duplicate Configuration & Script Files

Several files in `backend/` are direct duplicates of root files:

| File in Root | Duplicate in `backend/` | Purpose | Recommended Resolution |
| :--- | :--- | :--- | :--- |
| `run_fastapi.py` | `backend/run_fastapi.py` | Starts the FastAPI server | Delete `backend/run_fastapi.py` |
| `requirements.txt`| `backend/requirements.txt`| Python dependencies | Delete `backend/requirements.txt` |
| `.env` / `.env.example` | `backend/.env` / `backend/.env.example` | Environment configurations | Consolidate strictly in root |

---

## 4. Hardcoded Mock Data & Synthetic Datasets

The codebase contains several instances of hardcoded mock data that simulate backend intelligence:

### 4.1 Mock Curated Search Results (`backend/src/services/searchService.js`)
- **Function:** `generateCuratedSearchResults(query, count, hadApiKey)` (lines 600–850).
- **Issue:** Returns hardcoded synthetic job listings for "Data Analyst" (Naukri, LinkedIn, Indeed) and "Python Developer" whenever live search API keys (Tavily/Brave) are not configured.
- **Resolution:** Because the Chrome extension navigates real search engines (Google, Wikipedia, Books to Scrape) directly via the active tab, this server-side mock generator is obsolete and can be decommissioned along with the Node.js backend.

### 4.2 Hardcoded Train Route Schedules (`backend/src/services/comparisonEngine.js`)
- **Function:** `buildTrainComparison(criteria)` (lines 165–314).
- **Issue:** Hardcoded details for 4 specific trains between New Delhi (NDLS) and Patna (PNBE) (`Sampoorna Kranti Express`, `Tejas Rajdhani Express`, `Magadh Express`, `Shramjeevi Express`) with static departure times, fares, and durations.
- **Resolution:** Real-time travel inquiries should be handled via dynamic live search and DOM extraction on IRCTC/MakeMyTrip, or synthesized via Gemini with appropriate live data disclaimers.

### 4.3 Hardcoded Personal Profiles in Profile Vault (`extension/profiles_vault.js`)
- **Variable:** `DEFAULT_PROFILES` (lines 19–72).
- **Issue:** Seeds two specific individuals:
  - "Rahul Sharma (Work)" with a physical address in Gurugram, personal email, and phone numbers.
  - "Priya Patel (Personal)" with an address in Bandra West, Mumbai, and phone numbers.
- **Resolution:** Replace with neutral generic placeholder templates (e.g. "Default Work Profile", "Default Personal Profile") with dummy data (`user@example.com`, `+1 555-0100`, `123 Main St`).

---

## 5. Test Suite Discrepancies & Dead Tests

### 5.1 Legacy Node.js Integration Tests (`backend/tests/integration.test.js`)
- Runs 14 integration tests against the legacy Node backend on Port 3000 and requires `demo-site` on Port 3001.
- Does not test the Chrome extension or the FastAPI backend.
- Mark for archival once Node.js backend is retired.

### 5.2 Plan Length Discrepancies in Python Tests
- **[tests/test_daily_tasks.py](file:///d:/Netsurf/tests/test_daily_tasks.py):**
  - Expects `len(plan.phases) == 4` and `len(plan.actions) >= 8`.
  - Currently `build_structured_plan` in [fastapi_backend/planner.py](file:///d:/Netsurf/fastapi_backend/planner.py#L461-L516) generates 3 phases and 5 actions for product research.
- **[tests/test_execution_engine.py](file:///d:/Netsurf/tests/test_execution_engine.py):**
  - Expects a 15-action plan across 4 phases for `books.toscrape.com` extraction tasks (`test_case_1_all_15_actions_succeed`, `test_case_4`, `test_case_6`).
  - Currently `build_structured_plan` generates 3 phases and 5 actions.
- **Resolution:** Reconcile `build_structured_plan` and the test expectations in Phase 1 of the implementation roadmap so that extraction and research plans have consistent phase/action definitions matching the test assertions.

---

## 6. Summary of Redundant Code Removal Plan

```
D:\Netsurf\
├── backend/                       <-- ARCHIVE / DEPRECATE (Legacy server-side Playwright)
│   ├── netsurf.db*                <-- REMOVE (SQLite files totaling ~7.4 MB)
│   ├── run_fastapi.py             <-- REMOVE (Duplicate)
│   ├── requirements.txt           <-- REMOVE (Duplicate)
│   └── src/                       <-- PORT algorithms to FastAPI; then ARCHIVE
├── frontend/                      <-- ARCHIVE / DEPRECATE (Legacy separate web dashboard)
├── create_zip.py                  <-- RETAIN (Project utility)
├── demo-site/                     <-- RETAIN (Useful local test target for forms and checkouts)
├── extension/                     <-- RETAIN & HARDEN (Primary application)
├── fastapi_backend/               <-- RETAIN & EXPAND (Primary reasoning backend)
└── tests/                         <-- RETAIN & FIX (Primary test suite)
```
