// banking_api_ui/src/components/__tests__/AgentModeSelector.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import AgentModeSelector from '../AgentModeSelector';

const mockHook = {
  mode: 'heuristics_helix', externalWiring: null, saving: false,
  modeOptions: [
    { id: 'heuristics', label: 'Heuristics only', external: false },
    { id: 'heuristics_helix', label: 'Heuristics + Helix', external: false },
    { id: 'chatgpt', label: 'Just ChatGPT', external: true },
  ],
  setMode: jest.fn(), setExternalWiring: jest.fn(),
};
jest.mock('../../hooks/useLangchainProvider', () => ({
  __esModule: true, default: () => mockHook,
}));

afterEach(() => { mockHook.mode = 'heuristics_helix'; mockHook.externalWiring = null; jest.clearAllMocks(); });

test('renders mode options and calls setMode on change', () => {
  render(<AgentModeSelector />);
  fireEvent.change(screen.getByLabelText(/agent mode/i), { target: { value: 'chatgpt' } });
  expect(mockHook.setMode).toHaveBeenCalledWith('chatgpt', expect.anything());
});

test('no wiring sub-toggle or banner for a non-external mode', () => {
  render(<AgentModeSelector />);
  expect(screen.queryByLabelText(/external wiring/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/delegation lost/i)).not.toBeInTheDocument();
});

test('external mode shows wiring sub-toggle; platform shows degraded banner', () => {
  mockHook.mode = 'chatgpt'; mockHook.externalWiring = 'platform';
  render(<AgentModeSelector />);
  expect(screen.getByLabelText(/external wiring/i)).toBeInTheDocument();
  expect(screen.getByText(/delegation lost/i)).toBeInTheDocument();
});

test('external mode with bff wiring shows sub-toggle but NO degraded banner', () => {
  mockHook.mode = 'chatgpt'; mockHook.externalWiring = 'bff';
  render(<AgentModeSelector />);
  expect(screen.getByLabelText(/external wiring/i)).toBeInTheDocument();
  expect(screen.queryByText(/delegation lost/i)).not.toBeInTheDocument();
});
