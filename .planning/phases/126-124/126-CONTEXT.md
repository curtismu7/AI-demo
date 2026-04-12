# Phase 126 Context — Surface sub claim as user ID in token chain display

**Phase:** 126
**Created:** 2026-04-11
**Status:** Ready for planning

---

## Phase Goal

Surface the `sub` claim as a human-readable user identity and the `act` claim as the agent/actor identity across the token chain display, education panels, and AgentFlowDiagramPanel. Users should see **who** is acting and **on whose behalf** — not raw UUIDs.

---

## Decisions

### 1. Sub claim display format
**Decision:** Show both — friendly name + UUID as secondary  
Format: `Alice (abc123…)` — email or `given_name` from BFF fetch alongside the truncated UUID.  
- Fetch from BFF on demand (new `/api/me` style call or existing user endpoint that returns `sub`, `email`, `given_name`)
- If fetch fails or returns no name, fall back to showing UUID only (no error state, graceful degradation)
- Copyable: clicking on the display copies the full UUID to clipboard

### 2. Act claim display format
**Decision:** Friendly name + raw client_id as secondary  
Format: `Super Banking BFF (bff-client-abc123…)` — map known client IDs to app names from config.  
- Map using known env vars: `REACT_APP_BFF_CLIENT_ID` → "Super Banking BFF", `REACT_APP_AGENT_CLIENT_ID` → "AI Agent"
- Unknown client IDs fall back to showing raw client_id only

### 3. Education panels
**Decision:** Inject real sub/act values from current session token  
- `TokenChainEducationPanel.js` and `TokenChainPanel.js` should read from `TokenChainContext` (already available via useTokenChain hook) and replace placeholder strings like `"user-uuid"` and `"a1b2c3d4-user-uuid"` with real values from the live session token
- If no live token, keep the existing placeholder text (graceful fallback)

### 4. Scope — where this appears
**Decision:** All three locations:
1. **Token rail** — `TokenChainDisplay.js` (live events on `UserDashboard`)
2. **Education panels** — `TokenChainEducationPanel.js`, `TokenChainPanel.js`
3. **AgentFlowDiagramPanel** — `AgentFlowDiagramPanel.js` (the request flow diagram)

### 5. Identity data source
**Decision:** Fetch from BFF on demand  
- Use the existing session endpoint (e.g., GET `/api/userinfo` or the user profile route already on the BFF) to get `given_name`, `email`, `sub`
- Cache the result in React state or context — don't re-fetch on every render
- Pass resolved identity into TokenChainDisplay via context or props

---

## Canonical refs

- `banking_api_ui/src/components/TokenChainDisplay.js` — main component to modify (sub/act display, fmtSub, fmtAct, EventRow, ClaimsStrip)
- `banking_api_ui/src/context/TokenChainContext.js` — token event context; may need to carry resolved identity
- `banking_api_ui/src/components/education/TokenChainEducationPanel.js` — education panel needing live value injection
- `banking_api_ui/src/components/education/TokenChainPanel.js` — education panel needing live value injection
- `banking_api_ui/src/components/AgentFlowDiagramPanel.js` — request flow panel needing identity surfacing
- `banking_api_ui/src/components/UserDashboard.js` — mounts TokenChainDisplay; has user session state
- `banking_api_server/server.js` — BFF; check for existing `/api/userinfo` or userProfile route to fetch identity

---

## Codebase context (from scout)

**Existing in TokenChainDisplay.js:**
- `fmtSub(sub)` — truncates to 12 chars + "…" (line 588)
- `EventRow` — already shows `👤 User: {userId.slice(0,14)…}` copyable button (line 717–732)
- `tcd-event-ids-row` / `tcd-event-id--user` / `tcd-event-id--agent` CSS classes exist
- `ClaimsStrip` — compact inline strip with sub, act, may_act (line 587)
- `fmtAct()` — formats act claim (line 614)

**What needs to change:**
- `fmtSub()` → look up friendly name from resolved identity context, show as "Name (uuid…)"  
- `fmtAct()` → look up client_id in known-apps map, show as "App Name (id…)"  
- Education panels — consume TokenChainContext to inject live sub/act values into static code examples
- AgentFlowDiagramPanel — identify where sub/act would be shown (likely token annotations on diagram nodes)

---

## Deferred ideas

- Surface identity in the token modal (the floating inspector) — already shows raw claims; adding name lookup there is a minor enhancement, could be part of this phase if quick
- Dark mode styling for identity badges — tracked in a separate UI todo

---

*Status: decisions complete — ready for `/gsd-plan-phase 126`*
