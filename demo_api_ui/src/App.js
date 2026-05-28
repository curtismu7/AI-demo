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

import Accounts from "./components/Accounts";
import ActivityLogs from "./components/ActivityLogs";
import { ActorTokenEducation } from "./components/ActorTokenEducation";
import AdminErrorAuditLog from "./components/AdminErrorAuditLog";
import AdminSideNav from "./components/AdminSideNav";
import AdminTokenComplianceAudit from "./components/AdminTokenComplianceAudit";
import AdminVaultPage from "./components/AdminVaultPage";
import AgentFlowDiagramPanel from "./components/AgentFlowDiagramPanel";
import { AgenticTrustEducation } from "./components/AgenticTrustEducation";
import ApiExplorerPanel from "./components/ApiExplorerPanel";
import ArchitectureFlowPage from "./components/ArchitectureFlowPage";
import ArchitectureOverviewPage from "./components/ArchitectureOverviewPage";
import SequenceDiagramPage from "./components/SequenceDiagramPage";
import ArchitectureTabsPanel from "./components/ArchitectureTabsPanel";
import ArchitectureTokenFlowPage from "./components/ArchitectureTokenFlowPage";
import Phase266ArchitecturePage from "./components/Phase266ArchitecturePage";
import MortgagePathPage from "./components/MortgagePathPage";
import ApiKeyPathPage from "./components/ApiKeyPathPage";
import AccessIdTokenPathPage from "./components/AccessIdTokenPathPage";
import ApiTrafficPage from "./components/ApiTrafficPage";
import AuditPage from "./components/AuditPage";
import AdminRoute from "./routes/AdminRoute";
import BankingAdminOps from "./components/BankingAdminOps";
import BankingAgent from "./components/BankingAgent";
import { resolveEmbeddedFocus } from "./components/demoAgentSafety";
import CIBAPanel from "./components/CIBAPanel";
import CimdSimPanel from "./components/CimdSimPanel";
import ClientCredentialsResourcePage from "./components/ClientCredentialsResourcePage";
import ClientRegistrationPage from "./components/ClientRegistrationPage";
import ComplianceModalPopout from "./components/ComplianceModalPopout";
import DemoGuidePopout from "./components/DemoGuidePopout";
import UnifiedConfigurationPage from "./components/Configuration/UnifiedConfigurationPage";
import Dashboard from "./components/Dashboard";
import DelegatedAccessPage from "./components/DelegatedAccessPage";
import DelegationPage from "./components/DelegationPage";
import DemoServerCheckModal from "./components/DemoServerCheckModal";
import DevToolsDashboard from "./components/DevToolsDashboard";
import EmbeddedAgentDock from "./components/EmbeddedAgentDock";
import EducationPanelsHost from "./components/education/EducationPanelsHost";
import FeatureFlagsPage from "./components/FeatureFlagsPage";
import Footer from "./components/Footer";
import LandingPage from "./components/LandingPage";
import LlmConfigPage from "./components/LlmConfigPage";
import LogoutPage from "./components/LogoutPage";
import LogViewer from "./components/LogViewer";
import LogViewerPage from "./components/LogViewerPage";
import { MCPToolsEducation } from "./components/MCPToolsEducation";
import McpInspector from "./components/McpInspector";
import McpGatewayConfig from "./components/McpGatewayConfig";
import McpTrafficPage from "./components/McpTrafficPage";
import AuthorizeConfigPage from "./components/AuthorizeConfigPage";
import AuthzTestPage from "./components/AuthzTestPage";
import MFATestPage from "./components/MFATestPage";
import MissingCredentialsModal from "./components/MissingCredentialsModal";
import OAuthDebugLogViewer from "./components/OAuthDebugLogViewer";
import OAuthTokenDisplayPage from "./components/OAuthTokenDisplayPage";
import Onboarding from "./components/Onboarding";
import PingOneSetupGuidePage from "./components/PingOneSetupGuidePage";
import PingOneTestPage from "./components/PingOneTestPage";
import PostmanCollectionsPage from "./components/PostmanCollectionsPage";
import Profile from "./components/Profile";
import ResourceServerPage from "./components/ResourceServerPage";
import ScopeAuditPage from "./components/ScopeAuditPage";
import ScopeReferencePage from "./components/ScopeReferencePage";
import SecurityCenter from "./components/SecurityCenter";
import SecuritySettings from "./components/SecuritySettings";
import SelfServicePage from "./components/SelfServicePage";
import ServerRestartModal from "./components/ServerRestartModal";
import SessionExpiryTimer from "./components/SessionExpiryTimer";
import SessionReauthBanner from "./components/SessionReauthBanner";
import SetupPage from "./components/SetupPage";
import SetupWizard from "./components/SetupWizard";
import SpinnerHost from "./components/shared/SpinnerHost";
import TokenChainDisplay from "./components/TokenChainDisplay";
import TokenDiffPanel from "./components/TokenDiffPanel";
import TopNav from "./components/TopNav";
import TransactionConsentPage from "./components/TransactionConsentPage";
import Transactions from "./components/Transactions";
import DemoTourModal from "./components/tour/DemoTourModal";
import UnifiedTokenFlowInspector from "./components/UnifiedTokenFlowInspector";
import UserAccounts from "./components/UserAccounts";
import UserDashboard from "./components/UserDashboard";
import Users from "./components/Users";
import UserTransactions from "./components/UserTransactions";
import WebMcpPanel from "./components/WebMcpPanel";
import AuthorizeRulesPanel from "./components/AuthorizeRulesPanel";
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
import LangChainPage from "./pages/LangChainPage";
import { monitorApiHealth } from "./services/bankingRestartNotificationService";
import { getCachedJson } from "./services/cachedStatusService";
import { loadPublicConfig, savePublicConfig } from "./services/configService";
import { notifyInfo, notifyWarning } from "./utils/appToast";
import { SESSION_REAUTH_EVENT } from "./utils/authUi";
import {
  isBankingAgentDashboardRoute,
  isEmbeddedAgentDockRoute,
  isPublicMarketingAgentPath,
  isMonitoringRoute,
} from "./utils/embeddedAgentFabVisibility";
import {
  showEndUserOAuthErrorToast,
  stripEndUserOAuthErrorParamsFromUrl,
} from "./utils/endUserOAuthErrorToast";
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

