// banking_api_ui/src/components/ExchangeModeToggle.js
import React from 'react';
import './ExchangeModeToggle.css';

/**
 * RFC 8693 2-Exchange mode (no toggle).
 * Always runs 2-exchange delegation for MCP tokens: User → Agent → MCP.
 * 
 * Also displays the three token types and their nomenclature.
 */
export default function ExchangeModeToggle() {
  return (
    <div className="emt-root">
      <div className="emt-header">
        <span className="emt-label">Token Exchange Mode (RFC 8693 §4)</span>
        <span className="emt-rfc">2-Exchange Delegation</span>
      </div>
      
      <p className="emt-desc-main">
        <strong>Chained delegation:</strong> User Token → Agent Token → Delegated Access Token (nested <code>act</code> claim)
      </p>

      {/* Token Types Table */}
      <div className="emt-tokens-table">
        <div className="emt-tokens-header">
          <span className="emt-tokens-col-name">Token Type</span>
          <span className="emt-tokens-col-noun">Full Name</span>
          <span className="emt-tokens-col-source">Issued By</span>
          <span className="emt-tokens-col-use">RFC 8693 Role</span>
        </div>

        <div className="emt-token-row emt-token-row--user">
          <span className="emt-tokens-col-name"><strong>User Token</strong></span>
          <span className="emt-tokens-col-noun">User access token</span>
          <span className="emt-tokens-col-source">PingOne OIDC login</span>
          <span className="emt-tokens-col-use">
            <code>subject_token</code> (Exchange #1)
          </span>
        </div>

        <div className="emt-token-row emt-token-row--agent">
          <span className="emt-tokens-col-name"><strong>Agent Token</strong></span>
          <span className="emt-tokens-col-noun">Agent access token</span>
          <span className="emt-tokens-col-source">Client credentials grant</span>
          <span className="emt-tokens-col-use">
            <code>actor_token</code> (Exchange #1 &amp; #2)
          </span>
        </div>

        <div className="emt-token-row emt-token-row--mcp">
          <span className="emt-tokens-col-name"><strong>MCP Token</strong></span>
          <span className="emt-tokens-col-noun">Delegated access token</span>
          <span className="emt-tokens-col-source">RFC 8693 exchange</span>
          <span className="emt-tokens-col-use">
            Result with nested <code>act</code> claim (to MCP Server)
          </span>
        </div>
      </div>

      <p className="emt-note">
        ℹ️ <strong>Security guarantee:</strong> User Token and Agent Token are secrets — stored only on the Backend-for-Frontend (BFF). 
        Only the Delegated Access Token (limited scope + nested delegation proof) reaches the MCP Server.
      </p>
    </div>
  );
}
