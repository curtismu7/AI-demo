// banking_api_ui/src/components/DevToolsDashboard.jsx
/**
 * DevToolsDashboard — combines Live Token Chain, Agent & Token Flow Inspector,
 * and MCP Traffic into a single tabbed FloatingPanel.
 *
 * Draggable, 8-direction resizable, pop-out to second screen via FloatingPanel.
 */
import React, { useState } from 'react';
import FloatingPanel from './FloatingPanel';
import TokenChainDisplay from './TokenChainDisplay';
import UnifiedTokenFlowInspector from './UnifiedTokenFlowInspector';
import McpTrafficPage from './McpTrafficPage';

const TABS = [
  { id: 'chain',     icon: '🔗', label: 'Token Chain' },
  { id: 'inspector', icon: '🔬', label: 'Flow Inspector' },
  { id: 'traffic',   icon: '🔌', label: 'MCP Traffic' },
];

export default function DevToolsDashboard({
  defaultWidth = 1100,
  defaultHeight = 620,
  defaultX = 0,
  defaultY = 0,
  defaultTab = 'chain',
  className = '',
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <FloatingPanel
      title="🛠 Dev Tools Dashboard"
      defaultWidth={defaultWidth}
      defaultHeight={defaultHeight}
      defaultX={defaultX}
      defaultY={defaultY}
      minWidth={380}
      minHeight={320}
      className={`devtools-panel ${className}`}
    >
      {/* Tab bar */}
      <div style={{
        display: "flex",
        background: "#1a1a2e",
        flexShrink: 0,
        gap: "2px",
        padding: "6px 8px 0",
        alignItems: "flex-end",
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "9px 22px 10px",
              border: "none",
              borderRadius: "6px 6px 0 0",
              background: activeTab === tab.id ? "#ffffff" : "rgba(255,255,255,0.1)",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? "#1a1a2e" : "rgba(255,255,255,0.65)",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              transition: "background 0.15s, color 0.15s",
              whiteSpace: "nowrap",
              boxShadow: activeTab === tab.id ? "inset 0 -3px 0 #3b82f6" : "none",
              letterSpacing: "0.01em",
            }}
          >
            <span style={{ fontSize: "1.05rem" }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ alignSelf: "center", paddingBottom: 8, paddingRight: 10, fontSize: "0.7rem", color: "rgba(255,255,255,0.35)" }}>
          drag · resize · ↗ pop out
        </span>
      </div>
      {/* Tab panels — all mounted to preserve polling/state */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: activeTab === 'chain' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
          <TokenChainDisplay />
        </div>
        <div style={{ display: activeTab === 'inspector' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <UnifiedTokenFlowInspector floatingByDefault={false} showToggle={false} />
        </div>
        <div style={{ display: activeTab === 'traffic' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <McpTrafficPage />
        </div>
      </div>
    </FloatingPanel>
  );
}
