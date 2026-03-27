// banking_api_ui/src/utils/__tests__/embeddedAgentFabVisibility.test.js
import {
  isBankingAgentDashboardRoute,
  shouldShowGlobalFloatingBankingAgentFab,
} from '../embeddedAgentFabVisibility';

const customer = { role: 'customer', id: '1' };

describe('isBankingAgentDashboardRoute', () => {
  it('matches home dashboards only', () => {
    expect(isBankingAgentDashboardRoute('/')).toBe(true);
    expect(isBankingAgentDashboardRoute('/admin')).toBe(true);
    expect(isBankingAgentDashboardRoute('/dashboard')).toBe(true);
    expect(isBankingAgentDashboardRoute('/admin/')).toBe(true);
    expect(isBankingAgentDashboardRoute('/demo-data')).toBe(false);
    expect(isBankingAgentDashboardRoute('/mcp-inspector')).toBe(false);
  });
});

describe('shouldShowGlobalFloatingBankingAgentFab', () => {
  it('hides FAB when not logged in with embedded mode', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: null,
        agentUiMode: 'embedded',
        pathname: '/',
      }),
    ).toBe(false);
  });

  it('shows FAB when mode is floating on non-demo-data routes', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
        pathname: '/mcp-inspector',
      }),
    ).toBe(true);
  });

  it('hides FAB on Demo config even when floating', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
        pathname: '/demo-data',
      }),
    ).toBe(false);
  });

  it('hides FAB on dashboard routes when embedded', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });

  it('hides FAB on non-dashboard routes when embedded (e.g. logs — dock is dashboard-only)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
        pathname: '/logs',
      }),
    ).toBe(false);
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
        pathname: '/mcp-inspector',
      }),
    ).toBe(false);
  });

  it('hides FAB on Demo config when embedded', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
        pathname: '/demo-data',
      }),
    ).toBe(false);
  });

  it('shows FAB when mode is both', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'both',
        pathname: '/dashboard',
      }),
    ).toBe(true);
  });
});
