---
name: delegation
description: >
  USE FOR anything touching the family-delegation feature:
  delegationService.js, delegationChainValidationService.js,
  delegationClaimsService.js, routes/delegation.js,
  DelegatedAccessPage.js, LMDB 'delegations' database,
  granting/revoking delegated access, may_act claim propagation
  through delegation chains, Phase 254.
  DO NOT USE FOR: RFC 8693 token exchange for the MCP agent path
  (use oauth-pingone); general PingOne user management
  (use pingone-api-calls); MCP token exchange (use mcp-gateway
  or oauth-pingone).
argument-hint: "[task description — e.g. 'add a new scope to VALID_SCOPES', 'debug grant flow', 'understand chain validation']"
---

# Delegation skill

## What delegation is

Family delegation lets a **delegator** (account owner) grant a **delegate** (e.g. spouse, child, parent) scoped read/write access to their banking accounts. The delegator picks which scopes to share; the delegate can then act within those scopes inside the Super Banking UI.

This is **not** the same as the RFC 8693 agent token exchange. That path exchanges a PingOne user token for a narrowed MCP-server token so an AI agent can call tools on behalf of the user. Family delegation is a separate application-layer grant stored in LMDB, with its own UI page and management API.

The `may_act` claim connection: when a delegation record is active, the platform can embed `may_act.sub` into the user's token (via PingOne policy) to indicate which delegate or agent is authorized to act on behalf of that user. The `delegationClaimsService.js` validates and normalises these claim structures; it does not create the tokens itself.

---

## Storage — LMDB `delegations` database

All delegation records live in the LMDB environment opened by `demo_api_server/services/lmdb/openEnv.js`. The named database is `'delegations'`.

```
getDb('delegations')          // internal accessor via _db() in delegationService.js
```

Key: `record.id` — a `crypto.randomUUID()` string.

Value (a plain object, serialised by LMDB):

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | Primary key |
| `delegator_user_id` | string | PingOne `sub` of account owner |
| `delegator_email` | string | Email of account owner |
| `delegate_email` | string | Lowercase email of the delegate |
| `delegate_user_id` | string \| null | PingOne user ID of the delegate; `null` if PingOne provisioning skipped (no management creds) |
| `scopes` | string[] | Subset of `VALID_SCOPES` |
| `status` | `'active'` \| `'revoked'` | Never deleted, only revoked |
| `granted_at` | ISO 8601 string | |
| `revoked_at` | ISO 8601 string \| null | Set on revocation |

Records are **never hard-deleted**. Revoking sets `status: 'revoked'` and `revoked_at`.

`toRecord(row)` in `delegationService.js` is the normaliser — it ensures `scopes` is always a parsed `string[]`.

---

## Valid scopes for delegation

Defined as `VALID_SCOPES` in `demo_api_server/services/delegationService.js`:

```js
const VALID_SCOPES = [
  'view_accounts',
  'view_balances',
  'create_deposit',
  'create_withdrawal',
  'create_transfer',
];
```

Any scope not in this list returns `{ ok: false, error: 'validation_error' }` from `grantDelegation`.

---

## CRUD operations

### Grant — `POST /api/delegation`

Route handler: `demo_api_server/routes/delegation.js` line 39.
Service: `grantDelegation({ delegatorUserId, delegatorEmail, delegateEmail, scopes })` in `delegationService.js`.

Validation order:
1. `delegateEmail` present
2. `scopes` non-empty array, all in `VALID_SCOPES`
3. Not self-delegation (case-insensitive email match)
4. No existing active delegation for this `(delegatorUserId, delegateEmail)` pair → `409 duplicate_delegation`
5. PingOne user lookup via `fetchPingOneUserByUsername(delegateEmail)`
6. If delegate not found in PingOne: provision a new user via Management API (`POST /v1/environments/{envId}/users`)
7. If management creds not configured: stores delegation locally with `delegate_user_id: null` (demo-safe fallback)

On success: stores record via `_db().putSync(record.id, record)`, fires `_sendDelegationEmail` asynchronously, logs `delegation/grant-success`.

HTTP responses: `201` on success; `400` for validation/self-delegation; `409` for duplicate; `502` for PingOne provisioning failure.

