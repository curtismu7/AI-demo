import React from 'react';
import { render, screen } from '@testing-library/react';
import DashboardHeader from '../DashboardHeader';
import { ThemeProvider } from '../../context/ThemeContext';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        manifest: {
          id: 'retail',
          identity: { headerTitle: 'Best Buy', logoAlt: 'Best Buy logo', logoPath: '/x.png', documentTitle: 'Best Buy' },
          theme: { cssVars: {} }, terminology: {}, agent: {}, dashboard: { kind: 'retail' },
        },
      }),
    })
  );
});

test('header renders manifest headerTitle and logo alt', async () => {
  render(<ThemeProvider><DashboardHeader variant="customer" /></ThemeProvider>);
  expect(await screen.findByText('Best Buy')).toBeInTheDocument();
  expect(screen.getByAltText('Best Buy logo')).toBeInTheDocument();
});
