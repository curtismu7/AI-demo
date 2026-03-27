// banking_api_ui/src/utils/__tests__/embeddedAgentFabVisibility.test.js
import {
  isBankingAgentDashboardRoute,
  isEmbeddedAgentDockRoute,
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
    expect(isBankingAgentDashboardRoute('/config')).toBe(false);
  });
});

describe('isEmbeddedAgentDockRoute', () => {
  it('includes dashboard homes and Application Configuration', () => {
    expect(isEmbeddedAgentDockRoute('/')).toBe(true);
    expect(isEmbeddedAgentDockRoute('/admin')).toBe(true);
    expect(isEmbeddedAgentDockRoute('/dashboard')).toBe(true);
    expect(isEmbeddedAgentDockRoute('/config')).toBe(true);
    expect(isEmbeddedAgentDockRoute('/config/')).toBe(true);
    expect(isEmbeddedAgentDockRoute('/logs')).toBe(false);
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

  it('shows FAB when both mode on dashboard home routes', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'both',
        pathname: '/dashboard',
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

  it('hides FAB on /config when floating (dock is embedded-only there)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
        pathname: '/config',
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

  it('shows FAB on dashboard when mode is both (FAB + bottom dock; split3 suppression is in App.js)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'both',
        pathname: '/dashboard',
      }),
    ).toBe(true);
  });
});
