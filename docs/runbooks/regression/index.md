# Regression Testing — Quick Reference

This folder contains focused runbooks for each regression layer.
No single file is allowed to exceed ~300 lines so context windows stay manageable.

| File | Covers |
|------|--------|
| [api-session.md](api-session.md) | Jest session/OAuth unit tests; BFF store ping; auth state cookies |
| [ui-browser.md](ui-browser.md) | Playwright browser E2E: customer dashboard, landing page, admin dashboard, Banking Agent |
| [post-deploy.md](post-deploy.md) | Manual smoke checks after production or preview deploys |

**Toast notifications**: User-visible success / error / warning should use **`appToast`** (`notify*`); session + Sign-in use **`dashboardToast`**. See **`REGRESSION_LOG.md`** (2026-03-26 — UI notifications) and **post-deploy.md** §4 (step-up toast).

## Run everything (CI order)

```bash
# 1. API + session unit tests
npm run test:session

# 2. UI smoke (no running server needed — mocked API)
npm run test:e2e:ui:smoke

# 3. Full Playwright suite (needs CRA dev-server or build)
cd banking_api_ui && npm run test:e2e:ci
```
