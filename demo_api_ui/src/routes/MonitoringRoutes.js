import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./AppShell";
import ApiExplorerPanel from "../components/ApiExplorerPanel";
import ApiTrafficPage from "../components/ApiTrafficPage";
import DevToolsDashboard from "../components/DevToolsDashboard";
import LogViewerPage from "../components/LogViewerPage";
import McpInspector from "../components/McpInspector";
import McpTrafficPage from "../components/McpTrafficPage";
import SequenceDiagramPage from "../components/SequenceDiagramPage";
import TokenChainDisplay from "../components/TokenChainDisplay";
import TokenDiffPanel from "../components/TokenDiffPanel";
import UnifiedTokenFlowInspector from "../components/UnifiedTokenFlowInspector";
import WebMcpPanel from "../components/WebMcpPanel";

// Passed as prop to avoid circular dependency — AgentFlowPage is defined in App.js
export default function MonitoringRoutes({ user, logout, AgentFlowPage, appFlags }) {
  return (
    <AppShell user={user} logout={logout}>
      <Routes>
        <Route path="token-chain" element={
          user && appFlags?.enableTokenChainDisplay
            ? <TokenChainDisplay />
            : <Navigate to="/" replace />
        } />
        <Route path="token-diff" element={<TokenDiffPanel />} />
        <Route path="flow-inspector" element={
          <UnifiedTokenFlowInspector floatingByDefault={false} showToggle={false} />
        } />
        <Route path="mcp-traffic" element={<McpTrafficPage />} />
        <Route path="api-explorer" element={<ApiExplorerPanel />} />
        <Route path="agent-flow" element={
          user && AgentFlowPage
            ? <AgentFlowPage />
            : <Navigate to="/" replace />
        } />
      </Routes>
    </AppShell>
  );
}

// Named exports for top-level standalone routes (outside /monitoring/*)
export function ApiTrafficRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <ApiTrafficPage />
    </AppShell>
  );
}

export function McpTrafficRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <McpTrafficPage />
    </AppShell>
  );
}

export function DevToolsRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <DevToolsDashboard
        defaultWidth={1200}
        defaultHeight={700}
        onClose={() => window.history.back()}
      />
    </AppShell>
  );
}

export function SequenceDiagramRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <SequenceDiagramPage user={user} />
    </AppShell>
  );
}

export function LogsRoute({ user, logout }) {
  if (!user) return <Navigate to="/" replace />;
  return (
    <AppShell user={user} logout={logout}>
      <LogViewerPage />
    </AppShell>
  );
}

export function McpInspectorRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <McpInspector user={user} onLogout={logout} />
    </AppShell>
  );
}

export function WebMcpRoute({ user, logout }) {
  if (!user) return <Navigate to="/" replace />;
  return (
    <AppShell user={user} logout={logout}>
      <WebMcpPanel />
    </AppShell>
  );
}

export function AgentFlowInspectorRoute({ user, logout }) {
  if (!user) return <Navigate to="/" replace />;
  return (
    <AppShell user={user} logout={logout}>
      <UnifiedTokenFlowInspector floatingByDefault={false} showToggle={true} />
    </AppShell>
  );
}
