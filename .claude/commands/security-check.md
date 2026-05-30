---
description: Scan the banking demo for common security vulnerabilities + custody-rule violations
allowed-tools: Read, Grep, Glob
---

Analyze the codebase at $1 (or current directory if no argument) for:

**Generic web vulnerabilities:**
- SQL injection risks (raw queries, unparameterized inputs)
- XSS vulnerabilities (unsanitized user input in rendered output, `dangerouslySetInnerHTML`)
- Exposed credentials (hardcoded keys, secrets in non-`.env` files; check `.env.example` is not real)
- Insecure configurations (debug mode in prod, open CORS, weak auth)
- Dependency confusion risks in package manifests

**Banking-demo-specific violations:**
- **Token custody rule** (CLAUDE.md, REGRESSION_PLAN §1): any code path that exposes an OAuth access/refresh/id token to `banking_api_ui/`. Look for: JSON responses containing token fields, `localStorage.setItem('*token*', ...)`, `Authorization:` headers set in UI fetch calls instead of `bffAxios` cookie-only.
- **Plain `axios` import in `banking_api_ui/src/**`** — must use `bffAxios` for BFF calls (cookie credentials carry the session).
- **`SKIP_TOKEN_SIGNATURE_VALIDATION=true`** referenced in code without the production fatal-exit guard (`server.js:37`).
- **OTP handling**: any new OTP code path that stores the raw OTP in session instead of an HMAC-SHA256 hash with per-challenge salt (`services/transactionConsentChallenge.js` is the reference pattern). Compare with `crypto.timingSafeEqual`, not `===`.
- **Hardcoded `localhost`** in `banking_api_server/routes/oauth*.js` — REGRESSION_PLAN §1 OAuth-callback-origin rule.
- **Missing `req.session.save()`** before an OAuth redirect — async stores need the explicit flush.
- **Loosened CSP** in Helmet config (`'unsafe-inline'`, `*`, missing `https://*.pingone.com`).

For each issue found:
1. Show the exact file and line number.
2. Explain why it's a risk in **this** repo's context (cite REGRESSION_PLAN or CLAUDE.md rule when applicable).
3. Suggest the specific fix.

If nothing is found, say so clearly. Do not invent issues.