### Revoke — `DELETE /api/delegation/:id`

Route: line 61. Service: `revokeDelegation(id, delegatorUserId)`.

Ownership check: `rec.delegator_user_id === delegatorUserId`. Only the owner can revoke their own delegation. Returns `404` if not found, not owned, or already revoked. Sends revocation email asynchronously.

### List active — `GET /api/delegation`

Route: line 28. Service: `listDelegations(delegatorUserId)`.

Returns only `status === 'active'` records owned by the caller, sorted descending by `granted_at`.

### Full history — `GET /api/delegation/history`

Route: line 17. Service: `getDelegationHistory(delegatorUserId)`.

Returns all records (active + revoked) owned by the caller, sorted descending by `granted_at`. The `/history` route must be declared **before** `/:id` patterns to avoid Express treating `history` as an `:id` param.

### Admin: list all — `GET /api/delegation/admin/all`

Requires `requireAdmin` middleware. Optional `?status=active|revoked|all` query param. Service: `listAllDelegations({ status })`.

### Admin: grant on behalf — `POST /api/delegation/admin/grant`

Requires `requireAdmin`. Body: `{ delegatorEmail, delegateEmail, scopes }`. Service: `adminGrantDelegation`. Resolves `delegatorUserId` from PingOne by email lookup; falls back to `admin-<email>` if not found. Delegates to `grantDelegation` internally.

### Admin: revoke any — `DELETE /api/delegation/admin/:id`

Requires `requireAdmin`. No ownership check. Service: `adminRevokeDelegation(id)`. Sends revocation email.

---

## Chain validation — `delegationChainValidationService.js`

File: `demo_api_server/services/delegationChainValidationService.js`

This service validates the **RFC 8693 token delegation chain** (user token + MCP-exchanged token), not the LMDB family-delegation records. It is used during agent/MCP token exchange verification.

### Key constants

```js
CHAIN_VALIDATION_RULES = {
  expected_lengths: {
    single_exchange: 3,  // user → agent → mcp_server
    double_exchange: 4,  // user → agent → intermediate → mcp_server
    subject_only: 2      // user → mcp_server
  },
  max_chain_length: 5,
  timeouts: {
    chain_reconstruction: 5000,
    circular_detection: 1000,
    integrity_validation: 3000
  }
}
```

Validation cache TTL: 5 minutes (keyed by caller-supplied `cacheKey`).

### `ChainNode` class

Properties: `type` (`'user'`, `'agent'`, `'mcp_server'`, `'intermediate'`), `sub`, `timestamp`, `may_act`, `act`, `audience`, `scopes`, `metadata`.

Methods: `equals(other)`, `getIdentifier()` → `"type:sub"`, `toJSON()`.

### `DelegationChainValidationService.validateDelegationChain(userToken, exchangedToken, options)`

Main entry point. Steps executed in order:

1. `reconstructDelegationChain` — builds `ChainNode[]` from decoded JWT claims: user node from `userToken.sub`; agent node from `userToken.may_act.sub`; optional intermediate from `exchangedToken.act.act.sub`; MCP server node from `exchangedToken.act.sub`
2. `validateChainStructure` — checks that `user` and `mcp_server` nodes are present; warns if ordering is unexpected
3. `validateChainIntegrity` — subject preservation (user `sub` must equal exchanged token `sub`); agent authorization (user `may_act.sub` must match agent node); MCP server identity check
4. `validateChainLength` — hard error if `chain.length > max_chain_length (5)`; warning if length differs from `expected_lengths[chainType]`
5. `detectCircularDelegation` — duplicate `sub` values or duplicate `getIdentifier()` values → error
6. `validateIdentifierFormats` — warns if non-user node `sub` is not `https://`; checks `.pingdemo.com/agent/` and `.pingdemo.com/mcp/` patterns
7. `validateStrictRequirements` (strict mode only) — all nodes must have timestamps; all three types `user`, `agent`, `mcp_server` must be present; identifiers must be unique

Returns a validation object: `{ valid, errors[], warnings[], chain, metadata }`.

Audit events are written to `exchangeAuditStore` for each validation result (`delegation_chain_validation` or `delegation_chain_validation_error`).

---

## Claims service — `delegationClaimsService.js`

