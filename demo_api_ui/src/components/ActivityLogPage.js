// demo_api_ui/src/components/ActivityLogPage.js
/**
 * Full-page wrapper for ActivityLogPanel.
 * Mounted at /monitoring/activity-log in App.js.
 * The SSE stream is always enabled on this page.
 */
import React from 'react';
import ActivityLogPanel from './ActivityLogPanel';

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  padding: '0',
};

const headerStyle = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid #e2e8f0',
  background: '#ffffff',
  flexShrink: 0,
};

const titleStyle = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#0f172a',
  margin: 0,
};

const subtitleStyle = {
  fontSize: '12px',
  color: '#64748b',
  marginTop: '2px',
};

const panelWrapStyle = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

export default function ActivityLogPage() {
  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <p style={titleStyle}>Activity Log</p>
        <p style={subtitleStyle}>
          Live event stream — oauth · mcp · delegation · hitl · token_exchange · gateway_path · and more
        </p>
      </div>
      <div style={panelWrapStyle}>
        <ActivityLogPanel enabled />
      </div>
    </div>
  );
}
