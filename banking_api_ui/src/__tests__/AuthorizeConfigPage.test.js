/**
 * @file AuthorizeConfigPage.test.js
 * Unit tests for the AuthorizeConfigPage component.
 *
 * Covers:
 *   - Shows loading state while fetching
 *   - Shows error state with Retry button when fetch fails
 *   - Retry button re-fetches config
 *   - Renders the page title and all five tabs after successful load
 *   - Clicking a tab switches to that tab's panel
 *   - StatusBadge reflects activeEngine from API response
 *   - Refresh button re-fetches config
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Stub out the CSS import ───────────────────────────────────────────────────
jest.mock('../components/AuthorizeConfigPage.css', () => ({}), { virtual: true });

// ── Minimal config API response ───────────────────────────────────────────────
const MOCK_CONFIG = {
  status: { activeEngine: 'simulated' },
  simulated: {
    confirmAmount: 250,
    denyAmount: 2000,
    stepUpAmount: 500,
    mcpDenyTools: ['transfer'],
    mcpHitlTools: ['withdraw'],
  },
  pingone: {},
  mcp: {},
  scopes: {},
  env: {},
};

function mockFetchSuccess(body = MOCK_CONFIG) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

function mockFetchError() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
}

import AuthorizeConfigPage from '../components/AuthorizeConfigPage';

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('AuthorizeConfigPage — loading state', () => {
  it('shows loading indicator while fetch is pending', async () => {
    // Keep the fetch promise unresolved for this test
    global.fetch = jest.fn(() => new Promise(() => {}));
    render(<AuthorizeConfigPage />);
    expect(screen.getByText(/loading authorize config/i)).toBeInTheDocument();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('AuthorizeConfigPage — error state', () => {
  it('shows error message when fetch returns non-OK', async () => {
    mockFetchError();
    render(<AuthorizeConfigPage />);
    await waitFor(() => expect(screen.getByText(/error/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('Retry button re-issues the fetch', async () => {
    // First call → error; second call (Retry) → success
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_CONFIG });

    render(<AuthorizeConfigPage />);
    await waitFor(() => screen.getByRole('button', { name: /retry/i }));

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() =>
      expect(screen.getByText('Authorize Configuration')).toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ── Successful load ───────────────────────────────────────────────────────────

describe('AuthorizeConfigPage — loaded state', () => {
  beforeEach(() => mockFetchSuccess());

  it('renders the page title after successful load', async () => {
    render(<AuthorizeConfigPage />);
    await waitFor(() =>
      expect(screen.getByText('Authorize Configuration')).toBeInTheDocument(),
    );
  });

  it('renders all five tabs', async () => {
    render(<AuthorizeConfigPage />);
    await waitFor(() => screen.getByText('Authorize Configuration'));
    expect(screen.getByRole('button', { name: /mock rules/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pingone authorize/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mcp tool gate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scopes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /env vars/i })).toBeInTheDocument();
  });

  it('shows Simulated Authorize Rules panel by default (Mock tab active)', async () => {
    render(<AuthorizeConfigPage />);
    await waitFor(() => screen.getByText('Authorize Configuration'));
    expect(screen.getByText(/simulated authorize rules/i)).toBeInTheDocument();
  });

  it('clicking PingOne Authorize tab switches to that panel', async () => {
    render(<AuthorizeConfigPage />);
    await waitFor(() => screen.getByText('Authorize Configuration'));
    fireEvent.click(screen.getByRole('button', { name: /pingone authorize/i }));
    expect(screen.queryByText(/simulated authorize rules/i)).not.toBeInTheDocument();
  });

  it('StatusBadge reflects the activeEngine from the API', async () => {
    render(<AuthorizeConfigPage />);
    await waitFor(() => screen.getByText('Authorize Configuration'));
    // MOCK_CONFIG has activeEngine: 'simulated' → StatusBadge shows "Simulated (Mock)"
    expect(screen.getByText('Simulated (Mock)')).toBeInTheDocument();
  });

  it('StatusBadge shows "PingOne Authorize" for pingone engine', async () => {
    mockFetchSuccess({ ...MOCK_CONFIG, status: { activeEngine: 'pingone' } });
    render(<AuthorizeConfigPage />);
    // Both the badge span and the tab button contain this text; target the badge specifically
    await waitFor(() =>
      screen.getByText('PingOne Authorize', { selector: '.azc-badge' }),
    );
  });

  it('StatusBadge shows "Authorization Off" for off engine', async () => {
    mockFetchSuccess({ ...MOCK_CONFIG, status: { activeEngine: 'off' } });
    render(<AuthorizeConfigPage />);
    await waitFor(() => screen.getByText('Authorization Off'));
  });

  it('Refresh button re-issues the fetch', async () => {
    render(<AuthorizeConfigPage />);
    await waitFor(() => screen.getByText('Authorize Configuration'));
    const callsBefore = global.fetch.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
