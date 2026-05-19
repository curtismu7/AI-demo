// banking_api_ui/src/hooks/__tests__/useLangchainProvider.test.js
import { renderHook, act, waitFor } from '@testing-library/react';
import useLangchainProvider from '../useLangchainProvider';

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        provider: 'helix', agent_mode: 'heuristics_helix', external_wiring: 'bff',
        agent_modes: [{ id: 'chatgpt', label: 'Just ChatGPT', external: true }],
        key_set: { ollama: true }, default_models: {},
      }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      agent_mode: 'chatgpt', external_wiring: 'platform', provider: 'openai' }) });
  });
});

test('hydrates mode + wiring; setMode posts and updates', async () => {
  const { result } = renderHook(() => useLangchainProvider());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.mode).toBe('heuristics_helix');
  expect(result.current.externalWiring).toBe('bff');
  await act(async () => { await result.current.setMode('chatgpt'); });
  expect(result.current.mode).toBe('chatgpt');
});
