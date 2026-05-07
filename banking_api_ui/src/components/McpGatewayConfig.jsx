import React, { useState, useEffect, useCallback } from "react";
import "./McpGatewayConfig.css";

const API_BASE = process.env.REACT_APP_API_BASE || "";

function StatusBadge({ running, devBypass, enabled }) {
	if (!enabled) return <span className="mgc-badge mgc-badge--off">Disabled</span>;
	if (running && devBypass) return <span className="mgc-badge mgc-badge--mock">Running (Dev Bypass)</span>;
	if (running) return <span className="mgc-badge mgc-badge--live">Running (Live)</span>;
	return <span className="mgc-badge mgc-badge--error">Not Running</span>;
}

function McpModeChip({ usePingOneServer }) {
	if (usePingOneServer) {
		return (
			<span className="mgc-badge mgc-badge--pingone-mode" aria-label="MCP mode: PingOne MCP Server">
				🔵 PingOne MCP Server
			</span>
		);
	}
	return (
		<span className="mgc-badge mgc-badge--custom-mode" aria-label="MCP mode: Custom Gateway">
			🛡️ Custom Gateway
		</span>
	);
}

function CopyButton({ text, label = "Copy" }) {
	const [copied, setCopied] = useState(false);
	const copy = useCallback(() => {
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [text]);
	return (
		<button className="mgc-copy-btn" onClick={copy}>
			{copied ? "✅ Copied" : "📋 " + label}
		</button>
	);
}

function EnvVarTable({ vars, title }) {
	return (
		<div className="mgc-env-section">
			<h4>{title}</h4>
			<table className="mgc-env-table">
				<tbody>
					{Object.entries(vars).map(([k, v]) => (
						<tr key={k} className={v === "NOT SET" ? "mgc-env-row--missing" : ""}>
							<td className="mgc-env-key"><code>{k}</code></td>
							<td className="mgc-env-val">{String(v)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function McpGatewayConfig() {
	const [data, setData] = useState(null);
	const [error, setError] = useState(null);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState("mock");

	const fetchConfig = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`${API_BASE}/api/admin/mcp-gateway/config`, {
				credentials: "include",
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			setData(await res.json());
		} catch (e) {
			setError(e.message);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { fetchConfig(); }, [fetchConfig]);
	const [pushForm, setPushForm] = useState({});
	const [pushResult, setPushResult] = useState(null);
	const [pushing, setPushing] = useState(false);
	const [routeForm, setRouteForm] = useState({});
	const [routeSaveResult, setRouteSaveResult] = useState(null);
	const [routeSaving, setRouteSaving] = useState(false);

	const handlePush = useCallback(async () => {
		setPushing(true);
		setPushResult(null);
		try {
			const res = await fetch(`${API_BASE}/api/admin/mcp-gateway/config`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(pushForm),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
			setPushResult({ ok: true, msg: "Config pushed successfully", config: json.gatewayConfig });
			fetchConfig();
		} catch (e) {
			setPushResult({ ok: false, msg: e.message });
		} finally {
			setPushing(false);
		}
	}, [pushForm, fetchConfig]);



	// Seed push form with live config values on first load
	useEffect(() => {
		if (data) {
			const { config: c, mock: m } = data;
			setPushForm({
				gatewayResourceUri: c.gatewayResourceUri || "",
				mcpOlbWsUrl: c.upstreamMcpUrl || "",
				mcpOlbResourceUri: c.mcpOlbResourceUri || "",
				mcpInvestWsUrl: c.mcpInvestWsUrl || "",
				mcpInvestResourceUri: c.mcpInvestResourceUri || "",
				pingAuthorizeEndpoint: c.pingAuthorizeEndpoint || "",
				hitlServiceUrl: c.hitlServiceUrl || "",
				devBypass: m.devBypass,
			});
			setRouteForm({
				pingOneResourceId: c.pingOneResourceId || "",
				gatewayUrl: c.gatewayPublicUrl || "",
				mcpScope: c.mcpScope || "banking:mcp:invoke",
			});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [!!data]);

	if (loading) return <div className="mgc-loading">Loading gateway config…</div>;
	if (error) return <div className="mgc-error">Error: {error} <button onClick={fetchConfig}>Retry</button></div>;

	function buildLiveMcpJson() {
		if (!data) return {};
		const c = data.config;
		return {
			name: 'mcp',
			// eslint-disable-next-line no-template-curly-in-string
			condition: "${find(request.uri.path, '^/mcp')}",
			properties: {
				pingOneEnvID: c.pingOneEnvUrl || '',
				pingOneResourceID: routeForm.pingOneResourceId || '',
				gatewayUrl: routeForm.gatewayUrl || '',
				mcpServerUrl: c.upstreamMcpUrl || '',
			},
			baseURI: '&{mcpServerUrl}',
		};
	}
	const liveMcpJsonStr = JSON.stringify(buildLiveMcpJson(), null, 2);

	const handleRouteSave = async () => {
		setRouteSaving(true);
		setRouteSaveResult(null);
		try {
			const res = await fetch(`${API_BASE}/api/admin/mcp-gateway/config`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mcp_gw_client_id: routeForm.pingOneResourceId,
					mcp_gw_public_url: routeForm.gatewayUrl,
					mcp_scope: routeForm.mcpScope,
				}),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
			setRouteSaveResult({ ok: true, msg: "Config saved successfully" });
			fetchConfig();
		} catch (e) {
			setRouteSaveResult({ ok: false, msg: e.message });
		} finally {
			setRouteSaving(false);
		}
	};

	const handleDownloadMcpJson = () => {
		const blob = new Blob([liveMcpJsonStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'mcp.json';
		a.click();
		URL.revokeObjectURL(url);
	};

	const { mock, config, envVars, pingGatewayJson, pingGatewayAdminJson } = data;
	const pingGwJsonStr = JSON.stringify(pingGatewayJson, null, 2);
	const pingGwAdminJsonStr = JSON.stringify(pingGatewayAdminJson, null, 2);

	return (
		<div className="mgc-root">
			<div className="mgc-header">
				<div>
					<h2 className="mgc-title">MCP Gateway Configuration</h2>
					<p className="mgc-subtitle">
						Configure the mock PingGateway or generate a{" "}
						<code>mcp.json</code> route file for a real PingGateway deployment.
					</p>
				</div>
				<div className="mgc-header-badge">
					<StatusBadge running={mock.running} devBypass={mock.devBypass} enabled={mock.enabled} />
					{data && <McpModeChip usePingOneServer={data.mcpMode === 'pingone'} />}
					<button className="mgc-refresh-btn" onClick={fetchConfig}>↻ Refresh</button>
				</div>
			</div>

			<div className="mgc-tabs">
				<button
					className={`mgc-tab ${activeTab === "mock" ? "mgc-tab--active" : ""}`}
					onClick={() => setActiveTab("mock")}
				>
					🛡️ Mock Gateway (Dev)
				</button>
				<button
					className={`mgc-tab ${activeTab === "real" ? "mgc-tab--active" : ""}`}
					onClick={() => setActiveTab("real")}
				>
					🔐 Real PingGateway (Prod)
				</button>
				<button
					className={`mgc-tab ${activeTab === "env" ? "mgc-tab--active" : ""}`}
					onClick={() => setActiveTab("env")}
				>
					⚙️ Env Vars
				</button>
				<button
					className={`mgc-tab ${activeTab === "docs" ? "mgc-tab--active" : ""}`}
					onClick={() => setActiveTab("docs")}
				>
					📖 Docs & Setup
				</button>
			</div>

			{activeTab === "mock" && (
				<div className="mgc-panel">
					<div className="mgc-info-grid">
						<div className="mgc-info-item">
							<span className="mgc-info-label">Gateway URL</span>
							<code>{mock.url}</code>
						</div>
						<div className="mgc-info-item">
							<span className="mgc-info-label">Dev Bypass</span>
							<span className={mock.devBypass ? "mgc-on" : "mgc-off"}>
								{mock.devBypass ? "ON — permit-all, no PingOne creds needed" : "OFF — full auth pipeline active"}
							</span>
						</div>
						<div className="mgc-info-item">
							<span className="mgc-info-label">BFF routing</span>
							<span className={mock.enabled ? "mgc-on" : "mgc-off"}>
								{mock.enabled
									? "All MCP tool calls routed through gateway"
									: "Direct to MCP server (MCP_GATEWAY_HTTP_URL not set)"}
							</span>
						</div>
						<div className="mgc-info-item">
							<span className="mgc-info-label">PingAuthorize</span>
							<span className={config.pingAuthorizeEndpoint ? "mgc-on" : "mgc-off"}>
								{config.pingAuthorizeEndpoint || "Not configured — permit-all"}
							</span>
						</div>
					</div>

					<div className="mgc-section">
						<h4>How to enable mock gateway</h4>
						<p>The gateway starts automatically with <code>./run-bank.sh</code>. Ensure these files exist:</p>
						<pre className="mgc-pre">{`# banking_mcp_gateway/.env.development
MCP_GW_DEV_BYPASS=true
MCP_GW_RESOURCE_URI=https://mcp-gw.bxf.com
MCP_OLB_RESOURCE_URI=https://mcp-olb.bxf.com
MCP_INVEST_RESOURCE_URI=https://mcp-invest.bxf.com
# ... (stubs pre-filled in .env.development)`}</pre>
						<p>
							BFF routes through gateway when{" "}
							<code>MCP_GATEWAY_HTTP_URL=http://localhost:3005</code> is set — done automatically by{" "}
							<code>run-bank.sh</code>.
						</p>
					</div>

					<div className="mgc-section">
						<h4>Filter chain (PingGateway-equivalent)</h4>
						<ol className="mgc-chain">
							<li><strong>McpAuditFilter</strong> — logs all MCP tool calls</li>
							<li><strong>McpProtectionFilter</strong> — RFC 9728 metadata, validates <code>aud</code> + <code>exp</code>, adds <code>resource_metadata</code> to WWW-Authenticate</li>
							<li><strong>McpValidationFilter</strong> — Origin/CORS check, Accept header, JSON-RPC 2.0 format</li>
							<li><strong>PingOne Authorize</strong> — per-call policy evaluation (<code>PERMIT / DENY / INDETERMINATE</code>)</li>
							<li><strong>RFC 8693 exchange</strong> — gateway → upstream next-hop token (original never reaches LLM)</li>
							<li><strong>ReverseProxyHandler</strong> — forwards to upstream MCP server with exchanged token</li>
						</ol>
						{mock.devBypass && (
							<div className="mgc-alert mgc-alert--info">
								ℹ️ <strong>Dev bypass active</strong> — steps 2–5 are skipped. Original bearer token is forwarded directly.
							</div>
						)}
					</div>

				<div className="mgc-section">
					<h4>Push Config to Gateway</h4>
					<p>Update the running mock gateway without restart. Changes are in-memory only.</p>
					<div className="mgc-push-form">
						{[
							{ key: "gatewayResourceUri", label: "Gateway Resource URI", placeholder: "https://mcp-gw.bxf.com", hint: "MCP_GW_RESOURCE_URI — the PingOne resource URI registered for this gateway (used as the 'aud' in token exchange)" },
							{ key: "mcpOlbWsUrl", label: "OLB WebSocket URL", placeholder: "ws://localhost:8080", hint: "MCP_OLB_WS_URL — WebSocket address of the Online Banking MCP server the gateway proxies to" },
							{ key: "mcpOlbResourceUri", label: "OLB Resource URI", placeholder: "https://mcp-olb.bxf.com", hint: "MCP_OLB_RESOURCE_URI — PingOne resource URI for the OLB MCP server (used to scope token exchange)" },
							{ key: "mcpInvestWsUrl", label: "Invest WebSocket URL", placeholder: "ws://localhost:8081", hint: "MCP_INVEST_WS_URL — WebSocket address of the Investments MCP server" },
							{ key: "mcpInvestResourceUri", label: "Invest Resource URI", placeholder: "https://mcp-invest.bxf.com", hint: "MCP_INVEST_RESOURCE_URI — PingOne resource URI for the Investments MCP server" },
							{ key: "pingAuthorizeEndpoint", label: "PingAuthorize Endpoint", placeholder: "(blank = permit-all)", hint: "PINGAUTHORIZE_ENDPOINT — optional PingOne Authorize policy URL; leave blank to skip per-call policy evaluation (permit-all)" },
							{ key: "hitlServiceUrl", label: "HITL Service URL", placeholder: "(blank = disabled)", hint: "HITL_SERVICE_URL — optional Human-in-the-Loop approval service; leave blank to disable step-up consent flow" },
						].map(({ key, label, placeholder, hint }) => (
							<label key={key} className="mgc-field">
								<span className="mgc-field-label">{label}</span>
								<input
									type="text"
									className="mgc-input"
									placeholder={placeholder}
									value={pushForm[key] ?? ""}
									onChange={(e) => setPushForm((f) => ({ ...f, [key]: e.target.value }))}
								/>
								{hint && <span className="mgc-field-hint">{hint}</span>}
							</label>
						))}
						<label className="mgc-field mgc-field--inline">
							<input
								type="checkbox"
								checked={!!pushForm.devBypass}
								onChange={(e) => setPushForm((f) => ({ ...f, devBypass: e.target.checked }))}
							/>
							<span className="mgc-field-label">Dev Bypass (permit-all, no PingOne creds)</span>
						</label>
						<button
							className="mgc-push-btn"
							onClick={handlePush}
							disabled={pushing}
						>
							{pushing ? "Pushing…" : "⬆ Push to Gateway"}
						</button>
						{pushResult && (
							<div className={`mgc-alert ${pushResult.ok ? "mgc-alert--success" : "mgc-alert--error"}`}>
								{pushResult.ok ? "✅ " : "❌ "}{pushResult.msg}
							</div>
						)}
					</div>
				</div>
				</div>
			)}

			{activeTab === "real" && (
				<div className="mgc-panel">
					<div className="mgc-compliance-note">
						ℹ️ This config page generates files compatible with PingGateway (Identity Gateway) 2025.11.1 and 2026. Install PingGateway and drop in the generated files — no manual JSON editing needed.
					</div>

					<div className="mgc-wizard">

						{/* Step 1 — Verify PingOne Credentials */}
						<div className="mgc-wizard-step">
							<div className="mgc-wizard-step-header">
								<span className={`mgc-wizard-step-circle ${data.config.pingOneEnvUrl && !data.config.pingOneEnvUrl.includes('<PingOne') ? 'mgc-wizard-step-circle--complete' : 'mgc-wizard-step-circle--needs-input'}`}>
									{data.config.pingOneEnvUrl && !data.config.pingOneEnvUrl.includes('<PingOne') ? '✓' : '⚠'}
								</span>
								<span className="mgc-wizard-step-label">Step 1 — Verify PingOne Credentials</span>
								<span className="mgc-wizard-step-status">{data.config.pingOneEnvUrl && !data.config.pingOneEnvUrl.includes('<PingOne') ? 'complete' : 'needs input'}</span>
							</div>
							<div className="mgc-wizard-step-body">
								{data.config.pingOneEnvUrl && data.config.pingOneEnvUrl.includes('<PingOne') ? (
									<div className="mgc-alert mgc-alert--info">
										⚠️ <strong>PingOne Environment ID not set.</strong>{" "}
										<a href="/config">Set it in Configuration</a> first, then return here.
									</div>
								) : (
									<table className="mgc-env-table">
										<tbody>
											<tr><td className="mgc-env-key"><code>PingOne Auth URL</code></td><td className="mgc-env-val">{data.config.pingOneEnvUrl}</td></tr>
											<tr><td className="mgc-env-key"><code>Introspect Endpoint</code></td><td className="mgc-env-val">{data.config.introspectEndpoint}</td></tr>
										</tbody>
									</table>
								)}
							</div>
						</div>

						{/* Step 2 — Configure Gateway Routes */}
						<div className="mgc-wizard-step">
							<div className="mgc-wizard-step-header">
								<span className={`mgc-wizard-step-circle ${routeForm.pingOneResourceId && routeForm.gatewayUrl ? 'mgc-wizard-step-circle--complete' : 'mgc-wizard-step-circle--needs-input'}`}>
									{routeForm.pingOneResourceId && routeForm.gatewayUrl ? '✓' : '⚠'}
								</span>
								<span className="mgc-wizard-step-label">Step 2 — Configure Gateway Routes</span>
								<span className="mgc-wizard-step-status">{routeForm.pingOneResourceId && routeForm.gatewayUrl ? 'complete' : 'needs input'}</span>
							</div>
							<div className="mgc-wizard-step-body">
								<div className="mgc-push-form">
									<label className="mgc-field">
										<span className="mgc-field-label">
											PingOne Environment URL
											<span className="mgc-chip--derived">🔗 From PingOne config</span>
										</span>
										<input type="text" className="mgc-input mgc-input--readonly" value={data.config.pingOneEnvUrl || ""} readOnly />
										<span className="mgc-field-hint">maps to <code>properties.pingOneEnvID</code> in mcp.json</span>
									</label>

									<label className="mgc-field">
										<span className="mgc-field-label">
											PingOne Resource ID
											{!routeForm.pingOneResourceId && <span className="mgc-badge mgc-badge--required">Required</span>}
										</span>
										<input
											type="text"
											className="mgc-input"
											placeholder="e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890"
											value={routeForm.pingOneResourceId ?? ""}
											onChange={(e) => setRouteForm((f) => ({ ...f, pingOneResourceId: e.target.value }))}
										/>
										<span className="mgc-field-hint">Used as <code>username</code> in OAuth2ResourceServerFilter for introspection. Maps to <code>properties.pingOneResourceID</code>.</span>
									</label>

									<label className="mgc-field">
										<span className="mgc-field-label">
											PingGateway Public URL
											{!routeForm.gatewayUrl && <span className="mgc-badge mgc-badge--required">Required</span>}
										</span>
										<input
											type="text"
											className="mgc-input"
											placeholder="https://ig.example.com:8443"
											value={routeForm.gatewayUrl ?? ""}
											onChange={(e) => setRouteForm((f) => ({ ...f, gatewayUrl: e.target.value }))}
										/>
										<span className="mgc-field-hint">The public HTTPS URL of your PingGateway instance. Maps to <code>properties.gatewayUrl</code>.</span>
									</label>

									<label className="mgc-field">
										<span className="mgc-field-label">
											Upstream MCP Server URL
											<span className="mgc-chip--derived">🔗 From PingOne config</span>
										</span>
										<input type="text" className="mgc-input mgc-input--readonly" value={data.config.upstreamMcpUrl || ""} readOnly />
										<span className="mgc-field-hint">Maps to <code>properties.mcpServerUrl</code> and <code>baseURI</code>.</span>
									</label>

									<label className="mgc-field">
										<span className="mgc-field-label">MCP Scope</span>
										<input
											type="text"
											className="mgc-input"
											placeholder="banking:mcp:invoke"
											value={routeForm.mcpScope ?? "banking:mcp:invoke"}
											onChange={(e) => setRouteForm((f) => ({ ...f, mcpScope: e.target.value }))}
										/>
										<span className="mgc-field-hint">OAuth 2.0 scope required for token exchange.</span>
									</label>

									<label className="mgc-field">
										<span className="mgc-field-label">
											Token Introspection Endpoint
											<span className="mgc-chip--derived">🔗 From PingOne config</span>
										</span>
										<input type="text" className="mgc-input mgc-input--readonly" value={data.config.introspectEndpoint || ""} readOnly />
										<span className="mgc-field-hint">Auto-computed: PingOne Auth URL + <code>/as/introspect</code></span>
									</label>

									<button type="button" className="mgc-push-btn" onClick={handleRouteSave} disabled={routeSaving}>
										{routeSaving ? "Saving…" : "⬆ Save to Config"}
									</button>
									{routeSaveResult && (
										<div className={`mgc-alert ${routeSaveResult.ok ? "mgc-alert--success" : "mgc-alert--error"}`}>
											{routeSaveResult.ok ? "✅ " : "❌ "}{routeSaveResult.msg}
										</div>
									)}
								</div>

								<div style={{ marginTop: '20px' }}>
									<h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#1a1a2e' }}>Live mcp.json Preview</h4>
									<div className="mgc-code-block">
										<button type="button" className="mgc-download-btn" onClick={handleDownloadMcpJson}>⬇ Download mcp.json</button>
										<CopyButton text={liveMcpJsonStr} label="Copy mcp.json" />
										<pre className="mgc-pre mgc-pre--code">{liveMcpJsonStr}</pre>
									</div>
								</div>
							</div>
						</div>

						{/* Step 3 — Download Route File */}
						<div className="mgc-wizard-step">
							<div className="mgc-wizard-step-header">
								<span className="mgc-wizard-step-circle mgc-wizard-step-circle--pending">3</span>
								<span className="mgc-wizard-step-label">Step 3 — Download Route File</span>
								<span className="mgc-wizard-step-status">○ pending</span>
							</div>
							<div className="mgc-wizard-step-body">
								<p style={{ fontSize: '14px', color: '#444', margin: '0 0 10px' }}>
									Drop into <code>$HOME/.openig/config/routes/mcp.json</code> (Linux) or <code>%appdata%\OpenIG\config\routes\mcp.json</code> (Windows).
								</p>
								<div className="mgc-code-block">
									<button className="mgc-download-btn" onClick={handleDownloadMcpJson}>⬇ Download mcp.json</button>
									<CopyButton text={pingGwJsonStr} label="Copy mcp.json" />
									<pre className="mgc-pre mgc-pre--code">{pingGwJsonStr}</pre>
								</div>
							</div>
						</div>

						{/* Step 4 — Configure admin.json */}
						<div className="mgc-wizard-step">
							<div className="mgc-wizard-step-header">
								<span className="mgc-wizard-step-circle mgc-wizard-step-circle--pending">4</span>
								<span className="mgc-wizard-step-label">Step 4 — Configure admin.json</span>
								<span className="mgc-wizard-step-status">○ pending</span>
							</div>
							<div className="mgc-wizard-step-body">
								<p style={{ fontSize: '14px', color: '#444', margin: '0 0 10px' }}>
									<strong>streamingEnabled: true</strong> is required for MCP SSE transport. Merge the fields below into your existing PingGateway <code>admin.json</code>.
								</p>
								<div className="mgc-code-block">
									<CopyButton text={pingGwAdminJsonStr} label="Copy admin.json snippet" />
									<pre className="mgc-pre mgc-pre--code">{pingGwAdminJsonStr}</pre>
								</div>
							</div>
						</div>

						{/* Step 5 — Point BFF to Real Gateway */}
						<div className="mgc-wizard-step">
							<div className="mgc-wizard-step-header">
								<span className="mgc-wizard-step-circle mgc-wizard-step-circle--pending">5</span>
								<span className="mgc-wizard-step-label">Step 5 — Point BFF to Real Gateway</span>
								<span className="mgc-wizard-step-status">○ pending</span>
							</div>
							<div className="mgc-wizard-step-body">
								<ol className="mgc-steps">
									<li>Set <code>MCP_GATEWAY_HTTP_URL=https://ig.example.com:8443</code> in BFF <code>.env</code></li>
									<li>Remove <code>MCP_GW_DEV_BYPASS</code> (or set to <code>false</code>) in gateway <code>.env</code></li>
									<li>Set <code>MCP_GW_CLIENT_ID</code> / <code>MCP_GW_CLIENT_SECRET</code> to the PingOne resource credentials</li>
									<li>Set <code>RESOURCE_SECRET_ID</code> env var: <code>printf '%s' "&lt;resource_secret&gt;" | base64</code></li>
									<li>Restart both BFF and PingGateway</li>
								</ol>
							</div>
						</div>

					</div>
				</div>
			)}

			{activeTab === "env" && (
				<div className="mgc-panel">
					<EnvVarTable vars={envVars.required} title="Required (gateway service)" />
					<EnvVarTable vars={envVars.optional} title="Optional / defaults" />
					<div className="mgc-alert mgc-alert--info">
						ℹ️ Secrets are masked. Set vars in{" "}
						<code>banking_mcp_gateway/.env.development</code> for local dev,
						or in your deployment environment for production.
					</div>
				</div>
			)}

			{activeTab === "docs" && (
				<div className="mgc-panel">
					<div className="mgc-section">
						<h4>PingGateway & PingOne Resources</h4>
						<p>Official documentation for connecting PingGateway (Identity Gateway) to PingOne as an MCP authorization layer.</p>
					</div>
					<div className="mgc-doc-card">
						<p className="mgc-doc-card-title">Securing AI Agents with PingOne</p>
						<p className="mgc-doc-card-desc">PingOne identity patterns for AI agents — authentication, scopes, delegation</p>
						<a className="mgc-doc-card-link" href="https://developer.pingidentity.com/identity-for-ai/identity/idai-securing-agents-pingone.html" target="_blank" rel="noopener noreferrer">
							🔗 developer.pingidentity.com — Securing AI Agents
						</a>
					</div>
					<div className="mgc-doc-card">
						<p className="mgc-doc-card-title">PingGateway + PingOne Authorize (AAM)</p>
						<p className="mgc-doc-card-desc">How PingGateway integrates with PingOne Authorize for policy-driven agent authorization</p>
						<a className="mgc-doc-card-link" href="https://docs.pingidentity.com/pinggateway/2026/pingone/aam.html" target="_blank" rel="noopener noreferrer">
							🔗 docs.pingidentity.com — PingGateway AAM
						</a>
					</div>
					<div className="mgc-doc-card">
						<p className="mgc-doc-card-title">PingGateway Documentation</p>
						<p className="mgc-doc-card-desc">Full installation, configuration, and deployment guide for Identity Gateway 2025.11 and 2026</p>
						<a className="mgc-doc-card-link" href="https://docs.pingidentity.com/pinggateway/2026/" target="_blank" rel="noopener noreferrer">
							🔗 docs.pingidentity.com — PingGateway Docs
						</a>
					</div>
				</div>
			)}
		</div>
	);
}
