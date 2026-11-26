# NETSURF — Adaptive Agentic Browser for Intelligent Web Task Automation

> **Milestone:** Final Production Release (Phases 1-7 Implemented & Verified)  
> **Architecture:** Chrome Extension MV3 (Browser Automation & Agent Loop) + FastAPI Backend (Reasoning Brain & Deterministic Algorithms) + SQLite Database  
> **Test Status:** 106/106 Tests Passed (100% Pass Rate)

---

## 1. System Architecture

NetSurf operates on a strict **Observe → Reason → Act → Verify → Recover → Learn** agent loop.
Execution happens directly inside the **Chrome Extension** (which natively owns and controls the active browser tab), while the **FastAPI backend** acts as the stateless reasoning brain and deterministic recommendation engine.

```
┌────────────────────────────────────────────────────────┐
│             CHROME EXTENSION (MV3)                     │
│                                                        │
│  ┌──────────────────┐       ┌───────────────────────┐  │
│  │   Side Panel     │ ◄───► │    agent_loop.js      │  │
│  │ (UI, Status, Log)│       │ (Orchestration Engine)│  │
│  └──────────────────┘       └──────────┬────────────┘  │
│                                        │               │
│                               Observe  │ Execute       │
│                               DOM      │ Actions       │
│                                        ▼               │
│                             ┌───────────────────────┐  │
│                             │   content_script.js   │  │
│                             │(Indexed DOM, Actions) │  │
│                             └───────────────────────┘  │
└────────────────────────────────────────┬───────────────┘
                                         │
                   POST /agent/plan      │ POST /agent/step
                   {goal, observation}   │ {goal, history, observation}
                                         ▼
┌────────────────────────────────────────────────────────┐
│             FASTAPI BACKEND (Stateless Brain)          │
│                                                        │
│  ┌───────────────┐   ┌───────────────────────────────┐ │
│  │  safety.py    │   │         planner.py            │ │
│  │(Allowlist,    │   │ (Gemini 2.0 / 3.5 Flash       │ │
│  │ Approval Gate)│   │  Structured JSON via SDK)     │ │
│  └───────┬───────┘   └───────────────┬───────────────┘ │
│          │                           │                 │
│          ├───────────────────────────┤                 │
│          ▼                           ▼                 │
│  ┌───────────────┐   ┌───────────────────────────────┐ │
│  │ recommendation│   │       price_tracker.py        │ │
│  │(Deterministic │   │ (Scheduled Checks, Anti-Bot   │ │
│  │ Weighted Rank)│   │  Alert Deduplication)         │ │
│  └───────┬───────┘   └───────────────┬───────────────┘ │
│          │                           │                 │
│          ▼                           ▼                 │
│  ┌───────────────────────────────────────────────────┐ │
│  │      SQLite Database (Strict User Isolation)      │ │
│  │  (users, tokens, prefs, memory, saved, history)   │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## 2. Supported Actions (Strict Allowlist)

Both the backend and extension enforce this strict allowlist:

| Action | Parameters | Description |
| :--- | :--- | :--- |
| `navigate` | `url` | Navigates to an `http` or `https` URL (non-web schemes blocked). |
| `click` | `id` | Clicks an interactive DOM element using its stable numeric ID. |
| `type` | `id`, `text`, `submit?` | Inputs text into a target field with native React event dispatching. |
| `fill_form`| `data`, `submit?` | Autofills multiple form fields from encrypted user persona vault. |
| `scroll` | `direction`, `amount` | Smoothly scrolls viewport (`up`, `down`, `top`, `bottom`). |
| `wait` | `ms` | Bounded wait (`ms <= 3000`). |
| `extract` | `fields` | Extracts normalized records with `source_url`. |
| `ask_user` | `question` | Solicits clarification when crucial parameters are absent. |
| `done` | `summary` | Concludes task with verified outcome summary. |
| `fail` | `reason` | Safely halts when obstacles (e.g. CAPTCHAs) prevent completion. |

---

## 3. Implemented Capabilities Across Phases

- **Phase 1: Robust Browser Automation & Execution Engine**  
  Observe-Reason-Act loop with numeric vision tags, postcondition verifier, and 15-action retry recovery.
- **Phase 2: Multi-User Authentication & Encrypted Vault**  
  Salted password hashing (Bcrypt/Argon2), JWT token rotation, session revocation, and WebCrypto AES-GCM vault.
- **Phase 3: Personalized AI Preferences**  
  Personalized shopping and travel constraints, priority overrides, and cross-user data isolation.
- **Phase 4: Evidence-Based Extraction & Deterministic Recommendation Engine**  
  Deterministic price/spec normalization, hard budget & RAM filters, and category-weighted ranking (Gemini does not hallucinate scores).
- **Phase 5: Explainable AI & Adaptive Workflow Memory**  
  Action sequence templatization, parameter substitution (e.g. Jaipur $\rightarrow$ Udaipur), execution statistics, and adaptive error recovery.
- **Phase 6: Saved Items Library & Deterministic Price Tracking**  
  Background scheduled checks (`chrome.alarms`), price observation timeline, anti-bot detection, and deduplicated Chrome desktop alerts.
- **Phase 7: Complete Security Audit & End-to-End Integration Testing**  
  API rate limiting, security headers, CORS regex, SQL injection immunity, prompt injection quarantine, and 11-step end-to-end integration test.

---

## 4. Quick Start (Under 5 Minutes)

### Step 1: Configure Environment
Copy `.env.example` to `.env` and set your Google Gemini API key:
```bash
copy .env.example .env
```
Ensure `.env` contains:
```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash-lite
PORT=8000
```

### Step 2: Start the FastAPI Backend
```bash
python -m uvicorn fastapi_backend.main:app --host 127.0.0.1 --port 8000 --reload
```
Verify backend health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### Step 3: Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `extension/` directory.
4. Click the **Netsurf** icon in the Chrome toolbar or open the **Side Panel** to launch the console!

---

## 5. Automated Verification & Test Suite

### Full Automated Test Suite (106 Tests)
```bash
python -m pytest tests/ -v
```

**Real Execution Result:** `106 passed in 101.49s` (**100% Success Rate**)

| Suite | Tests | Result | Focus Area |
| :--- | :---: | :---: | :--- |
| `test_phase7_security_and_e2e.py` | 15 | **PASSED** | Security audit, JWT rotation, headers, injection, 11-step E2E journey |
| `test_price_tracking.py` | 10 | **PASSED** | Saved items, price observations, deduplication, bot guard |
| `test_workflow_memory.py` | 10 | **PASSED** | Adaptive workflow memory, parameter substitution & recovery |
| `test_recommendation.py` | 13 | **PASSED** | Deterministic ranking, spec normalization, hard filters, hotel research |
| `test_preferences.py` | 8 | **PASSED** | User preferences, priority overrides & isolation |
| `test_execution_engine.py` | 8 | **PASSED** | 15-action autonomous execution engine & lifecycle |
| `test_backend.py` | 29 | **PASSED** | Safety allowlists, verifiers, prompt injection defense, approval gates |
| `test_auth.py` | 11 | **PASSED** | Multi-user authentication, password hashing, token rotation |
| `test_daily_tasks.py` | 2 | **PASSED** | Real-world daily e-commerce and research tasks |
| **Total** | **106** | **100%** | **All 7 Phases Verified** |

---

## 6. Security Policies & Guarantees

1. **Human-in-the-Loop Approval:** Actions involving payments, checkout, deletions, or password fields pause execution and require explicit user approval.
2. **Prompt Injection Quarantine:** Untrusted webpage content is encapsulated in `<untrusted_page_observation>` delimiters to prevent prompt override attacks.
3. **Strict URL Restrictions:** Only `http://` and `https://` URLs are permitted.
4. **No CAPTCHA Bypass:** When a bot challenge (Cloudflare, reCAPTCHA, Turnstile) is detected, the agent logs the challenge and pauses rather than attempting fragile bypasses.
5. **Rate Limiting & Headers:** Auth endpoints enforce sliding-window rate limiting (60 req/min). Strict security headers (`nosniff`, `DENY`, `strict-origin`) are injected on every response.
6. **Data Isolation:** Every database operation enforces tenant boundaries via authenticated `user_id`.

