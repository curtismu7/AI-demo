/**
 * ArchitectureFlowPage.js — /architecture/flow
 *
 * Interactive React Flow diagram of the Ping Identity Digital Assistants architecture.
 * Nodes highlight in real-time as app events arrive; "Simulate Flow" walks through
 * the same 9-step sequence as the PNG overview diagram.
 *
 * Color classes mirror ArchitectureDiagramPage:
 *   active       — brand navy pulse (current step)
 *   active-prev  — muted grey (previous steps, no pulse)
 *   active-error — red pulse
 *   active-permit— green pulse
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

// ─── Node color palette ──────────────────────────────────────────────────────

const COLOR = {
  active:       { bg: 'rgba(0,70,135,0.18)',   border: '#004687', text: '#003366' },
  'active-prev':{ bg: 'rgba(100,116,139,0.1)', border: '#94a3b8', text: '#64748b' },
  'active-error':{ bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#b91c1c' },
  'active-permit':{ bg:'rgba(76,175,80,0.15)', border: '#4CAF50', text: '#166534' },
  default:      { bg: '#f8fafc',               border: '#e2e8f0', text: '#334155' },
};

// ─── Custom node component ────────────────────────────────────────────────────

function ArchNode({ data }) {
  const c = COLOR[data.colorClass] || COLOR.default;
  const isPulse = data.colorClass && data.colorClass !== 'active-prev';
  return (
    <div
      style={{
        background: c.bg,
        border: `2px solid ${c.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 120,
        maxWidth: 160,
        textAlign: 'center',
        boxShadow: isPulse && data.colorClass !== 'default'
          ? `0 0 12px ${c.border}88`
          : '0 2px 6px rgba(0,0,0,0.08)',
        transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
        animation: isPulse && data.colorClass && data.colorClass !== 'active-prev'
          ? 'arch-node-pulse 1.2s ease-in-out infinite'
          : 'none',
      }}
    >
      <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{data.icon}</div>
      <div style={{
        fontWeight: 700,
        fontSize: '0.78rem',
        color: c.text,
        lineHeight: 1.3,
        marginBottom: data.label2 ? 2 : 0,
      }}>
        {data.label}
      </div>
      {data.label2 && (
        <div style={{ fontSize: '0.68rem', color: c.text, opacity: 0.75, lineHeight: 1.2 }}>
          {data.label2}
        </div>
      )}
      {data.stepLabel && (
        <div style={{
          marginTop: 6,
          fontSize: '0.68rem',
          fontWeight: 600,
          color: c.text,
          background: `${c.border}22`,
          borderRadius: 4,
          padding: '2px 5px',
          lineHeight: 1.3,
        }}>
          {data.stepLabel}
        </div>
      )}
      {/* Handles — hidden visually but required for edges */}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}  style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { arch: ArchNode };

// ─── Initial nodes ────────────────────────────────────────────────────────────

const INITIAL_NODES = [
  {
    id: 'user',
    type: 'arch',
    position: { x: 40, y: 200 },
    data: { label: 'User', icon: '👤', colorClass: '' },
  },
  {
    id: 'trust-boundary',
    type: 'arch',
    position: { x: 210, y: 40 },
    data: { label: 'Trust Boundary', label2: 'Perimeter', icon: '🔒', colorClass: '' },
  },
  {
    id: 'idp-oauth-as',
    type: 'arch',
    position: { x: 340, y: 40 },
    data: { label: 'PingOne AIC', label2: 'IdP / OAuth AS', icon: '🏛️', colorClass: '' },
  },
  {
    id: 'pingauthorize',
    type: 'arch',
    position: { x: 560, y: 40 },
    data: { label: 'PingAuthorize', label2: 'Fine-grained AZ', icon: '⚖️', colorClass: '' },
  },
  {
    id: 'agent',
    type: 'arch',
    position: { x: 440, y: 200 },
    data: { label: 'AI Agent', label2: 'LangGraph', icon: '🤖', colorClass: '' },
  },
  {
    id: 'mcp-gw',
    type: 'arch',
    position: { x: 680, y: 180 },
    data: { label: 'MCP Gateway', icon: '🔀', colorClass: '' },
  },
  {
    id: 'api-gw',
    type: 'arch',
    position: { x: 680, y: 320 },
    data: { label: 'API Gateway', icon: '🚪', colorClass: '' },
  },
  {
    id: 'service-a',
    type: 'arch',
    position: { x: 860, y: 60 },
    data: { label: 'Accounts', label2: 'Service A', icon: '🏦', colorClass: '' },
  },
  {
    id: 'service-b',
    type: 'arch',
    position: { x: 860, y: 180 },
    data: { label: 'Transactions', label2: 'Service B', icon: '💳', colorClass: '' },
  },
  {
    id: 'service-c',
    type: 'arch',
    position: { x: 860, y: 300 },
    data: { label: 'Investments', label2: 'Service C', icon: '📈', colorClass: '' },
  },
  {
    id: 'service-d',
    type: 'arch',
    position: { x: 860, y: 420 },
    data: { label: 'Service D', icon: '⚙️', colorClass: '' },
  },
  {
    id: 'llm',
    type: 'arch',
    position: { x: 440, y: 360 },
    data: { label: 'LLM', label2: 'Claude / Anthropic', icon: '🧠', colorClass: '' },
  },
];

