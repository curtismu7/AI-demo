/**
 * ArchitectureFlowPage.js — /architecture/flow
 *
 * Interactive React Flow diagram matching the real banking demo code flow:
 *   Agent → MCP Gateway → PingAuthorize (McpToolsList + McpToolCall)
 *   → RFC 8693 (scope-narrowed) → MCP Server → Banking API
 *
 * Pause / Resume / Next-Step controls let you read each token card.
 * Token badges on nodes show aud / act / may_act with changed claims highlighted.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import HistoryModal from './HistoryModal';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import apiClient from '../services/apiClient';

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLOR = {
  active:         { bg: 'rgba(0,70,135,0.18)',    border: '#004687', text: '#003366' },
  'active-prev':  { bg: 'rgba(100,116,139,0.08)', border: '#94a3b8', text: '#64748b' },
  'active-error': { bg: 'rgba(239,68,68,0.15)',   border: '#ef4444', text: '#b91c1c' },
  'active-permit':{ bg: 'rgba(76,175,80,0.15)',   border: '#4CAF50', text: '#166534' },
  'active-hitl':  { bg: 'rgba(234,179,8,0.18)',   border: '#ca8a04', text: '#713f12' },
  default:        { bg: '#f8fafc',                border: '#e2e8f0', text: '#334155' },
};

// ─── Architecture node ────────────────────────────────────────────────────────

function ArchNode({ data }) {
  const c = COLOR[data.colorClass] || COLOR.default;
  const pulse = data.colorClass && data.colorClass !== 'active-prev';
  const b = data.badge;
  return (
    <div style={{
      background: c.bg, border: `2px solid ${c.border}`, borderRadius: 10,
      padding: '8px 12px', minWidth: 118, maxWidth: 165, textAlign: 'center',
      boxShadow: pulse ? `0 0 14px ${c.border}55` : '0 2px 6px rgba(0,0,0,0.07)',
      transition: 'background 0.3s, border-color 0.3s',
      animation: pulse ? 'arch-node-pulse 1.2s ease-in-out infinite' : 'none',
    }}>
      <div style={{ fontSize: '1.25rem', marginBottom: 2 }}>{data.icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.75rem', color: c.text, lineHeight: 1.3, marginBottom: data.label2 ? 1 : 0 }}>
        {data.label}
      </div>
      {data.label2 && (
        <div style={{ fontSize: '0.64rem', color: c.text, opacity: 0.7, lineHeight: 1.2 }}>
          {data.label2}
        </div>
      )}
      {data.stepLabel && (
        <div style={{
          marginTop: 5, fontSize: '0.62rem', fontWeight: 600, color: c.text,
          background: `${c.border}20`, borderRadius: 3, padding: '2px 4px', lineHeight: 1.3,
        }}>
          {data.stepLabel}
        </div>
      )}
      {/* Token badge — shows aud/act/may_act with changed claims highlighted */}
      {b && (
        <div style={{
          marginTop: 5, padding: '4px 5px', background: 'rgba(0,0,0,0.06)',
          borderRadius: 4, textAlign: 'left', borderLeft: `2px solid ${c.border}`,
        }}>
          {b.aud && (
            <div style={{
              fontSize: '0.58rem', fontFamily: 'monospace', lineHeight: 1.4,
              color: b._changed?.includes('aud') ? '#1d4ed8' : '#475569',
              fontWeight: b._changed?.includes('aud') ? 800 : 400,
            }}>
              aud: {b.aud}
            </div>
          )}
          {b.may_act && (
            <div style={{ fontSize: '0.56rem', fontFamily: 'monospace', lineHeight: 1.4, color: '#b45309', fontWeight: 700 }}>
              may_act: {b.may_act}
            </div>
          )}
          {b.act && (
            <div style={{
              fontSize: '0.56rem', fontFamily: 'monospace', lineHeight: 1.4,
              color: b._changed?.includes('act') ? '#15803d' : '#475569',
              fontWeight: b._changed?.includes('act') ? 800 : 400,
            }}>
              act: {b.act}
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right}  style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { arch: ArchNode };

// ─── Nodes ────────────────────────────────────────────────────────────────────

const INITIAL_NODES = [
  { id: 'user',         type: 'arch', position: { x: 30,  y: 200 }, data: { label: 'User',          icon: '👤',  colorClass: '' } },
  { id: 'hitl',         type: 'arch', position: { x: 200, y: 340 }, data: { label: 'HITL',           label2: 'Human Approval',    icon: '🧑‍⚖️', colorClass: '' } },
  { id: 'idp-oauth-as', type: 'arch', position: { x: 330, y: 30  }, data: { label: 'Your IdP',       label2: 'OAuth AS / SSO',    icon: '🏛️',  colorClass: '' } },
  { id: 'pingauthorize',type: 'arch', position: { x: 590, y: 30  }, data: { label: 'PingAuthorize',  label2: 'Fine-grained AZ',   icon: '⚖️',  colorClass: '' } },
  { id: 'agent',        type: 'arch', position: { x: 450, y: 185 }, data: { label: 'AI Agent',       label2: 'LangGraph',         icon: '🤖',  colorClass: '' } },
  { id: 'llm',          type: 'arch', position: { x: 450, y: 365 }, data: { label: 'LLM',            label2: 'Claude',            icon: '🧠',  colorClass: '' } },
  { id: 'mcp-gw',       type: 'arch', position: { x: 700, y: 100 }, data: { label: 'MCP Gateway',    label2: 'Auth + Routing',    icon: '🔀',  colorClass: '' } },
  { id: 'mcp-server',   type: 'arch', position: { x: 700, y: 280 }, data: { label: 'MCP Server',     label2: 'banking_mcp_server',icon: '🛠️',  colorClass: '' } },
  { id: 'banking-api',  type: 'arch', position: { x: 910, y: 185 }, data: { label: 'Banking API',    label2: 'banking_api_server',icon: '🏦',  colorClass: '' } },
];

const B = { stroke: '#cbd5e1', strokeWidth: 1 };
const A = { stroke: '#004687', strokeWidth: 2.5 };
const H = { stroke: '#ca8a04', strokeWidth: 2.5 };
const P = { stroke: '#4CAF50', strokeWidth: 2.5 };

const INITIAL_EDGES = [
  { id: 'user-agent',    source: 'user',        target: 'agent',        style: B, label: 'Chat' },
  { id: 'user-idp',      source: 'user',        target: 'idp-oauth-as', style: B, label: 'PKCE login' },
  { id: 'idp-agent',     source: 'idp-oauth-as',target: 'agent',        style: B, label: 'Token' },
  { id: 'agent-idp',     source: 'agent',       target: 'idp-oauth-as', style: B, label: 'RFC 8693' },
  { id: 'agent-llm',     source: 'agent',       target: 'llm',          style: B },
  { id: 'agent-mcp',     source: 'agent',       target: 'mcp-gw',       style: B, label: 'MCP call' },
  { id: 'mcp-authz',     source: 'mcp-gw',      target: 'pingauthorize',style: B, label: 'Authz check' },
  { id: 'mcp-gw-idp',   source: 'mcp-gw',      target: 'idp-oauth-as', style: B, label: 'RFC 8693' },
  { id: 'mcp-gw-server', source: 'mcp-gw',      target: 'mcp-server',   style: B, label: 'Proxy' },
  { id: 'mcp-server-api',source: 'mcp-server',  target: 'banking-api',  style: B, label: 'REST call' },
  { id: 'agent-hitl',    source: 'agent',        target: 'hitl',         style: B, label: 'Request consent' },
  { id: 'hitl-user',     source: 'hitl',         target: 'user',         style: B, label: 'Notify' },
  { id: 'hitl-agent',    source: 'hitl',         target: 'agent',        style: B, label: 'Approved ✓' },
];

// ─── Simulation steps (real code flow) ───────────────────────────────────────

const SIMULATE_STEPS = [
  {
    nodeIds: ['user'], colorClass: 'active', stepLabel: 'User sends chat message',
    activeEdgeIds: [], edgeStyle: A,
    nodeBadges: {},
    token: null,
  },
  {
    nodeIds: ['user', 'idp-oauth-as'], colorClass: 'active', stepLabel: 'OAuth 2.0 PKCE login',
    activeEdgeIds: ['user-idp'], edgeStyle: A,
    nodeBadges: {},
    token: { type: 'PKCE / Auth Code', aud: '(your-idp)', scope: 'openid profile banking:read banking:write', note: 'code_verifier + code_challenge exchange' },
  },
  {
    nodeIds: ['idp-oauth-as', 'agent'], colorClass: 'active', stepLabel: 'User access token issued (with may_act)',
    activeEdgeIds: ['idp-agent'], edgeStyle: A,
    nodeBadges: {
      agent: { aud: 'banking-app-client', may_act: '{"client_id":"bff-client-id"}', _changed: ['aud', 'may_act'] },
    },
    token: {
      type: 'User Access Token',
      aud: 'banking-app-client',
      scope: 'openid profile banking:read banking:write',
      sub: 'alice@bank.com',
      may_act: '{ "client_id": "bff-client-id" }',
      note: 'may_act pre-authorizes BFF/gateway to exchange on behalf of user (RFC 8693 §4.2)',
    },
  },
  {
    nodeIds: ['agent', 'llm'], colorClass: 'active', stepLabel: 'LLM decides to call get_my_accounts',
    activeEdgeIds: ['agent-llm'], edgeStyle: A,
    nodeBadges: {},
    token: null,
  },
  {
    nodeIds: ['agent', 'mcp-gw'], colorClass: 'active', stepLabel: 'Agent: tools/list to MCP Gateway',
    activeEdgeIds: ['agent-mcp'], edgeStyle: A,
    nodeBadges: {
      'mcp-gw': { aud: 'mcp-gateway', act: '{"sub":"agent-client-id"}', _changed: ['aud', 'act'] },
    },
    token: {
      type: 'Delegated Token  (inbound)',
      aud: 'mcp-gateway',
      scope: 'banking:read banking:write',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
      note: 'Gateway checks: aud=mcp-gateway ✓  sub≠∅ ✓  act.sub≠∅ ✓  anti-bypass ✓',
    },
  },
  {
    nodeIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', stepLabel: 'PingAuthorize: McpToolsList',
    activeEdgeIds: ['mcp-authz'], edgeStyle: A,
    nodeBadges: {},
    token: {
      type: 'PingAuthorize Request',
      DecisionContext: 'McpToolsList',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      TokenScopes: 'banking:read banking:write',
      TokenAudience: 'mcp-gateway',
    },
  },
  {
    nodeIds: ['pingauthorize'], colorClass: 'active-permit', stepLabel: 'PERMIT — agent may discover tools',
    activeEdgeIds: [], edgeStyle: P,
    nodeBadges: {},
    token: { type: 'Authorization Decision', decision: '✅ PERMIT', DecisionContext: 'McpToolsList', policy: 'mcp-tools-access-v2' },
  },
  {
    nodeIds: ['mcp-gw', 'mcp-server'], colorClass: 'active', stepLabel: 'MCP Gateway proxies tools/list',
    activeEdgeIds: ['mcp-gw-server'], edgeStyle: A,
    nodeBadges: {
      'mcp-server': { aud: 'mcp-olb-server', act: '{"sub":"agent-client-id"}', may_act: '{"client_id":"bff-client-id"}', _changed: ['aud'] },
    },
    token: {
      type: 'Exchanged Token  (gateway→server)',
      aud: 'mcp-olb-server',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
      note: 'D-04: original token never leaves gateway — RFC 8693 issues new aud-scoped token',
    },
  },
  {
    nodeIds: ['agent', 'mcp-gw'], colorClass: 'active', stepLabel: 'Agent: tools/call get_my_accounts',
    activeEdgeIds: ['agent-mcp'], edgeStyle: A,
    nodeBadges: {},
    token: {
      type: 'Delegated Token  (tools/call)',
      aud: 'mcp-gateway',
      scope: 'banking:read banking:write',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
      method: 'tools/call',
      tool_name: 'get_my_accounts',
    },
  },
  {
    nodeIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', stepLabel: 'PingAuthorize: McpToolCall',
    activeEdgeIds: ['mcp-authz'], edgeStyle: A,
    nodeBadges: {},
    token: {
      type: 'PingAuthorize Request',
      DecisionContext: 'McpToolCall',
      ClientId: 'alice@bank.com',
      ActClientId: 'agent-client-id',
      ToolName: 'get_my_accounts',
      TokenScopes: 'banking:read',
      TokenAudience: 'mcp-gateway',
    },
  },
  {
    nodeIds: ['pingauthorize'], colorClass: 'active-permit', stepLabel: 'PERMIT — tool call allowed',
    activeEdgeIds: [], edgeStyle: P,
    nodeBadges: {},
    token: { type: 'Authorization Decision', decision: '✅ PERMIT', DecisionContext: 'McpToolCall', ToolName: 'get_my_accounts', policy: 'mcp-tool-call-v2' },
  },
  {
    nodeIds: ['mcp-gw', 'idp-oauth-as'], colorClass: 'active', stepLabel: 'RFC 8693: scope-narrowed token exchange',
    isTokenExchange: true,
    activeEdgeIds: ['mcp-gw-idp'], edgeStyle: A,
    nodeBadges: {},
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
      note: 'Minimal scope — act chain preserved, MCP Server cannot use for write operations',
    },
  },
  {
    nodeIds: ['agent', 'hitl'], colorClass: 'active-hitl', stepLabel: 'HITL — INDETERMINATE → human consent',
    isHitl: true,
    activeEdgeIds: ['agent-hitl'], edgeStyle: H,
    nodeBadges: {},
    token: {
      type: 'HITL Approval Request',
      trigger: 'PingAuthorize returned INDETERMINATE',
      action: 'create_transfer $5,000',
      risk_score: 'HIGH',
      status: '⏳ Awaiting user approval…',
    },
  },
  {
    nodeIds: ['hitl', 'agent'], colorClass: 'active-permit', stepLabel: 'User approved ✓ — agent continues',
    isHitl: true,
    activeEdgeIds: ['hitl-agent'], edgeStyle: P,
    nodeBadges: {},
    token: { type: 'HITL Response', decision: '✅ APPROVED', approved_by: 'alice@bank.com', action: 'create_transfer $5,000' },
  },
  {
    nodeIds: ['mcp-server', 'banking-api'], colorClass: 'active', stepLabel: 'MCP Server calls Banking API',
    activeEdgeIds: ['mcp-server-api'], edgeStyle: A,
    nodeBadges: {
      'banking-api': { aud: 'banking-api', _changed: ['aud'] },
    },
    token: {
      type: 'Resource Token  (Banking API)',
      aud: 'banking-api',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      endpoint: 'GET /accounts',
      note: 'MCP Server validates: aud=mcp-olb-server ✓  may_act ✓  act.sub ✓',
    },
  },
  {
    nodeIds: ['banking-api', 'mcp-server', 'agent'], colorClass: 'active', stepLabel: 'Results flow back to agent',
    activeEdgeIds: [], edgeStyle: A,
    nodeBadges: {},
    token: null,
  },
];

// ─── Aud trail ────────────────────────────────────────────────────────────────

const AUD_HOPS = [
  { icon: '👤', label: 'User Token',     aud: 'banking-app-client', may_act: 'bff-client-id',       activeFrom: 2,  activeTo: 3  },
  { icon: '🔀', label: 'Gateway Token',  aud: 'mcp-gateway',        act: 'agent-client-id',          activeFrom: 4,  activeTo: 10 },
  { icon: '🔄', label: 'RFC 8693 ↕',    aud: '(exchange)',          isExchange: true,                activeFrom: 11, activeTo: 11 },
  { icon: '🛠️', label: 'Tool Token',    aud: 'mcp-olb-server',     act: 'agent-client-id',          activeFrom: 12, activeTo: 14 },
  { icon: '🏦', label: 'Resource Token', aud: 'banking-api',                                         activeFrom: 15, activeTo: 15 },
];

const SCENARIO_STEPS_FLOW = {
  'id-token': [
    {
      nodeIds: ['user', 'idp-oauth-as'], colorClass: 'active', stepLabel: 'OAuth 2.0 PKCE — code request',
      activeEdgeIds: ['user-idp'], edgeStyle: A, nodeBadges: {},
      token: { type: 'Authorization Code Request', _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 7636'],
        response_type: 'code', scope: 'openid profile banking:read banking:write', code_challenge_method: 'S256',
        note: 'PKCE: code_verifier stored client-side; code_challenge sent — prevents auth-code interception' },
    },
    {
      nodeIds: ['idp-oauth-as', 'agent'], colorClass: 'active', stepLabel: 'ID Token issued — UI only, never sent to APIs',
      activeEdgeIds: ['idp-agent'], edgeStyle: A,
      nodeBadges: { agent: { aud: 'banking-app-client', _changed: ['aud'] } },
      token: { type: 'ID Token (OIDC)', _type: 'idtoken', _rfcs: ['RFC 7519', 'OIDC Core'],
        iss: 'https://your-idp.example.com', sub: 'alice@bank.com', aud: 'banking-app-client',
        email: 'alice@bank.com', name: 'Alice Smith',
        note: 'ID token aud is ONLY the client — never sent to APIs, MCP tools, or backend services' },
    },
    {
      nodeIds: ['idp-oauth-as', 'agent'], colorClass: 'active', stepLabel: 'Access Token issued — with may_act',
      activeEdgeIds: ['idp-agent'], edgeStyle: A,
      nodeBadges: { agent: { aud: 'banking-app-client', may_act: '{"client_id":"bff-client-id"}', _changed: ['aud', 'may_act'] } },
      token: { type: 'Access Token', _type: 'oauth', _rfcs: ['RFC 6749', 'RFC 8693'],
        aud: 'banking-app-client', sub: 'alice@bank.com',
        scope: 'openid profile banking:read banking:write',
        may_act: '{ "client_id": "bff-client-id" }',
        note: 'may_act grants BFF permission to perform RFC 8693 exchange on behalf of this user' },
    },
    {
      nodeIds: ['agent'], colorClass: 'active', stepLabel: 'BFF stores token — ID token stays in browser',
      activeEdgeIds: [], edgeStyle: A, nodeBadges: {},
      token: { type: 'Token Storage', _type: 'mcp',
        id_token_location: 'Browser memory only', access_token_location: 'BFF server-side session',
        note: 'ID token: never leaves browser. Access token: BFF holds it — never exposed to frontend' },
    },
  ],
  'user-token': [
    {
      nodeIds: ['agent', 'idp-oauth-as'], colorClass: 'active', stepLabel: 'RFC 8693 Exchange #1 — user token IN',
      activeEdgeIds: ['agent-idp'], edgeStyle: A, nodeBadges: {},
      isTokenExchange: true,
      token: { type: 'User Access Token (subject)', _type: 'oauth', _rfcs: ['RFC 8693'],
        aud: 'banking-app-client', sub: 'alice@bank.com',
        scope: 'openid profile banking:read banking:write',
        may_act: '{ "client_id": "bff-client-id" }',
        note: 'BFF sends this as subject_token → IdP validates may_act before issuing delegation token' },
      tokenOut: { type: 'Delegated Token (issued)', _type: 'exchange', _rfcs: ['RFC 8693'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read banking:write',
        act: '{ "sub": "agent-client-id" }',
        note: 'aud narrowed to mcp-gateway — act chain added identifying the acting agent' },
    },
    {
      nodeIds: ['agent', 'mcp-gw'], colorClass: 'active', stepLabel: 'Delegation token arrives at MCP Gateway',
      activeEdgeIds: ['agent-mcp'], edgeStyle: A,
      nodeBadges: { 'mcp-gw': { aud: 'mcp-gateway', act: '{"sub":"agent-client-id"}', _changed: ['aud', 'act'] } },
      token: { type: 'Delegated Token (inbound)', _type: 'oauth', _rfcs: ['RFC 8693', 'RFC 6750'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read banking:write',
        act: '{ "sub": "agent-client-id" }',
        note: 'Gateway validates: aud=mcp-gateway ✓  sub≠∅ ✓  act.sub≠∅ ✓  D-05 anti-bypass ✓' },
    },
    {
      nodeIds: ['mcp-gw', 'idp-oauth-as'], colorClass: 'active', stepLabel: 'RFC 8693 Exchange #2 — scope-narrowed',
      activeEdgeIds: ['mcp-gw-idp'], edgeStyle: A, nodeBadges: {},
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
      nodeIds: ['mcp-gw', 'mcp-server'], colorClass: 'active', stepLabel: 'Tool-scoped token delivered to MCP Server',
      activeEdgeIds: ['mcp-gw-server'], edgeStyle: A,
      nodeBadges: { 'mcp-server': { aud: 'mcp-olb-server', act: '{"sub":"agent-client-id"}', _changed: ['aud'] } },
      token: { type: 'Tool-Scoped Token (delivered)', _type: 'oauth', _rfcs: ['RFC 6750'],
        aud: 'mcp-olb-server', scope: 'banking:read', sub: 'alice@bank.com',
        act: '{ "sub": "agent-client-id" }',
        note: 'MCP Server validates aud=mcp-olb-server before calling any banking APIs' },
    },
  ],
  'get-accounts': [
    {
      nodeIds: ['agent', 'llm'], colorClass: 'active', stepLabel: 'LLM decides: get_my_accounts',
      activeEdgeIds: ['agent-llm'], edgeStyle: A, nodeBadges: {},
      token: null,
    },
    {
      nodeIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', stepLabel: 'PingAuthorize: McpToolsList',
      activeEdgeIds: ['mcp-authz'], edgeStyle: A, nodeBadges: {},
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolsList',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id',
        TokenScopes: 'banking:read banking:write', TokenAudience: 'mcp-gateway' },
    },
    {
      nodeIds: ['pingauthorize'], colorClass: 'active-permit', stepLabel: 'PERMIT — tools discovery allowed',
      activeEdgeIds: [], edgeStyle: P, nodeBadges: {},
      token: { type: 'Authorization Decision', _type: 'permit', decision: '✅ PERMIT',
        DecisionContext: 'McpToolsList', policy: 'mcp-tools-access-v2' },
    },
    {
      nodeIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', stepLabel: 'PingAuthorize: McpToolCall — get_my_accounts',
      activeEdgeIds: ['mcp-authz'], edgeStyle: A, nodeBadges: {},
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolCall',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id', ToolName: 'get_my_accounts',
        TokenScopes: 'banking:read', TokenAudience: 'mcp-gateway' },
    },
    {
      nodeIds: ['pingauthorize'], colorClass: 'active-permit', stepLabel: 'PERMIT — banking:read sufficient',
      activeEdgeIds: [], edgeStyle: P, nodeBadges: {},
      token: { type: 'Authorization Decision', _type: 'permit', decision: '✅ PERMIT',
        DecisionContext: 'McpToolCall', ToolName: 'get_my_accounts', policy: 'mcp-tool-call-v2' },
    },
    {
      nodeIds: ['mcp-server', 'banking-api'], colorClass: 'active', stepLabel: 'Banking API returns accounts — 200 OK',
      activeEdgeIds: ['mcp-server-api'], edgeStyle: A,
      nodeBadges: { 'banking-api': { aud: 'banking-api', _changed: ['aud'] } },
      token: { type: 'API Response', _type: 'mcp', status: '200 OK',
        data: '[{ "accountId":"ACC-001","balance":12450.00 },...]', scope_used: 'banking:read' },
    },
  ],
  'withdrawal': [
    {
      nodeIds: ['agent', 'llm'], colorClass: 'active', stepLabel: 'LLM decides: create_transfer',
      activeEdgeIds: ['agent-llm'], edgeStyle: A, nodeBadges: {},
      token: null,
    },
    {
      nodeIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', stepLabel: 'PingAuthorize: create_transfer — high-risk',
      activeEdgeIds: ['mcp-authz'], edgeStyle: A, nodeBadges: {},
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolCall',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id', ToolName: 'create_transfer',
        TokenScopes: 'banking:write', TokenAudience: 'mcp-gateway',
        note: 'Write operation triggers high-risk policy evaluation' },
    },
    {
      nodeIds: ['pingauthorize'], colorClass: 'active-hitl', stepLabel: 'INDETERMINATE — HITL required',
      isHitl: true, activeEdgeIds: [], edgeStyle: H, nodeBadges: {},
      token: { type: 'Authorization Decision', _type: 'hitl', decision: '⚠️ INDETERMINATE',
        DecisionContext: 'McpToolCall', ToolName: 'create_transfer',
        note: 'PingAuthorize cannot auto-approve — HITL required before execution' },
    },
    {
      nodeIds: ['agent', 'hitl'], colorClass: 'active-hitl', stepLabel: 'HITL — awaiting human approval',
      isHitl: true, activeEdgeIds: ['agent-hitl'], edgeStyle: H, nodeBadges: {},
      token: { type: 'HITL Approval Request', _type: 'hitl',
        trigger: 'PingAuthorize INDETERMINATE', action: 'create_transfer $5,000 → savings',
        risk_score: 'HIGH', status: '⏳ Awaiting user approval…' },
    },
    {
      nodeIds: ['hitl', 'agent'], colorClass: 'active-permit', stepLabel: 'User approved ✓ — agent continues',
      isHitl: true, activeEdgeIds: ['hitl-agent'], edgeStyle: P, nodeBadges: {},
      token: { type: 'HITL Response', _type: 'permit', decision: '✅ APPROVED',
        approved_by: 'alice@bank.com', action: 'create_transfer $5,000 → savings' },
    },
    {
      nodeIds: ['mcp-server', 'banking-api'], colorClass: 'active', stepLabel: 'Banking API executes transfer — 200 OK',
      activeEdgeIds: ['mcp-server-api'], edgeStyle: A,
      nodeBadges: { 'banking-api': { aud: 'banking-api', _changed: ['aud'] } },
      token: { type: 'API Response', _type: 'mcp', status: '200 OK',
        transfer_id: 'TXN-2024-001', amount: '$5,000', from: 'CHK-001', to: 'SAV-002',
        scope_used: 'banking:write' },
    },
  ],
  'bad-scope': [
    {
      nodeIds: ['agent', 'mcp-gw'], colorClass: 'active', stepLabel: 'Agent attempts write with read-only token',
      activeEdgeIds: ['agent-mcp'], edgeStyle: A,
      nodeBadges: { 'mcp-gw': { aud: 'mcp-gateway', act: '{"sub":"agent-client-id"}' } },
      token: { type: 'Agent Token (read-only)', _type: 'oauth', _rfcs: ['RFC 6750'],
        aud: 'mcp-gateway', sub: 'alice@bank.com', scope: 'banking:read',
        act: '{ "sub": "agent-client-id" }',
        note: '⚠️ Token scope is banking:read only — create_transfer requires banking:write' },
    },
    {
      nodeIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', stepLabel: 'PingAuthorize: create_transfer — insufficient scope',
      activeEdgeIds: ['mcp-authz'], edgeStyle: A, nodeBadges: {},
      token: { type: 'PingAuthorize Request', _type: 'mcp', DecisionContext: 'McpToolCall',
        ClientId: 'alice@bank.com', ActClientId: 'agent-client-id', ToolName: 'create_transfer',
        TokenScopes: 'banking:read', TokenAudience: 'mcp-gateway',
        note: '❌ banking:write required — policy will DENY this request' },
    },
    {
      nodeIds: ['pingauthorize'], colorClass: 'active-error', stepLabel: 'DENY — insufficient scope',
      activeEdgeIds: [], edgeStyle: { stroke: '#ef4444', strokeWidth: 2.5 }, nodeBadges: {},
      token: { type: 'Authorization Decision', _type: 'error', decision: '❌ DENY',
        DecisionContext: 'McpToolCall', ToolName: 'create_transfer',
        reason: 'insufficient_scope: banking:write required', policy: 'mcp-tool-call-v2' },
    },
    {
      nodeIds: ['mcp-gw', 'agent'], colorClass: 'active-error', stepLabel: '403 Forbidden — propagated to agent',
      activeEdgeIds: ['agent-mcp'], edgeStyle: { stroke: '#ef4444', strokeWidth: 2.5 }, nodeBadges: {},
      token: { type: 'HTTP 403 Forbidden', _type: 'error', status: '403 Forbidden',
        error: 'insufficient_scope', error_description: 'banking:write scope required for create_transfer',
        'WWW-Authenticate': 'Bearer scope="banking:write"',
        note: 'MCP Gateway converts DENY to 403 — agent must NOT retry with same token' },
    },
    {
      nodeIds: ['agent'], colorClass: 'active-error', stepLabel: 'Agent gracefully handles 403',
      activeEdgeIds: [], edgeStyle: A, nodeBadges: {},
      token: { type: 'Agent Error Response', _type: 'error', http_status: '403',
        user_message: 'Unable to complete transfer — insufficient permissions',
        recovery: 'Re-authenticate with banking:write scope to enable transfers',
        note: 'Graceful degradation: surface clear message, request scope upgrade, never silent-fail' },
    },
  ],
};

function AudTrail({ stepIndex }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '6px 10px', marginBottom: 6,
    }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', marginRight: 4, flexShrink: 0 }}>aud trail:</span>
      {AUD_HOPS.map((hop, i) => {
        const on   = stepIndex >= hop.activeFrom && stepIndex <= hop.activeTo;
        const past = stepIndex > hop.activeTo;
        return (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: past ? '#2563eb' : '#cbd5e1', fontSize: '0.8rem', fontWeight: 700 }}>→</span>}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: on ? '#004687' : past ? '#dbeafe' : '#fff',
              border: `1px solid ${on ? '#004687' : past ? '#93c5fd' : '#e2e8f0'}`,
              borderRadius: 6, padding: '3px 8px', transition: 'all 0.3s', minWidth: 90,
            }}>
              <span style={{ fontSize: '0.7rem' }}>{hop.icon}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: on ? '#fff' : past ? '#1d4ed8' : '#94a3b8', lineHeight: 1.2 }}>
                {hop.label}
              </span>
              <span style={{ fontSize: '0.57rem', fontFamily: 'monospace', color: on ? '#bfdbfe' : past ? '#3b82f6' : '#cbd5e1', lineHeight: 1.2 }}>
                {hop.isExchange ? hop.aud : `aud: ${hop.aud}`}
              </span>
              {hop.act      && <span style={{ fontSize: '0.54rem', fontFamily: 'monospace', color: on ? '#86efac' : '#94a3b8' }}>act: {hop.act}</span>}
              {hop.may_act  && <span style={{ fontSize: '0.54rem', fontFamily: 'monospace', color: on ? '#fde68a' : '#94a3b8' }}>may_act: {hop.may_act}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Token card (light-background, readable) — Panel overlay inside React Flow ─

const URN_SHORT = {
  'urn:ietf:params:oauth:grant-type:token-exchange': 'token-exchange',
  'urn:ietf:params:oauth:token-type:access_token':   'access_token',
  'urn:ietf:params:oauth:token-type:id_token':        'id_token',
  'urn:ietf:params:oauth:token-type:refresh_token':   'refresh_token',
};
const FLOW_ACCENT = {
  oauth: '#2563eb', exchange: '#7c3aed', permit: '#16a34a',
  hitl: '#d97706', idtoken: '#0891b2', mcp: '#475569', error: '#dc2626',
};

function FlowClaimRow({ k, v }) {
  const isAud    = k === 'aud' || k === 'audience' || k === 'TokenAudience';
  const isAct    = k === 'act' || k === 'may_act' || k === 'ActClientId';
  const isDecide = k === 'decision' || k === 'DecisionContext';
  if (k === 'note' || k === '_type' || k === '_rfcs' || k === '_title') return null;
  const val = URN_SHORT[v] !== undefined ? URN_SHORT[v] : String(v);
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.73rem', color: '#64748b', minWidth: 100, flexShrink: 0, lineHeight: 1.5, fontFamily: 'monospace' }}>{k}</span>
      <span style={{
        fontSize: '0.8rem', fontFamily: 'monospace', lineHeight: 1.5, wordBreak: 'break-word',
        color: isAud ? '#1d4ed8' : isAct ? '#15803d' : isDecide ? '#15803d' : '#0f172a',
        fontWeight: (isAud || isAct || isDecide) ? 700 : 500,
      }}>
        {val}
      </span>
    </div>
  );
}

