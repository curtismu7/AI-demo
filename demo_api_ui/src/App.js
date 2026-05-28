import axios from "axios";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import AdminSideNav from "./components/AdminSideNav";
import AgentFlowDiagramPanel from "./components/AgentFlowDiagramPanel";
import AuditPage from "./components/AuditPage";
import AdminRoute from "./routes/AdminRoute";
import AdminRoutes from "./routes/AdminRoutes";
import CustomerRoutes, { DashboardContent } from "./routes/CustomerRoutes";
import EducationRoutes, { EducationWildcardRoutes } from "./routes/EducationRoutes";
import MonitoringRoutes, {
  ApiTrafficRoute,
  McpTrafficRoute,
  DevToolsRoute,
  SequenceDiagramRoute,
  LogsRoute,
  McpInspectorRoute,
  WebMcpRoute,
  AgentFlowInspectorRoute,
} from "./routes/MonitoringRoutes";
import PublicRoutes, {
  ConfigurePage,
  SelfServicePageRoute,
  PingOneTestPageRoute,
  MFATestPageRoute,
  AuthzTestPageRoute,
  OnboardingRoute,
  AgentPageRoute,
} from "./routes/PublicRoutes";
import BankingAgent from "./components/BankingAgent";
import { resolveEmbeddedFocus } from "./components/demoAgentSafety";
import CIBAPanel from "./components/CIBAPanel";
import CimdSimPanel from "./components/CimdSimPanel";
import ComplianceModalPopout from "./components/ComplianceModalPopout";
import DemoGuidePopout from "./components/DemoGuidePopout";
import Dashboard from "./components/Dashboard";
import LandingPage from "./components/LandingPage";
import DemoServerCheckModal from "./components/DemoServerCheckModal";
import EmbeddedAgentDock from "./components/EmbeddedAgentDock";
import EducationPanelsHost from "./components/education/EducationPanelsHost";
import Footer from "./components/Footer";
import LogoutPage from "./components/LogoutPage";
import LogViewer from "./components/LogViewer";
import MissingCredentialsModal from "./components/MissingCredentialsModal";
import ServerRestartModal from "./components/ServerRestartModal";
import SessionExpiryTimer from "./components/SessionExpiryTimer";
import SessionReauthBanner from "./components/SessionReauthBanner";
import SpinnerHost from "./components/shared/SpinnerHost";
import TopNav from "./components/TopNav";
import DemoTourModal from "./components/tour/DemoTourModal";
import {
  AgentUiModeProvider,
  useAgentUiMode,
} from "./context/AgentUiModeContext";
import { DemoTourProvider } from "./context/DemoTourContext";
import { EducationUIProvider } from "./context/EducationUIContext";
import { ExchangeModeProvider } from "./context/ExchangeModeContext";
import { IndustryBrandingProvider } from "./context/IndustryBrandingContext";
import { SessionTokenProvider } from "./context/SessionTokenContext";
import { SpinnerProvider } from "./context/SpinnerContext";
import { TokenChainProvider } from "./context/TokenChainContext";
import { VerticalProvider } from "./context/VerticalContext";
import { monitorApiHealth } from "./services/bankingRestartNotificationService";
import { useAuth } from "./hooks/useAuth";
import { useAppFlags } from "./hooks/useAppFlags";
import { useServerHealthCheck } from "./hooks/useServerHealthCheck";
import { useOAuthUrlCleanup } from "./hooks/useOAuthUrlCleanup";
import {
  isBankingAgentDashboardRoute,
  isEmbeddedAgentDockRoute,
  isPublicMarketingAgentPath,
  isMonitoringRoute,
} from "./utils/embeddedAgentFabVisibility";
import "./App.css";

// Browser extension interference detection and handling
const setupBrowserExtensionHandling = () => {
  // Monitor for extension-related errors
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Check for browser extension errors
    const message = args.join(" ");
    if (
      message.includes("bootstrap-autofill-overlay.js") ||
      message.includes("Cannot read properties of null (reading 'includes')")
    ) {
      console.warn(
        "[Browser Extension] Detected extension interference:",
        message,
      );
      // Don't let extension errors break our app
      return;
    }
    originalConsoleError.apply(console, args);
  };

  // Add global error handler for extension interference
  const handleGlobalError = (event) => {
    if (
      event.error &&
      event.error.message &&
      event.error.message.includes("bootstrap-autofill-overlay.js")
    ) {
      console.warn(
        "[Browser Extension] Prevented extension error from crashing app",
      );
      event.preventDefault();
      return false;
    }
  };

  window.addEventListener("error", handleGlobalError);

  // Cleanup function
  return () => {
    console.error = originalConsoleError;
    window.removeEventListener("error", handleGlobalError);
  };
};