File: `demo_api_server/services/delegationClaimsService.js`

Validates and normalises the RFC 8693 `may_act` and `act` claim structures in JWTs. Does **not** issue or store tokens.

### Key exports

| Export | Purpose |
|---|---|
| `validateDelegationClaims(token, tokenType, userPreferences)` | Main middleware-style validator; `tokenType` = `'user'` or `'exchanged'` |
| `validateUserTokenMayAct(claims, userPreferences)` | Validates `may_act` claim in a user token |
| `validateExchangedTokenAct(claims)` | Validates `act` claim in an exchanged/MCP token |
| `validateDelegationChain(userToken, exchangedToken)` | Lightweight chain check (user → agent → mcp_server, expects exactly 3 nodes) |
| `validateIdentifierFormat(identifier, type)` | Validates URI format for `'agent'` or `'mcp_server'` identifiers |
| `mapLegacyIdentifier(identifier, type)` | Maps a bare UUID-style ID to `https://<type>.pingdemo.com/<type>/<id>` |

### Identifier format rules (`IDENTIFIER_FORMATS`)

| Type | Standard pattern |
|---|---|
| `agent` | `https://<domain>.pingdemo.com/agent/<id>` |
| `mcp_server` | `https://<domain>.pingdemo.com/mcp/<id>` |
| `legacy_agent` / `legacy_mcp` | Alphanumeric-only (UUID-style, no slashes) — accepted but triggers a warning and mapped to standard URI |

### `DELEGATION_RULES`

- **User token** — `required_claims: ['sub', 'may_act']`; `may_act.required_fields: ['client_id']`
- **Exchanged token** — `required_claims: ['sub', 'act']`; `act.required_fields: ['sub']`

Validation results are written to `exchangeAuditStore` as `delegation_claims_validation` events.

### Agent authorization check

`validateAgentAuthorization(mayAct, userPreferences)` checks `mayAct.sub || mayAct.client_id` against `userPreferences.authorizedAgents[]`. If `userPreferences.authorizedAgentsExpiry` is set, expiry is enforced. If `userPreferences.authorizedAgents` is empty (default), every agent is rejected — supply the list when calling.

---

## Email notifications

Sent via `_sendDelegationEmail(delegateUserId, type, delegatorEmail)` in `delegationService.js`. Fires asynchronously with `setImmediate` — never blocks the HTTP response.

**When emails fire:**
- `type: 'grant'` — after `grantDelegation` succeeds; also after `adminGrantDelegation`
- `type: 'revoke'` — after `revokeDelegation` succeeds; after `adminRevokeDelegation`

**Transport:** PingOne Management API `POST /v1/environments/{envId}/users/{delegateUserId}/messages` with `deliveryMethod: 'Email'`.

**Requirements:**
- `delegate_user_id` must be non-null (emails are skipped when `delegateUserId` is falsy)
- `PINGONE_ENVIRONMENT_ID` and `PINGONE_REGION` must be set in configStore
- A valid management token from `getManagementToken()` must be obtainable

Email send failures are caught and logged with `console.error('[delegationService] email send failed:')` — they never fail the HTTP response.

Grant email subject: `"Super Banking — You have been granted account access"`
Revoke email subject: `"Super Banking — Account access revoked"`

---

## UI — `DelegatedAccessPage.js`

File: `demo_api_ui/src/components/DelegatedAccessPage.js`

This page is currently **demo/static** — it renders hard-coded demo data (`DEMO_GRANTED_BY_ME`, `DEMO_GRANTED_TO_ME`, `DEMO_ACCOUNTS`) rather than calling `/api/delegation` live. Wiring it to the real API is future work.

### What the page shows

**"Access I've Granted" tab** (`DEMO_GRANTED_BY_ME`):
- Cards per delegate with avatar (initials + hue-derived colour), name, email, relationship, account pills, grant date, status badge
- Revoke button per card

**"Access Granted to Me" tab** (`DEMO_GRANTED_TO_ME`):
- Cards per delegator showing the delegator's accounts the user has access to

