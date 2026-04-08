import React, { useState } from 'react';
import { useExchangeMode } from '../context/ExchangeModeContext';
import TokenExchangeFlowDiagram from './TokenExchangeFlowDiagram';
import './ArchitectureTabsPanel.css';

/**
 * ArchitectureTabsPanel — Multi-tab architecture display component
 *
 * Provides two tabs:
 * 1. System Architecture — High-level system diagram (placeholder initially)
 * 2. Token Exchange Flow — Live RFC 8693 flow diagram with real-time mode syncing
 *
 * Real-time updates: When exchange mode toggles (1-exchange ↔ 2-exchange),
 * the TokenExchangeFlowDiagram rerenders automatically via ExchangeModeContext.
 *
 * @returns {React.ReactElement}
 */
const ArchitectureTabsPanel = () => {
  const [activeTab, setActiveTab] = useState('architecture');
  const { mode } = useExchangeMode();

  return (
    <div className="architecture-tabs-panel">
      {/* Tab header row */}
      <div role="tablist" className="architecture-tabs-header">
        <button
          role="tab"
          aria-selected={activeTab === 'architecture'}
          aria-controls="arch-content"
          onClick={() => setActiveTab('architecture')}
          className="architecture-tab-button"
        >
          System Architecture
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'token-flow'}
          aria-controls="flow-content"
          onClick={() => setActiveTab('token-flow')}
          className="architecture-tab-button"
        >
          Token Exchange Flow
        </button>
      </div>

      {/* Tab content panels */}
      <div role="tabpanel" id="arch-content" className="architecture-tab-content">
        {activeTab === 'architecture' && (
          <div className="architecture-diagram">
            <h3>System Architecture</h3>
            <p><strong>Authentication Flow:</strong></p>
            <p>Users → BFF (Backend for Frontend) → PingOne → MCP Server</p>
            <br />
            <p><strong>Roles:</strong></p>
            <ul>
              <li><strong>Admin:</strong> Full access to all operations, audit logs, and configuration</li>
              <li><strong>Customer:</strong> Access to personal accounts and transactions</li>
              <li><strong>Agent:</strong> AI assistant performing operations on behalf of user (RFC 8693 delegation)</li>
            </ul>
            <br />
            <p><strong>Token Flow:</strong></p>
            <ul>
              <li><strong>1-Exchange:</strong> User token narrowed to MCP audience (subject-only)</li>
              <li><strong>2-Exchange:</strong> User + Agent tokens combined, MCP token includes delegation (act claim)</li>
            </ul>
          </div>
        )}
      </div>

      <div role="tabpanel" id="flow-content" className="architecture-tab-content">
        {activeTab === 'token-flow' && (
          <div className="token-flow-display">
            <p className="token-flow-mode-indicator">
              <strong>Exchange Mode:</strong> {mode === 'double' ? '2-Exchange (Agent Delegation)' : '1-Exchange (Subject Only)'}
            </p>
            <TokenExchangeFlowDiagram mode={mode} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchitectureTabsPanel;
