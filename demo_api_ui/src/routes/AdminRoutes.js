import { Navigate, Route } from "react-router-dom";
import AdminRoute from "./AdminRoute";
import ActivityLogs from "../components/ActivityLogs";
import AdminErrorAuditLog from "../components/AdminErrorAuditLog";
import AdminVaultPage from "../components/AdminVaultPage";
import AuthorizeConfigPage from "../components/AuthorizeConfigPage";
import AuditPage from "../components/AuditPage";
import BankingAdminOps from "../components/BankingAdminOps";
import ClientRegistrationPage from "../components/ClientRegistrationPage";
import Dashboard from "../components/Dashboard";
import FeatureFlagsPage from "../components/FeatureFlagsPage";
import LlmConfigPage from "../components/LlmConfigPage";
import McpGatewayConfig from "../components/McpGatewayConfig";
import OAuthDebugLogViewer from "../components/OAuthDebugLogViewer";
import SecuritySettings from "../components/SecuritySettings";
import Users from "../components/Users";

export default function AdminRoutes({ user, logout }) {
  return (
    <>
      <Route path="/admin" element={
        <AdminRoute user={user}>
          <Dashboard user={user} onLogout={logout} />
        </AdminRoute>
      } />
      <Route path="/admin/banking" element={
        <AdminRoute user={user}>
          <BankingAdminOps user={user} onLogout={logout} />
        </AdminRoute>
      } />
      <Route path="/admin/vault" element={
        <AdminRoute user={user}><AdminVaultPage /></AdminRoute>
      } />
      <Route path="/users" element={
        <AdminRoute user={user}>
          <Users user={user} onLogout={logout} />
        </AdminRoute>
      } />
      <Route path="/activity" element={
        <AdminRoute user={user}>
          <ActivityLogs user={user} onLogout={logout} />
        </AdminRoute>
      } />
      <Route path="/audit" element={
        <AdminRoute user={user}><AuditPage user={user} /></AdminRoute>
      } />
      <Route path="/feature-flags" element={
        user ? <FeatureFlagsPage /> : <Navigate to="/" replace />
      } />
      <Route path="/llm-config" element={
        <AdminRoute user={user}>
          <LlmConfigPage user={user} onLogout={logout} />
        </AdminRoute>
      } />
      <Route path="/settings" element={
        <AdminRoute user={user}>
          <SecuritySettings user={user} onLogout={logout} />
        </AdminRoute>
      } />
      <Route path="/authorize-config" element={
        <AdminRoute user={user}><AuthorizeConfigPage /></AdminRoute>
      } />
      <Route path="/mcp-gateway" element={
        <AdminRoute user={user}><McpGatewayConfig /></AdminRoute>
      } />
      <Route path="/error-audit" element={
        <AdminRoute user={user}><AdminErrorAuditLog /></AdminRoute>
      } />
      <Route path="/oauth-debug-logs" element={
        <AdminRoute user={user}><OAuthDebugLogViewer /></AdminRoute>
      } />
      <Route path="/client-registration" element={
        <AdminRoute user={user}><ClientRegistrationPage /></AdminRoute>
      } />
      <Route path="/config" element={
        <Navigate to="/configure?tab=pingone-config" replace />
      } />
    </>
  );
}
