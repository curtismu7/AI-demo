# Regression Testing — Quick Reference

This folder contains focused runbooks for each regression layer.
No single file is allowed to exceed ~300 lines so context windows stay manageable.

| File | Covers |
|------|--------|
| [api-session.md](api-session.md) | Jest session/OAuth unit tests; BFF store ping; auth state cookies |
| [ui-browser.md](ui-browser.md) | Playwright browser E2E: customer dashboard, landing page, admin dashboard, Banking Agent |
| [post-deploy.md](post-deploy.md) | Manual smoke checks after production or preview deploys |
| [../PINGONE_AUTHORIZE_PLAN.md](../PINGONE_AUTHORIZE_PLAN.md) | PingOne Authorize integration plan (decision endpoints, overview links) |

**Toast notifications**: User-visible success / error / warning should use **`appToast`** (`notify*`); session + Sign-in use **`dashboardToast`**. See **`REGRESSION_LOG.md`** (2026-03-26 — UI notifications) and **post-deploy.md** §4 (step-up toast).

**Split dashboard agent** (2026-03-27): **Split view** embeds **`BankingAgent`** with **`splitColumnChrome`** (navy header, session id, **Sign out**, compact input + **Send**, suggestion chips). Scroll the transcript and the lower tray independently. See **`REGRESSION_LOG.md`** (2026-03-27 — split-column agent UX + SecureBank-style chrome).

**Agent UI placement** (2026-03-27): `AgentUiModeContext` now stores `{ placement: 'middle' | 'bottom' | 'none', fab: boolean }` under `banking_agent_ui_v2`. Toggle renders **Middle / Bottom / Float** buttons; **+ FAB** checkbox appears when placement is `middle` or `bottom` (Middle+Bottom together not permitted). Key regressions: (1) toggle persists across reload; (2) Middle sets `split3` layout with slim token-chain column (`160–200px`); (3) Bottom renders `EmbeddedAgentDock` flush to page content with drag-to-resize handle as the visual seam; (4) Float shows FAB only.

**Bottom dock integration** (2026-03-27): Resize handle moved to top of dock (acts as the join between page content and panel — no gap). Collapsed state retains rounded-pill top corners; expanded state is flush/square. `padding-bottom` removed from `.user-dashboard--embed-agent`. Dark-theme overrides updated.

## Run everything (CI order)

```bash
# 1. API + session unit tests
npm run test:session

# 2. UI smoke (no running server needed — mocked API)
npm run test:e2e:ui:smoke

# 3. Full Playwright suite (needs CRA dev-server or build)
cd banking_api_ui && npm run test:e2e:ci
```
