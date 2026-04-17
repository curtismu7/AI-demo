---
created: "2026-04-02T10:25:47.675Z"
title: "Phase 22 agent audit: Brave + internal routing, grouped+dynamic chips, coverage + observability"
area: agent
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_server/services/groqNlIntent.js
  - banking_api_server/services/geminiNlIntent.js
  - banking_api_server/services/nlIntentParser.js
  - banking_mcp_server/src/tools/BankingToolRegistry.ts
---

## Problem

All three Phase 22 gray area decisions are now locked. Full scope defined below.

---

### GA1 — Search scope (ANSWER: C — Both, Groq routes by intent)

**Brave Search** = external web queries (financial news, fraud alerts, market rates, product research)
**Internal routing** = app data queries (transaction history, account lookup, balance checks)
**Routing logic**: Groq NLU decides which backend to use based on parsed intent:
- `"search transaction history"` → internal banking API (no Brave call)
- `"search for fraud news"` / `"latest APY rates"` / `"what is token exchange"` → Brave external search
- Groq SYSTEM prompt needs a new `search` action with `{"target": "brave" | "internal", "query": string}`
- New `BRAVE_SEARCH_API_KEY` env var needed; new `braveSearch.js` service in `banking_api_server/services/`
- New route or extend `bankingAgentNl.js` to handle `search` action dispatch

---

### GA2 — Chip strategy (ANSWER: B + C — Grouped rows AND dynamic)

**B: Grouped chip rows** — chips organized into visual categories:
- `💰 Banking` row: "Show my accounts", "Check balance", "Recent transactions", "Transfer funds"
- `🔍 Search` row: "Search fraud news", "Current APY rates", "What is token exchange"
- `❓ Learn` row: 3-4 education shortcuts from edu panel topics

**C: Dynamic chips** — chip content adapts to user's actual data:
- If user has 4 accounts → Banking row shows account-specific chips: "Checking balance", "Savings balance", "Investment balance", "Car loan balance"
- If user has no investment account → Investment chip hidden
- `generateFakeAccounts()` fallback currently only shows checking + savings — must be expanded to include investment/car loan/savings matching Demo Data page configuration

**Implementation notes:**
- Replace flat `SUGGESTIONS_CUSTOMER` (3 chips) with grouped structure: `CHIP_GROUPS_CUSTOMER`
- Dynamic chips require account list — call `get_my_accounts` at agent mount or slot into existing `liveAccounts` state
- Admin chips similarly — grouped into `💼 Admin`, `🔧 Config`, `👤 User Mgmt` rows

---

### GA3 — Enterprise-grade definition (ANSWER: C — Both coverage + observability)

**Full coverage** = every tool, action, and chip has a working end-to-end path with no silent failures:
- All 7 MCP tools callable via natural language AND chips
- All Groq-routed actions tested with edge cases (no account, empty balance, bad transfer)
- Brave search wired end-to-end (key present → result → formatted response)
- `generateFakeAccounts()` exposes the same account types as Demo Data page config

**Observability signals** = customers can SEE it's production-ready:
- Agent typing indicator during Groq/Brave calls
- "Called MCP tool: get_my_accounts" visible in agent response or expandable trace
- Error states with specific messages (not just "something went wrong")
- Token exchange chain shown when agent uses delegated access (e.g., "Acting on behalf of [user] via token exchange")
- Latency indicator for long AI calls

**Definition of done:** A customer watching a live demo should be able to see every capability listed, understand what's happening under the hood, and trust it runs in production.
