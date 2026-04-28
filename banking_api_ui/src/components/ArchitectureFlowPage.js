/**
 * ArchitectureFlowPage.js — /architecture/flow
 *
 * Interactive React Flow diagram showing:
 *  - Live event-driven node highlighting from app events
 *  - Step-by-step "Simulate Flow" with per-step token metadata
 *  - Aud trail strip: shows aud claim changing at each hop
 *  - Token Inspector panel: full JWT claims for the current step
 *  - RFC 8693 Token Exchange visualization (before + after token)
 *  - HITL Human-In-The-Loop approval step
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import apiClient from '../services/apiClient';

// ─── Color palette ────────────────────────────────────────────────────────────

const COLOR = {
  active:        { bg: 'rgba(0,70,135,0.18)',   border: '#004687', text: '#003366' },
  'active-prev': { bg: 'rgba(100,116,139,0.10)', border: '#94a3b8', text: '#64748b' },
  'active-error':{ bg: 'rgba(239,68,68,0.15)',  border: '#ef4444', text: '#b91c1c' },
  'active-permit':{ bg:'rgba(76,175,80,0.15)',  border: '#4CAF50', text: '#166534' },
  'active-hitl': { bg: 'rgba(234,179,8,0.18)',  border: '#ca8a04', text: '#713f12' },
  default:       { bg: '#f8fafc',               border: '#e2e8f0', text: '#334155' },
};

// ─── Custom node ──────────────────────────────────────────────────────────────

function ArchNode({ data }) {
  const c = COLOR[data.colorClass] || COLOR.default;
  const pulse = data.colorClass && data.colorClass !== 'active-prev';
  return (
    <div style={{
      background: c.bg,
      border: `2px solid ${c.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 110,
      maxWidth: 155,
      textAlign: 'center',
      boxShadow: pulse ? `0 0 14px ${c.border}66` : '0 2px 6px rgba(0,0,0,0.08)',
      transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
      animation: pulse ? 'arch-node-pulse 1.2s ease-in-out infinite' : 'none',
    }}>
      <div style={{ fontSize: '1.35rem', marginBottom: 3 }}>{data.icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.76rem', color: c.text, lineHeight: 1.3, marginBottom: data.label2 ? 2 : 0 }}>
        {data.label}
      </div>
      {data.label2 && (
        <div style={{ fontSize: '0.66rem', color: c.text, opacity: 0.75, lineHeight: 1.2 }}>
          {data.label2}
        </div>
      )}
      {data.stepLabel && (
        <div style={{
          marginTop: 6, fontSize: '0.65rem', fontWeight: 600, color: c.text,
          background: `${c.border}22`, borderRadius: 4, padding: '2px 5px', lineHeight: 1.3,
        }}>
          {data.stepLabel}
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

// ─── Initial nodes ────────────────────────────────────────────────────────────

const INITIAL_NODES = [
  { id: 'user',          type: 'arch', position: { x: 40,  y: 160 }, data: { label: 'User',            icon: '👤',  colorClass: '' } },
  { id: 'hitl',          type: 'arch', position: { x: 220, y: 290 }, data: { label: 'HITL',             label2: 'Human Approval', icon: '🧑‍⚖️', colorClass: '' } },
  { id: 'idp-oauth-as',  type: 'arch', position: { x: 340, y: 30  }, data: { label: 'Your IdP',         label2: 'OAuth AS / SSO',  icon: '🏛️',  colorClass: '' } },
  { id: 'pingauthorize', type: 'arch', position: { x: 560, y: 30  }, data: { label: 'PingAuthorize',    label2: 'Fine-grained AZ', icon: '⚖️',  colorClass: '' } },
  { id: 'agent',         type: 'arch', position: { x: 440, y: 155 }, data: { label: 'AI Agent',         label2: 'LangGraph',       icon: '🤖',  colorClass: '' } },
  { id: 'llm',           type: 'arch', position: { x: 440, y: 320 }, data: { label: 'LLM',              label2: 'Claude / Anthropic',icon: '🧠', colorClass: '' } },
  { id: 'mcp-gw',        type: 'arch', position: { x: 680, y: 140 }, data: { label: 'MCP Gateway',      icon: '🔀',  colorClass: '' } },
  { id: 'api-gw',        type: 'arch', position: { x: 680, y: 310 }, data: { label: 'API Gateway',      icon: '🚪',  colorClass: '' } },
  { id: 'service-a',     type: 'arch', position: { x: 860, y: 40  }, data: { label: 'Accounts',         label2: 'Service A',       icon: '🏦',  colorClass: '' } },
  { id: 'service-b',     type: 'arch', position: { x: 860, y: 160 }, data: { label: 'Transactions',     label2: 'Service B',       icon: '💳',  colorClass: '' } },
  { id: 'service-c',     type: 'arch', position: { x: 860, y: 280 }, data: { label: 'Investments',      label2: 'Service C',       icon: '📈',  colorClass: '' } },
  { id: 'service-d',     type: 'arch', position: { x: 860, y: 400 }, data: { label: 'Service D',        icon: '⚙️',  colorClass: '' } },
];

const BASE_EDGE_STYLE  = { stroke: '#cbd5e1', strokeWidth: 1 };
const ACTIVE_EDGE_STYLE = { stroke: '#004687', strokeWidth: 2.5 };
const HITL_EDGE_STYLE   = { stroke: '#ca8a04', strokeWidth: 2.5 };
const PERMIT_EDGE_STYLE = { stroke: '#4CAF50', strokeWidth: 2.5 };

const INITIAL_EDGES = [
  { id: 'user-agent',    source: 'user',        target: 'agent',        style: BASE_EDGE_STYLE, label: 'Chat' },
  { id: 'user-idp',      source: 'user',        target: 'idp-oauth-as', style: BASE_EDGE_STYLE, label: 'Login' },
  { id: 'idp-agent',     source: 'idp-oauth-as',target: 'agent',        style: BASE_EDGE_STYLE, label: 'Token' },
  { id: 'agent-idp',     source: 'agent',       target: 'idp-oauth-as', style: BASE_EDGE_STYLE, label: 'RFC 8693' },
  { id: 'agent-llm',     source: 'agent',       target: 'llm',          style: BASE_EDGE_STYLE },
  { id: 'agent-mcp',     source: 'agent',       target: 'mcp-gw',       style: BASE_EDGE_STYLE, label: 'MCP call' },
  { id: 'mcp-authz',     source: 'mcp-gw',      target: 'pingauthorize',style: BASE_EDGE_STYLE, label: 'Introspect' },
  { id: 'mcp-svc-a',     source: 'mcp-gw',      target: 'service-a',    style: BASE_EDGE_STYLE },
  { id: 'mcp-svc-b',     source: 'mcp-gw',      target: 'service-b',    style: BASE_EDGE_STYLE },
  { id: 'mcp-api-gw',    source: 'mcp-gw',      target: 'api-gw',       style: BASE_EDGE_STYLE },
  { id: 'api-svc-c',     source: 'api-gw',      target: 'service-c',    style: BASE_EDGE_STYLE },
  { id: 'api-svc-d',     source: 'api-gw',      target: 'service-d',    style: BASE_EDGE_STYLE },
  { id: 'agent-hitl',    source: 'agent',        target: 'hitl',         style: BASE_EDGE_STYLE, label: 'Request approval' },
  { id: 'hitl-user',     source: 'hitl',         target: 'user',         style: BASE_EDGE_STYLE, label: 'Notify' },
  { id: 'hitl-agent',    source: 'hitl',         target: 'agent',        style: BASE_EDGE_STYLE, label: 'Approved ✓' },
];

// ─── Simulation steps with token metadata ─────────────────────────────────────

const SIMULATE_STEPS = [
  {
    nodeIds: ['user'],
    colorClass: 'active',
    stepLabel: 'User sends chat message',
    activeEdgeIds: [],
    token: null,
  },
  {
    nodeIds: ['user', 'idp-oauth-as'],
    colorClass: 'active',
    stepLabel: 'OAuth 2.0 PKCE login',
    activeEdgeIds: ['user-idp'],
    token: {
      type: 'Authorization Code',
      note: 'PKCE challenge ↔ code verifier exchange',
      aud: '(your-idp)',
      scope: 'openid profile email',
    },
  },
  {
    nodeIds: ['idp-oauth-as', 'agent'],
    colorClass: 'active',
    stepLabel: 'User access token issued to agent',
    activeEdgeIds: ['idp-agent'],
    token: {
      type: 'User Access Token',
      aud: 'banking-app-client',
      scope: 'openid profile banking:read',
      sub: 'alice@bank.com',
      iss: 'https://auth.pingone.com/env-id/as',
    },
  },
  {
    nodeIds: ['agent', 'llm'],
    colorClass: 'active',
    stepLabel: 'LLM interprets user intent',
    activeEdgeIds: ['agent-llm'],
    token: null,
  },
  {
    nodeIds: ['agent', 'idp-oauth-as'],
    colorClass: 'active',
    stepLabel: 'RFC 8693 Token Exchange',
    isTokenExchange: true,
    activeEdgeIds: ['agent-idp'],
    token: {
      type: 'Token Exchange Request',
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token_aud: 'banking-app-client',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: 'mcp-gateway',
      scope: 'banking:read banking:transfer',
    },
    tokenOut: {
      type: 'Delegated Token  (issued)',
      aud: 'mcp-gateway',
      scope: 'banking:read banking:transfer',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
      iss: 'https://auth.pingone.com/env-id/as',
    },
  },
  {
    nodeIds: ['agent', 'mcp-gw'],
    colorClass: 'active',
    stepLabel: 'Agent calls MCP tool — delegated token',
    activeEdgeIds: ['agent-mcp'],
    token: {
      type: 'Delegated Token',
      aud: 'mcp-gateway',
      scope: 'banking:read banking:transfer',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
    },
  },
  {
    nodeIds: ['mcp-gw', 'pingauthorize'],
    colorClass: 'active',
    stepLabel: 'Token introspection + policy check',
    activeEdgeIds: ['mcp-authz'],
    token: {
      type: 'Introspection + ABAC',
      aud: 'mcp-gateway',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      act: '{ "sub": "agent-client-id" }',
      note: 'PingAuthorize evaluates ABAC policy against token claims…',
    },
  },
  {
    nodeIds: ['pingauthorize'],
    colorClass: 'active-permit',
    stepLabel: 'PERMIT — access granted',
    activeEdgeIds: [],
    token: {
      type: 'Authorization Decision',
      decision: '✅ PERMIT',
      policy: 'banking-delegated-read-v2',
      conditions: 'amount < $10,000 AND act.sub = verified agent',
    },
  },
  {
    nodeIds: ['agent', 'hitl'],
    colorClass: 'active-hitl',
    stepLabel: 'HITL — high-value action detected',
    isHitl: true,
    activeEdgeIds: ['agent-hitl'],
    token: {
      type: 'HITL Approval Request',
      action: 'Transfer $5,000 → External Account',
      risk_score: 'HIGH',
      reason: 'High-value transfer requires explicit consent',
      status: '⏳ Awaiting user approval…',
    },
  },
  {
    nodeIds: ['hitl', 'user'],
    colorClass: 'active-hitl',
    stepLabel: 'HITL — notifying user for approval',
    isHitl: true,
    activeEdgeIds: ['hitl-user'],
    token: {
      type: 'HITL Notification',
      channel: 'Push / Chatbot UI',
      message: '"Agent wants to transfer $5,000. Approve?"',
      expires_in: '120s',
    },
  },
  {
    nodeIds: ['hitl', 'agent'],
    colorClass: 'active-permit',
    stepLabel: 'User approved ✓ — agent continues',
    isHitl: true,
    activeEdgeIds: ['hitl-agent'],
    token: {
      type: 'HITL Approval Response',
      decision: '✅ APPROVED',
      approved_by: 'alice@bank.com',
      action: 'Transfer $5,000 → External Account',
    },
  },
  {
    nodeIds: ['mcp-gw', 'service-a'],
    colorClass: 'active',
    stepLabel: 'API call — aud narrowed to banking-api',
    activeEdgeIds: ['mcp-svc-a'],
    token: {
      type: 'Resource Token',
      aud: 'banking-api',
      scope: 'banking:read',
      sub: 'alice@bank.com',
      note: 'aud narrowed: mcp-gateway → banking-api',
    },
  },
  {
    nodeIds: ['service-b', 'service-c'],
    colorClass: 'active',
    stepLabel: 'Backend services respond',
    activeEdgeIds: [],
    token: null,
  },
];

// ─── Aud trail configuration ──────────────────────────────────────────────────

const AUD_HOPS = [
  {
    icon: '🔐',
    label: 'Auth Code',
    aud: '(your-idp)',
    activeFromStep: 1,
    activeToStep: 1,
  },
  {
    icon: '👤',
    label: 'User Token',
    aud: 'banking-app-client',
    scope: 'openid profile banking:read',
    activeFromStep: 2,
    activeToStep: 3,
  },
  {
    icon: '🔄',
    label: 'RFC 8693',
    isExchange: true,
    aud: '↕ exchange',
    activeFromStep: 4,
    activeToStep: 4,
  },
  {
    icon: '🤖',
    label: 'Delegated Token',
    aud: 'mcp-gateway',
    scope: 'banking:read',
    act: 'agent-client-id',
    activeFromStep: 5,
    activeToStep: 10,
  },
  {
    icon: '🏦',
    label: 'Resource Token',
    aud: 'banking-api',
    scope: 'banking:read',
    activeFromStep: 11,
    activeToStep: 12,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AudTrail({ stepIndex }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '8px 12px', marginBottom: 8, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginRight: 4, whiteSpace: 'nowrap' }}>
        aud trail:
      </span>
      {AUD_HOPS.map((hop, i) => {
        const isActive = stepIndex >= hop.activeFromStep && stepIndex <= hop.activeToStep;
        const isPast = stepIndex > hop.activeToStep;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <span style={{ color: isPast ? '#004687' : '#cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}>→</span>
            )}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: isActive ? '#004687' : isPast ? '#e0e7f0' : '#f8fafc',
              border: `1px solid ${isActive ? '#004687' : isPast ? '#94a3b8' : '#e2e8f0'}`,
              borderRadius: 6,
              padding: '4px 8px',
              transition: 'all 0.3s',
              minWidth: 90,
            }}>
              <span style={{ fontSize: '0.75rem' }}>{hop.icon}</span>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: isActive ? '#fff' : isPast ? '#475569' : '#94a3b8', lineHeight: 1.2 }}>
                {hop.label}
              </span>
              <span style={{
                fontSize: '0.58rem', fontFamily: 'monospace',
                color: isActive ? '#bfdbfe' : isPast ? '#64748b' : '#cbd5e1',
                lineHeight: 1.2,
              }}>
                {hop.isExchange ? hop.aud : `aud: ${hop.aud}`}
              </span>
              {hop.act && (
                <span style={{ fontSize: '0.56rem', fontFamily: 'monospace', color: isActive ? '#a5f3fc' : '#94a3b8' }}>
                  act: {hop.act}
                </span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ClaimRow({ label, value, highlight }) {
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '3px 0',
      borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start',
    }}>
      <span style={{
        fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700,
        color: '#64748b', minWidth: 110, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'monospace', fontSize: '0.7rem',
        color: highlight ? '#004687' : '#1e293b',
        fontWeight: highlight ? 700 : 400,
        wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  );
}

function TokenInspector({ step }) {
  if (!step?.token) return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '10px 14px', marginTop: 8,
      fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center',
    }}>
      Token details will appear here during simulation
    </div>
  );

  const { token, tokenOut, isTokenExchange, isHitl } = step;
  const borderColor = isHitl ? '#ca8a04' : isTokenExchange ? '#7c3aed' : '#004687';
  const headerBg   = isHitl ? '#fef9c3' : isTokenExchange ? '#ede9fe' : '#eff6ff';

  return (
    <div style={{
      background: '#fff', border: `1px solid ${borderColor}44`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 8, marginTop: 8, overflow: 'hidden',
    }}>
      <div style={{
        background: headerBg, padding: '6px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${borderColor}22`,
      }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: borderColor }}>
          {isHitl ? '🧑‍⚖️ ' : isTokenExchange ? '🔄 ' : '🎫 '}
          {token.type}
        </span>
        {isTokenExchange && (
          <span style={{
            fontSize: '0.62rem', background: '#7c3aed', color: '#fff',
            borderRadius: 4, padding: '1px 6px', fontWeight: 600,
          }}>
            RFC 8693
          </span>
        )}
      </div>

      <div style={{ padding: '8px 12px', display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {token.decision && <ClaimRow label="decision" value={token.decision} highlight />}
          {token.aud && <ClaimRow label="aud" value={token.aud} highlight />}
          {token.subject_token_aud && <ClaimRow label="subject aud" value={token.subject_token_aud} highlight />}
          {token.audience && <ClaimRow label="requested aud" value={token.audience} highlight />}
          {token.scope && <ClaimRow label="scope" value={token.scope} />}
          {token.sub && <ClaimRow label="sub" value={token.sub} />}
          {token.act && <ClaimRow label="act" value={token.act} highlight />}
          {token.iss && <ClaimRow label="iss" value={token.iss} />}
          {token.grant_type && <ClaimRow label="grant_type" value={token.grant_type} />}
          {token.subject_token_type && <ClaimRow label="subject_token_type" value={token.subject_token_type} />}
          {token.requested_token_type && <ClaimRow label="requested_token_type" value={token.requested_token_type} />}
          {token.action && <ClaimRow label="action" value={token.action} />}
          {token.risk_score && <ClaimRow label="risk_score" value={token.risk_score} highlight />}
          {token.status && <ClaimRow label="status" value={token.status} />}
          {token.approved_by && <ClaimRow label="approved_by" value={token.approved_by} />}
          {token.channel && <ClaimRow label="channel" value={token.channel} />}
          {token.message && <ClaimRow label="message" value={token.message} />}
          {token.policy && <ClaimRow label="policy" value={token.policy} />}
          {token.conditions && <ClaimRow label="conditions" value={token.conditions} />}
          {token.note && (
            <div style={{ marginTop: 4, fontSize: '0.65rem', color: '#64748b', fontStyle: 'italic' }}>
              ℹ️ {token.note}
            </div>
          )}
        </div>

        {tokenOut && (
          <>
            <div style={{ width: 1, background: '#e2e8f0', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.65rem', fontWeight: 700, color: '#7c3aed',
                marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                ↓ Issued token
              </div>
              {tokenOut.aud && <ClaimRow label="aud" value={tokenOut.aud} highlight />}
              {tokenOut.scope && <ClaimRow label="scope" value={tokenOut.scope} />}
              {tokenOut.sub && <ClaimRow label="sub" value={tokenOut.sub} />}
              {tokenOut.act && <ClaimRow label="act" value={tokenOut.act} highlight />}
              {tokenOut.iss && <ClaimRow label="iss" value={tokenOut.iss} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Event → node mapping ─────────────────────────────────────────────────────

const FLOW_EVENT_MAP = [
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], nodeIds: ['agent'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], nodeIds: ['agent', 'llm'],   colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], nodeIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'],   nodeIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/permit'], nodeIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'],   nodeIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/bypass'], nodeIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'oauth', tags: [], nodeIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp',   tags: [], nodeIds: ['mcp-gw'],               colorClass: 'active' },
  { category: 'agent', tags: ['agent/message'], nodeIds: ['agent'],  colorClass: 'active' },
];

function mapEventToNodes(event) {
  for (const rule of FLOW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.nodeIds.map((id) => ({ id, colorClass: rule.colorClass }));
  }
  return [];
}

// ─── Page component ───────────────────────────────────────────────────────────

const HIGHLIGHT_MS  = 4000;
const HISTORICAL_MS = 15000;
const STEP_MS       = 2000;

export default function ArchitectureFlowPage({ user }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [isSimulating, setIsSimulating]   = useState(false);
  const [currentStep, setCurrentStep]     = useState(-1);
  const clearTimers  = useRef({});
  const simTimeouts  = useRef([]);
  const lastFetchedAt = useRef(null);
  const pollRef       = useRef(null);

  const patchNode = useCallback((id, colorClass, stepLabel = '') => {
    setNodes((prev) =>
      prev.map((n) => n.id === id ? { ...n, data: { ...n.data, colorClass, stepLabel } } : n)
    );
  }, [setNodes]);

  const activateNode = useCallback((id, colorClass = 'active', timeoutMs = HIGHLIGHT_MS) => {
    if (clearTimers.current[id]) clearTimeout(clearTimers.current[id]);
    patchNode(id, colorClass, '');
    clearTimers.current[id] = setTimeout(() => {
      patchNode(id, '', '');
      delete clearTimers.current[id];
    }, timeoutMs);
  }, [patchNode]);

  const processEvents = useCallback((events, historical = false) => {
    const ms = historical ? HISTORICAL_MS : HIGHLIGHT_MS;
    events.forEach((evt) => {
      mapEventToNodes(evt).forEach(({ id, colorClass }) => activateNode(id, colorClass, ms));
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
    } catch {
      if (!lastFetchedAt.current) lastFetchedAt.current = new Date().toISOString();
    }
  }, [user, processEvents]);

  const resetDiagram = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, colorClass: '', stepLabel: '' } })));
    setEdges((prev) => prev.map((e) => ({ ...e, animated: false, style: BASE_EDGE_STYLE, label: INITIAL_EDGES.find(ie => ie.id === e.id)?.label })));
    setCurrentStep(-1);
  }, [setNodes, setEdges]);

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    SIMULATE_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setCurrentStep(i);

        setNodes((prev) => {
          const nodeMap = {};
          for (let j = 0; j < i; j++) {
            SIMULATE_STEPS[j].nodeIds.forEach((id) => {
              nodeMap[id] = { colorClass: 'active-prev', stepLabel: SIMULATE_STEPS[j].stepLabel };
            });
          }
          step.nodeIds.forEach((id) => {
            nodeMap[id] = { colorClass: step.colorClass, stepLabel: step.stepLabel };
          });
          return prev.map((n) =>
            nodeMap[n.id] ? { ...n, data: { ...n.data, ...nodeMap[n.id] } } : n
          );
        });

        const edgeStyle = step.isHitl
          ? (step.colorClass === 'active-permit' ? PERMIT_EDGE_STYLE : HITL_EDGE_STYLE)
          : ACTIVE_EDGE_STYLE;

        setEdges((prev) =>
          prev.map((e) => {
            const active = step.activeEdgeIds.includes(e.id);
            const origLabel = INITIAL_EDGES.find(ie => ie.id === e.id)?.label;
            return {
              ...e,
              animated: active,
              style: active ? edgeStyle : BASE_EDGE_STYLE,
              label: active && step.token?.type
                ? step.token.type
                : origLabel,
            };
          })
        );

        if (i === SIMULATE_STEPS.length - 1) {
          const done = setTimeout(() => {
            resetDiagram();
            setIsSimulating(false);
          }, HIGHLIGHT_MS);
          simTimeouts.current.push(done);
        }
      }, i * STEP_MS);
      simTimeouts.current.push(t);
    });
  }, [isSimulating, setNodes, setEdges, resetDiagram]);

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

  const activeStep = currentStep >= 0 ? SIMULATE_STEPS[currentStep] : null;

  return (
    <div className="arch-flow-page" style={{ padding: '0 0.5rem' }}>
      <style>{`
        @keyframes arch-node-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(0,70,135,0.35); }
          50%  { box-shadow: 0 0 16px 6px rgba(0,70,135,0.15); }
          100% { box-shadow: 0 0 0 0 rgba(0,70,135,0.35); }
        }
      `}</style>

      {/* Toolbar */}
      <div className="arch-diagram-toolbar" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
          Interactive Architecture Flow
        </h2>
        <button
          className={`arch-simulate-btn${isSimulating ? ' arch-simulate-btn--running' : ''}`}
          onClick={runSimulation}
          disabled={isSimulating}
        >
          {isSimulating ? `▶ Step ${currentStep + 1} / ${SIMULATE_STEPS.length}` : '▶ Simulate Flow'}
        </button>
        {isSimulating && (
          <button
            onClick={() => { simTimeouts.current.forEach(clearTimeout); resetDiagram(); setIsSimulating(false); }}
            style={{ padding: '0.4rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: '0.82rem', cursor: 'pointer', color: '#64748b' }}
          >
            ✕ Stop
          </button>
        )}
        {activeStep && (
          <span style={{
            fontSize: '0.78rem', fontWeight: 600, color: '#475569',
            background: '#f1f5f9', borderRadius: 6, padding: '4px 10px',
          }}>
            {activeStep.stepLabel}
          </span>
        )}
      </div>

      {/* Aud trail */}
      <AudTrail stepIndex={currentStep} />

      {/* Diagram + Token Inspector side by side */}
      <div style={{ display: 'flex', gap: 8, height: '62vh' }}>
        {/* React Flow diagram */}
        <div style={{ flex: '1 1 0', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#f8fafc' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            attributionPosition="bottom-right"
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(n) => { const c = COLOR[n.data?.colorClass]; return c ? c.border : '#e2e8f0'; }}
              style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}
            />
          </ReactFlow>
        </div>

        {/* Token Inspector — always visible alongside the diagram */}
        <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 6,
          }}>
            Token Inspector
          </div>
          <TokenInspector step={activeStep} />
        </div>
      </div>

      <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>
        Click <strong>Simulate Flow</strong> to walk through the full token chain — RFC 8693 delegation, aud changes, and HITL approval shown in real time.
      </p>
    </div>
  );
}