const INITIAL_EDGES = [
  { id: 'user-agent',      source: 'user',       target: 'agent',       animated: false, style: { stroke: '#94a3b8' }, label: 'Chat' },
  { id: 'user-idp',        source: 'user',       target: 'idp-oauth-as',animated: false, style: { stroke: '#94a3b8' }, label: 'PKCE login' },
  { id: 'idp-agent',       source: 'idp-oauth-as',target: 'agent',      animated: false, style: { stroke: '#94a3b8' }, label: 'Token' },
  { id: 'agent-mcp',       source: 'agent',      target: 'mcp-gw',      animated: false, style: { stroke: '#94a3b8' }, label: 'Tool call' },
  { id: 'agent-llm',       source: 'agent',      target: 'llm',         animated: false, style: { stroke: '#94a3b8' }, label: 'Invoke' },
  { id: 'mcp-authz',       source: 'mcp-gw',     target: 'pingauthorize',animated: false,style: { stroke: '#94a3b8' }, label: 'Policy check' },
  { id: 'mcp-svc-a',       source: 'mcp-gw',     target: 'service-a',   animated: false, style: { stroke: '#94a3b8' } },
  { id: 'mcp-svc-b',       source: 'mcp-gw',     target: 'service-b',   animated: false, style: { stroke: '#94a3b8' } },
  { id: 'api-svc-c',       source: 'api-gw',     target: 'service-c',   animated: false, style: { stroke: '#94a3b8' } },
  { id: 'api-svc-d',       source: 'api-gw',     target: 'service-d',   animated: false, style: { stroke: '#94a3b8' } },
];

// ─── Event → node mapping ─────────────────────────────────────────────────────

const FLOW_EVENT_MAP = [
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], nodeIds: ['agent'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], nodeIds: ['agent', 'llm'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], nodeIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'], nodeIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/bypass'], nodeIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'authorize', tags: ['authorize/permit'], nodeIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'], nodeIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'oauth', tags: [], nodeIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp', tags: [], nodeIds: ['mcp-gw'], colorClass: 'active' },
  { category: 'agent', tags: ['agent/message'], nodeIds: ['agent'], colorClass: 'active' },
];

// ─── Simulation steps ─────────────────────────────────────────────────────────

const SIMULATE_STEPS = [
  { nodeIds: ['user'],                      colorClass: 'active',         stepLabel: 'User starts request' },
  { nodeIds: ['user', 'idp-oauth-as'],      colorClass: 'active',         stepLabel: 'OAuth 2.0 PKCE login' },
  { nodeIds: ['idp-oauth-as', 'agent'],     colorClass: 'active',         stepLabel: 'Token issued to agent' },
  { nodeIds: ['agent', 'llm'],              colorClass: 'active',         stepLabel: 'Agent analyzes (LLM)' },
  { nodeIds: ['agent', 'mcp-gw'],          colorClass: 'active',         stepLabel: 'Agent calls MCP tools' },
  { nodeIds: ['mcp-gw', 'pingauthorize'],  colorClass: 'active',         stepLabel: 'Policy check' },
  { nodeIds: ['pingauthorize'],            colorClass: 'active-permit',  stepLabel: 'PERMIT — access granted' },
  { nodeIds: ['mcp-gw', 'service-a'],      colorClass: 'active',         stepLabel: 'API call to backend' },
  { nodeIds: ['service-b', 'service-c'],   colorClass: 'active',         stepLabel: 'Services respond' },
];

