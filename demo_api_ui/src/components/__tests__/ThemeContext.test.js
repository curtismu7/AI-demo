import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';

const MANIFEST = {
  id: 'retail',
  identity: { displayName: 'Best Buy', headerTitle: 'Best Buy', documentTitle: 'Best Buy · X', logoAlt: 'Best Buy logo', logoPath: '/x.png' },
  theme: { cssVars: { '--app-primary-red': '#0046BE' } },
  terminology: { transaction: 'Activity' },
  agent: { persona: 'Shopping Assistant', greeting: 'Hi {name}!' },
  dashboard: { kind: 'retail', chips: [{ key: 'balance', label: 'Rewards Points' }], mockData: null },
};

function Probe() {
  const t = useTheme();
  return <div>{t.identity?.displayName}|{t.dashboard?.kind}|{t.mapTerm('transaction')}</div>;
}

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ manifest: MANIFEST }) })
  );
});

test('useTheme exposes manifest fields and applies cssVars', async () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(screen.getByText('Best Buy|retail|Activity')).toBeInTheDocument());
  expect(document.documentElement.style.getPropertyValue('--app-primary-red')).toBe('#0046BE');
  expect(document.title).toBe('Best Buy · X');
});