---

## 7. Known Limitations

- **Anti-Bot & Security Gates:** NetSurf respects site boundaries and does not bypass CAPTCHAs or Cloudflare Turnstile challenges.
- **Dynamic Canvas / WebGL:** Sites rendered exclusively via WebGL or Canvas without accessible DOM nodes cannot be indexed via standard DOM trees.
- **Autonomous Financial Transactions:** NetSurf will **never** complete an autonomous financial purchase without explicit human approval.

---

## 8. Documentation References

- **Architecture & Security Spec:** [FINAL_ARCHITECTURE.md](FINAL_ARCHITECTURE.md)
- **Phase 6 Saved Items & Tracker:** [PHASE_6_SAVED_ITEMS_AND_PRICE_TRACKING.md](file:///C:/Users/shubh/.gemini/antigravity/brain/46ec54fc-2748-44ef-a224-7ac6e5e9b38c/PHASE_6_SAVED_ITEMS_AND_PRICE_TRACKING.md)
- **Phase 5 Explainable Memory:** [PHASE_5_EXPLAINABLE_AI_AND_ADAPTIVE_WORKFLOW_MEMORY.md](file:///C:/Users/shubh/.gemini/antigravity/brain/46ec54fc-2748-44ef-a224-7ac6e5e9b38c/PHASE_5_EXPLAINABLE_AI_AND_ADAPTIVE_WORKFLOW_MEMORY.md)
- **Phase 4 Recommendation Engine:** [PHASE_4_EVIDENCE_EXTRACTION_AND_RECOMMENDATION.md](file:///C:/Users/shubh/.gemini/antigravity/brain/46ec54fc-2748-44ef-a224-7ac6e5e9b38c/PHASE_4_EVIDENCE_EXTRACTION_AND_RECOMMENDATION.md)
