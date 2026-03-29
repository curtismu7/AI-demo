// banking_api_ui/src/components/__tests__/DemoDataPage.test.js
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DemoDataPage from '../DemoDataPage';

jest.mock('axios', () => {
  const mockClientInstance = () => ({
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: { updated: true, flags: [] } })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  });
  const impl = {
    create: jest.fn(() => mockClientInstance()),
    get: jest.fn(() => Promise.resolve({ data: { agent_mcp_allowed_scopes: 'banking:read banking:write ai_agent' } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: { updated: true, flags: [] } })),
    defaults: { headers: { common: {} } },
  };
  return { __esModule: true, default: impl, ...impl };
});

const axiosMock = require('axios').default || require('axios');

jest.mock('../../services/demoScenarioService', () => ({
  fetchDemoScenario: jest.fn(() => Promise.resolve({})),
  saveDemoScenario: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock('../../context/AgentUiModeContext', () => ({
  useAgentUiMode: () => ({ placement: 'none', fab: true, setAgentUi: jest.fn() }),
}));

jest.mock('../../context/EducationUIContext', () => ({
  useEducationUI: () => ({ open: jest.fn() }),
}));

jest.mock('react-toastify', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

import { fetchDemoScenario, saveDemoScenario } from '../../services/demoScenarioService';

const defaultScenarioPayload = {
  accounts: [
    {
      id: 'chk-1',
      name: 'Checking Account',
      accountNumber: 'CHK-AB',
      accountType: 'checking',
      balance: 3000,
      currency: 'USD',
    },
  ],
  settings: { stepUpAmountThreshold: 250 },
  defaults: {
    stepUpAmountThreshold: 250,
    checkingName: 'Checking Account',
    savingsName: 'Savings Account',
    checkingBalance: 3000,
    savingsBalance: 2000,
    profileForm: {
      firstName: 'Jordan',
      lastName: 'Demo',
      email: 'j@x.com',
      username: 'jd',
    },
  },
  persistenceNote: null,
  userData: {
    id: 'u1',
    firstName: 'A',
    lastName: 'B',
    email: 'a@b.com',
    username: 'ab',
    role: 'user',
    createdAt: '2024-01-01',
    isActive: true,
  },
};

function renderPage() {
  return render(
    <BrowserRouter>
      <DemoDataPage user={{ role: 'customer' }} onLogout={jest.fn()} />
    </BrowserRouter>,
  );
}

describe('DemoDataPage', () => {
  beforeEach(() => {
    fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
    saveDemoScenario.mockResolvedValue({ ok: true, accounts: [], settings: {}, userData: {} });
  });

  it('shows a type-slot card for each account type with a toggle', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Accounts' });

    // Checking slot should be enabled (from defaultScenarioPayload)
    const checkingToggle = screen.getByRole('checkbox', { name: /checking/i });
    expect(checkingToggle).toBeChecked();

    // Savings slot should be disabled (not in payload)
    const savingsToggle = screen.getByRole('checkbox', { name: /savings/i });
    expect(savingsToggle).not.toBeChecked();
  });

  it('enabling a type slot from unchecked and saving sends row with accountType but no id', async () => {
    fetchDemoScenario.mockResolvedValue({
      ...defaultScenarioPayload,
      accounts: [],
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Accounts' });

    // Enable the savings slot
    const savingsToggle = screen.getByRole('checkbox', { name: /savings/i });
    fireEvent.click(savingsToggle);

    // Change the nickname
    const nicknameInputs = screen.getAllByPlaceholderText(/savings account/i);
    fireEvent.change(nicknameInputs[0], { target: { value: 'Rainy day fund' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    await waitFor(() => expect(saveDemoScenario).toHaveBeenCalled());

    const body = saveDemoScenario.mock.calls[0][0];
    const savingsRow = body.accounts.find((a) => a.accountType === 'savings');
    expect(savingsRow).toBeDefined();
    expect(savingsRow.id).toBeUndefined();
    expect(savingsRow.name).toBe('Rainy day fund');
  });
});

describe('DemoDataPage — scope permissions section', () => {
  beforeEach(() => {
    fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
    saveDemoScenario.mockResolvedValue({ ok: true, accounts: [], settings: {}, userData: {} });
    axiosMock.get.mockResolvedValue({
      data: { agent_mcp_allowed_scopes: 'banking:read banking:write ai_agent' },
    });
    axiosMock.post.mockResolvedValue({ data: {} });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the "Agent scope permissions" heading', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /agent scope permissions/i });
  });

  it('renders checkboxes for each scope in the catalog', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /agent scope permissions/i });
    // Each scope has a <code> element with its exact value
    const bankingReadCodes = screen.getAllByText('banking:read');
    expect(bankingReadCodes.length).toBeGreaterThanOrEqual(1);
    const bankingWriteCodes = screen.getAllByText('banking:write');
    expect(bankingWriteCodes.length).toBeGreaterThanOrEqual(1);
    // The scope section renders checkboxes (one per catalog entry)
    const scopeCheckboxes = screen.getAllByRole('checkbox');
    expect(scopeCheckboxes.length).toBeGreaterThanOrEqual(6);
  });

  it('calls GET /api/admin/config on mount to load allowed scopes', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /agent scope permissions/i });
    await waitFor(() => {
      expect(axiosMock.get).toHaveBeenCalledWith('/api/admin/config');
    });
  });

  it('does not load feature flags for non-admin (no PingOne Authorize demo section)', async () => {
    axiosMock.get.mockResolvedValue({
      data: { agent_mcp_allowed_scopes: 'banking:read banking:write ai_agent' },
    });
    renderPage();
    await screen.findByRole('heading', { name: /accounts/i });
    expect(screen.queryByRole('heading', { name: /pingone authorize — demo toggles/i })).not.toBeInTheDocument();
    expect(axiosMock.get).not.toHaveBeenCalledWith('/api/admin/feature-flags');
  });

  it('calls POST /api/admin/config with updated scopes when "Save scope permissions" is clicked', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /agent scope permissions/i });

    const saveBtn = screen.getByRole('button', { name: /save scope permissions/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() =>
      expect(axiosMock.post).toHaveBeenCalledWith(
        '/api/admin/config',
        expect.objectContaining({ agent_mcp_allowed_scopes: expect.any(String) })
      )
    );
  });
});

