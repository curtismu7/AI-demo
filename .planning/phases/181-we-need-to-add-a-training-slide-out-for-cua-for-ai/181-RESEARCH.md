# Phase 181 Research: CUA Training Slide-Out

**Completed:** 2026-04-17
**Status:** Ready for planning

---

## Research Questions Answered

### 1. What is the existing education-panel implementation pattern?

**Finding:** Education topics are standalone React drawer components that accept `isOpen`, `onClose`, and `initialTabId`, define a local `tabs` array, and render through the shared drawer shell in `banking_api_ui/src/components/shared/EducationDrawer.js`.

**Canonical pattern files:**
- `banking_api_ui/src/components/education/HumanInLoopPanel.js`
- `banking_api_ui/src/components/education/AgentGatewayPanel.js`
- `banking_api_ui/src/components/education/McpProtocolPanel.js`
- `banking_api_ui/src/components/education/EducationPanelsHost.js`
- `banking_api_ui/src/components/education/educationIds.js`

**Implementation implication:** Phase 181 should be a normal EducationDrawer topic, not a custom event-driven special case like CIBA/CIMD.

---

### 2. Where must the new CUA panel be wired?

**Finding:** The panel must be wired in four places for the full experience to work consistently:

1. **Panel identity and mounting**
   - Add new EDU constant in `educationIds.js`
   - Import and mount the new panel in `EducationPanelsHost.js`

2. **Natural-language education routing**
   - Add `CUA`, `computer use agent`, and `computer use` routing in `banking_api_server/services/geminiNlIntent.js`
   - Add matching fallback heuristics in `banking_api_server/services/nlIntentParser.js`

3. **Visible discovery surfaces**
   - Add row in `banking_api_ui/src/components/education/RFCIndexPanel.js`
   - Add entry in the live learn menu in `banking_api_ui/src/components/AdminSideNav.jsx`
   - Add agent learn command in `banking_api_ui/src/components/education/educationCommands.js`

4. **Cross-panel navigation**
   - Add bidirectional links between the new CUA panel and:
     - `AgentGatewayPanel.js`
     - `HumanInLoopPanel.js`
     - `McpProtocolPanel.js`

**Implementation implication:** If only the panel is created and mounted, users will still miss it from sidebar, RFC Index, and NL prompts.

---

### 3. What should the CUA panel contain?

**Locked decisions from context:**
- 5 tabs:
  - What is CUA?
  - How it works
  - CUA vs MCP/tool-use
  - Security & trust
  - In this demo
- The "How it works" tab uses a static inline diagram showing the screenshot -> analyze -> act -> repeat loop
- The comparison tab uses a side-by-side table
- The remaining tabs are explanatory text with bullets and examples

**Recommended content posture:**
- Position CUA as a real pattern developers should understand
- Clearly explain that this banking demo uses MCP/tool-use rather than browser-driving CUA
- Keep the panel educational; do not imply the demo currently executes browser automation on banking surfaces

---

### 4. What are the main risks or regression concerns?

**Finding:** This is a low-risk UI education phase if kept scoped correctly, but there are three integration risks:

1. **Education registry mismatch**
   - If `educationIds.js` and `EducationPanelsHost.js` are not updated together, links and NL routing will silently fail

2. **Inconsistent learn surfaces**
   - The live app has multiple learn-entry points; updating only one will create discoverability drift

3. **Accidental coupling to protected auth flows**
   - The panel must not change HITL, MCP execution, consent, token exchange, or marketing-only surfaces

**Protected areas to avoid breaking:**
- Global panel host in `banking_api_ui/src/components/education/EducationPanelsHost.js`
- Live sidebar learn section in `banking_api_ui/src/components/AdminSideNav.jsx`
- Existing HITL/MCP education content in `HumanInLoopPanel.js` and `McpProtocolPanel.js`
- Marketing routes and marketing-only UI

---

### 5. What is the cleanest plan split?

**Recommended split:** 3 plans

1. **Plan 181-01:** Build and register the new CUA education drawer
   - New panel component
   - EDU id
   - Host registration

2. **Plan 181-02:** Wire discoverability and NL routing
   - Sidebar entry
   - RFC Index row
   - Agent learn command
   - Gemini prompt routing + heuristic fallback

3. **Plan 181-03:** Add cross-links and educational polish
   - CUA -> related panels links
   - Related panels -> CUA links
   - Final copy alignment for "this demo uses MCP, not CUA"

**Dependency shape:**
- 181-01 first
- 181-02 depends on 181-01
- 181-03 depends on 181-01

This yields one foundation wave followed by two low-conflict parallelizable plans.

---

### 6. What verification is required after implementation?

**Mandatory:**
- `cd banking_api_ui && npm run build` must exit 0 after any UI edit

**Behavior checks:**
- Sidebar learn entry opens the new CUA drawer
- RFC Index row opens the new CUA drawer
- Agent learn command opens the new CUA drawer
- NL prompts for `CUA`, `computer use agent`, and `computer use` route to the CUA panel
- CUA panel links out to Agent Gateway, HITL, and MCP Protocol
- Those panels link back to CUA
- Existing CIBA/CIMD special education entries still work unchanged

---

## Important Planning Note

The detailed Phase 181 entry in `.planning/ROADMAP.md` currently has a copied goal from Phase 182 (MCP server deployment). Planning should follow `181-CONTEXT.md`, which clearly defines Phase 181 as a **CUA training slide-out** phase.

---

## RESEARCH COMPLETE

**Summary:** Phase 181 is a focused education-drawer phase. The correct implementation path is to create a normal EducationDrawer-based CUA panel, register it centrally, expose it through the repo's live discovery surfaces, and connect it bidirectionally with the related HITL/MCP panels. No auth-flow or MCP-runtime behavior changes are needed.