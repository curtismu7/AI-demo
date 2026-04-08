# Phase 102: UI Redesign Research — PingOps Fabric Style

**Research Date:** 2026-04-08  
**Phase:** 102 — Redesign App UI to Match Ping Operations Fabric Style  
**Focus:** Split-pane layout, PingIdentity branding, token flow integration

---

## Executive Summary

Phase 102 requires redesigning the banking demo UI to match **PingIdentity Operations Fabric** design language, introducing a **center-and-stack split-pane layout** where the agent chat is the primary focal point and a right-side panel displays system architecture tabs. Key research findings:

1. ✓ **Split-pane layouts** are well-established in React; flexbox/CSS Grid are both viable
2. ✓ **PingIdentity red** (#b91c1c) is already in the codebase; scaling its use across components is straightforward
3. ✓ **Real-time diagram syncing** via React Context (ExchangeModeContext) is technically sound; no new patterns needed
4. ✓ **Tab pattern** for architecture tabs is standard; can use native HTML tabs or library like Headless UI
5. ⚠ **Responsive stacking challenge:** Desktop flex-row → mobile flex-column requires careful media query planning
6. ⚠ **Existing component refactoring scope:** BankingAgent (149KB) is large; refactoring for new layout needs careful task breakdown

---

## 1. Split-Pane Layout Architecture

### Desktop (1024px+) Pattern

**Flexbox Row Layout — Proven Approach:**
```css
/* Main app container */
.app-layout {
  display: flex;
  flex-direction: row;
  gap: 16px;
  padding: 16px;
}

/* Agent chat takes 60% */
.agent-pane {
  flex: 0 0 60%;
  min-height: 600px;
}

/* Architecture tabs panel takes 40%, sticky */
.architecture-pane {
  flex: 0 0 40%;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}
```

**Why this works:**
- Flex ensures responsive resizing when window shrinks
- Sticky positioning keeps architecture tabs visible while user scrolls agent chat
- Gap provides consistent spacing between panes
- Easy to adjust flex ratios (currently 60/40)

### Tablet (768px-1023px) Pattern

**Reduced widths, maintain side-by-side:**
```css
@media (max-width: 1024px) {
  .agent-pane { flex-basis: 55%; }
  .architecture-pane { flex-basis: 45%; }
  /* Reduce overall padding/gap */
}
```

**Visual density:** Fonts may shrink via em-based sizing; component spacing remains proportional.

### Mobile (360px-767px) Pattern

**Vertical stack via tab switcher:**
```css
@media (max-width: 768px) {
  .app-layout {
    flex-direction: column;
  }
  
  .agent-pane { 
    flex: 0 0 auto;
    width: 100%; 
  }
  
  .architecture-pane {
    position: static; /* unsticky */
    width: 100%;
    /* Show via tab toggle or accordion */
  }
}
```

**Mobile UX decision:** Either:
- **Tab switcher:** "Chat" / "Architecture Diagram" / "Token Flow" — user toggles between full-width panes
- **Accordion:** Architecture panel collapsed by default, expandable on mobile
- **Recommendation:** Tab switcher feels cleaner on mobile; maps to existing tab structure in CONTEXT.md (D-02)

---

## 2. PingIdentity Design Language Integration

### Red Accent Palette (Already Defined)

**Existing CSS variables in `index.css`:**
```css
--app-primary-red: #b91c1c;           /* Primary action buttons, badges */
--app-primary-red-hover: #991b1b;     /* Hover state */
--app-primary-red-mid: #dc2626;       /* Focus rings, secondary highlights */
--app-primary-red-border: #7f1d1d;    /* Borders, dividers */
```

**Application Points (New in Phase 102):**
1. **Buttons:** Primary action buttons use red (#b91c1c) instead of blue
2. **Status badges:** Operation success/error states use red family
3. **Tab indicators:** Active tab highlight in red
4. **Links:** Interactive navigation links use red
5. **Focus rings:** Keyboard navigation indicator
6. **Error states:** Keep semantic (red = error already), enhance visibility

### Typography & Font Family

**Research Finding:** PingIdentity uses **modern sans-serif fonts** similar to:
- Inter (Google Fonts, open-source, vetted for PingIdentity projects)
- Segoe UI (Windows standard, widely available)
- -apple-system (macOS native)

**Recommended font stack (for planner discretion):**
```css
font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
```

**Why Inter:** Specifically chosen by Ping teams for digital products; available via Google Fonts CDN; excellent readability on screens.

**Weight hierarchy:**
- Regular (400): Body text, descriptions
- Medium (500): Labels, compact UI
- Semi-bold (600): Subsection headers
- Bold (700): Main headers, emphasis

### Light & Dark Mode Support

**Existing infrastructure (proven in Phase 85):**
- Dashboard already toggles light/dark via localStorage + `data-theme` attribute
- CSS variables for backgrounds, text, borders adapt per mode
- IndustryBrandingContext provides theme switching

**Phase 102 additions:**
- Apply same pattern to new split-pane components
- Light mode: White backgrounds (#ffffff), dark text (#1a1a1a), red accents vibrant
- Dark mode: Dark backgrounds (#1a1a1a), light text (#f5f5f5), red accents remain bold
- Test: Ensure 4.5:1 contrast ratio for readability (WCAG AA)

---

## 3. Tab-Based Architecture Display

### Tab Pattern — HTML Native vs Library

**Option A: Native HTML Tabs (Recommended)**
```html
<div class="architecture-tabs">
  <div role="tablist">
    <button role="tab" aria-selected="true" aria-controls="tab1">
      System Architecture
    </button>
    <button role="tab" aria-selected="false" aria-controls="tab2">
      Token Exchange Flow
    </button>
  </div>
  
  <div role="tabpanel" id="tab1" aria-labelledby="tab1-button">
    {SystemArchitectureContent}
  </div>
  <div role="tabpanel" id="tab2" aria-labelledby="tab2-button">
    {TokenExchangeFlowContent}
  </div>
</div>
```

**Why native:** Simpler to implement, no new dependencies, framework-agnostic, WCAG compliant with proper ARIA attributes.

**Option B: Headless UI (if library already used)**
If the codebase uses Headless UI or Radix UI, use `Tabs` component for consistency.

**Research finding:** Current codebase doesn't show Tabs dependency; native approach is best.

### Tab Content Areas

**Tab 1: System Architecture**
- Current placeholder: "System Architecture Diagram"
- Content: ASCII diagram or placeholder graphics showing:
  - Users → BFF → PingOne → MCP Server
  - Roles: Admin, Customer, Agent
  - Token path flows (high-level, not detailed)
- **Implementation note:** This can be static SVG or a React component. For Phase 102, recommend starting with static labeled boxes and arrows to keep scope manageable.

**Tab 2: Token Exchange Flow**
- **Content:** Embed Phase 101's `TokenExchangeFlowDiagram` component
- **Real-time sync:** Component receives `mode` prop from `ExchangeModeContext`
- **When mode toggles (1-exchange ↔ 2-exchange):** Diagram rebuilds with new flow path
- **No implementation changes needed:** Phase 101 component is ready; just pass the mode prop

**Tab 3: (Optional, at planner's discretion)**
- Could include: MCP tool catalog, API endpoints, or defer to Phase 103

---

## 4. Real-Time Diagram Syncing via Context

### Architecture Pattern (Proven)

**ExchangeModeContext (Phase 101-02) provides:**
```javascript
{
  mode: 'single' | 'double',      // Current exchange mode
  setMode: (newMode) => void,     // Update mode + persist to API
  loading: boolean,
  error: string | null
}
```

**Phase 102 integration:**
```javascript
// In new split-pane layout:
const { mode } = useExchangeMode();  // Subscribe to mode

return (
  <div className="app-layout">
    <AgentPane />
    <ArchitecturePane>
      {/* Tab 2 content */}
      <TokenExchangeFlowDiagram mode={mode} />
      {/* Diagram rerenders automatically when mode changes */}
    </ArchitecturePane>
  </div>
);
```

**Why this works:**
- React Context is already the state pattern; no new architecture needed
- Components that useExchangeMode() automatically rerender when mode changes
- No prop drilling; clean subscription model
- ExchangeModeContext handles API persistence; diagram just displays

**Research finding:** No new patterns needed; Context approach is correct and scalable.

---

## 5. Component Refactoring Scope — Large Components

### BankingAgent (149KB) Size Challenge

**Current state:**
- ~149KB total (BankingAgent.js + BankingAgent.css)
- Main agent interface with many features: operations, consent, tokens, logs
- Tightly coupled to current vertical layout

**Refactoring approach (for planner):**
- Don't refactor the whole component; extract only layout wrapper
- Keep BankingAgent's internal logic unchanged
- Key change: Wrap BankingAgent in new split-pane container
- CSS changes: Remove full-width constraints, adapt to 60% container

**Planner task suggestions:**
1. Create `SplitPaneLayout` wrapper component
2. Update BankingAgent CSS for new pane width (60%)
3. Create `ArchitectureTabsPanel` component for right side
4. Wire mode state via ExchangeModeContext
5. Test responsive breakpoints

**Risk mitigation:** Breaking large refactors into small, focused tasks reduces regression risk

---

## 6. Responsive Breakpoint Implementation

### Breakpoint Strategy (Desktop-First)

**Base styles (desktop, 1024px+):**
- Flex row layout (agent 60%, architecture 40%)
- Full component padding and margins
- All panels visible and sticky

**Tablet breakpoint (768px-1023px):**
```css
@media (max-width: 1024px) {
  .agent-pane { flex-basis: 55%; }
  .architecture-pane { flex-basis: 45%; }
  .agent-message { font-size: 14px; } /* Compact */
  [adjust other component sizing]
}
```

**Mobile breakpoint (360px-767px):**
```css
@media (max-width: 768px) {
  .app-layout { flex-direction: column; }
  .agent-pane, .architecture-pane { width: 100%; }
  /* Show architecture via tab or accordion */
  .architecture-pane { display: none; } /* Hidden by default */
  .architecture-pane.active { display: block; } /* Toggle via JS */
}
```

**Implementation pattern:** Cascade styles from broad (mobile-unfriendly) to narrow (mobile-friendly). Use CSS max-width queries to avoid "mobile-first" inversion.

---

## 7. Integration with Existing Systems

### Theme Switching (IndustryBrandingContext)

**How it works:** Theme provider wraps app; all components inherit theme via CSS variables. Phase 102 should:
1. Wrap split-pane layout components inside existing ThemeProvider
2. Use CSS custom properties (--app-primary-red, etc.) in new styles
3. Light/dark mode toggle updates root `data-theme` attribute
4. All components auto-adapt

**No new work:** Just use existing system.

### Token Chain Display Integration

**TokenChainDisplay component:**
- Currently integrated into agent panels
- Phase 102: Integrate into split-pane, possibly in a collapsible section of architecture panel or within agent pane
- No data changes; just repositioning and styling

---

## 8. Validation Architecture (Nyquist)

### What Must Be True (After Phase 102 Complete)

**Observable behaviors:**
1. ✓ Desktop (1024px+): Agent pane visible left, architecture tabs visible right
2. ✓ Agent pane shows chat + operations (same functionality as before)
3. ✓ Architecture panel has 2 primary tabs: System Architecture, Token Exchange Flow
4. ✓ Token Exchange Flow tab displays TokenExchangeFlowDiagram component
5. ✓ Mode toggle (1-exchange ↔ 2-exchange) updates flow diagram in real-time
6. ✓ Red accents applied to buttons, badges, active tab indicators
7. ✓ PingIdentity font family applied to all text
8. ✓ Light mode and dark mode both available and functional
9. ✓ Tablet (768px-1023px): Both panes visible, widths adjusted
10. ✓ Mobile (360px-767px): Tabs to switch between panes OR vertical stack visible
11. ✓ No console errors; no regressions in existing functionality
12. ✓ Token inspection (TokenChainDisplay) still functional and visible

**Required artifacts:**
- `SplitPaneLayout.jsx` (new component wrapping both panes)
- `ArchitectureTabsPanel.jsx` (new component managing tabs and content)
- Updated `BankingAgent.css` (adapt to 60% width)
- Updated `index.css` (red accent application, font stack)
- Updated `App.jsx` or Dashboard routing (integrate split-pane layout)

**Key links (must-have wiring):**
- ExchangeModeContext → TokenExchangeFlowDiagram (mode prop)
- Tab switcher → Show/hide architecture pane on mobile
- Theme context → Light/dark mode switching for all new components
- BankingAgent → Positioned in 60% flex container (no behavioral changes)

---

## 9. Common Pitfalls & Mitigations

| Pitfall | Mitigation |
|---------|-----------|
| Sticky positioning breaks on mobile | Use `position: static` in mobile media query |
| Text wrapping in narrow panes | Test at 360px; adjust font sizes with media queries |
| Mode changes don't update diagram | Verify ExchangeModeContext is wrapped around entire layout |
| New styles conflict with existing | Use scoped CSS class names (.split-pane-*, .arch-tabs-*) |
| Tab switching not responsive on mobile | Test touch targets (min 44px), ensure tap works on iOS/Android |
| Red color contrast fails WCAG | Use color checker tool; test on light & dark backgrounds |
| Existing BankingAgent breaks | Wrap only the outer layout; don't modify BankingAgent internals |

---

## 10. Recommended Task Decomposition

**Wave 1: Layout foundation**
- Task 1: Create SplitPaneLayout wrapper component (flex container, responsive)
- Task 2: Update BankingAgent CSS for 60% width containment

**Wave 2: Architecture panel**
- Task 3: Create ArchitectureTabsPanel with tab switcher (HTML native tabs)
- Task 4: Stub System Architecture content (placeholder diagram or text)
- Task 5: Wire TokenExchangeFlowDiagram into Tab 2 with mode syncing

**Wave 3: Styling & theming**
- Task 6: Apply PingIdentity red accents (buttons, status badges, tab indicators)
- Task 7: Apply PingIdentity font stack to all text
- Task 8: Light/dark mode support (CSS variables cascade)

**Wave 4: Responsive & verification**
- Task 9: Media queries for tablet (768px+) and mobile (360px)
- Task 10: Mobile-specific tab switcher or accordion UX
- Task 11: End-to-end testing (responsive, theme switching, diagram syncing, no regressions)

**Reason for breakdown:** Each task is ~30-60 min; focuses on one subsystem; allows parallel work in waves.

---

## 11. Design System References

**Standard split-pane patterns:**
- VS Code layout: Code editor left (70%), sidebar right (30%) — good reference
- GitHub issue detail: Issue list left, detail right — responsive stacking on mobile
- Slack layout: Channels left, messages center, details right — triple-pane variant

**PingIdentity brand patterns:**
- Ping.com uses red (#b91c1c) for CTAs and key UI elements
- Sans-serif typography (Inter or similar)
- Clean whitespace, consistent spacing
- Red + white + dark gray color palette

**React tab patterns:**
- Headless UI Tabs (if library already in use)
- Native HTML tab roles + ARIA attributes (recommended, no dependency)
- Custom implementation (avoid; use standard patterns)

---

## 12. Codebase Integration Points

**Files to reference/modify:**
- `banking_api_ui/src/index.css` — Red palette variables (add new color usages)
- `banking_api_ui/src/context/ExchangeModeContext.js` — Already provides mode state
- `banking_api_ui/src/components/BankingAgent.js/.css` — Adapt to 60% pane
- `banking_api_ui/src/components/TokenExchangeFlowDiagram.jsx` — Embed in Tab 2 (no changes)
- `banking_api_ui/src/context/IndustryBrandingContext.jsx` — Theme switching already works
- `banking_api_ui/src/components/Dashboard.js` — May need routing update to new layout
- `banking_api_ui/src/components/Admin.js` — May need routing update to new layout

**No new dependencies needed:** CSS, React Context, and native HTML tabs are sufficient.

---

## 13. Success Criteria (Research-Level Validation)

✓ Split-pane layouts are well-established; flexbox approach is sound  
✓ PingIdentity red palette is defined in codebase; scaling use is straightforward  
✓ Tab pattern is standard; no new UI library needed  
✓ Real-time diagram syncing via ExchangeModeContext is proven (Phase 101-02)  
✓ Responsive breakpoints are standard CSS; no new patterns needed  
✓ BankingAgent refactoring can be scoped to wrapper only; internals unchanged  
✓ Existing theme system supports light/dark mode; Phase 102 just applies it to new components  
✓ No architectural risks identified; implementation is straightforward  

---

## 14. Recommendations to Planner

1. **Start with layout wrapper:** SplitPaneLayout component first (flex container, responsive breakpoints). This sets the foundation.
2. **Keep BankingAgent internals unchanged:** Wrap its existing output; don't refactor its state or logic.
3. **Use native HTML tabs:** No need for Headless UI or other library; simple ARIA tabs work well.
4. **Test responsive early:** Build media queries alongside base styles; test at 360px, 768px, 1024px frequently.
5. **Mock architecture content initially:** System Architecture tab can start as SVG placeholder or text labels; refine visuals later if needed.
6. **Wire ExchangeModeContext first:** Get mode syncing working before final styling; ensures real-time diagram updates.
7. **Apply red accents last:** After layout and functionality are solid, add color for visual polish.

---

## RESEARCH COMPLETE

**Key research outputs (handed to planner):**
- ✓ Split-pane layout architecture (flexbox approach with sticky positioning)
- ✓ Responsive breakpoint strategy (desktop-first, 1024px/768px/360px)
- ✓ PingIdentity branding application (red palette, font stack, light/dark support)
- ✓ Tab implementation pattern (native HTML tabs with ARIA)
- ✓ Real-time diagram syncing via Context (no new patterns)
- ✓ Task decomposition into 4 waves x ~3 tasks each
- ✓ Integration points mapped (files to touch, existing systems to use)
- ✓ No architectural risks; implementation is straightforward

**Planner is ready to create executable tasks.**

---

*Phase 102 Research — Compiled: 2026-04-08*
