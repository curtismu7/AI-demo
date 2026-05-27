---
name: authorize-pipeline
description: >
  USE FOR anything touching authorization decisions — the simulated AS
  (simulatedAuthorizeService.js), PingOne Authorize integration
  (pingOneAuthorizeService.js), obligation classification
  (authorizeObligations.js), the ff_authorize_simulated feature flag, the
  gateway's pingAuthorizeGuard / PingOneAuthorizeClient, AuthorizeRulesPanel UI,
  and configuring deny/step-up/HITL thresholds.
  DO NOT USE FOR: HITL consent challenge mechanics (use hitl-consent); OAuth
  token exchange (use oauth-pingone); MCP gateway routing beyond auth (use
  mcp-gateway).
argument-hint: |
  Describe the change — e.g. "add a new obligation type", "change step-up
  threshold", "wire real PingOne Authorize", "debug a DENY the UI shows".
---

# Authorize Pipeline Skill

## 1. Two AS Paths

The authorization decision pipeline has two engines. The `ff_authorize_simulated`
configStore key selects which one runs at runtime.

### Simulated AS (default)

- File: `demo_api_server/services/simulatedAuthorizeService.js`
- No network call to PingOne. Evaluates rules in-process.
- Returns: `{ decision, stepUpRequired, consentRequired, path: 'simulated', decisionId, raw }`
- Used when `isSimulatedModeEnabled(configStore)` returns `true`.
- Default: `ff_authorize_simulated` defaults to `'true'` via `getEffective()`. This is
  a security-safe default — the simulated engine enforces the step-up/HITL gate even
  when a live PingOne Authorize endpoint is not configured.

### PingOne Authorize (live)

- File: `demo_api_server/services/pingOneAuthorizeService.js`
- Makes an authenticated HTTP call to PingOne Authorize using a short-lived worker
  client-credentials token.
- Two API paths are auto-selected:
  - **Phase 2 (preferred):** `POST /v1/environments/{envId}/decisionEndpoints/{endpointId}`
    — requires `authorize_decision_endpoint_id` / `PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID`.
    Request body: `{ parameters: { Amount, TransactionType, UserId, Acr, Timestamp } }`.
  - **Legacy Phase 1 (fallback):** `POST .../governance/policyDecisionPoints/{policyId}/evaluate`
    — requires `authorize_policy_id` / `PINGONE_AUTHORIZE_POLICY_ID`.
    Request body: `{ context: { user, transaction } }`.
- Worker credentials: `authorize_worker_client_id` + `authorize_worker_client_secret`
  (configStore) or `PINGONE_AUTHORIZE_WORKER_CLIENT_ID` + `PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET`
  (env vars).
- Used when `isSimulatedModeEnabled(configStore)` returns `false`.
- Fails closed: if PingOne Authorize is unreachable, the failover mode is controlled by
  `authorize_failover_mode` configStore key (`fallback_simulated`, `deny`, or legacy
  `ff_authorize_fail_open=true` which maps to `permit`).

---

## 2. Simulated AS Rules

### Transaction evaluation (`evaluateTransaction`)

Rules are evaluated in this order — highest gate wins, no stacking:

| Priority | Condition | Decision |
|---|---|---|
| 1 | `amount > DENY_AMOUNT` (default $2,000) | `DENY` |
| 2 | `amount >= STEPUP_AMOUNT` (default $500) **or** type in `SIMULATED_AUTHORIZE_STEPUP_TYPES` | `INDETERMINATE` + `stepUpRequired: true` |
| 3 | `amount >= CONFIRM_AMOUNT` (default $250) **or** type in `SIMULATED_AUTHORIZE_CONSENT_TYPES` (default `"transfer"`) | `INDETERMINATE` + `consentRequired: true` |
| 4 | Otherwise | `PERMIT` |

ACR check: if `acr` looks strong (contains `mfa`, `multi`, `http`, or length > 8), step-up
obligations are suppressed — the policy treats an existing MFA session as satisfying the
step-up requirement.

