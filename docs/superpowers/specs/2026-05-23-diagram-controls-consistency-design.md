# Diagram Controls Consistency — Design Spec

**Date:** 2026-05-23  
**Status:** Approved  
**Scope:** `demo_api_ui/src/components/`

---

## Problem

Five diagram pages exist in the app. Each implements its own controls (zoom, step navigation, path filtering, legends) with no shared components and inconsistent styling:

| Page | Zoom | Step Nav | Path Filter | Legend | Button Style |
|---|---|---|---|---|---|
| Phase266ArchitecturePage | — | — | Inline `PathFilterBar` component | Button swatches | CSS classes |
| HitlSequenceDiagram | `ctrlBtn()` inline | `ctrlBtn()` inline | Scenario dropdown | — | Inline styles |
| ArchitectureDiagramPage | `.arch-zoom-btn` inline | `.arch-ctrl-btn` inline | — | Aud trail + token cards | CSS classes |
| ArchitectureTokenFlowPage | `.arch-zoom-btn` inline | `.arch-ctrl-btn` inline | — | Aud trail + token cards | CSS classes |
| SequenceDiagramPage | — | Sidebar nav buttons | — | Participant list | Inline styles |
| ArchitectureFlowPage | ReactFlow built-in | ReactFlow built-in | — | Node badges | ReactFlow |

**Root cause:** No shared component exists. Every page re-implements the same controls differently.

---

## Goals

1. Extract three reusable components into `components/diagram/`
2. Adopt them across all applicable pages
3. Add zoom to SequenceDiagramPage (currently missing, diagram is 44+ steps tall)
4. Migrate SequenceDiagramPage sidebar nav buttons to the shared toolbar
5. Normalise the HitlSequenceDiagram inline controls to use the shared component
6. Replace the inline legend in HitlSequencePage with the shared DiagramLegend

---

## Non-Goals

- Do not add zoom to Mermaid or ReactFlow pages — those renderers handle zoom natively
- Do not add step-by-step simulation to HitlSequenceDiagram — it already has it (Tasks 1–5 of the HITL step-panel plan are complete as of 2026-05-23)
- Do not add PathFilterBar to HitlSequenceDiagram — the Scenario dropdown already handles path selection
- Do not touch ArchitectureFlowPage beyond colour CSS variables — ReactFlow handles all interaction
- Do not refactor token cards, aud trail, region highlighting, or SVG rendering in any page

---

## Architecture

### New files

```
demo_api_ui/src/components/diagram/
  DiagramControls.jsx     ← zoom + step nav toolbar
  DiagramControls.css     ← all shared button/control styles
  DiagramLegend.jsx       ← passive colour-swatch legend row
  PathFilterBar.jsx       ← interactive path filter buttons
  index.js                ← re-exports all three
```

---

## Component Specifications

### DiagramControls

**File:** `diagram/DiagramControls.jsx`

Renders a horizontal toolbar. Conditionally renders two blocks:
- **Zoom block** — rendered only when `zoom` prop is provided
- **Step nav block** — rendered only when `currentStep` prop is provided

Both blocks are optional and independent. Pages that need only zoom omit the step props; pages that need only step nav omit the zoom props.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `zoom` | number | No | Current zoom (e.g. `1.0`). Omit to hide zoom block. |
| `onZoomIn` | func | With zoom | Increases zoom by step |
| `onZoomOut` | func | With zoom | Decreases zoom by step |
| `onZoomReset` | func | With zoom | Resets zoom to 1.0 |
| `zoomMin` | number | No | Default `0.5` |
| `zoomMax` | number | No | Default `4.0` |
| `zoomStep` | number | No | Default `0.25` |
| `currentStep` | number | No | Active step number. Omit to hide step block. |
| `totalSteps` | number | With step | Total steps |
| `isSimulating` | bool | With step | True while simulation running |
| `isPaused` | bool | With step | True while paused |
| `onSimulate` | func | With step | Start simulation |
| `onPrev` | func | With step | Step back |
| `onPause` | func | With step | Pause |
| `onResume` | func | With step | Resume |
| `onNext` | func | With step | Step forward |
| `onStop` | func | With step | Stop simulation |
| `extra` | node | No | Content rendered left of zoom block (e.g. scenario dropdown, title chip) |

**Zoom block layout:** `[−] [1.0×] [+] [↺]`  
**Step block layout:** `[← Prev] [Pause] [Resume] [Next →] [Stop] [step counter]`  
Simulate button appears in place of Pause/Resume/Next/Stop when `!isSimulating`.

