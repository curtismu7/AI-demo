import { useCallback, useEffect, useState } from "react";
import apiClient from "../services/apiClient";
import { notifyError, notifySuccess } from "../utils/appToast";
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

	const pushHistory = useCallback((result, label) => {
		setHistory((h) =>
			[{ ...result, _label: label, _ts: Date.now() }, ...h].slice(0, 8),
		);
	}, []);

	// Load engine status on mount
	useEffect(() => {
		apiClient
			.get("/api/authorize/test-status")
			.then(({ data }) => setStatus(data))
			.catch((err) => setStatus({ error: err.message }))
			.finally(() => setStatusLoading(false));
	}, []);

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
				<h1 className="authz-title">PingOne Authorize Test Page</h1>
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
