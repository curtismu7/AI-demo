# Phase 185 Research — Token Color Legend + Consistent Color Coding

## Key Finding: Phase 188 Pre-Empted Core Work

**Most of Phase 185 was implemented during Phase 188 (RFC 8693 taxonomy)'s Token Color System creation.**

---

## Q1: What's Already Done?

### TokenColorSystem.js — CREATED (Phase 188)
`banking_api_ui/src/components/TokenColorSystem.js` contains:
- `deriveTokenCategory(label, eventId, eventTokenType)` → `'subject' | 'actor' | 'mcp' | null`
- `TokenColorDot` React component — renders colored circle (inline styles)
- `TokenColorLegend` React component — compact inline legend bar (inline styles)
- `getTokenColor(type)` — hex color lookup for non-React contexts
- Colors: subject=#dc2626, actor=#2563eb, mcp=#16a34a (matches CONTEXT.md D-03)
- Labels: "Subject Token (RFC 8693 §2.1)", "Actor Token (RFC 8693 §2.2)", "MCP-Scoped Access Token (RFC 8693 §3.2)"

### TokenChainDisplay.js — DONE
- Imports: `deriveTokenCategory`, `TokenColorDot`, `TokenColorLegend`, `getTokenColor`
- Line 748: `<TokenColorDot>` in EventRow before event label ✅
- Line 406: Color dot used in `openInNewWindow()` HTML template ✅
- Line 1137: `<TokenColorLegend />` at bottom of panel ✅

### DecodedTokenPanel.jsx — DONE (pre-existing)
- Imports `deriveTokenCategory`
- Shows 🔴🔵🟢 emoji in panel header per CONTEXT.md D-02/D-09

### TokenDisplay.jsx — DONE
- Imports: `deriveTokenCategory`, `TokenColorDot`
- Line 88: renders `<TokenColorDot>` in header ✅

---

## Q2: What Phase 185 Still Needs to Do

### Gap 1: No CSS classes for `.token-color-dot` / `.token-color-legend`
Both components use **inline styles only**. There are `.tcd-token-type` CSS classes in TokenChainDisplay.css but no dedicated classes for the color system. This is acceptable for now (inline styles work) but adding CSS classes enables theme overrides.

**Verdict:** Add `.token-color-dot` and `.token-color-legend` classes to TokenDisplay.css for consistency. Not blocking.

### Gap 2: PingOneTestPage missing TokenColorLegend
`PingOneTestPage.jsx` uses `DecodedTokenPanel` which has emoji but no `TokenColorLegend` to orient users near the "Token Exchange Tests" section.

**Verdict:** Add `<TokenColorLegend />` import + render near the Token Exchange Tests section header.

### Gap 3: ROADMAP goal is stale
Phase 185 goal says "[To be planned]" — should reflect that core system is done, phase completes integration.

---

## Q3: Token Type Badge CSS (`.tcd-token-type`)
TokenChainDisplay.css has `.tcd-token-type--user_token`, `--agent_token`, `--exchanged_token` badges. These use DIFFERENT colors than the RFC 8693 color system (blue for user_token = wrong). These should be updated to match:
- `--user` → red (#dc2626 family) — subject token
- `--agent` → blue (#2563eb family) — actor token  
- `--exchanged` → green (#16a34a family) — MCP token (already green ✅)

Current `--user_token` is navy/blue, `--agent_token` is purple — inconsistent with dots.

---

## Q4: Education Components
Per CONTEXT.md D-10: defer education components (ActorTokenEducation) to separate phase. Out of scope.

---

## Summary: Phase 185 Actual Work

| Task | Status |
|------|--------|
| Create TokenColorSystem.js | ✅ Done (Phase 188) |
| TokenChainDisplay dots + legend | ✅ Done (Phase 188) |
| TokenDisplay dot | ✅ Done (Phase 188) |
| DecodedTokenPanel emoji | ✅ Done (pre-existing) |
| openInNewWindow color dot | ✅ Done (Phase 188) |
| CSS classes for color system | ❌ Gap — inline styles only |
| PingOneTestPage legend | ❌ Gap — missing |
| tcd-token-type badge colors inconsistent | ❌ Gap — user=blue, should be red |

**Phase 185 is now a light cleanup phase** — 2 tasks remain.

---

## Validation Architecture

### Test Strategy: Visual inspection + grep verification
- PingOneTestPage — `grep "TokenColorLegend"` confirms legend added
- TokenDisplay.css — `grep "token-color-dot"` confirms CSS added
- TokenChainDisplay.css — `grep "tcd-token-type--user"` confirms color fix
- Build: `npm run build` exits 0

### No automated tests needed
UI rendering correctness verified via build + visual check.
