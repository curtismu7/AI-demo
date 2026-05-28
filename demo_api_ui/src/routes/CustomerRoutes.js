import { Navigate, Route } from "react-router-dom";
import AdminRoute from "./AdminRoute";
import Accounts from "../components/Accounts";
import AuthorizeRulesPanel from "../components/AuthorizeRulesPanel";
import Dashboard from "../components/Dashboard";
import DelegatedAccessPage from "../components/DelegatedAccessPage";
import DelegationPage from "../components/DelegationPage";
import LandingPage from "../components/LandingPage";
import Profile from "../components/Profile";
import SecurityCenter from "../components/SecurityCenter";
import TransactionConsentPage from "../components/TransactionConsentPage";
import Transactions from "../components/Transactions";
import UserAccounts from "../components/UserAccounts";
import UserDashboard from "../components/UserDashboard";
import UserTransactions from "../components/UserTransactions";
import WebMcpPanel from "../components/WebMcpPanel";

export default function CustomerRoutes({ user, logout }) {
  return (
    <>
      <Route path="/" element={
        user?.role === "admin"
          ? <Dashboard user={user} onLogout={logout} />
          : <LandingPage user={user} onLogout={logout} />
      } />
      <Route path="/accounts" element={
        user?.role === "admin"
          ? <AdminRoute user={user}><Accounts user={user} onLogout={logout} /></AdminRoute>
          : <UserAccounts user={user} />
      } />
      <Route path="/user-accounts" element={<UserAccounts user={user} />} />
      <Route path="/transactions" element={
        user?.role === "admin"
          ? <AdminRoute user={user}><Transactions user={user} onLogout={logout} /></AdminRoute>
          : <UserTransactions user={user} />
      } />
      <Route path="/transaction-consent" element={<TransactionConsentPage user={user} />} />
      <Route path="/delegated-access" element={<DelegatedAccessPage user={user} onLogout={logout} />} />
      <Route path="/delegation" element={
        user ? <DelegationPage user={user} onLogout={logout} /> : <Navigate to="/" replace />
      } />
      <Route path="/profile" element={<Profile user={user} />} />
      <Route path="/security" element={<SecurityCenter user={user} />} />
      <Route path="*" element={
        <Navigate to={user?.role === "admin" ? "/admin" : "/dashboard"} replace />
      } />
    </>
  );
}

// Dashboard content used in the top-level /dashboard route (supports guest access)
export function DashboardContent({ user, logout }) {
  return (
    <>
      <UserDashboard user={user} onLogout={logout} />
      <WebMcpPanel />
      <AuthorizeRulesPanel />
    </>
  );
}
