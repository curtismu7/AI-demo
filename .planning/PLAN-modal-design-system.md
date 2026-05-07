# Modal & Card Design System — UI Overhaul Plan

**Goal:** Visual consistency across all modals, panels, and inner cards in the Super Banking Demo SPA.

**Status:** Phases 1–6 complete as of 2026-05-07.

---

## Phases

### Phase 1 — CSS Design Tokens (complete)

Added 17 modal-level CSS custom properties to `:root` in `banking_api_ui/src/index.css`:

```css
--modal-radius: 12px
--modal-shadow: ...
--modal-header-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)
--modal-header-text: #ffffff
--modal-header-sub: rgba(255,255,255,0.65)
--modal-header-height: 48px
--modal-body-bg: #ffffff
--modal-btn-size: 28px
--modal-btn-bg / --modal-btn-bg-hover
--modal-btn-radius: 6px
--modal-overlay-bg / --modal-overlay-blur
```

Single source of truth — changing these tokens updates every modal simultaneously.

---

### Phase 2 — DraggableModal Base Shell (complete)

Updated `DraggableModal.css`:
- `@keyframes dm-enter` (scale 0.96→1, opacity 0→1, 180 ms) on every modal open
- Backdrop uses `var(--modal-overlay-bg)` + `var(--modal-overlay-blur)`
- Panel: `var(--modal-radius)`, `var(--modal-shadow)`, animation applied
- Titlebar: `min-height: var(--modal-header-height)`, `var(--modal-header-bg)`, `var(--modal-header-text)`
- Header buttons: `var(--modal-btn-size)`, `var(--modal-btn-bg)`, `var(--modal-btn-radius)`
- Scrollbar: 4px indigo thumb on `.dm-scroll`

All modals built on `DraggableModal` automatically inherit these styles.

---

### Phase 3 — TokenChainDisplay Panel (complete)

Migrated `TokenChainDisplay.css` to use modal tokens:
- `.tci-header`: uses `var(--modal-header-bg)`, `var(--modal-header-height)`, text tokens
- `.tci-btn`: uses `var(--modal-btn-bg)`, `var(--modal-btn-size)`, white icon color
- `.tci-panel`: radius/shadow via modal tokens, `dm-enter` enter animation

---

### Phase 4 — Rogue Modal Migration (complete)

Three modals that bypassed `DraggableModal` were migrated so they gain drag/resize/popout for free:

| Modal | Before | After |
|-------|--------|-------|
| `ComplianceModal` | Custom overlay + BroadcastChannel pop-out | Wraps `DraggableModal`; native React Portal pop-out |
| `MissingCredentialsModal` | Custom `mcm-overlay`/`mcm-modal` shell | Wraps `DraggableModal` with footer prop for action buttons |
| `KillSwitchConfirmModal` | Custom backdrop, CSS/JSX class mismatch (pre-existing bug) | Wraps `DraggableModal`; fixed `.ksm-*` class names; removed emojis |

---

### Phase 5 — Inner-Card Design System (complete)

**Problem:** Cards inside modals used inconsistent border widths (3 px vs 4 px), radius (6 px vs 8 px), and no shared tokens.

**Solution:** Added 5 inner-card tokens to `:root`:

```css
--inner-card-radius: 8px
--inner-card-border: 1px solid #e5e7eb
--inner-card-shadow: 0 2px 6px rgba(15, 23, 42, 0.05)
--inner-card-bg: #ffffff
--inner-card-accent: 4px          /* left-border accent strip width */
```

Applied uniformly across 6 components:

| Component | Element |
|-----------|---------|
| `TokenInspector.css` | `.ti-claim-row` — gradient bg, radius, border, left accent |
| `TokenChainDisplay.css` | `.tcd-event-*` — 3 px → 4 px accent (matches token) |
| `MCPToolsListModal.css` | `.mcp-tool-item` |
| `MFALogsModal.css` | `.logs-item` |
| `AccountDetailsPanel.css` | `.adp-account-card` |
| `index.css` | Token definitions |

**Collapsible icon standardisation:** `▶` (CSS `::before`) rotating 90° on expand, consistent across all claim rows in TokenInspector. Matches the existing `tcd-collapsible` chevron pattern in TokenChainDisplay.

---

## Design Decisions

- **Inner-card accent color:** Generic cards use neutral `#d1d5db` (gray-300); semantic cards keep meaningful colors (blue for `act`, green for `may-act`, orange for `aud`, purple for `scope`).
- **Card gradient:** `linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)` — adds subtle depth without competing with content.
- **Hover state:** `border-color: #bfdbfe` (blue-200) + `border-left-color: #93c5fd` (blue-300) — consistent across all inner cards.
- **Chevron:** CSS-only `::before` pseudo-element — no JS required, React state (`expandedClaim`) already existed.

---

## Commits

| Phase | Commit | Message |
|-------|--------|---------|
| 1–3 | (prior session) | `style(modals): Phase 1-3 — design tokens, DraggableModal, TokenChain` |
| 4 | `4eb16958` | `style(modals): Phase 4 — migrate rogue modals to DraggableModal` |
| 5 | `9f034555` | `style(cards): Phase 5 — unified inner-card design system + collapsible icons` |

---

### Phase 6 — Motion guard, header alignment, inner-card token (complete)

**6A — `prefers-reduced-motion` in DraggableModal.css**
Added `@media (prefers-reduced-motion: reduce) { .dm-panel { animation: none; } }` immediately after the `.dm-panel` block. All DraggableModal-based modals now respect user motion preference.

**6B — `prefers-reduced-motion` in DemoServerCheckModal.css**
Added guard disabling `dsm-fade-in` (overlay) and `dsm-slide-up` (box) animations for users with reduced-motion preference.

**6C — DemoServerCheckModal header aligned to dark navy**
`.dsm-header` and `.dsm-title` migrated from light-blue gradient (`#dbeafe → #bfdbfe`) to `var(--modal-header-bg)` / `var(--modal-header-text)`. Added `min-height: var(--modal-header-height, 48px)`. Removed `border-bottom: 1px solid #93c5fd`.

**6D — ServerRestartModal header aligned to dark navy**
`.server-restart-content .modal-header` and its `h2` migrated to the same tokens. ServerRestartModal already had a complete `prefers-reduced-motion` block — left untouched.

**6E — AgentConsentModal warning card**
`.acm-high-value-warning` `border-left: 4px solid #f59e0b` → `border-left: var(--inner-card-accent, 4px) solid #f59e0b`. Amber accent color is intentional (high-value warning signal) — only the width is tokenised.

---

| Commit | Message |
|--------|---------|
| `2733bcc2` | `style(modals): Phase 6 — motion guard, header alignment, inner-card token` |
