# LM Studio Anthropic Provider — Design Spec
**Date:** 2026-05-25  
**Status:** Approved

---

## Goal

Add "LM Studio" as a selectable LLM provider in the demo. When selected, the agent uses `ChatAnthropic` (langchain-anthropic SDK) pointed at LM Studio's Anthropic-compatible local endpoint (`http://localhost:1234`). The UI button says "LM Studio". This lets the demo present a locally-running model as if Anthropic's API is in use, without needing a real Anthropic API key.

---

## Architecture

### Provider key

Internal provider identifier: `anthropic-lmstudio`

This key flows through the full stack:

```
UI "LM Studio" button selected
  → POST /api/langchain/config { provider: "anthropic-lmstudio" }
  → llmProviderResolver.js — passes through unchanged (like openai/anthropic)
  → BFF forwards provider in langchain_config to langchain_agent (:8888)
  → get_config() reads LANGCHAIN_LLM_PROVIDER="anthropic-lmstudio"
  → llm_factory.get_llm(provider="anthropic-lmstudio", ...)
  → ChatAnthropic(base_url="http://localhost:1234", api_key="lm-studio")
```

### Why `anthropic-lmstudio` not `lmstudio`

The existing `lmstudio` provider key uses `ChatOpenAI` (OpenAI wire format). The new Anthropic-compat path needs a distinct key so the factory can route to the right SDK. Existing `lmstudio` users are not affected.

---

## Components

### 1. Python — `langchain_agent/requirements.txt`
`langchain-anthropic>=0.3.0,<0.4.0` — already added.

### 2. Python — `langchain_agent/src/config/settings.py`
Add field to `LangChainConfig`:
```python
anthropic_lmstudio_base_url: str = "http://localhost:1234"
```
Wire from env var `ANTHROPIC_LMSTUDIO_BASE_URL` in `ConfigManager._build_config()`.

### 3. Python — `langchain_agent/src/agent/llm_factory.py`
Add branch for `anthropic-lmstudio`:
```python
if resolved == "anthropic-lmstudio":
    resolved_model = model or "claude-3-5-sonnet-20241022"
    logger.info("Initializing LLM: provider=anthropic-lmstudio model=%s url=%s", resolved_model, lmstudio_base_url)
    from langchain_anthropic import ChatAnthropic
    return ChatAnthropic(
        model=resolved_model,
        anthropic_api_url=lmstudio_base_url,   # LM Studio's Anthropic-compat URL
        api_key="lm-studio",                    # LM Studio ignores the key
        temperature=temperature,
        max_tokens=max_tokens,
    )
```
Note: `lmstudio_base_url` is already a parameter (default `http://localhost:1234/v1`). For Anthropic wire format the base URL LM Studio exposes is typically `http://localhost:1234` (no `/v1`). We'll use the same `lmstudio_base_url` param but default it correctly — or add a separate `anthropic_lmstudio_base_url` param. Decision: reuse `lmstudio_base_url` and document that for Anthropic mode the user should set `http://localhost:1234` (no `/v1` suffix). The default for this param is already `http://localhost:1234/v1`; we'll add a dedicated param `anthropic_lmstudio_base_url` (default `http://localhost:1234`) to avoid the `/v1` confusion.

### 4. Python — `langchain_agent/src/agent/langchain_mcp_agent.py`
Pass `anthropic_lmstudio_base_url` to `get_llm()`:
```python
anthropic_lmstudio_base_url=getattr(lc, "anthropic_lmstudio_base_url", "http://localhost:1234"),
```

### 5. BFF — `demo_api_server/services/llmProviderResolver.js`
Add pass-through for `anthropic-lmstudio` (same pattern as `openai`/`anthropic`):
```js
if (requested === 'anthropic-lmstudio') {
  return { provider: 'anthropic-lmstudio', model };
}
```

### 6. BFF — `demo_api_server/routes/langchainConfig.js`
Add `anthropic-lmstudio` to `PROVIDER_MODELS` and `DEFAULT_MODELS`:
```js
PROVIDER_MODELS['anthropic-lmstudio'] = ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'];
DEFAULT_MODELS['anthropic-lmstudio'] = 'claude-3-5-sonnet-20241022';
```

Also add `anthropic_lmstudio` to `key_set` in the GET response (always `true`, like Ollama — no API key required):
```js
anthropic_lmstudio: true,
```

