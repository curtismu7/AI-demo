// banking_api_ui/src/context/__tests__/AgentUiModeContext.test.js
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AgentUiModeProvider, useAgentUiMode } from '../AgentUiModeContext';

const STORAGE_KEY = 'banking_agent_ui_mode';

function ModeProbe() {
  const { mode, setMode } = useAgentUiMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={() => setMode('embedded')}>
        set embedded
      </button>
      <button type="button" onClick={() => setMode('floating')}>
        set floating
      </button>
    </div>
  );
}

describe('AgentUiModeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to floating when localStorage is empty', () => {
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('floating');
  });

  it('initializes embedded from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'embedded');
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('embedded');
  });

  it('migrates legacy both from localStorage to floating', async () => {
    localStorage.setItem(STORAGE_KEY, 'both');
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('floating');
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe('floating');
    });
  });

  it('persists setMode to localStorage and updates UI', () => {
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /set embedded/i }));
    expect(screen.getByTestId('mode')).toHaveTextContent('embedded');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('embedded');
  });

  it('syncs mode from storage events (other tab)', () => {
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('floating');
    act(() => {
      localStorage.setItem(STORAGE_KEY, 'embedded');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'embedded',
          oldValue: 'floating',
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByTestId('mode')).toHaveTextContent('embedded');
  });
});
