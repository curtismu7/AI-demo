// banking_api_ui/src/utils/__tests__/embeddedAgentFabVisibility.test.js
import {
  isBankingAgentDashboardRoute,
  isDashboardQuickNavRoute,
  shouldShowGlobalFloatingBankingAgentFab,
} from '../embeddedAgentFabVisibility';

const customer = { role: 'customer', id: '1' };
const admin = { role: 'admin', id: 'a1' };

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

describe('isDashboardQuickNavRoute', () => {
  it('matches dashboard homes for any signed-in user', () => {
    expect(isDashboardQuickNavRoute('/', customer)).toBe(true);
    expect(isDashboardQuickNavRoute('/dashboard', customer)).toBe(true);
    expect(isDashboardQuickNavRoute('/admin', admin)).toBe(true);
  });

  it('includes /admin/banking for admins only', () => {
    expect(isDashboardQuickNavRoute('/admin/banking', admin)).toBe(true);
    expect(isDashboardQuickNavRoute('/admin/banking', customer)).toBe(false);
  });

  it('does not match arbitrary tool routes', () => {
    expect(isDashboardQuickNavRoute('/mcp-inspector', admin)).toBe(false);
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

  it('shows FAB when floating and on a dashboard home route', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
        pathname: '/dashboard',
      }),
    ).toBe(true);
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
        pathname: '/',
      }),
    ).toBe(true);
  });

  it('hides FAB on tool routes when floating (dashboard homes only)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
        pathname: '/mcp-inspector',
      }),
    ).toBe(false);
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

  it('hides FAB when mode is legacy both (mutually exclusive layouts)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'both',
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });
});