function OneFlowCard({ token, isHitl }) {
  if (!token) return null;
  const accentType = token._type || (isHitl ? 'hitl' : token.decision?.includes('PERMIT') || token.decision?.includes('APPROVED') ? 'permit' : 'oauth');
  const accent = FLOW_ACCENT[accentType] || FLOW_ACCENT.oauth;
  const rfcs   = token._rfcs || [];
  const title  = token.type || 'Token';
  const note   = token.note;
  const claimEntries = Object.entries(token).filter(([k]) =>
    k !== 'type' && k !== '_type' && k !== '_title' && k !== '_rfcs' && k !== 'note'
  );
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '12px 14px',
      minWidth: 270, maxWidth: 340,
      boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
      border: '1px solid #e2e8f0',
      borderLeft: `4px solid ${accent}`,
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 9 }}>
        <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', flex: '1 1 auto' }}>{title}</span>
        {rfcs.map((r) => (
          <span key={r} style={{
            fontSize: '0.65rem', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8',
            border: '1px solid #bfdbfe', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
          }}>{r}</span>
        ))}
      </div>
      {claimEntries.map(([k, v]) => <FlowClaimRow key={k} k={k} v={v} />)}
      {note && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #f1f5f9', fontSize: '0.73rem', color: '#64748b', fontStyle: 'italic', lineHeight: 1.4, fontFamily: 'system-ui,sans-serif' }}>
          ℹ {note}
        </div>
      )}
    </div>
  );
}

