// banking_api_ui/src/components/AgentUiModeToggle.js
import React, { useCallback } from 'react';
import { notifyInfo, notifyWarning } from '../utils/appToast';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import { persistBankingAgentUi } from '../services/demoScenarioService';
import { setDashboardLayout } from '../utils/dashboardLayout';
import './AgentUiModeToggle.css';

/**
 * Middle / Bottom / Float + optional FAB when embedded.
 * Persists to demo scenario when signed in; always updates localStorage via context.
 *
 * @param {'landing' | 'eduBar' | 'config'} props.variant
 * @param {string} [props.className]
 * @param {string} [props.ariaLabel]
 */
export default function AgentUiModeToggle({ variant = 'config', className = '', ariaLabel }) {
  const { placement, fab, setAgentUi } = useAgentUiMode();
  const idPrefix = `agent-ui-${variant}`;

  const applyAndReload = useCallback(
    async (next, opts = { reload: true }) => {
      setAgentUi(next);
      const saved = await persistBankingAgentUi(next);
      if (!saved) {
        notifyWarning(
          'Agent layout could not be saved on the server yet. It stays in this browser; refresh may revert if the server still has the old value.',
          { autoClose: 4500 }
        );
      }
      notifyInfo('Applying agent layout…', { autoClose: 1200 });
      if (opts.reload) {
        window.setTimeout(() => {
          if (next.placement === 'bottom') {
            window.location.href = '/';
          } else {
            window.location.reload();
          }
        }, 350);
      }
    },
    [setAgentUi]
  );

  const handlePlacement = useCallback(
    async (p) => {
      if (p === placement) return;
      if (p === 'middle') {
        setDashboardLayout('split3');
        await applyAndReload({ placement: 'middle', fab }, { reload: true });
        return;
      }
      if (p === 'bottom') {
        setDashboardLayout('classic');
        await applyAndReload({ placement: 'bottom', fab }, { reload: true });
        return;
      }
      await applyAndReload({ placement: 'none', fab: true }, { reload: true });
    },
    [placement, fab, applyAndReload]
  );

  const handleFabToggle = useCallback(
    async (e) => {
      const checked = e.target.checked;
      if (placement === 'none') return;
      await applyAndReload({ placement, fab: checked }, { reload: true });
    },
    [placement, applyAndReload]
  );

  const label =
    variant === 'landing'
      ? 'Agent'
      : variant === 'eduBar'
        ? 'Agent UI'
        : 'Choose layout';

  return (
    <div
      className={`agent-ui-mode-toggle agent-ui-mode-toggle--${variant} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel || 'AI banking agent: middle column, bottom dock, or float; optional FAB'}
    >
      <span className="agent-ui-mode-toggle__label" id={`${idPrefix}-legend`}>
        {label}
      </span>
      <div className="agent-ui-mode-toggle__segmented" role="toolbar" aria-labelledby={`${idPrefix}-legend`}>
        <button
          type="button"
          className={`agent-ui-mode-toggle__btn${placement === 'middle' ? ' agent-ui-mode-toggle__btn--active' : ''}`}
          onClick={() => void handlePlacement('middle')}
          aria-pressed={placement === 'middle'}
          title="Assistant in the middle column (Split dashboard: token | agent | banking)"
        >
          Middle
        </button>
        <button
          type="button"
          className={`agent-ui-mode-toggle__btn${placement === 'bottom' ? ' agent-ui-mode-toggle__btn--active' : ''}`}
          onClick={() => void handlePlacement('bottom')}
          aria-pressed={placement === 'bottom'}
          title="Bottom dock on home, dashboard, and config (Classic layout)"
        >
          Bottom
        </button>
        <button
          type="button"
          className={`agent-ui-mode-toggle__btn${placement === 'none' ? ' agent-ui-mode-toggle__btn--active' : ''}`}
          onClick={() => void handlePlacement('none')}
          aria-pressed={placement === 'none'}
          title="Floating FAB only (no embedded assistant)"
        >
          Float
        </button>
      </div>
      {(placement === 'middle' || placement === 'bottom') && (
        <label className="agent-ui-mode-toggle__fab">
          <input
            type="checkbox"
            checked={fab}
            onChange={(e) => void handleFabToggle(e)}
            aria-label="Also show floating FAB on dashboard routes"
          />
          <span>+ FAB</span>
        </label>
      )}
    </div>
  );
}
