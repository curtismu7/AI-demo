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
  { id: 'chain',     icon: '\u{1f517}', label: 'Token Chain' },
  { id: 'inspector', icon: '\u{1f52c}', label: 'Flow Inspector' },
  { id: 'traffic',   icon: '\u{1f50c}', label: 'MCP Traffic' },
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
      title="\u{1f6e0} Dev Tools Dashboard"
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
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? '#2563eb' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ alignSelf: 'center', paddingRight: 12, fontSize: '0.72rem', color: '#94a3b8' }}>
          drag \u00b7 resize \u00b7 \u2197 pop out
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
