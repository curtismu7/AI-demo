---
created: 2026-04-01T16:05:00.000Z
title: Investigate POST api/mcp/tool 400 error on tool call
area: api
files:
  - banking_api_server/server.js:984-990
  - banking_api_ui/src/services/bankingAgentService.js
---

## Problem

Browser console shows:

```
api/mcp/tool:1  Failed to load resource: the server responded with a status of 400 ()
```

The BFF `POST /api/mcp/tool` handler returns 400 in exactly one case:

```js
if (!tool || typeof tool !== 'string') {
  return res.status(400).json({ error: 'tool name is required' });
}
```

So the request is being sent with a missing or non-string `tool` field in the JSON body. Possible causes:

1. **UI sends empty/undefined tool name** — `bankingAgentService.js` calls the endpoint but the tool name variable is undefined or null at call time.
2. **Body serialization bug** — the POST body is not JSON or content-type header is wrong, so `express.json()` fails to parse it, leaving `req.body` as `undefined`.
3. **Race condition** — request fires before the tool name is resolved (e.g. user clicks before agent state is ready).
4. **Wrong endpoint path** — client is hitting a different route that returns 400 for an unrelated reason.

## Solution

1. Open browser DevTools → Network tab, find the failing `api/mcp/tool` request, inspect the **Request Payload** — confirm whether `tool` field is present and correct.
2. If `tool` is missing: trace back in `bankingAgentService.js` to find where the tool call is dispatched and why the tool name is empty.
3. If body is present but `content-type` is wrong: ensure `axios.post` / `fetch` call includes `Content-Type: application/json`.
4. Add a more descriptive error response that echoes back what was received (sanitized), to aid future debugging.