function TokenCard({ token, tokenOut, isTokenExchange, isHitl }) {
  if (!token) return null;
  if (isTokenExchange && tokenOut) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <OneFlowCard token={token} />
        <OneFlowCard token={tokenOut} />
      </div>
    );
  }
  return <OneFlowCard token={token} isHitl={isHitl} />;
}

// ─── Event → node mapping ─────────────────────────────────────────────────────

const FLOW_EVENT_MAP = [
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], nodeIds: ['agent'],            colorClass: 'active' },
  { category: 'agent_prompt',  tags: ['agent_prompt/llm_complete'],                              nodeIds: ['agent', 'llm'],     colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-success'], nodeIds: ['idp-oauth-as', 'mcp-gw'],   colorClass: 'active' },
  { category: 'token_exchange',tags: ['token_exchange/rfc8693-error'],   nodeIds: ['idp-oauth-as', 'mcp-gw'],   colorClass: 'active-error' },
  { category: 'authorize',     tags: ['authorize/permit'],  nodeIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize',     tags: ['authorize/deny'],    nodeIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'authorize',     tags: ['authorize/bypass'],  nodeIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'oauth',         tags: [],                    nodeIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp',           tags: [],                    nodeIds: ['mcp-gw'],        colorClass: 'active' },
  { category: 'agent',         tags: ['agent/message'],     nodeIds: ['agent'],         colorClass: 'active' },
];

