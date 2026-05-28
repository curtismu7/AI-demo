import AuthorizeRulesPanel from "../components/AuthorizeRulesPanel";
import UserDashboard from "../components/UserDashboard";
import WebMcpPanel from "../components/WebMcpPanel";

/**
 * DashboardContent — extracted from App.js so the /dashboard panel composition
 * (UserDashboard + WebMcpPanel + AuthorizeRulesPanel) lives in one place.
 *
 * This file's only purpose now is to keep that composition together. The other
 * customer routes (/accounts, /transactions, /profile, etc.) are declared
 * directly in App.js because React Router v6 requires <Route> elements to be
 * DIRECT children of <Routes>, not nested in a component.
 */
export function DashboardContent({ user, logout }) {
  return (
    <>
      <UserDashboard user={user} onLogout={logout} />
      <WebMcpPanel />
      <AuthorizeRulesPanel />
    </>
  );
}
