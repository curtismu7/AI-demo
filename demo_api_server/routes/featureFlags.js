// banking_api_server/routes/featureFlags.js
'use strict';

/**
 * Feature Flags API — read/write toggles for in-development features.
 *
 * GET  /api/admin/feature-flags        → full registry with current values
 * PATCH /api/admin/feature-flags       → update one or more flag values
 *
 * Values are persisted via configStore (survives restarts on Vercel+KV or SQLite).
 * The FLAG_REGISTRY is the single source of truth for what flags exist.
 */

const express        = require('express');
const router         = express.Router();
const configStore    = require('../services/configStore');
const runtimeSettings = require('../config/runtimeSettings');

// ---------------------------------------------------------------------------
// Flag registry — add new flags here; they appear automatically in the UI.
// ---------------------------------------------------------------------------

/** @type {Array<{
 *   id: string, name: string, category: string,
 *   description: string, impact: string,
 *   type: 'boolean', defaultValue: boolean,
 *   envVar?: string, warnIfEnabled?: boolean, warnIfDisabled?: boolean,
 *   docsUrl?: string,
 *   runtimeKey?: string  // when set, the flag is also mirrored into
 *                        // config/runtimeSettings under this key (live toggle);
 *                        // resolveFlag()/PATCH keep the two in sync.
 * }>} */
