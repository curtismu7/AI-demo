// banking_api_ui/src/components/AgentUiModeToggle.js
import React, { useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import { persistBankingAgentUiMode } from '../services/demoScenarioService';
import './AgentUiModeToggle.css';

const MODES = [
  { id: 'floating', label: 'Floating' },
  { id: 'embedded', label: 'Embedded' },
  { id: 'both', label: 'Both' },
];

/**
 * Segmented control for banking agent UI: floating FAB, embedded bottom dock, or both.
 * Persists to demo scenario when signed in; always updates localStorage via context.
 *
 * @param {'landing' | 'eduBar' | 'config'} props.variant
 * @param {string} [props.className]
 * @param {string} [props.ariaLabel]
 */
export default function AgentUiModeToggle({ variant = 'config', className = '', ariaLabel }) {
  const { mode, setMode } = useAgentUiMode();
  const idPrefix = `agent-ui-${variant}`;

  const handleSelect = useCallback(
    async (next) => {
      if (next === mode) return;
      setMode(next);
      const saved = await persistBankingAgentUiMode(next);
      if (!saved) {
        toast.warn(
          'Agent layout could not be saved on the server yet. It stays in this browser; refresh may revert if the server still has the old value.',
          { autoClose: 4500 }
        );
      }
      toast.info('Applying agent layout…', { autoClose: 1200 });
      window.setTimeout(() => {
        if (next === 'embedded' || next === 'both') {
          window.location.href = '/';
        } else {
          window.location.reload();
        }
      }, 350);
    },
    [mode, setMode]
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
      aria-label={ariaLabel || 'AI banking agent layout: floating, embedded dock, or both'}
    >
      <span className="agent-ui-mode-toggle__label" id={`${idPrefix}-legend`}>
        {label}
      </span>
      <div className="agent-ui-mode-toggle__segmented" role="toolbar" aria-labelledby={`${idPrefix}-legend`}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`agent-ui-mode-toggle__btn${mode === m.id ? ' agent-ui-mode-toggle__btn--active' : ''}`}
            onClick={() => handleSelect(m.id)}
            aria-pressed={mode === m.id}
            title={
              m.id === 'floating'
                ? 'FAB in the corner on every screen'
                : m.id === 'embedded'
                  ? 'Bottom dock on home dashboard routes'
                  : 'Bottom dock plus floating FAB'
            }
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
