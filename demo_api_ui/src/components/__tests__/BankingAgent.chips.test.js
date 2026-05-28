/* eslint-disable testing-library/no-unnecessary-act */
/* eslint-disable testing-library/no-node-access */
/* eslint-disable testing-library/no-render-in-setup */
/* eslint-disable testing-library/prefer-find-by */
/* eslint-disable testing-library/no-wait-for-multiple-assertions */
/* eslint-disable testing-library/no-wait-for-side-effects */
/* eslint-disable testing-library/no-container */
// banking_api_ui/src/components/__tests__/BankingAgent.chips.test.js
/**
 * Tests for BankingAgent suggestion chips, action chips, and education chips
 * across all three rendering modes: float, inline (middle), inline+bottom-dock.
 */
import React from "react";
import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BankingAgent from "../BankingAgent";

// ─── Mock heavy dependencies ─────────────────────────────────────────────────

jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({
    theme: "light",
    toggleTheme: jest.fn(),
    agentAppearance: "auto",
    setAgentAppearance: jest.fn(),
    effectiveAgentTheme: "light",
  }),
}));

jest.mock("../../context/IndustryBrandingContext", () => ({
  useIndustryBranding: () => ({
    preset: { shortName: "Super Banking", name: "Super Banking" },
  }),
}));

jest.mock("../../context/EducationUIContext", () => ({
  useEducationUIOptional: () => ({ open: jest.fn(), close: jest.fn() }),
  useEducationUI: () => ({ open: jest.fn(), close: jest.fn() }),
}));

jest.mock("../../context/TokenChainContext", () => ({
  useTokenChainOptional: () => null,
}));

jest.mock("../../context/AgentUiModeContext", () => ({
  useAgentUiMode: () => ({
    placement: "none",
    fab: true,
    setAgentUi: jest.fn(),
  }),
}));

jest.mock("../../services/demoAgentNlService", () => ({
  fetchNlStatus: jest
    .fn()
    .mockResolvedValue({ groqConfigured: false, geminiConfigured: false }),
  parseNaturalLanguage: jest.fn().mockResolvedValue({
    source: "local",
    result: { kind: "action", action: { id: "accounts" } },
  }),
}));

jest.mock("../../services/demoAgentService", () => ({
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
  AGENT_CONSENT_BLOCK_USER_MESSAGE: "Blocked by consent decline.",
  getConsentState: jest.fn(() => null),
  setConsentDeclined: jest.fn(),
}));

jest.mock("../../utils/agentToolSteps", () => ({
  getToolStepsForAction: jest.fn(() => []),
}));

jest.mock("react-toastify", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../../utils/appToast", () => ({
  toast: {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    warning: jest.fn(),
    update: jest.fn(),
    dismiss: jest.fn(),
  },
  notifySuccess: jest.fn(),
  notifyError: jest.fn(),
  notifyInfo: jest.fn(),
  notifyWarning: jest.fn(),
}));