### MCP first-tool evaluation (`evaluateMcpFirstTool`)

For MCP tool calls (`DecisionContext=McpToolCall`). Evaluated in this order:

1. **Audience guard** (highest priority): if `tokenAudience` does not include
   `mcpResourceUri`, DENY immediately (step-skipping protection).
2. **Tool-name DENY override**: if tool name is in `SIMULATED_MCP_DENY_TOOLS` env → DENY.
3. **Tool-name HITL override**: if tool name is in `SIMULATED_MCP_HITL_TOOLS` env → `hitlRequired: true`.
4. **Amount-based rules** (when `transactionType` and `amount` are present):
   - `amount > denyAmount` → DENY
   - `amount >= stepUpAmount` → `stepUpRequired: true` (skips confirm)
   - `amount >= confirmAmount` → `hitlRequired: true` (surfaced as `mcp_hitl_required`)
   - Otherwise → PERMIT
5. **Default PERMIT** for read tools with no amount.

Note: on the MCP path `HITL_CONSENT` classifier output `consentRequired` is surfaced as
`hitlRequired` to match the `mcpToolAuthorizationService` wire contract (`mcp_hitl_required`).

### configStore keys for thresholds

| configStore key | Env var fallback | Default | Read by |
|---|---|---|---|
| `SIMULATED_AUTHORIZE_DENY_AMOUNT` | `SIMULATED_AUTHORIZE_DENY_AMOUNT` | `2000` | `getDenyAmountUsd()` |
| `SIMULATED_AUTHORIZE_CONFIRM_AMOUNT` | `SIMULATED_AUTHORIZE_CONFIRM_AMOUNT` | `250` | `getConfirmAmountUsd()` |
| `SIMULATED_AUTHORIZE_STEPUP_AMOUNT` | `SIMULATED_AUTHORIZE_POLICY_STEPUP_AMOUNT` | `500` | `getStepUpAmountUsd()` |
| `SIMULATED_AUTHORIZE_CONSENT_TYPES` | `SIMULATED_AUTHORIZE_CONSENT_TYPES` | `"transfer"` | `getConsentTypes()` |
| `SIMULATED_AUTHORIZE_STEPUP_TYPES` | `SIMULATED_AUTHORIZE_STEPUP_TYPES` | `""` | `getStepUpTypes()` |

MCP-specific (env-only, not in configStore admin UI by default):

| Env var | Purpose |
|---|---|
| `SIMULATED_MCP_DENY_TOOLS` | Comma-separated tool names that always DENY |
| `SIMULATED_MCP_HITL_TOOLS` | Comma-separated tool names that always require HITL |

Threshold getters use `configStore.get()` (raw cache, not `getEffective()`). This is intentional:
`getEffective()` would mask an unset key with the FIELD_DEFS default, making the env var fallback
dead code. Raw `get()` returns `null` on a cache miss and falls through to `process.env`.

---

## 3. Obligation Classification

File: `demo_api_server/services/authorizeObligations.js`

### Input shape

An array of obligation objects, each with a `type` or `id` string field:
```js
[
  { type: 'HITL_CONSENT', detail: 'Human approval required.' },
  { type: 'STEP_UP', detail: 'MFA required.' },
]
```

Both the simulated AS (flat array) and PingOne AS (merges `raw.obligations`,
`raw.advice`, `raw.details.obligations`, `raw.details.advice`) normalize their
sources into this shape before passing to the classifier.

### `classifyObligations(obligations)` return value

```js
{
  stepUpRequired: boolean,
  hitlRequired: boolean,
  consentRequired: boolean,
  classified: { stepUp: Obligation[], hitl: Obligation[], consent: Obligation[] }
}
```

### Type-to-flag mapping (most-specific wins)

