import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MdAccountBalance, MdSearch, MdLogin } from "react-icons/md";
import UserMenu from "./UserMenu";
import RunServersModal from "./RunServersModal";
import { navigateToCustomerOAuthLogin } from "../utils/authUi";
import "./TopNav.css";

export default function TopNav({ user, onLogout }) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [showRunServersModal, setShowRunServersModal] = useState(false);
  const location = useLocation();

  // Admin-only: detect whether currently in admin or customer view
  const isAdminView =
    user?.role === "admin" &&
    (location.pathname.startsWith("/admin") ||
      location.pathname === "/users" ||
      location.pathname === "/activity" ||
      location.pathname === "/audit" ||
      location.pathname === "/configure" ||
      location.pathname === "/settings" ||
      location.pathname === "/scope-audit" ||
      location.pathname === "/scope-reference" ||
      location.pathname === "/feature-flags" ||
      location.pathname === "/pingone-test" ||
      location.pathname === "/mfa-test" ||
      location.pathname === "/error-audit" ||
      location.pathname === "/oauth-debug");

  // Page label map
  const getPageLabel = () => {
    const p = location.pathname;
    if (p === "/" || p === "/landing" || p === "/home")
      return { label: "Main Page", icon: "🏠" };
    if (p === "/dashboard")
      return user?.role === "admin"
        ? { label: "Customer Dashboard", icon: "👤" }
        : { label: "Customer Dashboard", icon: "👤" };
    if (p.startsWith("/admin/") || p === "/admin")
      return { label: "Administrator Dashboard", icon: "🛡" };
    if (p === "/users") return { label: "User Management", icon: "👥" };
    if (p === "/activity") return { label: "Activity Log", icon: "📋" };
    if (p === "/audit") return { label: "Audit Log", icon: "🔍" };
    if (p === "/configure" || p === "/settings")
      return { label: "Configuration", icon: "⚙️" };
    if (p === "/feature-flags") return { label: "Feature Flags", icon: "🚩" };
    if (p === "/pingone-test") return { label: "Entity Explorer", icon: "🔬" };
    if (p === "/mfa-test") return { label: "MFA Test", icon: "🔐" };
    if (p === "/oauth-debug") return { label: "OAuth Debug", icon: "🪪" };
    if (p === "/mcp-traffic" || p.includes("/monitoring/mcp-traffic"))
      return { label: "MCP Traffic", icon: "🔌" };
    if (p.includes("/monitoring/api-explorer") || p.includes("/api-explorer"))
      return { label: "API Explorer", icon: "📡" };
    if (p.includes("/monitoring/token-chain") || p.includes("/token-chain"))
      return { label: "Token Chain", icon: "🔗" };
    if (
      p.includes("/monitoring/flow-inspector") ||
      p.includes("/flow-inspector")
    )
      return { label: "Flow Inspector", icon: "🔭" };
    if (p.includes("/architecture"))
      return { label: "Architecture", icon: "🏗" };
    if (p === "/authz-test") return { label: "Authorization Test", icon: "⚖️" };
    if (p === "/scope-audit" || p === "/scope-reference")
      return { label: "Scope Reference", icon: "📜" };
    if (p === "/error-audit") return { label: "Error Audit", icon: "⚠️" };
    if (p.startsWith("/accounts")) return { label: "Accounts", icon: "💳" };
    if (p.startsWith("/transactions"))
      return { label: "Transactions", icon: "💸" };
    if (p === "/profile") return { label: "Profile", icon: "👤" };
    if (p === "/setup" || p.startsWith("/setup"))
      return { label: "Setup", icon: "🧰" };
    return null;
  };
  const pageLabel = getPageLabel();

  const handleSwitchView = () => {
    if (isAdminView) {
      navigate("/dashboard");
    } else {
      navigate("/admin");
    }
  };

  const handleLogout = () => {
    onLogout();
  };

  return (
    <header className="topnav">
      <div className="topnav-container">
        {/* Left side: Brand */}
        <div className="topnav-left">
          <button
            type="button"
            className="topnav-brand"
            onClick={() =>
              navigate(user?.role === "admin" ? "/admin" : "/dashboard")
            }
            aria-label="Go to dashboard"
          >
            <MdAccountBalance className="topnav-brand-icon" />
            <span className="topnav-brand-name">Super Bank</span>
          </button>
        </div>

        {/* Center: Quick nav (admin) + Page label */}
        {user?.role === "admin" && (
          <nav className="topnav-center">
            <button
              type="button"
              className="topnav-group-trigger"
              onClick={() => navigate("/dashboard")}
            >
              Customer
            </button>
            <button
              type="button"
              className="topnav-group-trigger"
              onClick={() => navigate("/admin")}
            >
              Admin
            </button>
            <button
              type="button"
              className="topnav-group-trigger"
              onClick={() => navigate("/setup")}
            >
              Setup
            </button>
          </nav>
        )}
        {pageLabel && (
          <div className="topnav-page-label">
            <span className="topnav-page-label__text">{pageLabel.label}</span>
          </div>
        )}

        {/* Right side: Search + User Menu */}
        <div className="topnav-right">
          <div className="topnav-search">
            <button
              className="topnav-search-btn"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Search"
              type="button"
            >
              <MdSearch size={20} />
            </button>
            {searchOpen && (
              <input
                type="text"
                placeholder="Search..."
                className="topnav-search-input"
                autoFocus
              />
            )}
          </div>
          {user?.role === "admin" && (
            <button
              type="button"
              className={`topnav-view-switch${isAdminView ? " topnav-view-switch--customer" : " topnav-view-switch--admin"}`}
              onClick={handleSwitchView}
              title={
                isAdminView ? "Switch to Customer View" : "Switch to Admin View"
              }
            >
              {isAdminView ? "Customer View" : "Admin View"}
            </button>
          )}
          {!user && (
            <button
              type="button"
              className="topnav-login-btn"
              onClick={() => navigateToCustomerOAuthLogin()}
            >
              <MdLogin size={18} />
              <span>Login</span>
            </button>
          )}
          {user && (
            <button
              type="button"
              className="topnav-run-servers-btn"
              onClick={() => setShowRunServersModal(true)}
              title="Start all banking demo servers"
            >
              ▶ Run Servers
            </button>
          )}
          {showRunServersModal && (
            <RunServersModal onClose={() => setShowRunServersModal(false)} />
          )}
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </div>
    </header>
  );
}
