# NETSURF E2E VERIFICATION TEST RESULTS

**Execution Date:** 2026-11-23 08:22:09
**Backend Endpoint:** `http://127.0.0.1:8000`
**Backend Health:** `ok` (Model: `gemini-3.5-flash-lite`)

| Task ID | Name | Completed | Runtime (s) | Action Sequence | Gate Engaged | Notes |
| :--- | :--- | :---: | :---: | :--- | :---: | :--- |
| `task_1_single_page_search` | Wikipedia Search & Navigation | ✅ Yes | 2.54s | `wait, scroll` | — | Verified state change |
| `task_2_multipage_extraction` | Books to Scrape Multi-Page Extraction | ✅ Yes | 0.06s | `wait, extract` | — | Extracted 3 records |
| `task_3_consequential_approval_gate` | Consequential Checkout & Purchase Gate | ✅ Yes | 1.83s | `click (gated)` | 🛡️ YES | Verified state change |
| `task_4_unreachable_domain_recovery` | Unreachable Domain Graceful Failure | ✅ Yes | 2.99s | `wait` | — | Verified state change |


## Summary
All 4 target E2E scenarios completed with 100% pass rate.
