// banking_api_ui/src/components/education/InteractiveArchDiagram.js
import React, { useState } from 'react';
import { useTokenChainOptional } from '../../context/TokenChainContext';
import RfcLink from '../shared/RfcLink';
import './InteractiveArchDiagram.css';

const NODES = {
  user:      { icon: '🧑', label: 'User / Browser', sub: 'End user', type: 'user' },
  bff:       { icon: '🖥️', label: 'OLB Application', sub: 'BFF (Express :3001)', type: 'bff' },
  idp:       { icon: '🔐', label: 'PingOne / PF', sub: 'Authorization Server', type: 'idp' },
  agent:     { icon: '🤖', label: 'agent1', sub: 'LangChain / AI Agent', type: 'agent' },
  llm:       { icon: '🧠', label: 'LLM', sub: 'OpenAI / Bedrock', type: 'llm' },
  mcpgw:     { icon: '🔀', label: 'MCP Gateway', sub: 'mcp-gw.bxf.com :3005', type: 'mcp' },
  mcpolb:    { icon: '🏦', label: 'MCP OLB', sub: 'mcp-olb.bxf.com :8080', type: 'mcp' },
  mcpinvest: { icon: '📈', label: 'MCP Invest', sub: 'mcp-invest.bxf.com :8081', type: 'mcp' },
  olbapi:    { icon: '📡', label: 'Banking API', sub: 'OAuth RS / OLB', type: 'api' },
  investapi: { icon: '📡', label: 'Invest API', sub: 'OAuth RS / Invest', type: 'api' },
};

const ARROWS = [
  {
    id: 'login', label: 'PKCE Login',
    claims: { note: 'PKCE code_challenge (RFC 7636)' }, rfc: 'RFC_7636',
  },
  {
    id: 'agent_trigger', label: 'Agent request',
    claims: { note: 'User token forwarded' }, rfc: 'RFC_8693',
  },
  {
    id: 'tools_list', label: 'tools/list (MCP)',
    claims: { Authorization: 'Bearer gw_token', protocol: 'JSON-RPC 2.0' }, rfc: 'MCP_SPEC',
  },
  {
    id: 'tools_call', label: 'tools/call → API',
    claims: { Authorization: 'Bearer backend_token', scope: 'banking' }, rfc: 'MCP_SPEC',
  },
];

function Node({ nodeKey, isActive, onClick }) {
  const n = NODES[nodeKey];
  if (!n) return null;
  return (
    <div
      className={`iad-node iad-node--${n.type}`}
      onClick={() => onClick(nodeKey)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(nodeKey)}
      title={`${n.label} — ${n.sub}`}
      style={isActive ? { boxShadow: '0 0 0 3px #2563eb44', borderColor: '#2563eb' } : undefined}
    >
      <div className="iad-node-icon">{n.icon}</div>
      <div className="iad-node-label">{n.label}</div>
      <div className="iad-node-sublabel">{n.sub}</div>
    </div>
  );
}

function Arrow({ arrow, isActive }) {
  const claimLines = arrow.claims
    ? Object.entries(arrow.claims).map(([k, v]) => `${k}: ${v}`).join('\n')
    : null;

  return (
    <div className="iad-arrow-wrapper">
      <div className={`iad-arrow${isActive ? ' iad-arrow--active' : ''}`}>
        <div className="iad-arrow-line" />
        <div className="iad-arrow-head">→</div>
        <div className="iad-arrow-label">
          <span>{arrow.label}</span>
          {arrow.claims && Object.entries(arrow.claims).slice(0, 2).map(([k, v]) => (
            <span key={k} className="iad-arrow-claim">
              <strong>{k}:</strong> {String(v).slice(0, 28)}{String(v).length > 28 ? '…' : ''}
            </span>
          ))}
        </div>
      </div>
      {claimLines && <div className="iad-claim-popup">{claimLines}</div>}
    </div>
  );
}

