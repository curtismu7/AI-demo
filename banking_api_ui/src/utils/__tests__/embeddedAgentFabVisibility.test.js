// banking_api_ui/src/utils/__tests__/embeddedAgentFabVisibility.test.js
import { shouldShowGlobalFloatingBankingAgentFab } from '../embeddedAgentFabVisibility';

const customer = { role: 'customer', id: '1' };
const admin = { role: 'admin', id: '2' };

describe('shouldShowGlobalFloatingBankingAgentFab', () => {
  it('shows FAB when not logged in (marketing / login)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: null,
        agentUiMode: 'embedded',
        pathname: '/',
      }),
    ).toBe(true);
  });

  it('shows FAB when mode is floating and user is on dashboard home', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
        pathname: '/dashboard',
      }),
    ).toBe(true);
  });

  it('hides FAB for customer on dashboard home when embedded', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
        pathname: '/dashboard',
      }),
    ).toBe(false);
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
        pathname: '/',
      }),
    ).toBe(false);
  });

  it('shows FAB for customer on non-home routes when embedded (dock not mounted)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
        pathname: '/demo-data',
      }),
    ).toBe(true);
  });

  it('hides FAB for admin on / and /admin when embedded', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: admin,
        agentUiMode: 'embedded',
        pathname: '/',
      }),
    ).toBe(false);
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: admin,
        agentUiMode: 'embedded',
        pathname: '/admin',
      }),
    ).toBe(false);
  });

  it('shows FAB for admin on /config when embedded', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: admin,
        agentUiMode: 'embedded',
        pathname: '/config',
      }),
    ).toBe(true);
  });
});
