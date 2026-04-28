/**
 * ArchitectureOverviewPage.js — /architecture/overview
 *
 * 15-step simulation matching real banking demo code flow.
 * Each step shows:
 *   - Highlighted regions on the PNG diagram
 *   - Token side card (white bg, readable text, RFC badges)
 *   - Dual tokens where applicable (ID token + Access token at login)
 *   - RFC 8693 stacked Request/Issued for exchange steps
 *   - Aud trail strip above diagram
 *   - ← Prev / Pause / Resume / Next → / Stop controls
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { OVERVIEW_REGIONS } from '../config/diagram-overview-regions';

const OVERVIEW_EVENT_MAP = [
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], regionIds: ['agent'],                   colorClass: 'active' },
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_complete'],                               regionIds: ['agent'],                   colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-success'],                          regionIds: ['idp-oauth-as', 'mcp-gw'],  colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-error'],                            regionIds: ['idp-oauth-as', 'mcp-gw'],  colorClass: 'active-error' },
  { category: 'authorize',     tags: ['authorize/bypass'],  regionIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'authorize',     tags: ['authorize/permit'],  regionIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize',     tags: ['authorize/deny'],    regionIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'oauth',         tags: ['oauth/user/callback'], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'oauth',         tags: [],                      regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp',           tags: [], regionIds: ['mcp-gw'], colorClass: 'active' },
  { category: 'agent',         tags: ['agent/message'], regionIds: ['agent'], colorClass: 'active' },
];

// ─── Simulation steps ─────────────────────────────────────────────────────────
// token  = primary card   token2 = secondary card (dual display)
// isTokenExchange = true  → stacked Request / ↓ Issued layout
// _type controls accent border color: oauth | exchange | permit | hitl | idtoken | mcp
// _rfcs = RFC badge pills shown in card header

const OVERVIEW_SIMULATE_STEPS = [
  {
    regionIds: ['user'], colorClass: 'active', label: 'User sends message',
    token: null,
  },
  {
    regionIds: ['user', 'idp-oauth-as'], colorClass: 'active', label: 'OAuth 2.0 PKCE login',
    token: {
      type: 'Authorization Code Request',
      _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 7636'],
      response_type: 'code',
      scope: 'openid profile banking:read banking:write',
      code_challenge_method: 'S256',
      note: 'PKCE: code_verifier stored client-side; only code_challenge sent — prevents auth-code interception',
    },
  },
  {
    regionIds: ['idp-oauth-as', 'agent'], colorClass: 'active', label: 'IdP issues ID Token + Access Token (with may_act)',
    // Dual: ID token + Access token shown side by side
    token: {
      type: 'ID Token (OIDC)',
      _type: 'idtoken', _rfcs: ['RFC 7519', 'OIDC Core'],
      iss: 'https://your-idp.example.com',
      sub: 'alice@bank.com',
      aud: 'banking-app-client',
      email: 'alice@bank.com',
      name: 'Alice Smith',
      note: 'ID token is for the UI only — never sent to APIs or MCP tools',
    },
    token2: {
      type: 'Access Token',
      _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 8693'],
      aud: 'banking-app-client',
      sub: 'alice@bank.com',
      scope: 'openid profile banking:read banking:write',
      may_act: '{ "client_id": "bff-client-id" }',
      note: 'may_act pre-authorizes BFF/gateway to exchange on behalf of user (RFC 8693 §4.2)',
    },
  },
  {
    regionIds: ['agent'], colorClass: 'active', label: 'LLM interprets user intent',
    token: {
      type: 'LLM Reasoning',
      _type: 'mcp',
      model: 'claude-3-5-sonnet',
      intent: '"show me my accounts"',
      action: 'tools/call: get_my_accounts',
      note: 'LangGraph heuristic fallback routes to MCP tool node when LLM selects tool',
    },
  },
  {
    regionIds: ['agent', 'idp-oauth-as'], colorClass: 'active', label: 'BFF: RFC 8693 exchange → delegation token',
    isTokenExchange: true,
    token: {
      type: 'User Access Token (subject)',
      _type: 'oauth', _rfcs: ['RFC 8693'],
      aud: 'banking-app-client',
      sub: 'alice@bank.com',
      scope: 'openid profile banking:read banking:write',
      may_act: '{ "client_id": "bff-client-id" }',
      note: 'BFF sends this token to IdP for exchange → requested_aud: mcp-gateway',
    },
    tokenOut: {
      type: 'Delegated Token (issued)',
      _type: 'exchange', _rfcs: ['RFC 8693'],
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'act chain added — identifies the acting agent throughout the delegation path',
    },
  },
  {
    regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'Agent → MCP Gateway: tools/list',
    token: {
      type: 'Delegated Token (inbound)',
      _type: 'oauth', _rfcs: ['RFC 8693', 'RFC 6750'],
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'Gateway validates: aud=mcp-gateway ✓  sub≠∅ ✓  act.sub≠∅ ✓  D-05 anti-bypass ✓',
    },
  },
  {
    regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: McpToolsList check',
    token: {
      type: 'PingAuthorize Request',
      _type: 'mcp',
      DecisionContext: 'McpToolsList',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      TokenScopes: 'banking:read banking:write',
      TokenAudience: 'mcp-gateway',
      note: 'Can this agent discover available tools for this user?',
    },
  },
  {
    regionIds: ['pingauthorize'], colorClass: 'active-permit', label: 'PERMIT — tools discovery allowed',
    token: {
      type: 'Authorization Decision',
      _type: 'permit',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolsList',
      policy: 'mcp-tools-access-v2',
    },
  },
  {
    regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'Agent → MCP Gateway: tools/call get_my_accounts',
    token: {
      type: 'Delegated Token (tools/call)',
      _type: 'oauth', _rfcs: ['RFC 8693'],
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      method: 'tools/call',
      tool_name: 'get_my_accounts',
    },
  },
  {
    regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: McpToolCall check',
    token: {
      type: 'PingAuthorize Request',
      _type: 'mcp',
      DecisionContext: 'McpToolCall',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      ToolName: 'get_my_accounts',
      TokenScopes: 'banking:read',
      TokenAudience: 'mcp-gateway',
      note: 'Adds ToolName for per-tool policy — finer control than McpToolsList',
    },
  },
  {
    regionIds: ['pingauthorize'], colorClass: 'active-permit', label: 'PERMIT — tool call allowed',
    token: {
      type: 'Authorization Decision',
      _type: 'permit',
      decision: '✅ PERMIT',
      DecisionContext: 'McpToolCall',
      ToolName: 'get_my_accounts',
      policy: 'mcp-tool-call-v2',
    },
  },
  {
    regionIds: ['mcp-gw', 'idp-oauth-as'], colorClass: 'active', label: 'Gateway: RFC 8693 scope-narrowed exchange',
    isTokenExchange: true,
    token: {
      type: 'Delegated Token (subject)',
      _type: 'exchange', _rfcs: ['RFC 8693', 'RFC 8707'],
      aud: 'mcp-gateway',
      sub: 'alice@bank.com',
      scope: 'banking:read banking:write',
      act: '{ "sub": "agent-client-id" }',
      note: 'D-04: gateway exchanges this — original never forwarded → requested_aud: mcp-olb-server, scope: banking:read',
    },
    tokenOut: {
      type: 'Tool-Scoped Token (issued)',
      _type: 'oauth', _rfcs: ['RFC 8693'],
      aud: 'mcp-olb-server',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
      note: 'Minimal scope — MCP Server cannot use this for write operations',
    },
  },
  {
    regionIds: ['api-gw', 'service-a'], colorClass: 'active', label: 'MCP Server → Banking API',
    token: {
      type: 'Resource Token',
      _type: 'oauth', _rfcs: ['RFC 6750'],
      aud: 'banking-api',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /accounts',
      note: 'MCP Server validates: aud=mcp-olb-server ✓  may_act ✓  act.sub ✓  before forwarding',
    },
  },
  {
    regionIds: ['service-b', 'service-c'], colorClass: 'active', label: 'Results flow back to user',
    token: {
      type: 'API Response',
      _type: 'mcp',
      status: '200 OK',
      data: '[{ "accountId":"ACC-001","balance":12450.00 },...]',
      route: 'Banking API → MCP Server → MCP Gateway → Agent → User',
    },
  },
];

const OVERVIEW_AUD_HOPS = [
  { icon: '👤', label: 'User Token',     aud: 'banking-app-client', may_act: 'bff-client-id',  activeFrom: 2,  activeTo: 3  },
  { icon: '🔄', label: 'RFC 8693 #1',   aud: '(exchange)',          isExchange: true,            activeFrom: 4,  activeTo: 4  },
  { icon: '🔀', label: 'Gateway Token',  aud: 'mcp-gateway',        act: 'agent-client-id',      activeFrom: 5,  activeTo: 10 },
  { icon: '🔄', label: 'RFC 8693 #2',   aud: '(exchange)',          isExchange: true,            activeFrom: 11, activeTo: 11 },
  { icon: '🛠️', label: 'Tool Token',    aud: 'mcp-olb-server',     act: 'agent-client-id',      activeFrom: 12, activeTo: 12 },
  { icon: '🏦', label: 'Resource Token', aud: 'banking-api',                                     activeFrom: 12, activeTo: 13 },
];

// ─── Additional simulation scenarios ─────────────────────────────────────────

const SCENARIO_STEPS = {
  'id-token': [
    {
      regionIds: ['user', 'idp-oauth-as'], colorClass: 'active', label: 'OAuth 2.0 PKCE — code request',
      token: { type: 'Authorization Code Request', _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 7636'],
        response_type: 'code', scope: 'openid profile banking:read banking:write', code_challenge_method: 'S256',
        note: 'PKCE: code_verifier stored client-side; only code_challenge sent — prevents auth-code interception' },
    },
    {
      regionIds: ['idp-oauth-as'], colorClass: 'active', label: 'Code exchange → token issuance',
      token: { type: 'Token Request', _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 7636'],
        grant_type: 'authorization_code',
        note: 'IdP verifies code_verifier matches stored code_challenge (S256 hash)' },
    },
    {
      regionIds: ['idp-oauth-as', 'agent'], colorClass: 'active', label: 'ID Token issued — UI only, never sent to APIs',
      token: { type: 'ID Token (OIDC)', _type: 'idtoken', _rfcs: ['RFC 7519', 'OIDC Core'],
        iss: 'https://your-idp.example.com', sub: 'alice@bank.com', aud: 'banking-app-client',
        email: 'alice@bank.com', name: 'Alice Smith',
        note: 'ID token aud is ONLY the client — never sent to APIs, MCP tools, or backend services' },
    },
    {
      regionIds: ['idp-oauth-as', 'agent'], colorClass: 'active', label: 'Access Token issued — with may_act pre-authorization',
      token: { type: 'Access Token', _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 8693'],
        aud: 'banking-app-client', sub: 'alice@bank.com',
        scope: 'openid profile banking:read banking:write',
        may_act: '{ "client_id": "bff-client-id" }',
        note: 'may_act grants BFF permission to perform RFC 8693 exchange on behalf of this user' },
    },
    {
      regionIds: ['agent'], colorClass: 'active', label: 'BFF stores access token — ID token stays in browser',
      token: { type: 'Token Storage', _type: 'mcp',
        id_token_location: 'Browser memory only', access_token_location: 'BFF server-side session',
        note: 'ID token: never leaves browser. Access token: BFF holds it — never exposed to frontend' },
    },
  ],

  'user-token': [
    {
      regionIds: ['agent'], colorClass: 'active', label: 'BFF holds user access token',
      token: { type: 'User Access Token (held by BFF)', _type: 'oauth', _rfcs: ['RFC 8693'],
        aud: 'banking-app-client', sub: 'alice@bank.com',
        scope: 'openid profile banking:read banking:write',
        may_act: '{ "client_id": "bff-client-id" }',
        note: 'may_act is the key — authorizes BFF to perform delegation exchange (RFC 8693 §4.2)' },
    },
    {
      regionIds: ['agent', 'idp-oauth-as'], colorClass: 'active', label: 'RFC 8693 Exchange #1 — user token IN, delegation token OUT',
      isTokenExchange: true,
      token: { type: 'User Access Token (subject)', _type: 'oauth', _rfcs: ['RFC 8693'],
        aud: 'banking-app-client', sub: 'alice@bank.com',
        scope: 'openid profile banking:read banking:write',
        may_act: '{ "client_id": "bff-client-id" }',
        note: 'BFF sends this as subject_token → IdP checks may_act before issuing delegation token' },
      tokenOut: { type: 'Delegated Token (issued)', _type: 'exchange', _rfcs: ['RFC 8693'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read banking:write',
        act: '{ "sub": "agent-client-id" }',
        note: 'aud narrowed to mcp-gateway — act chain added identifying the acting agent' },
    },
    {
      regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'Delegation token arrives at MCP Gateway',
      token: { type: 'Delegated Token (inbound)', _type: 'oauth', _rfcs: ['RFC 8693', 'RFC 6750'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read banking:write',
        act: '{ "sub": "agent-client-id" }',
        note: 'Gateway validates: aud=mcp-gateway ✓  sub≠∅ ✓  act.sub≠∅ ✓  D-05 anti-bypass ✓' },
    },
    {
      regionIds: ['mcp-gw', 'idp-oauth-as'], colorClass: 'active', label: 'RFC 8693 Exchange #2 — scope-narrowed for MCP Server',
      isTokenExchange: true,
      token: { type: 'Delegated Token (subject)', _type: 'exchange', _rfcs: ['RFC 8693', 'RFC 8707'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read banking:write',
        act: '{ "sub": "agent-client-id" }',
        note: 'D-04: gateway exchanges this — original never forwarded to MCP Server' },
      tokenOut: { type: 'Tool-Scoped Token (issued)', _type: 'oauth', _rfcs: ['RFC 8693'],
        aud: 'mcp-olb-server', scope: 'banking:read', sub: 'alice@bank.com',
        act: '{ "sub": "agent-client-id" }',
        note: 'aud=mcp-olb-server, scope narrowed to banking:read — act chain preserved' },
    },
    {
      regionIds: ['api-gw', 'service-a'], colorClass: 'active', label: 'Tool-scoped token forwarded to MCP Server',
      token: { type: 'Tool-Scoped Token (delivered)', _type: 'oauth', _rfcs: ['RFC 6750'],
        aud: 'mcp-olb-server', scope: 'banking:read', sub: 'alice@bank.com',
        act: '{ "sub": "agent-client-id" }',
        note: 'MCP Server validates aud=mcp-olb-server before calling any banking APIs' },
    },
  ],

  'get-accounts': [
    {
      regionIds: ['agent'], colorClass: 'active', label: 'LLM decides: get_my_accounts (banking:read)',
      token: { type: 'LLM Reasoning', _type: 'mcp', model: 'claude-3-5-sonnet',
        intent: '"show me my accounts"', action: 'tools/call: get_my_accounts',
        note: 'LangGraph routes to MCP tool node — read-only operation, no HITL needed' },
    },
    {
      regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'tools/list — discover available tools',
      token: { type: 'Delegated Token (tools/list)', _type: 'oauth', _rfcs: ['RFC 8693'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read banking:write',
        act: '{ "sub": "agent-client-id" }' },
    },
    {
      regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: McpToolsList check',
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolsList',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id',
        TokenScopes: 'banking:read banking:write', TokenAudience: 'mcp-gateway' },
    },
    {
      regionIds: ['pingauthorize'], colorClass: 'active-permit', label: 'PERMIT — tools discovery allowed',
      token: { type: 'Authorization Decision', _type: 'permit', decision: '✅ PERMIT',
        DecisionContext: 'McpToolsList', policy: 'mcp-tools-access-v2' },
    },
    {
      regionIds: ['agent', 'mcp-gw'], colorClass: 'active', label: 'tools/call get_my_accounts',
      token: { type: 'Delegated Token (tools/call)', _type: 'oauth', _rfcs: ['RFC 8693'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read banking:write',
        act: '{ "sub": "agent-client-id" }', method: 'tools/call', tool_name: 'get_my_accounts' },
    },
    {
      regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: McpToolCall — read scope sufficient?',
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolCall',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id', ToolName: 'get_my_accounts',
        TokenScopes: 'banking:read', TokenAudience: 'mcp-gateway' },
    },
    {
      regionIds: ['pingauthorize'], colorClass: 'active-permit', label: 'PERMIT — banking:read sufficient for get_my_accounts',
      token: { type: 'Authorization Decision', _type: 'permit', decision: '✅ PERMIT',
        DecisionContext: 'McpToolCall', ToolName: 'get_my_accounts', policy: 'mcp-tool-call-v2' },
    },
    {
      regionIds: ['api-gw', 'service-a'], colorClass: 'active', label: 'Banking API returns accounts — 200 OK',
      token: { type: 'API Response', _type: 'mcp', status: '200 OK',
        data: '[{ "accountId":"ACC-001","balance":12450.00 },...]', scope_used: 'banking:read' },
    },
  ],

  'withdrawal': [
    {
      regionIds: ['agent'], colorClass: 'active', label: 'LLM decides: create_transfer (banking:write)',
      token: { type: 'LLM Reasoning', _type: 'mcp', model: 'claude-3-5-sonnet',
        intent: '"transfer $5,000 to savings"', action: 'tools/call: create_transfer',
        scope_needed: 'banking:write',
        note: 'Write operation — higher risk, requires banking:write scope and likely HITL approval' },
    },
    {
      regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: create_transfer — high-risk write',
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolCall',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id', ToolName: 'create_transfer',
        TokenScopes: 'banking:write', TokenAudience: 'mcp-gateway',
        note: 'Write operation triggers high-risk policy evaluation in PingAuthorize' },
    },
    {
      regionIds: ['pingauthorize'], colorClass: 'active-hitl', label: 'INDETERMINATE — human consent required',
      isHitl: true,
      token: { type: 'Authorization Decision', _type: 'hitl', decision: '⚠️ INDETERMINATE',
        DecisionContext: 'McpToolCall', ToolName: 'create_transfer', reason: 'high-risk write operation',
        note: 'PingAuthorize cannot auto-approve — HITL required before execution' },
    },
    {
      regionIds: ['agent'], colorClass: 'active-hitl', label: 'Agent awaits human approval via HITL',
      isHitl: true,
      token: { type: 'HITL Approval Request', _type: 'hitl',
        trigger: 'PingAuthorize INDETERMINATE', action: 'create_transfer $5,000 → savings',
        risk_score: 'HIGH', status: '⏳ Awaiting user approval…' },
    },
    {
      regionIds: ['agent'], colorClass: 'active-permit', label: 'User approved ✓ — execution proceeds',
      isHitl: true,
      token: { type: 'HITL Response', _type: 'permit', decision: '✅ APPROVED',
        approved_by: 'alice@bank.com', action: 'create_transfer $5,000 → savings' },
    },
    {
      regionIds: ['api-gw', 'service-a'], colorClass: 'active', label: 'Banking API executes transfer — 200 OK',
      token: { type: 'API Response', _type: 'mcp', status: '200 OK',
        transfer_id: 'TXN-2024-001', amount: '$5,000', from: 'CHK-001', to: 'SAV-002',
        scope_used: 'banking:write' },
    },
  ],

  'bad-scope': [
    {
      regionIds: ['agent'], colorClass: 'active', label: 'Agent holds read-only token — attempts write operation',
      token: { type: 'Agent Token (read-only)', _type: 'oauth', _rfcs: ['RFC 6750'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read',
        act: '{ "sub": "agent-client-id" }',
        note: '⚠️ Token scope is banking:read only — create_transfer requires banking:write' },
    },
    {
      regionIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', label: 'PingAuthorize: create_transfer with insufficient scope',
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolCall',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id', ToolName: 'create_transfer',
        TokenScopes: 'banking:read', TokenAudience: 'mcp-gateway',
        note: '❌ banking:write required — policy will DENY this request' },
    },
    {
      regionIds: ['pingauthorize'], colorClass: 'active-error', label: 'DENY — insufficient scope',
      token: { type: 'Authorization Decision', _type: 'error', decision: '❌ DENY',
        DecisionContext: 'McpToolCall', ToolName: 'create_transfer',
        reason: 'insufficient_scope: banking:write required', policy: 'mcp-tool-call-v2' },
    },
    {
      regionIds: ['mcp-gw', 'agent'], colorClass: 'active-error', label: '403 Forbidden — propagated to agent',
      token: { type: 'HTTP 403 Forbidden', _type: 'error', status: '403 Forbidden',
        error: 'insufficient_scope',
        error_description: 'banking:write scope required for create_transfer',
        'WWW-Authenticate': 'Bearer scope="banking:write"',
        note: 'MCP Gateway converts DENY to 403 — agent must NOT retry with same token' },
    },
    {
      regionIds: ['agent'], colorClass: 'active-error', label: 'Agent gracefully handles 403 — informs user',
      token: { type: 'Agent Error Response', _type: 'error', http_status: '403',
        user_message: 'Unable to complete transfer — insufficient permissions',
        recovery: 'Re-authenticate with banking:write scope to enable transfers',
        note: 'Graceful degradation: surface clear message, request scope upgrade, never silent-fail' },
    },
  ],
};

const HIGHLIGHT_MS  = 4000;
const HISTORICAL_MS = 15000;
const STEP_MS       = 2500;

function mapEventToRegions(event) {
  for (const rule of OVERVIEW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.regionIds.map((id) => ({ regionId: id, colorClass: rule.colorClass }));
  }
  return [];
}

function scanKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  return OVERVIEW_REGIONS.filter((r) => r.keywords?.some((kw) => lower.includes(kw)))
    .map((r) => ({ regionId: r.id, colorClass: 'active' }));
}

function buildLiveHistoryEntry(evt) {
  const m = evt.metadata || {};
  const ts = new Date(evt.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (evt.tag === 'token_exchange/rfc8693-success') {
    const audRaw = m.response?.aud;
    return {
      isLive: true, label: `RFC 8693 Exchange → ${(m.request?.audience || m.mcpResourceUri || 'MCP').split('/').pop()} [${ts}]`,
      isTokenExchange: true,
      token: { type: 'Token Exchange Request', _type: 'exchange', _rfcs: ['RFC 8693'],
        grant_type: 'token-exchange', audience: m.request?.audience || m.mcpResourceUri || '—',
        scope: m.request?.scope || '—', actor_token: m.request?.hasActorToken ? 'yes' : 'no' },
      tokenOut: { type: 'Issued Token', _type: 'oauth', _rfcs: ['RFC 8693'],
        aud: Array.isArray(audRaw) ? audRaw.join(', ') : (audRaw || '—'),
        scope: m.response?.scope || '—',
        act_claim: m.response?.hasActClaim ? 'yes (chain preserved)' : 'no',
        duration: `${m.durationMs || '?'}ms` },
    };
  }
  if (evt.tag === 'token_exchange/rfc8693-error') {
    return { isLive: true, label: `RFC 8693 Exchange FAILED [${ts}]`,
      token: { type: 'Token Exchange Error', _type: 'error',
        audience: m.mcpResourceUri || '—', error: m.errorMessage || 'Exchange failed', duration: `${m.durationMs || '?'}ms` } };
  }
  if (evt.tag === 'authorize/permit') {
    return { isLive: true, label: `PingAuthorize: PERMIT — ${m.type || 'txn'} $${m.amount || '?'} [${ts}]`,
      token: { type: 'Authorization Decision', _type: 'permit',
        decision: '✅ PERMIT', engine: m.engine || '—', TransactionType: m.type || '—', Amount: String(m.amount || '—'), path: m.path || '—' } };
  }
  if (evt.tag === 'authorize/deny') {
    return { isLive: true, label: `PingAuthorize: DENY — ${m.type || 'txn'} $${m.amount || '?'} [${ts}]`,
      token: { type: 'Authorization Decision', _type: 'error',
        decision: '❌ DENY', engine: m.engine || '—', TransactionType: m.type || '—', Amount: String(m.amount || '—'), path: m.path || '—' } };
  }
  if (evt.tag === 'authorize/bypass') {
    return { isLive: true, label: `PingAuthorize: BYPASS [${ts}]`,
      token: { type: 'Authorization Bypass', _type: 'mcp', engine: 'off',
        note: 'Authorization disabled — all requests permitted without evaluation' } };
  }
  if (evt.tag === 'mcp/tool') {
    if (m.durationMs != null) {
      return { isLive: true, label: `MCP Tool Done: ${m.tool || '?'} (${m.durationMs}ms) [${ts}]`,
        token: { type: 'MCP Tool Result', _type: 'mcp', tool: m.tool || '—', via: m.via || '—', duration: `${m.durationMs}ms`, status: 'success' } };
    }
    return { isLive: true, label: `MCP Tool Call: ${m.tool || '?'} [${ts}]`,
      token: { type: 'MCP Tool Call', _type: 'mcp', tool: m.tool || '—', via: m.via || '—', status: 'calling…' } };
  }
  if (evt.tag === 'oauth/user/callback') {
    return { isLive: true, label: `OAuth: User authenticated [${ts}]`,
      token: { type: 'OAuth Callback', _type: 'oauth', _rfcs: ['RFC 6749'],
        status: '✅ authenticated', note: 'PingOne issued ID Token + Access Token to BFF' } };
  }
  return null;
}

export default function ArchitectureOverviewPage({ user }) {
  const [activeRegions, setActiveRegions] = useState({});
  const [regionLabels,  setRegionLabels]  = useState({});
  const [isSimulating,  setIsSimulating]  = useState(false);
  const [isPaused,      setIsPaused]      = useState(false);
  const [currentStep,   setCurrentStep]   = useState(-1);
  const [stepDetail,    setStepDetail]    = useState(null);
  const [stepDetail2,   setStepDetail2]   = useState(null);
  const [stepDetailOut, setStepDetailOut] = useState(null);
  const [isTokenExch,   setIsTokenExch]   = useState(false);
  const [isHitl,        setIsHitl]        = useState(false);
  const [history,          setHistory]          = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('full-flow');
  const [totalSteps,       setTotalSteps]       = useState(OVERVIEW_SIMULATE_STEPS.length);

  const clearTimers   = useRef({});
  const simTimeouts   = useRef([]);
  const pausedStep    = useRef(-1);
  const lastFetchedAt = useRef(null);
  const pollRef       = useRef(null);
  const stepsRef      = useRef(OVERVIEW_SIMULATE_STEPS);

  const activateRegion = useCallback((regionId, colorClass = 'active', ms = HIGHLIGHT_MS) => {
    if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
    setActiveRegions((prev) => ({ ...prev, [regionId]: colorClass }));
    clearTimers.current[regionId] = setTimeout(() => {
      setActiveRegions((prev) => { const n = { ...prev }; delete n[regionId]; return n; });
      delete clearTimers.current[regionId];
    }, ms);
  }, []);

  const processEvents = useCallback((events, historical = false) => {
    const ms = historical ? HISTORICAL_MS : HIGHLIGHT_MS;
    events.forEach((evt) => {
      mapEventToRegions(evt).forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass, ms));
      if (evt.tag === 'agent_prompt/llm_complete' && evt.metadata?.response)
        scanKeywords(evt.metadata.response).forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass, ms));
      if (!historical) {
        const entry = buildLiveHistoryEntry(evt);
        if (entry) {
          setHistory((prev) => {
            const cutoff = Date.now() - 4000;
            const isDupe = prev.some((e) => e.isLive && e._tag === evt.tag && (e._ts || 0) > cutoff);
            if (isDupe) return prev;
            return [...prev, { ...entry, _tag: evt.tag, _ts: Date.now() }];
          });
        }
      }
    });
  }, [activateRegion]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      const since = lastFetchedAt.current || new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const isHistorical = !lastFetchedAt.current;
      const res = await apiClient.get(`/api/admin/app-events?limit=50&since=${since}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events, isHistorical);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_err) {
      if (!lastFetchedAt.current) lastFetchedAt.current = new Date().toISOString();
    }
  }, [user, processEvents]);

  const applyStep = useCallback((i) => {
    const steps = stepsRef.current;
    if (i < 0 || i >= steps.length) return;
    const step = steps[i];
    setCurrentStep(i);
    setStepDetail(step.token   || null);
    setStepDetail2(step.token2 || null);
    setStepDetailOut(step.tokenOut || null);
    setIsTokenExch(Boolean(step.isTokenExchange));
    setIsHitl(Boolean(step.isHitl));

    const regions = {};
    const labels  = {};
    for (let j = 0; j < i; j++) {
      steps[j].regionIds.forEach((id) => {
        regions[id] = 'active-prev';
        labels[id]  = steps[j].label;
      });
    }
    step.regionIds.forEach((id) => {
      regions[id] = step.colorClass;
      labels[id]  = step.label;
    });
    setActiveRegions(regions);
    setRegionLabels(labels);

    if (step.token || step.token2) {
      const entry = { stepNum: i + 1, label: step.label, token: step.token || null, token2: step.token2 || null, tokenOut: step.tokenOut || null, isTokenExchange: Boolean(step.isTokenExchange), isHitl: Boolean(step.isHitl) };
      setHistory((prev) => {
        if (prev.some((e) => e.stepNum === entry.stepNum)) return prev;
        return [...prev, entry].sort((a, b) => a.stepNum - b.stepNum);
      });
    }
  }, []);

  const scheduleFrom = useCallback((startIdx) => {
    const steps = stepsRef.current;
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    for (let i = startIdx; i < steps.length; i++) {
      const t = setTimeout(() => {
        applyStep(i);
        if (i === steps.length - 1) {
          const done = setTimeout(() => {
            setActiveRegions({}); setRegionLabels({});
            setIsSimulating(false); setIsPaused(false);
            setCurrentStep(-1); setStepDetail(null); setStepDetail2(null); setStepDetailOut(null);
          }, HIGHLIGHT_MS);
          simTimeouts.current.push(done);
        }
      }, (i - startIdx) * STEP_MS);
      simTimeouts.current.push(t);
    }
  }, [applyStep]);

  const clearHistory = useCallback(() => setHistory([]), []);

  const runSimulation = useCallback((scenarioKey) => {
    if (isSimulating) return;
    const key = scenarioKey || selectedScenario;
    const steps = key === 'full-flow' ? OVERVIEW_SIMULATE_STEPS : (SCENARIO_STEPS[key] || OVERVIEW_SIMULATE_STEPS);
    stepsRef.current = steps;
    setTotalSteps(steps.length);
    setHistory([]);
    setIsSimulating(true); setIsPaused(false);
    pausedStep.current = -1;
    scheduleFrom(0);
  }, [isSimulating, scheduleFrom, selectedScenario]);

  const pause = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    pausedStep.current = currentStep;
    setIsPaused(true);
  }, [currentStep]);

  const resume = useCallback(() => {
    setIsPaused(false);
    scheduleFrom(pausedStep.current + 1);
  }, [scheduleFrom]);

  const prevStep = useCallback(() => {
    const prev = pausedStep.current - 1;
    if (prev < 0) return;
    pausedStep.current = prev;
    applyStep(prev);
  }, [applyStep]);

  const nextStep = useCallback(() => {
    const next = pausedStep.current + 1;
    if (next >= stepsRef.current.length) return;
    pausedStep.current = next;
    applyStep(next);
  }, [applyStep]);

  const stop = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    setActiveRegions({}); setRegionLabels({});
    setIsSimulating(false); setIsPaused(false);
    setCurrentStep(-1); setStepDetail(null); setStepDetail2(null); setStepDetailOut(null);
    pausedStep.current = -1;
  }, []);

  useEffect(() => {
    fetchEvents();
    pollRef.current = setInterval(fetchEvents, 10000);
    return () => {
      clearInterval(pollRef.current);
      Object.values(clearTimers.current).forEach(clearTimeout);
      simTimeouts.current.forEach(clearTimeout);
      clearTimers.current = {};
    };
  }, [fetchEvents]);

  const scenarioSelector = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Scenario:</label>
      <select
        value={selectedScenario}
        onChange={(e) => setSelectedScenario(e.target.value)}
        disabled={isSimulating}
        style={{ fontSize: '0.78rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', cursor: isSimulating ? 'not-allowed' : 'pointer' }}
      >
        <option value="full-flow">Full Flow</option>
        <option value="id-token">ID Token Exchange</option>
        <option value="user-token">Token Exchange (Both Hops)</option>
        <option value="get-accounts">Get Accounts (Read Scope)</option>
        <option value="withdrawal">Withdrawal + HITL</option>
        <option value="bad-scope">Bad Scope (401 / 403)</option>
      </select>
    </div>
  );

  return (
    <ArchitectureDiagramPage
      title="Architecture Overview"
      imageSrc="/architecture/overview.png"
      imageAlt="Architecture: User → IdP → Agent → MCP Gateway → PingAuthorize → Backend Services"
      regions={OVERVIEW_REGIONS}
      activeRegions={activeRegions}
      regionLabels={regionLabels}
      user={user}
      onSimulate={runSimulation}
      isSimulating={isSimulating}
      isPaused={isPaused}
      onPause={pause}
      onResume={resume}
      onPrevStep={prevStep}
      onNextStep={nextStep}
      onStop={stop}
      currentStep={currentStep}
      totalSteps={totalSteps}
      stepDetail={stepDetail}
      stepDetail2={stepDetail2}
      stepDetailOut={stepDetailOut}
      isTokenExchange={isTokenExch}
      isHitl={isHitl}
      audHops={OVERVIEW_AUD_HOPS}
      tokenHistory={history}
      onClearHistory={clearHistory}
      toolbarExtra={scenarioSelector}
    />
  );
}
