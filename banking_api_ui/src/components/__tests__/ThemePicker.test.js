import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ThemePicker from '../ThemePicker';
import { ThemeProvider } from '../../context/ThemeContext';

beforeEach(() => {
  global.fetch = jest.fn((url, opts) => {
    if (url === '/api/config/verticals/list') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        verticals: [{ id: 'banking', displayName: 'Super Banking' }, { id: 'retail', displayName: 'Best Buy' }],
      }) });
    }
    if (url === '/api/config/vertical' && (!opts || opts.method !== 'PUT')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        manifest: { id: 'banking', identity: { displayName: 'Super Banking', documentTitle: 'x' }, theme: { cssVars: {} }, terminology: {}, agent: {}, dashboard: { kind: 'banking' } },
      }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); // PUT
  });
});

test('lists themes and PUTs on change', async () => {
  render(<ThemeProvider><ThemePicker variant="toolbar" /></ThemeProvider>);
  await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
  expect(screen.getByText('Best Buy')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'retail' } });
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/config/vertical',
      expect.objectContaining({ method: 'PUT' }),
    )
  );
});