/**
 * Renders children for admin users.
 * For non-admin logged-in users: shows a modal explaining why + fires a toast, then
 * renders a blank placeholder so the URL stays valid (no silent redirect to /).
 */
/** Page wrapper for /monitoring/agent-flow — opens the Agent Request Flow panel on mount. */
function AgentFlowPage() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("agent-flow-diagram-open"));
  }, []);
  return (
    <div
      style={{
        padding: "2rem",
        color: "var(--text-muted, #888)",
        fontSize: "14px",
      }}
    >
      <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
        🔀 Agent Request Flow
      </h2>
      <p>
        Use the Banking Agent to trigger a tool call — the request flow panel
        will appear automatically.
      </p>
    </div>
  );
}

function AppWithAuth() {
  const fullLocation = useLocation();
  const backgroundLocation = fullLocation.state?.backgroundLocation;
  const { pathname } = useLocation();
  const pathNorm = pathname.replace(/\/$/, "") || "/";
  const isApiTrafficOnlyPage =
    pathNorm === "/api-traffic" ||
    pathNorm === "/logs" ||
    pathNorm === "/agent";
  const { placement: agentPlacement, fab: agentFab, surfaceHostEl } = useAgentUiMode();

  const { user, loading, logout, sessionReauth, setSessionReauth } = useAuth();
  const { appFlags } = useAppFlags();
  const { downServers, setDownServers } = useServerHealthCheck();
  useOAuthUrlCleanup();

  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState(null);

  // Setup browser extension interference handling
  useEffect(() => {
    const cleanup = setupBrowserExtensionHandling();
    return cleanup;
  }, []);

  // Initialize server restart notification monitoring
  useEffect(() => {
    monitorApiHealth();
  }, []);

  // Clear old page content on route change — scroll to top before paint
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector(".main-content");
    if (main) main.scrollTop = 0;
  }, [pathname]);

  // Listen for missing_credentials events (dispatched by API error handling)
  useEffect(() => {
    const onMissingCreds = (e) => {
      const d = e.detail;
      if (!d || !d.missingFields?.length) return;
      setCredentialsModal({
        missingFields: d.missingFields,
        credentialType: d.credentialType,
        message: d.message,
      });
    };
    window.addEventListener("missing-credentials", onMissingCreds);
    return () =>
      window.removeEventListener("missing-credentials", onMissingCreds);
  }, []);

  /** Nav rail / layout flags — computed declaratively so React className is always in sync. */
  const isOnDashboard = pathname === "/dashboard";

  /** Floating agent: dashboard homes only. Embedded dock: those routes plus `/config` (setup-focused assistant). */
  const onDashboardAgentRoute = isBankingAgentDashboardRoute(pathname);
  const onEmbeddedDockRoute = isEmbeddedAgentDockRoute(pathname);

  // Routes where UserDashboard is rendered (handles its own middle FAB + split layout and its own bottom dock).
  // Admin uses Dashboard.js on /admin — those routes need the global float/dock from App.
  // / now renders LandingPage for non-admin logged-in users; UserDashboard lives at /dashboard.
  const onUserDashboardRoute = Boolean(user) && pathname === "/dashboard";

  // Landing home (/): show floating agent even when signed out.
  // Suppress float on signed-in / only when UserDashboard owns middle placement.
  const marketingAgentSurface = isPublicMarketingAgentPath(pathname) && !user;

  // Landing /: always show float agent, never bottom dock.
  const hasEmbeddedDockLayout =
    Boolean(user) && agentPlacement === "bottom" && onEmbeddedDockRoute;

  const onMonitoringRoute = isMonitoringRoute(pathname);

  const agentDisabled = appFlags.agentUiMode === "disabled";

  const showFloatingAgent =
    !agentDisabled &&
    !isApiTrafficOnlyPage &&
    (!hasEmbeddedDockLayout ||
      onMonitoringRoute ||
      (Boolean(user) && agentFab && onDashboardAgentRoute)) &&
    (marketingAgentSurface ||
      (Boolean(user) && agentPlacement === "none") ||
      (Boolean(user) && onMonitoringRoute) ||
      (Boolean(user) &&
        agentPlacement !== "none" &&
        onDashboardAgentRoute &&
        !(agentPlacement === "middle" && onUserDashboardRoute)));

  /** Single <BankingAgent> portals into the bottom dock host element when present; falls back to document.body otherwise. */
  const shouldMountSingleAgent = showFloatingAgent || hasEmbeddedDockLayout;

  // When the single agent is portaled into the bottom dock host it must wear
  // the dock's inline chrome (no floating frame/drag), exactly as the old
  // per-dock <BankingAgent mode="inline" embeddedDockBottom> did. Float and
  // all other surfaces keep the default floating chrome.
  const singleAgentSurfaceProps = hasEmbeddedDockLayout
    ? { mode: "inline", embeddedDockBottom: true }
    : {};

  /** Slower default dismiss on public landing so OAuth/agent messages are readable (signed-in routes stay 4s). */
  const toastContainerAutoCloseMs =
    !user && isPublicMarketingAgentPath(pathname) ? 12000 : 4000;

  return (
    <DemoTourProvider>
      <EducationUIProvider>
        <TokenChainProvider activePath={pathname}>
          <SessionExpiryTimer
            hideOnPaths={[
              "/configure",
              "/demo-data",
              "/self-service",
              "/onboarding",
            ]}
          />
          <div
            className={`App end-user-nano${isOnDashboard ? " App--on-dashboard" : ""}${hasEmbeddedDockLayout ? " App--has-embedded-dock" : ""}${sessionReauth ? " App--session-reauth" : ""}`}
          >
            <ToastContainer
              position="top-right"
              autoClose={toastContainerAutoCloseMs}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              pauseOnHover
              draggable
            />
            {sessionReauth && (
              <SessionReauthBanner
                message={sessionReauth.message}
                role={sessionReauth.role}
                isHITL={sessionReauth.isHITL || false}
                onDismiss={() => setSessionReauth(null)}
              />
            )}
            <Routes>
              {/* /setup/* sub-routes — no auth required */}
              <Route path="/setup/*" element={<PublicRoutes user={user} logout={logout} />} />
              {/* Demo config accessible without login */}
              <Route path="/configure" element={<ConfigurePage user={user} logout={logout} />} />
              <Route path="/demo-data" element={<Navigate to="/configure?tab=demo-management" replace />} />
              {/* Self-service + test pages — accessible without login */}
              <Route path="/self-service" element={<SelfServicePageRoute user={user} logout={logout} />} />
              <Route path="/pingone-test" element={<PingOneTestPageRoute user={user} logout={logout} />} />
              <Route path="/mfa-test" element={<MFATestPageRoute user={user} logout={logout} />} />
              <Route path="/authz-test" element={<AuthzTestPageRoute user={user} logout={logout} />} />
              <Route path="/onboarding" element={<OnboardingRoute user={user} />} />
              {/* Monitoring outer routes — explicit so customers navigating from /dashboard don't hit
                    the path="*" inner-Routes catch-all which redirects back to /dashboard */}
              <Route
                path="/monitoring/*"
                element={
                  <MonitoringRoutes
                    user={user}
                    logout={logout}
                    AgentFlowPage={AgentFlowPage}
                    appFlags={appFlags}
                  />
                }
              />
              <Route path="/architecture/*" element={<EducationRoutes user={user} logout={logout} />} />
              <Route path="/api-traffic" element={<ApiTrafficRoute user={user} logout={logout} />} />
              <Route path="/mcp-traffic" element={<McpTrafficRoute user={user} logout={logout} />} />
              <Route path="/dev-tools" element={<DevToolsRoute user={user} logout={logout} />} />
              <Route path="/sequence-diagram" element={<SequenceDiagramRoute user={user} logout={logout} />} />
              {/* Public landing page — available to all users */}
              <Route
                path="/"
                element={
                  loading ? null : (
                    <>
                      <TopNav user={user} onLogout={logout} />
                      {user && <AdminSideNav user={user} />}
                      <main className="main-content">
                        {user?.role === "admin" ? (
                          <Dashboard user={user} onLogout={logout} />
                        ) : (
                          <LandingPage user={user} onLogout={logout} />
                        )}
                      </main>
                    </>
                  )
                }
              />
              {/* Explicit /dashboard so guests see UserDashboard with demo data, not LandingPage */}
              <Route
                path="/dashboard"
                element={
                  loading ? null : (
                    <>
                      <AdminSideNav user={user} />
                      <TopNav user={user} onLogout={logout} />
                      <main className="main-content">
                        <DashboardContent user={user} logout={logout} />
                      </main>
                    </>
                  )
                }
              />
              {/* /login is not a real route — redirect to home so stale links or misdirected post-logout URIs land cleanly */}
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/logout" element={<LogoutPage />} />
              <Route path="/agent" element={<AgentPageRoute user={user} logout={logout} />} />
              <Route path="/compliance-modal-popout" element={<ComplianceModalPopout />} />
              <Route path="/demo-guide-popout" element={<DemoGuidePopout />} />

              <Route
                path="*"
                element={
                  !user ? (
                    loading ? null : (
                      <>
                        <TopNav user={null} onLogout={logout} />
                      </>
                    )
                  ) : (
                    <>
                      <AdminSideNav user={user} />

                      <TopNav user={user} onLogout={logout} />
                      <main className="main-content">
                        <Routes location={backgroundLocation || fullLocation}>
                          <Route
                            path="/"
                            element={
                              user?.role === "admin" ? (
                                <Dashboard user={user} onLogout={logout} />
                              ) : (
                                <LandingPage user={user} onLogout={logout} />
                              )
                            }
                          />
                          <AdminRoutes user={user} logout={logout} />
                          <Route path="/logs" element={<LogsRoute user={user} logout={logout} />} />
                          <Route path="/api-traffic" element={<ApiTrafficRoute user={user} logout={logout} />} />
                          <Route path="/mcp-traffic" element={<McpTrafficRoute user={user} logout={logout} />} />
                          <Route path="/dev-tools" element={<DevToolsRoute user={user} logout={logout} />} />
                          <EducationWildcardRoutes user={user} logout={logout} />
                          <Route path="/mcp-inspector" element={<McpInspectorRoute user={user} logout={logout} />} />
                          <Route path="/webmcp" element={<WebMcpRoute user={user} logout={logout} />} />
                          <Route path="/agent-flow-inspector" element={<AgentFlowInspectorRoute user={user} logout={logout} />} />
                          <CustomerRoutes user={user} logout={logout} />
                        </Routes>
                        {backgroundLocation &&
                          fullLocation.pathname === "/audit" && (
                            <AdminRoute user={user}>
                              <AuditPage
                                user={user}
                                onClose={() => window.history.back()}
                              />
                            </AdminRoute>
                          )}
                      </main>
                    </>
                  )
                }
              />
            </Routes>
            {shouldMountSingleAgent && (
              <BankingAgent
                user={user}
                onLogout={logout}
                embeddedFocus={resolveEmbeddedFocus(pathname)}
                distinctFloatingChrome
                surfaceHostEl={surfaceHostEl}
                {...singleAgentSurfaceProps}
              />
            )}
            {!isApiTrafficOnlyPage && appFlags.showEducationPanel && (
              <EducationPanelsHost />
            )}
            {!isApiTrafficOnlyPage && <CIBAPanel />}
            {!isApiTrafficOnlyPage && <CimdSimPanel />}
            {!isApiTrafficOnlyPage && <AgentFlowDiagramPanel />}
            <LogViewer
              isOpen={logViewerOpen}
              onClose={() => setLogViewerOpen(false)}
              categoryFilter={appFlags.logFilterCategories}
            />
            {/* UserDashboard renders EmbeddedAgentDock inside its layout. App-level dock sits in document
              order directly above the footer on non-dashboard routes.
              Guest landing (/) always uses float agent — no bottom dock. */}
            {!loading &&
              !onUserDashboardRoute &&
              !(!user && isPublicMarketingAgentPath(pathname)) && (
                <EmbeddedAgentDock
                  user={user}
                  agentPlacement={agentPlacement}
                />
              )}
            {!isApiTrafficOnlyPage && <Footer user={user} />}
            <ServerRestartModal />
            {downServers && downServers.length > 0 && (
              <DemoServerCheckModal
                downServers={downServers}
                onAllUp={() => setDownServers([])}
              />
            )}
            {!isApiTrafficOnlyPage && <DemoTourModal />}
            <MissingCredentialsModal
              isOpen={!!credentialsModal}
              missingFields={credentialsModal?.missingFields || []}
              credentialType={credentialsModal?.credentialType}
              message={credentialsModal?.message}
              onSubmit={async (formData) => {
                const { submitCredentials } =
                  await import("./services/credentialsService");
                await submitCredentials(
                  credentialsModal.credentialType,
                  formData,
                );
                setCredentialsModal(null);
              }}
              onCancel={() => setCredentialsModal(null)}
            />
            <SpinnerHost />
          </div>
        </TokenChainProvider>
      </EducationUIProvider>
    </DemoTourProvider>
  );
}

export default function App() {
  return (
    <SpinnerProvider>
      <AgentUiModeProvider>
        <ExchangeModeProvider>
          <Router
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <IndustryBrandingProvider>
              <VerticalProvider>
                <SessionTokenProvider>
                  <AppWithAuth />
                </SessionTokenProvider>
              </VerticalProvider>
            </IndustryBrandingProvider>
          </Router>
        </ExchangeModeProvider>
      </AgentUiModeProvider>
    </SpinnerProvider>
  );
}
