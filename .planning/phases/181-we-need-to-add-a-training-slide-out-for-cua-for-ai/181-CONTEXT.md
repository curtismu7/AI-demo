# Phase 181: Add Training Slide-Out for CUA for AI — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a new CUA (Computer Use Agent) education panel as a slide-out drawer, following the established EducationDrawer pattern. The panel teaches developers what CUA is, how it works, how it compares to MCP/tool-use, security implications, and its relevance to the banking demo. Includes NL intent routing, RFC Index entry, education menu entry, and bidirectional cross-links with related panels.

</domain>

<decisions>
## Implementation Decisions

### Content Scope & Structure
- **D-01:** 5 tabs: "What is CUA?", "How it works", "CUA vs MCP/tool-use", "Security & trust", "In this demo"
- **D-02:** Follow existing EducationDrawer + tabs array pattern (same as HumanInLoopPanel, AgentGatewayPanel, etc.)

### Panel Trigger & Navigation
- **D-03:** Add NL intent keywords ("CUA", "computer use agent", "computer use") to the SYSTEM prompt in `geminiNlIntent.js`, mapping to the new CUA education panel
- **D-04:** Add a row in the RFC Index panel for CUA
- **D-05:** Add a CUA entry in the education menu / side nav

### Visual Content Approach
- **D-06:** "How it works" tab includes a static inline diagram showing the CUA screenshot→action loop (styled HTML/SVG, similar to TokenChainPanel approach)
- **D-07:** "CUA vs MCP/tool-use" tab includes a side-by-side comparison table
- **D-08:** Remaining tabs ("What is CUA?", "Security & trust", "In this demo") are text with headers, bullets, code snippets

### Cross-Panel Relationships
- **D-09:** Bidirectional cross-links — CUA panel links to Agent Gateway, Human-in-Loop, and MCP Protocol panels via `edu.open(panelId)`
- **D-10:** Agent Gateway, Human-in-Loop, and MCP Protocol panels each get a "See also: Computer Use Agent (CUA)" link back to the CUA panel

### Agent's Discretion
- Exact prose content for each tab
- EDU id constant naming (e.g., `EDU.CUA` or `EDU.COMPUTER_USE_AGENT`)
- Specific placement within RFC Index table (row ordering)
- Diagram styling details for the CUA loop visual
- Which specific sections in related panels get the "See also" link

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Education Panel Pattern
- `banking_api_ui/src/components/education/HumanInLoopPanel.js` — Reference implementation for tab structure, EducationDrawer usage, and content pattern
- `banking_api_ui/src/components/education/EducationPanelsHost.js` — Panel registration (import + isOpen/onClose/initialTabId wiring)
- `banking_api_ui/src/components/education/educationIds.js` — EDU constant definitions
- `banking_api_ui/src/components/shared/EducationDrawer.js` — Shared drawer component (props: isOpen, onClose, tabs, initialTabId)

### NL Intent Routing
- `banking_api_server/services/geminiNlIntent.js` — SYSTEM prompt with education panel routing rules
- `banking_api_server/services/nlIntentParser.js` — Heuristic fallback parser (EDU mappings)

### RFC Index & Navigation
- `banking_api_ui/src/components/education/RFCIndexPanel.js` — Table of education topics with panel links
- `banking_api_ui/src/context/EducationUIContext.js` — `edu.open(panelId)` API for cross-panel navigation

### Cross-Link Targets
- `banking_api_ui/src/components/education/AgentGatewayPanel.js` — Gets "See also: CUA" link
- `banking_api_ui/src/components/education/HumanInLoopPanel.js` — Gets "See also: CUA" link
- `banking_api_ui/src/components/education/McpProtocolPanel.js` — Gets "See also: CUA" link

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **EducationDrawer** (`shared/EducationDrawer.js`): Shared slide-out drawer with tabbed content — all education panels use this
- **EduImplIntro** (`educationImplementationSnippets.js`): Reusable "implementation in this repo" intro component
- **edu.open(panelId)**: Context API method for opening any panel from anywhere — used for cross-links
- **EDU constants** (`educationIds.js`): Central registry of panel IDs

### Established Patterns
- Each panel: default export function with `({ isOpen, onClose, initialTabId })` props
- Tabs array: `[{ id, label, content: JSX }]`
- Panel registered in EducationPanelsHost with `<XxxPanel isOpen={panel === EDU.XXX} onClose={close} initialTabId={tab} />`
- NL intent: education routing via `{"kind":"education","education":{"panel":"xxx","tab":"what"}}`

### Integration Points
- EducationPanelsHost.js — import + JSX element for new panel
- educationIds.js — new EDU constant
- geminiNlIntent.js SYSTEM prompt — new routing rules for CUA keywords
- nlIntentParser.js — heuristic fallback mapping for CUA
- RFCIndexPanel.js — new table row

</code_context>

<specifics>
## Specific Ideas

- CUA loop diagram should show: Agent → Screenshot capture → Vision model analysis → Action decision → UI interaction → repeat
- Comparison table columns: Feature, CUA, MCP/Tool-Use — covering: interaction method, requires vision, API dependency, security model, latency, reliability
- "In this demo" tab should explain that the banking demo uses MCP/tool-use (not CUA) and why, positioning CUA as an alternative approach

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 181-we-need-to-add-a-training-slide-out-for-cua-for-ai*
*Context gathered: 2026-04-17*
