---
created: 2026-04-04T14:22:21.619Z
title: Add draw.io flowchart diagrams for MFA, user consent, and agent request flow with RFC annotations
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.js
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/components/education/
  - banking_api_server/routes/mfa.js
  - banking_api_server/routes/ciba.js
---

## Problem

The demo has complex multi-step flows (MFA step-up, user consent/HITL, agent request lifecycle) that are hard to understand just from reading the education panels or watching the UI. Administrators, evaluators, and developers demoing the app need visual flow diagrams that map each step to the relevant RFC or spec so they can understand the standards basis for each interaction.

Currently:
- No draw.io / visual diagrams exist for MFA challenge flow or consent flow
- Agent request flow education panel exists but has no diagram to back it up
- RFC references are scattered across education panels; none are mapped per-step on a diagram

## Solution

Create draw.io XML diagrams (`.drawio` files, openable in draw.io or VS Code hediet.vscode-drawio extension) for three flows, each step annotated with the applicable RFC or spec:

### Diagram 1: MFA Step-Up Flow
Steps to show:
1. User initiates transaction → BFF checks `stepUpEnabled` + `stepUpAmountThreshold`
2. BFF → `POST /deviceAuthentications` (PingOne auth server, user access token) — RFC 6749 §4.1 (token usage), PingOne MFA API
3. PingOne returns `daId` + enrolled `devices[]` — status: `DEVICE_SELECTION_REQUIRED`
4. UI shows device picker (EMAIL / TOTP / PUSH / FIDO2)
5. Device selected → `PUT /deviceAuthentications/:id` — OTP sent / TOTP prompt / push pushed / FIDO2 asserted
6. For FIDO2: GET status → `publicKeyCredentialRequestOptions` → `navigator.credentials.get()` → PUT assertion — WebAuthn (W3C), FIDO2
7. BFF receives COMPLETED → `req.session.stepUpVerified = true`
8. Transaction resumes
Annotate each PingOne API call with the PingOne MFA API spec; `stepUpVerified` session with RFC 6265 (cookies/session).

### Diagram 2: User Consent / HITL Flow
Steps to show:
1. Agent tool call arrives at BFF
2. BFF `checkLocalStepUp()` → threshold check — OAuth 2.0 step-up auth (RFC 9470)
3. If high-value: `stepUpRequired` dispatched to UI
4. CIBA back-channel initiated: `POST /bc-authorize` — CIBA (OpenID CIBA spec: draft-ietf-oauth-ciba)
5. Push notification to authorizing user
6. User approves → `POST /token` with `auth_req_id` — RFC 6749 §4 (token exchange), RFC 8693 (token exchange for `on_behalf_of`)
7. BFF polls approval → tokens stored in session — RFC 6265
8. `cibaStepUpApproved` event fires → agent tool call executes
Annotate CIBA steps with OpenID CIBA spec; RFC 9470 for step-up; RFC 8693 for token exchange.

### Diagram 3: Agent Request Flow (end-to-end)
Steps to show:
1. User clicks action in BankingAgent.js UI
2. Tool call logic: check `CONFIG_ACTION_IDS` — skip MFA for config ops
3. For write ops: BFF step-up guard (`stepUpEnabled` check) — RFC 9470
4. If MFA required: step-up flow (link to Diagram 1)
5. Tool call routed: local tools (`mcpLocalTools.js`) vs MCP server WebSocket
6. For MCP server: Tool call via WebSocket JSON-RPC (MCP spec) + token exchange (`on_behalf_of`) — RFC 8693, MCP protocol spec
7. BFF receives tool result → returns to UI
8. If HITL trigger: consent modal (link to Diagram 2) — RFC 9470
9. Final result rendered in agent chat
Annotate WebSocket RPC step with MCP spec; token exchange with RFC 8693; step-up gate with RFC 9470.

### Implementation approach
- Create `.drawio` XML files in `banking_api_ui/public/diagrams/` or `docs/diagrams/`
- Wire each diagram into the relevant education panel as an expandable image or inline viewer
- Each step node in the diagram should have a tooltip or label: `[RFC XXXX §N]` or `[OpenID CIBA]`
- Consider embedding using `<img src="/diagrams/mfa-flow.svg">` (draw.io can export SVG) for in-app display

### RFC reference list (per diagram node)
| Step | Applicable RFC / Spec |
|------|----------------------|
| OAuth token used for PingOne API | RFC 6749 §4.1 |
| Step-up auth trigger | RFC 9470 — OAuth 2.0 Step-Up Authentication Challenge |
| CIBA back-channel | OpenID Connect CIBA spec (openid.net) |
| Token exchange (on_behalf_of) | RFC 8693 — OAuth 2.0 Token Exchange |
| Session cookies | RFC 6265 — HTTP State Management |
| WebAuthn assertion | W3C WebAuthn Level 3 |
| MCP tool call (JSON-RPC over WS) | MCP Protocol spec (modelcontextprotocol.io) |
| PKCE | RFC 7636 |
| Token introspection | RFC 7662 |
