# Helix LLM Integration — Setup Guide

## Overview

This banking app supports **Ping AI / Helix** as a drop-in LLM provider for the agent chat interface. When configured, every agent conversation is routed through a published Helix agent instead of a direct LLM API.

The integration follows Helix's 3-step conversation API:
1. `POST /agents/{name}/conversations` — create a conversation session
2. `POST /conversations/{id}/channels/{home_channel}/messages` — send the user prompt
3. The response is either returned immediately in the POST body, or polled from the same messages endpoint

---

## Prerequisites

- Access to a Helix tenant (e.g. `https://openam-helix.forgeblocks.com`)
- At least one **published** agent in that tenant
- An **agent-scoped** API key for that agent (see [Creating an API Key](#creating-an-api-key) below)

---

## Creating a Published Agent

1. Log in to the Helix console
2. Go to **Agents** and create a new agent (or open an existing one)
3. In the agent designer, add an **AI Task** node and configure:
   - **Provider:** Use a provider with environment-level credentials (e.g. `anthropic` or `google`) — these do not require a per-agent API key
   - **Model:** Select a model from the provider's available list
   - **Input field:** Note the field ID shown in the node (e.g. `textInput502c5045a61c`) — this is your **Prompt Field ID**
4. Connect the AI Task node between the start and end nodes
5. Publish the agent — look for a **Publish** or **Deploy** button

> **Provider note:** `google-vertexai` requires a per-agent API key. If you use it, leave the key field blank in the node and the agent will fail to respond. Use `google` instead, which inherits environment-level credentials.

---

## Creating an API Key

API keys come in two types. You need an **agent invocation key**, not an environment admin key.

**Agent invocation key** (required):
- In the Helix console, open your published agent
- Click the **three-dot menu** on the agent card
- Select **Create API Key** (or similar)
- The resulting JSON will have `target` set to the agent name and `branch` set to `published`

**Environment admin key** (wrong type — will not invoke agents):
- Created from the top-level environment settings
- Has `scope: env_admin` and empty `target` / `branch`
- Can list/create agents but cannot start conversations

The key JSON file looks like:

```json
{
  "keyValue": "abc123...",
  "keyName": "my-banking-agent",
  "target": "my-banking-agent",
  "branch": "published"
}
```

---

## Finding Your Configuration Values

| Value | Where to find it |
|---|---|
| **Base URL** | Your tenant URL, e.g. `https://openam-helix.forgeblocks.com` — the app appends `/dpc/jas/helix/v1` automatically |
| **Environment ID** | Helix console → Settings or URL, e.g. `fe213c3c-9c1d-4bdb-954a-a22879dad26d` |
| **Agent Name** | The agent's name as shown in the console (used in API URLs), e.g. `LLM` or `my-banking-agent` |
| **Prompt Field ID** | The input field ID in the AI Task node, e.g. `textInput502c5045a61c` |
| **API Key** | `keyValue` from the agent-scoped key JSON |

---

## Configuring the Banking App

### Option A — Admin UI (recommended)

1. Start the app and log in as admin
2. Navigate to **Configuration → LLM Provider → Helix**
3. Fill in all five fields:
   - Base URL
   - API Key
   - Environment ID
   - Agent Name
   - Prompt Field ID
4. Optionally, click **Import API Key JSON** to load the key file — this populates the API Key and Agent Name fields automatically from the JSON
5. Click **Save & Activate**
6. The status pill changes to **Active** when the configuration is accepted

### Option B — Environment variables

Set these in your `.env` before starting the server:

```
HELIX_BASE_URL=https://openam-helix.forgeblocks.com
HELIX_API_KEY=<your-agent-invocation-key>
HELIX_ENVIRONMENT_ID=<your-environment-id>
HELIX_AGENT_ID=<your-agent-name>
HELIX_PROMPT_FIELD_ID=<your-prompt-field-id>
```

The configStore resolves these automatically — no code changes needed.

---

## Verification

After saving, test the integration:

1. Open the user dashboard and start an agent chat
2. Ask a simple question — the response should come from your Helix agent
3. Check server logs at `/tmp/bank-api-server.log` — look for:
   ```
   [agentBuilder] LLM initialized: helix/...
   ```
   If you see an error, the most common causes are listed below

---

## Troubleshooting

### `createConversation returned null`

The most common cause. Check all of the following:
- The agent is **published** (not just saved/drafted)
- You are using an **agent-scoped key** (has `target` and `branch` in the JSON), not an env admin key
- The **Agent Name** matches exactly what's in the console (case-sensitive)
- The request body includes `{ agent: { version: "published" } }` — our service sends this automatically

### `createConversation failed: 401`

The API key is invalid or expired. Re-export a fresh key from the agent's three-dot menu.

### `Helix config incomplete: missing ...`

One or more of the five required config fields is empty. Use **Load from Database** in the UI to check what's currently stored, then fill any missing fields and save again.

### Agent responds but answer is empty / null

The Prompt Field ID is wrong. The ID is case-sensitive and unique per agent version. Open the agent in the designer, click the AI Task node, and copy the exact field ID shown.

### `google-vertexai` agent returns null body

The agent's AI Task node has an empty API key for `google-vertexai`. Switch the provider to `google` in the designer (which uses environment-level credentials) and republish.

---

## Architecture Reference

```
Browser (cookie) → BFF (agentBuilder.js)
  → if provider === 'helix': callHelixAgent(helixLlmService.js)
    → POST /environments/{env_id}/agents/{agent_name}/conversations
    → POST /conversations/{id}/channels/{home_channel}/messages
    → (poll GET same URL if needed)
    → returns string response to agentBuilder
  → agentBuilder returns response to BFF route
→ BFF returns response to browser
```

Key files:

| File | Role |
|---|---|
| `banking_api_server/services/helixLlmService.js` | Helix API client — conversation create, send, poll |
| `banking_api_server/services/agentBuilder.js` | LLM provider dispatch — routes to Helix when `provider === 'helix'` |
| `banking_api_server/routes/langchainConfig.js` | REST endpoints for saving/reading Helix config |
| `banking_api_server/services/configStore.js` | Runtime config — env vars `HELIX_*` map to `helix_*` keys |
| `banking_api_ui/src/components/HelixPanel.jsx` | Admin UI panel for Helix configuration |
| `banking_api_server/src/__tests__/helixLlmService.test.js` | 19-test unit suite for the service |

---

## Running Tests

```bash
npx jest --testPathPatterns='helixLlmService' --no-coverage
# Expected: 19 passed, 0 failed
```
