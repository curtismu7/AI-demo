import { useCallback, useEffect, useState } from "react";
import apiClient from "../services/apiClient";
import { notifyError, notifySuccess } from "../utils/appToast";
import { navigateToAdminOAuthLogin } from "../utils/authUi";
import "./AuthzTestPage.css";

// ---------------------------------------------------------------------------
// Preset scenarios — cover all three decision branches
// ---------------------------------------------------------------------------
const PRESET_SCENARIOS = [
	{
		id: "small-transfer",
		label: "Small Transfer",
		desc: "$1,000 transfer — below any threshold",
		amount: 1000,
		type: "transfer",
		acr: "",
		hint: "PERMIT",
	},
	{
		id: "high-no-mfa",
		label: "High-Value, No MFA",
		desc: "$20,000 transfer — exceeds step-up threshold, no MFA ACR",
		amount: 20000,
		type: "transfer",
		acr: "",
		hint: "STEP_UP",
	},
	{
		id: "high-with-mfa",
		label: "High-Value + MFA",
		desc: "$20,000 transfer — same amount but MFA ACR satisfied",
		amount: 20000,
		type: "transfer",
		acr: "Multi_Factor",
		hint: "PERMIT",
	},
	{
		id: "blocked",
		label: "Blocked Transaction",
		desc: "$60,000 transfer — exceeds hard deny threshold",
		amount: 60000,
		type: "transfer",
		acr: "",
		hint: "DENY",
	},
	{
		id: "withdrawal",
		label: "High Withdrawal",
		desc: "$20,000 withdrawal — step-up applies to withdrawals too",
		amount: 20000,
		type: "withdrawal",
		acr: "",
		hint: "STEP_UP",
	},
	{
		id: "deposit",
		label: "Large Deposit",
		desc: "$20,000 deposit — deposits bypass step-up by default",
		amount: 20000,
		type: "deposit",
		acr: "",
		hint: "PERMIT",
	},
];

// ---------------------------------------------------------------------------
// Small display components
// ---------------------------------------------------------------------------

function DecisionBadge({ decision, stepUpRequired, large }) {
	const effective = stepUpRequired ? "STEP_UP" : decision || "INDETERMINATE";
	const label =
		{
			PERMIT: "PERMIT",
			DENY: "DENY",
			STEP_UP: "STEP UP",
			INDETERMINATE: "?",
		}[effective] || effective;
	const mod = effective.toLowerCase().replace("_", "-");
	return (
		<span
			className={`authz-badge authz-badge--${mod}${large ? " authz-badge--large" : ""}`}
		>
			{label}
		</span>
	);
}

function HintBadge({ hint }) {
	const mod = hint.toLowerCase().replace("_", "-");
	return (
		<span className={`authz-hint authz-hint--${mod}`}>
			expect: {hint.replace("_", " ")}
		</span>
	);
}

function EngineBadge({ engine }) {
	const MAP = {
		simulated: { label: "Simulated Mode", mod: "simulated" },
		pingone: { label: "PingOne Authorize", mod: "pingone" },
		off: { label: "Authorization Off", mod: "off" },
		pending_config: { label: "Not Configured", mod: "pending" },
	};
	const { label, mod } = MAP[engine] || { label: engine, mod: "pending" };
	return (
		<span className={`authz-engine-badge authz-engine-badge--${mod}`}>
			{label}
		</span>
	);
}