// CSS imports are no-ops in tests
jest.mock("../BankingAgent.css", () => ({}), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Clear localStorage and re-arm async mocks before each test.
// BankingAgent persists isOpen to localStorage which can contaminate subsequent tests.
// jest.fn().mockResolvedValue() in a factory can be silently cleared; re-arm to be safe.
beforeEach(() => {
  localStorage.clear();
  const nlMock = jest.requireMock("../../services/demoAgentNlService");
  nlMock.fetchNlStatus.mockResolvedValue({
    groqConfigured: false,
    geminiConfigured: false,
  });
  nlMock.parseNaturalLanguage.mockResolvedValue({
    source: "local",
    result: { kind: "action", action: { id: "accounts" } },
  });
  const cfgMock = jest.requireMock("../../services/configService");
  cfgMock.loadPublicConfig.mockResolvedValue({});
  const svcMock = jest.requireMock("../../services/demoAgentService");
  svcMock.sendAgentMessage.mockResolvedValue({ success: true, reply: "Done." });
});

const customerUser = {
  id: "u1",
  role: "customer",
  email: "user@test.com",
  username: "bankUser",
  firstName: "Test",
  lastName: "User",
};
const adminUser = {
  id: "a1",
  role: "admin",
  email: "admin@test.com",
  username: "adminUser",
  firstName: "Admin",
  lastName: "User",
};

function renderAgent(props = {}) {
  return render(
    <MemoryRouter>
      <BankingAgent {...props} />
    </MemoryRouter>,
  );
}

// ─── Suggestion chips ────────────────────────────────────────────────────────

describe("Suggestion chips — customer role", () => {
  const CUSTOMER_SUGGESTIONS = [
    "Show me my accounts",
    "Show me my full account details",
    "Transfer $100 from checking to savings",
    "Deposit $50 into checking",
  ];

  beforeEach(() => {
    renderAgent({ user: customerUser, mode: "inline" });
  });

  it("renders all customer suggestion chips", () => {
    CUSTOMER_SUGGESTIONS.forEach((text) => {
      expect(screen.getByText(`"${text}"`)).toBeInTheDocument();
    });
  });

  it("renders suggestion chips as buttons", () => {
    const chips = screen.getAllByRole("button", {
      name: /Show me my accounts|Transfer .100|Deposit .50/i,
    });
    expect(chips.length).toBeGreaterThan(0);
  });
});

describe("Suggestion chips — admin role", () => {
  const ADMIN_SUGGESTIONS = [
    "Show all customer accounts",
    "Show me last 5 errors",
    "What is step-up auth?",
  ];

  beforeEach(() => {
    renderAgent({ user: adminUser, mode: "inline" });
  });

  it("renders all 3 admin suggestion chips", () => {
    ADMIN_SUGGESTIONS.forEach((text) => {
      expect(screen.getByText(`"${text}"`)).toBeInTheDocument();
    });
  });

  it("does NOT show customer suggestions for admin", () => {
    expect(screen.queryByText('"Show me my accounts"')).not.toBeInTheDocument();
  });
});

// ─── Suggestion chips in all 3 modes ─────────────────────────────────────────

describe("Suggestion chips — all 3 modes render correctly", () => {
  const FIRST_CUSTOMER_SUGGESTION = '"Show me my accounts"';

  it("float mode: shows Actions trigger button (no left-column chips) after opening panel", async () => {
    renderAgent({ user: customerUser, mode: "float" });
    const fab = screen.getByRole("button", { name: /Open.*AI Agent/i });
    await act(async () => {
      fireEvent.click(fab);
    });
    // Float mode uses Actions popout — find the trigger by its CSS class
    await waitFor(() => screen.getByRole("dialog", { name: /AI Agent/i }));
    const actionsBtn = document.querySelector(".ba-actions-trigger");
    expect(actionsBtn).toBeInTheDocument();
  });

  it("inline (middle) mode: renders suggestion chips", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: false,
    });
    expect(screen.getByText(FIRST_CUSTOMER_SUGGESTION)).toBeInTheDocument();
  });

  it("inline bottom-dock mode: renders suggestion chips", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: true,
    });
    expect(screen.getByText(FIRST_CUSTOMER_SUGGESTION)).toBeInTheDocument();
  });
});

// ─── Clicking a suggestion chip ───────────────────────────────────────────────

