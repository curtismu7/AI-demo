---
phase: 165-add-lm-studio-as-local-model-provider-fallback-when-groq-quota-exceeded
plan: 01
status: complete
started: 2026-04-16
completed: 2026-04-16
---

## Summary

Added LM Studio as a local model provider fallback in two integration points:

1. **BFF NL intent chain** — New `parseWithLmStudio()` function in `geminiNlIntent.js` with 5-second AbortController timeout. Chain updated from Groq → Gemini → heuristic to Groq → LM Studio → Gemini → heuristic. Groq 429 responses now logged specifically as quota exceeded.

2. **LangChain agent factory** — New `lmstudio` provider in `llm_factory.py` using `ChatOpenAI` with custom `base_url` pointing to `localhost:1234/v1`. Settings updated with `lm_studio_base_url` and `lm_studio_model`. Agent wired to pass the base URL.

## Key Files

### Created
- (none)

### Modified
- `banking_api_server/services/groqNlIntent.js` — 429 quota exceeded specific logging
- `banking_api_server/services/geminiNlIntent.js` — LM Studio fallback function + chain update
- `.env.example` — LM_STUDIO_BASE_URL, LM_STUDIO_MODEL env vars documented
- `langchain_agent/src/agent/llm_factory.py` — lmstudio provider block
- `langchain_agent/src/config/settings.py` — lm_studio_base_url, lm_studio_model settings
- `langchain_agent/src/agent/langchain_mcp_agent.py` — passes lmstudio_base_url to get_llm()

## Commits
- `c706f31` — feat(165-01): add LM Studio fallback to BFF NL intent chain
- `195c35f` — feat(165-01): add lmstudio provider to LangChain agent factory

## Verification
- BFF module loads: `typeof parseNaturalLanguage` → `function`
- LangChain: `'lmstudio' in PROVIDER_MODELS` → True
- `.env.example` contains LM_STUDIO_BASE_URL and LM_STUDIO_MODEL
- When LM Studio is not running, BFF chain skips it (5s timeout) and continues to Gemini

## Deviations
- None. Plan executed as specified.
