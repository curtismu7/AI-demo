---
name: diagram-components
description: 'Shared React diagram components in demo_api_ui. USE FOR: adding or editing DiagramControls, DiagramLegend, PathFilterBar; adding zoom/step-nav/filter bars to any diagram page; creating a new diagram page; reviewing colour palette, CSS namespaces, or simulation state conventions. DO NOT USE FOR: ReactFlow pages (ArchitectureFlowPage handles its own controls); Mermaid render logic; SVG path/node layout code.'
argument-hint: 'Describe the diagram page or control feature you are adding or modifying'
---

# Diagram Components — Shared React Diagram UI

## Component location

All shared diagram UI lives in one directory:

```
demo_api_ui/src/components/diagram/
  DiagramControls.jsx   — zoom + step-nav toolbar
  DiagramControls.css   — all shared styles (.dc-*, .dl-*, .pfb-*)
  DiagramLegend.jsx     — passive colour-swatch legend
  PathFilterBar.jsx     — interactive path filter buttons
  index.js              — re-exports all three
```

Import from the barrel:
```js
import { DiagramControls, DiagramLegend, PathFilterBar } from './diagram';
```

All three components are wrapped in `React.memo` — they are pure presentational components.

---

## DiagramControls

Horizontal toolbar with two independent, optional blocks.

**When to use:** Any page that has zoom, step-by-step simulation, or both.

```jsx
<DiagramControls
  // Zoom block — omit all zoom props to hide it
  zoom={zoom}            // decimal, e.g. 1.0
  onZoomIn={zoomIn}
  onZoomOut={zoomOut}
  onZoomReset={zoomReset}
  zoomMin={0.5}          // default
  zoomMax={4.0}          // default
  zoomStep={0.25}        // default

  // Step nav block — omit currentStep to hide it
  currentStep={stepIdx + 1}   // 1-based display
  totalSteps={steps.length}
  isSimulating={isSimulating}
  isPaused={isPaused}
  onSimulate={runSimulation}
  onPrev={prevStep}
  onPause={pause}
  onResume={resume}
  onNext={nextStep}
  onStop={stopSim}

  // Extra content rendered left of zoom block
  extra={<select>…</select>}
/>
```

### Zoom state convention

Pages that store zoom as a percentage (50–200) divide before passing:
```js
zoom={zoomLevel / 100}   // 100 → 1.0
```

Pages that store zoom as a decimal pass it directly.

### extra prop

Use `extra` for page-specific content in the toolbar — scenario dropdowns, title chips, mode tabs. It appears at the far left before the divider.

---

## DiagramLegend

Passive colour-swatch row. No click interaction.

**When to use:** Static legends (participant list, token type key, path key where clicking is not needed).

```jsx
<DiagramLegend
  items={[
    { key: "oauth",  label: "OAuth",  color: "#2563eb", description: "User auth token" },
    { key: "mcp",    label: "MCP",    color: "#475569" },
  ]}
  activeKey="oauth"   // optional — dims others
  layout="row"        // 'row' | 'column', default 'row'
/>
```

If you need click interaction (selecting / deselecting a path), use `PathFilterBar` instead.

---

## PathFilterBar

Interactive path filter buttons with colour swatches.

**When to use:** Pages where the user can filter the diagram to show one path at a time (e.g. credential path A / B / C).

```jsx
const MY_PATHS = [
  { key: null,  label: "All" },
  { key: "A",   label: "Path A",  color: "#f59e0b" },
  { key: "B",   label: "Path B",  color: "#0d9488" },
];

<PathFilterBar
  paths={MY_PATHS}
  selectedPath={selectedPath}   // null = All selected
  onSelect={setSelectedPath}
  className="my-page-filter-bar"  // optional extra class
/>
```

`null` key = the "All" button; it never gets a swatch and its active state uses the default dc-btn outline style (no colour injection).

CSS opacity dimming of SVG nodes when a path is selected is the **consuming page's responsibility** — PathFilterBar only handles the button UI.

---

## CSS namespaces

All styles live in `DiagramControls.css`. Three non-overlapping prefixes:

| Prefix | Component |
|--------|-----------|
| `.dc-*` | DiagramControls toolbar |
| `.dl-*` | DiagramLegend |
| `.pfb-*` | PathFilterBar |

**Never add diagram control styles to a page-level CSS file.** Move them here instead.

---

## Colour palette (canonical — do not change)

### Control button colours

| Button | Background | Text | Hover |
|--------|------------|------|-------|
| Simulate | `#004687` (brand navy) | `#fff` | `#003366` |
| Pause | `#f59e0b` (amber) | `#fff` | `#d97706` |
| Resume | `#22c55e` (green) | `#fff` | `#16a34a` |
| Next | `#004687` (brand navy) | `#fff` | `#003366` |
| Stop | `#e2e8f0` (light grey) | `#475569` | `#cbd5e1` |
| Prev | `#fff` (white) | `#334155` | `#f1f5f9` |
| Zoom −/+/↺ | transparent | `#334155` | `#e2e8f0` |
| Disabled | `#f1f5f9` | `#94a3b8` | — |

