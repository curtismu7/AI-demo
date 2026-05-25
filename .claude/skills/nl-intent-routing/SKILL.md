---
name: nl-intent-routing
description: >
  Architecture guide and debugging playbook for the NL intent routing pipeline in this repo.
  USE THIS SKILL whenever: a user message routes to the wrong action (misrouting bug), an intent
  falls through to a canned "I didn't catch that" reply, a new heuristic phrase isn't being matched,
  the wrong LLM provider is being selected, a system prompt change is needed for a vertical,
  sanitize is rejecting a valid LLM response, or anything touches geminiNlIntent.js / nlIntentParser.js /
  nlIntentSanitize.js / llmProviderResolver.js / HELIX_AGENT_DIRECTIVES.json.
  Also use when someone asks "how does the agent interpret messages" or "why did the chatbot do X".
  DO NOT USE FOR: OAuth/MCP/token flows, UI component bugs, adding a new vertical (use add-vertical skill).
---

# NL Intent Routing — Architecture & Debug Playbook

The agent interprets user messages through a **three-layer pipeline**: heuristic → LLM → sanitize.
Understanding which layer a failure lives in is the key to fixing it quickly.

---

## Pipeline Overview

```
User message
    │
    ▼
[1] HEURISTIC  (nlIntentParser.js)
    • Instant, deterministic, no API calls
    • Runs ALWAYS — even in "LLM-only" mode
    • Returns kind:'banking' | kind:'education' | kind:'none'
    │
    ├─ Matched (kind != 'none') AND ff_heuristic_enabled=true  → DONE, return to UI
    │
    ▼
[2] LLM  (geminiNlIntent.js)
    • Provider selected by llmProviderResolver.js
    • System prompt built from HELIX_AGENT_DIRECTIVES.json + active vertical theme
    • Providers: helix (default) → ollama (if configured) → openai/anthropic (pass-through)
    │
    ├─ Helix selected → callHelixAgent → tryParse → retry-on-refusal
    ├─ Ollama selected → fetch /api/chat → parse JSON response
    │
    ▼
[3] SANITIZE  (nlIntentSanitize.js)
    • Validates LLM JSON: kind must be 'banking' | 'education' | 'none'
    • Banking: action must be in VALID_BANKING_ACTIONS
    • Education: panel must be in VALID_EDU_PANELS
    • Rejects bad LLM output → falls back to heuristic result
    │
    ▼
Result returned to route handler (kind + action/panel)
```

---

## File Map

| File | Owns |
|---|---|
| `demo_api_server/services/nlIntentParser.js` | Heuristic rules (regex), EDU constants, CAPABILITY_CATALOG |
| `demo_api_server/services/geminiNlIntent.js` | Pipeline orchestration, Ollama calls, Helix calls, `buildSystemWithCtx` |
| `demo_api_server/services/nlIntentSanitize.js` | Post-LLM validation; `VALID_BANKING_ACTIONS`, `VALID_EDU_PANELS` allowlists |
| `demo_api_server/services/llmProviderResolver.js` | Canonical provider selection (Helix default; Ollama only if configured) |
| `demo_api_server/services/verticalConfigService.js` | `getActiveVertical()` — reads `configStore` key `active_vertical` |
| `docs/HELIX_AGENT_DIRECTIVES.json` | System prompt base + per-vertical theme overrides |

---

## Debugging Misrouting

**Step 1 — identify the layer.**

Check the BFF logs (`/tmp/demo-api.log`). Look for:
- `[nlIntent] Ollama error:` or `[nlIntent] Helix error:` → LLM layer failed
- `[nlIntent] Ollama output rejected → heuristic:` + a `reason` → sanitize rejected the LLM response
- `[nlIntent] Helix returned non-JSON or refusal` → Helix returned prose, retry was attempted
- No log at all → heuristic matched and returned immediately (layer 1)

The `source` field in the API response tells you which layer answered:
```
source: 'heuristic'      → nlIntentParser.js matched
source: 'ollama'         → Ollama parsed and sanitize passed
source: 'helix'          → Helix parsed and sanitize passed
source: 'helix_fallback' → conversational Helix answer (general knowledge, not routing)
```

**Step 2 — trace the failure in that layer.**

### Heuristic matched the wrong thing (or matched when it shouldn't)
- The heuristic runs before the LLM. If it matches, the LLM never runs.
- `nlIntentParser.js` has two exported functions: `parseEducation(t)` and `parseBanking(t)`, called in that order.
- `norm(s)` strips punctuation and lowercases — test your phrase through `norm()` mentally before checking regex.
- Education rules run first. If a phrase accidentally matches an EDU regex, it will never reach banking.
- Common trap: regex like `/\b(mcp)\b/` catches "list mcp tools" — the banking path guards against this with `!/\b(list|show|get)\b/`.

### LLM routed to the wrong action
- The system prompt (`HELIX_AGENT_DIRECTIVES.json` base + vertical theme) is the LLM's decision tree.
- Run `buildSystem(activeVertical)` mentally: base + `THEME_OVERRIDES[vertical]`.
- Check the ACTION VOCABULARY section in the base prompt — the phrase might be ambiguous between two actions.
- Check the retry-on-refusal path: if Helix returns prose, `geminiNlIntent.js` nudges it with a JSON-only retry. If the retry still fails, it falls through to Ollama or the heuristic.

