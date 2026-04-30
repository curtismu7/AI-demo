import React, { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAgentUiMode } from "../context/AgentUiModeContext";
import { useDemoTour } from "../context/DemoTourContext";
import { useEducationUI } from "../context/EducationUIContext";
import { persistBankingAgentUi } from "../services/demoScenarioService";
import { setDashboardLayout } from "../utils/dashboardLayout";
import { EDU } from "./education/educationIds";
import RedButton from "./RedButton";
import KillSwitchConfirmModal from "./KillSwitchConfirmModal";
import "./AdminSideNav.css";

/**
 * AdminSideNav — PingIdentity-style persistent left sidebar for navigation.
 *
 * Based on PingIdentity console design:
 * - Dark background sidebar (left)
 * - White text labels for all entries
 * - Expandable submenu sections
 * - Active link highlighting
 * - Consistent icon + label styling
 * - Responsive on mobile
 *
 * Updated Phase 155: All routes verified against App.js; broken links fixed
 * Updated Phase 163: Role-aware — renders for ALL logged-in users, filters items by role
 * Updated Phase 163: Added Config, Demo Config, Role Switch; consolidated all nav here
 */
export default function AdminSideNav({ user }) {
	const location = useLocation();
	const navigate = useNavigate();
	const [collapsed, setCollapsed] = useState(false);

	// Auto-expand the section that contains the current path on mount/remount.
	// Prevents the sidebar collapsing when the layout remounts (e.g. customer navigating /dashboard → /monitoring/*).
	// Index offsets differ by role: customers have "Family Delegation" at idx 2, pushing later items up by 1.
	const [expandedSections, setExpandedSections] = useState(() => {
		const initial = {};
		const path = location.pathname;
		const isAdminUser = user?.role === 'admin';
		const monitoringPaths = ['/monitoring', '/activity', '/audit', '/api-traffic', '/mcp-traffic', '/dev-tools', '/architecture'];
		const usersPaths = ['/users', '/accounts', '/transactions'];
		const testsPaths = ['/pingone-test', '/mfa-test', '/authz-test', '/resource-server', '/resource-server-cc'];
		if (monitoringPaths.some(p => path === p || path.startsWith(p + '/'))) {
			initial[isAdminUser ? 'nav-3' : 'nav-4'] = true;
		}
		if (usersPaths.some(p => path === p || path.startsWith(p + '/'))) {
			initial[isAdminUser ? 'nav-2' : 'nav-3'] = true;
		}
		if (testsPaths.some(p => path === p || path.startsWith(p + '/'))) {
			initial[isAdminUser ? 'nav-7' : 'nav-7'] = true;
		}
		return initial;
	});
	const [showKillModal, setShowKillModal] = useState(false);
	const [agentRevoked, setAgentRevoked] = useState(false);

	const isAdmin = user?.role === "admin";
	const { placement, fab, setAgentUi } = useAgentUiMode();
	const { open: openEdu } = useEducationUI();
	const tour = useDemoTour();

	const handleAgentPlacement = useCallback(
		async (p) => {
			if (p === placement) return;
			let next;
			let needsReload = true;
			if (p === "middle") {
				setDashboardLayout("split3");
				next = { placement: "middle", fab };
				needsReload = false; // live context update — no flash
			} else if (p === "bottom") {
				setDashboardLayout("classic");
				next = { placement: "bottom", fab }; } else {
				next = { placement: "none", fab: true };
			}
			if (needsReload) {
				try {
					localStorage.setItem("banking_agent_ui_v2", JSON.stringify(next));
				} catch (_e) {
					/* noop */
				}
				await persistBankingAgentUi(next);
				window.setTimeout(() => window.location.reload(), 250);
			} else {
				setAgentUi(next);
				await persistBankingAgentUi(next);
			}
		},
		[placement, fab, setAgentUi],
	);

	const handleFabToggle = useCallback(async () => {
		if (placement === "none") return;
		const next = { placement, fab: !fab };
		try {
			localStorage.setItem("banking_agent_ui_v2", JSON.stringify(next));
		} catch (_e) {
			/* noop */
		}
		await persistBankingAgentUi(next);
		window.setTimeout(() => window.location.reload(), 250);
	}, [placement, fab]);

	// Main navigation items (some with submenus) — ALL ROUTES VERIFIED
	// Items with adminOnly: true are hidden for non-admin users
	const allNavItems = [
		{ label: "Home", path: "/", icon: "🏠" },
		{ label: "Dashboard", path: isAdmin ? "/admin" : "/dashboard", icon: "📊" },
		{
			label: "Family Delegation",
			path: "/delegation",
			icon: "👥",
			customerOnly: true,
		},
		{
			label: "Users & Accounts",
			icon: "📑",
			children: [
				{ label: "Users", path: "/users", icon: "👥" },
				{ label: "Accounts", path: "/accounts", icon: "🏦" },
				{ label: "Transactions", path: "/transactions", icon: "💳" },
			],
		},
		{
			label: "Monitoring",
			icon: "📋",
			children: [
				{ label: "Activity Logs", path: "/activity", icon: "📝", adminOnly: true },
				{ label: "Audit Trail", path: "/audit", icon: "🔍", adminOnly: true },
				{ label: "API Traffic", path: "/api-traffic", icon: "📡" },
				{ label: "MCP Traffic", path: "/mcp-traffic", icon: "🔌" },
				{ label: "Dev Tools", path: "/dev-tools", icon: "🛠" },
				{ label: "Token Chain", path: "/monitoring/token-chain", icon: "🔗" },
				{ label: "Token Diff", path: "/monitoring/token-diff", icon: "📊" },
				{ label: "Flow Inspector", path: "/monitoring/flow-inspector", icon: "🔬" },
				{ label: "API Explorer", path: "/monitoring/api-explorer", icon: "📡" },
			],
		},
		{
			label: "Architecture",
			icon: "🗺️",
			children: [
				{ label: "System Architecture", path: "/architecture/system", icon: "🗺️" },
				{ label: "Overview Diagram", path: "/architecture/overview", icon: "🏗️" },
				{ label: "Token Flow Diagram", path: "/architecture/token-flow", icon: "🔗" },
				{ label: "Interactive Flow", path: "/architecture/flow", icon: "⚡" },
			],
		},
		{
			label: "OAuth & Security",
			icon: "🔐",
			adminOnly: true,
			children: [
				{ label: "Security Settings", path: "/settings", icon: "⚙️" },
				{ label: "OAuth Debug", path: "/oauth-debug-logs", icon: "🔑" },
				{
					label: "Client Registration",
					path: "/client-registration",
					icon: "📝",
				},
				{ label: "Scope Audit", path: "/scope-audit", icon: "🔎" },
				{ label: "Scope Reference", path: "/scope-reference", icon: "📚" },
				{ label: "User Delegation", path: "/delegation", icon: "🤝" },
				{ label: "Error Audit Log", path: "/error-audit", icon: "📋" },
			],
		},
		{
			label: "System Tools",
			icon: "⚙️",
			adminOnly: true,
			children: [
				{
					label: "Feature Flags",
					path: "/configure?tab=feature-flags",
					icon: "🚩",
				},
				{ label: "MCP Inspector", path: "/mcp-inspector", icon: "🔬" },
				{ label: "MCP Gateway", path: "/mcp-gateway", icon: "🛡️" },
				{ label: "MCP Tools", path: "/mcp-tools", icon: "🧰" },
				{ label: "LLM Config", path: "/llm-config", icon: "🤖" },
				{ label: "Demo Config", path: "/demo-data", icon: "🎛" },
				{ label: "App Configuration", path: "/configure", icon: "🔧" },
				{ label: "Postman Collections", path: "/postman", icon: "📬" },
			],
		},
		{
			label: "Tests",
			icon: "🧪",
			children: [
				{ label: "PingOne Test", path: "/pingone-test", icon: "🧪" },
				{ label: "MFA Test", path: "/mfa-test", icon: "🔒" },
				{ label: "Authz Test", path: "/authz-test", icon: "⚖️" },
				{ label: "OIDC Resource Server", path: "/resource-server", icon: "🔐" },
				{ label: "CC Resource Server", path: "/resource-server-cc", icon: "🔑" },
			],
		},
	];

	// Filter by role
	const navItems = allNavItems.filter(
		(item) => (!item.adminOnly || isAdmin) && (!item.customerOnly || !isAdmin),
	);

	// Learn & education expandable section
	const learnItems = [
		{ label: "Guided Demo Tour", icon: "🗺", action: () => tour.start() },
		{
			label: "Best Practices",
			icon: "⭐",
			action: () => openEdu(EDU.BEST_PRACTICES, "overview"),
		},
		{
			label: "Auth Code + PKCE",
			icon: "🔑",
			action: () => openEdu(EDU.LOGIN_FLOW, "what"),
		},
		{
			label: "CIBA (OOB)",
			icon: "📲",
			action: () => {
				window.dispatchEvent(
					new CustomEvent("education-open-ciba", { detail: { tab: "what" } }),
				);
			},
		},
		{
			label: "Token Exchange",
			icon: "🔄",
			action: () => openEdu(EDU.TOKEN_EXCHANGE, "why"),
		},
		{
			label: "MCP Protocol",
			icon: "🔬",
			action: () => openEdu(EDU.MCP_PROTOCOL, "what"),
		},
		{
			label: "Computer Use Agent (CUA)",
			icon: "🖱️",
			action: () => openEdu(EDU.CUA, "what"),
		},
		{
			label: "Human-in-the-loop",
			icon: "🤝",
			action: () => openEdu(EDU.HUMAN_IN_LOOP, "what"),
		},
		{
			label: "Agent Gateway",
			icon: "🌐",
			action: () => openEdu(EDU.AGENT_GATEWAY, "overview"),
		},
		{
			label: "Introspection",
			icon: "🔍",
			action: () => openEdu(EDU.INTROSPECTION, "why"),
		},
		{
			label: "RFC Index",
			icon: "📚",
			action: () => openEdu(EDU.RFC_INDEX, "index"),
		},
		{
			label: "Agent flow diagram",
			icon: "📊",
			action: () => {
				window.dispatchEvent(new CustomEvent("agent-flow-diagram-open"));
			},
		},
		{ label: "WebMCP (Google)", icon: "🌐", action: () => navigate("/webmcp") },
		{
			label: "Agentic Trust",
			icon: "🛡️",
			action: () => navigate("/agentic-trust"),
		},
		{
			label: "Actor Token (Agent)",
			icon: "🎭",
			action: () => openEdu(EDU.TOKEN_FLOW, "diagram"),
		},
		{
			label: "Glean + PingOne",
			icon: "🔗",
			action: () => openEdu(EDU.GLEAN, "overview"),
		},
	];

	// Agent UI placement options for the expandable dropdown
	const agentPlacementOptions = [
		{ key: "middle", label: "Middle column", icon: "┃" },
		{ key: "bottom", label: "Bottom dock", icon: "▁" },
		{ key: "none", label: "Float only", icon: "💬" },
	];

	// Action items (buttons, not navigation links)
	const actionItems = [
		...(user
			? [
					{
						label: isAdmin ? "Customer View" : "Admin View",
						action: "switch-role",
						icon: "⇄",
					},
				]
			: []),
		{ label: "Dark Mode", action: "dark-mode", icon: "🌙" },
		...(user
			? [{ label: "Log Out", action: "logout", icon: "🚪" }]
			: [{ label: "Sign In", action: "sign-in", icon: "🔑" }]),
	];

	const isActive = (path) => {
		if (path === "/admin" || path === "/dashboard")
			return location.pathname === path;
		return (
			location.pathname === path || location.pathname.startsWith(path + "/")
		);
	};

	const toggleSection = (sectionKey) => {
		setExpandedSections((prev) => ({
			...prev,
			[sectionKey]: !prev[sectionKey],
		}));
	};

	const handleAction = (action) => {
		switch (action) {
			case "switch-role": {
				const targetRole = isAdmin ? "customer" : "admin";
				fetch("/api/auth/switch", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ targetRole }),
				})
					.then((r) => {
						if (!r.ok) throw new Error(`Switch failed: ${r.status}`);
						return r.json();
					})
					.then(({ redirectUrl }) => {
						window.location.href = redirectUrl;
					})
					.catch((e) => {
						console.error("[Sidebar] Role switch failed:", e.message);
					});
				break;
			}
			case "dark-mode": {
				const currentTheme =
					document.documentElement.getAttribute("data-theme");
				const newTheme = currentTheme === "dark" ? "light" : "dark";
				document.documentElement.setAttribute("data-theme", newTheme);
				localStorage.setItem("theme", newTheme);
				break;
			}
			case "logout":
				if (window.confirm("Log out?")) {
					window.location.href = "/api/auth/logout";
				}
				break;
			case "sign-in":
				window.location.href =
					"/api/auth/oauth/user/login?return_to=/dashboard";
				break;
			default:
				break;
		}
	};

	const handleKillSwitchConfirm = useCallback(async (agentId, reason) => {
		try {
			const response = await fetch(`/api/admin/agent/${agentId}/kill-switch`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reason }),
			});
			if (!response.ok) throw new Error(`Kill switch failed: ${response.status}`);
			setAgentRevoked(true);
			setShowKillModal(false);
			console.log("[AdminSideNav] Agent kill switch successful");
		} catch (e) {
			console.error("[AdminSideNav] Kill switch error:", e.message);
		}
	}, []);


	const renderNavItem = (item, sectionKey, index) => {
		const itemKey = `${sectionKey}-${index}`;
		const isExpanded = expandedSections[itemKey];
		const hasChildren = item.children && item.children.length > 0;

		if (hasChildren) {
			return (
				<div key={itemKey}>
					<button
						className="admin-side-nav__item admin-side-nav__item--parent"
						onClick={() => toggleSection(itemKey)}
						title={collapsed ? item.label : undefined}
					>
						<span className="admin-side-nav__icon">{item.icon}</span>
						{!collapsed && (
							<>
								<span className="admin-side-nav__label">{item.label}</span>
								<span
									className={`admin-side-nav__chevron ${isExpanded ? "admin-side-nav__chevron--expanded" : ""}`}
								>
									▶
								</span>
							</>
						)}
					</button>
					{isExpanded && !collapsed && (
						<div className="admin-side-nav__submenu">
							{item.children.filter((child) => !child.adminOnly || isAdmin).map((child, childIdx) => (
								<Link
									key={`${itemKey}-child-${childIdx}`}
									to={child.path}
									className={`admin-side-nav__item admin-side-nav__item--child ${isActive(child.path) ? "admin-side-nav__item--active" : ""}`}
									title={child.label}
								>
									<span className="admin-side-nav__icon">{child.icon}</span>
									<span className="admin-side-nav__label">{child.label}</span>
								</Link>
							))}
						</div>
					)}
				</div>
			);
		}

		return (
			<Link
				key={itemKey}
				to={item.path}
				className={`admin-side-nav__item ${isActive(item.path) ? "admin-side-nav__item--active" : ""}`}
				title={collapsed ? item.label : undefined}
			>
				<span className="admin-side-nav__icon">{item.icon}</span>
				{!collapsed && (
					<span className="admin-side-nav__label">{item.label}</span>
				)}
			</Link>
		);
	};

	return (
		<div
			className={`admin-side-nav ${collapsed ? "admin-side-nav--collapsed" : ""}`}
		>
			{/* Collapse Toggle Button */}
			<button
				className="admin-side-nav__toggle"
				onClick={() => setCollapsed(!collapsed)}
				aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				title={collapsed ? "Expand" : "Collapse"}
			>
				{collapsed ? "→" : "←"}
			</button>

			{/* Role badge — always visible at top of sidebar */}
			{!collapsed && (
				<div className={`admin-side-nav__role-badge admin-side-nav__role-badge--${isAdmin ? 'admin' : 'customer'}`}>
					{isAdmin ? '🛡 ADMIN' : '👤 CUSTOMER'}
				</div>
			)}

			{/* Navigation Menu */}
			<nav className="admin-side-nav__menu">
				{/* Main Navigation Section */}
				<div className="admin-side-nav__section">
					{navItems.map((item, idx) => renderNavItem(item, "nav", idx))}
				</div>

				{/* Agent UI Placement — expandable dropdown */}
				{!collapsed && <div className="admin-side-nav__divider" />}
				<div className="admin-side-nav__section">
					<div>
						<button
							className="admin-side-nav__item admin-side-nav__item--parent"
							onClick={() => toggleSection("agent-ui-placement")}
							title={collapsed ? "Agent UI Placement" : undefined}
						>
							<span className="admin-side-nav__icon">🤖</span>
							{!collapsed && (
								<>
									<span className="admin-side-nav__label">Agent UI</span>
									<span
										className={`admin-side-nav__chevron ${expandedSections["agent-ui-placement"] ? "admin-side-nav__chevron--expanded" : ""}`}
									>
										▶
									</span>
								</>
							)}
						</button>
						{expandedSections["agent-ui-placement"] && !collapsed && (
							<div className="admin-side-nav__submenu">
								{agentPlacementOptions.map((opt) => (
									<button
										key={opt.key}
										onClick={() => void handleAgentPlacement(opt.key)}
										className={`admin-side-nav__item admin-side-nav__item--child${placement === opt.key ? " admin-side-nav__item--active" : ""}`}
										title={opt.label}
									>
										<span className="admin-side-nav__icon">{opt.icon}</span>
										<span className="admin-side-nav__label">{opt.label}</span>
									</button>
								))}
								{placement !== "none" && (
									<label className="admin-side-nav__item admin-side-nav__item--child admin-side-nav__fab-toggle">
										<input
											type="checkbox"
											checked={fab}
											onChange={() => void handleFabToggle()}
										/>
										<span className="admin-side-nav__label">+ Show FAB</span>
									</label>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Safety & Emergency Controls */}
				{!collapsed && <div className="admin-side-nav__divider" />}
				<div className="admin-side-nav__section">
					<div>
						<button
							className="admin-side-nav__item admin-side-nav__item--parent"
							onClick={() => toggleSection("safety")}
							title={collapsed ? "Safety" : undefined}
						>
							<span className="admin-side-nav__icon">🛑</span>
							{!collapsed && (
								<>
									<span className="admin-side-nav__label">Safety</span>
									<span
										className={`admin-side-nav__chevron ${expandedSections["safety"] ? "admin-side-nav__chevron--expanded" : ""}`}
									>
										▶
									</span>
								</>
							)}
						</button>
						{expandedSections["safety"] && !collapsed && (
							<div className="admin-side-nav__submenu admin-side-nav__safety-section">
								<div style={{ padding: "12px 8px", textAlign: "center" }}>
									<button
										onClick={() => setShowKillModal(true)}
										style={{
											background: agentRevoked ? "#999" : "#ef4444",
											color: "white",
											border: "none",
											borderRadius: "6px",
											padding: "8px 12px",
											fontSize: "12px",
											fontWeight: "600",
											cursor: agentRevoked ? "not-allowed" : "pointer",
											width: "100%",
										}}
										disabled={agentRevoked}
									>
										{agentRevoked ? "🔒 AGENT REVOKED" : "🛑 STOP AGENT"}
									</button>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Learn & Education */}
				{!collapsed && <div className="admin-side-nav__divider" />}
				<div className="admin-side-nav__section">
					<div>
						<button
							className="admin-side-nav__item admin-side-nav__item--parent"
							onClick={() => toggleSection("learn")}
							title={collapsed ? "Learn" : undefined}
						>
							<span className="admin-side-nav__icon">📚</span>
							{!collapsed && (
								<>
									<span className="admin-side-nav__label">Learn</span>
									<span
										className={`admin-side-nav__chevron ${expandedSections["learn"] ? "admin-side-nav__chevron--expanded" : ""}`}
									>
										▶
									</span>
								</>
							)}
						</button>
						{expandedSections["learn"] && !collapsed && (
							<div className="admin-side-nav__submenu">
								{learnItems.map((item) => (
									<button
										key={item.label}
										onClick={item.action}
										className="admin-side-nav__item admin-side-nav__item--child"
										title={item.label}
									>
										<span className="admin-side-nav__icon">{item.icon}</span>
										<span className="admin-side-nav__label">{item.label}</span>
									</button>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Divider */}
				{!collapsed && <div className="admin-side-nav__divider" />}

				{/* Actions Section */}
				<div className="admin-side-nav__section">
					{actionItems.map((item) => (
						<button
							key={item.action}
							onClick={() => handleAction(item.action)}
							className="admin-side-nav__item admin-side-nav__item--action"
							title={collapsed ? item.label : undefined}
						>
							<span className="admin-side-nav__icon">{item.icon}</span>
							{!collapsed && (
								<span className="admin-side-nav__label">{item.label}</span>
							)}
						</button>
					))}
				</div>
			</nav>
			{showKillModal && (
				<KillSwitchConfirmModal
					isOpen={showKillModal}
					onClose={() => setShowKillModal(false)}
					onConfirm={(agentId, reason) => handleKillSwitchConfirm(agentId || "default-agent", reason)}
				/>
			)}
		</div>
	);
}
