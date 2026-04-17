# Phase 176: Show users in config what LLM we are using — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add UI to the configuration page that:
1. Shows the currently selected LLM provider and model
2. Allows users to pick the provider (Groq, OpenAI, Anthropic, Google, Ollama/LM Studio)
3. Shows config fields (API keys, endpoints) for the selected provider
4. Implements provider fallback chain: if first provider errors, automatically try next provider
5. Sets LM Studio as the default provider when available
6. Prevents a bad/unavailable LLM from blocking agent execution

</domain>

<decisions>
## Implementation Decisions

### UI Display & Selection
- **D-01:** Show current LLM provider + model prominently on config page (read-only section)
- **D-02:** Add provider selector (dropdown or button group) to change provider
- **D-03:** When provider selected, show config fields specific to that provider (API key, base URL for Ollama, etc.)
- **D-04:** Display fallback chain as ordered list — users can reorder providers

### Provider Defaults & Fallback
- **D-05:** Default provider priority: LM Studio (if available locally) > Groq > Anthropic > OpenAI > Google
- **D-06:** When agent initializes, use first provider in fallback chain; if it errors, try next without user intervention
- **D-07:** Add "Provider unavailable" warning in UI if selected provider is not configured or unreachable
- **D-08:** Show which provider actually executed in agent response (for debugging/transparency)

### Session Persistence
- **D-09:** Store selected provider and fallback order in session (req.session.langchain_config)
- **D-10:** Persist fallback chain order across requests (user can reorder via drag-drop or UI)

### Agent's Discretion
- Exact UI layout and styling for provider selector
- Whether to show/hide unconfigured providers
- Wording of provider unavailable warnings
- Animation/transition style when switching providers

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LLM Configuration
- `banking_api_server/routes/langchainConfig.js` — LLM provider config GET/POST routes, session storage
- `banking_api_ui/src/components/LlmProviderSelector.jsx` — Existing provider dropdown (may need enhancement)
- `banking_api_server/services/llm_factory.py` — Python LLM factory with provider initialization and fallback logic

### Config Page Location
- `banking_api_ui/src/pages/AdminConfig.jsx` — Where LLM config UI should be added
- `banking_api_ui/src/components/ConfigTabs.js` — Tab structure; may add LLM tab or integrate into existing tab

### Session & State Management
- `banking_api_server/middleware/langchainConfig.js` — Session-scoped config storage
- `banking_api_ui/src/context/LlmConfigContext.js` — Frontend context for selected provider state

</canonical_refs>

<specifics>
## Specific Ideas

- Show "Last used provider: Groq" as a quick-select button
- List providers with status badges: ✅ Available (configured API key + reachable) / ⚠️ Unconfigured / ❌ Unreachable
- Drag-drop interface for fallback chain reordering
- "Test connection" button to validate selected provider without running agent

</specifics>

<deferred>
## Deferred Ideas

- Per-tool provider selection (different tools use different LLM)
- A/B testing multiple providers in parallel for comparison
- LLM usage metrics (tokens, latency per provider)

</deferred>

---

*Phase: 176-show-users-in-config-what-llm-we-are-using*
*Context gathered: 2026-04-17 (automated)*
