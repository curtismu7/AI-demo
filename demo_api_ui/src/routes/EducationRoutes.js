import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./AppShell";
import AdminRoute from "./AdminRoute";
import { ActorTokenEducation } from "../components/ActorTokenEducation";
import AdminTokenComplianceAudit from "../components/AdminTokenComplianceAudit";
import { AgenticTrustEducation } from "../components/AgenticTrustEducation";
import ArchitectureFlowPage from "../components/ArchitectureFlowPage";
import ArchitectureOverviewPage from "../components/ArchitectureOverviewPage";
import ArchitectureTabsPanel from "../components/ArchitectureTabsPanel";
import ArchitectureTokenFlowPage from "../components/ArchitectureTokenFlowPage";
import ClientCredentialsResourcePage from "../components/ClientCredentialsResourcePage";
import { MCPToolsEducation } from "../components/MCPToolsEducation";
import OAuthTokenDisplayPage from "../components/OAuthTokenDisplayPage";
import Phase266ArchitecturePage from "../components/Phase266ArchitecturePage";
import PostmanCollectionsPage from "../components/PostmanCollectionsPage";
import ResourceServerPage from "../components/ResourceServerPage";
import ScopeAuditPage from "../components/ScopeAuditPage";
import ScopeReferencePage from "../components/ScopeReferencePage";
import LangChainPage from "../pages/LangChainPage";
import AccessIdTokenPathPage from "../components/AccessIdTokenPathPage";
import ApiKeyPathPage from "../components/ApiKeyPathPage";
import MortgagePathPage from "../components/MortgagePathPage";

// /architecture/* sub-routes
export default function EducationRoutes({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <Routes>
        <Route path="system" element={<ArchitectureTabsPanel user={user} />} />
        <Route path="overview" element={<ArchitectureOverviewPage user={user} />} />
        <Route path="token-flow" element={<ArchitectureTokenFlowPage user={user} />} />
        <Route path="flow" element={<ArchitectureFlowPage user={user} />} />
        <Route path="phase-266" element={<Phase266ArchitecturePage />} />
      </Routes>
    </AppShell>
  );
}

// Individual education/resource routes used inside the wildcard catch-all
export function EducationWildcardRoutes({ user, logout }) {
  return (
    <>
      <Route path="/langchain" element={<LangChainPage />} />
      <Route path="/mcp-tools" element={
        user ? <MCPToolsEducation /> : <Navigate to="/" replace />
      } />
      <Route path="/agentic-trust" element={
        user ? <AgenticTrustEducation /> : <Navigate to="/" replace />
      } />
      <Route path="/actor-token-education" element={
        user ? <ActorTokenEducation /> : <Navigate to="/" replace />
      } />
      <Route path="/token-compliance" element={
        <AdminRoute user={user}><AdminTokenComplianceAudit /></AdminRoute>
      } />
      <Route path="/postman" element={
        <PostmanCollectionsPage user={user} onLogout={logout} />
      } />
      <Route path="/scope-audit" element={
        <AdminRoute user={user}><ScopeAuditPage /></AdminRoute>
      } />
      <Route path="/scope-reference" element={
        <AdminRoute user={user}><ScopeReferencePage /></AdminRoute>
      } />
      <Route path="/oauth/token-display" element={
        user ? <OAuthTokenDisplayPage /> : <Navigate to="/" replace />
      } />
      <Route path="/resource-server" element={
        user ? <ResourceServerPage /> : <Navigate to="/" replace />
      } />
      <Route path="/resource-server-cc" element={
        user ? <ClientCredentialsResourcePage /> : <Navigate to="/" replace />
      } />
      <Route path="/path/mortgage" element={
        user ? <MortgagePathPage /> : <Navigate to="/" replace />
      } />
      <Route path="/path/apikey-info" element={
        user ? <ApiKeyPathPage /> : <Navigate to="/" replace />
      } />
      <Route path="/path/dualtoken-info" element={
        user ? <AccessIdTokenPathPage /> : <Navigate to="/" replace />
      } />
    </>
  );
}