const HIGHLIGHT_MS  = 4000;
const HISTORICAL_MS = 15000;
const STEP_MS       = 1800;

function mapEventToNodes(event) {
  for (const rule of FLOW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.nodeIds.map((id) => ({ id, colorClass: rule.colorClass }));
  }
  return [];
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ArchitectureFlowPage({ user }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [isSimulating, setIsSimulating] = useState(false);
  const clearTimers = useRef({});
  const simTimeouts = useRef([]);
  const lastFetchedAt = useRef(null);
  const pollRef = useRef(null);

  // Apply colorClass + stepLabel to a node by id
  const patchNode = useCallback((id, colorClass, stepLabel = '') => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, colorClass, stepLabel } } : n
      )
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

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    SIMULATE_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setNodes((prev) => {
          const nodeMap = {};
          // Previous steps → muted grey
          for (let j = 0; j < i; j++) {
            SIMULATE_STEPS[j].nodeIds.forEach((id) => {
              nodeMap[id] = { colorClass: 'active-prev', stepLabel: SIMULATE_STEPS[j].stepLabel };
            });
          }
          // Current step → active color
          step.nodeIds.forEach((id) => {
            nodeMap[id] = { colorClass: step.colorClass, stepLabel: step.stepLabel };
          });

          return prev.map((n) =>
            nodeMap[n.id]
              ? { ...n, data: { ...n.data, ...nodeMap[n.id] } }
              : n
          );
        });

        // Animate edges for the current step
        setEdges((prev) =>
          prev.map((e) => {
            const active = step.nodeIds.includes(e.source) && step.nodeIds.includes(e.target);
            return {
              ...e,
              animated: active,
              style: { stroke: active ? '#004687' : '#94a3b8', strokeWidth: active ? 2 : 1 },
            };
          })
        );

        if (i === SIMULATE_STEPS.length - 1) {
          const done = setTimeout(() => {
            setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, colorClass: '', stepLabel: '' } })));
            setEdges((prev) => prev.map((e) => ({ ...e, animated: false, style: { stroke: '#94a3b8', strokeWidth: 1 } })));
            setIsSimulating(false);
          }, HIGHLIGHT_MS);
          simTimeouts.current.push(done);
        }
      }, i * STEP_MS);
      simTimeouts.current.push(t);
    });
  }, [isSimulating, setNodes, setEdges]);

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

  return (
    <div className="arch-flow-page">
      <div className="arch-diagram-toolbar">
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
          Interactive Architecture Flow
        </h2>
        <button
          className={`arch-simulate-btn${isSimulating ? ' arch-simulate-btn--running' : ''}`}
          onClick={runSimulation}
          disabled={isSimulating}
        >
          {isSimulating ? '▶ Simulating…' : '▶ Simulate Flow'}
        </button>
      </div>

      <div style={{ height: '72vh', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#f8fafc' }}>
        <style>{`
          @keyframes arch-node-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(0,70,135,0.4); }
            50%  { box-shadow: 0 0 12px 4px rgba(0,70,135,0.2); }
            100% { box-shadow: 0 0 0 0 rgba(0,70,135,0.4); }
          }
        `}</style>
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
            nodeColor={(n) => {
              const c = COLOR[n.data?.colorClass];
              return c ? c.border : '#e2e8f0';
            }}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}
          />
        </ReactFlow>
      </div>

      <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#64748b' }}>
        Nodes light up as the agent processes requests. Click <strong>Simulate Flow</strong> to walk through the full sequence step by step. Drag nodes to rearrange.
      </p>
    </div>
  );
}
