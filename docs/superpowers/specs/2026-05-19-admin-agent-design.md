# Admin Agent Design

**Date:** 2026-05-19  
**Branch:** fix/bootstrap-invalid-client-auto-retry  
**Status:** Approved

---

## Overview

Add an AI agent to the admin dashboard that allows admins to look up any customer, view their last 5 transactions, inspect personal data, and take administrative actions — all through the existing MCP tool pipeline with full Token Chain visibility.

The agent uses the same floating FAB / side panel pattern as the customer dashboard. It is automatically active on all `/admin` routes (no theme to select, no toggle — it just appears).

---

## Approach

**Option A — Admin-scoped tools in the shared MCP server.** Eight new tools are added to `BankingToolRegistry.ts`, gated by existing admin scopes from `scope-topology.json`. The BFF requests admin scopes during token exchange only for admin sessions. The existing `BankingAgent.js` is reused with an admin chip set. No new services or infrastructure.

---

## New MCP Tools

All 8 tools use `surface: "exchange-only"` (enforced at MCP server level, not gateway). They are registered in `scope-topology.json` (already done).

### Read tools

| Tool | Input | Returns | Scopes |
|------|-------|---------|--------|
| `lookup_customer` | `query` (name / email / account fragment) | Matching user(s) with basic profile | `admin:read`, `users:read` |
| `get_customer_profile` | `userId` | Full user record (name, email, role, status, createdAt) | `admin:read`, `users:read` |
| `get_customer_accounts` | `userId` | All accounts for that user | `admin:read`, `users:read` |
| `get_customer_transactions` | `userId`, optional `limit` (default 5) | Last N transactions across all accounts | `admin:read`, `users:read` |

### Action tools

| Tool | Input | Effect | Scopes |
|------|-------|--------|--------|
| `freeze_account` | `accountId`, `freeze: boolean` | Toggles `isActive` on account | `admin:write`, `users:manage` |
| `reset_customer_password` | `userId` | Sets `passwordResetRequired: true` on user record; customer is prompted on next login | `admin:write`, `users:manage` |
| `adjust_balance` | `accountId`, `amount`, `description` | Seeds a transaction and updates balance | `admin:write`, `users:manage` |
| `delete_customer` | `userId`, `confirm: boolean` | Deletes user + all accounts + transactions | `admin:write`, `admin:delete`, `users:manage` |

`confirm: boolean` on `delete_customer` is required and must be `true` — prevents accidental deletion.

---

## Authorization & Token Exchange

**Scopes used:** `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage` — all pre-existing in `scope-topology.json`. No new scopes needed. No PingOne provisioning changes needed (Super Banking Admin App already has all these in `grantedScopes`).

**Token exchange flow:**
1. Admin logs in → BFF holds PingOne access token with admin role claim
2. Admin triggers agent → `agentMcpTokenService.js` performs RFC 8693 exchange
3. BFF checks `req.user.role === 'admin'` — if true, appends admin scopes to the exchange request
4. PingOne issues MCP token with admin scopes included
5. `BankingToolProvider.ts` checks token for required scopes before executing any admin tool — 403 if absent

**Token Chain:** Admin tool calls appear in the Token Chain panel showing admin scopes on the exchanged token — same visibility as customer tools.

---

## Backend — New BFF Routes

New routes added under `demo_api_server/routes/` (new file `adminAgentTools.js`). All require `authenticateToken` + `role === 'admin'`.

| Route | Purpose | Tool |
|-------|---------|------|
| `GET /api/admin/agent/lookup?q=` | Search users by name/email/account fragment | `lookup_customer` |
| `GET /api/admin/agent/users/:userId` | Full user profile | `get_customer_profile` |
| `GET /api/admin/agent/users/:userId/accounts` | All accounts for user | `get_customer_accounts` |
| `GET /api/admin/agent/users/:userId/transactions?limit=5` | Last N transactions | `get_customer_transactions` |
| `PATCH /api/admin/agent/accounts/:accountId/freeze` | Toggle `isActive` | `freeze_account` |
| `POST /api/admin/agent/users/:userId/reset-password` | Set reset-required flag | `reset_customer_password` |
| `POST /api/admin/agent/accounts/:accountId/adjust` | Seed transaction + update balance | `adjust_balance` |
| `DELETE /api/admin/agent/users/:userId` | Delete user + cascade | `delete_customer` |

**MCP tool handlers** in `BankingToolRegistry.ts` / `BankingToolProvider.ts` call the above routes via `BankingAPIClient`, matching the existing tool pattern.

---

## Frontend

**No new components.** Changes to existing files only:

1. **`BankingChips.js`** — add admin chip group, shown when `user.role === 'admin'`:
   - Look up customer → `lookup_customer`
   - View transactions → `get_customer_transactions`
   - View profile → `get_customer_profile`
   - Freeze account → `freeze_account`
   - Adjust balance → `adjust_balance`
   - Reset password → `reset_customer_password`
   - Delete customer → `delete_customer`

2. **`BankingAgent.js` (or route helper)** — extend `isBankingAgentDashboardRoute()` to return `true` for `/admin*` routes so the FAB appears automatically on all admin pages.

3. **`agentMcpTokenService.js`** — when `req.user.role === 'admin'`, append admin scopes to the token exchange request.

4. **Destructive action confirmation** — `freeze_account` and `delete_customer` use the existing HITL consent pattern for confirmation before execution.

---

## Files to Touch

| File | Change |
|------|--------|
| `scope-topology.json` | Add 8 new tool entries (done) |
| `demo_mcp_server/src/tools/BankingToolRegistry.ts` | Register 8 new tool definitions |
| `demo_mcp_server/src/tools/BankingToolProvider.ts` | Add handlers for 8 new tools |
| `demo_api_server/routes/adminAgentTools.js` | New file — 8 BFF route handlers |
| `demo_api_server/server.js` | Mount `adminAgentTools` router |
| `demo_api_server/services/agentMcpTokenService.js` | Append admin scopes for admin sessions |
| `demo_api_ui/src/components/BankingChips.js` | Add admin chip group |
| `demo_api_ui/src/components/BankingAgent.js` | Extend FAB visibility to `/admin*` routes |

---

## Success Criteria

- FAB appears automatically on `/admin` dashboard without any toggle
- Admin can type "look up john" → agent calls `lookup_customer` → results shown in panel
- Admin can ask "show last 5 transactions for user X" → agent calls `get_customer_transactions`
- Admin can freeze an account → HITL confirmation → `freeze_account` executes → Token Chain shows `admin:write`
- Customer tokens cannot invoke admin tools (403 from MCP server)
- `cd demo_api_ui && npm run build` exits 0
- No regressions to customer dashboard agent flow