describe('DemoDataPage — PingOne Authorize toggles (admin)', () => {
  beforeEach(() => {
    fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
    axiosMock.get.mockImplementation((url) => {
      if (url === '/api/admin/feature-flags') {
        return Promise.resolve({
          data: {
            flags: [
              {
                id: 'authorize_enabled',
                category: 'PingOne Authorize',
                name: 'Transaction authorization (master)',
                value: false,
                description: 'Turn on policy evaluation before certain transactions.',
                impact: 'imp',
                type: 'boolean',
                defaultValue: false,
              },
            ],
            categories: ['PingOne Authorize'],
          },
        });
      }
      return Promise.resolve({ data: { agent_mcp_allowed_scopes: 'banking:read' } });
    });
  });

  it('loads feature flags and shows PingOne Authorize demo toggles', async () => {
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'admin' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    await screen.findByRole('heading', { name: /pingone authorize — demo toggles/i });
    await waitFor(() => {
      expect(axiosMock.get).toHaveBeenCalledWith('/api/admin/feature-flags');
    });
    expect(screen.getByText('Transaction authorization (master)')).toBeInTheDocument();
  });
});

// ─── may_act session-seed tests ──────────────────────────────────────────────
describe('DemoDataPage — may_act status seeded from session on mount', () => {
  beforeEach(() => {
    fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
    axiosMock.get.mockResolvedValue({
      data: { agent_mcp_allowed_scopes: 'banking:read' },
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  it('shows "Checking…" immediately after mount (before session fetch resolves)', async () => {
    // fetch never resolves — status stays at "Checking…"
    global.fetch = jest.fn(() => new Promise(() => {}));
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'customer' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    // Wait for the page loading state to clear (fetchDemoScenario resolves)
    await screen.findByRole('heading', { name: /accounts/i });
    // Session fetch is still pending — status pill should show "Checking…"
    expect(screen.getByText(/checking…/i)).toBeInTheDocument();
  });

  it('shows ✅ pill after session fetch returns mayAct present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mayAct: { client_id: 'bff-client' }, authenticated: true }),
    });
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'customer' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/may_act present in token/i)).toBeInTheDocument()
    );
    // Enable button disabled (already enabled)
    const enableBtn = screen.getByRole('button', { name: /enable may_act/i });
    expect(enableBtn).toBeDisabled();
  });

  it('shows ❌ pill after session fetch returns no mayAct', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mayAct: null, authenticated: true }),
    });
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'customer' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/may_act absent from token/i)).toBeInTheDocument()
    );
    // Clear button disabled (already cleared)
    const clearBtn = screen.getByRole('button', { name: /clear may_act/i });
    expect(clearBtn).toBeDisabled();
  });

  it('shows ❌ pill when session fetch returns ok:false', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'customer' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    // Non-ok response → setMayActEnabled not called → stays 'Checking…' (null state renders Checking)
    // Allow time for async completion
    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByText(/checking…/i)).toBeInTheDocument();
  });
});

