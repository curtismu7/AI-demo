# Phase 180: Evaluate and Implement Google Gemma 4 — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Google Gemma 4 as an LLM provider option in the banking demo. Gemma 4 runs locally via Ollama or LM Studio using the existing OpenAI-compatible chat completions API. Includes a quick comparison script to evaluate intent parsing accuracy against existing providers.

</domain>

<decisions>
## Implementation Decisions

### Provider Integration
- **D-01:** Gemma 4 accessed locally via Ollama or LM Studio — both use the OpenAI-compatible `/v1/chat/completions` endpoint
- **D-02:** Support both Ollama (`http://localhost:11434/v1/chat/completions`) and LM Studio as local runtimes — document both options
- **D-03:** No new SDK or API key required — uses same fetch-based pattern as existing LM Studio integration

### Model Selection & Evaluation
- **D-04:** Default model variant: Gemma 4 4B — fast, lightweight, runs on laptops
- **D-05:** Include a quick comparison test script that sends 5-10 banking intents through Gemma vs existing providers (Groq, Anthropic) and logs accuracy/timing results
- **D-06:** Script lives in `banking_api_server/scripts/` — not a runtime dependency

### Fallback Chain Position
- **D-07:** Gemma 4 replaces the LM Studio slot as the default local model — same `LM_STUDIO_BASE_URL` endpoint, just a different model loaded
- **D-08:** Fallback chain remains: Local (Gemma/LM Studio) → Groq → Anthropic → heuristic regex
- **D-09:** `LM_STUDIO_MODEL` env var set to `gemma-4-4b` by default (user can override)

### UI Integration
- **D-10:** Rename "LM Studio" option in LLM dropdown to "Local Model (LM Studio / Ollama)"
- **D-11:** Add a pre-filled dropdown of model options (e.g., `gemma-4-4b`, `llama-3`, `mistral`, `qwen-2.5`) instead of free-text input — user selects model from dropdown
- **D-12:** Selected model name sent to BFF as `LM_STUDIO_MODEL` config value

### Agent's Discretion
- Exact list of pre-filled model names in the dropdown (common local models)
- `.env.example` updates for Gemma/Ollama defaults
- Whether to update `LM_STUDIO_BASE_URL` label in config to mention Ollama

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LLM Provider Chain
- `banking_api_server/services/geminiNlIntent.js` — Main LLM fallback chain (LM Studio → Groq → Anthropic → heuristic). Contains `parseWithLMStudio`, `parseWithGroq`, `parseWithAnthropic`, and the `classifyIntent` orchestrator.
- `banking_api_server/services/groqNlIntent.js` — Groq provider implementation (OpenAI-compatible pattern reference)
- `banking_api_server/services/nlIntentParser.js` — Heuristic fallback parser
- `banking_api_server/services/nlIntentSanitize.js` — Result sanitization (shared across all providers)

### UI / Config
- `banking_api_ui/src/components/BankingAgent.js` — `activeModel` state, LLM response display
- Phase 179 artifacts (LLM dropdown selector implementation)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`parseWithLMStudio` in `geminiNlIntent.js`:** OpenAI-compatible fetch to `LM_STUDIO_BASE_URL/chat/completions` — Gemma 4 uses identical API
- **`sanitizeNlResult`:** Validates JSON output from any provider — reusable for Gemma
- **`SYSTEM` prompt:** Shared system prompt for intent parsing — works with any model that outputs JSON
- **Phase 179 LLM dropdown:** Already renders provider options — just needs model sub-dropdown added

### Established Patterns
- All providers use fetch-based OpenAI-compatible API (no SDKs)
- 5-second timeout for local models, 10-second for cloud
- Each provider returns parsed JSON or null on failure
- `sanitizeNlResult` catches malformed JSON and falls through to next provider

### Integration Points
- `LM_STUDIO_BASE_URL` env var — already wired for local inference
- `LM_STUDIO_MODEL` env var — already exists, sets model name in request body
- `activeModel` state in BankingAgent.js — displays which provider responded
- Config page updates `langchainConfig` via `/api/langchain/config` endpoint

</code_context>

<specifics>
## Specific Ideas

- Pre-filled model dropdown should include popular local models: `gemma-4-4b`, `gemma-4-12b`, `llama-3.2`, `mistral-7b`, `qwen-2.5-7b`
- Comparison script should test: "check my balance", "transfer 100 from checking to savings", "show me token exchange", "deposit 50 into savings", "what is CIBA?" and similar mixed banking/education intents

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 180-evaluate-and-implement-google-gemma-4-as-another-llm-provider*
*Context gathered: 2026-04-17*
