// demo_api_ui/src/components/ArchitectureSimStepDesc.jsx
import { memo } from 'react';

/**
 * Thin bar below the diagram showing the current step description.
 * Background turns green on completion.
 */
function ArchitectureSimStepDesc({ stepIndex, totalSteps, desc, isComplete, mode }) {
  if (mode === 'live' && stepIndex === 0) {
    return (
      <div style={barStyle(false)}>
        <span style={tagStyle('#64748b')}>LIVE</span>
        Waiting for real system events… trigger a login or MCP tool call in another tab.
      </div>
    );
  }

  if (stepIndex === 0) {
    return (
      <div style={barStyle(false)}>
        <span style={tagStyle('#64748b')}>READY</span>
        Select a scenario and press Play — or use Step to advance manually.
      </div>
    );
  }

  if (isComplete) {
    return (
      <div style={barStyle(true)}>
        <span style={tagStyle('#22c55e')}>DONE</span>
        Scenario complete. Press Reset to replay.
      </div>
    );
  }

  return (
    <div style={barStyle(false)}>
      <span style={tagStyle('#1d4ed8')}>STEP {stepIndex}/{totalSteps}</span>
      {desc}
    </div>
  );
}

function barStyle(done) {
  return {
    background: done ? '#f0fdf4' : '#eff6ff',
    border: `1px solid ${done ? '#bbf7d0' : '#bfdbfe'}`,
    borderTop: 'none',
    borderRadius: '0 0 6px 6px',
    padding: '0.45rem 0.8rem',
    fontSize: '0.8rem',
    color: done ? '#166534' : '#1e40af',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minHeight: '2.2rem',
  };
}

function tagStyle(color) {
  return {
    background: color,
    color: '#fff',
    borderRadius: '3px',
    padding: '0.1rem 0.45rem',
    fontSize: '0.68rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}

export default memo(ArchitectureSimStepDesc);
