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
  it('hides FAB when not logged in', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: null,
        placement: 'bottom',
        fab: false,
        pathname: '/',
      }),
    ).toBe(false);
  });

  it('shows FAB when float-only on dashboard home routes', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        placement: 'none',
        fab: true,
        pathname: '/dashboard',
      }),
    ).toBe(true);
  });

  it('shows FAB when middle or bottom with + FAB', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        placement: 'middle',
        fab: true,
        pathname: '/dashboard',
      }),
    ).toBe(true);
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        placement: 'bottom',
        fab: true,
        pathname: '/',
      }),
    ).toBe(true);
  });

  it('hides FAB on tool routes', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        placement: 'none',
        fab: true,
        pathname: '/mcp-inspector',
      }),
    ).toBe(false);
  });

  it('hides FAB when embedded bottom without + FAB', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        placement: 'bottom',
        fab: false,
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });

  it('hides FAB on /config when float-only (dashboard homes only)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        placement: 'none',
        fab: true,
        pathname: '/config',
      }),
    ).toBe(false);
  });

  it('hides FAB when middle without + FAB', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        placement: 'middle',
        fab: false,
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });
});
