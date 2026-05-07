// banking_api_ui/src/components/SetupPage.js
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import apiClient from "../services/apiClient";
import { useTheme } from "../context/ThemeContext";
import "./SetupPage.css";
import McpGatewayConfig from "./McpGatewayConfig";

const REPO_ROOT_CMD =
  "cd path/to/Banking   # repository root (parent of banking_api_ui/)";

const SUITES = [
  { key: "bff:unit", label: "BFF — unit tests" },
  { key: "bff:auth", label: "BFF — auth tests" },
  { key: "bff:all", label: "BFF — all tests" },
  { key: "ui:unit", label: "UI — unit tests" },
];

export default function SetupPage() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("deployment");
  const [planSteps, setPlanSteps] = useState([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState(null);
  const [probeResult, setProbeResult] = useState(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [workerCred, setWorkerCred] = useState(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );
  const [bootstrapDryRun, setBootstrapDryRun] = useState(true);
  const [bootstrapIncludeUsers, setBootstrapIncludeUsers] = useState(true);
  const [setupMasterKey, setSetupMasterKey] = useState("");
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);

  const [selectedSuite, setSelectedSuite] = useState("bff:unit");
  const [testRunning, setTestRunning] = useState(false);
  const [testOutput, setTestOutput] = useState("");
  const [testExitCode, setTestExitCode] = useState(null);
  const outputRef = useRef(null);

  const handleRunTests = useCallback(async () => {
    setTestOutput("");
    setTestExitCode(null);
    setTestRunning(true);
    try {
      const resp = await fetch("/api/admin/setup/run-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suite: selectedSuite }),
        credentials: "include",
      });
      if (!resp.ok) {
        toast.error(`Server error ${resp.status}`);
        setTestRunning(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break outer;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "stdout" || evt.type === "stderr") {
              setTestOutput((prev) => `${prev}${evt.text}`);
              if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
              }
            } else if (evt.type === "done") {
              setTestExitCode(evt.exitCode);
            } else if (evt.type === "error") {
              setTestOutput((prev) => `${prev}\nError: ${evt.message}\n`);
            }
          } catch {}
        }
      }
    } catch (e) {
      setTestOutput((prev) => `${prev}\nFetch error: ${e.message}\n`);
    } finally {
      setTestRunning(false);
    }
  }, [selectedSuite]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get("/api/setup/plan");
        if (!cancelled && data?.ok && Array.isArray(data.steps)) {
          setPlanSteps(data.steps);
        } else if (!cancelled) {
          setPlanError(data?.error || "Could not load bootstrap plan.");
        }
      } catch (e) {
        if (!cancelled) {
          setPlanError(
            e.response?.data?.message ||
              e.message ||
              "Could not load bootstrap plan.",
          );
        }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get(
          "/api/admin/setup/worker-credentials",
        );
        if (!cancelled) setWorkerCred(data);
      } catch {
        if (!cancelled) setWorkerCred(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleManagementProbe = useCallback(async () => {
    setProbeLoading(true);
    setProbeResult(null);
    try {
      const { data } = await apiClient.get("/api/admin/setup/management-probe");
      setProbeResult(data);
      if (data?.ok) {
        toast.success(
          `PingOne Management API OK — ${data.applicationCount ?? 0} OIDC app(s).`,
        );
      } else {
        toast.warning(
          data?.error || "Probe failed — check server credentials.",
        );
      }
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.message || e.message || "Request failed";
      setProbeResult({ ok: false, error: msg, httpStatus: status });
      if (status === 401) {
        toast.info("Sign in as an admin, then try again (session required).");
      } else {
        toast.error(msg);
      }
    } finally {
      setProbeLoading(false);
    }
  }, []);

  const handlePingOneBootstrapRun = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapResult(null);
    try {
      const headers = {};
      if (setupMasterKey.trim()) {
        headers["X-Setup-Master-Key"] = setupMasterKey.trim();
      }
      const { data } = await apiClient.post(
        "/api/admin/setup/pingone-bootstrap-run",
        {
          publicBaseUrl: publicBaseUrl.trim(),
          dryRun: bootstrapDryRun,
          includeUsers: bootstrapIncludeUsers,
        },
        { headers },
      );
      setBootstrapResult(data);
      if (data?.ok) {
        toast.success(
          bootstrapDryRun
            ? "Dry run complete — see steps below."
            : "PingOne bootstrap finished.",
        );
      } else {
        toast.warning(
          data?.errors?.[0]?.message ||
            "Bootstrap completed with errors — see JSON below.",
        );
      }
    } catch (e) {
      const status = e.response?.status;
      const body = e.response?.data;
      setBootstrapResult(body || { ok: false, error: e.message });
      if (status === 401) {
        toast.info("Sign in as an admin to run bootstrap.");
      } else if (status === 403) {
        toast.error(
          body?.message ||
            "Forbidden — set X-Setup-Master-Key if your server requires SETUP_MASTER_KEY.",
        );
      } else {
        toast.error(body?.message || e.message || "Bootstrap request failed");
      }
    } finally {
      setBootstrapLoading(false);
    }
  }, [publicBaseUrl, bootstrapDryRun, bootstrapIncludeUsers, setupMasterKey]);

  const copy = useCallback((text, label) => {
    if (!navigator.clipboard?.writeText) {
      toast.error("Clipboard not available in this browser");
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied ${label}`),
      () => toast.error("Copy failed"),
    );
  }, []);

  return (
    <div className="sp-root">
      {/* ── Page header ── */}
      <header className="sp-page-header">
        <div className="sp-header-content">
          <div>
            <h1 className="sp-header-title">Deployment setup</h1>
            <p className="sp-header-subtitle">
              Run the Vercel environment wizard on your machine, then finish
              PingOne values in Application Configuration.
            </p>
          </div>
          <div className="sp-header-actions">
            <Link to="/" className="sp-header-link">
              Back to Home
            </Link>
            <Link to="/onboarding" className="sp-header-link">
              Setup checklist
            </Link>
            <Link to="/setup/pingone" className="sp-header-link">
              PingOne reference
            </Link>
            <Link to="/config" className="sp-header-btn sp-header-btn--solid">
              Application Configuration
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="sp-header-btn"
              title={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="sp-tabs">
        <div className="sp-tabs-inner">
          {[
            { key: "deployment", label: "Deployment" },
            { key: "tests", label: "Run Tests" },
            { key: "mcp-gateway", label: "MCP Gateway" },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`sp-tab${activeTab === key ? " sp-tab--active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Deployment tab ── */}
      {activeTab === "deployment" && (
        <div className="sp-body">
          {/* Where to run commands */}
          <div className="sp-alert sp-alert--info">
            <p className="sp-alert-title">Where to run commands</p>
            <p>
              <code>npm run setup:vercel</code> is defined in the{" "}
              <strong>repository root</strong> <code>package.json</code> (the
              folder that contains <code>scripts/setup-vercel-env.js</code>),
              not inside <code>banking_api_ui/</code>. Clone the repo, run{" "}
              <code>npm install</code> at the root, link your Vercel project (
              <code>vercel link</code>), then use the buttons below to copy
              commands into your terminal.
            </p>
          </div>

          {/* Vercel environment wizard */}
          <div className="sp-panel">
            <h2 className="sp-panel-title">Vercel environment wizard</h2>
            <p className="sp-panel-desc">
              Interactive wizard: detects conflicts, validates Upstash
              connectivity, can generate secrets, writes{" "}
              <code>.env.vercel.local</code>, and optionally pushes variables to
              Vercel with <code>vercel env add</code> (production / preview /
              development).
            </p>
            <div className="sp-btn-row">
              <button
                type="button"
                className="sp-btn"
                onClick={() =>
                  copy("npm run setup:vercel", "npm run setup:vercel")
                }
              >
                Copy: npm run setup:vercel
              </button>
              <button
                type="button"
                className="sp-btn"
                onClick={() =>
                  copy(
                    "npm run setup:vercel:check",
                    "npm run setup:vercel:check",
                  )
                }
              >
                Copy: npm run setup:vercel:check
              </button>
              <button
                type="button"
                className="sp-btn"
                onClick={() =>
                  copy(
                    "node scripts/setup-vercel-env.js",
                    "node scripts/setup-vercel-env.js",
                  )
                }
              >
                Copy: node scripts/setup-vercel-env.js
              </button>
              <button
                type="button"
                className="sp-btn"
                onClick={() =>
                  copy(
                    "node scripts/setup-vercel-env.js --check",
                    "check-only command",
                  )
                }
              >
                Copy: …setup-vercel-env.js --check
              </button>
            </div>
            <p className="sp-field-hint" style={{ marginBottom: "8px" }}>
              Optional reminder (paste into terminal after <code>cd</code> to
              repo root):
            </p>
            <div className="sp-btn-row">
              <button
                type="button"
                className="sp-btn"
                onClick={() =>
                  copy(`${REPO_ROOT_CMD}\nnpm run setup:vercel`, "cd + npm run")
                }
              >
                Copy: cd hint + npm run setup:vercel
              </button>
            </div>
            <ul className="sp-steps-list" style={{ marginTop: "10px" }}>
              <li>
                See <code>.env.vercel.example</code> at the repo root for
                variable names.
              </li>
              <li>
                README: search for <code>setup:vercel</code> for troubleshooting
                (session store, Upstash).
              </li>
            </ul>
          </div>

          {/* PingOne bootstrap plan */}
          <div className="sp-panel">
            <h2 className="sp-panel-title">
              PingOne bootstrap plan (example manifest)
            </h2>
            <p className="sp-panel-desc">
              Ordered checklist from{" "}
              <code>config/pingone-bootstrap.manifest.example.json</code>. Full
              automation runs via <code>npm run pingone:bootstrap</code> at the
              repo root; use <code>--probe</code> to verify Management API
              access after credentials exist.
            </p>
            <div className="sp-btn-row">
              <button
                type="button"
                className="sp-btn"
                onClick={() =>
                  copy("npm run pingone:bootstrap", "npm run pingone:bootstrap")
                }
              >
                Copy: npm run pingone:bootstrap
              </button>
              <button
                type="button"
                className="sp-btn"
                onClick={() =>
                  copy("npm run pingone:bootstrap:probe", "probe command")
                }
              >
                Copy: npm run pingone:bootstrap:probe
              </button>
              <button
                type="button"
                className="sp-btn sp-btn--primary"
                onClick={handleManagementProbe}
                disabled={probeLoading}
              >
                {probeLoading
                  ? "Testing…"
                  : "Test PingOne Management API (admin)"}
              </button>
            </div>
            {planLoading && <p className="sp-field-hint">Loading plan…</p>}
            {planError && (
              <div
                className="sp-alert sp-alert--error"
                style={{ marginTop: "12px" }}
              >
                {planError}
              </div>
            )}
            {!planLoading && !planError && planSteps.length > 0 && (
              <ol className="sp-steps-list" style={{ marginTop: "12px" }}>
                {planSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {probeResult && (
              <pre className="sp-json-preview">
                {JSON.stringify(probeResult, null, 2)}
              </pre>
            )}
          </div>

          {/* PingOne bootstrap run */}
          <div className="sp-panel">
            <div
              className="sp-alert sp-alert--warning"
              style={{ marginBottom: "20px" }}
            >
              <p className="sp-alert-title">
                PingOne bootstrap run (admin) — apps + demo users
              </p>
              <p>
                <strong>Worker token:</strong> the server uses a{" "}
                <strong>Management API</strong> app with{" "}
                <strong>client_credentials</strong> —{" "}
                <code>pingone_client_id</code> /{" "}
                <code>pingone_client_secret</code> (saved after CIMD
                registration or in Config) or env{" "}
                <code>PINGONE_MANAGEMENT_CLIENT_ID</code> /{" "}
                <code>PINGONE_MANAGEMENT_CLIENT_SECRET</code>. That is separate
                from <code>PINGONE_AUTHORIZE_WORKER_*</code> (PingOne Authorize
                only) unless you grant the same app Management roles in PingOne.
              </p>
            </div>

            {workerCred && (
              <ul className="sp-info-list">
                <li>
                  Management worker (bootstrap):{" "}
                  <strong>
                    {workerCred.management?.managementWorkerReady
                      ? "configured"
                      : "not configured"}
                  </strong>
                  {workerCred.management?.environmentIdSet === false &&
                    " — set PINGONE_ENVIRONMENT_ID"}
                </li>
                <li>
                  Authorize worker:{" "}
                  <strong>
                    {workerCred.authorizeWorkerReady
                      ? "configured"
                      : "not configured"}
                  </strong>{" "}
                  (for decision endpoints / Authorize, not this bootstrap)
                </li>
              </ul>
            )}

            <div className="sp-field-group">
              <label htmlFor="bootstrap-public-url" className="sp-field-label">
                Public base URL (HTTPS, no trailing slash)
              </label>
              <input
                id="bootstrap-public-url"
                type="url"
                className="sp-input"
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
                placeholder="https://your-app.vercel.app"
              />
            </div>

            <label className="sp-checkbox-label">
              <input
                type="checkbox"
                checked={bootstrapDryRun}
                onChange={(e) => setBootstrapDryRun(e.target.checked)}
              />
              Dry run only (no creates)
            </label>
            <label
              className="sp-checkbox-label"
              style={{ marginBottom: "16px" }}
            >
              <input
                type="checkbox"
                checked={bootstrapIncludeUsers}
                onChange={(e) => setBootstrapIncludeUsers(e.target.checked)}
              />
              Include demo directory users (bankadmin / bankuser)
            </label>

            <div className="sp-field-group">
              <p className="sp-field-hint" style={{ marginBottom: "6px" }}>
                If the server has <code>SETUP_MASTER_KEY</code>, paste it here
                (sent as <code>X-Setup-Master-Key</code> only for this request;
                not stored).
              </p>
              <input
                type="password"
                autoComplete="off"
                className="sp-input"
                value={setupMasterKey}
                onChange={(e) => setSetupMasterKey(e.target.value)}
                placeholder="Optional setup master key"
              />
            </div>

            <button
              type="button"
              className="sp-btn sp-btn--danger"
              onClick={handlePingOneBootstrapRun}
              disabled={bootstrapLoading || !publicBaseUrl.trim()}
            >
              {bootstrapLoading ? "Running…" : "Run PingOne bootstrap"}
            </button>

            {bootstrapResult && (
              <pre className="sp-json-preview">
                {JSON.stringify(bootstrapResult, null, 2)}
              </pre>
            )}
          </div>

          {/* Education content */}
          <div className="sp-alert sp-alert--purple">
            <p className="sp-alert-title">Keeping education content current</p>
            <p>
              The learning panels (LLM Landscape, IETF Standards, Agent
              Builders, AI Platforms, OAuth Specs) need periodic updates as new
              RFC drafts publish, model families change, and agent frameworks
              release new versions. A ready-made agent prompt automates this
              refresh.
            </p>
            <p>
              <strong>File:</strong> <code>EDUCATION_REFRESH_PROMPT.md</code> at
              the repository root.
            </p>
            <p>
              <strong>How to use it:</strong> Open the repo in Claude Code,
              paste the contents of <code>EDUCATION_REFRESH_PROMPT.md</code> as
              your first message, and let the agent run. It will research
              current RFC statuses, model versions, and framework releases, then
              update all education panel files and create a new{" "}
              <strong>What's New</strong> page that lists every change made in
              that refresh. Recommended frequency: every 3 months, or after any
              major RFC publication.
            </p>
            <p>
              Covers: IETFStandardsPanel, LlmLandscapePanel,
              AgentBuilderLandscapePanel, AiPlatformLandscapePanel,
              TokenChainEducationPanel, OAuthSpecsEducationPanel,
              AgenticTrustEducation, MCPToolsEducation, and ActorTokenEducation.
            </p>
          </div>

          <div className="sp-footer-links">
            <Link to="/" className="sp-footer-link">
              Return to sign in
            </Link>
            <Link to="/onboarding" className="sp-footer-link">
              PingOne checklist
            </Link>
          </div>
        </div>
      )}

      {/* ── Run Tests tab ── */}
      {activeTab === "tests" && (
        <div className="sp-body">
          {/* Cost warning */}
          <div className="sp-alert sp-alert--warning">
            <p className="sp-alert-title">
              Warning: running tests is expensive
            </p>
            <p>
              Tests spawn Jest worker processes on the server. BFF suites take
              15–60 seconds; the UI suite compiles React and takes 60–120
              seconds. Only run this on a development server — never on a shared
              or production instance. Admin session required.
            </p>
          </div>

          {/* Suite selector */}
          <div className="sp-panel">
            <h2 className="sp-panel-title">Select suite and run</h2>
            <div style={{ marginBottom: "14px" }}>
              {SUITES.map(({ key, label }) => (
                <label key={key} className="sp-radio-label">
                  <input
                    type="radio"
                    name="test-suite"
                    value={key}
                    checked={selectedSuite === key}
                    onChange={() => setSelectedSuite(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <button
                type="button"
                className={`sp-btn${testRunning ? "" : " sp-btn--primary"}`}
                onClick={handleRunTests}
                disabled={testRunning}
              >
                {testRunning ? "Running…" : "Run tests"}
              </button>
              {testExitCode !== null && (
                <span
                  className={
                    testExitCode === 0 ? "sp-status-ok" : "sp-status-fail"
                  }
                >
                  {testExitCode === 0
                    ? "Passed"
                    : `Failed (exit ${testExitCode})`}
                </span>
              )}
            </div>
          </div>

          {/* Terminal output */}
          {(testOutput || testRunning) && (
            <div className="sp-panel">
              <h2 className="sp-panel-title">Output</h2>
              <pre ref={outputRef} className="sp-terminal">
                {testOutput || "Starting…"}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeTab === "mcp-gateway" && (
        <div className="container sp-tab-content">
          <McpGatewayConfig />
        </div>
      )}
    </div>
  );
}
