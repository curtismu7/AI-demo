/**
 * Tests that the agent greeting is replaced with the vertical manifest greeting
 * when themeAgent resolves asynchronously after the initial render.
 *
 * Regression: Great Buy vertical showed "I can check your balances, move money
 * between accounts…" (banking default) because the manifest loaded after the
 * user prop arrived, and the prev.length===0 guard prevented the update.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import BankingAgent from "../BankingAgent";

const customerUser = {
  id: "u1",
  role: "customer",
  email: "user@test.com",
  username: "demoUser",
  firstName: "Demo",
};

// Shared mock state so tests can change themeAgent between renders
let mockThemeAgent = null;

jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({
    theme: "light",
    toggleTheme: jest.fn(),
    agentAppearance: "auto",
    setAgentAppearance: jest.fn(),
    effectiveAgentTheme: "light",
    agent: mockThemeAgent,
    manifest: mockThemeAgent ? { agent: mockThemeAgent, terminology: {}, id: "test" } : null,
  }),
}));

jest.mock("../../context/IndustryBrandingContext", () => ({
  useIndustryBranding: () => ({ preset: { shortName: "Great Buy", name: "Great Buy" } }),
}));
jest.mock("../../context/EducationUIContext", () => ({
  useEducationUIOptional: () => ({ open: jest.fn(), close: jest.fn() }),
  useEducationUI: () => ({ open: jest.fn(), close: jest.fn() }),
}));
jest.mock("../../context/TokenChainContext", () => ({
  useTokenChainOptional: () => null,
}));
jest.mock("../../context/AgentUiModeContext", () => ({
  useAgentUiMode: () => ({ placement: "none", fab: true, setAgentUi: jest.fn() }),
}));
jest.mock("../../services/bankingAgentNlService", () => ({
  fetchNlStatus: jest.fn().mockResolvedValue({ groqConfigured: false, geminiConfigured: false }),
  parseNaturalLanguage: jest.fn().mockResolvedValue({ source: "local", result: { kind: "action", action: { id: "accounts" } } }),
}));
jest.mock("../../services/bankingAgentService", () => ({
  getMyAccounts: jest.fn().mockResolvedValue([]),
  getAccountBalance: jest.fn().mockResolvedValue({ balance: 100 }),
  getMyTransactions: jest.fn().mockResolvedValue([]),
  createTransfer: jest.fn().mockResolvedValue({ success: true }),
  createDeposit: jest.fn().mockResolvedValue({ success: true }),
  createWithdrawal: jest.fn().mockResolvedValue({ success: true }),
  refreshOAuthSession: jest.fn().mockResolvedValue({}),
  callMcpTool: jest.fn().mockResolvedValue({ success: true }),
  sendAgentMessage: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../../services/configService", () => ({
  loadPublicConfig: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../services/agentAccessConsent", () => ({
  isAgentBlockedByConsentDecline: jest.fn(() => false),
  setAgentBlockedByConsentDecline: jest.fn(),
  AGENT_CONSENT_BLOCK_USER_MESSAGE: "Blocked.",
  getConsentState: jest.fn(() => null),
  setConsentDeclined: jest.fn(),
}));
jest.mock("../../utils/agentToolSteps", () => ({ getToolStepsForAction: jest.fn(() => []) }));
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("../../utils/appToast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn(), warn: jest.fn(), warning: jest.fn(), update: jest.fn(), dismiss: jest.fn() },
  notifySuccess: jest.fn(), notifyError: jest.fn(), notifyInfo: jest.fn(), notifyWarning: jest.fn(),
}));
jest.mock("../BankingAgent.css", () => ({}), { virtual: true });

function renderAgent(props = {}) {
  return render(<MemoryRouter><BankingAgent {...props} /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  mockThemeAgent = null;
  jest.resetModules();
});

test("greeting updates to vertical manifest greeting when themeAgent resolves after initial render", () => {
  // First render: manifest not yet loaded (themeAgent = null) → banking default
  const { rerender } = renderAgent({ user: customerUser, mode: "inline" });
  expect(screen.getByText(/your ai assistant/i)).toBeInTheDocument();

  // Simulate manifest arriving: set themeAgent and re-render
  mockThemeAgent = { greeting: "Hi {name}! Browse our products. What would you like to do?" };
  rerender(<MemoryRouter><BankingAgent user={customerUser} mode="inline" /></MemoryRouter>);

  expect(screen.getByText(/browse our products/i)).toBeInTheDocument();
  expect(screen.queryByText(/check your balances/i)).not.toBeInTheDocument();
});
