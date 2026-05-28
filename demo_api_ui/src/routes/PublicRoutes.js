import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./AppShell";
import AuthzTestPage from "../components/AuthzTestPage";
import BankingAgent from "../components/BankingAgent";
import ComplianceModalPopout from "../components/ComplianceModalPopout";
import DemoGuidePopout from "../components/DemoGuidePopout";
import LogoutPage from "../components/LogoutPage";
import MFATestPage from "../components/MFATestPage";
import Onboarding from "../components/Onboarding";
import PingOneSetupGuidePage from "../components/PingOneSetupGuidePage";
import PingOneTestPage from "../components/PingOneTestPage";
import SelfServicePage from "../components/SelfServicePage";
import SetupPage from "../components/SetupPage";
import SetupWizard from "../components/SetupWizard";
import UnifiedConfigurationPage from "../components/Configuration/UnifiedConfigurationPage";

export default function PublicRoutes({ user, logout }) {
  return (
    <Routes>
      <Route path="pingone" element={<PingOneSetupGuidePage />} />
      <Route path="wizard" element={<SetupWizard />} />
      <Route path="" element={<SetupPage />} />
    </Routes>
  );
}

// Shell-wrapped public pages used as top-level route elements in App.js
export function ConfigurePage({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <UnifiedConfigurationPage user={user} onLogout={logout} />
    </AppShell>
  );
}

export function SelfServicePageRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <SelfServicePage />
    </AppShell>
  );
}

export function PingOneTestPageRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <PingOneTestPage />
    </AppShell>
  );
}

export function MFATestPageRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <MFATestPage />
    </AppShell>
  );
}

export function AuthzTestPageRoute({ user, logout }) {
  return (
    <AppShell user={user} logout={logout}>
      <AuthzTestPage />
    </AppShell>
  );
}

export function OnboardingRoute({ user }) {
  if (user && user.role !== "admin") return <Navigate to="/" replace />;
  return <Onboarding />;
}

export function AgentPageRoute({ user, logout }) {
  return (
    <BankingAgent
      user={user}
      onLogout={logout}
      mode="inline"
      distinctFloatingChrome
    />
  );
}

export { LogoutPage, ComplianceModalPopout, DemoGuidePopout };