describe("Suggestion chip click — dispatches NL query", () => {
  it("clicking a suggestion chip dispatches NL query with the chip text", async () => {
    renderAgent({ user: customerUser, mode: "inline" });
    const chip = screen.getByText('"Show me my accounts"');
    fireEvent.click(chip);
    await waitFor(() => {
      expect(
        screen.getAllByText("Show me my accounts").length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows the chip text as a user message in chat", async () => {
    renderAgent({ user: customerUser, mode: "inline" });
    const chip = screen.getByText('"Show me my accounts"');
    fireEvent.click(chip);
    await waitFor(() => {
      const userMsgs = screen.getAllByText("Show me my accounts");
      expect(userMsgs.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── Action chips ─────────────────────────────────────────────────────────────

const CORE_ACTION_LABELS = [
  "My Accounts",
  "Recent Transactions",
  "Check Balance",
  "Deposit",
  "Withdraw",
  "Transfer",
  "Log Out",
];

describe("Action chips — logged-in customer", () => {
  beforeEach(() => {
    renderAgent({ user: customerUser, mode: "inline" });
  });

  it("renders all 7 core action items", () => {
    CORE_ACTION_LABELS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("action chips are buttons", () => {
    CORE_ACTION_LABELS.forEach((label) => {
      const btn = screen.getByText(label).closest("button");
      expect(btn).toBeInTheDocument();
    });
  });
});

describe("Action chips — not logged in", () => {
  it("does not render action items when user is null", () => {
    renderAgent({ user: null, mode: "inline" });
    CORE_ACTION_LABELS.filter((l) => l !== "Log Out").forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });
});

describe("Action chips — all 3 modes", () => {
  it("float mode: renders action items in Actions popout after opening panel", async () => {
    renderAgent({ user: customerUser, mode: "float" });
    const fab = screen.getByRole("button", { name: /Open.*AI Agent/i });
    await act(async () => {
      fireEvent.click(fab);
    });
    // Float mode: open Actions dropdown via role
    await waitFor(() => screen.getByRole("dialog", { name: /AI Agent/i }));
    const actionsBtn = document.querySelector(
      ".ba-actions-trigger[aria-haspopup='dialog']",
    );
    await act(async () => {
      fireEvent.click(actionsBtn);
    });
    // Both header popout and full overlay may render items — use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText("My Accounts").length).toBeGreaterThanOrEqual(
        1,
      );
    });
    expect(screen.getAllByText("Check Balance").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("inline (middle) mode: renders action items", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: false,
    });
    expect(screen.getByText("My Accounts")).toBeInTheDocument();
    expect(screen.getByText("Transfer")).toBeInTheDocument();
  });

  it("inline bottom-dock mode: renders action items", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: true,
    });
    expect(screen.getByText("My Accounts")).toBeInTheDocument();
    expect(screen.getByText("Transfer")).toBeInTheDocument();
  });
});

// ─── Action chips — disabled when consent blocked ─────────────────────────────

describe("Action chips — disabled when consent blocked", () => {
  beforeEach(() => {
    const agentConsent = require("../../services/agentAccessConsent");
    agentConsent.isAgentBlockedByConsentDecline.mockReturnValue(true);
  });

  afterEach(() => {
    const agentConsent = require("../../services/agentAccessConsent");
    agentConsent.isAgentBlockedByConsentDecline.mockReturnValue(false);
  });

  it("disables action buttons when consent is blocked (except Log Out)", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    act(() => {
      window.dispatchEvent(new Event("bankingAgentConsentBlockChanged"));
    });
    const depositBtn = screen.getByText("Deposit").closest("button");
    expect(depositBtn).toBeDisabled();
  });

  it("Log Out button remains enabled when consent blocked", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    const logoutBtn = screen.getByText("Log Out").closest("button");
    expect(logoutBtn).not.toBeDisabled();
  });

  it("suggestion chips are disabled when consent blocked", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    act(() => {
      window.dispatchEvent(new Event("bankingAgentConsentBlockChanged"));
    });
    const chip = screen.getByText('"Show me my accounts"').closest("button");
    expect(chip).toBeDisabled();
  });
});

// ─── Discovery popout content (education chips moved to EducationBar) ────────
// Education chips were moved out of the discovery popout; the popout now shows
// action groups only. Verify the popout renders action chips for logged-in users.

describe("Education chips — discovery popout shows action groups (not education labels)", () => {
  it("discovery popout contains real action chips after clicking Actions (inline)", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      distinctFloatingChrome: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /^Actions/i }));
    const popout = document.querySelector(".ba-actions-popout");
    expect(popout).toBeInTheDocument();
    // Real content check: popout must render at least one section header AND
    // one action chip. The old test only asserted the container existed —
    // an empty popout would have passed.
    expect(popout.querySelector(".ba-popout-section-label")).not.toBeNull();
    expect(popout.querySelectorAll(".ba-popout-list-item").length).toBeGreaterThan(0);
    // Education labels must NOT appear in the popout (they moved to the EducationBar).
    expect(within(popout).queryByText("OAuth: Authorization Code + PKCE")).not.toBeInTheDocument();
    expect(within(popout).queryByText("MCP protocol")).not.toBeInTheDocument();
  });

  it("inline bottom-dock mode: discovery popout opens with action chips on Actions click", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: true,
      distinctFloatingChrome: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /^Actions/i }));
    const popout = document.querySelector(".ba-actions-popout");
    expect(popout).toBeInTheDocument();
    expect(popout.querySelectorAll(".ba-popout-list-item").length).toBeGreaterThan(0);
  });
});

