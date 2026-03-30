// banking_api_ui/src/components/SetupPage.js
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import apiClient from '../services/apiClient';

const REPO_ROOT_CMD = 'cd path/to/Banking   # repository root (parent of banking_api_ui/)';

/**
 * Public deployment setup: Vercel CLI copy targets, PingOne bootstrap plan from BFF, optional admin probe + run.
 */
export default function SetupPage() {
  const [planSteps, setPlanSteps] = useState([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState(null);
  const [probeResult, setProbeResult] = useState(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [workerCred, setWorkerCred] = useState(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState(
    () => (typeof window !== 'undefined' ? window.location.origin : '')
  );
  const [bootstrapDryRun, setBootstrapDryRun] = useState(true);
  const [bootstrapIncludeUsers, setBootstrapIncludeUsers] = useState(true);
  const [setupMasterKey, setSetupMasterKey] = useState('');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/api/setup/plan');
        if (!cancelled && data?.ok && Array.isArray(data.steps)) {
          setPlanSteps(data.steps);
        } else if (!cancelled) {
          setPlanError(data?.error || 'Could not load bootstrap plan.');
        }
      } catch (e) {
        if (!cancelled) {
          setPlanError(e.response?.data?.message || e.message || 'Could not load bootstrap plan.');
        }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/api/admin/setup/worker-credentials');
        if (!cancelled) setWorkerCred(data);
      } catch {
        if (!cancelled) setWorkerCred(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleManagementProbe = useCallback(async () => {
    setProbeLoading(true);
    setProbeResult(null);
    try {
      const { data } = await apiClient.get('/api/admin/setup/management-probe');
      setProbeResult(data);
      if (data?.ok) {
        toast.success(`PingOne Management API OK — ${data.applicationCount ?? 0} OIDC app(s).`);
      } else {
        toast.warning(data?.error || 'Probe failed — check server credentials.');
      }
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.message || e.message || 'Request failed';
      setProbeResult({ ok: false, error: msg, httpStatus: status });
      if (status === 401) {
        toast.info('Sign in as an admin, then try again (session required).');
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
        headers['X-Setup-Master-Key'] = setupMasterKey.trim();
      }
      const { data } = await apiClient.post(
        '/api/admin/setup/pingone-bootstrap-run',
        {
          publicBaseUrl: publicBaseUrl.trim(),
          dryRun: bootstrapDryRun,
          includeUsers: bootstrapIncludeUsers,
        },
        { headers }
      );
      setBootstrapResult(data);
      if (data?.ok) {
        toast.success(bootstrapDryRun ? 'Dry run complete — see steps below.' : 'PingOne bootstrap finished.');
      } else {
        toast.warning(data?.errors?.[0]?.message || 'Bootstrap completed with errors — see JSON below.');
      }
    } catch (e) {
      const status = e.response?.status;
      const body = e.response?.data;
      setBootstrapResult(body || { ok: false, error: e.message });
      if (status === 401) {
        toast.info('Sign in as an admin to run bootstrap.');
      } else if (status === 403) {
        toast.error(body?.message || 'Forbidden — set X-Setup-Master-Key if your server requires SETUP_MASTER_KEY.');
      } else {
        toast.error(body?.message || e.message || 'Bootstrap request failed');
      }
    } finally {
      setBootstrapLoading(false);
    }
  }, [publicBaseUrl, bootstrapDryRun, bootstrapIncludeUsers, setupMasterKey]);

  const headerStyle = {
    background: 'linear-gradient(to bottom, #1e40af 0%, #1e3a8a 100%)',
    color: 'white',
    padding: '1rem 0',
    boxShadow: '0 2px 4px rgba(0,0,0,.15)',
  };

  const cardStyle = {
    background: 'white',
    borderRadius: '0.5rem',
    border: '1px solid #e5e7eb',
    padding: '1.25rem 1.5rem',
    marginBottom: '1.25rem',
  };

  const copy = useCallback((text, label) => {
    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard not available in this browser');
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied ${label}`),
      () => toast.error('Copy failed')
    );
  }, []);

  const btnStyle = {
    marginRight: '0.5rem',
    marginBottom: '0.5rem',
    padding: '0.45rem 0.85rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    borderRadius: '0.375rem',
    border: '1px solid #cbd5e1',
    background: '#f8fafc',
    cursor: 'pointer',
    color: '#1e293b',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={headerStyle}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Deployment setup</h1>
            <p style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.35rem', maxWidth: '44rem' }}>
              Run the Vercel environment wizard on your machine, then finish PingOne values in Application Configuration.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/marketing" style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem' }}>← Home</Link>
            <Link
              to="/onboarding"
              style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem' }}
            >
              Setup checklist
            </Link>
            <Link
              to="/setup/pingone"
              style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem' }}
            >
              PingOne reference
            </Link>
            <Link
              to="/config"
              style={{
                display: 'inline-block',
                background: 'white',
                color: '#1e3a8a',
                fontWeight: 600,
                fontSize: '0.875rem',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                textDecoration: 'none',
              }}
            >
              Application Configuration
            </Link>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '2rem 20px', maxWidth: '800px' }}>
        <div style={{ ...cardStyle, background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0', color: '#1e3a8a' }}>Where to run commands</h2>
          <p style={{ margin: 0, color: '#1e40af', fontSize: '0.9375rem', lineHeight: 1.6 }}>
            <code>npm run setup:vercel</code> is defined in the <strong>repository root</strong> <code>package.json</code> (the folder that contains <code>scripts/setup-vercel-env.js</code>), not inside <code>banking_api_ui/</code>.
            Clone the repo, run <code>npm install</code> at the root, link your Vercel project (<code>vercel link</code>), then use the buttons below to copy commands into your terminal.
          </p>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.75rem 0' }}>Vercel environment wizard</h2>
          <p style={{ margin: '0 0 0.75rem 0', color: '#4b5563', fontSize: '0.9375rem', lineHeight: 1.6 }}>
            Interactive wizard: detects conflicts, validates Upstash connectivity, can generate secrets, writes <code>.env.vercel.local</code>, and optionally pushes variables to Vercel with <code>vercel env add</code> (production / preview / development).
          </p>
          <div style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              style={btnStyle}
              onClick={() => copy('npm run setup:vercel', 'npm run setup:vercel')}
            >
              Copy: npm run setup:vercel
            </button>
            <button
              type="button"
              style={btnStyle}
              onClick={() => copy('npm run setup:vercel:check', 'npm run setup:vercel:check')}
            >
              Copy: npm run setup:vercel:check
            </button>
            <button
              type="button"
              style={btnStyle}
              onClick={() => copy('node scripts/setup-vercel-env.js', 'node scripts/setup-vercel-env.js')}
            >
              Copy: node scripts/setup-vercel-env.js
            </button>
            <button
              type="button"
              style={btnStyle}
              onClick={() => copy('node scripts/setup-vercel-env.js --check', 'check-only command')}
            >
              Copy: …setup-vercel-env.js --check
            </button>
          </div>
          <p style={{ margin: '0 0 0.5rem 0', color: '#64748b', fontSize: '0.8125rem' }}>
            Optional reminder (paste into terminal after <code>cd</code> to repo root):
          </p>
          <button
            type="button"
            style={{ ...btnStyle, display: 'block' }}
            onClick={() => copy(`${REPO_ROOT_CMD}\nnpm run setup:vercel`, 'cd + npm run')}
          >
            Copy: cd hint + npm run setup:vercel
          </button>
          <ul style={{ margin: '1rem 0 0 0', paddingLeft: '1.25rem', color: '#374151', fontSize: '0.875rem', lineHeight: 1.65 }}>
            <li>See <code>.env.vercel.example</code> at the repo root for variable names.</li>
            <li>README: search for <code>setup:vercel</code> for troubleshooting (session store, Upstash).</li>
          </ul>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.75rem 0' }}>PingOne bootstrap plan (example manifest)</h2>
          <p style={{ margin: '0 0 0.75rem 0', color: '#4b5563', fontSize: '0.9375rem', lineHeight: 1.6 }}>
            Ordered checklist from <code>config/pingone-bootstrap.manifest.example.json</code>. Full automation runs via{' '}
            <code>npm run pingone:bootstrap</code> at the repo root; use <code>--probe</code> to verify Management API access after credentials exist.
          </p>
          <div style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              style={btnStyle}
              onClick={() => copy('npm run pingone:bootstrap', 'npm run pingone:bootstrap')}
            >
              Copy: npm run pingone:bootstrap
            </button>
            <button
              type="button"
              style={btnStyle}
              onClick={() => copy('npm run pingone:bootstrap:probe', 'probe command')}
            >
              Copy: npm run pingone:bootstrap:probe
            </button>
            <button
              type="button"
              style={{ ...btnStyle, background: '#1e3a8a', color: '#fff', borderColor: '#1e3a8a' }}
              onClick={handleManagementProbe}
              disabled={probeLoading}
            >
              {probeLoading ? 'Testing…' : 'Test PingOne Management API (admin)'}
            </button>
          </div>
          {planLoading && <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading plan…</p>}
          {planError && <p style={{ color: '#b45309', fontSize: '0.875rem' }}>{planError}</p>}
          {!planLoading && !planError && planSteps.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: '1.25rem', color: '#374151', fontSize: '0.875rem', lineHeight: 1.65 }}>
              {planSteps.map((s, i) => (
                <li key={i} style={{ marginBottom: '0.35rem' }}>{s}</li>
              ))}
            </ol>
          )}
          {probeResult && (
            <pre
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#f1f5f9',
                borderRadius: '6px',
                fontSize: '0.75rem',
                overflow: 'auto',
                maxHeight: '220px',
                border: '1px solid #e2e8f0',
              }}
            >
              {JSON.stringify(probeResult, null, 2)}
            </pre>
          )}
        </div>

        <div style={{ ...cardStyle, borderColor: '#fde68a', background: '#fffbeb' }}>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.75rem 0', color: '#92400e' }}>
            PingOne bootstrap run (admin) — apps + demo users
          </h2>
          <p style={{ margin: '0 0 0.75rem 0', color: '#78350f', fontSize: '0.9375rem', lineHeight: 1.6 }}>
            <strong>Worker token:</strong> the server uses a <strong>Management API</strong> app with{' '}
            <strong>client_credentials</strong> — <code>pingone_client_id</code> / <code>pingone_client_secret</code>{' '}
            (saved after CIMD registration or in Config) or env <code>PINGONE_MANAGEMENT_CLIENT_ID</code> /{' '}
            <code>PINGONE_MANAGEMENT_CLIENT_SECRET</code>. That is separate from{' '}
            <code>PINGONE_AUTHORIZE_WORKER_*</code> (PingOne Authorize only) unless you grant the same app Management roles in PingOne.
          </p>
          {workerCred && (
            <ul style={{ margin: '0 0 0.75rem 0', paddingLeft: '1.25rem', color: '#78350f', fontSize: '0.875rem' }}>
              <li>
                Management worker (bootstrap):{' '}
                <strong>{workerCred.management?.managementWorkerReady ? 'configured' : 'not configured'}</strong>
                {workerCred.management?.environmentIdSet === false && ' — set PINGONE_ENVIRONMENT_ID'}
              </li>
              <li>
                Authorize worker:{' '}
                <strong>{workerCred.authorizeWorkerReady ? 'configured' : 'not configured'}</strong>
                {' '}(for decision endpoints / Authorize, not this bootstrap)
              </li>
            </ul>
          )}
          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
            Public base URL (HTTPS, no trailing slash)
          </label>
          <input
            type="url"
            value={publicBaseUrl}
            onChange={(e) => setPublicBaseUrl(e.target.value)}
            placeholder="https://your-app.vercel.app"
            style={{
              width: '100%',
              maxWidth: '28rem',
              padding: '0.5rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              marginBottom: '0.75rem',
              fontSize: '0.875rem',
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#374151' }}>
            <input
              type="checkbox"
              checked={bootstrapDryRun}
              onChange={(e) => setBootstrapDryRun(e.target.checked)}
            />
            Dry run only (no creates)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>
            <input
              type="checkbox"
              checked={bootstrapIncludeUsers}
              onChange={(e) => setBootstrapIncludeUsers(e.target.checked)}
            />
            Include demo directory users (bankadmin / bankuser)
          </label>
          <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.8125rem', color: '#64748b' }}>
            If the server has <code>SETUP_MASTER_KEY</code>, paste it here (sent as <code>X-Setup-Master-Key</code> only for this request; not stored).
          </p>
          <input
            type="password"
            autoComplete="off"
            value={setupMasterKey}
            onChange={(e) => setSetupMasterKey(e.target.value)}
            placeholder="Optional setup master key"
            style={{
              width: '100%',
              maxWidth: '28rem',
              padding: '0.5rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              marginBottom: '0.75rem',
              fontSize: '0.875rem',
            }}
          />
          <button
            type="button"
            style={{ ...btnStyle, background: '#b45309', color: '#fff', borderColor: '#b45309' }}
            onClick={handlePingOneBootstrapRun}
            disabled={bootstrapLoading || !publicBaseUrl.trim()}
          >
            {bootstrapLoading ? 'Running…' : 'Run PingOne bootstrap'}
          </button>
          {bootstrapResult && (
            <pre
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#f1f5f9',
                borderRadius: '6px',
                fontSize: '0.72rem',
                overflow: 'auto',
                maxHeight: '320px',
                border: '1px solid #e2e8f0',
              }}
            >
              {JSON.stringify(bootstrapResult, null, 2)}
            </pre>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <Link to="/" style={{ fontSize: '0.9375rem', color: '#2563eb' }}>Return to sign in</Link>
          <Link to="/onboarding" style={{ fontSize: '0.9375rem', color: '#2563eb' }}>PingOne checklist</Link>
        </div>
      </div>
    </div>
  );
}