### Token card accent colours (FLOW_ACCENT — already consistent, do not change)

These constants are defined in `HitlSequenceDiagram.js`, `SequenceDiagramPage.js`, and `ArchitectureFlowPage.js`. They are intentionally identical across all three files — edit all three together or not at all.

| Token type | Colour |
|------------|--------|
| `oauth` | `#2563eb` |
| `exchange` | `#7c3aed` |
| `permit` | `#16a34a` |
| `hitl` | `#d97706` |
| `idtoken` | `#0891b2` |
| `mcp` | `#475569` |
| `error` | `#dc2626` |

### SVG active state

All diagram pages use `#004687` (brand navy) for the active/highlighted arrow or region. Do not deviate.

### PathFilterBar swatches

Path-specific colours (amber/teal/blue in Phase266) are intentional semantic colours — they are not control button colours. Do not normalise them to the control palette.

---

## Adding a new diagram page

1. Import from `./diagram` barrel — never implement inline zoom/step/legend/filter UI.
2. Pick the right component:
   - Zoom only → `<DiagramControls zoom={…} onZoomIn={…} onZoomOut={…} onZoomReset={…} />`
   - Simulation → add `currentStep`, `totalSteps`, and simulation handler props
   - Static legend → `<DiagramLegend items={…} />`
   - Interactive path filter → `<PathFilterBar paths={…} selectedPath={…} onSelect={…} />`
3. Store zoom as a decimal (`1.0` = 100%). Convert if your state is percent: `zoom={zoomLevel / 100}`.
4. Put any page-specific toolbar content (scenario dropdown, mode tabs, title chip) in the `extra` prop — do not add new props to `DiagramControls`.
5. Do not add new CSS to the page's `.css` file for toolbar elements — add to `DiagramControls.css` with the correct namespace prefix.

---

## Exemptions (do not adopt shared components)

| Page | Reason |
|------|--------|
| `ArchitectureFlowPage.js` | ReactFlow's `<Controls>` and `<MiniMap>` handle zoom internally; replacing them would break ReactFlow's state |
| Any Mermaid page | Mermaid controls zoom via its own runtime |

---

## Simulation state convention (`useSimulation` or inline)

When implementing step-by-step simulation on a new page, follow the pattern from `ArchitectureDiagramPage.js`:

```js
const [isSimulating, setIsSimulating] = useState(false);
const [isPaused, setIsPaused] = useState(false);
const [currentStep, setCurrentStep] = useState(0);

function runSimulation() { setIsSimulating(true); setIsPaused(false); /* advance via interval */ }
function pause()         { setIsPaused(true); }
function resume()        { setIsPaused(false); }
function prevStep()      { /* only callable when isPaused */ }
function nextStep()      { /* only callable when isPaused */ }
function stopSim()       { setIsSimulating(false); setCurrentStep(0); }
```

`DiagramControls` gates Prev/Next on `isPaused` automatically. Pass `isSimulating` and `isPaused` truthfully — never synthesise them from other state.

---

## Architecture Simulation page (`/architecture/overview`)

See `docs/superpowers/specs/2026-05-23-architecture-simulation-design.md` for the full spec. The approved design introduces:

- `ArchitectureOverviewPage.js` — page orchestrator + `useSimulation` hook
- `ArchitectureSimSvg.jsx` — hand-coded SVG, `viewBox="0 0 1100 600"`, nodes 120×50 px, 13px bold labels
- `ArchitectureSimControls.jsx` — toolbar using `DiagramControls extra` + mode tabs
- `ArchitectureSimStepDesc.jsx` — step description bar below diagram
- `architecture-sim-scenarios.js` — scenario step arrays
- Three modes: Scenario auto-play, Step-through, Live trace (SSE `/api/arch-events`)

Node active state: amber pulse (`#f59e0b`). Node done: green + ✅ badge (`#22c55e`).
Edge active: amber sweep animation. Edge done: green static.

**This page has NOT been implemented yet.** When implementing it, reference this skill and the spec.

---

## Regression guard

Existing pages using `DiagramControls`:
- `ArchitectureDiagramPage.js` — zoom + simulation
- `ArchitectureTokenFlowPage.js` — zoom + simulation (delegates to ArchitectureDiagramPage internals)
- `HitlSequenceDiagram.js` — zoom + simulation + scenario dropdown in `extra`
- `SequenceDiagramPage.js` — zoom + simulation

Existing pages using `DiagramLegend`:
- `HitlSequencePage.jsx` — HITL path legend

Existing pages using `PathFilterBar`:
- `Phase266ArchitecturePage.jsx` — credential path A/B/C filter

**Before changing `DiagramControls.css`:** verify all six consumer pages still render and simulate correctly. Run `cd demo_api_ui && npm run build` — exit must be 0.
