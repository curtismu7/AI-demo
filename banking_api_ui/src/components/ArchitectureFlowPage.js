/**
 * ArchitectureFlowPage.js — /architecture/flow
 *
 * Token card overlaid INSIDE the React Flow canvas (top-right Panel) so it is
 * always visible during simulation without scrolling. Shows JWT claims on the
 * wire at each hop, RFC 8693 before/after tokens side-by-side, and HITL approval.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// ─── Color palette ────────────────────────────────────────────────────────────

const COLOR = {
  active:         { bg: 'rgba(0,70,135,0.18)',    border: '#004687', text: '#003366' },
  'active-prev':  { bg: 'rgba(100,116,139,0.10)', border: '#94a3b8', text: '#64748b' },
  'active-error': { bg: 'rgba(239,68,68,0.15)',   border: '#ef4444', text: '#b91c1c' },
  'active-permit':{ bg: 'rgba(76,175,80,0.15)',   border: '#4CAF50', text: '#166534' },
  'active-hitl':  { bg: 'rgba(234,179,8,0.18)',   border: '#ca8a04', text: '#713f12' },
  default:        { bg: '#f8fafc',                border: '#e2e8f0', text: '#334155' },
};

// ─── Architecture node ────────────────────────────────────────────────────────

function ArchNode({ data }) {
  const c = COLOR[data.colorClass] || COLOR.default;
  const pulse = data.colorClass && data.colorClass !== 'active-prev';
  return (
    <div style={{
      background: c.bg, border: `2px solid ${c.border}`, borderRadius: 10,
      padding: '10px 14px', minWidth: 110, maxWidth: 155, textAlign: 'center',
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

// ─── Nodes & edges ────────────────────────────────────────────────────────────

const INITIAL_NODES = [
  { id: 'user',         type: 'arch', position: { x: 40,  y: 170 }, data: { label: 'User',          icon: '👤', colorClass: '' } },
  { id: 'hitl',         type: 'arch', position: { x: 220, y: 300 }, data: { label: 'HITL',           label2: 'Human Approval', icon: '🧑‍⚖️', colorClass: '' } },
  { id: 'idp-oauth-as', type: 'arch', position: { x: 340, y: 30  }, data: { label: 'Your IdP',       label2: 'OAuth AS / SSO', icon: '🏛️', colorClass: '' } },
  { id: 'pingauthorize',type: 'arch', position: { x: 570, y: 30  }, data: { label: 'PingAuthorize',  label2: 'Fine-grained AZ', icon: '⚖️', colorClass: '' } },
  { id: 'agent',        type: 'arch', position: { x: 450, y: 160 }, data: { label: 'AI Agent',       label2: 'LangGraph',      icon: '🤖', colorClass: '' } },
  { id: 'llm',          type: 'arch', position: { x: 450, y: 330 }, data: { label: 'LLM',            label2: 'Claude',         icon: '🧠', colorClass: '' } },
  { id: 'mcp-gw',       type: 'arch', position: { x: 700, y: 140 }, data: { label: 'MCP Gateway',   icon: '🔀', colorClass: '' } },
  { id: 'api-gw',       type: 'arch', position: { x: 700, y: 310 }, data: { label: 'API Gateway',   icon: '🚪', colorClass: '' } },
  { id: 'service-a',    type: 'arch', position: { x: 880, y: 40  }, data: { label: 'Accounts',      label2: 'Service A', icon: '🏦', colorClass: '' } },
  { id: 'service-b',    type: 'arch', position: { x: 880, y: 160 }, data: { label: 'Transactions',  label2: 'Service B', icon: '💳', colorClass: '' } },
  { id: 'service-c',    type: 'arch', position: { x: 880, y: 280 }, data: { label: 'Investments',   label2: 'Service C', icon: '📈', colorClass: '' } },
  { id: 'service-d',    type: 'arch', position: { x: 880, y: 400 }, data: { label: 'Service D',     icon: '⚙️', colorClass: '' } },
];

const B = { stroke: '#cbd5e1', strokeWidth: 1 };        // base edge style
const A = { stroke: '#004687', strokeWidth: 2.5 };       // active
const H = { stroke: '#ca8a04', strokeWidth: 2.5 };       // hitl
const P = { stroke: '#4CAF50', strokeWidth: 2.5 };       // permit

const INITIAL_EDGES = [
  { id: 'user-agent',  source: 'user',        target: 'agent',        style: B, label: 'Chat' },
  { id: 'user-idp',    source: 'user',        target: 'idp-oauth-as', style: B, label: 'Login' },
  { id: 'idp-agent',   source: 'idp-oauth-as',target: 'agent',        style: B, label: 'Token' },
  { id: 'agent-idp',   source: 'agent',       target: 'idp-oauth-as', style: B, label: 'RFC 8693' },
  { id: 'agent-llm',   source: 'agent',       target: 'llm',          style: B },
  { id: 'agent-mcp',   source: 'agent',       target: 'mcp-gw',       style: B, label: 'MCP call' },
  { id: 'mcp-authz',   source: 'mcp-gw',      target: 'pingauthorize',style: B, label: 'Introspect' },
  { id: 'mcp-svc-a',   source: 'mcp-gw',      target: 'service-a',   style: B },
  { id: 'mcp-svc-b',   source: 'mcp-gw',      target: 'service-b',   style: B },
  { id: 'mcp-api-gw',  source: 'mcp-gw',      target: 'api-gw',      style: B },
  { id: 'api-svc-c',   source: 'api-gw',      target: 'service-c',   style: B },
  { id: 'api-svc-d',   source: 'api-gw',      target: 'service-d',   style: B },
  { id: 'agent-hitl',  source: 'agent',        target: 'hitl',        style: B, label: 'Request approval' },
  { id: 'hitl-user',   source: 'hitl',         target: 'user',        style: B, label: 'Notify' },
  { id: 'hitl-agent',  source: 'hitl',         target: 'agent',       style: B, label: 'Approved ✓' },
];

// ─── Simulation steps ─────────────────────────────────────────────────────────

const SIMULATE_STEPS = [
  {
    nodeIds: ['user'], colorClass: 'active', stepLabel: 'User sends chat message',
    activeEdgeIds: [], edgeStyle: A,
    token: null,
  },
  {
    nodeIds: ['user', 'idp-oauth-as'], colorClass: 'active', stepLabel: 'OAuth 2.0 PKCE login',
    activeEdgeIds: ['user-idp'], edgeStyle: A,
    token: { type: 'Authorization Code', aud: '(your-idp)', scope: 'openid profile email', note: 'PKCE challenge ↔ code verifier' },
  },
  {
    nodeIds: ['idp-oauth-as', 'agent'], colorClass: 'active', stepLabel: 'User access token issued',
    activeEdgeIds: ['idp-agent'], edgeStyle: A,
    token: { type: 'User Access Token', aud: 'banking-app-client', scope: 'openid profile banking:read', sub: 'alice@bank.com', iss: 'https://auth.pingone.com/…/as' },
  },
  {
    nodeIds: ['agent', 'llm'], colorClass: 'active', stepLabel: 'LLM interprets user intent',
    activeEdgeIds: ['agent-llm'], edgeStyle: A,
    token: null,
  },
  {
    nodeIds: ['agent', 'idp-oauth-as'], colorClass: 'active', stepLabel: 'RFC 8693 Token Exchange',
    activeEdgeIds: ['agent-idp'], edgeStyle: A,
    isTokenExchange: true,
    token: {
      type: 'Exchange Request',
      grant_type: 'token-exchange',
      subject_aud: 'banking-app-client',
      requested_aud: 'mcp-gateway',
      scope: 'banking:read banking:transfer',
    },
    tokenOut: {
      type: 'Delegated Token  (issued)',
      aud: 'mcp-gateway',
      scope: 'banking:read banking:transfer',
      sub: 'alice@bank.com',
      act: '{"sub":"agent-client-id"}',
    },
  },
  {
    nodeIds: ['agent', 'mcp-gw'], colorClass: 'active', stepLabel: 'Agent calls MCP tool',
    activeEdgeIds: ['agent-mcp'], edgeStyle: A,
    token: { type: 'Delegated Token', aud: 'mcp-gateway', scope: 'banking:read banking:transfer', sub: 'alice@bank.com', act: '{"sub":"agent-client-id"}' },
  },
  {
    nodeIds: ['mcp-gw', 'pingauthorize'], colorClass: 'active', stepLabel: 'Token introspection + policy',
    activeEdgeIds: ['mcp-authz'], edgeStyle: A,
    token: { type: 'Introspection + ABAC', aud: 'mcp-gateway', scope: 'banking:read', sub: 'alice@bank.com', act: '{"sub":"agent-client-id"}', note: 'PingAuthorize evaluates ABAC policy…' },
  },
  {
    nodeIds: ['pingauthorize'], colorClass: 'active-permit', stepLabel: 'PERMIT — access granted',
    activeEdgeIds: [], edgeStyle: P,
    token: { type: 'Authorization Decision', decision: '✅ PERMIT', policy: 'banking-delegated-read-v2', conditions: 'amount < $10K AND act.sub = verified agent' },
  },
  {
    nodeIds: ['agent', 'hitl'], colorClass: 'active-hitl', stepLabel: 'HITL — high-value action detected',
    activeEdgeIds: ['agent-hitl'], edgeStyle: H,
    isHitl: true,
    token: { type: 'HITL Approval Request', action: 'Transfer $5,000 → External Account', risk_score: 'HIGH', status: '⏳ Awaiting user approval…' },
  },
  {
    nodeIds: ['hitl', 'user'], colorClass: 'active-hitl', stepLabel: 'HITL — notifying user',
    activeEdgeIds: ['hitl-user'], edgeStyle: H,
    isHitl: true,
    token: { type: 'HITL Notification', channel: 'Push / Chatbot UI', message: '"Agent wants to transfer $5,000. Approve?"', expires_in: '120s' },
  },
  {
    nodeIds: ['hitl', 'agent'], colorClass: 'active-permit', stepLabel: 'User approved ✓ — agent continues',
    activeEdgeIds: ['hitl-agent'], edgeStyle: P,
    isHitl: true,
    token: { type: 'HITL Approval Response', decision: '✅ APPROVED', approved_by: 'alice@bank.com', action: 'Transfer $5,000 → External Account' },
  },
  {
    nodeIds: ['mcp-gw', 'service-a'], colorClass: 'active', stepLabel: 'API call — aud narrowed to banking-api',
    activeEdgeIds: ['mcp-svc-a'], edgeStyle: A,
    token: { type: 'Resource Token', aud: 'banking-api', scope: 'banking:read', sub: 'alice@bank.com', note: 'aud narrowed: mcp-gateway → banking-api' },
  },
  {
    nodeIds: ['service-b', 'service-c'], colorClass: 'active', stepLabel: 'Backend services respond',
    activeEdgeIds: [], edgeStyle: A,
    token: null,
  },
];

// ─── Aud trail ────────────────────────────────────────────────────────────────

const AUD_HOPS = [
  { icon: '🔐', label: 'Auth Code',       aud: '(your-idp)',        activeFrom: 1, activeTo: 1 },
  { icon: '👤', label: 'User Token',      aud: 'banking-app-client',activeFrom: 2, activeTo: 3 },
  { icon: '🔄', label: 'RFC 8693',        aud: '↕ exchange',        activeFrom: 4, activeTo: 4, isExchange: true },
  { icon: '🤖', label: 'Delegated Token', aud: 'mcp-gateway',       act: 'agent-client-id', activeFrom: 5, activeTo: 10 },
  { icon: '🏦', label: 'Resource Token',  aud: 'banking-api',       activeFrom: 11, activeTo: 12 },
];

function AudTrail({ stepIndex }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '6px 10px', marginBottom: 6,
    }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', marginRight: 4 }}>aud trail:</span>
      {AUD_HOPS.map((hop, i) => {
        const on   = stepIndex >= hop.activeFrom && stepIndex <= hop.activeTo;
        const past = stepIndex > hop.activeTo;
        return (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: past ? '#004687' : '#cbd5e1', fontSize: '0.8rem', fontWeight: 700 }}>→</span>}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: on ? '#004687' : past ? '#dbeafe' : '#fff',
              border: `1px solid ${on ? '#004687' : past ? '#93c5fd' : '#e2e8f0'}`,
              borderRadius: 6, padding: '3px 8px', transition: 'all 0.3s', minWidth: 88,
            }}>
              <span style={{ fontSize: '0.72rem' }}>{hop.icon}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: on ? '#fff' : past ? '#1d4ed8' : '#94a3b8', lineHeight: 1.2 }}>
                {hop.label}
              </span>
              <span style={{ fontSize: '0.57rem', fontFamily: 'monospace', color: on ? '#bfdbfe' : past ? '#3b82f6' : '#cbd5e1', lineHeight: 1.2 }}>
                {hop.isExchange ? hop.aud : `aud: ${hop.aud}`}
              </span>
              {hop.act && <span style={{ fontSize: '0.54rem', fontFamily: 'monospace', color: on ? '#a5f3fc' : '#94a3b8' }}>act: {hop.act}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Token card — renders INSIDE the React Flow canvas via <Panel> ────────────

function TokenClaimRow({ k, v, highlight, accent }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', minWidth: 52, flexShrink: 0, lineHeight: 1.3 }}>{k}</span>
      <span style={{
        fontSize: '0.64rem', fontFamily: 'monospace', lineHeight: 1.3, wordBreak: 'break-all',
        color: highlight ? '#93c5fd' : accent ? '#86efac' : 'rgba(255,255,255,0.88)',
        fontWeight: highlight || accent ? 700 : 400,
      }}>
        {v}
      </span>
    </div>
  );
}

function TokenPanel({ token, tokenOut, isTokenExchange, isHitl }) {
  if (!token) return null;

  const bg = isHitl
    ? 'linear-gradient(140deg,#78350f,#92400e)'
    : isTokenExchange
    ? 'linear-gradient(140deg,#4c1d95,#6d28d9)'
    : token.decision?.includes('PERMIT') || token.decision?.includes('APPROVED')
    ? 'linear-gradient(140deg,#14532d,#15803d)'
    : 'linear-gradient(140deg,#1e3a5f,#1d4ed8)';

  const tag = isHitl ? '🧑‍⚖️ HITL' : isTokenExchange ? '🔄 RFC 8693 Token Exchange' : '🎫 Token on Wire';

  const renderClaims = (t) => (
    <>
      {t.type      && <TokenClaimRow k="type"       v={t.type}       />}
      {t.aud       && <TokenClaimRow k="aud"        v={t.aud}        highlight />}
      {t.subject_aud  && <TokenClaimRow k="subject_aud" v={t.subject_aud} highlight />}
      {t.requested_aud && <TokenClaimRow k="→ requested_aud" v={t.requested_aud} highlight />}
      {t.grant_type && <TokenClaimRow k="grant_type" v={t.grant_type} />}
      {t.scope     && <TokenClaimRow k="scope"      v={t.scope}      />}
      {t.sub       && <TokenClaimRow k="sub"        v={t.sub}        />}
      {t.act       && <TokenClaimRow k="act"        v={t.act}        accent />}
      {t.iss       && <TokenClaimRow k="iss"        v={t.iss}        />}
      {t.decision  && <TokenClaimRow k="decision"   v={t.decision}   highlight />}
      {t.policy    && <TokenClaimRow k="policy"     v={t.policy}     />}
      {t.conditions && <TokenClaimRow k="conditions" v={t.conditions} />}
      {t.action    && <TokenClaimRow k="action"     v={t.action}     />}
      {t.risk_score && <TokenClaimRow k="risk_score" v={t.risk_score} highlight />}
      {t.status    && <TokenClaimRow k="status"     v={t.status}     />}
      {t.approved_by && <TokenClaimRow k="approved_by" v={t.approved_by} />}
      {t.channel   && <TokenClaimRow k="channel"    v={t.channel}    />}
      {t.message   && <TokenClaimRow k="message"    v={t.message}    />}
      {t.expires_in && <TokenClaimRow k="expires_in" v={t.expires_in} />}
      {t.note && (
        <div style={{ marginTop: 4, fontSize: '0.57rem', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', lineHeight: 1.3 }}>
          ℹ {t.note}
        </div>
      )}
    </>
  );

  return (
    <div style={{
      background: bg, color: '#fff', borderRadius: 12, padding: '10px 14px',
      fontFamily: 'monospace', minWidth: 210, maxWidth: 260,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)',
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
        {tag}
      </div>

      {tokenOut ? (
        // RFC 8693: two columns — request | issued token
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Request</div>
            {renderClaims(token)}
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.56rem', color: '#a5f3fc', marginBottom: 4, textTransform: 'uppercase' }}>↓ Issued</div>
            {renderClaims(tokenOut)}
          </div>
        </div>
      ) : (
        renderClaims(token)
      )}
    </div>
  );
}

// ─── Event → node mapping ─────────────────────────────────────────────────────

const FLOW_EVENT_MAP = [
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], nodeIds: ['agent'],            colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'],                              nodeIds: ['agent', 'llm'],     colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], nodeIds: ['idp-oauth-as', 'mcp-gw'],  colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'],   nodeIds: ['idp-oauth-as', 'mcp-gw'],  colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/permit'], nodeIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'],   nodeIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/bypass'], nodeIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'oauth', tags: [], nodeIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp',   tags: [], nodeIds: ['mcp-gw'],               colorClass: 'active' },
  { category: 'agent', tags: ['agent/message'], nodeIds: ['agent'], colorClass: 'active' },
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
const STEP_MS       = 2200;

export default function ArchitectureFlowPage({ user }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [isSimulating, setIsSimulating]  = useState(false);
  const [currentStep,  setCurrentStep]   = useState(-1);
  const clearTimers   = useRef({});
  const simTimeouts   = useRef([]);
  const lastFetchedAt = useRef(null);
  const pollRef       = useRef(null);

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
    events.forEach((evt) => mapEventToNodes(evt).forEach(({ id, colorClass }) => activateNode(id, colorClass, ms)));
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

  const resetDiagram = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, colorClass: '', stepLabel: '' } })));
    setEdges(INITIAL_EDGES);
    setCurrentStep(-1);
  }, [setNodes, setEdges]);

  const stopSim = useCallback(() => {
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];
    resetDiagram();
    setIsSimulating(false);
  }, [resetDiagram]);

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    SIMULATE_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setCurrentStep(i);

        // Build node state: previous steps grey, current step active
        setNodes((prev) => {
          const map = {};
          for (let j = 0; j < i; j++) {
            SIMULATE_STEPS[j].nodeIds.forEach((id) => {
              map[id] = { colorClass: 'active-prev', stepLabel: SIMULATE_STEPS[j].stepLabel };
            });
          }
          step.nodeIds.forEach((id) => {
            map[id] = { colorClass: step.colorClass, stepLabel: step.stepLabel };
          });
          return prev.map((n) => map[n.id] ? { ...n, data: { ...n.data, ...map[n.id] } } : n);
        });

        // Animate active edges
        setEdges((prev) =>
          prev.map((e) => {
            const active = step.activeEdgeIds.includes(e.id);
            const orig   = INITIAL_EDGES.find((ie) => ie.id === e.id);
            return {
              ...e,
              animated: active,
              style: active ? step.edgeStyle : B,
              label: active && step.token ? step.token.type : orig?.label,
            };
          })
        );

        if (i === SIMULATE_STEPS.length - 1) {
          const done = setTimeout(() => { resetDiagram(); setIsSimulating(false); }, HIGHLIGHT_MS);
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
    <div style={{ padding: '0 0.5rem' }}>
      <style>{`
        @keyframes arch-node-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(0,70,135,0.35); }
          50%  { box-shadow: 0 0 18px 6px rgba(0,70,135,0.12); }
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
          onClick={runSimulation} disabled={isSimulating}
        >
          {isSimulating ? `▶ Step ${currentStep + 1} / ${SIMULATE_STEPS.length}` : '▶ Simulate Flow'}
        </button>
        {isSimulating && (
          <button onClick={stopSim} style={{
            padding: '0.4rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: 6,
            background: '#fff', fontSize: '0.82rem', cursor: 'pointer', color: '#64748b',
          }}>✕ Stop</button>
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

      {/* React Flow — token card overlaid inside via <Panel> */}
      <div style={{ height: '68vh', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#f8fafc' }}>
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
          {/* Token card — always visible inside the canvas */}
          {activeStep?.token && (
            <Panel position="top-right" style={{ padding: 0, margin: 10 }}>
              <TokenPanel
                token={activeStep.token}
                tokenOut={activeStep.tokenOut}
                isTokenExchange={activeStep.isTokenExchange}
                isHitl={activeStep.isHitl}
              />
            </Panel>
          )}
          {!isSimulating && (
            <Panel position="top-right" style={{ margin: 10 }}>
              <div style={{
                background: 'rgba(255,255,255,0.9)', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '8px 12px', fontSize: '0.72rem', color: '#64748b', maxWidth: 200, textAlign: 'center',
              }}>
                🎫 Token details appear here during simulation
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      <p style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#94a3b8' }}>
        Hit <strong>Simulate Flow</strong> to watch the token travel through the architecture — aud changes, RFC 8693 exchange (before + after), and HITL approval all shown on the diagram.
      </p>
    </div>
  );
}
