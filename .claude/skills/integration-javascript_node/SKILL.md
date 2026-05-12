---
name: integration-javascript_node
description: PostHog integration for server-side Node.js. In Super Banking, PostHog is already wired in `banking_api_server/services/posthog.js`; use this skill when extending event capture, identifying users on OAuth callback, or adding exception capture to a new error handler. USE FOR posthog-node, capture, captureException, identify, feature flags, exception autocapture, server-side analytics. DO NOT USE FOR client-side posthog-js (banned in this repo by token-custody rule — the SPA never talks to PostHog directly).
metadata:
  author: PostHog (tailored for Super Banking)
  version: 1.12.1
---

# PostHog integration for JavaScript Node — Super Banking

PostHog is already installed and wired in this repo. **Do not re-install or restructure** — extend the existing wrapper.

## How it's wired in Super Banking

| File | Role |
|---|---|
| `banking_api_server/services/posthog.js` | Singleton client. Returns a no-op stub when `POSTHOG_API_KEY` is unset (tests, dev without analytics). Real client has `enableExceptionAutocapture: true` and graceful `shutdown()` on `SIGINT`/`SIGTERM`. |
| `banking_api_server/middleware/oauthErrorHandler.js` | Calls `posthog.captureException(err, distinctId)` for OAuth errors — copy this pattern for new error handlers. |
| `banking_api_server/services/configStore.js` | Keys: `posthog_api_key`, `posthog_host`. Read via `configStore.getEffective(...)` — **never** `process.env.POSTHOG_*` directly in route handlers (CLAUDE.md non-negotiable). |
| `banking_api_ui/` | The SPA does NOT load `posthog-js`. Token custody / no-third-party-direct-calls rule. All events come from the BFF. |

When adding new capture sites:

```javascript
const posthog = require('../services/posthog');

router.post('/api/transactions', async (req, res) => {
  // ... business logic ...
  posthog.capture({
    distinctId: req.user.id,
    event: 'transaction_created',
    properties: { type, amount, fromAccountId, toAccountId },
  });
});
```

For exceptions in a new route's error handler:

```javascript
posthog.captureException(err, req.user?.id || 'anonymous');
```

## Existing reference workflow (PostHog vendor docs)

These references shipped with the skill. Paths below are relative to this skill directory:

1. [`references/basic-integration-1.0-begin.md`](references/basic-integration-1.0-begin.md) — Begin ← start here if doing a green-field install (not needed for Super Banking)
2. [`references/basic-integration-1.1-edit.md`](references/basic-integration-1.1-edit.md) — Edit
3. [`references/basic-integration-1.2-revise.md`](references/basic-integration-1.2-revise.md) — Revise
4. [`references/basic-integration-1.3-conclude.md`](references/basic-integration-1.3-conclude.md) — Conclusion

Reference docs:

- [`references/node.md`](references/node.md) — Node.js general docs
- [`references/posthog-node.md`](references/posthog-node.md) — `posthog-node` SDK
- [`references/identify-users.md`](references/identify-users.md) — `identify()` patterns

## Key principles (Super Banking flavor)

- **Read config via `configStore.getEffective`** — not `process.env.POSTHOG_*` in route handlers. The wrapper in `services/posthog.js` reads `process.env` exactly once at module load; everywhere else, use the wrapper.
- **Minimal changes**: add `posthog.capture(...)` calls; don't restructure existing routes.
- **Token-custody applies**: the SPA never imports `posthog-js`. PostHog events come from the BFF only. To correlate browser sessions, the BFF can forward a stable distinct ID set on the user session.
- **Always-on server, not short-lived**: this is a long-running Express app — do **not** set `flushAt: 1` / `flushInterval: 0`. The default batching is correct.
- **Identify on OAuth callback**: when `req.session.user` is first hydrated after a successful OAuth callback, call `posthog.identify({ distinctId: user.id, properties: { role, email } })`.

## Identifying users

Identify in `routes/oauth.js` / `routes/oauthUser.js` after `req.session.save()`, before the redirect to the SPA. Use the PingOne `sub` (or your normalized user ID) as `distinctId`. Don't include raw tokens in properties — only profile metadata (role, environment, demo scenario).

## Error tracking

Beyond the OAuth error handler, add `posthog.captureException` at:
- Transaction handler catch-blocks (`routes/transactions.js`) — but **scrub** consent / OTP details first
- MCP-related catches in `services/agentMcpTokenService.js`
- Any new top-level Express error middleware you add

Don't pass `req.session.oauthTokens` or `req.body.consentChallengeId` as properties. PostHog event payloads aren't a secrets store.

## See Also

- [bff-sessions skill](../bff-sessions/SKILL.md) — for the token-custody and log-scrubbing rules that bound what PostHog properties can contain
- [oauth-pingone skill](../oauth-pingone/SKILL.md) — for the OAuth callback path where `identify()` should happen
- [regression-guard skill](../regression-guard/SKILL.md) — for the configStore-vs-process.env rule