/** Prevents re-auth after logout when effects re-run (matches f8393a7 session guard). */
let _didLogOut = false;

function AppWithAuth() {
  const fullLocation = useLocation();
  const backgroundLocation = fullLocation.state?.backgroundLocation;
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const pathNorm = pathname.replace(/\/$/, "") || "/";
  const isApiTrafficOnlyPage =
    pathNorm === "/api-traffic" ||
    pathNorm === "/logs" ||
    pathNorm === "/agent";
  const { placement: agentPlacement, fab: agentFab, surfaceHostEl } = useAgentUiMode();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  /** On-page session prompt (replaces toast-only for “log in again” flows). */
  const [sessionReauth, setSessionReauth] =
    useState(null); /** Missing credentials modal state */
  const [credentialsModal, setCredentialsModal] = useState(null);
  /** Servers that were down on startup — null = not yet checked, [] = all ok */
  const [downServers, setDownServers] = useState(null);
  /** Avoid userAuthenticated ↔ checkOAuthSession dispatch loops; reset when user clears. */
  const sessionEstablishedRef = useRef(null);
  const [appFlags, setAppFlags] = useState({
    showEducationPanel: true,
    enableTokenChainDisplay: true,
    agentUiMode: "standard",
    debugShowTokenDetails: false,
    debugShowApiCalls: false,
    logFilterCategories: "",
  });

  useEffect(() => {
    loadPublicConfig()
      .then((cfg) => {
        setAppFlags({
          showEducationPanel:
            cfg.show_education_panel !== false &&
            cfg.show_education_panel !== "false",
          enableTokenChainDisplay:
            cfg.enable_token_chain_display !== false &&
            cfg.enable_token_chain_display !== "false",
          agentUiMode: cfg.agent_ui_mode || "standard",
          debugShowTokenDetails:
            cfg.debug_show_token_details === true ||
            cfg.debug_show_token_details === "true",
          debugShowApiCalls:
            cfg.debug_show_api_calls === true ||
            cfg.debug_show_api_calls === "true",
          logFilterCategories: cfg.log_filter_categories || "",
        });
      })
      .catch(() => {});
  }, []);

  // Setup browser extension interference handling
  useEffect(() => {
    const cleanup = setupBrowserExtensionHandling();
    return cleanup;
  }, []);

  // Initialize server restart notification monitoring
  useEffect(() => {
    monitorApiHealth();
  }, []);

  // Startup server health check — show blocking modal if any required server is down
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/demo-status", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const down = (data.servers || []).filter((s) => !s.up);
        setDownServers(down);
      })
      .catch(() => {
        if (cancelled) return;
        // BFF itself unreachable — show both as down
        setDownServers([
          {
            name: "Banking API Server",
            key: "api_server",
            up: false,
            startCmd: "cd banking_api_server && npm start",
            description: "Express BFF",
            port: 3001,
          },
          {
            name: "Banking MCP Server",
            key: "mcp_server",
            up: false,
            startCmd: "cd banking_mcp_server && npm run dev",
            description: "MCP tool server",
            port: 8080,
          },
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear old page content on route change — scroll to top before paint
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector(".main-content");
    if (main) main.scrollTop = 0;
  }, [pathname]);

  // Path A (CR-02/CR-04): the langchain chat session identity is now derived
  // SERVER-SIDE from a PingOne token the BFF proxy attaches to session_init.
  // The old `WebSocket.prototype.send` monkey-patch that injected `userEmail`
  // into session_init has been removed — a client-supplied email is no longer
  // trusted for identity (it was the CR-02 spoof primitive) and would be
  // stripped by the BFF proxy anyway.

  const checkOAuthSession = useCallback(async () => {
    const applyUser = (u) => {
      setUser(u);
      if (!sessionEstablishedRef.current) {
        sessionEstablishedRef.current = true;
        window.dispatchEvent(new CustomEvent("userAuthenticated"));
      }
      setLoading(false);
    };

    try {
      const adminResponse = await getCachedJson("/api/auth/oauth/status");
      if (adminResponse.data.authenticated) {
        applyUser(adminResponse.data.user);
        return true;
      }

      const userResponse = await getCachedJson("/api/auth/oauth/user/status");
      if (userResponse.data.authenticated) {
        applyUser(userResponse.data.user);
        return true;
      }

      const sessionResponse = await getCachedJson("/api/auth/session");
      if (sessionResponse.data.authenticated) {
        applyUser(sessionResponse.data.user);
        return true;
      }

      setLoading(false);
      return false;
    } catch (error) {
      console.error("Error checking OAuth sessions:", error.message);
      setLoading(false);
      return false;
    }
  }, []);

  // Public config → IndexedDB when not in logout handoff (f8393a7 pattern).
  useEffect(() => {
    if (localStorage.getItem("userLoggedOut") === "true") return;
    axios
      .get("/api/admin/config")
      .then(({ data }) => savePublicConfig(data.config))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const pathname =
      typeof window !== "undefined" &&
      typeof window.location?.pathname === "string"
        ? window.location.pathname
        : "";
    const isPostLogoutLanding =
      pathname === "/logout" || pathname.endsWith("/logout");
    const userLoggedOut =
      localStorage.getItem("userLoggedOut") === "true" ||
      _didLogOut ||
      isPostLogoutLanding;

    if (userLoggedOut) {
      _didLogOut = true;
      sessionEstablishedRef.current = false;
      fetch("/api/auth/clear-session", {
        method: "POST",
        credentials: "include",
      })
        .catch(() => {})
        .finally(() => {
          localStorage.removeItem("userLoggedOut");
          setUser(null);
          setLoading(false);
          if (isPostLogoutLanding && window.history?.replaceState) {
            window.history.replaceState(null, "", "/");
          }
        });
      return undefined;
    }

    const oauthSuccess =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search || "").get("oauth") ===
        "success";

    // NOTE: do NOT clear bx-dashboard-reauth on oauth=success.
    // The REAUTH_KEY guard is intentional: redirect once automatically (seamless
    // SSO re-auth), then show the banner if still failing.  Clearing the key
    // here re-enables the redirect on the very next 401, creating an infinite loop:
    //   accounts/my 401 → set key → redirect → oauth=success → key cleared →
    //   accounts/my 401 → set key → redirect → …
    // The key is cleared correctly in UserDashboard's fetchUserData try-block
    // when data actually loads successfully.

    const RETRY_DELAYS_MS = [450, 950, 1900, 3000];
    let retryIndex = 0;
    let cancelled = false;
    const timeouts = [];

    const arm = (delayMs, fn) => {
      const id = setTimeout(() => {
        if (!cancelled) void fn();
      }, delayMs);
      timeouts.push(id);
    };

    const runCheck = async () => {
      if (cancelled) return;
      const ok = await checkOAuthSession();
      if (cancelled || ok) return;
      if (!oauthSuccess || retryIndex >= RETRY_DELAYS_MS.length) return;
      const delay = RETRY_DELAYS_MS[retryIndex++];
      arm(delay, runCheck);
    };

    arm(200, runCheck);

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [checkOAuthSession]);

  useEffect(() => {
    const handler = () => {
      void checkOAuthSession();
    };
    window.addEventListener("userAuthenticated", handler);
    return () => window.removeEventListener("userAuthenticated", handler);
  }, [checkOAuthSession]);

  useEffect(() => {
    const onSessionReauth = (e) => {
      const d = e.detail;
      if (!d || typeof d.message !== "string" || !d.message.trim()) return;
      const role = d.role === "admin" ? "admin" : "customer";
      const isHITL = d.isHITL === true;
      setSessionReauth({ message: d.message.trim(), role, isHITL });
    };
    window.addEventListener(SESSION_REAUTH_EVENT, onSessionReauth);
    return () =>
      window.removeEventListener(SESSION_REAUTH_EVENT, onSessionReauth);
  }, []);

  useEffect(() => {
    if (user) setSessionReauth(null);
  }, [user]);

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

  /** End-user OAuth BFF failures redirect to / (not /login) so FAB/dock stay mounted — toast here. */
  useEffect(() => {
    if (showEndUserOAuthErrorToast(searchParams)) {
      stripEndUserOAuthErrorParamsFromUrl();
    }
  }, [searchParams]);

  /** SSO silent sign-in: PingOne skipped the credential prompt (active session reuse). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("sso_silent") !== "1") return;
    // Remove the param from the URL without a page reload
    params.delete("sso_silent");
    const newSearch = params.toString();
    const newUrl =
      window.location.pathname + (newSearch ? `?${newSearch}` : "");
    window.history.replaceState(null, "", newUrl);
    notifyInfo(
      "✅ Signed in automatically — you had an active PingOne session.",
      { autoClose: 6000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount only
  }, []);

  /** OAuth success landing: strip ?oauth= param from URL — same pattern as sso_silent handler above. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    if (!params.has("oauth")) return;
    params.delete("oauth");
    const newSearch = params.toString();
    const newUrl =
      window.location.pathname + (newSearch ? `?${newSearch}` : "");
    window.history.replaceState(null, "", newUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount only
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

  const logout = () => {
    console.info("Starting logout — navigating to /api/auth/logout");

    localStorage.setItem("userLoggedOut", "true");

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    sessionStorage.clear();

    window.dispatchEvent(new CustomEvent("userLoggedOut"));

    localStorage.removeItem("tokenChainHistory");
    window.location.href = "/api/auth/logout";
  };

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
              <Route
                path="/setup/pingone"
                element={<PingOneSetupGuidePage />}
              />
              <Route path="/setup/wizard" element={<SetupWizard />} />
              <Route path="/setup" element={<SetupPage />} />
              {/* Demo config accessible without login - needed to configure flags before PingOne is set up */}
              <Route
                path="/configure"
                element={
                  <>
                    <AdminSideNav user={user} />

                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <UnifiedConfigurationPage user={user} onLogout={logout} />
                    </main>
                  </>
                }
              />
              <Route
                path="/demo-data"
                element={
                  <Navigate to="/configure?tab=demo-management" replace />
                }
              />
              {/* Self-service user provisioning — accessible without login */}
              <Route
                path="/self-service"
                element={
                  <>
                    <AdminSideNav user={user} />

                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <SelfServicePage />
                    </main>
                  </>
                }
              />
              {/* Test & educational pages — accessible without login */}
              <Route
                path="/pingone-test"
                element={
                  <>
                    <AdminSideNav user={user} />

                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <PingOneTestPage />
                    </main>
                  </>
                }
              />
              <Route
                path="/mfa-test"
                element={
                  <>
                    <AdminSideNav user={user} />

                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <MFATestPage />
                    </main>
                  </>
                }
              />
              <Route
                path="/authz-test"
                element={
                  <>
                    <AdminSideNav user={user} />

                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <AuthzTestPage />
                    </main>
                  </>
                }
              />
              <Route
                path="/onboarding"
                element={
                  user && user.role !== "admin" ? (
                    <Navigate to="/" replace />
                  ) : (
                    <Onboarding />
                  )
                }
              />
              {/* Monitoring outer routes — explicit so customers navigating from /dashboard don't hit
							    the path="*" inner-Routes catch-all which redirects back to /dashboard */}
              <Route
                path="/monitoring/*"
                element={
                  <>
                    <AdminSideNav user={user} />
                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <Routes>
                        <Route
                          path="token-chain"
                          element={<TokenChainDisplay />}
                        />
                        <Route path="token-diff" element={<TokenDiffPanel />} />
                        <Route
                          path="flow-inspector"
                          element={
                            <UnifiedTokenFlowInspector
                              floatingByDefault={false}
                              showToggle={false}
                            />
                          }
                        />
                        <Route
                          path="mcp-traffic"
                          element={<McpTrafficPage />}
                        />
                        <Route
                          path="api-explorer"
                          element={<ApiExplorerPanel />}
                        />
                        <Route
                          path="agent-flow"
                          element={
                            user ? (
                              <AgentFlowPage />
                            ) : (
                              <Navigate to="/" replace />
                            )
                          }
                        />
                      </Routes>
                    </main>
                  </>
                }
              />
              <Route
                path="/architecture/*"
                element={
                  <>
                    <AdminSideNav user={user} />
                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <Routes>
                        <Route
                          path="system"
                          element={<ArchitectureTabsPanel user={user} />}
                        />
                        <Route
                          path="overview"
                          element={<ArchitectureOverviewPage user={user} />}
                        />
                        <Route
                          path="token-flow"
                          element={<ArchitectureTokenFlowPage user={user} />}
                        />
                        <Route
                          path="flow"
                          element={<ArchitectureFlowPage user={user} />}
                        />
                        <Route
                          path="phase-266"
                          element={<Phase266ArchitecturePage />}
                        />
                      </Routes>
                    </main>
                  </>
                }
              />
              <Route
                path="/api-traffic"
                element={
                  <>
                    <AdminSideNav user={user} />
                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <ApiTrafficPage />
                    </main>
                  </>
                }
              />
              <Route
                path="/mcp-traffic"
                element={
                  <>
                    <AdminSideNav user={user} />
                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <McpTrafficPage />
                    </main>
                  </>
                }
              />
              <Route
                path="/dev-tools"
                element={
                  <>
                    <AdminSideNav user={user} />
                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <DevToolsDashboard
                        defaultWidth={1200}
                        defaultHeight={700}
                        onClose={() => window.history.back()}
                      />
                    </main>
                  </>
                }
              />
              <Route
                path="/sequence-diagram"
                element={
                  <>
                    <AdminSideNav user={user} />
                    <TopNav user={user} onLogout={logout} />
                    <main className="main-content">
                      <SequenceDiagramPage user={user} />
                    </main>
                  </>
                }
              />
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
                  loading ? null : !user ? (
                    <>
                      <AdminSideNav user={null} />
                      <TopNav user={user} onLogout={logout} />
                      <main className="main-content">
                        <UserDashboard user={null} onLogout={logout} />
                        <WebMcpPanel />
                        <AuthorizeRulesPanel />
                      </main>
                    </>
                  ) : (
                    <>
                      <AdminSideNav user={user} />
                      <TopNav user={user} onLogout={logout} />
                      <main className="main-content">
                        <UserDashboard user={user} onLogout={logout} />
                        <WebMcpPanel />
                        <AuthorizeRulesPanel />
                      </main>
                    </>
                  )
                }
              />
              {/* /login is not a real route — redirect to home so stale links or misdirected post-logout URIs land cleanly */}
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/logout" element={<LogoutPage />} />
              <Route
                path="/agent"
                element={
                  <BankingAgent
                    user={user}
                    onLogout={logout}
                    mode="inline"
                    distinctFloatingChrome
                  />
                }
              />
              <Route
                path="/compliance-modal-popout"
                element={<ComplianceModalPopout />}
              />
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
                          <Route
                            path="/admin"
                            element={
                              <AdminRoute user={user}>
                                <Dashboard user={user} onLogout={logout} />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/config"
                            element={
                              <Navigate
                                to="/configure?tab=pingone-config"
                                replace
                              />
                            }
                          />
                          <Route
                            path="/logs"
                            element={
                              user ? (
                                <LogViewerPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/api-traffic"
                            element={
                              user ? (
                                <ApiTrafficPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/mcp-traffic"
                            element={<McpTrafficPage />}
                          />
                          <Route
                            path="/dev-tools"
                            element={
                              <DevToolsDashboard
                                defaultWidth={1200}
                                defaultHeight={700}
                                onClose={() => window.history.back()}
                              />
                            }
                          />
                          <Route
                            path="/activity"
                            element={
                              <AdminRoute user={user}>
                                <ActivityLogs user={user} onLogout={logout} />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/audit"
                            element={
                              <AdminRoute user={user}>
                                <AuditPage user={user} />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/users"
                            element={
                              <AdminRoute user={user}>
                                <Users user={user} onLogout={logout} />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/accounts"
                            element={
                              user?.role === "admin" ? (
                                <AdminRoute user={user}>
                                  <Accounts user={user} onLogout={logout} />
                                </AdminRoute>
                              ) : (
                                <UserAccounts user={user} />
                              )
                            }
                          />
                          <Route
                            path="/transactions"
                            element={
                              user?.role === "admin" ? (
                                <AdminRoute user={user}>
                                  <Transactions user={user} onLogout={logout} />
                                </AdminRoute>
                              ) : (
                                <UserTransactions user={user} />
                              )
                            }
                          />
                          <Route
                            path="/admin/banking"
                            element={
                              <AdminRoute user={user}>
                                <BankingAdminOps
                                  user={user}
                                  onLogout={logout}
                                />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/transaction-consent"
                            element={<TransactionConsentPage user={user} />}
                          />
                          <Route
                            path="/delegated-access"
                            element={
                              <DelegatedAccessPage
                                user={user}
                                onLogout={logout}
                              />
                            }
                          />
                          <Route
                            path="/delegation"
                            element={
                              user ? (
                                <DelegationPage user={user} onLogout={logout} />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/feature-flags"
                            element={
                              user ? (
                                <FeatureFlagsPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/langchain"
                            element={<LangChainPage />}
                          />
                          <Route
                            path="/llm-config"
                            element={
                              <AdminRoute user={user}>
                                <LlmConfigPage user={user} onLogout={logout} />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/admin/vault"
                            element={
                              <AdminRoute user={user}>
                                <AdminVaultPage />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/settings"
                            element={
                              <AdminRoute user={user}>
                                <SecuritySettings
                                  user={user}
                                  onLogout={logout}
                                />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/mcp-inspector"
                            element={
                              <McpInspector user={user} onLogout={logout} />
                            }
                          />
                          <Route
                            path="/authorize-config"
                            element={
                              <AdminRoute user={user}>
                                <AuthorizeConfigPage />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/mcp-gateway"
                            element={
                              <AdminRoute user={user}>
                                <McpGatewayConfig />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/mcp-tools"
                            element={
                              user ? (
                                <MCPToolsEducation />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/agentic-trust"
                            element={
                              user ? (
                                <AgenticTrustEducation />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/actor-token-education"
                            element={
                              user ? (
                                <ActorTokenEducation />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/error-audit"
                            element={
                              <AdminRoute user={user}>
                                <AdminErrorAuditLog />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/token-compliance"
                            element={
                              <AdminRoute user={user}>
                                <AdminTokenComplianceAudit />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/webmcp"
                            element={
                              user ? (
                                <WebMcpPanel />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/oauth-debug-logs"
                            element={
                              <AdminRoute user={user}>
                                <OAuthDebugLogViewer />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/client-registration"
                            element={
                              <AdminRoute user={user}>
                                <ClientRegistrationPage />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/postman"
                            element={
                              <PostmanCollectionsPage
                                user={user}
                                onLogout={logout}
                              />
                            }
                          />
                          <Route
                            path="/scope-audit"
                            element={
                              <AdminRoute user={user}>
                                <ScopeAuditPage />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/scope-reference"
                            element={
                              <AdminRoute user={user}>
                                <ScopeReferencePage />
                              </AdminRoute>
                            }
                          />
                          <Route
                            path="/oauth/token-display"
                            element={
                              user ? (
                                <OAuthTokenDisplayPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/agent-flow-inspector"
                            element={
                              user ? (
                                <UnifiedTokenFlowInspector
                                  floatingByDefault={false}
                                  showToggle={true}
                                />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/monitoring/token-chain"
                            element={
                              user && appFlags.enableTokenChainDisplay ? (
                                <TokenChainDisplay />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/monitoring/token-diff"
                            element={
                              user ? (
                                <TokenDiffPanel />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/monitoring/flow-inspector"
                            element={
                              user ? (
                                <UnifiedTokenFlowInspector
                                  floatingByDefault={false}
                                  showToggle={false}
                                />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/monitoring/mcp-traffic"
                            element={<McpTrafficPage />}
                          />
                          <Route
                            path="/monitoring/api-explorer"
                            element={
                              user ? (
                                <ApiExplorerPanel />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/resource-server"
                            element={
                              user ? (
                                <ResourceServerPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/path/mortgage"
                            element={
                              user ? (
                                <MortgagePathPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/path/apikey-info"
                            element={
                              user ? (
                                <ApiKeyPathPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/path/dualtoken-info"
                            element={
                              user ? (
                                <AccessIdTokenPathPage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          <Route
                            path="/resource-server-cc"
                            element={
                              user ? (
                                <ClientCredentialsResourcePage />
                              ) : (
                                <Navigate to="/" replace />
                              )
                            }
                          />
                          {/* User-friendly self-service routes */}
                          <Route
                            path="/profile"
                            element={<Profile user={user} />}
                          />
                          <Route
                            path="/security"
                            element={<SecurityCenter user={user} />}
                          />
                          {/* Catch-all: unknown routes redirect to dashboard instead of blank/404 */}
                          <Route
                            path="*"
                            element={
                              <Navigate
                                to={
                                  user?.role === "admin"
                                    ? "/admin"
                                    : "/dashboard"
                                }
                                replace
                              />
                            }
                          />
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
