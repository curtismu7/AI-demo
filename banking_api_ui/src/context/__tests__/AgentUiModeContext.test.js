// banking_api_ui/src/context/__tests__/AgentUiModeContext.test.js
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AgentUiModeProvider, useAgentUiMode } from '../AgentUiModeContext';

const STORAGE_KEY_LEGACY = 'banking_agent_ui_mode';
const STORAGE_KEY_V2 = 'banking_agent_ui_v2';

function ModeProbe() {
  const { placement, fab, setAgentUi } = useAgentUiMode();
  return (
    <div>
      <span data-testid="placement">{placement}</span>
      <span data-testid="fab">{fab ? '1' : '0'}</span>
      <button type="button" onClick={() => setAgentUi({ placement: 'bottom', fab: false })}>
        set bottom
      </button>
      <button type="button" onClick={() => setAgentUi({ placement: 'none', fab: true })}>
        set float
      </button>
    </div>
  );
}

describe('AgentUiModeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to float-only when localStorage is empty', () => {
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('none');
    expect(screen.getByTestId('fab')).toHaveTextContent('1');
  });

  it('initializes bottom from legacy embedded key', () => {
    localStorage.setItem(STORAGE_KEY_LEGACY, 'embedded');
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('bottom');
    expect(screen.getByTestId('fab')).toHaveTextContent('0');
  });

  it('persists setAgentUi to v2 localStorage', () => {
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /set bottom/i }));
    expect(screen.getByTestId('placement')).toHaveTextContent('bottom');
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw)).toEqual({ placement: 'bottom', fab: false });
  });

  it('syncs from storage events (other tab) on v2 key', () => {
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('none');
    act(() => {
      const next = JSON.stringify({ placement: 'middle', fab: true });
      localStorage.setItem(STORAGE_KEY_V2, next);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY_V2,
          newValue: next,
          oldValue: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByTestId('placement')).toHaveTextContent('middle');
    expect(screen.getByTestId('fab')).toHaveTextContent('1');
  });
});

describe('left-dock and right-dock placements', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads left-dock + fab:true from v2 storage correctly', () => {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ placement: 'left-dock', fab: true }));
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('left-dock');
    expect(screen.getByTestId('fab')).toHaveTextContent('1');
  });

  it('reads right-dock + fab:false from v2 storage correctly', () => {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ placement: 'right-dock', fab: false }));
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('right-dock');
    expect(screen.getByTestId('fab')).toHaveTextContent('0');
  });

  it('defaults fab to true when left-dock has no boolean fab in storage', () => {
    // JSON.stringify drops undefined; simulate a stored object with no fab key
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ placement: 'left-dock' }));
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('left-dock');
    expect(screen.getByTestId('fab')).toHaveTextContent('1');
  });

  it('legacy "floating" value still yields placement:none fab:true (no regression)', () => {
    localStorage.setItem(STORAGE_KEY_LEGACY, 'floating');
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('none');
    expect(screen.getByTestId('fab')).toHaveTextContent('1');
  });

  it('syncLegacyString writes "both" to legacy key when setAgentUi sets left-dock', () => {
    function LeftRightProbe() {
      const { placement, setAgentUi } = useAgentUiMode();
      return (
        <div>
          <span data-testid="placement2">{placement}</span>
          <button type="button" onClick={() => setAgentUi({ placement: 'left-dock', fab: true })}>
            set left-dock
          </button>
        </div>
      );
    }
    render(
      <AgentUiModeProvider>
        <LeftRightProbe />
      </AgentUiModeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /set left-dock/i }));
    expect(screen.getByTestId('placement2')).toHaveTextContent('left-dock');
    expect(localStorage.getItem(STORAGE_KEY_LEGACY)).toBe('both');
  });

  it('syncLegacyString writes "both" to legacy key when setAgentUi sets right-dock', () => {
    function LeftRightProbe2() {
      const { placement, setAgentUi } = useAgentUiMode();
      return (
        <div>
          <span data-testid="placement3">{placement}</span>
          <button type="button" onClick={() => setAgentUi({ placement: 'right-dock', fab: false })}>
            set right-dock
          </button>
        </div>
      );
    }
    render(
      <AgentUiModeProvider>
        <LeftRightProbe2 />
      </AgentUiModeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /set right-dock/i }));
    expect(screen.getByTestId('placement3')).toHaveTextContent('right-dock');
    expect(localStorage.getItem(STORAGE_KEY_LEGACY)).toBe('both');
  });
});
