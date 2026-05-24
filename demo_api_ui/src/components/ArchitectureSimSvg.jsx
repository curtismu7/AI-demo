// demo_api_ui/src/components/ArchitectureSimSvg.jsx
import { memo } from 'react';

/**
 * Hand-coded SVG architecture diagram for the simulation page.
 *
 * viewBox: 0 0 1100 520
 * Node size: 130 × 52 px
 * Label font: 13px bold (name) + 10px (subtitle)
 *
 * Node IDs match architecture-sim-scenarios.js:
 *   n-browser, n-bff, n-mcp-gw, n-mcp-server, n-mcp-invest,
 *   n-agent, n-pingone, n-pingauthorize, n-hitl, n-mortgage, n-resource-server
 *
 * Edge IDs: e-{source}-{dest} e.g. e-browser-bff, e-bff-mcpgw, …
 */

// ── Layout constants ─────────────────────────────────────────────────────────
const NW = 130;  // node width
const NH = 52;   // node height
const NR = 7;    // border-radius

// Column x-origins
const COL = {
  browser:  20,
  bff:      200,
  mcpGw:    400,
  services: 620,
  external: 830,
};

// Row y-origins
const ROW = {
  top:    30,
  mid:   180,
  lower: 330,
  bot:   420,
};

// Node centre helpers
function cx(x) { return x + NW / 2; }
function cy(y) { return y + NH / 2; }

// ── Colour palette ───────────────────────────────────────────────────────────
const STATE_STYLES = {
  idle: {
    fill: '#f1f5f9', stroke: '#cbd5e1', textFill: '#475569',
    shadow: 'none',
  },
  active: {
    fill: '#fffbeb', stroke: '#f59e0b', textFill: '#92400e',
    shadow: 'drop-shadow(0 0 8px rgba(245,158,11,0.6))',
  },
  done: {
    fill: '#f0fdf4', stroke: '#22c55e', textFill: '#166534',
    shadow: 'none',
  },
};

