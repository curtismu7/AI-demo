// banking_api_ui/src/components/__tests__/BankingAgent.chips.test.js
/**
 * Tests for BankingAgent suggestion chips, action chips, and education chips
 * across all three rendering modes: float, inline (middle), inline+bottom-dock.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BankingAgent from '../BankingAgent';

// ─── Mock heavy dependencies ─────────────────────────────────────────────────

jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: jest.fn(),
    agentAppearance: 'auto',
    setAgentAppearance: jest.fn(),
    effectiveAgentTheme: 'light',
  }),
}));

jest.mock('../../context/IndustryBrandingContext', () => ({
  useIndustryBranding: () => ({
    preset: { shortName: 'BX Finance', name: 'BX Finance' },
  }),
}));

jest.mock('../../context/EducationUIContext', () => ({
  useEducationUIOptional: () => ({ open: jest.fn(), close: jest.fn() }),
  useEducationUI: () => ({ open: jest.fn(), close: jest.fn() }),
}));

jest.mock('../../context/TokenChainContext', () => ({
  useTokenChainOptional: () => null,
}));

jest.mock('../../context/AgentUiModeContext', () => ({
  useAgentUiMode: () => ({ placement: 'none', fab: true, setAgentUi: jest.fn() }),
}));

jest.mock('../../services/bankingAgentNlService', () => ({
  fetchNlStatus: jest.fn().mockResolvedValue({ groqConfigured: false, geminiConfigured: false }),
  parseNaturalLanguage: jest.fn().mockResolvedValue({
    source: 'local',
    result: { kind: 'action', action: { id: 'accounts' } },
  }),
}));

jest.mock('../../services/bankingAgentService', () => ({
  getMyAccounts:       jest.fn().mockResolvedValue([]),
  getAccountBalance:   jest.fn().mockResolvedValue({ balance: 100 }),
  getMyTransactions:   jest.fn().mockResolvedValue([]),
  createTransfer:      jest.fn().mockResolvedValue({ success: true }),
  createDeposit:       jest.fn().mockResolvedValue({ success: true }),
  createWithdrawal:    jest.fn().mockResolvedValue({ success: true }),
  refreshOAuthSession: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/configService', () => ({
  loadPublicConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/agentAccessConsent', () => ({
  isAgentBlockedByConsentDecline: jest.fn(() => false),
  setAgentBlockedByConsentDecline: jest.fn(),
  AGENT_CONSENT_BLOCK_USER_MESSAGE: 'Blocked by consent decline.',
  getConsentState: jest.fn(() => null),
  setConsentDeclined: jest.fn(),
}));

jest.mock('../../utils/agentToolSteps', () => ({
  getToolStepsForAction: jest.fn(() => []),
}));

jest.mock('../../utils/bankingAgentFloatingDefaultOpen', () => ({
  // Float panel starts CLOSED in tests so effects only fire after explicit FAB click
  isBankingAgentFloatingDefaultOpen: jest.fn(() => false),
}));

jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../utils/appToast', () => ({
  toast: jest.fn(),
  notifySuccess: jest.fn(),
  notifyError: jest.fn(),
  notifyInfo: jest.fn(),
  notifyWarning: jest.fn(),
}));

// CSS imports are no-ops in tests
jest.mock('../BankingAgent.css', () => ({}), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Clear localStorage and re-arm async mocks before each test.
// BankingAgent persists isOpen to localStorage which can contaminate subsequent tests.
// jest.fn().mockResolvedValue() in a factory can be silently cleared; re-arm to be safe.
beforeEach(() => {
  localStorage.clear();
  const nlMock  = jest.requireMock('../../services/bankingAgentNlService');
  nlMock.fetchNlStatus.mockResolvedValue({ groqConfigured: false, geminiConfigured: false });
  nlMock.parseNaturalLanguage.mockResolvedValue({
    source: 'local',
    result: { kind: 'action', action: { id: 'accounts' } },
  });
  const cfgMock = jest.requireMock('../../services/configService');
  cfgMock.loadPublicConfig.mockResolvedValue({});
});

const customerUser = { id: 'u1', role: 'customer', email: 'user@test.com', username: 'bankUser', firstName: 'Test', lastName: 'User' };
const adminUser    = { id: 'a1', role: 'admin',    email: 'admin@test.com', username: 'adminUser', firstName: 'Admin', lastName: 'User' };

function renderAgent(props = {}) {
  return render(
    <MemoryRouter>
      <BankingAgent {...props} />
    </MemoryRouter>
  );
}

// ─── Suggestion chips ────────────────────────────────────────────────────────

describe('Suggestion chips — customer role', () => {
  const CUSTOMER_SUGGESTIONS = [
    'Show me my accounts',
    'Transfer $100 to savings',
    'Deposit $50 into checking',
  ];

  beforeEach(() => {
    renderAgent({ user: customerUser, mode: 'inline' });
  });

  it('renders all 3 customer suggestion chips', () => {
    CUSTOMER_SUGGESTIONS.forEach(text => {
      expect(screen.getByText(`"${text}"`)).toBeInTheDocument();
    });
  });

  it('renders suggestion chips as buttons', () => {
    const chips = screen.getAllByRole('button', { name: /Show me my accounts|Transfer .100|Deposit .50/i });
    expect(chips.length).toBeGreaterThan(0);
  });
});

describe('Suggestion chips — admin role', () => {
  const ADMIN_SUGGESTIONS = [
    'Show all customer accounts',
    'Show me last 5 errors',
    'What is step-up auth?',
  ];

  beforeEach(() => {
    renderAgent({ user: adminUser, mode: 'inline' });
  });

  it('renders all 3 admin suggestion chips', () => {
    ADMIN_SUGGESTIONS.forEach(text => {
      expect(screen.getByText(`"${text}"`)).toBeInTheDocument();
    });
  });

  it('does NOT show customer suggestions for admin', () => {
    expect(screen.queryByText('"Show me my accounts"')).not.toBeInTheDocument();
  });
});

// ─── Suggestion chips in all 3 modes ─────────────────────────────────────────

describe('Suggestion chips — all 3 modes render correctly', () => {
  const FIRST_CUSTOMER_SUGGESTION = '"Show me my accounts"';

  it('float mode: renders suggestion chips after opening panel', async () => {
    renderAgent({ user: customerUser, mode: 'float' });
    const fab = screen.getByRole('button', { name: /Open.*AI Agent/i });
    await act(async () => { fireEvent.click(fab); });
    await waitFor(() => {
      expect(screen.getByText(FIRST_CUSTOMER_SUGGESTION)).toBeInTheDocument();
    });
  });

  it('inline (middle) mode: renders suggestion chips', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedDockBottom: false });
    expect(screen.getByText(FIRST_CUSTOMER_SUGGESTION)).toBeInTheDocument();
  });

  it('inline bottom-dock mode: renders suggestion chips', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedDockBottom: true });
    expect(screen.getByText(FIRST_CUSTOMER_SUGGESTION)).toBeInTheDocument();
  });
});

// ─── Clicking a suggestion chip ───────────────────────────────────────────────

describe('Suggestion chip click — dispatches NL query', () => {
  it('calls parseNaturalLanguage with the chip text when logged in', async () => {
    const { parseNaturalLanguage } = jest.requireMock('../../services/bankingAgentNlService');
    parseNaturalLanguage.mockClear();
    renderAgent({ user: customerUser, mode: 'inline' });
    const chip = screen.getByText('"Show me my accounts"');
    fireEvent.click(chip);
    await waitFor(() => {
      expect(parseNaturalLanguage).toHaveBeenCalledWith('Show me my accounts');
    });
  });

  it('shows the chip text as a user message in chat', async () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    const chip = screen.getByText('"Show me my accounts"');
    fireEvent.click(chip);
    // The chat messages area will show the user message
    await waitFor(() => {
      const userMsgs = screen.getAllByText('Show me my accounts');
      // One instance is the chip label, another is the message bubble
      expect(userMsgs.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── Action chips ─────────────────────────────────────────────────────────────

const CORE_ACTION_LABELS = [
  '🏦 My Accounts',
  '📋 Recent Transactions',
  '💰 Check Balance',
  '⬇ Deposit',
  '⬆ Withdraw',
  '↔ Transfer',
  '🔧 MCP Tools',
  '🚪 Log Out',
];

describe('Action chips — logged-in customer', () => {
  beforeEach(() => {
    renderAgent({ user: customerUser, mode: 'inline' });
  });

  it('renders all 8 core action items', () => {
    CORE_ACTION_LABELS.forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('action chips are buttons', () => {
    CORE_ACTION_LABELS.forEach(label => {
      const btn = screen.getByText(label).closest('button');
      expect(btn).toBeInTheDocument();
    });
  });
});

describe('Action chips — not logged in', () => {
  it('does not render action items when user is null', () => {
    renderAgent({ user: null, mode: 'inline' });
    CORE_ACTION_LABELS.filter(l => l !== '🚪 Log Out').forEach(label => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });
});

describe('Action chips — all 3 modes', () => {
  it('float mode: renders action items after opening panel', async () => {
    renderAgent({ user: customerUser, mode: 'float' });
    const fab = screen.getByRole('button', { name: /Open.*AI Agent/i });
    await act(async () => { fireEvent.click(fab); });
    await waitFor(() => {
      expect(screen.getByText('🏦 My Accounts')).toBeInTheDocument();
    });
    expect(screen.getByText('⬇ Deposit')).toBeInTheDocument();
  });

  it('inline (middle) mode: renders action items', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedDockBottom: false });
    expect(screen.getByText('🏦 My Accounts')).toBeInTheDocument();
    expect(screen.getByText('↔ Transfer')).toBeInTheDocument();
  });

  it('inline bottom-dock mode: renders action items', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedDockBottom: true });
    expect(screen.getByText('🏦 My Accounts')).toBeInTheDocument();
    expect(screen.getByText('↔ Transfer')).toBeInTheDocument();
  });
});

// ─── Action chips — disabled when consent blocked ─────────────────────────────

describe('Action chips — disabled when consent blocked', () => {
  beforeEach(() => {
    const agentConsent = require('../../services/agentAccessConsent');
    agentConsent.isAgentBlockedByConsentDecline.mockReturnValue(true);
  });

  afterEach(() => {
    const agentConsent = require('../../services/agentAccessConsent');
    agentConsent.isAgentBlockedByConsentDecline.mockReturnValue(false);
  });

  it('disables action buttons when consent is blocked (except Log Out)', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    act(() => {
      window.dispatchEvent(new Event('bankingAgentConsentBlockChanged'));
    });
    const depositBtn = screen.getByText('⬇ Deposit').closest('button');
    expect(depositBtn).toBeDisabled();
  });

  it('Log Out button remains enabled when consent blocked', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    const logoutBtn = screen.getByText('🚪 Log Out').closest('button');
    expect(logoutBtn).not.toBeDisabled();
  });

  it('suggestion chips are disabled when consent blocked', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    act(() => {
      window.dispatchEvent(new Event('bankingAgentConsentBlockChanged'));
    });
    const chip = screen.getByText('"Show me my accounts"').closest('button');
    expect(chip).toBeDisabled();
  });
});

// ─── Education chips (left column) ───────────────────────────────────────────

const EDUCATION_LABELS = [
  'OAuth: Authorization Code + PKCE',
  'OAuth: Token exchange (RFC 8693)',
  'MCP protocol',
  'Token introspection (RFC 7662)',
  'may_act / act claims',
  '⭐ AI Agent Best Practices',
];

describe('Education chips — left column (logged in)', () => {
  beforeEach(() => {
    renderAgent({ user: customerUser, mode: 'inline' });
  });

  it('renders education topic buttons in left column', () => {
    EDUCATION_LABELS.forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('education items are buttons', () => {
    EDUCATION_LABELS.forEach(label => {
      const btn = screen.getByText(label).closest('button');
      expect(btn).not.toBeNull();
    });
  });
});

describe('Education chips — all 3 modes', () => {
  it('float mode: shows education items after opening panel', async () => {
    renderAgent({ user: customerUser, mode: 'float' });
    const fab = screen.getByRole('button', { name: /Open.*AI Agent/i });
    await act(async () => { fireEvent.click(fab); });
    await waitFor(() => {
      expect(screen.getByText('OAuth: Authorization Code + PKCE')).toBeInTheDocument();
    });
  });

  it('inline (middle) mode: shows education items', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedDockBottom: false });
    expect(screen.getByText('OAuth: Authorization Code + PKCE')).toBeInTheDocument();
  });

  it('inline bottom-dock mode: shows education items', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedDockBottom: true });
    expect(screen.getByText('OAuth: Authorization Code + PKCE')).toBeInTheDocument();
  });
});

// ─── Education chips — openEducationCommand called ────────────────────────────

describe('Education chips — clicking opens panel', () => {
  it('renders MCP protocol education chip and it is clickable', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    const mcpBtn = screen.getByText('MCP protocol');
    expect(mcpBtn).toBeInTheDocument();
    // Should not throw
    fireEvent.click(mcpBtn);
  });

  it('renders Token Exchange education chip', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    expect(screen.getByText('OAuth: Token exchange (RFC 8693)')).toBeInTheDocument();
  });
});

// ─── Education chips (⚡ popup) ───────────────────────────────────────────────

describe('Education popup chips (⚡ button)', () => {
  it('⚡ button is rendered when logged in (float mode, panel open)', async () => {
    renderAgent({ user: customerUser, mode: 'float' });
    const fab = screen.getByRole('button', { name: /Open.*AI Agent/i });
    await act(async () => { fireEvent.click(fab); });
    await waitFor(() => {
      expect(screen.getByTitle(/Learn.*Explore/i)).toBeInTheDocument();
    });
  });

  it('clicking ⚡ opens the popup with Learn & Explore chips (float)', async () => {
    renderAgent({ user: customerUser, mode: 'float' });
    const fab = screen.getByRole('button', { name: /Open.*AI Agent/i });
    await act(async () => { fireEvent.click(fab); });
    await waitFor(() => screen.getByTitle(/Learn.*Explore/i));
    fireEvent.click(screen.getByTitle(/Learn.*Explore/i));
    // After clicking, ⚡ popup section appears — education items appear twice (left col + popup)
    const pkceMatches = screen.getAllByText('OAuth: Authorization Code + PKCE');
    expect(pkceMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('inline mode: ⚡ button is rendered', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    const bolt = screen.getByTitle(/Learn.*Explore/i);
    expect(bolt).toBeInTheDocument();
  });

  it('inline mode: clicking ⚡ shows popup chips alongside left-column chips', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    const bolt = screen.getByTitle(/Learn.*Explore/i);
    fireEvent.click(bolt);
    const pkceMatches = screen.getAllByText('OAuth: Authorization Code + PKCE');
    // Left col + popup = 2 occurrences
    expect(pkceMatches.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Server status chips (header) ─────────────────────────────────────────────

describe('Server status chips in header', () => {
  it('shows brand name in the panel when logged in', () => {
    renderAgent({ user: customerUser, mode: 'inline' });
    expect(screen.getByText(/BX Finance/i)).toBeInTheDocument();
  });

  it('does not crash in float mode (server chips rendered after open)', async () => {
    renderAgent({ user: customerUser, mode: 'float' });
    const fab = screen.getByRole('button', { name: /Open.*AI Agent/i });
    await act(async () => { fireEvent.click(fab); });
    // PingOne chip is always shown when panel is open
    await waitFor(() => {
      expect(screen.getByTitle(/PingOne Identity/i)).toBeInTheDocument();
    });
  });
});

// ─── Config-focus mode chips ──────────────────────────────────────────────────

describe('Config-focus embedded mode — limited action chips', () => {
  it('shows only mcp_tools and logout actions in config focus', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedFocus: 'config' });
    // In config focus only CONFIG_ACTION_IDS = ['mcp_tools', 'logout'] are shown
    expect(screen.getByText('🔧 MCP Tools')).toBeInTheDocument();
    expect(screen.getByText('🚪 Log Out')).toBeInTheDocument();
    // Banking actions should NOT appear
    expect(screen.queryByText('⬇ Deposit')).not.toBeInTheDocument();
    expect(screen.queryByText('↔ Transfer')).not.toBeInTheDocument();
  });

  it('shows config-specific suggestions in config focus', () => {
    renderAgent({ user: customerUser, mode: 'inline', embeddedFocus: 'config' });
    // Config suggestions are different from banking suggestions
    expect(screen.queryByText('"Show me my accounts"')).not.toBeInTheDocument();
    // At least one config suggestion should appear — check for any rendered suggestion button
    const suggestionBtns = document.querySelectorAll('button.ba-suggestion');
    expect(suggestionBtns.length).toBeGreaterThan(0);
  });
});

// ─── Not-logged-in state ──────────────────────────────────────────────────────

describe('Chips when not logged in', () => {
  it('does not render action items when user is null', () => {
    renderAgent({ user: null, mode: 'inline' });
    expect(screen.queryByText('⬇ Deposit')).not.toBeInTheDocument();
    expect(screen.queryByText('🏦 My Accounts')).not.toBeInTheDocument();
  });

  it('renders FAB without crashing when user is null in float mode', () => {
    // Float mode with no user: just renders a collapsed FAB
    expect(() => renderAgent({ user: null, mode: 'float' })).not.toThrow();
    expect(screen.getByRole('button', { name: /Open.*AI Agent/i })).toBeInTheDocument();
  });

  it('does not crash when user is null in bottom dock mode', () => {
    expect(() => renderAgent({ user: null, mode: 'inline', embeddedDockBottom: true })).not.toThrow();
  });
});
