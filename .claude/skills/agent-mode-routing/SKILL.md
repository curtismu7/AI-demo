---
name: agent-mode-routing
description: Use when adding, editing, or debugging agent mode selection, LLM provider routing, Helix/heuristic fallback, the five-mode picker UI, or any code in bankingAgentLangGraphService, agentModeResolver, llmProviderResolver, or the agentMode.* / agentHelixUnconfigured tests. Also use when the agent appears to do nothing, returns "Advanced reasoning is temporarily unavailable", or ignores the selected mode.
---

# Agent Mode Routing — Architecture & Rules

## The Five Modes

| ID | Label | Provider | Heuristic routing | LLM fallback |
|----|-------|----------|-------------------|--------------|
| `heuristics` | Heuristics only | none | ✅ | none — catalog message on no-match |
| `helix_google` | Helix (Google/Gemini) | helix | ❌ | Helix always |
| `heuristics_helix` | Heuristics + Helix | helix | ✅ | Helix on no-match |
| `chatgpt` | Just ChatGPT | openai | ❌ | OpenAI Responses API (BFF or platform wiring) |
| `claude` | Just Claude | anthropic | ❌ | Anthropic Messages API (BFF or platform wiring) |

**Single SSOT:** [`demo_api_server/services/agentModeResolver.js`](../../demo_api_server/services/agentModeResolver.js) — never inline a provider default anywhere else.

**Default mode** (`DEFAULT_MODE`): `heuristics_helix` — but `agent_mode` in `configStore` defaults to `''` (empty string). An empty `rawMode` is falsy, so `resolveAgentMode` is **never called** for a fresh install. The `heuristicEnabled` path reads `ff_heuristic_enabled` instead.

---

## The Helix-Unconfigured Fallback (ARCHITECTURE-TRUTH T-3b)

**Rule:** When the resolved provider is `helix` and no `helix_api_key` is present, the agent MUST return the heuristic catalog message (`buildCatalogMessage()`) with `success: true`. It must NOT call `:3006` or return `reasoning_unavailable`.

**Where it lives:** `bankingAgentLangGraphService.js` — immediately before `runReasonLoop`, after `resolveLlmProvider`.

```js
if (provider === 'helix') {
  const helixCfg = extractHelixConfig(langchainConfig);
  const helixApiKey = helixCfg.helix_api_key || configStore.getEffective('helix_api_key') || '';
  if (!helixApiKey) {
    // No Helix credentials — fall back to heuristics-only catalog
    if (req) req.agentPath = 'heuristic';
    return {
      reply: buildCatalogMessage(),
      success: true,
      toolsCalled: [], tokensUsed: 0, requiresConsent: false,
      agentConfigured: true, tokenEvents: req?.tokenEvents || [],
    };
  }
}
```

**"Configured" definition:** `helix_api_key` is present and non-empty. `helix_base_url` and `helix_agent_id` have FIELD_DEF defaults so they are always populated.

---

## Provider Resolution Order

```
langchainConfig.provider
  'ollama'  → helix if no OLLAMA_BASE_URL / ollama_base_url
  'helix'   → helix
  'openai'  → openai (pass-through; :3006 enforces creds)
  'anthropic'→ anthropic (pass-through; :3006 enforces creds)
  <absent>  → helix  ← catch-all default
```

**Never add a new default.** `llmProviderResolver.js` is the single provider resolver — all catch-alls live there.

---

## Mode Selector → configStore → Runtime Flow

```
UI selects mode
  → POST /api/langchain/config { agent_mode, external_wiring }
  → configStore.setConfig({ agent_mode: am.mode })
  → langchainConfig.provider = am.provider written to session

On message:
  rawMode = configStore.getEffective('agent_mode')  // '' on fresh install
  _agentMode = rawMode ? resolveAgentMode(rawMode, ...) : null
  heuristicEnabled = rawMode ? _agentMode.heuristicRouting
                             : ff_heuristic_enabled !== 'false'
```

**Critical:** `rawMode = ''` is falsy. `resolveAgentMode` is only called when `agent_mode` has been explicitly set via the UI or config POST. The default path reads `ff_heuristic_enabled` for the heuristic gate and `langchainConfig.provider` for the LLM provider.

---

## Test Coverage Required

Every test that exercises `processAgentMessage` through the LLM/reason-loop path (i.e. it mocks `agentReasoningClient.runReasonLoop`) **must** include `helix_api_key: 'test-key'` in its `TEST_CONFIG` mock. Without it, the Helix-unconfigured check fires first and the mocked reason loop is never reached.

```js
const TEST_CONFIG = {
  ff_heuristic_enabled: 'false', // force LLM path
  helix_api_key: 'test-key',    // satisfy Helix-configured check
};
```

**Regression test:** [`demo_api_server/tests/agentHelixUnconfigured.regression.test.js`](../../demo_api_server/tests/agentHelixUnconfigured.regression.test.js) — must stay green. It asserts:
- `success: true` when `helix_api_key` is absent
- `reply === buildCatalogMessage()`
- `axios.post` (`:3006`) is never called

---

## UI Consistency Rule

The agent chat UI must display the catalog message as a **normal assistant message** when `success: true` — not as an error toast or "could not parse" message. The `reasoning_unavailable` error code (`success: false`) triggers `reportNlFailure`; the catalog reply does not.

Any UI path that receives `response.success === true && response.reply` must render it as an assistant message, regardless of whether an LLM was involved.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Adding a provider default outside `llmProviderResolver.js` | Move it there; it's the single SSOT |
| Test expects reason loop to run but `helix_api_key` absent in mock | Add `helix_api_key: 'test-key'` to `TEST_CONFIG` |
| Changing `DEFAULT_MODE` without updating `agentModeResolver.regression.test.js` | Update the `DEFAULT_MODE export` test and the `null/undefined/empty` test |
| Treating `agent_mode: ''` the same as `agent_mode: 'heuristics_helix'` | They behave differently: `''` skips `resolveAgentMode`, `'heuristics_helix'` calls it |
| Returning `success: false` / `reasoning_unavailable` when Helix is unconfigured | Must return `success: true` + catalog message — the agent *is* responding, just in heuristics-only mode |

---

## Files to Read Before Editing

| File | Role |
|------|------|
| `demo_api_server/services/agentModeResolver.js` | Five-mode SSOT + DEFAULT_MODE |
| `demo_api_server/services/llmProviderResolver.js` | Provider catch-all — Helix default lives here |
| `demo_api_server/services/bankingAgentLangGraphService.js` | Helix-unconfigured fallback + heuristic gate |
| `demo_api_server/services/configStore.js` (line ~287) | `agent_mode` field def — default is `''` not `'heuristics_helix'` |
| `demo_api_server/tests/agentHelixUnconfigured.regression.test.js` | Regression for the fallback |
| `demo_api_server/tests/agentModeResolver.regression.test.js` | Mode SSOT regression |