const EDGE_COLORS = {
  idle:   '#cbd5e1',
  active: '#f59e0b',
  done:   '#22c55e',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SimNode({ id, x, y, label, sub, state = 'idle' }) {
  const s = STATE_STYLES[state] ?? STATE_STYLES.idle;
  const isActive = state === 'active';
  const isDone   = state === 'done';

  return (
    <g id={id} style={{ filter: isActive ? s.shadow : 'none' }}>
      <rect
        x={x} y={y} width={NW} height={NH} rx={NR} ry={NR}
        fill={s.fill} stroke={s.stroke} strokeWidth={isActive || isDone ? 2 : 1.5}
      >
        {isActive && (
          <animate
            attributeName="stroke-opacity"
            values="1;0.4;1" dur="1s"
            repeatCount="indefinite"
          />
        )}
      </rect>
      <text x={cx(x)} y={y + (sub ? 20 : 28)} textAnchor="middle"
            fontSize={13} fontWeight={700} fill={s.textFill} fontFamily="system-ui,sans-serif">
        {label}
      </text>
      {sub && (
        <text x={cx(x)} y={y + 37} textAnchor="middle"
              fontSize={10} fill={s.textFill} fontFamily="system-ui,sans-serif" opacity={0.8}>
          {sub}
        </text>
      )}
      {isDone && (
        <text x={x + NW - 4} y={y - 2} fontSize={13} textAnchor="end">&#x2705;</text>
      )}
    </g>
  );
}

function SimEdge({ id, x1, y1, x2, y2, state = 'idle', markerId }) {
  const color = EDGE_COLORS[state] ?? EDGE_COLORS.idle;
  const isActive = state === 'active';

  // Length for dash animation
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  return (
    <line
      id={id}
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color} strokeWidth={isActive ? 2.5 : 1.5}
      markerEnd={`url(#${markerId})`}
      strokeDasharray={isActive ? len : undefined}
      strokeDashoffset={isActive ? len : undefined}
    >
      {isActive && (
        <animate
          attributeName="stroke-dashoffset"
          from={len} to={0}
          dur="0.7s"
          fill="freeze"
          key={`${id}-sweep`}
        />
      )}
    </line>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function ArchitectureSimSvg({ nodeStates = {}, edgeStates = {} }) {
  function ns(id) { return nodeStates[id] ?? 'idle'; }
  function es(id) { return edgeStates[id] ?? 'idle'; }

  // Arrowhead colour helpers
  function arrowId(state) {
    return state === 'active' ? 'arr-active' : state === 'done' ? 'arr-done' : 'arr-idle';
  }

  return (
    <svg
      viewBox="0 0 1100 520"
      width="100%"
      style={{ display: 'block', minWidth: 700 }}
      aria-label="Banking demo architecture diagram"
    >
      <defs>
        <marker id="arr-idle"   markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={EDGE_COLORS.idle}/>
        </marker>
        <marker id="arr-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={EDGE_COLORS.active}/>
        </marker>
        <marker id="arr-done"   markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={EDGE_COLORS.done}/>
        </marker>
      </defs>

      {/* ── Background labels ───────────────────────────────────────── */}
      <text x={cx(COL.browser)} y={ROW.top - 10} textAnchor="middle"
            fontSize={10} fill="#94a3b8" fontFamily="system-ui,sans-serif">Client</text>
      <text x={cx(COL.bff)} y={ROW.top - 10} textAnchor="middle"
            fontSize={10} fill="#94a3b8" fontFamily="system-ui,sans-serif">BFF</text>
      <text x={cx(COL.mcpGw)} y={ROW.top - 10} textAnchor="middle"
            fontSize={10} fill="#94a3b8" fontFamily="system-ui,sans-serif">MCP Layer</text>
      <text x={cx(COL.services)} y={ROW.top - 10} textAnchor="middle"
            fontSize={10} fill="#94a3b8" fontFamily="system-ui,sans-serif">Services</text>
      <text x={cx(COL.external)} y={ROW.top - 10} textAnchor="middle"
            fontSize={10} fill="#94a3b8" fontFamily="system-ui,sans-serif">PingOne / External</text>

      {/* ── Edges (drawn behind nodes) ─────────────────────────────── */}
      {/* browser ↔ bff */}
      <SimEdge id="e-browser-bff"
        x1={COL.browser + NW} y1={cy(ROW.top)}
        x2={COL.bff}          y2={cy(ROW.top)}
        state={es('e-browser-bff')} markerId={arrowId(es('e-browser-bff'))} />

      {/* bff → mcp-gw */}
      <SimEdge id="e-bff-mcpgw"
        x1={COL.bff + NW}  y1={cy(ROW.top)}
        x2={COL.mcpGw}     y2={cy(ROW.top)}
        state={es('e-bff-mcpgw')} markerId={arrowId(es('e-bff-mcpgw'))} />

      {/* mcp-gw → mcp-server */}
      <SimEdge id="e-mcpgw-mcpserver"
        x1={COL.mcpGw + NW}   y1={cy(ROW.top)}
        x2={COL.services}      y2={cy(ROW.top)}
        state={es('e-mcpgw-mcpserver')} markerId={arrowId(es('e-mcpgw-mcpserver'))} />

      {/* mcp-gw → mortgage (skips mcp-invest row, terminates at n-mortgage) */}
      <SimEdge id="e-mcpgw-mortgage"
        x1={cx(COL.mcpGw)}  y1={ROW.top + NH}
        x2={cx(COL.mcpGw)}  y2={ROW.mid + NH + 10}
        state={es('e-mcpgw-mortgage')} markerId={arrowId(es('e-mcpgw-mortgage'))} />
      <SimEdge id="e-mcpgw-mortgage-h"
        x1={cx(COL.mcpGw)}  y1={cy(ROW.mid + NH + 10)}
        x2={COL.services}   y2={cy(ROW.mid + NH + 10)}
        state={es('e-mcpgw-mortgage')} markerId={arrowId(es('e-mcpgw-mortgage'))} />

      {/* mcp-gw → resource-server */}
      <SimEdge id="e-mcpgw-resourceserver"
        x1={COL.mcpGw + NW}   y1={cy(ROW.lower)}
        x2={COL.services}      y2={cy(ROW.lower)}
        state={es('e-mcpgw-resourceserver')} markerId={arrowId(es('e-mcpgw-resourceserver'))} />

      {/* bff → pingone (vertical) */}
      <SimEdge id="e-bff-pingone"
        x1={cx(COL.bff)}   y1={ROW.top + NH}
        x2={cx(COL.bff)}   y2={ROW.mid}
        state={es('e-bff-pingone')} markerId={arrowId(es('e-bff-pingone'))} />
      <SimEdge id="e-bff-pingone-h"
        x1={cx(COL.bff)}     y1={cy(ROW.mid)}
        x2={COL.external}    y2={cy(ROW.mid)}
        state={es('e-bff-pingone')} markerId={arrowId(es('e-bff-pingone'))} />

      {/* mcp-gw → pingone */}
      <SimEdge id="e-mcpgw-pingone"
        x1={cx(COL.mcpGw)}  y1={ROW.top + NH}
        x2={cx(COL.mcpGw)}  y2={ROW.mid + 15}
        state={es('e-mcpgw-pingone')} markerId={arrowId(es('e-mcpgw-pingone'))} />
      <SimEdge id="e-mcpgw-pingone-h"
        x1={cx(COL.mcpGw)}   y1={cy(ROW.mid) + 15}
        x2={COL.external}    y2={cy(ROW.mid) + 15}
        state={es('e-mcpgw-pingone')} markerId={arrowId(es('e-mcpgw-pingone'))} />

      {/* bff → pingauthorize */}
      <SimEdge id="e-bff-pingauth"
        x1={cx(COL.bff)}  y1={ROW.top + NH}
        x2={cx(COL.bff)}  y2={ROW.lower}
        state={es('e-bff-pingauth')} markerId={arrowId(es('e-bff-pingauth'))} />
      <SimEdge id="e-bff-pingauth-h"
        x1={cx(COL.bff)}    y1={cy(ROW.lower)}
        x2={COL.external}   y2={cy(ROW.lower)}
        state={es('e-bff-pingauth')} markerId={arrowId(es('e-bff-pingauth'))} />

      {/* bff → hitl */}
      <SimEdge id="e-bff-hitl"
        x1={cx(COL.bff)}  y1={ROW.top + NH}
        x2={cx(COL.bff)}  y2={ROW.bot}
        state={es('e-bff-hitl')} markerId={arrowId(es('e-bff-hitl'))} />
      <SimEdge id="e-bff-hitl-h"
        x1={cx(COL.bff)}    y1={cy(ROW.bot)}
        x2={COL.services}   y2={cy(ROW.bot)}
        state={es('e-bff-hitl')} markerId={arrowId(es('e-bff-hitl'))} />

      {/* ── Nodes ──────────────────────────────────────────────────── */}
      {/* Row 1: main request path */}
      <SimNode id="n-browser"  x={COL.browser}  y={ROW.top} label="Browser"       sub="port 4000"             state={ns('n-browser')} />
      <SimNode id="n-bff"      x={COL.bff}      y={ROW.top} label="BFF"           sub="demo_api_server :3001"  state={ns('n-bff')} />
      <SimNode id="n-mcp-gw"   x={COL.mcpGw}   y={ROW.top} label="MCP Gateway"   sub=":3005"                  state={ns('n-mcp-gw')} />
      <SimNode id="n-mcp-server" x={COL.services} y={ROW.top} label="MCP Server"  sub=":8080"                  state={ns('n-mcp-server')} />

      {/* Row 2: parallel services */}
      <SimNode id="n-agent"      x={COL.mcpGw}    y={ROW.mid} label="Agent Service" sub=":3006 / :8888"         state={ns('n-agent')} />
      <SimNode id="n-mcp-invest" x={COL.services} y={ROW.mid} label="MCP Invest"    sub=":8081"                 state={ns('n-mcp-invest')} />
      <SimNode id="n-mortgage"   x={COL.services} y={ROW.mid + NH + 10} label="Mortgage Svc" sub=":8082"        state={ns('n-mortgage')} />
      <SimNode id="n-pingone"    x={COL.external} y={ROW.mid} label="PingOne"        sub="OAuth AS"              state={ns('n-pingone')} />

      {/* Row 3: lower services */}
      <SimNode id="n-resource-server" x={COL.services} y={ROW.lower} label="Resource Server" sub="/api/resource-server" state={ns('n-resource-server')} />
      <SimNode id="n-pingauthorize"   x={COL.external} y={ROW.lower} label="PingAuthorize"   sub="PDP"          state={ns('n-pingauthorize')} />

      {/* Row 4: HITL */}
      <SimNode id="n-hitl" x={COL.services} y={ROW.bot} label="HITL Service" sub=":3009"                       state={ns('n-hitl')} />
    </svg>
  );
}

export default memo(ArchitectureSimSvg);
