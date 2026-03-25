/**
 * Theme preference is stored so refresh keeps light/dark (THEME_STORAGE_KEY).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ThemeProvider,
  useTheme,
  THEME_STORAGE_KEY,
  AGENT_APPEARANCE_STORAGE_KEY,
} from '../ThemeContext';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={() => toggleTheme()}>
      theme:{theme}
    </button>
  );
}

function AgentProbe() {
  const { theme, effectiveAgentTheme, setAgentAppearance } = useTheme();
  return (
    <div>
      <span data-testid="page">{theme}</span>
      <span data-testid="agent">{effectiveAgentTheme}</span>
      <button type="button" onClick={() => setAgentAppearance('light')}>
        agent-light
      </button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('initializes from localStorage when set', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByRole('button')).toHaveTextContent('theme:dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persists toggle to localStorage and sessionStorage', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByRole('button')).toHaveTextContent('theme:light');
    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(sessionStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('effectiveAgentTheme follows page when agent appearance is auto (floating layout)', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    localStorage.setItem('banking_agent_ui_mode', 'floating');
    render(
      <ThemeProvider>
        <AgentProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('page')).toHaveTextContent('dark');
    expect(screen.getByTestId('agent')).toHaveTextContent('dark');
  });

  it('effectiveAgentTheme defaults to light when auto + dark page + embedded dock', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    localStorage.setItem('banking_agent_ui_mode', 'embedded');
    render(
      <ThemeProvider>
        <AgentProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('page')).toHaveTextContent('dark');
    expect(screen.getByTestId('agent')).toHaveTextContent('light');
  });

  it('effectiveAgentTheme can override page when set to light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    localStorage.setItem(AGENT_APPEARANCE_STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <AgentProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('page')).toHaveTextContent('dark');
    expect(screen.getByTestId('agent')).toHaveTextContent('light');
  });

  it('persists agent appearance to localStorage and sessionStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <AgentProbe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'agent-light' }));
    expect(localStorage.getItem(AGENT_APPEARANCE_STORAGE_KEY)).toBe('light');
    expect(sessionStorage.getItem(AGENT_APPEARANCE_STORAGE_KEY)).toBe('light');
    expect(screen.getByTestId('agent')).toHaveTextContent('light');
  });
});
