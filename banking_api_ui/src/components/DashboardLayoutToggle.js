// banking_api_ui/src/components/DashboardLayoutToggle.js
import React, { useCallback } from 'react';
import { notifyInfo } from '../utils/appToast';
import { getDashboardLayout, setDashboardLayout } from '../utils/dashboardLayout';
import './DashboardLayoutToggle.css';

/**
 * Customer dashboard: classic 3-column (token + banking + floating zone) vs split (token | agent | banking).
 */
export default function DashboardLayoutToggle({ className = '' }) {
  const layout = getDashboardLayout();

  const handleClassic = useCallback(() => {
    if (layout === 'classic') return;
    setDashboardLayout('classic');
    notifyInfo('Switched to classic dashboard layout.', { autoClose: 1800 });
    window.setTimeout(() => window.location.reload(), 200);
  }, [layout]);

  const handleSplit = useCallback(() => {
    if (layout === 'split3') return;
    setDashboardLayout('split3');
    notifyInfo('Switched to split view: token chain | assistant | banking.', { autoClose: 1800 });
    window.setTimeout(() => window.location.reload(), 200);
  }, [layout]);

  return (
    <div
      className={`dashboard-layout-toggle ${className}`.trim()}
      role="group"
      aria-label="Dashboard column layout"
    >
      <span className="dashboard-layout-toggle__label" id="dashboard-layout-legend">
        Dashboard
      </span>
      <div className="dashboard-layout-toggle__segmented" role="toolbar" aria-labelledby="dashboard-layout-legend">
        <button
          type="button"
          className={`dashboard-layout-toggle__btn${layout === 'split3' ? ' dashboard-layout-toggle__btn--active' : ''}`}
          onClick={handleSplit}
          aria-pressed={layout === 'split3'}
          title="Token chain (left) · AI assistant (center) · accounts & transactions (right)"
        >
          Split view
        </button>
        <button
          type="button"
          className={`dashboard-layout-toggle__btn${layout === 'classic' ? ' dashboard-layout-toggle__btn--active' : ''}`}
          onClick={handleClassic}
          aria-pressed={layout === 'classic'}
          title="Original layout: token + banking center + floating assistant zone"
        >
          Classic
        </button>
      </div>
    </div>
  );
}
