# Phase 234 Research - Token-chain route-scoped update guard

Date: 2026-04-26

## Objective
Determine why token-chain updates run too frequently and identify the smallest safe change to ensure updates happen only when a token-chain UI page is active.

## Findings

1. Global polling is in provider scope
- File: banking_api_ui/src/context/TokenChainContext.js
- The provider runs across all routes (App wraps all Routes with TokenChainProvider).
- A useEffect starts polling /api/token-chain after auth and repeats every 15s regardless of active route.

2. Token-chain surfaces are route-scoped
- Token-chain UI appears in specific route-driven areas (dashboard/agent surfaces and inspector route).
- Relevant route utilities already exist:
  - banking_api_ui/src/utils/embeddedAgentFabVisibility.js
  - Existing helpers: isBankingAgentDashboardRoute, isEmbeddedAgentDockRoute

3. Additional token-chain refresh logic exists in token-chain components
- TokenChainDisplay and UnifiedTokenFlowInspector perform route/visibility-bound refreshes.
- Main over-update risk comes from provider-level always-on polling path.

## Recommended approach

- Add a dedicated route helper for token-chain-capable routes in embeddedAgentFabVisibility.js.
- Gate TokenChainContext polling/fetch behavior by that helper and current pathname.
- Keep fetch behavior untouched for eligible routes; no behavioral changes to token events format.

## Risks and mitigations

- Risk: Missing a valid token-chain route in helper list could suppress expected refreshes.
  - Mitigation: Include current known token-chain routes and add a clear helper comment for future additions.
- Risk: Route transitions may delay first refresh.
  - Mitigation: trigger one immediate fetch when entering an eligible route.

## Files implicated

- banking_api_ui/src/context/TokenChainContext.js
- banking_api_ui/src/utils/embeddedAgentFabVisibility.js
- banking_api_ui/src/App.js (context placement confirmation only; likely no code change)