function mapEventToNodes(event) {
  for (const rule of FLOW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.nodeIds.map((id) => ({ id, colorClass: rule.colorClass }));
  }
  return [];
}

function eventToHistoryEntry(evt) {
  const meta = evt.metadata || {};
  if (evt.category === 'token_exchange') {
    const success = evt.tag === 'token_exchange/rfc8693-success';
    return {
      label: success ? 'RFC 8693 Exchange (live)' : 'RFC 8693 Exchange Failed (live)',
      isTokenExchange: true,
      isHitl: false,
      token: {
        type: 'Token Exchange (live)',
        _type: 'exchange', _rfcs: ['RFC 8693'],
        ...(meta.subject_aud  ? { subject_aud: meta.subject_aud }   : {}),
        ...(meta.audience     ? { requested_aud: meta.audience }     : {}),
        ...(meta.scope        ? { scope: meta.scope }                : {}),
        note: success ? 'Exchange succeeded ✓' : 'Exchange failed ✗',
      },
      tokenOut: success ? {
        type: 'Issued Token (live)',
        _type: 'oauth',
        ...(meta.issued_aud || meta.audience ? { aud: meta.issued_aud || meta.audience } : {}),
        ...(meta.issued_scope || meta.scope  ? { scope: meta.issued_scope || meta.scope } : {}),
      } : null,
    };
  }
  if (evt.category === 'authorize' && (evt.tag === 'authorize/permit' || evt.tag === 'authorize/deny')) {
    const isPermit = evt.tag === 'authorize/permit';
    return {
      label: `PingAuthorize ${isPermit ? 'PERMIT' : 'DENY'} (live)`,
      isTokenExchange: false,
      isHitl: false,
      token: {
        type: 'Authorization Decision (live)',
        _type: isPermit ? 'permit' : 'error',
        decision: isPermit ? '✅ PERMIT' : '❌ DENY',
        ...(meta.DecisionContext ? { DecisionContext: meta.DecisionContext } : {}),
        ...(meta.ToolName        ? { ToolName: meta.ToolName }               : {}),
        ...(meta.ClientId        ? { ClientId: meta.ClientId }               : {}),
      },
    };
  }
  return null;
}