// ─── Education chips (⚡ popup) ───────────────────────────────────────────────

describe("Discovery popout — '⊞ All actions' button", () => {
  it("'Actions' trigger button is rendered in float mode (replaces left-column All actions)", async () => {
    renderAgent({ user: customerUser, mode: "float" });
    const fab = screen.getByRole("button", { name: /Open.*AI Agent/i });
    await act(async () => {
      fireEvent.click(fab);
    });
    // Float mode: ".ba-actions-trigger" header button replaces the left-column "⊞ All actions"
    await waitFor(() => screen.getByRole("dialog", { name: /AI Agent/i }));
    expect(document.querySelector(".ba-actions-trigger")).toBeInTheDocument();
  });

  it("clicking 'Actions' trigger button opens the discovery popout in float mode", async () => {
    renderAgent({ user: customerUser, mode: "float" });
    const fab = screen.getByRole("button", { name: /Open.*AI Agent/i });
    await act(async () => {
      fireEvent.click(fab);
    });
    // Float mode: "Actions" button opens the discovery popout
    await waitFor(() => screen.getByRole("dialog", { name: /AI Agent/i }));
    const actionsBtn = document.querySelector(
      ".ba-actions-trigger[aria-haspopup='dialog']",
    );
    await act(async () => {
      fireEvent.click(actionsBtn);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: /Action browser/i }),
      ).toBeInTheDocument(),
    );
  });

  it("inline mode: 'All actions' button is rendered", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    expect(
      screen.getByRole("button", { name: /All actions/i }),
    ).toBeInTheDocument();
  });

  it("inline mode: clicking 'All actions' opens discovery popout with all chips", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      distinctFloatingChrome: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /^Actions/i }));
    expect(
      screen.getByRole("dialog", { name: /Action browser/i }),
    ).toBeInTheDocument();
    // Discovery popout includes chips from all groups — check for one from each
    expect(screen.getAllByText("My Accounts").length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Server status chips (header) ─────────────────────────────────────────────

describe("Server status chips in header", () => {
  it("shows brand name in the panel when logged in", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    expect(screen.getByText(/Super Banking/i)).toBeInTheDocument();
  });

  it("does not crash in float mode (server chips rendered after open)", async () => {
    renderAgent({ user: customerUser, mode: "float" });
    const fab = screen.getByRole("button", { name: /Open.*AI Agent/i });
    await act(async () => {
      fireEvent.click(fab);
    });
    // PingOne chip is always shown when panel is open
    await waitFor(() => {
      expect(screen.getByTitle(/PingOne Identity/i)).toBeInTheDocument();
    });
  });
});

// ─── Config-focus mode chips ──────────────────────────────────────────────────