function RawJson({ data }) {
	const [open, setOpen] = useState(false);
	if (!data) return null;
	return (
		<div className="authz-raw">
			<button
				type="button"
				className="authz-raw-toggle"
				onClick={() => setOpen((o) => !o)}
			>
				{open ? "▾ Hide raw response" : "▸ Show raw response"}
			</button>
			{open && (
				<pre className="authz-raw-body">{JSON.stringify(data, null, 2)}</pre>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AuthzTestPage() {
	const [status, setStatus] = useState(null);
	const [statusLoading, setStatusLoading] = useState(true);

	// Per-scenario state
	const [scenarioResults, setScenarioResults] = useState({});
	const [scenarioRunning, setScenarioRunning] = useState({});

	// Custom form
	const [customAmount, setCustomAmount] = useState("5000");
	const [customType, setCustomType] = useState("transfer");
	const [customAcr, setCustomAcr] = useState("");
	const [customRunning, setCustomRunning] = useState(false);
	const [customResult, setCustomResult] = useState(null);

	// History (client-side ring buffer)
	const [history, setHistory] = useState([]);

	// Engine settings panel
	const [engineSettingsOpen, setEngineSettingsOpen] = useState(true);
	const [engineMode, setEngineMode] = useState("simulated"); // "simulated" | "pingone"
	const [endpointId, setEndpointId] = useState("");
	const [workerClientId, setWorkerClientId] = useState("");
	const [workerClientSecret, setWorkerClientSecret] = useState("");
	const [engineSaving, setEngineSaving] = useState(false);
	const [engineSaveMsg, setEngineSaveMsg] = useState(null); // {ok, text}

	const pushHistory = useCallback((result, label) => {
		setHistory((h) =>
			[{ ...result, _label: label, _ts: Date.now() }, ...h].slice(0, 8),
		);
	}, []);

	const loadStatus = useCallback(() => {
		setStatusLoading(true);
		apiClient
			.get("/api/authorize/test-status")
			.then(({ data }) => {
				setStatus(data);
				// Sync engine toggle to what server reports
				if (data.simulatedMode) setEngineMode("simulated");
				else if (data.activeEngine === "pingone") setEngineMode("pingone");
				else if (data.authorizeEnabled === false) setEngineMode("simulated");
				// Prefill credential fields from server config
				if (data.decisionEndpointId) setEndpointId(data.decisionEndpointId);
				if (data.workerClientId) setWorkerClientId(data.workerClientId);
			})
			.catch((err) => setStatus({ error: err.message }))
			.finally(() => setStatusLoading(false));
	}, []);

	// Load engine status on mount
	useEffect(() => {
		loadStatus();
	}, [loadStatus]);

	const resetPage = useCallback(() => {
		setScenarioResults({});
		setScenarioRunning({});
		setCustomResult(null);
		setCustomAmount("5000");
		setCustomType("transfer");
		setCustomAcr("");
		setHistory([]);
		setEngineSaveMsg(null);
	}, []);

	const applyEngine = useCallback(async () => {
		setEngineSaving(true);
		setEngineSaveMsg(null);
		try {
			// 1. Set feature flags — enable authorize, set simulated on/off
			const flagRes = await apiClient.patch("/api/admin/feature-flags", {
				updates: {
					authorize_enabled: "true",
					ff_authorize_simulated: engineMode === "simulated" ? "true" : "false",
				},
			});
			if (!flagRes.data?.updated) throw new Error("Feature flag save failed");

			// 2. If PingOne mode, save credentials + endpoint ID (use FIELD_DEFS key names)
			if (engineMode === "pingone") {
				const cfgBody = {};
				if (endpointId.trim()) cfgBody.PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID = endpointId.trim();
				if (workerClientId.trim()) cfgBody.PINGONE_AUTHORIZE_WORKER_CLIENT_ID = workerClientId.trim();
				if (workerClientSecret.trim()) cfgBody.PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET = workerClientSecret.trim();
				if (Object.keys(cfgBody).length > 0) {
					const cfgRes = await apiClient.post("/api/admin/config", cfgBody);
					if (!cfgRes.data?.ok) throw new Error("Config save failed");
				}
			}

			setEngineSaveMsg({ ok: true, text: `Engine set to ${engineMode === "simulated" ? "Simulated" : "PingOne Authorize"}. Reloading status…` });
			setWorkerClientSecret(""); // clear secret from UI after save
			setEngineSettingsOpen(false);
			await loadStatus();
		} catch (err) {
			const status = err.response?.status;
			const needsLogin = status === 401 || status === 403;
			const msg = status === 401
				? "Admin login required — sign in to change the engine."
				: status === 403
					? "Admin role required — sign in as admin and try again."
					: err.message || "Save failed";
			setEngineSaveMsg({ ok: false, text: msg, needsLogin });
		} finally {
			setEngineSaving(false);
		}
	}, [engineMode, endpointId, workerClientId, workerClientSecret, loadStatus]);

	const callEvaluate = useCallback(async (amount, type, acr) => {
		const { data } = await apiClient.post("/api/authorize/test-evaluate", {
			amount: parseFloat(amount),
			type,
			acr: acr || undefined,
		});
		return data;
	}, []);

	const runScenario = useCallback(
		async (scenario) => {
			setScenarioRunning((r) => ({ ...r, [scenario.id]: true }));
			try {
				const result = await callEvaluate(
					scenario.amount,
					scenario.type,
					scenario.acr,
				);
				setScenarioResults((r) => ({ ...r, [scenario.id]: result }));
				pushHistory(result, scenario.label);
				const effective = result.stepUpRequired ? "STEP UP" : result.decision;
				notifySuccess(`${scenario.label}: ${effective}`);
			} catch (err) {
				const errResult = { ok: false, error: err.message };
				setScenarioResults((r) => ({ ...r, [scenario.id]: errResult }));
				notifyError(`${scenario.label} failed: ${err.message}`);
			} finally {
				setScenarioRunning((r) => ({ ...r, [scenario.id]: false }));
			}
		},
		[callEvaluate, pushHistory],
	);

	const runCustom = useCallback(async () => {
		if (!customAmount || parseFloat(customAmount) <= 0) {
			notifyError("Enter a positive amount");
			return;
		}
		setCustomRunning(true);
		setCustomResult(null);
		try {
			const result = await callEvaluate(customAmount, customType, customAcr);
			setCustomResult(result);
			pushHistory(result, "Custom");
		} catch (err) {
			setCustomResult({ ok: false, error: err.message });
			notifyError("Evaluation failed: " + err.message);
		} finally {
			setCustomRunning(false);
		}
	}, [callEvaluate, customAmount, customType, customAcr, pushHistory]);

	// ---------------------------------------------------------------------------
	// Render helpers
	// ---------------------------------------------------------------------------

	function renderThresholds() {
		if (!status || status.error) return null;
		const engine = status.activeEngine;
		const t =
			engine === "simulated"
				? status.thresholds?.simulated
				: status.thresholds?.pingone;
		if (!t) return null;
		const fmt = (n) => `$${Number(n).toLocaleString()}`;
		return (
			<div className="authz-thresholds">
				<span className="authz-threshold-item authz-threshold-item--permit">
					Below {fmt(t.stepUp)} → PERMIT
				</span>
				<span className="authz-threshold-item authz-threshold-item--step-up">
					{fmt(t.stepUp)}–{fmt(t.deny)} (no MFA) → STEP UP
				</span>
				<span className="authz-threshold-item authz-threshold-item--deny">
					Above {fmt(t.deny)} → DENY
				</span>
				{t.note && <span className="authz-threshold-note">{t.note}</span>}
			</div>
		);
	}

	function renderScenarioResult(result) {
		if (!result) return null;
		if (result.error) {
			return (
				<div className="authz-scenario-result authz-scenario-result--error">
					Error: {result.error}
				</div>
			);
		}
		return (
			<div className="authz-scenario-result">
				<DecisionBadge
					decision={result.decision}
					stepUpRequired={result.stepUpRequired}
				/>
				<span className="authz-result-meta">
					via {result.engine}
					{result.path && result.path !== result.engine
						? ` · ${result.path}`
						: ""}
				</span>
				<RawJson data={result.raw} />
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	if (statusLoading) {
		return (
			<div className="authz-test-page">
				<div className="authz-loading">
					<div className="authz-spinner" />
					<p>Loading authorization status…</p>
				</div>
			</div>
		);
	}

	const activeEngine = status?.activeEngine || "off";

	return (
		<div className="authz-test-page">
			{/* Header */}
			<div className="authz-header">
				<div className="authz-header-row">
					<h1 className="authz-title">PingOne Authorize Test Page</h1>
					<button
						type="button"
						className="authz-btn authz-btn--secondary"
						onClick={resetPage}
						title="Clear all results and reset to initial state"
					>
						↺ Reset
					</button>
				</div>
				<p className="authz-subtitle">
					Evaluate authorization decisions against the active policy engine
					without submitting a real transaction.
				</p>
			</div>

			{/* Engine status banner */}
			<div
				className={`authz-banner authz-banner--${activeEngine === "pending_config" ? "pending" : activeEngine}`}
			>
				<div className="authz-banner-left">
					<EngineBadge engine={activeEngine} />
					{activeEngine === "simulated" && (
						<span className="authz-banner-note">
							In-process policy engine — same Trust Framework shape as PingOne
							Authorize. Configure PingOne Authorize in Application
							Configuration to switch to live mode.
						</span>
					)}
					{activeEngine === "pingone" && (
						<span className="authz-banner-note">
							Live PingOne Authorize decision endpoint. Decisions are evaluated
							against your configured policy in real-time.
						</span>
					)}
					{activeEngine === "off" && (
						<span className="authz-banner-note">
							Authorization is disabled. Enable it in Application Configuration
							→ PingOne Authorize. Test calls will return PERMIT (bypass mode).
						</span>
					)}
					{activeEngine === "pending_config" && (
						<span className="authz-banner-note">
							Authorization is enabled but the decision endpoint is not
							configured yet. Set authorize_decision_endpoint_id or switch to
							Simulated mode.
						</span>
					)}
				</div>
				{renderThresholds()}
			</div>

			{/* Engine Settings panel */}
			<div className="authz-engine-settings">
				<button
					type="button"
					className="authz-engine-settings-toggle"
					onClick={() => {
						setEngineSettingsOpen((o) => !o);
						setEngineSaveMsg(null);
					}}
				>
					<span>⚙ Engine Settings</span>
					<span className="authz-engine-settings-chevron">
						{engineSettingsOpen ? "▾" : "▸"}
					</span>
				</button>

				{engineSettingsOpen && (
					<div className="authz-engine-settings-body">
						<p className="authz-engine-settings-note">
							Changes require an <strong>admin session</strong>. Toggle which
							authorization engine evaluates test scenarios.
						</p>

						{/* Radio toggle */}
						<div className="authz-engine-radio-group">
							<label className={`authz-engine-radio-label${engineMode === "simulated" ? " authz-engine-radio-label--active" : ""}`}>
								<input
									type="radio"
									name="authz-engine"
									value="simulated"
									checked={engineMode === "simulated"}
									onChange={() => setEngineMode("simulated")}
								/>
								<span className="authz-engine-radio-title">Simulated (in-process)</span>
								<span className="authz-engine-radio-desc">
									In-process policy — identical HTTP shape to PingOne Authorize.
									No PingOne credentials required. Best for education and demos.
								</span>
							</label>

							<label className={`authz-engine-radio-label${engineMode === "pingone" ? " authz-engine-radio-label--active" : ""}`}>
								<input
									type="radio"
									name="authz-engine"
									value="pingone"
									checked={engineMode === "pingone"}
									onChange={() => setEngineMode("pingone")}
								/>
								<span className="authz-engine-radio-title">PingOne Authorize (live)</span>
								<span className="authz-engine-radio-desc">
									Calls your real PingOne Authorize decision endpoint. Requires
									worker app credentials and a configured decision endpoint ID.
								</span>
							</label>
						</div>

						{/* PingOne credentials — shown only when pingone selected */}
						{engineMode === "pingone" && (
							<div className="authz-engine-creds">
								<h4 className="authz-engine-creds-title">PingOne Authorize Credentials</h4>
								<div className="authz-engine-creds-grid">
									<label className="authz-label">
										Decision Endpoint ID
										<input
											type="text"
											className="authz-input"
											value={endpointId}
											onChange={(e) => setEndpointId(e.target.value)}
											placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
											autoComplete="off"
										/>
										<span className="authz-engine-creds-hint">
											From PingOne Authorize → Decision Endpoints
										</span>
									</label>
									<label className="authz-label">
										Worker App Client ID
										<input
											type="text"
											className="authz-input"
											value={workerClientId}
											onChange={(e) => setWorkerClientId(e.target.value)}
											placeholder="Worker application client_id"
											autoComplete="off"
										/>
									</label>
									<label className="authz-label">
										Worker App Client Secret
										<input
											type="password"
											className="authz-input"
											value={workerClientSecret}
											onChange={(e) => setWorkerClientSecret(e.target.value)}
											placeholder="Leave blank to keep existing secret"
											autoComplete="new-password"
										/>
										<span className="authz-engine-creds-hint">
											Cleared from UI after save. Stored server-side only.
										</span>
									</label>
								</div>
							</div>
						)}

						{/* Save feedback */}
						{engineSaveMsg && (
							<div className={`authz-engine-save-msg${engineSaveMsg.ok ? " authz-engine-save-msg--ok" : " authz-engine-save-msg--err"}`}>
								<span>{engineSaveMsg.text}</span>
								{engineSaveMsg.needsLogin && (
									<button
										type="button"
										className="authz-btn authz-btn--login"
										onClick={navigateToAdminOAuthLogin}
									>
										🔓 Sign in as Admin
									</button>
								)}
							</div>
						)}

						<div className="authz-engine-settings-actions">
							<button
								type="button"
								className="authz-btn authz-btn--primary"
								disabled={engineSaving}
								onClick={applyEngine}
							>
								{engineSaving ? "Applying…" : "Apply Engine"}
							</button>
							<button
								type="button"
								className="authz-btn authz-btn--secondary"
								onClick={() => setEngineSettingsOpen(false)}
							>
								Cancel
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Preset scenarios */}
			<section className="authz-section">
				<h2 className="authz-section-title">Preset Scenarios</h2>
				<p className="authz-section-desc">
					Each card tests a specific policy branch. Run them individually or all
					at once.
				</p>
				<div className="authz-scenarios-grid">
					{PRESET_SCENARIOS.map((scenario) => {
						const result = scenarioResults[scenario.id];
						const running = scenarioRunning[scenario.id];
						return (
							<div
								key={scenario.id}
								className={`authz-scenario-card${result ? " authz-scenario-card--ran" : ""}`}
							>
								<div className="authz-scenario-header">
									<span className="authz-scenario-label">{scenario.label}</span>
									<HintBadge hint={scenario.hint} />
								</div>
								<p className="authz-scenario-desc">{scenario.desc}</p>
								<div className="authz-scenario-params">
									<span>
										Amount: <strong>${scenario.amount.toLocaleString()}</strong>
									</span>
									<span>
										Type: <strong>{scenario.type}</strong>
									</span>
									{scenario.acr && (
										<span>
											ACR: <strong>{scenario.acr}</strong>
										</span>
									)}
								</div>
								<button
									type="button"
									className="authz-btn authz-btn--primary"
									disabled={running}
									onClick={() => runScenario(scenario)}
								>
									{running ? "Running…" : "Run"}
								</button>
								{renderScenarioResult(result)}
							</div>
						);
					})}
				</div>
				<button
					type="button"
					className="authz-btn authz-btn--secondary"
					disabled={Object.values(scenarioRunning).some(Boolean)}
					onClick={() => PRESET_SCENARIOS.forEach((s) => runScenario(s))}
				>
					Run All Scenarios
				</button>
			</section>

			{/* Custom evaluation */}
			<section className="authz-section">
				<h2 className="authz-section-title">Custom Evaluation</h2>
				<p className="authz-section-desc">
					Test any combination of amount, transaction type, and ACR value.
				</p>
				<div className="authz-custom-form">
					<label className="authz-label">
						Amount (USD)
						<input
							type="number"
							className="authz-input"
							value={customAmount}
							min="1"
							onChange={(e) => setCustomAmount(e.target.value)}
							placeholder="e.g. 25000"
						/>
					</label>
					<label className="authz-label">
						Transaction Type
						<select
							className="authz-select"
							value={customType}
							onChange={(e) => setCustomType(e.target.value)}
						>
							<option value="transfer">Transfer</option>
							<option value="withdrawal">Withdrawal</option>
							<option value="deposit">Deposit</option>
						</select>
					</label>
					<label className="authz-label">
						ACR Value
						<input
							type="text"
							className="authz-input"
							value={customAcr}
							onChange={(e) => setCustomAcr(e.target.value)}
							placeholder="e.g. Multi_Factor (leave blank for none)"
						/>
					</label>
					<button
						type="button"
						className="authz-btn authz-btn--primary authz-btn--evaluate"
						disabled={customRunning}
						onClick={runCustom}
					>
						{customRunning ? "Evaluating…" : "Evaluate"}
					</button>
				</div>

				{customResult && (
					<div className="authz-custom-result">
						{customResult.error ? (
							<div className="authz-result-error">
								Error: {customResult.error}
							</div>
						) : (
							<>
								<DecisionBadge
									decision={customResult.decision}
									stepUpRequired={customResult.stepUpRequired}
									large
								/>
								<div className="authz-result-details">
									<div className="authz-result-row">
										<span className="authz-result-key">Engine</span>
										<span className="authz-result-val">
											{customResult.engine}
										</span>
									</div>
									<div className="authz-result-row">
										<span className="authz-result-key">Path</span>
										<span className="authz-result-val">
											{customResult.path}
										</span>
									</div>
									{customResult.decisionId && (
										<div className="authz-result-row">
											<span className="authz-result-key">Decision ID</span>
											<span className="authz-result-val authz-result-val--mono">
												{customResult.decisionId}
											</span>
										</div>
									)}
									<div className="authz-result-row">
										<span className="authz-result-key">Step-up required</span>
										<span className="authz-result-val">
											{String(customResult.stepUpRequired)}
										</span>
									</div>
								</div>
								<RawJson data={customResult.raw} />
							</>
						)}
					</div>
				)}
			</section>

			{/* Run history */}
			{history.length > 0 && (
				<section className="authz-section">
					<h2 className="authz-section-title">Run History</h2>
					<table className="authz-history-table">
						<thead>
							<tr>
								<th>Scenario</th>
								<th>Decision</th>
								<th>Engine</th>
								<th>Step-up</th>
								<th>Decision ID</th>
							</tr>
						</thead>
						<tbody>
							{history.map((h, i) => (
								<tr key={i}>
									<td>{h._label}</td>
									<td>
										<DecisionBadge
											decision={h.decision}
											stepUpRequired={h.stepUpRequired}
										/>
									</td>
									<td>{h.engine}</td>
									<td>{h.error ? "—" : String(h.stepUpRequired)}</td>
									<td className="authz-td-mono">{h.decisionId || "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
		</div>
	);
}