| Obligation `type`/`id` contains | Classified as |
|---|---|
| `HITL_CONSENT` | `consent` (not also `hitl`) |
| `STEP_UP` or `STEPUP` | `stepUp` |
| `HITL` or `HUMAN_APPROVAL` | `hitl` |

### Highest-gate-wins precedence

Across the whole list, only one enforcement flag is ever `true`:
`stepUpRequired` > `consentRequired` > `hitlRequired` > (none).

When `stepUpRequired` is true, `hitlRequired` and `consentRequired` are both `false` even
if HITL or CONSENT obligations also appear in the list. `classified` carries the full
breakdown for education/UI display but MUST NOT drive enforcement.

`DENY` is a top-level decision, not an obligation — it never reaches the classifier.

---

## 4. PingAuthorize Guard (Gateway)

Files:
- `demo_mcp_gateway/src/pingAuthorizeGuard.ts` — WS transport entry point
- `demo_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` — HTTP transport + shared param builder

### When the guard is active

Only when both `PINGAUTHORIZE_ENDPOINT` and `PINGAUTHORIZE_WORKER_ID` (gateway config) are
set. When not configured, the guard falls back to `evaluateScopeDecisionLocally()` which
checks token scopes against tool requirements.

### `guardToolsList` (WS)

Called on `tools/list`. Sends:
```json
{
  "parameters": {
    "DecisionContext": "McpToolsList",
    "ClientId": "<token sub>",
    "ActClientId": "<token act.sub>",
    "TokenAudience": "<gatewayResourceUri>"
  }
}
```
PERMIT → proceeds. Any other outcome → `{ permitted: false }`.

### `guardToolCall` (WS) and `PingOneAuthorizeClient.evaluate` (HTTP)

Both use `buildAuthorizeParameters()` (single source of truth) so HTTP and WS transports
send identical inputs. Parameters sent to the decision endpoint:

```
DecisionContext:   "McpToolCall"
McpMethod:         "tools/call"
ToolName:          <tool name>
ClientId:          <token sub>
ActClientId:       <token act.sub>
TokenScopes:       <space-separated token scopes>
TokenAudience:     <gatewayResourceUri>
TransactionAmount: <toolArgs.amount or "">
TransactionType:   <toolArgs.transaction_type or tool name>
ToAccountId:       <toolArgs.to_account_id or "">
```

Optional TraT enrichment fields (`TratPurp`, `TratAzdAct`, `TratSessionId`, `TratTool`,
`TratSim`) are added when an `X-TraT-Context` header is present.

### Decision mapping at the gateway

| PingAuthorize response | `guardToolCall` result | `PingOneAuthorizeClient.evaluate` result |
|---|---|---|
| `PERMIT` | `{ permitted: true }` | `{ decision: 'PERMIT' }` |
| `INDETERMINATE` | `{ permitted: false, reason: 'HITL_REQUIRED' }` | `{ decision: 'INDETERMINATE', reason: 'HITL_REQUIRED' }` |
| `DENY` or network error | `{ permitted: false, reason: … }` | `{ decision: 'DENY', reason: … }` |

Fails **closed** on network error — unreachable PingAuthorize → DENY, not PERMIT.

The `AuthzDecision` type from `PingOneAuthorizeClient` also carries optional audit fields:
`decisionId`, `policyVersion`, `traceId` (lifted from PingAuthorize response, accepting
both snake_case and camelCase variants).

---

## 5. Production Guard

`simulatedAuthorizeService.js` throws at module load time when:

```js
process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_AUTHORIZE !== 'true'
```

This is a module-level guard, not just a runtime check. Any direct `require()` of
`simulatedAuthorizeService` in a production environment (without the env var override)
will crash the process immediately. The feature flag `ff_authorize_simulated` at the
caller layer is the primary gate; this module guard closes the second path (direct import).

---

## 6. Admin Config UI

### AuthorizeRulesPanel

File: `demo_api_ui/src/components/AuthorizeRulesPanel.jsx`

