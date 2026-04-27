import React, { useState, useEffect, useCallback } from "react";
import "./McpGatewayConfig.css";

const API_BASE = process.env.REACT_APP_API_BASE || "";

function StatusBadge({ running, devBypass, enabled }) {
	if (!enabled) return <span className="mgc-badge mgc-badge--off">Disabled</span>;
	if (running && devBypass) return <span className="mgc-badge mgc-badge--mock">Running (Dev Bypass)</span>;
	if (running) return <span className="mgc-badge mgc-badge--live">Running (Live)</span>;
	return <span className="mgc-badge mgc-badge--error">Not Running</span>;
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
				mcpOlbResourceUri: "",
				mcpInvestWsUrl: "",
				mcpInvestResourceUri: "",
				pingAuthorizeEndpoint: c.pingAuthorizeEndpoint || "",
				hitlServiceUrl: "",
				devBypass: m.devBypass,
			});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [!!data]);

	if (loading) return <div className="mgc-loading">Loading gateway config…</div>;
	if (error) return <div className="mgc-error">Error: {error} <button onClick={fetchConfig}>Retry</button></div>;

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
							{ key: "gatewayResourceUri", label: "Gateway Resource URI", type: "text", placeholder: "https://mcp-gw.bxf.com" },
							{ key: "mcpOlbWsUrl", label: "OLB WS URL", type: "text", placeholder: "ws://localhost:8080" },
							{ key: "mcpOlbResourceUri", label: "OLB Resource URI", type: "text", placeholder: "https://mcp-olb.bxf.com" },
							{ key: "mcpInvestWsUrl", label: "Invest WS URL", type: "text", placeholder: "ws://localhost:8081" },
							{ key: "mcpInvestResourceUri", label: "Invest Resource URI", type: "text", placeholder: "https://mcp-invest.bxf.com" },
							{ key: "pingAuthorizeEndpoint", label: "PingAuthorize Endpoint", type: "text", placeholder: "(blank = permit-all)" },
							{ key: "hitlServiceUrl", label: "HITL Service URL", type: "text", placeholder: "(blank = disabled)" },
						].map(({ key, label, type, placeholder }) => (
							<label key={key} className="mgc-field">
								<span className="mgc-field-label">{label}</span>
								<input
									type={type}
									className="mgc-input"
									placeholder={placeholder}
									value={pushForm[key] ?? ""}
									onChange={(e) => setPushForm((f) => ({ ...f, [key]: e.target.value }))}
								/>
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
					<div className="mgc-section">
						<h4>1 — Route file: <code>mcp.json</code></h4>
						<p>
							Drop into <code>$HOME/.openig/config/routes/mcp.json</code> (Linux) or{" "}
							<code>%appdata%\OpenIG\config\routes\mcp.json</code> (Windows).
							Values in <code>properties</code> are pre-filled from your environment.
						</p>
						<div className="mgc-code-block">
							<CopyButton text={pingGwJsonStr} label="Copy mcp.json" />
							<pre className="mgc-pre mgc-pre--code">{pingGwJsonStr}</pre>
						</div>
					</div>

					<div className="mgc-section">
						<h4>2 — Merge into <code>admin.json</code></h4>
						<p>
							<strong>streamingEnabled: true</strong> is required for MCP SSE transport.
							Merge the fields below into your existing PingGateway <code>admin.json</code>.
						</p>
						<div className="mgc-code-block">
							<CopyButton text={pingGwAdminJsonStr} label="Copy admin.json snippet" />
							<pre className="mgc-pre mgc-pre--code">{pingGwAdminJsonStr}</pre>
						</div>
					</div>

					<div className="mgc-section">
						<h4>3 — Set <code>RESOURCE_SECRET_ID</code> env var</h4>
						<p>
							PingGateway reads the PingOne resource client secret from an env var (no trailing newline):
						</p>
						<pre className="mgc-pre">{`printf '%s' "<resource_client_secret>" | base64\nexport RESOURCE_SECRET_ID=<result>`}</pre>
					</div>

					<div className="mgc-section">
						<h4>4 — Switch BFF to real PingGateway</h4>
						<ol className="mgc-steps">
							<li>Set <code>MCP_GATEWAY_HTTP_URL=https://ig.example.com:8443</code> in BFF env</li>
							<li>Remove <code>MCP_GW_DEV_BYPASS</code> (or set to <code>false</code>) in gateway env</li>
							<li>Set real <code>MCP_GW_CLIENT_ID</code> / <code>MCP_GW_CLIENT_SECRET</code> (PingOne test resource)</li>
							<li>Set <code>PINGONE_TOKEN_ENDPOINT</code> to <code>https://auth.pingone.com/&lt;envId&gt;/as/token</code></li>
							<li>Restart both the BFF and PingGateway</li>
						</ol>
					</div>

					<div className="mgc-section">
						<h4>Config values used to generate above</h4>
						<table className="mgc-env-table">
							<tbody>
								{Object.entries(config).map(([k, v]) => (
									<tr key={k}>
										<td className="mgc-env-key"><code>{k}</code></td>
										<td className="mgc-env-val">{String(v) || <em>(not set)</em>}</td>
									</tr>
								))}
							</tbody>
						</table>
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
		</div>
	);
}