**Token Exchange Simulator panel** (`useDraggablePanel`):
- Left column: `SimEventRow` — one step per token chain event with status badge (`active`, `acquired`, `exchanged`, `acquiring`, `failed`, `skipped`, `waiting`) and optional explanation
- Right column: `SimEventDetail` — selected event shows RFC 8693 exchange API call body, JWT claims with colour-coding for `may_act`, `act`, `scope`, `aud`, and optional raw JWT toggle

### Grant delegation flow (UI stub)

The grant modal collects: delegate email, relationship (from `RELATIONSHIPS` list), and account selection. In the demo state this is UI-only and does not POST to the API.

### Supported relationships (UI list)

`['Spouse / Partner', 'Child', 'Parent', 'Sibling', 'Trusted Advisor', 'Other']`

---

## PingOne integration

The following PingOne Management API calls occur during delegation:

| Trigger | API call | Service |
|---|---|---|
| Delegate email not found in PingOne | `POST /v1/environments/{envId}/users` — provisions a new user with `name: { given: 'Family', family: 'Member' }`, `lifecycle.status: 'ACCOUNT_OK'`, first population ID | `delegationService.js` `grantDelegation` |
| Email notification (grant or revoke) | `POST /v1/environments/{envId}/users/{userId}/messages` | `delegationService.js` `_sendDelegationEmail` |
| Admin grant by email | `GET /v1/environments/{envId}/users?filter=username eq "{email}"` (via `fetchPingOneUserByUsername`) | `delegationService.js` `adminGrantDelegation` |

**Population for new users:** resolved at grant time via `fetchFirstPopulationId(token, apiRoot)` from `pingoneBootstrapService.js`.

**No delegation-specific PingOne entity exists** — there is no PingOne "delegation" object. All delegation state lives in LMDB. PingOne is used only to look up or provision the delegate user and send email.

**If management credentials are not configured** (`configStore` has no `PINGONE_ENVIRONMENT_ID` or `getManagementToken()` throws `'not configured'`): `grantDelegation` stores the record with `delegate_user_id: null` and skips the email — the demo continues to work without PingOne.

---

## Files to read before editing

| File | Why |
|---|---|
| `demo_api_server/services/delegationService.js` | Core CRUD logic, VALID_SCOPES, LMDB writes, email, PingOne provisioning |
| `demo_api_server/routes/delegation.js` | All HTTP routes, auth middleware, status code mapping |
| `demo_api_server/services/delegationChainValidationService.js` | RFC 8693 chain validation (agent/MCP path) |
| `demo_api_server/services/delegationClaimsService.js` | `may_act` / `act` claim validators and identifier format rules |
| `demo_api_ui/src/components/DelegatedAccessPage.js` | UI — demo data shapes, grant modal, token simulator panel |
| `demo_api_ui/src/components/DelegatedAccessPage.css` | Styling class names used by the JS component |
| `demo_api_server/services/lmdb/openEnv.js` | LMDB environment setup — relevant if changing DB names or options |
| `demo_api_server/services/pingOneUserLookupService.js` | `fetchPingOneUserByUsername` — called during grant to resolve delegate's PingOne ID |
| `demo_api_server/services/pingoneBootstrapService.js` | `fetchFirstPopulationId` — called when provisioning a new delegate user |
| `demo_api_server/middleware/auth.js` | `requireAdmin` — used on all `/admin/*` delegation routes |
| `REGRESSION_PLAN.md` §1 | Check if delegation routes are listed as protected files before editing |

---

## Common gotchas

- `VALID_SCOPES` uses plain names (`view_accounts`, not `banking:view_accounts`). Do not add `banking:` prefixes.
- The `GET /delegation/history` route **must** be declared before `GET /delegation/:id` in Express or `history` will be matched as an `:id` parameter.
- `_sendDelegationEmail` is a fire-and-forget via `setImmediate`. Do not `await` it in the grant/revoke path.
- `delegationChainValidationService.js` and `delegationClaimsService.js` operate on **agent/MCP token chains**, not on family-delegation LMDB records. They share conceptual `may_act`/`act` terminology but serve a different flow.
- When `delegate_user_id` is `null` (no PingOne creds), email notifications are silently skipped — this is expected demo fallback behaviour, not a bug.
- Admin routes at `/admin/all`, `/admin/grant`, `/admin/:id` require the `requireAdmin` middleware from `demo_api_server/middleware/auth.js`.
