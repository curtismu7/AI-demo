---
phase: 141
slug: local-setup-wizard-guided-pingone-configuration
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-13
---

# Phase 141 — UI Design Contract

> DRAFT spec for the guided local PingOne configuration wizard. Creates PingOne objects (app, resource, scopes, SPEL mapping, worker credentials) via BFF calls, then generates `.env` file output. App is fully runnable on completion.
>
> **Status:** DRAFT — context discussion (`/gsd-discuss-phase 141`) must lock decisions before planning begins.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none |
| Icon library | Unicode (✓ ✗ 🔄 chevron arrows) |
| Font | system-ui, -apple-system, sans-serif |

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline padding |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: none

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px (0.875rem) | 400 | 1.5 |
| Label | 14px (0.875rem) | 500 | 1.4 |
| Heading | 20px (1.25rem) | 600 | 1.4 |
| Step title | 16px (1rem) | 600 | 1.4 |
| Step subtitle | 13px (0.8125rem) | 400 | 1.5 |
| Code / env output | 12px (0.75rem) | 400 | 1.6 (monospace) |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | #ffffff | Page/step card backgrounds |
| Secondary (30%) | #004687 (--chase-navy) | Wizard header, step numbers (active) |
| Step active | #004687 | Active step number circle, active border |
| Step complete | #16a34a | Completed step circle (✓) |
| Step incomplete | #d1d5db | Incomplete step circle (future) |
| Step error | #b91c1c | Failed step circle (✗) |
| CTA primary | #004687 | "Next" / "Execute" / "Copy" buttons |
| CTA primary hover | #003DA5 | |
| Destructive | #b91c1c | "Reset" / error states |
| Code block bg | #f8fafc | ENV file output / snippet boxes |
| Success banner | #dcfce7 | Completion screen background |

Accent reserved for: step progress indicator and primary CTA only.

---

## Wizard Step Structure (Proposed — subject to context discussion)

```
┌──────────────────────────────────────────────────────────┐
│  BX Finance — PingOne Setup                              │  ← navy header
└──────────────────────────────────────────────────────────┘

  ① PingOne Credentials  ──  ② Create Application  ──
  ③ Create Resource  ──  ④ Create Scopes  ──
  ⑤ SPEL Attribute Mapping  ──  ⑥ Generate .env  ──
  ⑦ Complete

  ┌────────────────────────────────────────────────┐
  │  Step 1: PingOne Credentials                   │  ← step card
  │  ─────────────────────────────────────────────  │
  │  Environment ID  [____________________________] │
  │  Worker App Client ID  [_______________________] │
  │  Worker App Client Secret  [___________________] │
  │                                                  │
  │  [ Verify Connection ]                           │
  │  → Result: ✓ Connected to environment XYZ       │
  └────────────────────────────────────────────────┘

  [ ← Back ]                           [ Next → ]
```

### Step indicator states