Reads from `GET /api/authorize/rules` (public, no auth) which returns current thresholds,
engine status, and MCP tool gate flag from `getAuthorizationStatusSummary()` +
`getMcpFirstToolGateStatus()`.

Displays rule cards with outcome badges (CONSENT, STEP-UP, DENY, GATE, HITL, PERMIT)
derived from `config.simulated.*` response fields:
- `confirmAmount` — threshold for CONSENT badge
- `stepUpAmount` — threshold for STEP-UP badge
- `denyAmount` — threshold for DENY badge
- `mcpDenyTools` / `mcpHitlTools` — MCP tool overrides

### Admin configuration endpoints

File: `demo_api_server/routes/authorizeConfig.js`

Mounted at: `/api/admin/authorize`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/authorize/config` | `authenticateToken` | Read all config: status, simulated rules, masked PingOne credentials, feature flags |
| `POST` | `/api/admin/authorize/config` | admin role | Write simulated rules to configStore |

POST body fields (all optional):

| Field | configStore key written |
|---|---|
| `simulated_confirm_amount` | `SIMULATED_AUTHORIZE_CONFIRM_AMOUNT` |
| `simulated_deny_amount` | `SIMULATED_AUTHORIZE_DENY_AMOUNT` |
| `simulated_stepup_amount` | `SIMULATED_AUTHORIZE_STEPUP_AMOUNT` |
| `simulated_consent_types` | `SIMULATED_AUTHORIZE_CONSENT_TYPES` |
| `simulated_stepup_types` | `SIMULATED_AUTHORIZE_STEPUP_TYPES` |
| `simulated_mcp_deny_tools` | `SIMULATED_MCP_DENY_TOOLS` |
| `simulated_mcp_hitl_tools` | `SIMULATED_MCP_HITL_TOOLS` |

Persisted via `configStore.setConfig(updates)`. The config endpoint also reads:
`PINGONE_AUTHORIZE_WORKER_CLIENT_ID` (masked), `authorize_decision_endpoint_id`,
`authorize_mcp_decision_endpoint_id`, `authorize_policy_id`.

Threshold writes fan into the AS getter chain immediately — no restart needed.
The Demo Controls / Setup page (`routes/thresholds.js`) also mirror-writes
`SIMULATED_AUTHORIZE_CONFIRM_AMOUNT` and `SIMULATED_AUTHORIZE_STEPUP_AMOUNT`
alongside the HITL-path keys (`confirm_threshold_usd`, `mfa_threshold_usd`).

---

## 7. Caller Pattern

### Transaction path (`transactionAuthorizationService.js`)

```
BFF route handler
  → transactionAuthorizationService.evaluateTransactionPolicy()
      → isSimulatedModeEnabled(configStore)
          true  → simulatedAuthorizeService.evaluateTransaction()
          false → pingOneAuthorizeService.evaluateTransaction()
      → result.stepUpRequired == true  → { status: 'STEP_UP_REQUIRED' }   (caller triggers MFA)
      → result.consentRequired == true → { status: 'CONSENT_REQUIRED' }   (caller shows consent UI)
      → result.decision == 'DENY'      → { status: 'DENIED' }              (caller returns 403)
      → otherwise                      → { status: 'PERMITTED' }           (caller proceeds)
```

Failover: if PingOne Authorize throws, `authorize_failover_mode` controls the fallback:
- `fallback_simulated` (default) — retries with simulated AS
- `deny` — returns 503
- (legacy) `ff_authorize_fail_open=true` → permits (maps to `failoverMode=permit`)

### MCP first-tool gate (`mcpToolAuthorizationService.js`)

```
BFF MCP route handler
  → mcpToolAuthorizationService.evaluateMcpFirstToolGate()
      → isSimulatedModeEnabled(configStore)
          true  → simulatedAuthorizeService.evaluateMcpFirstTool()
          false → pingOneAuthorizeService.evaluateMcpToolDelegation()
      → result.stepUpRequired == true  → { status: 428, error: 'mcp_step_up_required' }
      → result.hitlRequired == true    → { status: 428, error: 'mcp_hitl_required' }
      → result.decision == 'DENY'      → { status: 403, error: 'mcp_denied' }
      → otherwise                      → proceed to tool execution