export default function InteractiveArchDiagram() {
  const ctx = useTokenChainOptional();
  const events = ctx?.events || [];
  const [, setSelectedNode] = useState(null);

  const activeNodes = new Set();
  if (events.some(ev => ev.status === 'active' || ev.status === 'acquired')) {
    activeNodes.add('user');
    activeNodes.add('bff');
  }
  if (events.some(ev => ev.id?.includes('agent') || ev.id?.includes('cc'))) {
    activeNodes.add('agent');
    activeNodes.add('idp');
  }
  if (events.some(ev => ev.id?.includes('mcp') && ev.status === 'acquired')) {
    activeNodes.add('mcpgw');
    activeNodes.add('mcpolb');
  }

  const hasExchange = activeNodes.has('agent');

  return (
    <div className="iad-root">
      <div className="iad-title">2-Token Exchange Architecture</div>
      <div className="iad-subtitle">
        Hover arrows for token claim details · Live token state reflected from Token Chain ·{' '}
        <RfcLink rfc="RFC_8693" />
      </div>

      <div className="iad-canvas">
        {/* Col 1: User + IDP */}
        <div className="iad-col">
          <Node nodeKey="user" isActive={activeNodes.has('user')} onClick={setSelectedNode} />
          <Node nodeKey="idp" isActive={activeNodes.has('idp')} onClick={setSelectedNode} />
        </div>

        <Arrow arrow={ARROWS[0]} isActive={activeNodes.has('bff')} />

        {/* Col 2: BFF */}
        <div className="iad-col">
          <Node nodeKey="bff" isActive={activeNodes.has('bff')} onClick={setSelectedNode} />
        </div>

        <Arrow arrow={ARROWS[1]} isActive={activeNodes.has('agent')} />

        {/* Col 3: Agent + LLM */}
        <div className="iad-col">
          <Node nodeKey="agent" isActive={activeNodes.has('agent')} onClick={setSelectedNode} />
          <Node nodeKey="llm" isActive={false} onClick={setSelectedNode} />
        </div>

        <Arrow arrow={ARROWS[2]} isActive={activeNodes.has('mcpgw')} />

        {/* Col 4: MCP Gateway */}
        <div className="iad-col">
          <Node nodeKey="mcpgw" isActive={activeNodes.has('mcpgw')} onClick={setSelectedNode} />
        </div>

        <Arrow arrow={ARROWS[3]} isActive={activeNodes.has('mcpolb')} />

        {/* Col 5: MCP OLB + Invest */}
        <div className="iad-col">
          <Node nodeKey="mcpolb" isActive={activeNodes.has('mcpolb')} onClick={setSelectedNode} />
          <Node nodeKey="mcpinvest" isActive={false} onClick={setSelectedNode} />
        </div>

        {/* Col 6: APIs */}
        <div className="iad-col" style={{ marginLeft: 14 }}>
          <Node nodeKey="olbapi" isActive={false} onClick={setSelectedNode} />
          <Node nodeKey="investapi" isActive={false} onClick={setSelectedNode} />
        </div>
      </div>

      {hasExchange && (
        <div className="iad-exchange-banner">
          <strong>RFC 8693 Exchange Flow:</strong>{' '}
          agent1 sends user_token + agent CC token → PingOne issues GW token
          (aud: mcp-gw.bxf.com, act: agent1) → MCP Gateway re-exchanges →
          backend token (aud: mcp-olb.bxf.com). Subject preserved throughout.{' '}
          <RfcLink rfc="RFC_8693" section="§4" />
        </div>
      )}

      <div className="iad-legend">
        {[
          ['#60a5fa', 'User/Browser'],
          ['#34d399', 'BFF (OLB App)'],
          ['#f59e0b', 'Identity Provider'],
          ['#a78bfa', 'AI Agent'],
          ['#f472b6', 'LLM'],
          ['#2dd4bf', 'MCP Server'],
          ['#94a3b8', 'API / Resource Server'],
        ].map(([color, label]) => (
          <div key={label} className="iad-legend-item">
            <div className="iad-legend-dot" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="iad-rfc-row">
        <span>Standards:</span>
        <RfcLink rfc="RFC_8693" /> ·{' '}
        <RfcLink rfc="RFC_7636" /> ·{' '}
        <RfcLink rfc="MCP_SPEC" /> ·{' '}
        <RfcLink rfc="RFC_9728" />
      </div>
    </div>
  );
}