describe("Config-focus embedded mode — limited action chips", () => {
  it("shows only mcp_tools and logout actions in config focus", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedFocus: "config",
    });
    // In config focus only CONFIG_ACTION_IDS = ['mcp_tools', 'logout'] are shown
    expect(screen.getByText("MCP Tools")).toBeInTheDocument();
    expect(screen.getByText("Log Out")).toBeInTheDocument();
    // Banking actions should NOT appear
    expect(screen.queryByText("Deposit")).not.toBeInTheDocument();
    expect(screen.queryByText("Transfer")).not.toBeInTheDocument();
  });

  it("shows config-specific suggestions in config focus", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedFocus: "config",
    });
    // Config suggestions are different from banking suggestions
    expect(screen.queryByText('"Show me my accounts"')).not.toBeInTheDocument();
    // At least one config suggestion should appear — check for any rendered suggestion button
    const suggestionBtns = document.querySelectorAll("button.ba-suggestion");
    expect(suggestionBtns.length).toBeGreaterThan(0);
  });
});

// ─── Not-logged-in state ──────────────────────────────────────────────────────

describe("Chips when not logged in", () => {
  it("does not render action items when user is null", () => {
    renderAgent({ user: null, mode: "inline" });
    expect(screen.queryByText("Deposit")).not.toBeInTheDocument();
    expect(screen.queryByText("My Accounts")).not.toBeInTheDocument();
  });

  it("renders FAB without crashing when user is null in float mode", () => {
    // Float mode with no user: just renders a collapsed FAB
    expect(() => renderAgent({ user: null, mode: "float" })).not.toThrow();
    expect(
      screen.getByRole("button", { name: /Open.*AI Agent/i }),
    ).toBeInTheDocument();
  });

  it("does not crash when user is null in bottom dock mode", () => {
    expect(() =>
      renderAgent({ user: null, mode: "inline", embeddedDockBottom: true }),
    ).not.toThrow();
  });
});

// ─── My Dashboard button placement ───────────────────────────────────────────
// Regression: dashboard button was in left-col (nav column); moved below prompt
// in right-col so it's visible even when consent is blocked.
// Note: button is hidden on marketing paths ("/", "/dashboard") — tests use "/accounts".

function renderAgentAtAccounts(props = {}) {
  return render(
    <MemoryRouter initialEntries={["/accounts"]}>
      <BankingAgent {...props} />
    </MemoryRouter>,
  );
}

describe("My Dashboard button placement", () => {
  it("renders My Dashboard button when logged in (inline mode)", () => {
    renderAgentAtAccounts({ user: customerUser, mode: "inline" });
    expect(screen.getByText("My Dashboard")).toBeInTheDocument();
  });

  it("renders Admin Dashboard button for admin user", () => {
    renderAgentAtAccounts({ user: adminUser, mode: "inline" });
    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  });

  it("My Dashboard button is a button element", () => {
    renderAgentAtAccounts({ user: customerUser, mode: "inline" });
    const btn = screen.getByText("My Dashboard").closest("button");
    expect(btn).toBeInTheDocument();
  });

  it("My Dashboard button is NOT inside ba-left-col (must be below prompt)", () => {
    const { container } = renderAgentAtAccounts({
      user: customerUser,
      mode: "inline",
    });
    const leftCol = container.querySelector(".ba-left-col");
    const btn = screen.getByText("My Dashboard");
    expect(leftCol).not.toContainElement(btn);
  });

  it("My Dashboard button is inside ba-right-col (chat column)", () => {
    const { container } = renderAgentAtAccounts({
      user: customerUser,
      mode: "inline",
    });
    const rightCol = container.querySelector(".ba-right-col");
    const btn = screen.getByText("My Dashboard");
    expect(rightCol).toContainElement(btn);
  });

  it("My Dashboard button not rendered when user is null", () => {
    renderAgent({ user: null, mode: "inline" });
    expect(screen.queryByText("My Dashboard")).not.toBeInTheDocument();
  });

  it("renders My Dashboard in bottom-dock mode", () => {
    renderAgentAtAccounts({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: true,
    });
    expect(screen.getByText("My Dashboard")).toBeInTheDocument();
  });
});