const FLAG_REGISTRY = [
  // ── PingOne Authorize (ALWAYS ON — no toggle) ──────────────────────────────
  // Authorization is mandatory for security. See transactionAuthorizationService.js for details.
  {
    id:           'ff_authorize_simulated',
    name:         'Simulated Authorize (education)',
    category:     'PingOne Authorize',
    description:
      'When **Transaction authorization** is ON, evaluate with an in-process policy that mimics PingOne Authorize outcomes (PERMIT, DENY, policy step-up → 428). No worker token or PingOne API call. ' +
      'Turn **OFF** to use real PingOne Authorize (requires decision endpoint or policy ID + worker credentials).',
    impact:
      'ON = education mode: deny above $50k (configurable via SIMULATED_AUTHORIZE_DENY_AMOUNT); policy step-up for large transfers/withdrawals without strong ACR (see simulatedAuthorizeService.js). OFF = live PingOne only.',
    type:         'boolean',
    defaultValue: true,
    warnIfEnabled: true,
  },
  {
    id:           'ff_authorize_fail_open',
    name:         'Authorize — Fail Open',
    category:     'PingOne Authorize',
    description:  'When the Authorize API call fails (network timeout, misconfiguration), allow the transaction to proceed.',
    impact:       'ON = fail open (warn + allow). OFF = fail closed (deny transaction on any Authorize error). Recommended: ON during initial testing.',
    type:         'boolean',
    defaultValue: false,
    warnIfDisabled: true, // warn in UI that OFF = hard fail
  },
  {
    id:           'ff_authorize_deposits',
    name:         'Authorize — Apply to Deposits',
    category:     'PingOne Authorize',
    description:  'Evaluate deposit transactions through the Authorize policy (in addition to transfers and withdrawals).',
    impact:       'OFF = only transfers + withdrawals go through Authorize. ON = deposits also require PERMIT.',
    type:         'boolean',
    defaultValue: false,
  },
  {
    id:           'ff_authorize_mcp_first_tool',
    name:         'Authorize — First MCP tool (BankingAgent)',
    category:     'PingOne Authorize',
    description:
      'On the **first** MCP tool call per signed-in session (POST /api/mcp/tool with a delegated MCP access token), ' +
      'evaluate **PingOne Authorize** using Trust Framework **DecisionContext=McpFirstTool** — or **Simulated Authorize** when that flag is on. ' +
      'Requires **MCP decision endpoint ID** in Application Configuration for live PingOne. Skips admins and local MCP fallback (no bearer).',
    impact:
      'OFF = no extra Authorize round-trip for MCP (MCP server still introspects tokens). ON = first tool may return 403/428 from policy.',
    type:         'boolean',
    defaultValue: false,
    docsUrl:      'https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html',
  },

  // ── Step-Up Auth ───────────────────────────────────────────────────────────
  {
    id:           'step_up_enabled',
    name:         'Step-Up MFA',
    category:     'Step-Up Auth',
    description:  'Require MFA step-up authentication for high-value transactions (transfers / withdrawals above the configured threshold).',
    impact:       'OFF = step-up challenges are skipped for all transactions. ON = users are challenged for transactions over the threshold.',
    type:         'boolean',
    defaultValue: true,
    runtimeKey:   'stepUpEnabled', // maps to runtimeSettings for live toggle
  },

  // ── HITL / Agent Consent ───────────────────────────────────────────────────
  {
    id:           'ff_hitl_enabled',
    name:         'HITL — Agent Consent Gate',
    category:     'HITL / Agent Consent',
    description:  'Require explicit human approval before the AI agent can execute high-value transactions.',
    impact:       'ON = agent-initiated transactions trigger a consent dialog. OFF = agent transactions bypass the approval gate (use only in development).',
    type:         'boolean',
    defaultValue: true,
    warnIfDisabled: true,
  },
  {
    id:           'hitl_consent_mfa_mode',
    name:         'HITL — Consent MFA mode',
    category:     'HITL / Agent Consent',
    description:
      'Controls how the one-time verification code is delivered after the user approves the consent challenge. ' +
      '**onetime** (default) — PingOne sends the OTP directly to the user\'s registered email or phone; no device enrollment required. ' +
      '**device_picker** — full PingOne MFA with device selection (requires enrolled devices + MFA policy). ' +
      '**homegrown** — BFF-generated OTP delivered via the app\'s own email service (no PingOne MFA).',
    impact:
      'onetime (default) = PingOne one-time OTP, works for any user with an email or phone on record. ' +
      'device_picker = enrolled-device flow with amount step-up threshold (confirm_stepup_threshold_usd). ' +
      'homegrown = legacy BFF email OTP.',
    type:         'enum',
    options:      ['onetime', 'device_picker', 'homegrown'],
    defaultValue: 'onetime',
  },

  // ── MCP Server ─────────────────────────────────────────────────────────────
  {
    id:           'mcp_use_legacy_protocol',
    name:         'MCP — Use 2024-11-05 Protocol (legacy)',
    category:     'MCP Server',
    description:
      'When **ON**, the BFF announces `protocolVersion: 2024-11-05` in the MCP `initialize` handshake. ' +
      'Default (**OFF**) uses `2025-11-25` (current spec, recommended). ' +
      'This is useful when connecting to an older MCP server that only supports the previous protocol version. ' +
      'Change takes effect on the **next** agent MCP tool call (each call opens a fresh WebSocket).',
    impact:
      'OFF (default) = 2025-11-25 handshake (full spec compliance). ' +
      'ON = 2024-11-05 handshake — only enable if your MCP server rejects 2025-11-25.',
    type:         'boolean',
    defaultValue: false,
  },

  {
    id:           'mcp_use_pingone_server',
    name:         'MCP — Use PingOne MCP Server (stdio)',
    category:     'MCP Server',
    description:
      'When **ON**, the BFF spawns the `pingidentity/pingone-mcp-server` stdio binary and routes ' +
      'all agent tool calls through its stdio transport via an adapter layer, bypassing the custom ' +
      'MCP gateway. The PingOne MCP Server must be installed (npx or local binary) and configured ' +
      'with `PINGONE_MCP_SERVER_CMD` env var. ' +
      'When **OFF** (default), the existing custom MCP gateway continues to handle all tool calls.',
    impact:
      'OFF (default) = custom MCP gateway active (all Phase 243 auth, RFC 9728, PingOne Authorize). ' +
      'ON = PingOne MCP Server stdio mode; custom gateway bypassed. Requires valid PingOne credentials ' +
      'in env. The MCP Gateway Config panel shows active mode chip.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: true,
  },

  // ── Token Exchange ──────────────────────────────────────────────────────────
  {
    id:           'ff_inject_may_act',
    name:         'Token Exchange — Auto-inject may_act (BFF synthetic)',
    category:     'Token Exchange',
    description:
      'When the user access token is missing a `may_act` claim, the BFF **synthesises** one ' +
      '(`{ client_id: <bff-client-id> }`) before attempting RFC 8693 token exchange. ' +
      'This lets you demo a successful exchange without modifying PingOne token policies. ' +
      '**Educational only** — PingOne still validates the real token; the synthetic claim only affects what the ' +
      'BFF passes as `subject_token`. Disable in production once PingOne is configured to add `may_act` natively.',
    impact:
      'OFF (default) = missing may_act shows a warning and exchange may fail per PingOne policy. ' +
      'ON = BFF adds synthetic may_act before exchange; Token Chain shows an "injected" badge.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: true,
  },
  {
    id:           'ff_inject_audience',
    name:         'Token Exchange — Auto-inject audience (BFF synthetic)',
    category:     'Token Exchange',
    description:
      'When the user access token\'s `aud` claim does not include `mcp_resource_uri`, the BFF **adds it** ' +
      'to the local claim snapshot before validation. This mirrors the behaviour when PingOne is configured to ' +
      'include the resource URI in issued access tokens (RFC 8707 resource indicators). ' +
      '**Educational only** — the JWT itself is unchanged; only the BFF\'s internal claim snapshot is updated for ' +
      'Token Chain display. Disable in production once PingOne is configured to issue tokens with the correct audience.',
    impact:
      'OFF (default) = missing resource URI in aud is shown as-is; exchange may fail with audience mismatch. ' +
      'ON = BFF adds mcp_resource_uri to the aud snapshot; Token Chain shows an "injected" badge.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: true,
  },
  {
    id:           'ff_inject_scopes',
    name:         'Inject Banking Scopes (Demo Mode)',
    category:     'OAuth Scopes',
    description:
      'When enabled and the user access token lacks banking scopes (most common when PingOne custom resource server is not configured), ' +
      'the BFF injects `read write` scopes into the token claims before attempting MCP exchange. ' +
      'Injected scopes are marked with INJECTED labels in the Token Chain panel. This is **demo mode only** — not for production. ' +
      'In production, scopes come directly from PingOne via a properly configured resource server.',
    impact:
      'OFF (default) = no injection (real scopes only, empty if resource server missing). ' +
      'ON = scopes injected to allow demo to function without resource server setup. Marked as INJECTED in UI.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: true,
  },
  {
    id:           'ff_skip_token_exchange',
    name:         'Token Exchange — Skip RFC 8693 (direct user token)',
    category:     'Token Exchange',
    description:
      'When ON, the BFF **skips RFC 8693 token exchange** and passes the user\'s access token directly to the MCP server. ' +
      'The alternative (**OFF**, default) is full on-behalf-of exchange: the BFF mints a dedicated agent client-credentials ' +
      'token and performs RFC 8693 to produce a narrower, audience-scoped token with an `act` claim identifying the agent. ' +
      'Enable this flag when PingOne is not yet configured for token exchange — it lets you verify the rest of the MCP flow without needing a token exchange policy.',
    impact:
      'OFF (default) = RFC 8693 exchange — MCP server receives a scoped delegated token with act claim. ' +
      'ON = user\'s raw access token forwarded to MCP — no exchange, no act claim, potentially wider audience.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: true,
  },
  {
    id:           'ff_oidc_only_authorize',
    name:         'Login — OIDC-only authorize (no banking scopes)',
    category:     'Token Exchange',
    description:
      'When ON, the user login authorize request sends **only** `openid profile email offline_access` scopes. ' +
      'This fixes the PingOne **"May not request scopes for multiple resources"** error that occurs when ' +
      '`*` scopes are registered on a separate PingOne API Resource Server. ' +
      'Banking routes relax to session-based authorization (identity gates only). ' +
      'Best used together with **ff_skip_token_exchange** ON so the agent forwards the OIDC token directly to MCP.',
    impact:
      'OFF (default) = full scope list (OIDC + *) in authorize — works when banking scopes are plain app custom scopes. ' +
      'ON = OIDC-only authorize → no "multiple resources" error; banking scope gates on API routes relax to authenticated-session.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: false,
  },
  {
    id:           'ff_id_token_exchange',
    name:         'ID Token Exchange Mode',
    category:     'Token Exchange',
    description:  'When ON, the agent receives only the user\'s ID token (not the access token). The BFF performs RFC 8693 token exchange using the ID token as subject_token (subject_token_type: urn:ietf:params:oauth:token-type:id_token). Agent never holds broad user access token — scoped delegation only.',
    impact:       'OFF (default) = standard access token flows unchanged. ON = ID token used as exchange subject; set subject_token_type to id_token in exchange request.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: false,
  },

  // ── LLM Chips ──────────────────────────────────────────────────────────────
  {
    id:           'ff_heuristic_enabled',
    name:         'LLM Chips — Use Heuristic Fast-Path',
    category:     'LLM Chips',
    description:
      'When **ON** (default), the agent uses fast heuristic queries for balance, accounts, and transactions (~200-300ms). ' +
      'When **OFF**, all queries go through the LLM for advanced analysis (~1-3s). Both modes show chips, but heuristics take a fast dedicated code path.',
    impact:
      'ON (default) = quick responses for balance/accounts/transactions via heuristic NL parser; LLM for analysis/insights. ' +
      'OFF = all queries routed through LLM (slower but more conversational/analytical).',
    type:         'boolean',
    defaultValue: true,
  },

  // ── UI / Dashboard ─────────────────────────────────────────────────────────
  {
    id:           'ff_show_banking_in_middle_agent',
    name:         'Dashboard — Show Banking Column With Centered Agent',
    category:     'UI / Dashboard',
    description:
      'Controls the customer dashboard layout **only when the AI agent is placed in the center column**. ' +
      'When **OFF** (default), the banking-info column is hidden so the dashboard stays clean — ' +
      'balances and account details come from the agent response or its pop-out instead. ' +
      'When **ON**, the banking-info column is shown alongside the centered agent (legacy layout). ' +
      'The floating (corner FAB) and bottom-dock agent placements always show the banking column and are not affected by this flag.',
    impact:
      'OFF (default) = cleaner dashboard; with a centered agent only the Token Chain and the agent are shown, banking info via the agent / pop-out. ' +
      'ON = banking column also shown next to the centered agent.',
    type:         'boolean',
    defaultValue: false,
  },

];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve current value of a flag from configStore.
 * Falls back to the registry's defaultValue if not set.
 */
