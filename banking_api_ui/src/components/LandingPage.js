import React from "react";
import { useNavigate } from "react-router-dom";
import DevToolsDashboard from "./DevToolsDashboard";
import "./LandingPage.css";

export default function LandingPage({ user, onLogout }) {
	const navigate = useNavigate();
	const handleAdminDashboard = (e) => {
		e.preventDefault();
		if (user?.role === "admin") {
			navigate("/admin");
		} else {
			window.location.href = "/api/auth/oauth/login";
		}
	};

	const handleCustomerDashboard = (e) => {
		e.preventDefault();
		navigate("/dashboard");
	};

	return (
		<div className="landing-page">
			{/* Logged-out: white marketing header; logged-in: no top nav (sidebar + App.js TopNav handles it) */}
			{!user && (
				<header className="landing-header" role="banner">
					<div className="landing-header-content">
						<div className="landing-logo">
							<h1>Super Banking</h1>
							<p>AI-Powered Financial Services</p>
						</div>
						<div className="landing-header-actions">
							<button
								onClick={handleAdminDashboard}
								className="btn btn-primary"
							>
								Admin Dashboard
							</button>
							<button
								onClick={handleCustomerDashboard}
								className="btn btn-secondary"
							>
								Customer Dashboard
							</button>
						</div>
					</div>
				</header>
			)}

			{/* Hero Section */}
			<section className="landing-hero" aria-label="Hero section">
				<div className="landing-hero-content">
					<h1 className="landing-hero-headline">Secured AI Banking</h1>
					<p className="landing-hero-subheadline">
						Explore RFC 8693 token delegation, MCP spec integration, and how AI
						agents safely access banking APIs on behalf of users.
					</p>
					<div className="landing-hero-actions">
						<button
							onClick={handleAdminDashboard}
							className="hero-cta hero-cta-primary"
						>
							Admin Dashboard
						</button>
						<button
							onClick={handleCustomerDashboard}
							className="hero-cta hero-cta-secondary"
						>
							Customer Dashboard
						</button>
					</div>
				</div>
			</section>


			{/* Dev Tools Dashboard — only for unauthenticated visitors; logged-in users get it via UserDashboard */}
			{!user && (
				<section className="landing-token-chain" aria-label="Dev tools dashboard">
					<div className="landing-token-chain-heading">
						<h2>🛠 Dev Tools Dashboard</h2>
						<p>
							Live Token Chain, Agent &amp; Token Flow Inspector, and MCP Traffic
							— all in one draggable, resizable panel. Hit ↗ to pop out to a
							second screen.
						</p>
					</div>
					<div className="landing-panels-row">
						<DevToolsDashboard
							defaultWidth={1100}
							defaultHeight={580}
							defaultCollapsed
							bottomDock
						/>
					</div>
				</section>
			)}
		</div>
	);
}
