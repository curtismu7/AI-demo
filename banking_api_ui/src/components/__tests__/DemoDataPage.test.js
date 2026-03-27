// banking_api_ui/src/components/__tests__/DemoDataPage.test.js
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DemoDataPage from '../DemoDataPage';

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

  it('shows Add account and appends a draft row with type selector and remove', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Accounts' });

    fireEvent.click(screen.getByRole('button', { name: /add account/i }));

    expect(screen.getByRole('combobox', { name: /account type/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/account name/i).length).toBeGreaterThanOrEqual(2);
  });

  it('saveDemoScenario sends new rows without id and with accountType', async () => {
    fetchDemoScenario.mockResolvedValue({
      ...defaultScenarioPayload,
      accounts: [],
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Accounts' });
    expect(fetchDemoScenario).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /add account/i }));
    await screen.findByRole('combobox', { name: /account type/i });

    const accountNameFields = screen.getAllByLabelText(/^account name$/i);
    fireEvent.change(accountNameFields[accountNameFields.length - 1], {
      target: { value: 'Rainy day' },
    });

    fireEvent.change(screen.getByRole('combobox', { name: /account type/i }), {
      target: { value: 'savings' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    await waitFor(() => expect(saveDemoScenario).toHaveBeenCalled());

    const body = saveDemoScenario.mock.calls[0][0];
    const newRows = body.accounts.filter((a) => !a.id);
    expect(newRows).toHaveLength(1);
    expect(newRows[0].accountType).toBe('savings');
    expect(newRows[0].name).toBe('Rainy day');
  });
});