function resolveFlag(flag) {
  // Flags with a runtimeKey are mirrored into runtimeSettings (in-memory, the
  // source consumers actually read — e.g. mcpInspector / mcpLocalTools read
  // runtimeSettings.get('stepUpEnabled')). Report the live runtime value so the
  // GET response, the UI toggle, and the enforcement path never disagree.
  if (flag.runtimeKey) {
    const live = runtimeSettings.get(flag.runtimeKey);
    if (live !== undefined) {
      return flag.type === 'boolean' ? (live === true || live === 'true') : live;
    }
  }
  const raw = configStore.get(flag.id);
  if (raw === null || raw === undefined) return flag.defaultValue;
  if (flag.type === 'boolean') return raw === true || raw === 'true';
  return raw;
}

/** Serialize a flag + its current value for the API response. */
function serializeFlag(flag) {
  return {
    id:             flag.id,
    name:           flag.name,
    category:       flag.category,
    description:    flag.description,
    impact:         flag.impact,
    type:           flag.type,
    defaultValue:   flag.defaultValue,
    value:          resolveFlag(flag),
    ...(flag.options      && { options:      flag.options }),
    ...(flag.docsUrl      && { docsUrl:      flag.docsUrl }),
    ...(flag.warnIfDisabled && { warnIfDisabled: flag.warnIfDisabled }),
    ...(flag.warnIfEnabled  && { warnIfEnabled:  flag.warnIfEnabled }),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /api/admin/feature-flags — returns all flags with current values */
router.get('/', async (req, res) => {
  try {
    const flags = FLAG_REGISTRY.map(serializeFlag);
    const categories = [...new Set(FLAG_REGISTRY.map(f => f.category))];
    res.json({ flags, categories });
  } catch (err) {
    console.error('[featureFlags] GET error:', err.message);
    res.status(500).json({ error: 'Failed to read feature flags', message: err.message });
  }
});

/** PATCH /api/admin/feature-flags — update one or more flag values */
router.patch('/', async (req, res) => {
  const { updates } = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body must be { updates: { flagId: value } }' });
  }

  const flagsById  = new Map(FLAG_REGISTRY.map(f => [f.id, f]));
  const toSave     = {};
  const runtimeUpdates = {};

  for (const [id, value] of Object.entries(updates)) {
    const flag = flagsById.get(id);
    if (!flag) continue;
    // Normalise booleans to strings for configStore
    toSave[id] = typeof value === 'boolean' ? String(value) : value;
    // Flags with a runtimeKey ALSO mirror into runtimeSettings so the toggle
    // takes effect on the live process immediately (consumers read
    // runtimeSettings, not configStore). configStore persists it across
    // restarts; the boot seed in server.js re-applies it on next start.
    if (flag.runtimeKey) {
      runtimeUpdates[flag.runtimeKey] =
        flag.type === 'boolean' ? (value === true || value === 'true') : value;
    }
  }

  if (Object.keys(toSave).length === 0) {
    return res.status(400).json({ error: 'No valid flag IDs provided', allowed: [...flagsById.keys()] });
  }

  try {
    await configStore.setRaw(toSave);
    if (Object.keys(runtimeUpdates).length > 0) {
      runtimeSettings.update(runtimeUpdates, 'feature-flags-api');
    }
    const updatedFlags = FLAG_REGISTRY.filter(f => f.id in toSave).map(serializeFlag);
    res.json({ updated: true, flags: updatedFlags });
  } catch (err) {
    console.error('[featureFlags] PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to save feature flags', message: err.message });
  }
});

module.exports = { router, FLAG_REGISTRY };
