---
phase: 52
slug: pingone-mfa-step-up-research-and-implementation-otp-fido-totp-full-mfa-capability
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-04
---

# Phase 52 — UI Design Contract

> Visual and interaction contract for the PingOne MFA step-up UI (OTP email modal).
> Generated from user requirements: enterprise-grade styling, full email display.

---

## Scope

This UI-SPEC governs the **Email OTP Step-Up Modal** in `UserDashboard.js`:

- The standalone `{/* Email OTP Step-Up Modal */}` overlay (lines ~1541–1620)
- **NOT** the OTP panel inside `TransactionConsentModal.js` (`tx-otp-panel`) — that already has good styling and is the **reference implementation** to match

The goal is to bring the standalone step-up modal up to the same design quality as `TransactionConsentModal`.

---

## User Decisions (locked)

| ID | Decision |
|----|----------|
| D-UI-01 | Enterprise-grade styling — match `TransactionConsentModal` / `tx-otp-panel` quality level |
| D-UI-02 | Show full email address — remove masking; `otpMaskedEmail` → `otpEmail` (full address) |

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (native CSS, no shadcn) |
| Preset | not applicable |
| Component library | none (native HTML + CSS classes) |
| Icon library | Unicode / emoji (existing codebase pattern) |
| Font | system-ui stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) |

---

## Spacing Scale

Inherits existing codebase scale. All values multiples of 4px.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps |
| sm | 8px | Inline padding, compact rows |
| md | 16px | Default element spacing |
| lg | 24px | Modal internal section gaps |
| xl | 32px | Modal padding |

Exceptions: 10px gap on button row (matches `tx-otp-panel__input-row` 0.65rem baseline).

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Modal title | 18px (1.125rem) | 700 | 1.3 |
| Body / lead text | 14px (0.9rem) | 400 | 1.55 |
| OTP digit input | 24px (1.5rem) | 700 | 1 |
| Button label | 15px (0.95rem) | 600 | 1 |
| Error message | 13px (0.82rem) | 500 | 1.4 |
| Expiry hint | 12px (0.75rem) | 400 | 1.4 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#ffffff` | Modal surface |
| Secondary (30%) | `#f8fafc` | Modal overlay backdrop tint |
| Accent (10%) | `#1e3a8a` | Primary button, input focus ring |
| Accent hover | `#1e40af` | Primary button hover |
| Overlay | `rgba(15, 23, 42, 0.55)` | Backdrop (matches `transaction-consent-modal-overlay`) |
| Border default | `#e2e8f0` | Modal border, input border |
| Border focus | `#0ea5e9` | Focused OTP input (sky-500) |
| Error | `#dc2626` | Error border, error text |
| Error bg | `#fff5f5` | Error input background |
| Text primary | `#0f172a` | Modal title |
| Text body | `#374151` | Lead paragraph, labels |
| Text muted | `#6b7280` | Expiry hint, secondary button |
| Ghost button bg | `#ffffff` | "Resend code" button |
| Ghost button border | `#cbd5e1` | "Resend code" button |

Accent (`#1e3a8a` / `#1e40af`) reserved for: primary Verify button, OTP input focus ring only.

---

## Modal Structure (enterprise pattern)

Replace the current inline-styled `token-modal` + `dashboard-toast-error__btn` approach with a **dedicated CSS class set** matching `TransactionConsentModal` conventions:

```
.otp-step-up-overlay        ← full-screen backdrop (replaces .modal-overlay reuse)
.otp-step-up-modal          ← centered card (max-width: 420px, no fixed height)
.otp-step-up-modal__header  ← title row with icon + close button
.otp-step-up-modal__body    ← content area (no flex-scroll overhead)
.otp-step-up-modal__lead    ← email + instruction paragraph
.otp-step-up-modal__input   ← digit input field
.otp-step-up-modal__input--error  ← error state
.otp-step-up-modal__actions ← button row
.otp-step-up-modal__error   ← inline error message
.otp-step-up-modal__hint    ← expiry / secondary hint text
```

**Do NOT reuse `.token-modal`** — that class is shared with the 900px wide token chain viewer.
**Do NOT use `dashboard-toast-error__btn`** — that is a toast action button, not a form action.

---

## Component Specs

### Overlay / Backdrop
- `position: fixed; inset: 0` (not `top/left/right/bottom` — use `inset` shorthand)
- Background: `rgba(15, 23, 42, 0.55)` (darker, more professional than current `rgba(0,0,0,0.7)`)
- `z-index: 10000` (matches `transaction-consent-modal-overlay`)
- Centered with `display: flex; align-items: center; justify-content: center; padding: 1rem`

### Modal Card
- `max-width: 420px; width: 100%`
- `background: #fff`
- `border-radius: 12px`
- `padding: 1.5rem 1.5rem 1.25rem`
- `box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)`
- `border: 1px solid #e2e8f0`
- **No fixed height** — let content size it naturally (the current `token-modal` is sized for the token viewer)

