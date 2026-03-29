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
    docsUrl:      'https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html',
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