```

### API routes (`routes/authorize.js`)

`POST /api/authorize/test-evaluate` — evaluate the active engine for any `{ amount, type, acr }`.
Response always has both `consentRequired` (canonical) and `hitlRequired` (alias) fields so
callers don't need engine-specific field-name knowledge.

`GET /api/authorize/rules` — public, no auth. Returns current thresholds + engine status.

---

## 8. Feature Flag: `ff_authorize_simulated`

| Property | Value |
|---|---|
| configStore key | `ff_authorize_simulated` |
| Env var override | — (no direct env var; read only from configStore) |
| Default | `'true'` (via `getEffective()`) |
| Read by | `simulatedAuthorizeService.isSimulatedModeEnabled(configStore)` |

`isSimulatedModeEnabled` uses `configStore.getEffective()` (not raw `get()`) to ensure the
`'true'` default is applied on a cache miss — a corrupt/empty config.db would otherwise
silently disable the authorization gate (fail-open). An operator who explicitly sets
`ff_authorize_simulated = 'false'` will get `false`.

To switch to live PingOne Authorize:
1. Set `authorize_worker_client_id` + `authorize_worker_client_secret` in Admin Config.
2. Set `authorize_decision_endpoint_id` (bootstrap via `POST /api/authorize/bootstrap-demo-endpoints`).
3. Set `ff_authorize_simulated = 'false'` in Admin Config or via the bootstrap endpoint
   option `enableLiveAuthorize: true`.

To flip back to simulated from the admin API:
```bash
curl -X POST https://api.ping.demo:3001/api/admin/authorize/config \
  -H 'Content-Type: application/json' \
  -d '{}' --cookie ...
# Then set ff_authorize_simulated via configStore setConfig call
```
Or use the Feature Flags panel in the admin UI.

Related flags:

| configStore key | Default | Purpose |
|---|---|---|
| `ff_authorize_simulated` | `'true'` | Simulated vs live PingOne Authorize |
| `ff_authorize_fail_open` | `'false'` | Legacy: permit on PingOne error (deprecated in favour of `authorize_failover_mode`) |
| `ff_authorize_deposits` | `'false'` | Include deposit transactions in authorization evaluation |
| `ff_authorize_mcp_first_tool` | `'false'` | Enable MCP first-tool gate |

---

## 9. Files to Read Before Editing

| File | When to read |
|---|---|
| `demo_api_server/services/simulatedAuthorizeService.js` | Any threshold change, new rule type, ACR logic, or MCP tool-name overrides |
| `demo_api_server/services/authorizeObligations.js` | Adding a new obligation type or changing precedence |
| `demo_api_server/services/pingOneAuthorizeService.js` | PingOne integration, Trust Framework parameters, decision endpoint provisioning |
| `demo_api_server/services/transactionAuthorizationService.js` | How the BFF enforces decisions for transaction routes |
| `demo_api_server/services/mcpToolAuthorizationService.js` | How the BFF enforces decisions for MCP tool routes |
| `demo_api_server/routes/authorizeConfig.js` | Admin config GET/POST — what the UI can read and write |
| `demo_api_server/routes/authorize.js` | Evaluate/test routes, bootstrap endpoints, recent decisions |
| `demo_mcp_gateway/src/pingAuthorizeGuard.ts` | Gateway WS-path guard, `guardToolsList`, `guardToolCall` |
| `demo_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` | Gateway HTTP-path client, `buildAuthorizeParameters`, `AuthzDecision` type |
| `demo_api_ui/src/components/AuthorizeRulesPanel.jsx` | UI rule display, badge types, what the panel reads |
| `REGRESSION_PLAN.md` §1 | Before editing any auth/token/session file — read the do-not-break list |