### 7. BFF — `demo_api_server/services/llmProviderStatus.js`
Handle status check for `anthropic-lmstudio`: ping `http://localhost:1234` (or the configured base URL). Return `available` if HTTP 200, `unreachable` otherwise.

### 8. UI — `demo_api_ui/src/components/ProviderSelector.jsx`
Add "LM Studio" as a third button. New prop: `lmstudioStatus`.

```jsx
<button style={btnStyle('anthropic-lmstudio')} onClick={() => onSelect('anthropic-lmstudio')}>
  <span>LM Studio</span>
  {lmstudioStatus && (
    <span style={pillStyle(lmstudioStatus)}>{statusLabel(lmstudioStatus)}</span>
  )}
</button>
```

### 9. UI — `demo_api_ui/src/components/LlmConfigPage.jsx`
- Fetch `anthropic-lmstudio` status alongside helix/ollama.
- Map provider value `anthropic-lmstudio` → valid button state.
- When `anthropic-lmstudio` is active: show a simple `LmStudioPanel` (or inline message) explaining LM Studio is active and showing the base URL.
- `handleSelect` accepts `'anthropic-lmstudio'` and posts it to BFF.

### 10. UI — New `LmStudioPanel` component (or inline in LlmConfigPage)
Simple read-only panel:
- Shows: "LM Studio (Anthropic API) — Connected at `http://localhost:1234`"
- Shows status pill (available / unreachable)
- No API key field (not needed)
- Optional: field to override base URL (nice-to-have, not required for v1)

---

## Data flow — config persistence

| What | Where |
|---|---|
| Provider selection | Session `langchain_config.provider = "anthropic-lmstudio"` |
| Base URL (if configurable) | Session + configStore `anthropic_lmstudio_base_url` |
| No API key | LM Studio ignores it; we send `"lm-studio"` as dummy |

---

## Status checking

`GET /api/langchain/provider/anthropic-lmstudio/status`

- Pings LM Studio at the configured base URL (`http://localhost:1234`)
- Tries `GET /v1/models` or just root `/` — whichever responds
- Returns: `{ status: 'available' | 'unreachable', reason, configured: true }`
- Always `configured: true` (no API key to check)

---

## Error handling

| Scenario | Handling |
|---|---|
| LM Studio not running | Status pill shows "❌ Unreachable"; agent call fails fast with clear error |
| Model not loaded in LM Studio | LM Studio returns error; BFF surfaces it to UI via existing error path |
| `langchain-anthropic` not installed | Python startup fails with `ImportError`; `requirements.txt` prevents this |
| Streaming not supported | `ChatAnthropic` streaming may need verification; fallback gracefully |

---

## Out of scope (v1)

- Real Anthropic cloud API key support (use real `anthropic` provider for that)
- Model selection UI within the LM Studio panel (LM Studio manages its own loaded model)
- Auto-discovery of which model is loaded in LM Studio

---

## Success criteria

1. "LM Studio" button appears in the provider selector alongside Helix and Ollama
2. Selecting it saves `provider: "anthropic-lmstudio"` to session and BFF
3. The langchain agent initializes `ChatAnthropic` pointing at `http://localhost:1234`
4. With a Claude-compatible model loaded in LM Studio, the agent responds correctly
5. Status pill shows ✅ Active when LM Studio is reachable, ❌ Unreachable when not
6. `npm run build` in `demo_api_ui/` exits 0 after UI changes
7. No regression to existing Helix or Ollama provider paths

---

## Files changed (summary)

| File | Change type |
|---|---|
| `langchain_agent/requirements.txt` | Already updated — `langchain-anthropic` added |
| `langchain_agent/src/config/settings.py` | Add `anthropic_lmstudio_base_url` field |
| `langchain_agent/src/agent/llm_factory.py` | Add `anthropic-lmstudio` branch |
| `langchain_agent/src/agent/langchain_mcp_agent.py` | Pass new param to factory |
| `demo_api_server/services/llmProviderResolver.js` | Add pass-through for `anthropic-lmstudio` |
| `demo_api_server/routes/langchainConfig.js` | Add to `PROVIDER_MODELS`, `DEFAULT_MODELS`, `key_set` |
| `demo_api_server/services/llmProviderStatus.js` | Handle `anthropic-lmstudio` status ping |
| `demo_api_ui/src/components/ProviderSelector.jsx` | Add "LM Studio" button |
| `demo_api_ui/src/components/LlmConfigPage.jsx` | Handle `anthropic-lmstudio` provider state |
| `demo_api_ui/src/components/LmStudioPanel.jsx` | New panel component |
