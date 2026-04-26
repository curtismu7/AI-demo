import React, { useState } from 'react';
import { useExchangeMode } from '../context/ExchangeModeContext';
import TokenExchangeFlowDiagram from './TokenExchangeFlowDiagram';
import InteractiveArchDiagram from './education/InteractiveArchDiagram';
import NarrativePanel from './NarrativePanel';
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
        <button
          role="tab"
          aria-selected={activeTab === 'narrative'}
          aria-controls="narrative-content"
          onClick={() => setActiveTab('narrative')}
          className="architecture-tab-button"
        >
          What's Happening
        </button>
      </div>

      {/* Tab content panels */}
      <div role="tabpanel" id="arch-content" className="architecture-tab-content">
        {activeTab === 'architecture' && <InteractiveArchDiagram />}
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

      <div role="tabpanel" id="narrative-content" className="architecture-tab-content">
        {activeTab === 'narrative' && <NarrativePanel />}
      </div>
    </div>
  );
};

export default ArchitectureTabsPanel;