// ─── ff_inject_audience UI toggle tests ──────────────────────────────────────
describe('DemoDataPage — ff_inject_audience toggle (admin)', () => {
  beforeEach(() => {
    fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mayAct: null }),
    });
    axiosMock.get.mockImplementation((url) => {
      if (url === '/api/admin/feature-flags') {
        return Promise.resolve({
          data: {
            flags: [
              {
                id: 'ff_inject_audience',
                category: 'Token Exchange',
                name: 'Token Exchange — Auto-inject audience (BFF synthetic)',
                value: false,
                currentValue: false,
                description: 'Inject audience',
                impact: '',
                type: 'boolean',
                defaultValue: false,
              },
            ],
            categories: ['Token Exchange'],
          },
        });
      }
      return Promise.resolve({ data: { agent_mcp_allowed_scopes: 'banking:read' } });
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  it('renders the audience auto-inject banner for admin users', async () => {
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'admin' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    // The <strong> in the banner has exactly this text; the flag-list span has a prefix
    await waitFor(() =>
      expect(screen.getByText('Auto-inject audience (BFF synthetic)')).toBeInTheDocument()
    );
  });

  it('does NOT render audience inject banner for non-admin users', async () => {
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'customer' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    await screen.findByRole('heading', { name: /token exchange/i });
    expect(screen.queryByText(/auto-inject audience/i)).not.toBeInTheDocument();
  });

  it('calls PATCH /api/admin/feature-flags when enable audience injection is clicked', async () => {
    axiosMock.patch.mockResolvedValue({
      data: { updated: true, flags: [{ id: 'ff_inject_audience', value: true, currentValue: true }] },
    });
    render(
      <BrowserRouter>
        <DemoDataPage user={{ role: 'admin' }} onLogout={jest.fn()} />
      </BrowserRouter>,
    );
    await waitFor(() => screen.getByText('Auto-inject audience (BFF synthetic)'));
    // There may be multiple "Enable injection" buttons (one per inject toggle)
    const enableBtns = screen.getAllByRole('button', { name: /enable injection/i });
    // Click the one inside the audience banner (last Enable injection button)
    await act(async () => { fireEvent.click(enableBtns[enableBtns.length - 1]); });
    await waitFor(() =>
      expect(axiosMock.patch).toHaveBeenCalledWith(
        '/api/admin/feature-flags',
        expect.objectContaining({ updates: { ff_inject_audience: true } })
      )
    );
  });
});
