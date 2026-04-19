// banking_api_ui/src/components/education/TokenExchangeDiagram.js
/**
 * Visual inline diagram — 2-Exchange RFC 8693 Delegation Flow
 * Designed to be embedded in TokenFlowPanel (or any education tab content).
 * Uses only inline styles + React — no external deps.
 */
import React from 'react';

// ─── Primitives ───────────────────────────────────────────────────────────────

function Actor({ icon, label, sublabel, color = '#1e3a5f', border = '#3b82f6', width = 150 }) {
  return (
    <div style={{
      width,
      minWidth: width,
      background: color,
      border: `2px solid ${border}`,
      borderRadius: 8,
      padding: '10px 8px',
      textAlign: 'center',
      flexShrink: 0,
    }}>
      <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>{icon}</div>
      <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.72rem', marginTop: 4, lineHeight: 1.3 }}>{label}</div>
      {sublabel && <div style={{ color: '#94a3b8', fontSize: '0.62rem', marginTop: 3, lineHeight: 1.3 }}>{sublabel}</div>}
    </div>
  );
}

function Arrow({ label, sublabel, color = '#64748b', dir = 'right', dashed = false }) {
  const isLeft = dir === 'left';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 80 }}>
      <div style={{
        color,
        fontSize: '0.68rem',
        fontWeight: 600,
        textAlign: 'center',
        marginBottom: 2,
        lineHeight: 1.3,
        maxWidth: 160,
      }}>{label}</div>
      <div style={{
        width: '100%',
        height: 2,
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 12px)`
          : color,
        position: 'relative',
      }}>
        {/* Arrowhead */}
        <div style={{
          position: 'absolute',
          [isLeft ? 'left' : 'right']: -6,
          top: -5,
          width: 0,
          height: 0,
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          [isLeft ? 'borderRight' : 'borderLeft']: `8px solid ${color}`,
        }} />
      </div>
      {sublabel && <div style={{ color: '#475569', fontSize: '0.6rem', marginTop: 2, textAlign: 'center', maxWidth: 160 }}>{sublabel}</div>}
    </div>
  );
}

function Row({ children, mt = 8, mb = 8 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: mt, marginBottom: mb }}>
      {children}
    </div>
  );
}

function VSpacer({ label, color = '#334155', left = 75 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 28, marginLeft: left, gap: 0 }}>
      <div style={{ width: 2, background: color, marginLeft: 0 }} />
      {label && (
        <div style={{ color: '#475569', fontSize: '0.62rem', marginLeft: 6, alignSelf: 'center' }}>{label}</div>
      )}
    </div>
  );
}

function TokenBadge({ label, claims, color = '#1e293b', border = '#475569', accent = '#94a3b8' }) {
  return (
    <div style={{
      background: color,
      border: `1px solid ${border}`,
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: '0.68rem',
      lineHeight: 1.6,
    }}>
      <div style={{ color: accent, fontWeight: 700, marginBottom: 4, fontSize: '0.72rem' }}>{label}</div>
      {claims.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 6 }}>
          <span style={{ color: '#64748b', minWidth: 56, flexShrink: 0 }}>{k}:</span>
          <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children, bg = '#1e3a5f', border = '#3b82f6', color = '#93c5fd' }) {
  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 4,
      padding: '3px 10px',
      display: 'inline-block',
      fontSize: '0.65rem',
      fontWeight: 700,
      color,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      marginBottom: 6,
    }}>{children}</div>
  );
}

// ─── Main diagram ─────────────────────────────────────────────────────────────

export default function TokenExchangeDiagram() {
  // Colour palette
  const C = {
    user:    { bg: '#0f2744', border: '#3b82f6', text: '#93c5fd' },
    bff:     { bg: '#14532d', border: '#22c55e', text: '#86efac' },
    ping:    { bg: '#3b1a6e', border: '#a78bfa', text: '#c4b5fd' },
    mcp:     { bg: '#1a2e1a', border: '#4ade80', text: '#86efac' },
    tok1:    { bg: '#1c1a0d', border: '#d97706', text: '#fcd34d' },  // User AT
    tok2:    { bg: '#150d26', border: '#7c3aed', text: '#c4b5fd' },  // Intermediate
    tok3:    { bg: '#0d1a0d', border: '#16a34a', text: '#4ade80' },  // Final MCP
    cc1:     { bg: '#1a1330', border: '#6d28d9', text: '#a78bfa' },  // AI Agent CC
    cc2:     { bg: '#1a1330', border: '#6d28d9', text: '#a78bfa' },  // MCP Exchanger CC
  };

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
      <div style={{
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        background: '#0b1120',
        color: '#e2e8f0',
        borderRadius: 10,
        padding: '20px 24px',
        minWidth: 700,
        boxSizing: 'border-box',
      }}>

        {/* ── Security banner ── */}
        <div style={{
          background: '#14532d', border: '1px solid #16a34a', borderRadius: 6,
          padding: '8px 14px', marginBottom: 20, color: '#86efac',
          fontSize: '0.73rem', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span>🔒</span>
          <span>Raw tokens stay server-side. Only decoded claims reach the browser. <code style={{ fontWeight: 400, color: '#4ade80' }}>sub</code> is preserved end-to-end through every exchange.</span>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* PHASE 0: LOGIN                              */}
        {/* ═══════════════════════════════════════════ */}
        <SectionLabel bg={C.user.bg} border={C.user.border} color={C.user.text}>① Login — Authorization Code + PKCE</SectionLabel>
        <Row mt={4}>
          <Actor icon="👤" label="User Browser"                                       color={C.user.bg}  border={C.user.border} />
          <Arrow label="GET /api/auth/oauth/user/login" sublabel="→ PingOne /authorize + PKCE code_challenge" color={C.user.border} />
          <Actor icon="🏦" label="BFF" sublabel="banking_api_server"                   color={C.bff.bg}   border={C.bff.border}  />
          <Arrow label="Auth Code + POST /as/token" sublabel="PingOne issues tokens" color={C.ping.border} />
          <Actor icon="🔐" label="PingOne AS" sublabel="Authorization Server"          color={C.ping.bg}  border={C.ping.border} />
        </Row>

        <VSpacer left={166} color={C.tok1.border} />

        {/* User AT card */}
        <div style={{ marginLeft: 0, marginBottom: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <TokenBadge
            label="① User Access Token  (stored in BFF session)"
            color={C.tok1.bg} border={C.tok1.border} accent={C.tok1.text}
            claims={[
              ['sub',      '<user-id>  ← never changes'],
              ['aud',      'https://ai-agent.pingdemo.com'],
              ['scope',    'openid profile email offline_access banking:read banking:write banking:ai:agent'],
              ['may_act',  '{ "sub": "<ai-agent-client-id>" }  ← pre-approval for Exchange #1'],
            ]}
          />
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* PHASE 1: EXCHANGE #1                        */}
        {/* ═══════════════════════════════════════════ */}
        <div style={{ marginTop: 20 }}>
          <SectionLabel bg={C.cc1.bg} border={C.cc1.border} color={C.cc1.text}>② Exchange #1 — User AT → AI Agent Delegation (RFC 8693)</SectionLabel>
        </div>

        {/* CC token for step 1 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <TokenBadge
            label="AI Agent CC Token  (actor_token)"
            color={C.cc1.bg} border={C.cc1.border} accent={C.cc1.text}
            claims={[
              ['grant',  'client_credentials'],
              ['aud',    'https://agent-gateway.pingdemo.com'],
              ['client', 'PINGONE_AI_AGENT_CLIENT_ID'],
            ]}
          />
        </div>

        <Row mt={4}>
          <Actor icon="🏦" label="BFF" sublabel="subject_token = User AT&#10;actor_token = AI Agent CC Token"  color={C.bff.bg}  border={C.bff.border} width={170} />
          <Arrow label="POST /as/token  RFC 8693" sublabel="grant_type=token-exchange  audience=ai-agent.pingdemo.com" color={C.ping.border} />
          <Actor icon="🔐" label="PingOne AS" sublabel="validates may_act.sub matches actor_token.sub" color={C.ping.bg} border={C.ping.border} />
        </Row>

        <VSpacer left={86} color={C.tok2.border} />

        {/* Intermediate token */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <TokenBadge
            label="② Intermediate Agent Token  (held in BFF)"
            color={C.tok2.bg} border={C.tok2.border} accent={C.tok2.text}
            claims={[
              ['sub',   '<user-id>  ← preserved'],
              ['aud',   'https://ai-agent.pingdemo.com'],
              ['scope', 'banking:read  banking:write'],
              ['act',   '{ "sub": "<ai-agent-client-id>" }  ← delegation fact recorded'],
            ]}
          />
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* PHASE 2: EXCHANGE #2                        */}
        {/* ═══════════════════════════════════════════ */}
        <div style={{ marginTop: 20 }}>
          <SectionLabel bg={C.cc2.bg} border={C.cc2.border} color={C.cc2.text}>③ Exchange #2 — Agent Token → MCP Tool Token (RFC 8693)</SectionLabel>
        </div>

        {/* CC token for step 2 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <TokenBadge
            label="MCP Exchanger CC Token  (actor_token)"
            color={C.cc2.bg} border={C.cc2.border} accent={C.cc2.text}
            claims={[
              ['grant',  'client_credentials'],
              ['aud',    'https://mcp-gateway.pingdemo.com'],
              ['client', 'MCP_TOKEN_EXCHANGER_CLIENT_ID'],
            ]}
          />
        </div>

        <Row mt={4}>
          <Actor icon="🏦" label="BFF" sublabel="subject_token = Intermediate Token&#10;actor_token = MCP Exchanger CC Token" color={C.bff.bg} border={C.bff.border} width={170} />
          <Arrow label="POST /as/token  RFC 8693" sublabel="scope narrowed to tool's scope  (e.g. banking:read)" color={C.ping.border} />
          <Actor icon="🔐" label="PingOne AS" sublabel="issues Final MCP Token with nested act chain" color={C.ping.bg} border={C.ping.border} />
        </Row>

        <VSpacer left={86} color={C.tok3.border} />

        {/* Final MCP token — the crown jewel */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <TokenBadge
            label="③ Final MCP Token  (Bearer sent to MCP Server)"
            color={C.tok3.bg} border={C.tok3.border} accent={C.tok3.text}
            claims={[
              ['sub',   '<user-id>  ← preserved end-to-end ✓'],
              ['aud',   'https://resource-server.pingdemo.com'],
              ['scope', 'banking:read  (narrowed to one tool) ✓'],
              ['act',   '{ "sub": "mcp-exchanger-id", "act": { "sub": "ai-agent-id" } }  ← full chain ✓'],
            ]}
          />
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* PHASE 3: MCP SERVER                         */}
        {/* ═══════════════════════════════════════════ */}
        <div style={{ marginTop: 20 }}>
          <SectionLabel bg={C.mcp.bg} border={C.mcp.border} color={C.mcp.text}>④ MCP Tool Execution</SectionLabel>
        </div>

        <Row mt={6}>
          <Actor icon="🏦" label="BFF"                                                  color={C.bff.bg}  border={C.bff.border} />
          <Arrow label="Bearer: Final MCP Token" sublabel="Authorization header only" color={C.tok3.border} />
          <Actor icon="🤖" label="MCP Server" sublabel="banking_mcp_server"            color={C.mcp.bg}  border={C.mcp.border} />
          <Arrow label="Banking API call" sublabel="aud ✓  scope ✓  act chain ✓"     color={C.mcp.border} />
          <Actor icon="💳" label="Banking API" sublabel="resource-server.pingdemo.com" color={C.mcp.bg}  border={C.mcp.border} />
        </Row>

        <VSpacer left={166} color="#475569" />

        <Row mt={0}>
          <Actor icon="🏦" label="BFF"                                                  color={C.bff.bg}  border={C.bff.border} />
          <Arrow label="decoded claims only" sublabel="no raw tokens" color="#475569" dir="left" dashed />
          <Actor icon="👤" label="User Browser" sublabel="token viewer / agent chat"   color={C.user.bg} border={C.user.border} />
        </Row>

        {/* ── legend ── */}
        <div style={{
          marginTop: 24, borderTop: '1px solid #1e293b', paddingTop: 12,
          display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: '0.65rem', color: '#64748b',
        }}>
          {[
            [C.tok1.border,  'User Access Token'],
            [C.tok2.border,  'Intermediate Agent Token'],
            [C.tok3.border,  'Final MCP Token'],
            [C.cc1.border,   'Client Credentials Tokens (actors)'],
            [C.ping.border,  'PingOne AS'],
          ].map(([color, label]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color }} />
              {label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', color: '#334155' }}>RFC 8693 §3 sub · §4.2 act · §4.3 may_act</span>
        </div>

      </div>
    </div>
  );
}