**Styles:** All button styles live in `DiagramControls.css` using `.dc-*` class prefix. Extracted from existing `.arch-zoom-btn`, `.arch-ctrl-btn`, `.arch-ctrl-btn--pause`, `.arch-ctrl-btn--resume`, `.arch-ctrl-btn--next`, `.arch-ctrl-btn--stop`, `.arch-ctrl-btn--prev` in `ArchitectureDiagramPage.css`.

---

### DiagramLegend

**File:** `diagram/DiagramLegend.jsx`

Passive display component. Renders a list of colour-swatch + label pairs. No click handlers — use `PathFilterBar` when interactivity is needed.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `items` | array | Yes | `[{ key, label, color, description? }]` |
| `activeKey` | string\|null | No | Highlights matching item, dims others |
| `layout` | `'row'`\|`'column'` | No | Default `'row'` |

Styled within `DiagramControls.css` using `.dl-*` class prefix.

---

### PathFilterBar

**File:** `diagram/PathFilterBar.jsx`

Extracted from `Phase266ArchitecturePage.jsx` (lines 123–159). Generalised to accept any `paths` array. Renders one button per path plus an "All" button.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `paths` | array | Yes | `[{ key, label, color }]` — null key = "All" button |
| `selectedPath` | string\|null | Yes | Currently active path key |
| `onSelect` | func | Yes | Called with key (null = All) |
| `className` | string | No | Extra class on wrapper div |

Active button styling: path-coloured background + border matching the path swatch colour. Behaviour (CSS opacity dimming on SVG nodes) is controlled by the consuming page — `PathFilterBar` only handles the button UI.

Styled within `DiagramControls.css` using `.pfb-*` class prefix.

---

## Per-Page Migration

### Phase266ArchitecturePage.jsx

**Change:** Extract inline `PathFilterBar()` function (lines 123–159) → import shared component.

- Remove inline `PathFilterBar` function definition
- Extract hardcoded paths array to module-level `P266_PATHS` constant
- Add `import { PathFilterBar } from './diagram'`
- Pass `className="p266-filter-bar"` to preserve existing dimming CSS hook
- `tagPathNodes()`, `PATH_NODE_MAP`, Mermaid render logic, all CSS: **unchanged**

Net: ~40 lines removed, 2 lines added.

---

### HitlSequenceDiagram.js

**Context:** Tasks 1–5 of the HITL step-panel plan are complete as of 2026-05-23. Task 5 added an inline controls bar using a `ctrlBtn()` helper with inline styles. Tasks 6–8 (SVG renderer + HitlSequencePage update) are pending.

**Change:** Replace inline controls bar with `DiagramControls`.

- Import `{ DiagramControls }` from `'./diagram'`
- Replace the `<div>` controls bar (buttons rendered with `ctrlBtn()`) with `<DiagramControls>`, passing:
  - `zoom={zoomLevel / 100}` (existing state is percent 50–200; DiagramControls expects decimal 0.5–2.0), `onZoomIn={() => setZoomLevel(z => Math.min(200, z + 25))}`, `onZoomOut={() => setZoomLevel(z => Math.max(50, z - 25))}`, `onZoomReset={() => setZoomLevel(100)}`
  - `currentStep={currentStepIdx + 1}`, `totalSteps={steps.filter(s => s.step).length}`
  - `isSimulating`, `isPaused`, `onSimulate={runSimulation}`, `onPrev={prevStep}`, `onPause={pause}`, `onResume={resume}`, `onNext={nextStep}`, `onStop={stopSim}`
  - `extra={<select …>…</select>}` — Scenario dropdown passed through `extra` prop
- Remove `ctrlBtn()` helper function
- Retain all simulation state, handlers, StepInfoPanel, SVG renderer — unchanged

Net: ~60 lines inline buttons → ~10 lines `<DiagramControls>`.

---

### HitlSequencePage.jsx

**Context:** After Task 7 of the HITL plan, this file renders `HitlSequenceDiagram` plus a page header and an inline PATHS legend (colour chips with inline styles).

**Change:** Replace inline PATHS legend chips with `DiagramLegend`.

- Import `{ DiagramLegend }` from `'./diagram'`
- Replace the `{PATHS.map(...)}` inline legend JSX → `<DiagramLegend items={HITL_PATHS} />`
- Rename `PATHS` → `HITL_PATHS` for clarity (used only in this file)
- Page header: unchanged

Net: ~15 lines inline JSX → 1 line component.

---

### ArchitectureDiagramPage.js

**Change:** Replace inline zoom + step nav buttons with `DiagramControls`.

