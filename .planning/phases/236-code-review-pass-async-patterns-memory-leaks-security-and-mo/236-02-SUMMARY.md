# Plan 236-02 Summary

**Status:** Complete
**Output:** findings-02.md

## Files reviewed
- server.js (1640 lines)
- routes/transactions.js (649 lines)
- routes/tokenChain.js (53 lines)
- routes/oauth.js (511 lines)

## Finding counts
- Critical: 1
- Major: 7
- Minor: 24

## Key findings

The most important finding is a **Critical type mismatch** in `transactions.js:343` where `fromAccount.balance < amount` compares a numeric balance against the stale string-typed destructured `amount` variable — `req.body.amount` was mutated on line 285 but the destructured binding was never updated. In most cases JavaScript coerces correctly, but non-numeric edge cases can silently allow transactions to bypass the balance check.

The next most significant cluster is **five Major async/shutdown issues**: (1) no `unhandledRejection` handler anywhere in the server entrypoint; (2) the 555-line `POST /api/mcp/tool` handler has no outer try/catch, exposing ~100 lines of setup code to unhandled promise rejections in Express 4; (3) token revocation in both logout handlers is fire-and-forget without `.catch()`; (4) no SIGTERM graceful shutdown handler exists (server handle never stored, `server.close()` never called); and (5) the `oauthMonitor` interval handle is never stored, preventing cleanup on shutdown.

Security posture for the reviewed files is otherwise strong: helmet is fully configured, CORS has no wildcard+credentials issue, rate limiting covers all auth endpoints, IDOR protection on transaction reads passes, and OAuth state/nonce/PKCE validation all pass. The main maintainability concern is the 555-line MCP tool handler in server.js and the 357-line transaction POST handler, both of which mix too many concerns to reason about safely.