### Sanitize rejected a valid response
- The `reason` in the log tells you which check failed:
  - `missing_kind` — LLM returned something that's not a JSON object with a `kind` field
  - `invalid_banking_action` — action not in `VALID_BANKING_ACTIONS`
  - `invalid_education_panel` — panel not in `VALID_EDU_PANELS`
  - `balance_plural_without_account_id` — "balances" with no accountId → rerouted to `accounts`
  - `invalid_account_type_name` — LLM used "credit card" or similar unsupported account type
- Fix: either add the action/panel to the allowlist (if it's a real new capability), or fix the system prompt so the LLM stops emitting the bad value.

### Provider not being selected correctly
- `llmProviderResolver.js` is the single source of truth. No other file may inline a provider default.
- Ollama is only used when `OLLAMA_BASE_URL` is set OR `langchainConfig.ollama_base_url` is provided — otherwise it silently falls back to Helix.
- `openai` and `anthropic` are pass-through — the agent service (`:3006`) validates credentials and fails fast.

---

## Tuning the System Prompt (HELIX_AGENT_DIRECTIVES.json)

The file has two sections:

```json
{
  "base": "...(shared system prompt for all verticals)...",
  "themes": {
    "banking": null,
    "admin": "THEME OVERRIDE — ADMIN CONSOLE:\n...",
    "healthcare": "THEME OVERRIDE — CARECONNECT:\n...",
    "retail": "THEME OVERRIDE — GREAT BUY:\n...",
    "sporting-goods": "THEME OVERRIDE — SUPER SPORTS:\n..."
  }
}
```

`buildSystem(vertical)` in `geminiNlIntent.js` concatenates `base + themes[vertical]` (empty string if null).

**When to edit the base prompt:**
- Adding a new banking action that all verticals should support
- Fixing a misclassification that affects all themes (e.g., LLM keeps confusing `transactions` with `spending_summary`)
- Changing the refusal policy or output shape

**When to edit a theme override:**
- The misrouting only happens in one vertical (e.g., healthcare maps "appointment" → transactions, retail maps "orders" → accounts)
- A vertical should restrict or expand the allowed action set

**When adding a new action to the base prompt:**
1. Add it to `VALID_BANKING_ACTIONS` in `nlIntentSanitize.js`
2. Add an example shape to the ALLOWED OUTPUT SHAPES section in the base prompt
3. Add a vocabulary entry in the ACTION VOCABULARY section
4. Consider adding a heuristic rule in `nlIntentParser.js` for the most common phrase

**Regression risk:** Any change to `nlIntentParser.js` or `nlIntentSanitize.js` must be reflected in `REGRESSION_PLAN.md` §4. These files are in the §1 protected list — read §0–1 before editing.

---

## Adding a Heuristic Rule

Heuristic rules live in `nlIntentParser.js` in two functions:
- `parseEducation(t)` — education panel routing (always checked first)
- `parseBanking(t)` — banking action routing

`t` is already normalized via `norm(s)`: lowercased, punctuation stripped to spaces, whitespace collapsed.

Pattern for a new banking rule:
```js
// In parseBanking(t) — place ABOVE the catch-all 'transactions' check
if (/\b(your phrase|alternate phrase)\b/.test(t)) {
  return { kind: 'banking', banking: { action: 'your_action', params: { /* if needed */ } } };
}
```

Pattern for a new education rule:
```js
// In parseEducation(t) — order matters; more specific rules go above broader ones
if (/\b(your term|rfc[- ]?NNNN)\b/.test(t)) {
  return { kind: 'education', education: { panel: EDU.YOUR_PANEL, tab: 'what' } };
}
```

If you're adding a new EDU panel constant, add it to the `EDU` object at the top of the file **and** to `VALID_EDU_PANELS` in `nlIntentSanitize.js`. Both must be in sync or sanitize will reject valid LLM responses for that panel.

**Key ordering rules in parseBanking:**
1. `mortgage_demo` check must come before the generic `balance` check (otherwise "mortgage balance" routes to balance)
2. `biggest_purchase` check must come before `transactions` (both can match "what's my biggest transaction")
3. `transfer`/`deposit`/`withdraw` must come after `accounts` and `balance`

---

## Vertical-Aware Routing

`getActiveVertical()` reads `configStore.getEffective('active_vertical')` — a cheap in-memory lookup.

`activeVertical` is threaded through the full pipeline:
- `parseHeuristic(message, activeVertical)` — heuristic can restrict/expand rules per vertical
- `buildSystemWithCtx(activeVertical, context)` — system prompt varies by vertical
- `parseWithOllama(message, context, activeVertical)` — Ollama uses the same vertical-aware prompt

If a vertical-specific phrase isn't routing correctly, check whether the theme override in `HELIX_AGENT_DIRECTIVES.json` has a CHIP VOCABULARY or TERMINOLOGY MAP section for that vertical. These sections directly tell the LLM how to map domain language (e.g. "appointments" → `transactions`).

---

## Quick Checklist: "Why did message X route wrong?"

1. **Check logs** — `grep '\[nlIntent\]' /tmp/demo-api.log | tail -20`
2. **Check `source`** in the API response — which layer answered?
3. **If heuristic:** run `norm(message)` mentally, trace `parseEducation` then `parseBanking` in order
4. **If LLM:** check the system prompt for the active vertical — is the phrase in ACTION VOCABULARY?
5. **If sanitize rejected:** check the `reason` — is the action/panel missing from the allowlist?
6. **If provider wrong:** check `llmProviderResolver.js` — is Ollama configured?
7. **Before changing parser/sanitize:** read `REGRESSION_PLAN.md` §0–1 and log the fix in §4
