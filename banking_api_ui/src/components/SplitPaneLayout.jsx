import React from 'react';
import './SplitPaneLayout.css';

/**
 * SplitPaneLayout — Responsive split-pane wrapper component
 *
 * Provides a flexible layout with agent pane (primary, 60%) and architecture panel (secondary, 40%).
 * Responsive: Desktop (flex-row) → Tablet (adjusted widths) → Mobile (flex-column stacked)
 *
 * @param {React.ReactNode} children - Content for the agent pane (BankingAgent, etc.)
 * @param {React.ReactNode} archPanel - Content for the architecture panel (ArchitectureTabsPanel)
 * @param {string} [className] - Optional additional CSS class names
 * @returns {React.ReactElement}
 */
const SplitPaneLayout = ({ children, archPanel, className = '' }) => {
  return (
    <div className={`split-pane-layout ${className}`.trim()}>
      <div className="split-pane-agent-pane">
        {children}
      </div>
      <aside className="split-pane-architecture-pane">
        {archPanel}
      </aside>
    </div>
  );
};

export default SplitPaneLayout;
