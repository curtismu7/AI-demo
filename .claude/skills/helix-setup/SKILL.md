---
name: helix-setup
description: >
  Configuration reference for Ping AI / Helix as the LLM provider in this repo.
  USE THIS SKILL whenever: setting up or changing Helix credentials, importing an API
  key JSON file, diagnosing "conversation returned null", checking which key type is in
  LLM2.json, or configuring the 5 HELIX_* env vars. Also use when someone asks "how do
  I connect Helix to the demo" or "why is Helix returning null".
  DO NOT USE FOR: NL intent routing bugs or misrouting (use nl-intent-routing skill),
  OAuth/MCP/token flows (use oauth-pingone or mcp-server skills).
---

# Helix Setup — Configuration Reference

Full narrative setup guide: [`docs/helix-setup.md`](../../docs/helix-setup.md)

---

## LLM2.json — What It Is and Where It Lives

```
/Users/curtismuir/Development/AI-Demo/LLM2.json   ← repo root
```

**This is an env-admin key — it cannot invoke agents.**

```json
{
  "scope": "env_admin",
  "target": "",
  "branch": ""
}
```

An env-admin key has empty `target` and `branch`. Using it for agent invocation returns
HTTP 200 with body `null` — which looks successful but is not.

**To get an agent-invocation key:**
1. Go to **Agents** in the Helix console
2. Click the **⋮** menu on the published agent card
3. Select **Create API Key** (or **Generate Key**)
4. Download the JSON — it will have `"scope": "agent"` and a non-empty `target`

Quick check:
```bash
cat LLM2.json | python3 -c \
  "import json,sys; k=json.load(sys.stdin); \
   print('OK — agent key' if k.get('target') else 'WRONG TYPE — env admin key')"
```

---

## The 5 Required Config Values

| Env var | Where to find it |
|---|---|
| `HELIX_BASE_URL` | Tenant origin only — e.g. `https://openam-helix.forgeblocks.com` (no path) |
| `HELIX_API_KEY` | The `keyValue` string from the **agent-scoped** key JSON |
| `HELIX_ENVIRONMENT_ID` | Helix console → Settings, or from the URL (UUID) |
| `HELIX_AGENT_ID` | Agent name as shown in console — **not** the UUID, case-sensitive |
| `HELIX_PROMPT_FIELD_ID` | Input field ID inside the AI Task node (e.g. `textInput502c5045a61c`) |

Set in `demo_api_server/.env` — `configStore` resolves them automatically via `getEffective('helix_*')`.

> **Also needed by the Python LangChain agent.** The same 5 env vars are read by
> `langchain_agent/src/config/settings.py` via `os.environ` (not configStore). Set them
> in `langchain_agent/.env` as well when running the Python agent. The Python agent reads
> them as `LANGCHAIN_LLM_PROVIDER=helix` (selects Helix) plus the same `HELIX_*` vars.
> See the `langchain-agent` skill for the full Python config reference.

---

## Import via Admin UI

**Configuration → LLM Provider → Helix → Import API Key JSON**

Drag-and-drop or file-pick the agent-scoped key JSON. Auto-populates `HELIX_API_KEY` and
`HELIX_AGENT_ID`. Fill `HELIX_BASE_URL`, `HELIX_ENVIRONMENT_ID`, and `HELIX_PROMPT_FIELD_ID`
manually, then save.

---

## Common Failure: "conversation returned null"

Work through in order:

1. **Wrong key type** — `LLM2.json` is env-admin scope. Create a new key from the agent's ⋮ menu.
2. **Agent not published** — Saving ≠ publishing. Click Publish and wait for the badge.
3. **Agent name mismatch** — `HELIX_AGENT_ID` must match the console name exactly (case-sensitive).
4. **Missing request body** — The create-conversation call must include `{"agent":{"version":"published"}}`.
5. **Wrong provider** — `google-vertexai` with empty API Key always returns null. Use `google` instead.

---

## Startup Banner

A correctly configured Helix integration prints at startup:

```
✓  [HELIX LLM     ]  Helix AI Agent                    configured
```

`partial` means one or more of the 5 vars is missing — the banner lists which ones.

---

## Key Source Files

| File | Role |
|---|---|
| `demo_api_server/services/helixLlmService.js` | Helix API client — conversation create, send, poll |
| `demo_api_server/services/geminiNlIntent.js` | Routes NL queries to Helix; builds system prompt |
| `demo_api_server/services/configStore.js` | Resolves `HELIX_*` env vars via `getEffective()` |
| `demo_api_server/services/llmProviderResolver.js` | Provider selection (Helix is default) |
| `demo_api_ui/src/components/HelixPanel.jsx` | Admin UI for Helix config + JSON import |
| `docs/HELIX_AGENT_DIRECTIVES.json` | System prompt base + per-vertical theme overrides |
| `docs/helix-setup.md` | Full narrative setup guide |

---

## Live Log

```bash
tail -f /tmp/demo-api.log | grep -i helix
```

Successful call sequence:
```
[helix/info] Helix call started {"agent":"LLM2","environment":"fe213c3c-..."}
[helix/info] Conversation created {"conversationId":"e863355a-...","channelId":"e8d9d20b-..."}
[helix/info] Response received (immediate) {"conversationId":"e863355a-..."}
```
