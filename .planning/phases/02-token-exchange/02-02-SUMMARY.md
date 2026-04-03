# Phase 02-02 Summary: TokenChainDisplay Claims Strip + Exchange Banner

**Commit:** `6702048`
**Status:** Complete

## What was built

### UI — `banking_api_ui/src/components/TokenChainDisplay.js`

#### Helper functions added (before EventRow)
- `CLAIMS_STRIP_IDS` — set of token event IDs that show claims
- `fmtSub / fmtAud / fmtScope / fmtExpiry / fmtAct` — compact formatters
- `ClaimsStrip({ event })` — inline claim preview row (sub, act, may_act, aud, scope, exp)

#### ExchangeModeBanner (before TokenChainDisplay)
- `EXCHANGE_MODE_MAP` — maps `exchangeMethod` values (`'2-exchange'`, `'with-actor'`, `'subject-only'`) to label, color class, and description string
- `ExchangeModeBanner({ events })` — renders teal/blue/slate banner scanning `currentEvents` for first `exchanged-token` with `exchangeMethod`

#### Wiring in render
- `<ClaimsStrip event={event} />` — wired inside `EventRow` after the hints block (last child of `.tcd-event-content`)
- `{isLive && <ExchangeModeBanner events={currentEvents} />}` — wired before `currentEvents.map(...)` in the `tab === 'current'` block

### UI — `banking_api_ui/src/components/TokenChainDisplay.css`
New CSS appended:
- `.tcd-claims-strip` — flex wrap container, dark background
- `.tcd-cs-item / .tcd-cs-key / .tcd-cs-val` — claim key/value styling
- `.tcd-cs-act / .tcd-cs-may / .tcd-cs-aud / .tcd-cs-scope / .tcd-cs-expired` — colour-coded classes
- `.tcd-exc-banner / .tcd-exc-badge / .tcd-exc-desc` — banner layout
- `.tcd-exc-banner--teal / --blue / --slate` — per-exchange-method colour variants

## Verification
- `npm run build` → `Compiled successfully` (+690 B JS, +274 B CSS gzip)

## Behavioral notes
- `ClaimsStrip` renders only when `event.id` is in `CLAIMS_STRIP_IDS` AND `event.claims` is populated
- `ExchangeModeBanner` renders only when live (`isLive === true`) and an `exchanged-token` event with `exchangeMethod` is present
- No spinner or loading state needed — purely derived from existing `currentEvents`