### Header
- Layout: `display: flex; align-items: center; justify-content: space-between`
- Title: `🔐 Verify Your Identity` — 18px, weight 700, color `#0f172a`, no margin above
- Close button: icon-only (`✕`), 28×28px, border-radius 6px, `color: #64748b`, hover background `#f1f5f9`
- **No blue gradient header** — the card border + shadow is sufficient (enterprise modals don't need colored headers for short dialogs)

### Lead Paragraph
- Text: `A 6-digit verification code was sent to {email}. Enter it below to authorise your transaction.`
- `{email}` = **full email address, not masked** (see D-UI-02)
- Email displayed as `<strong>` in `color: #1e3a8a`
- Font: 14px / 0.9rem, color `#374151`, line-height 1.55
- Margin bottom: 16px

### OTP Input Field
- Full-width within modal, `box-sizing: border-box`
- `font-size: 1.5rem; font-weight: 700; letter-spacing: 0.35em`
- `font-variant-numeric: tabular-nums`
- `text-align: center`
- `border: 2px solid #e2e8f0` (default), `border-color: #0ea5e9` (focus)
- `border-radius: 10px`
- `padding: 0.65rem 0.5rem`
- `background: #f8fafc` (subtle tint distinguishes it from modal surface)
- Focus ring: `box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.18)`
- Error state: `border-color: #dc2626; background: #fff5f5; color: #991b1b`
- Placeholder: `000000` (monospaced digits)
- `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`
- Bottom margin: 8px

### Error Message
- Shown below input when `otpError` is set
- `font-size: 0.82rem; font-weight: 500; color: #dc2626`
- `role="alert"` for screen readers

### Button Row
- `display: flex; gap: 10px; margin-top: 16px`
- **Primary — Verify:** `flex: 1`, background `#1e3a8a`, color `#fff`, hover `#1e40af`, border-radius 8px, 10px vertical padding, 0.95rem font, weight 600. Disabled: `opacity: 0.55; cursor: not-allowed`
- **Ghost — Resend code:** `flex: 1`, background `#fff`, border `1px solid #cbd5e1`, color `#334155`, hover background `#f8fafc`, same sizing as primary. Shows loading state: "Sending…" while resend is in flight.

### Hint Text (expiry)
- `font-size: 0.75rem; color: #6b7280; margin-top: 8px; text-align: center`
- e.g. "Code expires at 14:32"

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Modal title | `🔐 Verify Your Identity` |
| Lead paragraph | `A 6-digit verification code was sent to {full-email}. Enter it below to authorise your transaction.` |
| Primary CTA (idle) | `Verify` |
| Primary CTA (loading) | `Verifying…` |
| Secondary CTA (idle) | `Resend code` |
| Secondary CTA (loading) | `Sending…` |
| Invalid code error | `Incorrect code. Please try again.` (or API error message) |
| Expired code error | `Code has expired. Click "Resend code" to get a new one.` |
| Expiry hint | `Code expires at {HH:MM}` |
| Close button aria-label | `Close` |
| Input aria-label | `6-digit verification code` |

---

## Email Display Change

**Server change required** (`banking_api_server/routes/oauthUser.js`):

Remove the masking transform:
```js
// BEFORE (remove this):
const maskedEmail = user.email
  ? user.email.replace(/(.{2}).+(@.+)/, '$1…$2')
  : 'your registered email';
res.json({ otpSent: true, expiresIn: 300, maskedEmail });

// AFTER:
res.json({ otpSent: true, expiresIn: 300, email: user.email || 'your registered email' });
```

**Client change required** (`UserDashboard.js`):
```js
// State rename:
const [otpEmail, setOtpEmail] = useState('');

// On response:
setOtpEmail(data.email || 'your registered email');

// In JSX:
<strong>{otpEmail}</strong>
```

This is a demo app. The user already authenticated and the email is theirs — partial masking adds zero security and degrades UX.

---

## Interaction States

| State | Visual |
|-------|--------|
| Default open | Input empty, Verify button disabled |
| Typing (1–5 digits) | Verify button disabled |
| 6 digits entered | Verify button enabled |
| Submitting | Verify shows "Verifying…", both buttons disabled |
| Error | Red input border + error message below |
| Resend in flight | "Resend code" shows "Sending…", disabled |
| Backdrop click | Close modal (dismiss) |
| Escape key | (same as close — agent's discretion on implementation) |

---

## What NOT to Change

- The `TransactionConsentModal` OTP panel (`tx-otp-panel`) — already well-styled, do not touch
- The `.modal-overlay` / `.token-modal` classes used by the Token Chain modal — do not modify shared classes
- `transaction-consent-btn` class variants — they are correct in `TransactionConsentModal`

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — Copy is specific, enterprise tone, full email shown
- [x] Dimension 2 Visuals: PASS — Matches `TransactionConsentModal` design language, no floating blue gradient header for a 420px dialog
- [x] Dimension 3 Color: PASS — Uses established CSS custom properties (`#1e3a8a`, `#0ea5e9`, `#dc2626`)
- [x] Dimension 4 Typography: PASS — Matches body/label/display scale from `index.css`
- [x] Dimension 5 Spacing: PASS — All values multiples of 4px, consistent with `tx-otp-panel` precedent
- [x] Dimension 6 Registry Safety: PASS — No third-party registries; native CSS only

**Approval:** approved 2026-04-04
