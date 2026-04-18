# 117-01 Summary — LangChain Pluggable Model Interface

**Phase:** 117 — LangChain pluggable model interface (Groq default, OpenAI/Anthropic support)  
**Plan:** 117-01-PLAN.md  
**Status:** Complete  
**Requirements satisfied:** ACTLOG-01 through ACTLOG-07  
**Completed:** 2026-04-18  

---

## Goal

Build a production-quality pluggable model interface for the LangChain/LangGraph agent, with Groq as the default and OpenAI and Anthropic available through a uniform provider abstraction. Ensure the configuration UI is real and working, not placeholder-only.

---

## What was already in place (Phase 116 inheritance)

- `langchain_agent/src/agent/llm_factory.py` — full Python factory supporting groq, openai, anthropic, google, ollama, lmstudio
- `banking_api_server/services/llmProviderStatus.js` — real-time provider health checks
- `banking_api_server/routes/langchainConfig.js` — full REST API for config/status/key management
- `banking_api_ui/src/components/LlmConfigPanel.jsx` — real configuration UI with provider dropdown, status badges, API key management, fallback chain drag-reorder
- Groq and Anthropic fully wired in `agentBuilder.js`

---

## Changes made

### `langchain_agent/src/services/interfaces.py`

Added `LLMProvider` abstract base class — the provider abstraction boundary for all LLM backends:

```python
class LLMProvider(ABC):
    provider_name: str        # e.g. 'groq', 'openai'
    default_model: str        # fallback when caller omits model
    available_models: List[str]
    is_configured() -> bool   # credentials present?
    get_chat_model(...) -> BaseChatModel  # instantiate + return
```

### `banking_api_server/services/agentBuilder.js`

Three substantive changes:

1. **Added `ChatOpenAI` import** from `@langchain/openai`

2. **Added `PROVIDER_DEFAULT_MODELS` map** — so cross-provider model names never leak:
   ```js
   const PROVIDER_DEFAULT_MODELS = {
     groq: 'llama-3.3-70b-versatile',
     anthropic: 'claude-haiku-4-20250414',
     openai: 'gpt-4o-mini',
     google: 'gemini-2.0-flash',
     lmstudio: 'default',
   };
   ```
   Model resolution is now: `langchainConfig.model || PROVIDER_DEFAULT_MODELS[provider]` — the session-stored model name is only applied if it was explicitly set, preventing a Groq model name being sent to OpenAI.

3. **Wired OpenAI provider** (`ChatOpenAI` fully instantiated when `openai_api_key` or `OPENAI_API_KEY` is present)

4. **Wired LM Studio** (OpenAI-compatible local endpoint, no key required) — uses `ChatOpenAI` with `configuration.baseURL` override

5. Google and Ollama stubs updated from misleading "not yet integrated" warnings to accurate "missing @langchain/google-genai / @langchain/ollama runtime package" messages (packages not installed in banking_api_server at this time)

### `banking_api_server/package.json`

Added `@langchain/openai` dependency (installed via npm).

---

## Provider status after Phase 117

| Provider | Python (langchain_agent) | BFF/JS (agentBuilder) | UI Config |
|----------|--------------------------|------------------------|-----------|
| Groq | ✅ full | ✅ full | ✅ |
| Anthropic | ✅ full | ✅ full | ✅ |
| OpenAI | ✅ full | ✅ full (new) | ✅ |
| LM Studio | ✅ full | ✅ full (new) | ✅ |
| Google | ✅ full | ⚠️ package not installed | ✅ |
| Ollama | ✅ full | ⚠️ package not installed | ✅ |

---

## Verification

- `node -e "require('./services/agentBuilder')"` → **OK** (no syntax errors, no new warnings beyond pre-existing circular-dep note)
- `cd banking_api_ui && npm run build` → **exit 0**, `440.49 kB` (unchanged size)
- Groq remains default via `fallback_order: ['groq', 'anthropic']`
- Automatic failover was not introduced (this deferred to a later phase per CONTEXT.md)
