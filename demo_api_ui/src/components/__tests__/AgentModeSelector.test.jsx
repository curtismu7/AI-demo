// banking_api_ui/src/components/__tests__/AgentModeSelector.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import AgentModeSelector from "../AgentModeSelector";

const mockHook = {
  mode: "heuristics_helix",
  provider: undefined,
  externalWiring: null,
  saving: false,
  loading: false,
  modeOptions: [
    { id: "heuristics", label: "Heuristics only", external: false },
    { id: "heuristics_helix", label: "Heuristics + Helix", external: false },
    { id: "claude", label: "Claude (Anthropic)", external: false },
    { id: "helix_google", label: "Helix (Google)", external: true },
  ],
  setMode: jest.fn(),
  setExternalWiring: jest.fn(),
};
jest.mock("../../hooks/useLangchainProvider", () => ({
  __esModule: true,
  default: () => mockHook,
}));

afterEach(() => {
  mockHook.mode = "heuristics_helix";
  mockHook.provider = undefined;
  mockHook.externalWiring = null;
  mockHook.loading = false;
  jest.clearAllMocks();
});

test("renders mode options and calls setMode on change", () => {
  render(<AgentModeSelector />);
  fireEvent.change(screen.getByLabelText(/agent mode/i), {
    target: { value: "claude" },
  });
  expect(mockHook.setMode).toHaveBeenCalledWith("claude", null);
});

test("no wiring sub-toggle or banner for a non-external mode", () => {
  render(<AgentModeSelector />);
  expect(screen.queryByLabelText(/external wiring/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/delegation lost/i)).not.toBeInTheDocument();
});

test("external mode shows wiring sub-toggle; platform shows degraded banner", () => {
  mockHook.mode = "helix_google";
  mockHook.externalWiring = "platform";
  render(<AgentModeSelector />);
  expect(screen.getByLabelText(/external wiring/i)).toBeInTheDocument();
  expect(screen.getByText(/delegation lost/i)).toBeInTheDocument();
});

test("external mode with bff wiring shows sub-toggle but NO degraded banner", () => {
  mockHook.mode = "helix_google";
  mockHook.externalWiring = "bff";
  render(<AgentModeSelector />);
  expect(screen.getByLabelText(/external wiring/i)).toBeInTheDocument();
  expect(screen.queryByText(/delegation lost/i)).not.toBeInTheDocument();
});

test("changing wiring select calls setExternalWiring", () => {
  mockHook.mode = "helix_google"; mockHook.externalWiring = "bff";
  render(<AgentModeSelector />);
  fireEvent.change(screen.getByLabelText(/external wiring/i), { target: { value: "platform" } });
  expect(mockHook.setExternalWiring).toHaveBeenCalledWith("platform");
});

test("compact mode: platform shows chip not full banner", () => {
  mockHook.mode = "helix_google"; mockHook.externalWiring = "platform";
  render(<AgentModeSelector compact />);
  expect(screen.getByText(/delegation lost/i)).toBeInTheDocument();      // chip text
  expect(screen.queryByText(/per-tool RFC 8693/i)).not.toBeInTheDocument(); // full banner absent
});

test("onChange not called on initial settled render (hydration suppression)", () => {
  const onChange = jest.fn();
  mockHook.mode = "heuristics_helix";
  render(<AgentModeSelector onChange={onChange} />);
  expect(onChange).not.toHaveBeenCalled();
});
