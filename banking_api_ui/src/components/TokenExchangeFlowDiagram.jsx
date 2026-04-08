import React, { useState } from 'react';
import './TokenExchangeFlowDiagram.css';

/**
 * TokenExchangeFlowDiagram Component
 * 
 * Renders an interactive SVG-based visual flow diagram showing RFC 8693 token exchange
 * for both 1-exchange (subject-only) and 2-exchange (subject + agent actor) paths.
 * 
 * Props:
 *   @param {string} mode - 'single' (1-exchange) or 'double' (2-exchange), default 'single'
 *   @param {string} className - Additional CSS classes
 */
export default function TokenExchangeFlowDiagram({ mode = 'single', className = '' }) {
  const [hoveredStep, setHoveredStep] = useState(null);

  // Validate mode
  if (!['single', 'double'].includes(mode)) {
    console.warn(`TokenExchangeFlowDiagram: Invalid mode "${mode}", defaulting to "single"`);
    return null; // or return placeholder
  }

  const isSingleExchange = mode === 'single';
  const isDoubleExchange = mode === 'double';

  /**
   * Render 1-exchange flow path (subject-only delegation)
   */
  const renderSingleExchangePath = () => (
    <svg 
      viewBox="0 0 1000 400" 
      preserveAspectRatio="xMidYMid meet"
      className="tefd-svg tefd-svg--single"
    >
      {/* Title */}
      <text x="500" y="30" className="tefd-title" textAnchor="middle">
        1-Exchange: Subject-Only Token (RFC 8693 §2.1)
      </text>

      {/* Actor boxes */}
      {/* User/Browser box */}
      <g className="tefd-box tefd-box--user">
        <rect x="50" y="80" width="130" height="80" rx="4" />
        <text x="115" y="115" textAnchor="middle">User</text>
        <text x="115" y="135" className="tefd-box-desc">(Browser)</text>
      </g>

      {/* BFF box */}
      <g className="tefd-box tefd-box--bff">
        <rect x="250" y="80" width="130" height="80" rx="4" />
        <text x="315" y="115" textAnchor="middle">Backend-for-</text>
        <text x="315" y="135" textAnchor="middle">Frontend (BFF)</text>
      </g>

      {/* PingOne box */}
      <g className="tefd-box tefd-box--pingone">
        <rect x="450" y="80" width="130" height="80" rx="4" />
        <text x="515" y="115" textAnchor="middle">PingOne OAuth</text>
        <text x="515" y="135" className="tefd-box-desc">(/token endpoint)</text>
      </g>

      {/* MCP Server box */}
      <g className="tefd-box tefd-box--mcp">
        <rect x="650" y="80" width="130" height="80" rx="4" />
        <text x="715" y="115" textAnchor="middle">MCP Server</text>
        <text x="715" y="135" className="tefd-box-desc">(WebSocket)</text>
      </g>

      {/* Flow arrows and labels */}
      
      {/* User → BFF: User logs in */}
      <line x1="180" y1="120" x2="250" y2="120" className="tefd-arrow tefd-arrow--label" />
      <polygon points="250,120 240,115 240,125" className="tefd-arrowhead" />
      <text x="215" y="105" className="tefd-label tefd-label--step">1. User logs in</text>
      <text x="215" y="155" className="tefd-label tefd-label--desc">User authenticates via OIDC</text>

      {/* BFF receives user token */}
      <circle cx="315" cy="180" r="50" className="tefd-token-event" />
      <text x="315" y="185" textAnchor="middle" className="tefd-token-event-text">User Token</text>
      <text x="315" y="200" textAnchor="middle" className="tefd-token-event-text" fontSize="10">(may_act claim)</text>

      {/* BFF → PingOne: Exchange request */}
      <line x1="380" y1="120" x2="450" y2="120" className="tefd-arrow tefd-arrow--token-request" />
      <polygon points="450,120 440,115 440,125" className="tefd-arrowhead--request" />
      <text x="415" y="105" className="tefd-label tefd-label--rfc">RFC 8693 §2.1</text>
      <text x="415" y="160" className="tefd-label tefd-label--desc">subject_token (narrowed aud)</text>

      {/* PingOne processes and returns MCP token */}
      <line x1="580" y1="120" x2="650" y2="120" className="tefd-arrow tefd-arrow--token-mcp" />
      <polygon points="650,120 640,115 640,125" className="tefd-arrowhead--mcp" />
      <text x="615" y="105" className="tefd-label tefd-label--rfc">RFC 8693 §3</text>
      <text x="615" y="160" className="tefd-label tefd-label--desc">MCP Token (sub=user_id)</text>

      {/* MCP Token details box */}
      <g className="tefd-token-details">
        <rect x="630" y="200" width="170" height="120" rx="4" fill="#f9f9f9" stroke="#ddd" />
        <text x="715" y="220" textAnchor="middle" className="tefd-details-title">MCP Token Claims</text>
        <text x="645" y="245" className="tefd-details-claim">sub: user_id</text>
        <text x="645" y="265" className="tefd-details-claim">aud: mcp_server</text>
        <text x="645" y="285" className="tefd-details-claim">scope: banking:*</text>
        <text x="645" y="305" className="tefd-details-claim">exp: [timestamp]</text>
      </g>

      {/* Success indicator */}
      <text x="715" y="360" textAnchor="middle" className="tefd-success">
        ✓ Subject-only delegation: least privilege MCP token
      </text>
    </svg>
  );

  /**
   * Render 2-exchange flow path (subject + agent actor delegation)
   */
  const renderDoubleExchangePath = () => (
    <svg 
      viewBox="0 0 1100 450" 
      preserveAspectRatio="xMidYMid meet"
      className="tefd-svg tefd-svg--double"
    >
      {/* Title */}
      <text x="550" y="30" className="tefd-title" textAnchor="middle">
        2-Exchange: Subject + Agent Actor (RFC 8693 §4)
      </text>

      {/* Actor boxes */}
      {/* User/Browser box */}
      <g className="tefd-box tefd-box--user">
        <rect x="30" y="80" width="110" height="80" rx="4" />
        <text x="85" y="115" textAnchor="middle">User</text>
        <text x="85" y="135" className="tefd-box-desc">(Browser)</text>
      </g>

      {/* Agent box - NEW FOR 2-EXCHANGE */}
      <g className="tefd-box tefd-box--agent" onMouseEnter={() => setHoveredStep('agent')} onMouseLeave={() => setHoveredStep(null)}>
        <rect x="200" y="80" width="110" height="80" rx="4" />
        <text x="255" y="105" textAnchor="middle" className="tefd-agent-icon">🤖</text>
        <text x="255" y="135" textAnchor="middle" className="tefd-agent-label">AI Agent</text>
      </g>

      {/* BFF box */}
      <g className="tefd-box tefd-box--bff">
        <rect x="370" y="80" width="130" height="80" rx="4" />
        <text x="435" y="115" textAnchor="middle">Backend-for-</text>
        <text x="435" y="135" textAnchor="middle">Frontend (BFF)</text>
      </g>

      {/* PingOne box */}
      <g className="tefd-box tefd-box--pingone">
        <rect x="570" y="80" width="130" height="80" rx="4" />
        <text x="635" y="115" textAnchor="middle">PingOne OAuth</text>
        <text x="635" y="135" className="tefd-box-desc">(/token endpoint)</text>
      </g>

      {/* MCP Server box */}
      <g className="tefd-box tefd-box--mcp">
        <rect x="770" y="80" width="130" height="80" rx="4" />
        <text x="835" y="115" textAnchor="middle">MCP Server</text>
        <text x="835" y="135" className="tefd-box-desc">(WebSocket)</text>
      </g>

      {/* Flow arrows and labels */}

      {/* User → BFF: User logs in */}
      <line x1="140" y1="120" x2="200" y2="120" className="tefd-arrow tefd-arrow--label" />
      <polygon points="200,120 190,115 190,125" className="tefd-arrowhead" />
      <text x="170" y="65" className="tefd-label tefd-label--step">1. User logs in</text>

      {/* Agent → BFF: Delegates as actor */}
      <line x1="310" y1="120" x2="370" y2="120" className="tefd-arrow tefd-arrow--agent-token" />
      <polygon points="370,120 360,115 360,125" className="tefd-arrowhead--agent" />
      <text x="340" y="155" className="tefd-label tefd-label--desc">Agent credentials</text>

      {/* BFF receives tokens */}
      <circle cx="435" cy="200" r="35" className="tefd-token-event" />
      <text x="435" y="195" textAnchor="middle" className="tefd-token-event-text" fontSize="11">User Token</text>
      <text x="435" y="210" textAnchor="middle" className="tefd-token-event-text" fontSize="11">+ Agent Token</text>

      {/* BFF → PingOne: Exchange request with both tokens */}
      <line x1="500" y1="120" x2="570" y2="120" className="tefd-arrow tefd-arrow--token-request-double" />
      <polygon points="570,120 560,115 560,125" className="tefd-arrowhead--request" />
      <text x="535" y="105" className="tefd-label tefd-label--rfc">RFC 8693 §4</text>
      <text x="535" y="160" className="tefd-label tefd-label--desc">subject_token + actor_token</text>

      {/* PingOne processes and returns MCP token with act claim */}
      <line x1="700" y1="120" x2="770" y2="120" className="tefd-arrow tefd-arrow--token-mcp-double" />
      <polygon points="770,120 760,115 760,125" className="tefd-arrowhead--mcp" />
      <text x="735" y="105" className="tefd-label tefd-label--rfc">RFC 8693 §3</text>
      <text x="735" y="160" className="tefd-label tefd-label--desc">MCP Token (with act claim)</text>

      {/* MCP Token with delegation details box */}
      <g className="tefd-token-details">
        <rect x="750" y="200" width="190" height="140" rx="4" fill="#fffacd" stroke="#daa520" strokeWidth="2" />
        <text x="845" y="220" textAnchor="middle" className="tefd-details-title">MCP Token + Delegation</text>
        <text x="765" y="245" className="tefd-details-claim">sub: user_id</text>
        <text x="765" y="265" className="tefd-details-claim" fill="#d9534f">act: {'{'}{'}'}}</text>
        <text x="785" y="285" className="tefd-details-claim" fill="#d9534f">  client_id: agent_id</text>
        <text x="765" y="305" className="tefd-details-claim" fill="#d9534f">}</text>
        <text x="765" y="330" className="tefd-details-claim">aud: mcp_server</text>
      </g>

      {/* Success indicator */}
      <text x="835" y="410" textAnchor="middle" className="tefd-success">
        ✓ Agent acts on behalf of user: delegation chain verified
      </text>
    </svg>
  );

  return (
    <div className={`tefd-root ${className}`}>
      <div className="tefd-container">
        {isSingleExchange && renderSingleExchangePath()}
        {isDoubleExchange && renderDoubleExchangePath()}
      </div>

      {/* Flow hint */}
      <div className="tefd-hint">
        <p className="tefd-hint-text">
          {isSingleExchange 
            ? '💡 Single exchange: User token directly exchanged for MCP token (narrowed scope, same subject)'
            : '💡 Double exchange: User token + Agent token exchanged for MCP token (with act claim showing delegation)'}
        </p>
      </div>
    </div>
  );
}
