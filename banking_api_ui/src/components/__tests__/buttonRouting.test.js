// banking_api_ui/src/components/__tests__/buttonRouting.test.js
/**
 * Routing tests for every navigation button and link across the app.
 * Tests verify: Link destinations, navigate() calls, and window.open calls.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Core mocks ────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Axios — must include create() so bffAxios / apiClient constructors don't throw
jest.mock('axios', () => {
  const instance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  };
  return { default: { ...instance, create: jest.fn(() => instance) }, ...instance, create: jest.fn(() => instance) };
});

// Service-layer mocks — stub at module level to avoid axios.create chain
jest.mock('../../services/bffAxios', () => ({
  get: jest.fn((url) => {
    if (url && url.includes('stats')) {
      return Promise.resolve({ data: { stats: { totalUsers: 1, totalAccounts: 1, totalTransactions: 0 } } });
    }
    if (url && url.includes('activity')) {
      return Promise.resolve({ data: { logs: [] } });
    }
    return Promise.resolve({ data: {} });
  }),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
}));
jest.mock('../../services/apiClient', () => ({
  get: jest.fn(() => Promise.resolve({ data: { lines: [], backend: '', hint: '' } })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
}));
jest.mock('../../services/demoScenarioService', () => ({
  fetchDemoScenario: jest.fn(() => Promise.resolve({
    accounts: [], settings: {}, userData: {}, defaults: null, persistenceNote: null,
  })),
  saveDemoScenario: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../services/sessionResolver', () => ({
  resolveSessionUser: jest.fn(() => Promise.resolve(null)),
}));

// Context mocks
jest.mock('../../context/IndustryBrandingContext', () => ({
  useIndustryBranding: () => ({ preset: { shortName: 'BX Finance', name: 'BX Finance' } }),
}));
jest.mock('../../context/AgentUiModeContext', () => ({
  useAgentUiMode: () => ({ placement: 'none', fab: true, setAgentUi: jest.fn() }),
}));
jest.mock('../../context/EducationUIContext', () => ({
  useEducationUI: () => ({ open: jest.fn(), close: jest.fn() }),
}));
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }),
}));

// Utility mocks
jest.mock('../../utils/appToast', () => ({
  toast: { dismiss: jest.fn(), error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
  notifySuccess: jest.fn(),
  notifyError: jest.fn(),
  notifyWarning: jest.fn(),
  notifyInfo: jest.fn(),
}));
jest.mock('../utils/authUi', () => ({
  navigateToAdminOAuthLogin: jest.fn(),
}), { virtual: true });
jest.mock('../../utils/authUi', () => ({
  navigateToAdminOAuthLogin: jest.fn(),
}));
jest.mock('../../utils/dashboardToast', () => ({
  toastAdminSessionError: jest.fn(),
}));
// (no mock needed — isDashboardQuickNavRoute uses real path matching)

// Sub-component stubs
jest.mock('../AgentUiModeToggle', () => () => null);
jest.mock('../BrandLogo', () => () => null);
jest.mock('../shared/LoadingOverlay', () => () => null);
jest.mock('../TokenChainDisplay', () => () => null);
jest.mock('../AdminSubPageShell', () => ({ children, lead }) => (
  <div>{lead}{children}</div>
));
jest.mock('./education/educationIds', () => ({ EDU: {} }), { virtual: true });
jest.mock('../education/educationIds', () => ({ EDU: {} }));

// ── Shared test state ─────────────────────────────────────────────────────────
const adminUser    = { id: 'a1', role: 'admin',    email: 'admin@test.com' };
const customerUser = { id: 'u1', role: 'customer', email: 'user@test.com' };
const onLogout     = jest.fn();

let windowOpenSpy;
beforeEach(() => {
  mockNavigate.mockClear();
  onLogout.mockClear();
  windowOpenSpy = jest.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
  windowOpenSpy.mockRestore();
});

function renderAt(Component, path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Component {...props} />
    </MemoryRouter>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DashboardQuickNav
// ─────────────────────────────────────────────────────────────────────────────
import DashboardQuickNav from '../DashboardQuickNav';

describe('DashboardQuickNav', () => {
  it('Home link points to /marketing', () => {
    renderAt(DashboardQuickNav, '/dashboard', { user: customerUser });
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/marketing');
  });

  it('Dashboard link points to /dashboard for customer', () => {
    renderAt(DashboardQuickNav, '/dashboard', { user: customerUser });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('Dashboard link points to /admin for admin', () => {
    renderAt(DashboardQuickNav, '/admin', { user: adminUser });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
  });

  it('Banking link (admin only) points to /admin/banking', () => {
    renderAt(DashboardQuickNav, '/admin', { user: adminUser });
    expect(screen.getByRole('link', { name: 'Banking' })).toHaveAttribute('href', '/admin/banking');
  });

  it('Banking link is absent for customers', () => {
    renderAt(DashboardQuickNav, '/dashboard', { user: customerUser });
    expect(screen.queryByRole('link', { name: 'Banking' })).toBeNull();
  });

  it('API button opens /api-traffic in a popout window', () => {
    renderAt(DashboardQuickNav, '/dashboard', { user: customerUser });
    fireEvent.click(screen.getByRole('button', { name: /api/i }));
    expect(windowOpenSpy).toHaveBeenCalledWith('/api-traffic', 'ApiTraffic', expect.any(String));
  });

  it('Logs button opens /logs in a popout window', () => {
    renderAt(DashboardQuickNav, '/dashboard', { user: customerUser });
    fireEvent.click(screen.getByRole('button', { name: /logs/i }));
    expect(windowOpenSpy).toHaveBeenCalledWith('/logs', 'BankingLogs', expect.any(String));
  });

  it('renders nothing when user is null', () => {
    const { container } = renderAt(DashboardQuickNav, '/dashboard', { user: null });
    expect(container.firstChild).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PageNav
// ─────────────────────────────────────────────────────────────────────────────
import PageNav from '../PageNav';

describe('PageNav', () => {
  it('Back button calls navigate(-1)', () => {
    renderAt(PageNav, '/', { user: adminUser, onLogout });
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('Home link points to /admin for admin', () => {
    renderAt(PageNav, '/', { user: adminUser, onLogout });
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/admin');
  });

  it('Home link points to /dashboard for customer', () => {
    renderAt(PageNav, '/', { user: customerUser, onLogout });
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/dashboard');
  });

  it('Log Out button calls onLogout', () => {
    renderAt(PageNav, '/', { user: adminUser, onLogout });
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('Log Out button is absent when no onLogout prop', () => {
    renderAt(PageNav, '/', { user: adminUser });
    expect(screen.queryByRole('button', { name: /log out/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LandingPage — nav + hero quick links
// ─────────────────────────────────────────────────────────────────────────────
import LandingPage from '../LandingPage';

describe('LandingPage', () => {
  it('Application setup nav button navigates to /config', () => {
    renderAt(LandingPage, '/');
    const [setupBtn] = screen.getAllByRole('button').filter(
      b => /application setup/i.test(b.textContent),
    );
    fireEvent.click(setupBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/config');
  });

  it('API quick-link opens /api-traffic in a popout window', () => {
    renderAt(LandingPage, '/');
    const apiBtn = screen.getAllByRole('button').find(b => b.textContent.trim() === 'API');
    fireEvent.click(apiBtn);
    expect(windowOpenSpy).toHaveBeenCalledWith('/api-traffic', 'ApiTraffic', expect.any(String));
  });

  it('Logs quick-link opens /logs in a new tab (not admin OAuth)', () => {
    renderAt(LandingPage, '/');
    const logsBtn = screen.getAllByRole('button').find(b => b.textContent.trim() === 'Logs');
    fireEvent.click(logsBtn);
    expect(windowOpenSpy).toHaveBeenCalledWith('/logs', '_blank');
  });

  it('Demo config quick-link navigates to /demo-data', () => {
    renderAt(LandingPage, '/');
    const demoBtn = screen.getAllByRole('button').find(
      b => /demo config/i.test(b.textContent),
    );
    fireEvent.click(demoBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/demo-data');
  });

  it('Home quick-link navigates to /', () => {
    renderAt(LandingPage, '/marketing');
    const homeBtn = screen.getAllByRole('button').find(
      b => b.textContent.trim() === 'Home',
    );
    fireEvent.click(homeBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OAuthDebugLogViewer — Dashboard link is role-aware (Bug 2 fix)
// ─────────────────────────────────────────────────────────────────────────────
import OAuthDebugLogViewer from '../OAuthDebugLogViewer';

describe('OAuthDebugLogViewer', () => {
  it('← Dashboard link points to /admin for admin users', () => {
    renderAt(OAuthDebugLogViewer, '/oauth-debug-logs', { user: adminUser, onLogout });
    expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/admin');
  });

  it('← Dashboard link points to /dashboard for customer users', () => {
    renderAt(OAuthDebugLogViewer, '/oauth-debug-logs', { user: customerUser, onLogout });
    expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('Configuration link in description points to /config', () => {
    renderAt(OAuthDebugLogViewer, '/oauth-debug-logs', { user: adminUser, onLogout });
    const configLink = screen.getByRole('link', { name: 'Configuration' });
    expect(configLink).toHaveAttribute('href', '/config');
  });

  it('PageNav Back button calls navigate(-1)', () => {
    renderAt(OAuthDebugLogViewer, '/oauth-debug-logs', { user: adminUser, onLogout });
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('PageNav Home link points to /admin for admin', () => {
    renderAt(OAuthDebugLogViewer, '/oauth-debug-logs', { user: adminUser, onLogout });
    const homeLinks = screen.getAllByRole('link', { name: /home/i });
    expect(homeLinks.some(l => l.getAttribute('href') === '/admin')).toBe(true);
  });

  it('PageNav Log Out button calls onLogout', () => {
    renderAt(OAuthDebugLogViewer, '/oauth-debug-logs', { user: adminUser, onLogout });
    fireEvent.click(screen.getAllByRole('button', { name: /log out/i })[0]);
    expect(onLogout).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard (Admin) — quick action Links use client-side routing (Bug 3 fix)
// ─────────────────────────────────────────────────────────────────────────────
import Dashboard from '../Dashboard';

describe('Dashboard (admin) — Quick Actions', () => {
  async function renderDashboard() {
    renderAt(Dashboard, '/admin', { user: adminUser, onLogout });
    await waitFor(() => {
      expect(screen.queryByText('Loading dashboard...')).not.toBeInTheDocument();
    });
  }

  it('View All Activity Logs is a <Link> to /activity', async () => {
    await renderDashboard();
    expect(screen.getByRole('link', { name: /view all activity logs/i }))
      .toHaveAttribute('href', '/activity');
  });

  it('Manage Users is a <Link> to /users', async () => {
    await renderDashboard();
    expect(screen.getByRole('link', { name: /manage users/i }))
      .toHaveAttribute('href', '/users');
  });

  it('Banking admin is a <Link> to /admin/banking', async () => {
    await renderDashboard();
    expect(screen.getByRole('link', { name: /banking admin/i }))
      .toHaveAttribute('href', '/admin/banking');
  });

  it('Manage Accounts is a <Link> to /accounts', async () => {
    await renderDashboard();
    expect(screen.getByRole('link', { name: /manage accounts/i }))
      .toHaveAttribute('href', '/accounts');
  });

  it('View Transactions is a <Link> to /transactions', async () => {
    await renderDashboard();
    expect(screen.getByRole('link', { name: /view transactions/i }))
      .toHaveAttribute('href', '/transactions');
  });

  it('Security Settings is a <Link> to /settings', async () => {
    await renderDashboard();
    expect(screen.getByRole('link', { name: /security settings/i }))
      .toHaveAttribute('href', '/settings');
  });

  it('MCP Inspector is a <Link> to /mcp-inspector', async () => {
    await renderDashboard();
    const links = screen.getAllByRole('link', { name: /mcp inspector/i });
    expect(links.some(l => l.getAttribute('href') === '/mcp-inspector')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DemoDataPage — toolbar
// ─────────────────────────────────────────────────────────────────────────────
import DemoDataPage from '../DemoDataPage';

describe('DemoDataPage', () => {
  it('Back button calls navigate(-1)', () => {
    renderAt(DemoDataPage, '/demo-data', { user: customerUser, onLogout });
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('Dashboard toolbar link points to /dashboard for customer', () => {
    renderAt(DemoDataPage, '/demo-data', { user: customerUser, onLogout });
    const links = screen.getAllByRole('link').filter(
      l => l.getAttribute('href') === '/dashboard',
    );
    expect(links.length).toBeGreaterThan(0);
  });

  it('Dashboard toolbar link points to /admin for admin', () => {
    renderAt(DemoDataPage, '/demo-data', { user: adminUser, onLogout });
    const links = screen.getAllByRole('link').filter(
      l => l.getAttribute('href') === '/admin',
    );
    expect(links.length).toBeGreaterThan(0);
  });

  it('MCP Inspector link points to /mcp-inspector', () => {
    renderAt(DemoDataPage, '/demo-data', { user: customerUser, onLogout });
    expect(screen.getByRole('link', { name: 'MCP Inspector' }))
      .toHaveAttribute('href', '/mcp-inspector');
  });

  it('PingOne config link points to /config', () => {
    renderAt(DemoDataPage, '/demo-data', { user: customerUser, onLogout });
    const configLinks = screen.getAllByRole('link').filter(
      l => l.getAttribute('href') === '/config',
    );
    expect(configLinks.length).toBeGreaterThan(0);
  });

  it('API Traffic button opens /api-traffic in a popout window', () => {
    renderAt(DemoDataPage, '/demo-data', { user: customerUser, onLogout });
    fireEvent.click(screen.getByRole('button', { name: /api traffic/i }));
    expect(windowOpenSpy).toHaveBeenCalledWith('/api-traffic', 'ApiTraffic', expect.any(String));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding — static links
// ─────────────────────────────────────────────────────────────────────────────
import Onboarding from '../Onboarding';

describe('Onboarding', () => {
  it('← Sign in link points to /', () => {
    renderAt(Onboarding, '/onboarding');
    const signinLink = screen.getAllByRole('link').find(
      l => l.getAttribute('href') === '/',
    );
    expect(signinLink).toBeTruthy();
  });

  it('Open Application Configuration link points to /config', () => {
    renderAt(Onboarding, '/onboarding');
    const configLinks = screen.getAllByRole('link').filter(
      l => l.getAttribute('href') === '/config',
    );
    expect(configLinks.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Footer — signed-in user sees Demo config link
// ─────────────────────────────────────────────────────────────────────────────
import Footer from '../Footer';

describe('Footer', () => {
  it('Demo config link points to /demo-data when user is signed in', () => {
    renderAt(Footer, '/', { user: customerUser });
    expect(screen.getByRole('link', { name: /demo config/i }))
      .toHaveAttribute('href', '/demo-data');
  });

  it('Demo config link is absent when no user', () => {
    renderAt(Footer, '/', { user: null });
    expect(screen.queryByRole('link', { name: /demo config/i })).toBeNull();
  });
});
