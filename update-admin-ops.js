#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filePath = '/Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/components/BankingAdminOps.js';

// Read the current file
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update the comment/docstring
content = content.replace(
  /\/\*\*[\s\S]*?Admin-only banking operations:.*?\*\//,
  `/**
 * Admin-only banking operations: lookup by account number fragment, latest activity,
 * delete account/transaction, seed fake card/fee charges for demos.
 * NEW: Fix PingOne scope configuration for existing environments.
 */`
);

// 2. Add scope state after transactions state
const stateInsertPoint = "const [transactions, setTransactions] = useState([]);";
if (content.includes(stateInsertPoint)) {
  const scopeState = `

  // Scope update state
  const [updatingScopes, setUpdatingScopes] = useState(false);
  const [scopeSteps, setScopeSteps] = useState([]);
  const [scopeSummary, setScopeSummary] = useState('');
  const [scopeError, setScopeError] = useState('');`;
  
  content = content.replace(stateInsertPoint, stateInsertPoint + scopeState);
}

// 3. Add the handleFixPingOneScopes function before runLookup
const runLookupStart = "const runLookup = useCallback(async () => {";
if (content.includes(runLookupStart)) {
  const newFunction = `const handleFixPingOneScopes = useCallback(async () => {
    setScopeSteps([]);
    setScopeSummary('');
    setScopeError('');
    setUpdatingScopes(true);

    try {
      const { data } = await bffAxios.post('/api/admin/pingone/update-scopes');
      setScopeSteps(data.steps || []);
      setScopeSummary(data.summary || 'Update completed');
      if (data.success) {
        notifySuccess(data.summary || 'PingOne scopes updated successfully');
      } else {
        notifyWarning(data.summary || 'Scope update completed with warnings');
      }
    } catch (err) {
      const st = err.response?.status;
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Scope update failed';
      if (st === 401) {
        toastAdminSessionError('Your session has expired. Please log in again.', navigateToAdminOAuthLogin);
      } else if (st === 403) {
        setScopeError('Admin access required.');
        notifyError('Admin access required.');
      } else if (st === 400) {
        setScopeError('Missing environment configuration. Contact an administrator.');
        notifyError('Missing PingOne credentials in environment.');
      } else {
        setScopeError(msg);
        notifyError(msg);
      }
    } finally {
      setUpdatingScopes(false);
    }
  }, []);

  `;
  
  content = content.replace(runLookupStart, newFunction + runLookupStart);
}

// 4. Update the lead text in AdminSubPageShell
content = content.replace(
  /lead="Look up accounts by number fragment.*?or remove accounts\/transactions\."/,
  `lead="Look up accounts by number fragment (default 123 matches digit patterns), inspect latest activity, add demo charges, manage PingOne scopes, or remove accounts/transactions."`
);

// 5. Add the PingOne Scopes Card before the account lookup card
const accountLookupCard = '<div className="app-page-card" style={{ marginBottom: \'1rem\' }}>\n        <div className="card-header">\n          <h2 className="card-title">Account lookup</h2>';

if (content.includes('Account lookup')) {
  const scopeCard = `{/* PingOne Scopes Configuration Card */}
      <div className="app-page-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #0056b3' }}>
        <div className="card-header">
          <h2 className="card-title">PingOne Scopes Configuration</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem', marginBottom: 0 }}>
            Fix agent scope configuration in PingOne. Automatically creates <code>banking:ai:agent:read</code> scope,
            removes deprecated <code>banking:agent:invoke</code>, and grants to applications.
          </p>
        </div>
        <div className="card-body">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleFixPingOneScopes()}
            disabled={updatingScopes}
            style={{ marginBottom: scopeSteps.length > 0 ? '1rem' : 0 }}
          >
            {updatingScopes ? '⏳ Updating Scopes…' : '⚙️ Fix PingOne Scopes'}
          </button>

          {scopeError && (
            <div
              className="alert alert-danger"
              role="alert"
              style={{ marginBottom: scopeSteps.length > 0 ? '1rem' : 0 }}
            >
              <strong>Error:</strong> {scopeError}
            </div>
          )}

          {scopeSteps.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                {updatingScopes ? 'Updating…' : 'Update Complete'}
              </h4>
              <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: '0.9rem' }}>
                {scopeSteps.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ minWidth: '1.5rem' }}>{step.icon || '•'}</span>
                    <span style={{ color: step.error ? '#dc2626' : '#374151' }}>{step.message}</span>
                  </li>
                ))}
              </ul>
              {scopeSummary && (
                <p
                  style={{
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #e2e8f0',
                    fontWeight: 600,
                    color: scopeSummary.includes('✅') ? '#059669' : '#dc2626',
                  }}
                >
                  {scopeSummary}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      `;
  
  // Find and replace the account lookup card opening
  const accountLookupIndex = content.indexOf('<div className="app-page-card" style={{ marginBottom: \'1rem\' }}>') 
    + content.substring(0, content.indexOf('<div className="app-page-card" style={{ marginBottom: \'1rem\' }}>')).lastIndexOf('<div className="app-page-card"');
  
  // Let's do a simpler approach - find the return statement and add card after PageNav
  const pageNavIndex = content.indexOf('<PageNav user={user} onLogout={onLogout} title="Banking admin" />');
  if (pageNavIndex !== -1) {
    const endPageNavIndex = content.indexOf('</div>', pageNavIndex) + '</div>'.length;
    const afterPageNav = content.substring(0, endPageNavIndex) + '\n\n      ' + scopeCard + content.substring(endPageNavIndex);
    content = afterPageNav;
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ BankingAdminOps.js updated with scope configuration functionality');
