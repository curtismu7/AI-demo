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

const express     = require('express');
const router      = express.Router();
const configStore = require('../services/configStore');

// ---------------------------------------------------------------------------
// Flag registry — add new flags here; they appear automatically in the UI.
// ---------------------------------------------------------------------------

/** @type {Array<{
 *   id: string, name: string, category: string,
 *   description: string, impact: string,
 *   type: 'boolean', defaultValue: boolean,
 *   envVar?: string, warnIfEnabled?: boolean
 * }>} */
const FLAG_REGISTRY = [
  // ── PingOne Authorize ──────────────────────────────────────────────────────
  {
    id:           'authorize_enabled',
    name:         'Transaction authorization (master)',
    category:     'PingOne Authorize',
    description:
      'Turn on policy-style evaluation before certain transactions (transfers/withdrawals; deposits optional). ' +
      'Use **Simulated Authorize** for education (no PingOne credentials), or turn simulation off and set a decision endpoint / policy ID for live PingOne Authorize.',
    impact:
      'ON + Simulated → in-process PERMIT/DENY/428 identical HTTP shape to PingOne. ' +
      'ON + not simulated → calls PingOne (requires worker app + endpoint or policy ID). OFF → no Authorize gate.',
    type:         'boolean',
    defaultValue: false,
    docsUrl:      'https://docs.PingOneentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html',
  },
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
    defaultValue: false,
    warnIfEnabled: true,
  },
  {
    id:           'ff_authorize_fail_open',
    name:         'Authorize — Fail Open',
    category:     'PingOne Authorize',
    description:  'When the Authorize API call fails (network timeout, misconfiguration), allow the transaction to proceed.',
    impact:       'ON = fail open (warn + allow). OFF = fail closed (deny transaction on any Authorize error). Recommended: ON during initial testing.',
    type:         'boolean',
    defaultValue: true,
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
    docsUrl:      'https://docs.PingOneentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html',
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
      'the BFF injects `banking:read banking:write` scopes into the token claims before attempting MCP exchange. ' +
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
    id:           'ff_two_exchange_delegation',
    name:         'Token Exchange — 2-Exchange Delegated Chain (AI Agent + MCP)',
    category:     'Token Exchange',
    description:
      'When ON, the BFF performs **two chained RFC 8693 exchanges** instead of one. ' +
      'Exchange #1: Subject Token + AI Agent actor token → Agent Exchanged Token (act.sub = AI_AGENT_CLIENT_ID). ' +
      'Exchange #2: Agent Exchanged Token + MCP actor token → Final Token with nested act claim ' +
      '(act.sub = MCP_CLIENT_ID, act.act.sub = AI_AGENT_CLIENT_ID). ' +
      'Requires: AI_AGENT_CLIENT_ID, AI_AGENT_CLIENT_SECRET, AGENT_GATEWAY_AUDIENCE, AI_AGENT_INTERMEDIATE_AUDIENCE, ' +
      'MCP_GATEWAY_AUDIENCE, MCP_RESOURCE_URI_TWO_EXCHANGE env vars, and AGENT_OAUTH_CLIENT_ID / AGENT_OAUTH_CLIENT_SECRET for Exchange #2. ' +
      'MCP_RESOURCE_URI_TWO_EXCHANGE must point to the Super Banking Resource Server (default: https://resource-server.pingdemo.com) — ' +
      'NOT the same as the 1-exchange MCP_SERVER_RESOURCE_URI. Using the wrong audience causes Exchange #2 to fire the wrong `act` expression → invalid_grant. ' +
      'Also requires mayAct.sub on user records to be set to AI_AGENT_CLIENT_ID ' +
      '(not the Banking App client ID used in the 1-exchange pattern).',
    impact:
      'OFF (default) = 1-exchange pattern: Subject Token → MCP Token (act.sub = BFF client). ' +
      'ON = 2-exchange pattern: Subject Token → Agent Exchanged Token → Final Token (act.sub = MCP, act.act.sub = AI Agent). ' +
      'PAZ can enforce both act.sub and act.act.sub as named policy attributes.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: false,
  },
  {
    id:           'ff_oidc_only_authorize',
    name:         'Login — OIDC-only authorize (no banking scopes)',
    category:     'Token Exchange',
    description:
      'When ON, the user login authorize request sends **only** `openid profile email offline_access` scopes. ' +
      'This fixes the PingOne **"May not request scopes for multiple resources"** error that occurs when ' +
      '`banking:*` scopes are registered on a separate PingOne API Resource Server. ' +
      'Banking routes relax to session-based authorization (identity gates only). ' +
      'Best used together with **ff_skip_token_exchange** ON so the agent forwards the OIDC token directly to MCP.',
    impact:
      'OFF (default) = full scope list (OIDC + banking:*) in authorize — works when banking scopes are plain app custom scopes. ' +
      'ON = OIDC-only authorize → no "multiple resources" error; banking scope gates on API routes relax to authenticated-session.',
    type:         'boolean',
    defaultValue: false,
    warnIfEnabled: false,
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

  const allowedIds = new Set(FLAG_REGISTRY.map(f => f.id));
  const toSave     = {};

  for (const [id, value] of Object.entries(updates)) {
    if (!allowedIds.has(id)) continue;
    // Normalise booleans to strings for configStore
    toSave[id] = typeof value === 'boolean' ? String(value) : value;
  }

  if (Object.keys(toSave).length === 0) {
    return res.status(400).json({ error: 'No valid flag IDs provided', allowed: [...allowedIds] });
  }

  try {
    await configStore.setConfig(toSave);
    const updatedFlags = FLAG_REGISTRY.filter(f => f.id in toSave).map(serializeFlag);
    res.json({ updated: true, flags: updatedFlags });
  } catch (err) {
    console.error('[featureFlags] PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to save feature flags', message: err.message });
  }
});

module.exports = { router, FLAG_REGISTRY };
