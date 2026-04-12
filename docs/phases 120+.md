# Phases 120+ Status
_Last updated: 2026-04-12_

## Audit 120–135 complete. All 4 cross-phase conflicts resolved.

| Phase | Title | Status | Commit(s) |
|-------|-------|--------|-----------|
| 120 | UI/UX: buttons & navigation | ✅ PASS | — |
| 121 | API Display Modal Enhancement | ❌ NOT EXECUTED | — |
| 122 | Conditional Step-Up Auth | ✅ PASS | — |
| 123 | PingOne MFA Test Page | ✅ PASS | — |
| 124 | MFA HITL Indication | ✅ PASS (partial scope) | — |
| 125 | (directory anomaly — empty dir removed) | ✅ CLEANED | `4c01430` |
| 126 | Surface sub/act as friendly names | ✅ DONE via conflict fix | `4c01430` |
| 127 | Comprehensive Debug & Fix | ⚠️ PARTIAL (2/5 tasks) | — |
| 128 | Quality Audit 120–127 | ✅ PASS | — |
| 129 | Audit Last 15 Todos | ❌ NOT EXECUTED | — |
| 130 | PingOne Asset Verification Rich Table | ✅ PASS | — |
| 131 | Test Page Config & Resources Pass/Fail Details | ⚠️ PARTIAL | — |
| 132 | Full E2E Testing of PingOne Test Page | ✅ PASS | — |
| 133 | PingOne test page UX — per-section API Calls toggles + Agent Token label | ✅ DONE | `97a67fd` |
| 134 | Audit all phases 120+ (meta-audit) | ✅ DONE (this audit) | `4c01430` |
| 135 | MFA test page UX — mirror Phase 133 | ✅ DONE | `7ed0efe` |
| 136 | Token chain reliability audit & hardening | ✅ DONE | `1f0846f` `d68a545` |

## Cross-Phase Conflicts (all resolved)

| # | Description | Resolution | Commit |
|---|-------------|-----------|--------|
| 1 | fmtSub/fmtAct showed raw UUIDs (Phase 126 never executed) | Added identityHints fetch to TokenChainDisplay — friendly names now resolved | `4c01430` |
| 2 | configStore empty strings (adminClientId etc) | Confirmed already fixed by Phase 127 sqlite rebuild | — |
| 3 | Phase 133 → 135 ordering dependency | Noted in planning; Phase 133 completed first | — |
| 4 | Empty `125-124/` directory | Removed | `4c01430` |

## Phase 136 — What Was Fixed (token chain)

**Root cause 1:** `oauth.js` stored token events keyed by `authedUser.id` (internal DB int); `/api/token-chain` read by `req.user.id = decoded.sub` (PingOne UUID). Always different → chain always empty.

**Root cause 2:** `useCurrentUserTokenEvent` hook only called in admin `Dashboard.js`, never in customer `UserDashboard.js`.

**Root cause 3:** Stale fetch guard in `fetchSessionPreview` (`if ctx.events.length > 0 return`) blocked re-fetch after re-auth.

**Fixes shipped:**
- `oauth.js`: use `decoded.sub` as Map key (`1f0846f`)
- `tokenChainService.js`: `synthesizeFromSession()` fallback for post-restart resilience (`1f0846f`)
- `tokenChain.js` route: call synthesis when Map empty (`1f0846f`)
- `UserDashboard.js`: add `useCurrentUserTokenEvent()` hook call on mount (`d68a545`)
- `TokenChainDisplay.js`: remove stale guard; add `isPlaceholder` + `tcd-empty-state` (`d68a545`)

## Other Fixes This Session

| Fix | Files | Commit |
|-----|-------|--------|
| Admin-access modal unreadable (navy CSS bleed from `.modal-header` in UserDashboard.css) | `App.js`, `UserDashboard.css` | `f527568` |

## Remaining Work

| Phase | Description | Priority |
|-------|-------------|----------|
| 131 | "Explain why" detail text per config row | Medium |
| 127 | Finish MFA test page + agent failure debugging | Medium |
| 121 | API Display Modal — execute or formally defer | Low |
| 129 | Audit last 15 todos | Low |