// ─── Page component ───────────────────────────────────────────────────────────

const HIGHLIGHT_MS  = 4000;
const HISTORICAL_MS = 15000;
const STEP_MS       = 2500;

export default function ArchitectureFlowPage({ user }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [isSimulating,     setIsSimulating]     = useState(false);
  const [isPaused,         setIsPaused]         = useState(false);
  const [currentStep,      setCurrentStep]      = useState(-1);
  const [history,          setHistory]          = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('full-flow');
  const pausedStep    = useRef(-1);
  const clearTimers   = useRef({});
  const simTimeouts   = useRef([]);
  const lastFetchedAt = useRef(null);
  const pollRef       = useRef(null);
  const stepsRef      = useRef(SIMULATE_STEPS);

  // Apply a single step to nodes + edges
  const applyStep = useCallback((i) => {
    const steps = stepsRef.current;
    const step  = steps[i];
    if (!step) return;
    setCurrentStep(i);

    setNodes((prev) => {
      const map = {};
      for (let j = 0; j < i; j++) {
        steps[j].nodeIds.forEach((id) => {
          map[id] = { colorClass: 'active-prev', stepLabel: steps[j].stepLabel, badge: prev.find(n => n.id === id)?.data?.badge };
        });
      }
      step.nodeIds.forEach((id) => {
        map[id] = { colorClass: step.colorClass, stepLabel: step.stepLabel, badge: step.nodeBadges?.[id] ?? prev.find(n => n.id === id)?.data?.badge };
      });
      Object.entries(step.nodeBadges || {}).forEach(([id, badge]) => {
        if (!map[id]) map[id] = { badge };
      });
      return prev.map((n) => map[n.id] ? { ...n, data: { ...n.data, ...map[n.id] } } : n);
    });

    setEdges((prev) =>
      prev.map((e) => {
        const active = step.activeEdgeIds.includes(e.id);
        const orig   = INITIAL_EDGES.find((ie) => ie.id === e.id);
        return { ...e, animated: active, style: active ? step.edgeStyle : B, label: active && step.token ? step.token.type : orig?.label };
      })
    );

    if (step.token) {
      const entry = { stepNum: i + 1, label: step.stepLabel, token: step.token, token2: null, tokenOut: step.tokenOut || null, isTokenExchange: Boolean(step.isTokenExchange), isHitl: Boolean(step.isHitl) };
      setHistory((prev) => {
        if (prev.some((e) => e.stepNum === entry.stepNum)) return prev;
        return [...prev, entry].sort((a, b) => a.stepNum - b.stepNum);
      });
    }
  }, [setNodes, setEdges]);

  const resetDiagram = useCallback(() => {
    setNodes(INITIAL_NODES);
    setEdges(INITIAL_EDGES);
    setCurrentStep(-1);
    setIsPaused(false);
    pausedStep.current = -1;
  }, [setNodes, setEdges]);

  // Schedule steps from startIdx onward
  const scheduleFrom = useCallback((startIdx) => {
    const steps = stepsRef.current;
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    steps.slice(startIdx).forEach((_, offset) => {
      const i = startIdx + offset;
      const t = setTimeout(() => {
        applyStep(i);
        if (i === steps.length - 1) {
          const done = setTimeout(() => { resetDiagram(); setIsSimulating(false); }, HIGHLIGHT_MS);
          simTimeouts.current.push(done);
        }
      }, (offset + (startIdx === 0 ? 0 : 1)) * STEP_MS);
      simTimeouts.current.push(t);
    });
  }, [applyStep, resetDiagram]);

  const clearHistory = useCallback(() => setHistory([]), []);

  const runSimulation = useCallback((scenarioKey) => {
    if (isSimulating) return;
    const key   = scenarioKey || selectedScenario;
    const steps = key === 'full-flow' ? SIMULATE_STEPS : (SCENARIO_STEPS_FLOW[key] || SIMULATE_STEPS);
    stepsRef.current = steps;
    setHistory([]);
    setIsSimulating(true);
    setIsPaused(false);
    scheduleFrom(0);
  }, [isSimulating, scheduleFrom, selectedScenario]);

  const pause = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    pausedStep.current = currentStep;
    setIsPaused(true);
  }, [currentStep]);

  const resume = useCallback(() => {
    if (!isPaused) return;
    setIsPaused(false);
    scheduleFrom(pausedStep.current + 1);
  }, [isPaused, scheduleFrom]);

  const prevStep = useCallback(() => {
    if (!isPaused) return;
    const prev = pausedStep.current - 1;
    if (prev < 0) return;
    applyStep(prev);
    pausedStep.current = prev;
  }, [isPaused, applyStep]);

  const nextStep = useCallback(() => {
    if (!isPaused) return;
    const next = pausedStep.current + 1;
    if (next >= stepsRef.current.length) { resetDiagram(); setIsSimulating(false); return; }
    applyStep(next);
    pausedStep.current = next;
  }, [isPaused, applyStep, resetDiagram]);

  const stopSim = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    resetDiagram();
    setIsSimulating(false);
  }, [resetDiagram]);

  // Live event polling
  const patchNode = useCallback((id, colorClass, stepLabel = '') =>
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, data: { ...n.data, colorClass, stepLabel } } : n)),
  [setNodes]);

  const activateNode = useCallback((id, colorClass = 'active', ms = HIGHLIGHT_MS) => {
    if (clearTimers.current[id]) clearTimeout(clearTimers.current[id]);
    patchNode(id, colorClass, '');
    clearTimers.current[id] = setTimeout(() => { patchNode(id, '', ''); delete clearTimers.current[id]; }, ms);
  }, [patchNode]);

  const processEvents = useCallback((events, historical = false) => {
    const ms = historical ? HISTORICAL_MS : HIGHLIGHT_MS;
    events.forEach((evt) => {
      mapEventToNodes(evt).forEach(({ id, colorClass }) => activateNode(id, colorClass, ms));
      if (!historical) {
        const entry = eventToHistoryEntry(evt);
        if (entry) {
          setHistory((prev) => {
            const stepNum = prev.length + 1;
            return [...prev, { ...entry, stepNum }];
          });
        }
      }
    });
  }, [activateNode]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      const since = lastFetchedAt.current || new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const historical = !lastFetchedAt.current;
      const res = await apiClient.get(`/api/admin/app-events?limit=50&since=${since}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events, historical);
      lastFetchedAt.current = new Date().toISOString();
    } catch { if (!lastFetchedAt.current) lastFetchedAt.current = new Date().toISOString(); }
  }, [user, processEvents]);

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

  const activeStep = currentStep >= 0 ? stepsRef.current[currentStep] : null;

  return (
    <div style={{ padding: '0 0.5rem' }}>
      <style>{`
        @keyframes arch-node-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(0,70,135,0.4); }
          50%  { box-shadow: 0 0 20px 8px rgba(0,70,135,0.1); }
          100% { box-shadow: 0 0 0 0 rgba(0,70,135,0.4); }
        }
      `}</style>

      {/* Toolbar */}
      <div className="arch-diagram-toolbar" style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
          Interactive Architecture Flow
        </h2>
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
        {!isSimulating && (
          <button className="arch-simulate-btn" onClick={runSimulation}>▶ Simulate Flow</button>
        )}
        {isSimulating && !isPaused && (
          <>
            <button className="arch-simulate-btn arch-simulate-btn--running" disabled>
              ▶ Step {currentStep + 1} / {stepsRef.current.length}
            </button>
            <button onClick={pause} style={{ padding: '0.4rem 0.8rem', border: '1px solid #94a3b8', borderRadius: 6, background: '#fff', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
              ⏸ Pause
            </button>
          </>
        )}
        {isSimulating && isPaused && (
          <>
            <button onClick={prevStep} disabled={currentStep <= 0} style={{ padding: '0.4rem 0.8rem', border: '1px solid #94a3b8', borderRadius: 6, background: '#fff', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600, color: '#475569', opacity: currentStep <= 0 ? 0.4 : 1 }}>
              ← Prev
            </button>
            <button onClick={resume} style={{ padding: '0.4rem 1rem', border: 'none', borderRadius: 6, background: '#004687', color: '#fff', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}>
              ▶ Resume
            </button>
            <button onClick={nextStep} style={{ padding: '0.4rem 0.9rem', border: '1px solid #004687', borderRadius: 6, background: '#fff', color: '#004687', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}>
              Next →
            </button>
          </>
        )}
        {isSimulating && (
          <button onClick={stopSim} style={{ padding: '0.4rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: '0.82rem', cursor: 'pointer', color: '#94a3b8' }}>
            ✕ Stop
          </button>
        )}
        {activeStep && (
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: isPaused ? '#fef9c3' : '#f1f5f9', borderRadius: 6, padding: '4px 10px', border: isPaused ? '1px solid #ca8a04' : 'none' }}>
            {isPaused ? '⏸ PAUSED — ' : ''}{activeStep.stepLabel}
          </span>
        )}
      </div>

      {/* Aud trail */}
      <AudTrail stepIndex={currentStep} />

      {/* Diagram */}
      <div style={{ height: '70vh', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#f8fafc' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          fitView fitViewOptions={{ padding: 0.14 }}
          attributionPosition="bottom-left"
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => { const c = COLOR[n.data?.colorClass]; return c ? c.border : '#e2e8f0'; }}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}
          />

          {/* Token card — top-right of canvas */}
          <Panel position="top-right" style={{ padding: 0, margin: 10 }}>
            {activeStep?.token ? (
              <TokenCard
                token={activeStep.token}
                tokenOut={activeStep.tokenOut}
                isTokenExchange={activeStep.isTokenExchange}
                isHitl={activeStep.isHitl}
              />
            ) : !isSimulating ? (
              <div style={{
                background: 'rgba(255,255,255,0.9)', border: '1px dashed #cbd5e1',
                borderRadius: 8, padding: '10px 14px', fontSize: '0.75rem', color: '#94a3b8',
                maxWidth: 200, textAlign: 'center', lineHeight: 1.5,
              }}>
                🎫 Token details appear here<br/>during simulation
              </div>
            ) : null}
          </Panel>
        </ReactFlow>
      </div>

      <p style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#94a3b8' }}>
        Hit <strong>▶ Simulate Flow</strong> then <strong>⏸ Pause</strong> at any step to read the token card.
        Node badges show <span style={{ color: '#1d4ed8', fontWeight: 600 }}>aud</span>,{' '}
        <span style={{ color: '#15803d', fontWeight: 600 }}>act</span>,{' '}
        <span style={{ color: '#b45309', fontWeight: 600 }}>may_act</span> — highlighted when they change.
      </p>

      {/* Token history — floating draggable modal */}
      <HistoryModal history={history} onClear={clearHistory} />
    </div>
  );
}

function FlowHistory({ history, onClear }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ marginTop: '1rem', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
        <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#475569', padding: '0 2px' }}>{open ? '▾' : '▸'}</button>
        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
          📋 Token History — {history.length} token{history.length !== 1 ? 's' : ''} captured
        </span>
        <button onClick={onClear} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem', color: '#64748b', padding: '2px 8px' }}>✕ Clear</button>
      </div>
      {open && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: 12, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
          {history.map((entry, idx) => (
            <div key={idx} style={{ flex: '0 0 auto', width: 300, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                <span style={{ background: '#004687', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: 20, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Step {entry.stepNum}
                </span>
                {entry.label}
              </div>
              <TokenCard
                token={entry.token}
                tokenOut={entry.tokenOut}
                isTokenExchange={entry.isTokenExchange}
                isHitl={entry.isHitl}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