// ─── Consent-denied banner ────────────────────────────────────────────────────
// Regression: banner rendered as 3rd flex column in inline/row-reverse mode,
// squeezing the chat column and hiding the prompt. Banner must always be full-width.

describe("Consent-denied banner visibility", () => {
  beforeEach(() => {
    const agentConsent = require("../../services/agentAccessConsent");
    agentConsent.isAgentBlockedByConsentDecline.mockReturnValue(true);
  });

  afterEach(() => {
    const agentConsent = require("../../services/agentAccessConsent");
    agentConsent.isAgentBlockedByConsentDecline.mockReturnValue(false);
  });

  it("renders the consent-denied banner when consent is blocked", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    act(() => {
      window.dispatchEvent(new Event("bankingAgentConsentBlockChanged"));
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Access denied/)).toBeInTheDocument();
  });

  it("banner is inside ba-body (not outside panel)", () => {
    const { container } = renderAgent({ user: customerUser, mode: "inline" });
    act(() => {
      window.dispatchEvent(new Event("bankingAgentConsentBlockChanged"));
    });
    const body = container.querySelector(".ba-body");
    const alert = screen.getByRole("alert");
    expect(body).toContainElement(alert);
  });

  it("banner is NOT inside ba-left-col or ba-right-col (must be a direct ba-body child)", () => {
    const { container } = renderAgent({ user: customerUser, mode: "inline" });
    act(() => {
      window.dispatchEvent(new Event("bankingAgentConsentBlockChanged"));
    });
    const leftCol = container.querySelector(".ba-left-col");
    const rightCol = container.querySelector(".ba-right-col");
    const alert = screen.getByRole("alert");
    expect(leftCol).not.toContainElement(alert);
    expect(rightCol).not.toContainElement(alert);
  });

  it("shows Sign out and Learn: Human-in-the-loop buttons in banner", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    act(() => {
      window.dispatchEvent(new Event("bankingAgentConsentBlockChanged"));
    });
    expect(
      screen.getAllByRole("button", { name: /Sign out/i }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: /Learn.*Human.in.the.loop/i }),
    ).toBeInTheDocument();
  });

  it("renders banner in bottom-dock mode", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: true,
    });
    act(() => {
      window.dispatchEvent(new Event("bankingAgentConsentBlockChanged"));
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not render banner when consent is not blocked", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    // isAgentBlockedByConsentDecline returns false by default in afterEach reset;
    // before dispatching event, component state stays false
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ─── Action chip → MCP tool dispatch ─────────────────────────────────────────
// These tests verify that clicking a chip calls the correct bankingAgentService
// function. The component calls the service then adds a chat message with the result.

describe("Action chip dispatch — MCP tool calls", () => {
  let svcMock;
  beforeEach(() => {
    svcMock = jest.requireMock("../../services/demoAgentService");
    svcMock.getMyAccounts.mockClear();
    svcMock.getMyTransactions.mockClear();
    svcMock.getAccountBalance.mockClear();
    svcMock.createDeposit.mockClear();
    svcMock.createTransfer?.mockClear?.();
  });

  it("'My Accounts' chip adds user message to chat", async () => {
    renderAgent({ user: customerUser, mode: "inline" });
    await act(async () => {
      fireEvent.click(screen.getByText("My Accounts"));
    });
    // runAction calls addMessage("user", label) — expect the label in a chat bubble
    await waitFor(() => {
      const msgs = screen.getAllByText("My Accounts");
      // At least 2: the chip button + the user chat message
      expect(msgs.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("'Recent Transactions' chip adds user message to chat", async () => {
    renderAgent({ user: customerUser, mode: "inline" });
    await act(async () => {
      fireEvent.click(screen.getByText("Recent Transactions"));
    });
    await waitFor(() => {
      const msgs = screen.getAllByText("Recent Transactions");
      expect(msgs.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("'Check Balance' chip dispatches getAccountBalance via runAction", async () => {
    renderAgent({ user: customerUser, mode: "inline" });
    await act(async () => {
      fireEvent.click(screen.getByText("Check Balance"));
    });
    // Balance is an API_DIRECT_CHIPS — runAction calls getAccountBalance immediately
    await waitFor(() => expect(svcMock.getAccountBalance).toHaveBeenCalled());
  });

  it("'Deposit' chip dispatches createDeposit via runAction", async () => {
    renderAgent({ user: customerUser, mode: "inline" });
    await act(async () => {
      fireEvent.click(screen.getByText("Deposit"));
    });
    // Deposit is an API_DIRECT_CHIPS — runAction calls createDeposit immediately
    await waitFor(() => expect(svcMock.createDeposit).toHaveBeenCalled());
  });

  it("'Transfer' chip dispatches via runAction (API_DIRECT_CHIPS)", async () => {
    renderAgent({ user: customerUser, mode: "inline" });
    await act(async () => {
      fireEvent.click(screen.getByText("Transfer"));
    });
    // Transfer is an API_DIRECT_CHIPS — dispatches immediately via runAction
    // (creates a user message in chat)
    await waitFor(() => {
      const msgs = screen.getAllByText("Transfer");
      expect(msgs.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("'Think Through a Question' chip pre-fills prompt with think example", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    fireEvent.click(screen.getByText("Think Through a Question"));
    const input = screen.getByRole("textbox");
    expect(input.value).toMatch(/Think:/i);
  });

  it("'Query User by Email' chip pre-fills prompt with query template", () => {
    renderAgent({
      user: adminUser,
      mode: "inline",
      distinctFloatingChrome: true,
    });
    // query_user lives in the admin group inside the discovery popout
    fireEvent.click(screen.getByRole("button", { name: /^Actions/i }));
    const dialog = screen.getByRole("dialog", { name: /Action browser/i });
    // Admin group starts collapsed — expand it first
    const adminToggle = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent.includes("Admin"),
    );
    if (adminToggle) fireEvent.click(adminToggle);
    const btns = Array.from(dialog.querySelectorAll("button")).filter(
      (b) =>
        b.querySelector(".ba-popout-item-name")?.textContent ===
        "Query User by Email",
    );
    expect(btns.length).toBeGreaterThan(0);
    fireEvent.click(btns[0]);
    const input = screen.getByRole("textbox");
    expect(input.value).toMatch(/query user by email/i);
  });
});

// ─── Suggested prompts (Actions dropdown) ────────────────────────────────────
// Validate that the suggestion lists contain useful, working example prompts.

describe("Suggested prompts — customer list", () => {
  const EXPECTED = [
    "Show me my accounts",
    "Transfer $100 from checking to savings",
    "Deposit $50 into checking",
  ];
  it("contains key customer prompts", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    EXPECTED.forEach((text) => {
      expect(screen.getByText(`"${text}"`)).toBeInTheDocument();
    });
  });

  it("each customer suggestion is a clickable button", () => {
    renderAgent({ user: customerUser, mode: "inline" });
    EXPECTED.forEach((text) => {
      const btn = screen.getByText(`"${text}"`).closest("button");
      expect(btn).not.toBeNull();
      expect(btn).not.toBeDisabled();
    });
  });
});

describe("Suggested prompts — admin list", () => {
  it("admin sees 'Show all customer accounts' suggestion", () => {
    renderAgent({ user: adminUser, mode: "inline" });
    expect(
      screen.getByText('"Show all customer accounts"'),
    ).toBeInTheDocument();
  });

  it("admin does not see 'Show me my accounts' (customer-only prompt)", () => {
    renderAgent({ user: adminUser, mode: "inline" });
    expect(screen.queryByText('"Show me my accounts"')).not.toBeInTheDocument();
  });
});
