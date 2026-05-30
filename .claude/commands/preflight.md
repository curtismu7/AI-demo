---
description: Pre-commit check for the banking demo — UI build, debug artifacts, regression checks
allowed-tools: Bash(git *), Bash(grep *), Bash(npm *), Bash(npx *), Bash(cd *), Read, Glob
---

Run a full preflight check before committing. In order:

1. **Scan staged files for debug artifacts:**
   - `console.log`, `debugger`, `TODO`, `FIXME`
   - Hardcoded `localhost` URLs in `routes/oauth*.js` (REGRESSION_PLAN §1)
   - Emojis in `banking_api_ui/src/**` (REGRESSION_PLAN §0 — banking apps are professional)
   - Report file + line number for each hit.

2. **UI build (if banking_api_ui changed):**
   - `cd banking_api_ui && npm run build`
   - Exit code must be 0 (CLAUDE.md §3 non-negotiable).
   - If it fails, show only the errors.

3. **Critical regression tests (if banking_api_server or HITL flows changed):**
   ```
   npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration
   ```
   - Expected: 43 tests, all passing.

4. **REGRESSION_PLAN §1 check:**
   - For each staged file, check if it appears in the protected-file table at the top of REGRESSION_PLAN.md.
   - If yes, surface which §1 row applies and quote the "what breaks if touched" line.

5. **Final summary:**
   - All-clear: safe to commit.
   - Failed: list what failed and where — do not auto-fix anything.

Do not make any changes. Report only.
