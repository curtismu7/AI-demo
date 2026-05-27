# Lighthouse Admin Panel — Design Spec

**Date:** 2026-05-27
**Status:** Approved
**Scope:** Integrate Google Lighthouse performance auditing into the existing Admin panel as a new "Performance" tab.

---

## 1. Overview

Add a Lighthouse performance auditing panel to the admin section of the banking demo app. Admins can trigger on-demand audits and view a history of the last 30 runs with score trends. Audits run against the `/admin` page. No external alerting — failing scores are surfaced visually in the panel only.

---

## 2. Architecture

**Approach:** BFF-side Lighthouse — the `demo_api_server` runs Lighthouse as a Node.js library. No new service or port.

### New BFF Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/lighthouse/run` | Triggers a Lighthouse audit. Auth-gated (admin session required). Returns scores + metrics for the latest run. |
| `GET` | `/api/admin/lighthouse/history` | Returns the stored array of up to 30 audit results. Auth-gated. |

### Data Flow

```
Admin UI
  → POST /api/admin/lighthouse/run  (or scheduler fires)
  → lighthouseService.runLighthouseAudit()
      → chrome-launcher spins up headless Chrome
      → lighthouse() runs audit against https://api.ping.demo:4000/admin
      → chrome-launcher closes Chrome
      → result saved to LMDB (lighthouse_history, capped at 30)
  → scores + metrics returned to UI

Admin UI
  → GET /api/admin/lighthouse/history
  → lighthouseService.getHistory()
  → returns array from LMDB
```

### Scheduler

A `node-cron` job registered at BFF startup. Default schedule: `0 0 * * *` (midnight daily). Configurable via `LIGHTHOUSE_CRON` env var read through `configStore` — changeable at runtime via the `/config` UI without restart. Calls the same `runLighthouseAudit()` function used by the manual route.

---

## 3. Storage

Results stored in LMDB under key `lighthouse_history` as a JSON array, capped at 30 entries. When a new result is added and the array is at 30, the oldest entry is dropped.

### Result shape

```json
{
  "timestamp": "2026-05-27T08:00:00Z",
  "scores": {
    "performance": 91,
    "accessibility": 96,
    "bestPractices": 78,
    "seo": 48
  },
  "metrics": {
    "fcp": 0.9,
    "lcp": 1.2,
    "tbt": 20,
    "cls": 0,
    "si": 2.4
  }
}
```

---

## 4. UI

### Placement
New "Performance" tab in the Admin sidebar nav. Uses the existing `AdminSubPageShell` pattern. Added to the nav array in `AdminSideNav.jsx` only — no layout, icon, or CSS changes (frozen sidebar rule).

### Panel layout
- **Header row:** title, last-run timestamp + next scheduled time, "Run Audit" button (top-right)
- **4 score cards:** Performance, Accessibility, Best Practices, SEO — green ≥90, yellow 50–89, red <50 (red card gets red-tinted background)
- **Trend sparkline:** Performance score across last 30 runs, rendered with `react-chartjs-2` (already in deps)
- **Metrics table:** FCP, LCP, TBT, CLS, Speed Index — each with value and ✅/⚠️ status
- **Style:** White background, dark text, blue accents — matches existing admin panel style

### Loading & error states
- While audit runs: "Run Audit" button disabled with spinner. Audit takes 10–30s.
- On error: inline message below the button (not a toast). No stale result is shown.
- No results yet: empty state message prompting admin to run first audit.

---

## 5. Error Handling

| Scenario | Response | UI |
|----------|----------|----|
| Chrome not installed / launch fails | `503` — `"Lighthouse audit failed: Chrome not available"` | Inline error below Run Audit button |
| Audit times out (>60s) | `504` — timeout message | Inline error |
| LMDB write fails | Result returned to UI, not persisted; `console.error` logged | No UI indication — non-fatal |
| Scheduled run fails | Logged to console, process continues | — |
| Concurrent run attempted | Button disabled while running — UI prevents this | Disabled state |

---

## 6. Dependencies

Added to `demo_api_server/package.json`:
- `lighthouse` — audit engine
- `chrome-launcher` — headless Chrome management (bundled with Lighthouse, listed explicitly)
- `node-cron` — scheduler

No new UI dependencies — `chart.js` and `react-chartjs-2` are already in `demo_api_ui/package.json`.

---

## 7. New Files

| File | Purpose |
|------|---------|
| `demo_api_server/routes/lighthouseRoute.js` | `POST /run` and `GET /history` route handlers |
| `demo_api_server/services/lighthouseService.js` | `runLighthouseAudit()`, `getHistory()`, LMDB cap logic |
| `demo_api_server/services/lighthouseScheduler.js` | `node-cron` job registered at startup |
| `demo_api_server/tests/lighthouseRoute.regression.test.js` | Unit tests |
| `demo_api_ui/src/components/LighthousePanel.js` | Admin panel component |
| `demo_api_ui/src/components/LighthousePanel.css` | Panel styles |
| `demo_api_ui/src/components/LighthouseTrendChart.js` | Sparkline chart component |

## 8. Modified Files

| File | Change |
|------|--------|
| `demo_api_server/server.js` | Mount `lighthouseRoute`; import and start `lighthouseScheduler` |
| `demo_api_ui/src/components/AdminSideNav.jsx` | Add "Performance" to nav array only |
| `demo_api_ui/src/components/Admin.jsx` | Add route case for Performance panel |
| `demo_api_server/package.json` | Add `lighthouse`, `chrome-launcher`, `node-cron` |
| `docs/ENV_VARS.md` | Document `LIGHTHOUSE_CRON` |
| `REGRESSION_PLAN.md` | Add `lighthouseRoute.js` + `lighthouseService.js` to §1 tracked files; add §4 entry |

---

## 9. Testing

- **Regression test** (`lighthouseRoute.regression.test.js`): mock `lighthouse`, `chrome-launcher`, `configStore`. Covers: auth gating on both routes, result shape validation, LMDB cap logic (31st entry drops oldest), `503` on Chrome failure, `504` on timeout.
- **No integration test** for live Lighthouse run — headless Chrome in CI is fragile and slow.
- **Manual verification:** trigger Run Audit via admin UI → result appears in panel → `GET /api/admin/lighthouse/history` returns it.

---

## 10. Out of Scope

- External alerts (email, Slack) on score regression
- Auditing pages other than `/admin`
- Storing the full Lighthouse HTML report (scores + metrics only)
- CI pipeline integration
- Score threshold configuration UI (threshold is implicit: <50 = red, 50–89 = yellow, ≥90 = green)
