# Phase 22-02 Summary — Brave Search BFF Service + web_search NLU Routing

**Date:** 2026-04-02  
**Commit:** 1448b7a  
**Status:** ✅ Complete

---

## What Was Done

### Task 1: braveSearchService.js — BFF-side Brave Search wrapper

Created `banking_api_server/services/braveSearchService.js`:
- Reads `process.env.BRAVE_SEARCH_API_KEY` server-side only (OWASP A3 compliant)
- Exports `search(query, {count=5})` — calls `https://api.search.brave.com/res/v1/web/search`
- Uses `X-Subscription-Token` header; returns `{query, results: [{title, url, description}]}`
- Throws typed error objects: `{code:'BRAVE_NOT_CONFIGURED'}` and `{code:'BRAVE_API_ERROR'}`
- Exports `isConfigured()` — returns true if key is set

### Task 2: NLU web_search routing

**groqNlIntent.js + geminiNlIntent.js:**
- Added `web_search` action examples to system prompt:
  - `"search for PingOne token exchange"` → `{"kind":"banking","banking":{"action":"web_search","query":"PingOne token exchange"}}`
  - `"find information about RFC 8693"` → `{"kind":"banking","banking":{"action":"web_search","query":"RFC 8693"}}`

**nlIntentParser.js:**
- Added pattern in `parseBanking` — detects search/find/what-is/tell-me-about phrases that don't match banking or OAuth terms
- Returns `{kind:'banking', banking:{action:'web_search', query:message}}`

**bankingAgentNl.js:**
- Added `GET /api/banking-agent/search?q=...` endpoint routing to braveSearchService
- Returns `{ok:true, query, results:[...]}` or `{ok:false, error:'BRAVE_NOT_CONFIGURED', message}`

**BankingAgent.js:**
- Added `case 'web_search':` to `runAction` switch (before the `default: throw`)
- Fetches `/api/banking-agent/search` with encoded query
- Handles `BRAVE_NOT_CONFIGURED` gracefully (user-friendly not-configured message)
- Formats results as numbered list; calls `addMessage` + `setIsExpanded(true)`
- Chip `brave_search` shows via `getToolStepsForAction('web_search')` pre-wired in 22-01

**Note:** `BankingAgent.js` was not in the original plan's `files_modified` but is required for end-to-end execution (the NLU parse returns an action intent; execution of that action must happen in the UI's `runAction` switch). This is an intentional inclusion to make the feature complete.

### .env.example
Added:
```
# GROQ_API_KEY=          # Groq LLM
# GROQ_MODEL=llama-3.1-8b-instant
# BRAVE_SEARCH_API_KEY=  # Brave Search for web_search agent action
```

---

## Files Changed

| File | Change |
|------|--------|
| `banking_api_server/services/braveSearchService.js` | NEW — Brave Search BFF wrapper |
| `banking_api_server/routes/bankingAgentNl.js` | +GET /search endpoint |
| `banking_api_server/services/groqNlIntent.js` | +web_search examples in system prompt |
| `banking_api_server/services/geminiNlIntent.js` | +web_search examples in system prompt |
| `banking_api_server/services/nlIntentParser.js` | +web_search heuristic pattern |
| `banking_api_ui/src/components/BankingAgent.js` | +case 'web_search' in runAction |
| `banking_api_server/.env.example` | +GROQ_API_KEY, BRAVE_SEARCH_API_KEY |

---

## Verification

- `node -e "const s = require('./braveSearchService.js'); console.log(typeof s.search, typeof s.isConfigured)"` → `function function` ✅
- `node -e "require('./bankingAgentNl.js')"` → no errors ✅
- `node -e "require('./groqNlIntent.js'); require('./nlIntentParser.js')"` → no errors ✅
- `cd banking_api_ui && npm run build` → exit 0, +283 B gzip ✅

---

## Must-Haves Status

- [x] Brave Search is called from the BFF (BRAVE_SEARCH_API_KEY server-side only)
- [x] NL query "search for X" routes to web_search action (Groq, Gemini, and heuristic)
- [x] web_search returns formatted results via standard agent response
- [x] brave_search chip appears in UI when web_search action executes
- [x] When BRAVE_SEARCH_API_KEY not set, web_search returns helpful not-configured message