- Import `{ DiagramControls }` from `'./diagram'`
- Replace `.arch-diagram-zoom-controls` div and `.arch-step-controls` div → single `<DiagramControls zoom={zoom} onZoomIn={…} currentStep={currentStep} totalSteps={totalSteps} …>`
- All zoom/step state and handlers stay in the page component — they become props
- Remove from `ArchitectureDiagramPage.css`: `.arch-zoom-btn`, `.arch-zoom-label`, `.arch-diagram-zoom-controls`, `.arch-ctrl-btn`, `.arch-ctrl-btn--*`, `.arch-step-controls`, `.arch-step-label` — these move to `DiagramControls.css`
- Token cards, aud trail, region highlighting, SVG overlay: **unchanged**

Net: ~80 lines of inline button JSX + CSS removed.

---

### ArchitectureTokenFlowPage.js

Same change as ArchitectureDiagramPage — it uses the same toolbar pattern.

- Import `{ DiagramControls }` from `'./diagram'`
- Replace inline zoom + step controls → `<DiagramControls>`
- No CSS changes needed (shares `ArchitectureDiagramPage.css`)

---

### SequenceDiagramPage.js

**Changes:**

1. **Add zoom** — `useState(1.0)` zoom state + `handleZoomIn/Out/Reset` handlers. Apply `transform: scale(zoom)` on SVG wrapper div.
2. **Migrate sidebar nav buttons** → `DiagramControls` toolbar rendered above the split layout.
3. **Sidebar step list** — keep as read-only step names. Users can still click a step name to jump (when paused). Remove nav buttons from sidebar, keep list.

- Import `{ DiagramControls }` from `'./diagram'`
- Add zoom state and handlers (same pattern as ArchitectureDiagramPage)
- Replace sidebar Prev/Pause/Next/Stop buttons with `<DiagramControls zoom={zoom} currentStep={…} …>` above the `<div style={{ display: 'flex' }}>` split
- Sidebar: remove button controls, keep step name list

Net: sidebar simplified, toolbar added with zoom, consistent with other simulation pages.

---

### ArchitectureFlowPage.js

**No shared component adoption.** ReactFlow's built-in `<Controls>` and `<MiniMap>` handle zoom and navigation. Replacing them would break ReactFlow's internal state.

**Optional minor improvement:** Extract token card border colours to CSS custom properties in `DiagramControls.css` (e.g. `--dc-token-oauth: #2563eb`) so colours stay in sync with other pages. This is additive-only — no JSX changes.

---

## Styling Conventions

All shared styles live in `DiagramControls.css` with three namespaced prefixes:

- `.dc-*` — DiagramControls toolbar elements
- `.dl-*` — DiagramLegend elements  
- `.pfb-*` — PathFilterBar elements

Source styles come from `ArchitectureDiagramPage.css` `.arch-zoom-*` and `.arch-ctrl-*` blocks — these are the reference implementation. The CSS blocks are moved, not reimplemented. `ArchitectureDiagramPage.css` removes those blocks; `DiagramControls.css` gains them with renamed selectors.

---

## Coordination with HITL Step-Panel Plan

The HITL step-panel plan (2026-05-23) and this spec touch overlapping files. Ordering:

- Tasks 1–5 of the HITL plan are **complete**.
- Tasks 6–8 (SVG renderer, HitlSequencePage.jsx update, final build) are **pending**.
- This spec's HitlSequenceDiagram change (inline controls → DiagramControls) **must land after** Task 5 and **can land before or after** Tasks 6–8.
- If Tasks 6–8 land first, the HitlSequencePage.jsx DiagramLegend change is a one-line follow-up. If this spec lands first, Tasks 6–8 adopt DiagramLegend as part of the Task 7 HitlSequencePage rewrite.
- No merge conflicts possible — changes are additive or replacing inline code.

---

## Acceptance Criteria

- [ ] `demo_api_ui/src/components/diagram/` exists with 5 files: `DiagramControls.jsx`, `DiagramControls.css`, `DiagramLegend.jsx`, `PathFilterBar.jsx`, `index.js`
- [ ] Phase266ArchitecturePage: inline PathFilterBar function removed; shared component imported; path dimming and Mermaid render unchanged
- [ ] HitlSequenceDiagram: inline controls bar replaced with `<DiagramControls>`; Scenario dropdown in `extra` prop; `ctrlBtn()` helper removed
- [ ] HitlSequencePage: inline legend chips replaced with `<DiagramLegend>`
- [ ] ArchitectureDiagramPage + ArchitectureTokenFlowPage: inline zoom and step nav buttons replaced with `<DiagramControls>`; removed CSS blocks migrated to `DiagramControls.css`
- [ ] SequenceDiagramPage: zoom state added; sidebar nav buttons replaced with `<DiagramControls>`; sidebar step list kept as read-only
- [ ] ArchitectureFlowPage: unchanged (ReactFlow handles zoom/nav)
- [ ] `cd demo_api_ui && npm run build` exits 0
- [ ] All five diagram pages render and simulate correctly in browser
- [ ] No new `console.error` or unhandled rejections