| State | Circle | Style |
|-------|--------|-------|
| Complete | ✓ | Green (#16a34a) filled, white checkmark |
| Active | N | Navy (#004687) filled, white number |
| Incomplete | N | Gray (#d1d5db) filled, gray number |
| Error | ✗ | Red (#b91c1c) filled, white X |

### Step cards

- Background: #ffffff
- Border: 1px solid #e5e7eb
- Border-radius: 8px
- Box-shadow: 0 1px 3px rgba(0,0,0,0.08)
- Active step card: border 2px solid #004687

---

## API Call Result Display

For each step that calls the BFF:

```
  ✓ Application created — Client ID: abc123...  [Copy]
  ✗ Scope creation failed — invalid_grant: Worker app missing management scope
    → Fix: Assign p1:read:env and p1:create:app to your worker app
```

- Success prefix: ✓ green text (#16a34a)
- Error prefix: ✗ red text (#b91c1c)  
- Error shows one-line reason + one-line fix hint
- Persists in localStorage (can resume after page reload)

---

## ENV Output Step (Final)

```
┌────────────────────────────────────────────────────────────────┐
│  Generated .env                                                │
│  ──────────────────────────────────────────────────────────   │
│  PINGONE_ENV_ID=xxxxxxxx-...                                   │
│  PINGONE_CLIENT_ID=xxxxxxxx-...                               │
│  PINGONE_CLIENT_SECRET=...                                    │
│  PINGONE_REDIRECT_URI=http://localhost:3000/callback          │
│  ... (all variables)                                          │
│                                                               │
│  [ 📋 Copy .env ]                                             │
│                                                               │
│  Save this file as .env in the repository root.              │
│  Then run: npm start                                          │
└────────────────────────────────────────────────────────────────┘
```

- Code block: font-family monospace, 12px, background #f8fafc, padding 16px, border-radius 6px
- Secrets masked by default, reveal toggle available
- "Copy .env" uses Clipboard API (toast on success/failure, matching existing app pattern)

---

## Completion Screen

```
┌────────────────────────────────────────────────────────────────┐
│  🎉 Setup Complete                                             │
│  Your PingOne environment is configured and ready.            │
│                                                               │
│  ✓ Application created                                         │
│  ✓ Resource server created                                     │
│  ✓ Scopes created                                             │
│  ✓ SPEL mapping configured                                     │
│  ✓ .env generated                                             │
│                                                               │
│  [ Open Dashboard → ]       [ Start Over ]                    │
└────────────────────────────────────────────────────────────────┘
```

- Background: #dcfce7 (light green success)
- "Open Dashboard" → navigates to `/dashboard`
- "Start Over" → clears localStorage state and resets wizard

---

## Persistence

- Wizard state persisted to `localStorage` key: `pingoneSetupWizard.v1`
- Fields stored: step number, completed steps, all created object IDs
- Secrets are **NOT** persisted to localStorage
- On reload: resume from last completed step (credentials must be re-entered)

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Wizard title | "BX Finance — PingOne Setup" |
| Step 1 | "PingOne Credentials" |
| Step 2 | "Create Application" |
| Step 3 | "Create Resource Server" |
| Step 4 | "Create Scopes" |
| Step 5 | "SPEL Attribute Mapping" |
| Step 6 | "Generate .env" |
| Step 7 | "Complete" |
| Verify CTA | "Verify Connection" |
| Execute CTA | "Create [Object Name]" |
| Next CTA | "Next →" |
| Back CTA | "← Back" |
| Copy CTA | "📋 Copy .env" |
| Copy success toast | "Copied to clipboard" |
| Copy error toast | "Copy failed — check browser permissions" |
| Completion heading | "Setup Complete" |
| Completion body | "Your PingOne environment is configured and ready." |
| Open dashboard | "Open Dashboard →" |
| Start over | "Start Over" |

---

## Open Questions (Context Discussion)

These decisions are DEFERRED until `/gsd-discuss-phase 141`:

1. **Step pattern** — Numbered tabs (horizontal progress bar) vs accordion vs single-page card stack?
2. **All-in-one vs sequential** — Single "Run All Steps" button OR step-by-step wizard?
3. **SPEL mapping format** — Manual text input OR pre-built from known attribute list?
4. **Secret masking** — Always-hidden, toggle reveal, or never stored / only shown once?
5. **Resume behavior** — Resume from last step, or always re-enter credentials first?
6. **Route** — `/setup/wizard` vs `/onboarding/pingone` vs new route?
7. **Error recovery** — Retry individual step only, or rerun all from current?
8. **Existing SetupPage** — Replace, extend, or create new page alongside it?

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| None (CSS-only, TBD) | n/a | not required |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PENDING context discussion
- [ ] Dimension 2 Visuals: PENDING context discussion
- [ ] Dimension 3 Color: PASS (draft) — Chase navy + green/red status follows existing patterns
- [ ] Dimension 4 Typography: PASS (draft) — 14px body, 16px step, 12px code
- [ ] Dimension 5 Spacing: PASS (draft) — 4px grid maintained
- [ ] Dimension 6 Registry Safety: PASS (draft) — no registry planned

**Approval:** pending — run `/gsd-discuss-phase 141` to lock open questions, then re-approve spec.
