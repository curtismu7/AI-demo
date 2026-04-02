import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast, notifySuccess, notifyError, notifyInfo } from '../utils/appToast';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  getMyAccounts,
  getAccountBalance,
  getMyTransactions,
  createTransfer,
  createDeposit,
  createWithdrawal,
  refreshOAuthSession,
} from '../services/bankingAgentService';
import { loadPublicConfig } from '../services/configService';
import { useEducationUIOptional } from '../context/EducationUIContext';
import { useTokenChainOptional } from '../context/TokenChainContext';
import { useTheme } from '../context/ThemeContext';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import { EDU } from './education/educationIds';
import { EDUCATION_COMMANDS } from './education/educationCommands';
import { fetchNlStatus, parseNaturalLanguage } from '../services/bankingAgentNlService';
import { getToolStepsForAction } from '../utils/agentToolSteps';
import { spinner } from '../services/spinnerService';
import { agentFlowDiagram } from '../services/agentFlowDiagramService';
import {
  AGENT_CONSENT_BLOCK_USER_MESSAGE,
  isAgentBlockedByConsentDecline,
  setAgentBlockedByConsentDecline,
} from '../services/agentAccessConsent';
import { isBankingAgentFloatingDefaultOpen } from '../utils/bankingAgentFloatingDefaultOpen';
import { isPublicMarketingAgentPath } from '../utils/embeddedAgentFabVisibility';
import AgentConsentModal from './AgentConsentModal';
import TransactionConsentModal from './TransactionConsentModal';
import bffAxios from '../services/bffAxios';
import './BankingAgent.css';

/** NL message to replay after customer OAuth redirect from marketing agent (sessionStorage). */
const BX_AGENT_PENDING_NL_KEY = 'bx_agent_pending_nl';

// ─── Action definitions ────────────────────────────────────────────────────────

const ACTIONS = [
  { id: 'accounts',     label: '🏦 My Accounts',       desc: 'List all your accounts' },
  { id: 'transactions', label: '📋 Recent Transactions', desc: 'View recent activity' },
  { id: 'balance',      label: '💰 Check Balance',      desc: 'Balance for an account' },
  { id: 'deposit',      label: '⬇ Deposit',             desc: 'Deposit into an account' },
  { id: 'withdraw',     label: '⬆ Withdraw',            desc: 'Withdraw from an account' },
  { id: 'transfer',     label: '↔ Transfer',            desc: 'Transfer between accounts' },
  { id: 'mcp_tools',   label: '🔧 MCP Tools',           desc: 'List all available MCP banking tools' },
  { id: 'logout',       label: '🚪 Log Out',             desc: 'Sign out of your account' },
];

// ─── Fake account data generator ────────────────────────────────────────────────

function generateFakeAccounts(_user) {
  // Use plain type names ('checking', 'savings') as IDs — NOT chk-/sav-prefixed fake IDs.
  // The server's resolveAccountId resolves 'checking' → real checking account by type,
  // so submissions while liveAccounts are still loading will succeed instead of returning
  // '❌ Account chk-5 not found' (stale fake IDs bypass type-resolution on the server).
  return [
    {
      id: 'checking',
      name: 'Checking Account',
      type: 'checking',
      balance: 0,
      accountNumber: 'CHECKING',
    },
    {
      id: 'savings',
      name: 'Savings Account',
      type: 'savings',
      balance: 0,
      accountNumber: 'SAVINGS',
    },
  ];
}

// ─── Suggested prompts — role-aware ──────────────────────────────────────────

const SUGGESTIONS_CUSTOMER = [
  'Show me my accounts',
  'Transfer $100 to savings',
  'Deposit $50 into checking',
];

const SUGGESTIONS_ADMIN = [
  'Show all customer accounts',
  'Show me last 5 errors',
  'What is step-up auth?',
];

/** Embedded dock on `/config` — setup / OAuth / env, not day-to-day banking. */
const CONFIG_ACTION_IDS = ['mcp_tools', 'logout'];

const SUGGESTIONS_CONFIG_CUSTOMER = [
  'How do I change industry branding (e.g. FunnyBank) on the config page?',
  'How do Agent MCP scopes limit transfers vs read-only?',
  'What PingOne or OAuth environment variables does this app need?',
  'How should I set redirect URIs for local development?',
  'What OAuth scopes does the BFF use?',
  'What is PKCE and why does this app use it?',
  'List MCP tools',
  'How do I fix invalid_redirect_uri?',
];

const SUGGESTIONS_CONFIG_ADMIN = [
  'How do I add a new industry preset (colors, logo) to this demo?',
  'What is agent_mcp_allowed_scopes and how does token exchange use it?',
  'What worker app credentials does the API server need in production?',
  'What redirect URIs should I register in PingOne for this demo?',
  'Show me last 5 errors',
  'List MCP tools',
  'How does token exchange work for the MCP server?',
  'What is CIBA?',
];

/**
 * Chat copy when the BFF has a cookie but no live OAuth tokens.
 * Adapts to store quota/auth errors vs. healthy Redis but missing OAuth tokens in this session.
 */
function buildSessionNotHydratedChat(storeError, sessionStoreHealthy = null) {
  const isQuota = storeError && storeError.includes('max requests limit exceeded');
  const isMissingAuth = storeError && (storeError.includes('WRONGPASS') || storeError.includes('unauthorized'));

  let secondLine;
  if (isQuota) {
    secondLine =
      'The Upstash Redis daily request quota is exhausted — the session store cannot save or load tokens until the quota resets.';
  } else if (isMissingAuth) {
    secondLine =
      'The session store rejected credentials (WRONGPASS or unauthorized).';
  } else if (storeError) {
    secondLine = `The session store reported an error: ${storeError}`;
  } else if (sessionStoreHealthy === true) {
    secondLine =
      'The session store is healthy, but this browser session does not have OAuth access tokens. The server rebuilt your identity from the signed _auth cookie (sessionRestored / accessTokenStub in session debug).';
  } else {
    secondLine =
      'This session has no OAuth tokens (cookie-only or failed save after login). It is not the same as "Redis is down".';
  }

  const lines = [
    'Your browser shows you as signed in, but the Banking Agent needs OAuth tokens on the server for MCP and NL.',
    secondLine,
    '',
    'Diagnose: use "Open session debug" (uses ?deep=1) — compares Redis row vs req.session; sessionStoreHealthy can be true while accessTokenStub is true.',
    '',
  ];

  if (isQuota) {
    lines.push(
      'Fix options:',
      '  1. Wait — Upstash free-tier quota resets at midnight UTC automatically.',
      '  2. Upgrade — go to console.upstash.com and upgrade the database to Pay-As-You-Go.',
      '  3. Recreate — create a new Upstash database and update KV_REST_API_URL + KV_REST_API_TOKEN in Vercel.',
      '',
      'After the quota resets or the database is replaced, sign out and sign in again.',
    );
  } else if (isMissingAuth) {
    lines.push(
      'Fix: In Vercel → Settings → Environment Variables, confirm these are set and correct:',
      '  • KV_REST_API_URL',
      '  • KV_REST_API_TOKEN',
      'Apply to Production, redeploy, sign out, sign in again.',
    );
  } else if (storeError) {
    lines.push(
      'Fix: sign out and sign in again after the store error is resolved. Check Vercel logs for session-store or OAuth callback errors.',
    );
  } else {
    lines.push(
      'Fix:',
      '  1. Sign out completely, then sign in again with PingOne (writes fresh tokens into the server session).',
      '  2. If it still happens right after login, check Vercel logs for "[oauth/user/callback] Session save FAILED".',
    );
  }

  lines.push(
    '',
    sessionStoreHealthy === true
      ? '"Refresh access token" only helps if the server already holds a refresh token. With a stub token, use Sign out and sign in again.'
      : 'After a fresh login you want sessionStoreType: "upstash-rest" and sessionStoreHealthy: true. "Refresh access token" cannot fix a missing session store.',
  );

  return lines.join('\n');
}

/** Fallback when session response is not available (no healthy flag). */
const SESSION_NOT_HYDRATED_CHAT = buildSessionNotHydratedChat(null, null);


/**
 * Picks the signed-in user from Backend-for-Frontend (BFF) status responses and reads cookie-only / Vercel hydration flag from GET /api/auth/session.
 */
function resolveSessionFromAuthTrio(admin, endUser, session) {
  const found = (admin?.authenticated && admin.user)
    ? admin.user
    : (endUser?.authenticated && endUser.user)
      ? endUser.user
      : (session?.authenticated && session.user)
        ? session.user
        : null;
  return { found, cookieOnlyBffSession: !!session?.cookieOnlyBffSession };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  return typeof n === 'number'
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : n;
}

/** Unwrap MCP `tools/call` shape `{ content: [{ text: "<json>" }] }` for display logic. */
function normalizeAgentToolResult(result) {
  if (!result) return result;
  if (result.content && Array.isArray(result.content) && result.content[0]?.text) {
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return result;
    }
  }

  return result;
}

/**
 * Build the payload expected by POST /api/transactions/consent-challenge
 * from the agent actionId + form values (same keys used in runAction).
 */
function buildConsentIntent(actionId, form) {
  const amount = parseFloat(form.amount);
  if (actionId === 'deposit') {
    return { type: 'deposit', toAccountId: form.accountId, fromAccountId: null, amount, description: form.note || 'Agent deposit' };
  }
  if (actionId === 'withdraw') {
    return { type: 'withdrawal', fromAccountId: form.accountId, toAccountId: null, amount, description: form.note || 'Agent withdrawal' };
  }
  if (actionId === 'transfer') {
    return { type: 'transfer', fromAccountId: form.fromId, toAccountId: form.toId, amount, description: form.note || 'Agent transfer' };
  }
  return null;
}

/** Maps MCP JSON (including deposit/transfer/withdraw shapes) to results panel + dashboard event types. */
function inferAgentResultTypeAndData(normalized) {
  if (!normalized || typeof normalized !== 'object') return { resultType: null, resultData: null };
  if (normalized.accounts) return { resultType: 'accounts', resultData: normalized.accounts };
  if (normalized.transactions) return { resultType: 'transactions', resultData: normalized.transactions };
  if (normalized.balance !== undefined && normalized.error === undefined) {
    return { resultType: 'balance', resultData: normalized.balance };
  }
  if (normalized.transaction_id || normalized.transactionId || normalized.id) {
    return { resultType: 'confirm', resultData: normalized };
  }
  if (normalized.transaction?.id) return { resultType: 'confirm', resultData: normalized };
  if (
    normalized.success === true &&
    (normalized.operation === 'transfer' ||
      normalized.operation === 'deposit' ||
      normalized.operation === 'withdrawal')
  ) {
    return { resultType: 'confirm', resultData: normalized };
  }
  return { resultType: null, resultData: null };
}

/** True when the tool returned an error object (local MCP or consent JSON), not a data payload. */
function isAgentToolErrorResult(normalized) {
  if (!normalized || typeof normalized !== 'object') return false;
  if (normalized.accounts || normalized.transactions) return false;
  if (normalized.transaction_id || normalized.transactionId || normalized.id) return false;
  if (normalized.balance !== undefined && normalized.error === undefined) return false;
  return Boolean(normalized.error);
}

function formatResult(result) {
  const r = normalizeAgentToolResult(result);
  if (!r) return 'No data returned.';
  if (r.consent_challenge_required || r.error === 'consent_challenge_required') {
    const t = r.hitl_threshold_usd ?? 500;
    return `${r.message || 'Human approval is required for this amount.'}\n\nUse the main dashboard to complete the consent flow for amounts over $${t}. The assistant cannot supply a browser consent challenge.`;
  }
  if (isAgentToolErrorResult(r)) {
    return `❌ ${typeof r.message === 'string' ? r.message : r.error}`;
  }
  // Accounts list
  if (r.accounts) {
    return r.accounts.map(a =>
      `${a.account_type || a.type || 'Account'}: ${a.account_number || a.id}\n  Balance: ${formatCurrency(a.balance)}`
    ).join('\n\n');
  }
  // Transactions list
  if (r.transactions) {
    return r.transactions.slice(0, 10).map(t =>
      `${t.type}: ${formatCurrency(t.amount)} — ${t.description || ''}\n  ${new Date(t.created_at || t.createdAt).toLocaleDateString()}`
    ).join('\n\n');
  }
  // Balance response
  if (r.balance !== undefined) {
    return `Balance: ${formatCurrency(r.balance)}`;
  }
  // Transaction confirmation
  if (r.transaction_id || r.transactionId || r.id) {
    return `✅ Success\nTransaction ID: ${r.transaction_id || r.transactionId || r.id}\nAmount: ${formatCurrency(r.amount)}`;
  }
  return JSON.stringify(r, null, 2);
}

// ─── Input form for actions that need parameters ──────────────────────────────

function ActionForm({ action, onSubmit, onCancel, loading, effectiveUser, liveAccounts }) {
  const fakeAccounts = generateFakeAccounts(effectiveUser);
  // Prefer real accounts fetched from the server; fall back to generated placeholders only if
  // the live list hasn't arrived yet (avoids the chk-{uid} vs server-ID mismatch that caused
  // '❌ Account chk-5 not found')
  const accounts = liveAccounts && liveAccounts.length > 0 ? liveAccounts : fakeAccounts;

  // Transfer: toAccounts is state-driven so it excludes whichever fromId is selected.
  // We keep it as a separate state to re-derive when fromId changes.
  const [selectedFromId, setSelectedFromId] = React.useState(() => accounts[0]?.id);
  const toAccounts = accounts.filter(a => a.id !== (selectedFromId || accounts[0]?.id));
  // Ensure toId stays valid when fromId changes
  const defaultToId = toAccounts[0]?.id;

  const fields = {
    balance:  [{ key: 'accountId', label: 'Account', type: 'select', options: accounts }],
    deposit:  [
      { key: 'accountId', label: 'Account', type: 'select', options: accounts },
      { key: 'amount',    label: 'Amount ($)',  placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',        placeholder: 'optional' },
    ],
    withdraw: [
      { key: 'accountId', label: 'Account', type: 'select', options: accounts },
      { key: 'amount',    label: 'Amount ($)',  placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',        placeholder: 'optional' },
    ],
    transfer: [
      { key: 'fromId',    label: 'From Account', type: 'select', options: accounts,   onChange: (v) => { setSelectedFromId(v); set('toId', toAccounts.find(a => a.id !== v)?.id || defaultToId); } },
      { key: 'toId',      label: 'To Account',   type: 'select', options: toAccounts },
      { key: 'amount',    label: 'Amount ($)',        placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',              placeholder: 'optional' },
    ],
  };

  // Pre-populate selects with their visible default so submitting without touching dropdowns works
  const defaultForm = {
    balance:  { accountId: accounts[0]?.id },
    deposit:  { accountId: accounts[0]?.id },
    withdraw: { accountId: accounts[0]?.id },
    transfer: { fromId: accounts[0]?.id, toId: toAccounts[0]?.id },
  }[action] || {};

  const [form, setForm] = useState(defaultForm);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Keep select defaults in sync when effectiveUser resolves or live accounts arrive
  React.useEffect(() => {
    setForm(f => {
      const updated = { ...f };
      for (const field of fields[action] || []) {
        if (field.type === 'select' && field.options.length > 0) {
          const isValid = field.options.some(o => o.id === f[field.key]);
          if (!f[field.key] || !isValid) updated[field.key] = field.options[0].id;
        }
      }
      return updated;
    });
  }, [effectiveUser?.id, liveAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Build a normalized submit payload — resolve any missing select values to the displayed default. */
  const handleSubmit = () => {
    const payload = { ...form };
    for (const field of fields[action] || []) {
      if (field.type === 'select') {
        const hasValid = field.options.some(o => o.id === payload[field.key]);
        if (!payload[field.key] || !hasValid) payload[field.key] = field.options[0]?.id;
      }
    }
    onSubmit(payload);
  };

  return (
    <div className="banking-agent-form">
      {(fields[action] || []).map(f => (
        <div key={f.key} className="banking-agent-field">
          <label htmlFor={`field-${f.key}`}>{f.label}</label>
          {f.type === 'select' ? (
            <select
              id={`field-${f.key}`}
              value={form[f.key] || (f.options[0]?.id || '')}
              onChange={e => { set(f.key, e.target.value); f.onChange?.(e.target.value); }}
              className="banking-agent-select"
            >
              {f.options.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.accountNumber}) - {formatCurrency(option.balance)}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`field-${f.key}`}
              type={f.type || 'text'}
              placeholder={f.placeholder}
              value={form[f.key] || ''}
              onChange={e => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
      <div className="banking-agent-form-actions">
        <button type="button" className="banking-agent-btn-primary" disabled={loading} onClick={handleSubmit}>
          {loading ? '…' : 'Run'}
        </button>
        <button type="button" className="banking-agent-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Results Panel (side panel showing rich formatted data next to the agent) ──

function AccountsTable({ accounts }) {
  if (!accounts?.length) return <p className="bar-rp-empty">No accounts found.</p>;
  return (
    <table className="bar-rp-table">
      <thead><tr><th>Type</th><th>Account #</th><th>Balance</th></tr></thead>
      <tbody>
        {accounts.map((a, i) => (
          <tr key={a.account_number || a.id || i}>
            <td>{a.account_type || a.type || 'Account'}</td>
            <td><code>{a.account_number || a.id}</code></td>
            <td className="bar-rp-amount">{formatCurrency(a.balance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TransactionsTable({ transactions }) {
  if (!transactions?.length) return <p className="bar-rp-empty">No transactions found.</p>;
  return (
    <table className="bar-rp-table">
      <thead><tr><th>Type</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
      <tbody>
        {transactions.slice(0, 20).map((t, i) => (
          <tr key={t.id || i}>
            <td><span className={`bar-rp-type bar-rp-type-${(t.type||'').toLowerCase()}`}>{t.type}</span></td>
            <td className="bar-rp-amount">{formatCurrency(t.amount)}</td>
            <td>{t.description || '—'}</td>
            <td className="bar-rp-date">{new Date(t.created_at || t.createdAt || Date.now()).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Renders MCP-style tool step chips (read/update account, transactions) between user ask and reply. */
function ToolProgressChips({ steps }) {
  if (!steps?.length) return null;
  return (
    <ul className="ba-tool-progress" aria-label="Tool calls">
      {steps.map((s, i) => (
        <li key={`${s.name}-${i}`} className="ba-tool-chip">
          <span className="ba-tool-chip-ico" aria-hidden />
          <span className="ba-tool-chip-name">{s.name}</span>
          <span className="ba-tool-chip-sep">·</span>
          <span className={`ba-tool-chip-status ba-tool-chip-status--${s.status}`}>
            {s.status === 'running' ? 'Running…' : s.status === 'success' ? 'Success' : 'Failed'}
          </span>
          <span className="ba-tool-chip-chev" aria-hidden>›</span>
        </li>
      ))}
    </ul>
  );
}

function ResultsPanel({ panel, onClose, style }) {
  if (!panel) return null;
  return (
    <aside className="banking-agent-results-panel" style={style} aria-label="Results">
      <div className="bar-rp-header">
        <span className="bar-rp-title">{panel.title}</span>
        <button type="button" className="bar-rp-close" onClick={onClose} aria-label="Close results">✕</button>
      </div>
      <div className="bar-rp-body">
        {panel.type === 'accounts'      && <AccountsTable      accounts={panel.data} />}
        {panel.type === 'transactions'  && <TransactionsTable  transactions={panel.data} />}
        {panel.type === 'balance'       && (
          <div className="bar-rp-balance">
            <span className="bar-rp-balance-label">Balance</span>
            <span className="bar-rp-balance-value">{formatCurrency(panel.data)}</span>
          </div>
        )}
        {panel.type === 'confirm'       && (
          <div className="bar-rp-confirm">
            <span className="bar-rp-confirm-icon">✅</span>
            <div className="bar-rp-confirm-body">
              <div className="bar-rp-confirm-label">{panel.title}</div>
              {panel.data?.transaction_id && <div>Transaction ID: <code>{panel.data.transaction_id}</code></div>}
              {panel.data?.amount        && <div>Amount: {formatCurrency(panel.data.amount)}</div>}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

function welcomeMessage(u, focus = 'banking', brandShortName = 'BX Finance') {
  if (focus === 'config') {
    if (!u) {
      return `⚙️ Ask about PingOne, redirect URIs, OAuth scopes, **Agent MCP scopes** (limit transfers vs read-only), environment variables, and **industry branding** (${brandShortName} vs other presets) for this demo.`;
    }
    const name = u.firstName || u.name?.split(' ')[0] || 'there';
    if (u.role === 'admin') {
      return `⚙️ Hi ${name} — you're on Application Configuration. Ask about environment IDs, worker apps, redirect URIs, OAuth, **Industry & branding** (\`ui_industry_preset\`), or **Agent MCP scopes** (\`agent_mcp_allowed_scopes\`) — turn off transfers for a read-only agent demo; the BFF runs RFC 8693 token exchange on each tool call with the selected scopes. Banking shortcuts are hidden here. Theme: **${brandShortName}**.`;
    }
    return `⚙️ Hi ${name} — you're on Application Configuration. Ask how to connect PingOne, switch branding (e.g. FunnyBank), or limit the agent with **Agent MCP scopes** (e.g. disable transfers). Theme: **${brandShortName}**.`;
  }
  if (!u) return "👋 You're signed in! What would you like to do?";
  const name = u.firstName || u.name?.split(' ')[0] || 'there';
  if (u.role === 'admin') {
    return `👑 Welcome, ${name}! As an admin you can query accounts system-wide, view all transactions, manage users, and explore PingOne OAuth flows. What would you like to do?`;
  }
  return `👋 Hi ${name}! I can check your balances, move money between accounts, and explain the OAuth flows happening behind the scenes. What would you like to do?`;
}

function normalizeBankingParams(params) {
  const p = { ...(params || {}) };
  if (p.account_id && !p.accountId) p.accountId = p.account_id;
  if (p.from_account_id && !p.fromId) p.fromId = p.from_account_id;
  if (p.to_account_id && !p.toId) p.toId = p.to_account_id;
  return p;
}

/**
 * Parses simple log-focused prompts into a structured query command.
 */
function parseLogPrompt(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  const errorMatch =
    lower.match(/(?:show|list|give me|get)\s+(?:me\s+)?(?:the\s+)?last\s+(\d+)\s+errors?/) ||
    lower.match(/last\s+(\d+)\s+errors?/);
  if (errorMatch) {
    return { type: 'errors', limit: Math.min(Math.max(parseInt(errorMatch[1], 10) || 5, 1), 50) };
  }

  const loginMatch =
    lower.match(/last\s+success(?:ful)?\s+login\s+for\s+([a-z0-9._@-]+)/i) ||
    lower.match(/last\s+login\s+for\s+([a-z0-9._@-]+)/i);
  if (loginMatch) {
    return { type: 'last_login', username: loginMatch[1] };
  }

  return null;
}

// ─── Education topic inline messages (module-level for performance) ───────────

const TOPIC_MESSAGES = {
  'login-flow': `🔐 Authorization Code + PKCE Flow:\n\n1. App generates code_verifier (random 64 bytes) + code_challenge (SHA-256 hash)\n2. Browser redirects to PingOne /as/authorize with challenge\n3. User authenticates → PingOne redirects back with code\n4. Backend-for-Frontend (BFF) exchanges code + verifier for tokens (server-side only)\n5. Browser never sees the token — only a session cookie\n\nPKCE prevents interception: even if code is stolen, attacker can't exchange it without the verifier.`,
  'token-exchange': `🔄 RFC 8693 Token Exchange (User token → MCP token):\n\nWhy: The user token has broad scope. The MCP server needs a narrowly-scoped MCP token for least-privilege.\n\nHow:\n• Backend-for-Frontend (BFF) holds the User token (session access token)\n• Backend-for-Frontend (BFF) calls PingOne /as/token with grant_type=urn:ietf:params:oauth:grant-type:token-exchange\n• User token is subject_token; agent client credentials are actor_token\n• PingOne validates may_act on the User token and issues an MCP token\n• MCP token has: sub=user, act={client_id=agent}, narrow scope, MCP audience\n\nmay_act on the User token → act on the MCP token — proving delegation chain.`,
  'may-act': `📋 may_act / act Claims (RFC 8693 §4.1):\n\nmay_act on the User token: "this client is allowed to act on my behalf"\n  { "sub": "user-uuid", "may_act": { "client_id": "bff-admin-client" } }\n\nact on the MCP token (exchanged token): "this action was delegated"\n  { "sub": "user-uuid", "act": { "client_id": "bff-admin-client" } }\n\nThe MCP server validates act to confirm the Backend-for-Frontend (BFF) is the authorized actor — not just any client that got a token.`,
  'mcp-protocol': `⚙️ Model Context Protocol (MCP):\n\nMCP is a JSON-RPC 2.0 protocol over WebSocket (or stdio/SSE) for AI tools.\n\nHandshake:\n  initialize → { protocolVersion, capabilities, serverInfo }\n  → notifications/initialized (client notification)\n\nDiscovery:\n  tools/list → [{ name, description, inputSchema }]\n\nExecution:\n  tools/call { name, arguments } → { content: [{ type, text }] }\n\nIn this demo:\n  Browser → Backend-for-Frontend (BFF) (/api/mcp/tool) → MCP Server (WebSocket) → Banking API\n\nToken flow: Backend-for-Frontend (BFF) performs RFC 8693 exchange before forwarding tool calls.`,
  'introspection': `🔍 RFC 7662 Token Introspection:\n\nThe MCP server calls PingOne to validate tokens in real-time:\n  POST /as/introspect\n  { token: "...", token_type_hint: "access_token" }\n  → { active: true, sub, scope, exp, aud }\n\nWhy not just verify the JWT locally?\n• Catches revoked tokens (user logged out, compromised session)\n• Zero-trust: every tool call re-validates the token\n• Results cached 60s to avoid hammering PingOne`,
  'step-up': `⬆️ Step-Up Authentication:\n\nTriggered when a high-value action requires stronger auth:\n• Transfer ≥ $250 → require MFA\n• Backend-for-Frontend (BFF) returns HTTP 428 with WWW-Authenticate: Bearer scope="step_up"\n\nTwo methods:\n1. CIBA: PingOne pushes challenge to user's device (out-of-band)\n2. Redirect: Browser redirects to /api/auth/oauth/user/stepup?acr_values=Multi_factor\n\nAfter approval, PingOne issues new token with higher ACR — Backend-for-Frontend (BFF) stores it and retries the original transaction.`,
  'agent-gateway': `🌐 Agent Gateway / Resource Indicators (RFC 8707):\n\nRFC 8707: client specifies the resource URI when requesting a token\n  /as/token?resource=https://mcp.example.com\n  → token aud = "https://mcp.example.com"\n\nRFC 9728: Protected Resource Metadata\n  GET https://mcp.example.com/.well-known/oauth-protected-resource\n  → { resource, authorization_servers, scopes_supported }\n\nThis lets a dynamic AI agent discover what auth is needed before attempting a tool call — no hardcoded configuration.`,
  'pingone-authorize': `🔐 PingOne Authorize (DaVinci):\n\nPingOne Authorize evaluates access policies at runtime using DaVinci flows.\n\nIn this demo it drives:\n• Step-up MFA triggers (ACR values like "Multi_factor")\n• CIBA push notifications to the user's device\n• Dynamic consent for high-value transactions\n\nThe acr_values parameter in /as/authorize tells PingOne which DaVinci policy to run.`,
  'cimd': `📄 Client ID Metadata Document (CIMD / RFC 7591):\n\nTraditional OAuth: client_id is an opaque string, pre-registered in the AS.\nCIMD: client_id is a URL you control — it hosts the client's metadata.\n\nThe AS fetches the URL to discover:\n  { redirect_uris, grant_types, scope, client_name, logo_uri, … }\n\nBenefits:\n• No pre-registration — client registers itself\n• Client controls updates (change the hosted document)\n• Works across AS instances that support DCR/RFC 7591\n\nIn this demo: click "▶ Simulate" in the CIMD panel to see PingOne dynamic client registration.`,
  'human-in-loop': `👤 Human-in-the-loop (HITL) for the banking agent:\n\n• Over $500 the server issues a consent challenge in your session; after you confirm in the consent popup, POST /transactions must include matching consentChallengeId (one-time use).\n• The agent cannot complete that path without your browser session.\n• If you decline, this demo disables the assistant until you sign out and sign in again.\n• HITL ≠ MITM (attack). Open the drawer: What is HITL · Patterns & best practices · This app and the agent · Declining and lockout.`,
};

/**
 * @param {object} props
 * @param {'float' | 'inline'} [props.mode]
 * @param {boolean} [props.embeddedDockBottom] When inline, stack chat on top and suggestions below (dashboard bottom bar)
 * @param {'banking' | 'config'} [props.embeddedFocus] When `config`, dock on Application Configuration emphasizes setup (not transfers).
 * @param {boolean} [props.distinctFloatingChrome] When floating, stronger card/chrome so it reads as a separate widget vs the page.
 * @param {boolean} [props.splitColumnChrome] Inline mode: compact “assistant” chrome for token | agent | banking columns (navy header, chat bubbles).
 */
export default function BankingAgent({
  user,
  onLogout,
  mode = 'float',
  embeddedDockBottom = false,
  embeddedFocus = 'banking',
  distinctFloatingChrome = false,
  splitColumnChrome = false,
}) {
  const isInline = mode === 'inline';
  const isBottomDock = isInline && embeddedDockBottom;
  const isConfigEmbeddedFocus = embeddedFocus === 'config';
  const splitChrome = Boolean(splitColumnChrome && isInline);
  const { preset: industryPreset } = useIndustryBranding();
  const brandShortName = industryPreset.shortName;
  const edu = useEducationUIOptional();
  const tokenChain = useTokenChainOptional();
  const {
    theme: appTheme,
    toggleTheme,
    agentAppearance,
    setAgentAppearance,
    effectiveAgentTheme,
  } = useTheme();
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (isInline) return false;
    try {
      const saved = localStorage.getItem('banking-agent-open');
      if (saved !== null) return saved === 'true';
    } catch {}
    return isBankingAgentFloatingDefaultOpen(window.location.pathname);
  });
  /** Panel light/dark: default follows page (`auto`); can override in header. */
  const isDark = effectiveAgentTheme === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlMeta, setNlMeta] = useState(null);
  /** Set when returning from PingOne with a pending banking NL line to run after session exists. */
  const [nlResumeAfterAuth, setNlResumeAfterAuth] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  /** null = loading; which OAuth flows have client IDs + environment */
  const [oauthConfig, setOauthConfig] = useState(null);
  /** {x,y} when panel has been dragged; null = CSS-anchored default position */
  const [dragPos, setDragPos] = useState(null);
  /** Panel dimensions for resizing — floating default is large enough for header, chips, and two-column body */
  const [panelSize, setPanelSize] = useState({ width: 400, height: 480 });
  /** Side panel showing rich results next to the agent */
  const [resultPanel, setResultPanel] = useState(null);
  /** MCP server connection status for header display */
  const [mcpStatus, setMcpStatus] = useState({ toolCount: null, connected: false });
  /** Real accounts from /api/accounts/my — used for the balance/deposit/withdraw/transfer form
   *  dropdowns so IDs always match what the server has stored (avoids chk-{uid} mismatch). */
  const [liveAccounts, setLiveAccounts] = useState([]);
  /**
   * Self-detected session user — populated by independent auth check so the
   * agent knows the session even if the parent App.js user prop hasn't resolved yet.
   */
  const [sessionUser, setSessionUser] = useState(null);
  const sessionUserRef = useRef(null);
  sessionUserRef.current = sessionUser;
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  /** True when identity came from _auth cookie / stub token — MCP and NL need a Redis-backed session. */
  const [cookieOnlyBffSession, setCookieOnlyBffSession] = useState(false);
  /** True while the 2s reconnect poll is actively running (shows "Reconnecting…" banner). */
  const [sessionReconnecting, setSessionReconnecting] = useState(false);
  /** Avoid repeating the session-fix error bubble after we showed it on load or after a failed action. */
  const sessionFixBubbleShownRef = useRef(false);
  /** User declined high-value consent — tools/chat disabled until sign-out (agentAccessConsent). */
  // Always start false — the block is session-scoped, not page-load-scoped.
  // Clear any stale localStorage value immediately so refresh/login never shows the banner.
  const [consentBlocked, setConsentBlocked] = useState(() => {
    setAgentBlockedByConsentDecline(false);
    return false;
  });
  /** True when the user has accepted the in-app agent consent agreement. */
  /** Pending HITL intent — shows AgentConsentModal (transaction mode) before OTP. */
  const [hitlPendingIntent, setHitlPendingIntent] = useState(null);
  /** Challenge ID issued after the user clicks Authorize in AgentConsentModal. */
  const [hitlChallengeId, setHitlChallengeId] = useState(null);
  /** Pending action awaiting CIBA step-up approval (ref: read in event listener closure). */
  const pendingStepUpActionRef = useRef(null);
  /** Pending action awaiting auth-challenge login (ref: read in event listener closure). */
  const pendingAuthChallengeActionRef = useRef(null);

  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  /** Bottom-dock: scroll transfer/deposit form into view (messages flex used to clip Run). */
  const actionFormAnchorRef = useRef(null);
  const toolProgressIdRef = useRef(null);
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // On the /agent route the inline/full-page instance is shown — hide duplicate float
  const isAgentPage = location.pathname === '/agent';
  /** Landing `/` + `/marketing`: agent success/info/error toasts use longer autoClose (readable for guests). */
  const agentToastMs = useMemo(() => {
    const slow = isPublicMarketingAgentPath(location.pathname);
    return {
      successAction: slow ? 7500 : 2500,
      toolsLoaded: slow ? 7000 : 2000,
      errShort: slow ? 10000 : 5000,
      infoToken: slow ? 8500 : 4500,
    };
  }, [location.pathname]);

  useEffect(() => {
    const sync = () => setConsentBlocked(isAgentBlockedByConsentDecline());
    window.addEventListener('bankingAgentConsentBlockChanged', sync);
    return () => window.removeEventListener('bankingAgentConsentBlockChanged', sync);
  }, []);

  useEffect(() => {
    if (consentBlocked) setActiveAction(null);
  }, [consentBlocked]);

  // Listen for UserDashboard confirming a HITL consent challenge.
  // The modal already executes the transaction — we just surface the success message in the agent.
  useEffect(() => {
    const onConfirmed = (e) => {
      const { actionId, successMsg } = e.detail || {};
      const label = ACTIONS.find(a => a.id === actionId)?.label || actionId;
      addMessage('assistant', `✅ **${label} approved and completed.**\n\n${successMsg || 'The transaction went through after your consent.'}`, actionId);
      notifySuccess(`✅ ${label} complete`);
    };
    window.addEventListener('banking-agent-hitl-confirmed', onConfirmed);
    return () => window.removeEventListener('banking-agent-hitl-confirmed', onConfirmed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Persist open state so the panel survives a page refresh
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (isInline) return;
    try { localStorage.setItem('banking-agent-open', String(isOpen)); } catch {}
  }, [isOpen, isInline]);

  // Floating mode: follow **route changes** only — default collapsed on dashboard homes, open on tool routes.
  // Do not tie this to user/session (see REGRESSION_LOG — auth sync was resetting isOpen and closing the panel).
  useEffect(() => {
    if (isInline) return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return; // skip initial mount — let localStorage-restored value stand
    }
    setIsOpen(isBankingAgentFloatingDefaultOpen(location.pathname));
  }, [location.pathname, isInline]);

  // Auto-open when returning from /config (Config.js navigates back with scrollToAgent:true)
  useEffect(() => {
    if (location.state?.scrollToAgent) {
      setIsOpen(true);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // Auto-open when redirected back from OAuth login (?oauth=success in URL)
  useEffect(() => {
    if (searchParams.get('oauth') === 'success') {
      let pendingNl = null;
      try {
        pendingNl = sessionStorage.getItem(BX_AGENT_PENDING_NL_KEY);
      } catch (_) {}

      setIsOpen(true);
      // Strip oauth params from URL so they don't re-trigger on navigation
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth');
      url.searchParams.delete('stepup');
      window.history.replaceState({}, '', url.toString());

      // Auth cookie is set on the callback response, but on Vercel the status
      // check may land on a cold instance before Redis propagates.  Retry with
      // increasing backoff (immediate, 600, 1400, 2500 ms).
      const retryDelays = [0, 600, 1400, 2500];
      const timers = [];
      retryDelays.forEach((delay, i) => {
        const t = setTimeout(async () => {
          const result = await Promise.all([
            fetch('/api/auth/oauth/status',      { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('/api/auth/oauth/user/status', { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('/api/auth/session',           { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
          ]);
          const [admin, endUser, session] = result;
          const { found, cookieOnlyBffSession: cookieOnly } = resolveSessionFromAuthTrio(admin, endUser, session);
          if (found) {
            setCookieOnlyBffSession(cookieOnly);
            setSessionUser(found);
            if (pendingNl && String(pendingNl).trim()) {
              try {
                sessionStorage.removeItem(BX_AGENT_PENDING_NL_KEY);
              } catch (_) {}
              setNlResumeAfterAuth(String(pendingNl).trim());
            }
            setMessages(prev => {
              if (prev.length > 0) return prev;
              const welcome = { id: `${Date.now()}-w`, role: 'assistant', content: welcomeMessage(found, embeddedFocus, brandShortName) };
              if (cookieOnly) {
                sessionFixBubbleShownRef.current = true;
                return [
                  welcome,
                  {
                    id: `${Date.now()}-fix`,
                    role: 'error',
                    content: buildSessionNotHydratedChat(session?.sessionStoreError ?? null, session?.sessionStoreHealthy ?? null),
                    showSessionFixActions: true,
                  },
                ];
              }
              return [welcome];
            });
            // Notify App.js once so it can navigate to dashboard routes
            if (i === 0) window.dispatchEvent(new CustomEvent('userAuthenticated'));
            // Cancel remaining retries
            timers.forEach(clearTimeout);
          }
        }, delay);
        timers.push(t);
      });
      return () => timers.forEach(clearTimeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-open when the user prop transitions from null → authenticated user
  // (fires on initial mount when App.js has already resolved the session,
  //  and again if the user changes while the component is mounted)
  useEffect(() => {
    if (!user) return;
    setMessages(prev =>
      prev.length === 0
        ? [{ id: Date.now().toString(), role: 'assistant', content: welcomeMessage(user, embeddedFocus, brandShortName) }]
        : prev
    );
  }, [user, embeddedFocus, brandShortName]);

  // Effective user: prefer prop (App.js state), fall back to self-detected session
  const effectiveUser = user || sessionUser;
  const isLoggedIn = !!effectiveUser;
  /** Marketing `/` + `/marketing` guests may chat (education / hints); banking triggers PingOne + return here. */
  const marketingGuestChatEnabled = useMemo(() => {
    const p = (location.pathname || '').replace(/\/$/, '') || '/';
    return !isLoggedIn && isPublicMarketingAgentPath(p);
  }, [isLoggedIn, location.pathname]);
  const isConfigured = oauthConfig && (oauthConfig.admin || oauthConfig.user);

  // Fetch real account IDs from the server whenever the user is known.
  // Stored in liveAccounts and passed to ActionForm so the balance/deposit/withdraw/transfer
  // dropdowns always send the ID the server actually has (prevents '❌ Account chk-5 not found').
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    fetch('/api/accounts/my', { credentials: 'include', _silent: true })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.accounts?.length) return;
        setLiveAccounts(
          data.accounts.map(a => ({
            id: a.id,
            name: a.name || (a.accountType === 'savings' ? 'Savings Account' : 'Checking Account'),
            type: a.accountType || a.account_type || 'checking',
            balance: a.balance || 0,
            accountNumber: a.accountNumber || a.account_number || a.id,
          }))
        );
      })
      .catch(() => { /* silent — ActionForm falls back to generateFakeAccounts */ });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const suggestionList = useMemo(() => {
    if (isConfigEmbeddedFocus) {
      return effectiveUser?.role === 'admin' ? SUGGESTIONS_CONFIG_ADMIN : SUGGESTIONS_CONFIG_CUSTOMER;
    }
    return effectiveUser?.role === 'admin' ? SUGGESTIONS_ADMIN : SUGGESTIONS_CUSTOMER;
  }, [isConfigEmbeddedFocus, effectiveUser?.role]);

  const actionsList = useMemo(() => {
    if (isConfigEmbeddedFocus) {
      return ACTIONS.filter(a => CONFIG_ACTION_IDS.includes(a.id));
    }
    return ACTIONS;
  }, [isConfigEmbeddedFocus]);

  /**
   * Independently check auth endpoints.  Called on mount, on panel open, and
   * when the 'userAuthenticated' event fires (App.js dispatches this after login).
   * Checks all three session types: admin OAuth, end-user OAuth, and basic auth.
   * Does NOT dispatch userAuthenticated — that caused an infinite loop with App.js
   * (App listens → checkOAuthSession → agent listener → checkSelfAuth → dispatch → …).
   * Mount / OAuth-retry paths dispatch once when they first discover a session.
   */
  const checkSelfAuth = useCallback(() => {
    Promise.all([
      fetch('/api/auth/oauth/status',      { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/oauth/user/status', { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/session',           { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([admin, endUser, session]) => {
      const { found, cookieOnlyBffSession: cookieOnly } = resolveSessionFromAuthTrio(admin, endUser, session);
      setCookieOnlyBffSession(cookieOnly);
      if (found) {
        setSessionUser(found);
        // Clear any stale consent-decline block — user has a fresh session.
        setAgentBlockedByConsentDecline(false);
      }
    });
  }, []);

  // P1 — When the BFF returns cookieOnlyBffSession:true, poll /api/auth/session
  // every 2s for up to 10s. Once the Upstash write has propagated (cookieOnlyBffSession
  // becomes false) clear the banner and let normal interaction resume.
  useEffect(() => {
    if (!cookieOnlyBffSession) {
      setSessionReconnecting(false);
      return;
    }
    setSessionReconnecting(true);
    let attempts = 0;
    const MAX_ATTEMPTS = 5; // 5 × 2s = 10s
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const r = await fetch('/api/auth/session', { credentials: 'include', _silent: true });
        if (r.ok) {
          const data = await r.json();
          if (!data.cookieOnlyBffSession) {
            setCookieOnlyBffSession(false);
            setSessionReconnecting(false);
            clearInterval(interval);
            return;
          }
        }
      } catch (_) { /* non-fatal */ }
      if (attempts >= MAX_ATTEMPTS) {
        setSessionReconnecting(false);
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [cookieOnlyBffSession]);

  /** RFC 6749 refresh — does not log out; retries server-side session tokens. */
  const handleSessionRefresh = useCallback(async () => {
    setSessionRefreshing(true);
    try {
      const r = await refreshOAuthSession();
      if (r.ok) {
        notifySuccess('Access token refreshed. You can retry your action.');
        checkSelfAuth();
      } else {
        notifyError('Could not refresh — use Sign in again or reload the page.');
      }
    } catch (e) {
      notifyError(e?.message || 'Refresh failed');
    } finally {
      setSessionRefreshing(false);
    }
  }, [checkSelfAuth]);



  // Check on mount — auto-open if already authenticated (e.g. page refresh after login)
  useEffect(() => {
    Promise.all([
      fetch('/api/auth/oauth/status',      { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/oauth/user/status', { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/session',           { credentials: 'include', _silent: true }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([admin, endUser, session]) => {
      const { found, cookieOnlyBffSession: cookieOnly } = resolveSessionFromAuthTrio(admin, endUser, session);
      setCookieOnlyBffSession(cookieOnly);
      if (found) {
        setSessionUser(found);
        // Clear any stale consent-decline block from previous sessions.
        setAgentBlockedByConsentDecline(false);
        const welcome = { id: `${Date.now()}-w`, role: 'assistant', content: welcomeMessage(found, embeddedFocus, brandShortName) };
        if (cookieOnly) {
          sessionFixBubbleShownRef.current = true;
          setMessages([
            welcome,
            {
              id: `${Date.now()}-fix`,
              role: 'error',
              content: buildSessionNotHydratedChat(session?.sessionStoreError ?? null, session?.sessionStoreHealthy ?? null),
              showSessionFixActions: true,
            },
          ]);
        } else {
          setMessages([welcome]);
        }
        window.dispatchEvent(new CustomEvent('userAuthenticated'));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInline, embeddedFocus]);

  // Re-check when App.js confirms a login, and auto-open the agent
  useEffect(() => {
    const onAuth = () => {
      checkSelfAuth();
      setMessages(prev =>
        prev.length === 0
          ? [{ id: Date.now().toString(), role: 'assistant', content: welcomeMessage(user || sessionUserRef.current, embeddedFocus, brandShortName) }]
          : prev
      );
    };
    window.addEventListener('userAuthenticated', onAuth);
    return () => window.removeEventListener('userAuthenticated', onAuth);
  }, [checkSelfAuth, user, isInline, embeddedFocus, brandShortName]);

  // Auto-retry after CIBA step-up approval
  useEffect(() => {
    const onStepUpApproved = () => {
      if (!pendingStepUpActionRef.current) return;
      const { actionId, form } = pendingStepUpActionRef.current;
      pendingStepUpActionRef.current = null;
      addMessage('assistant', '✅ Authentication approved — retrying your request…', actionId);
      runAction(actionId, form);
    };
    window.addEventListener('cibaStepUpApproved', onStepUpApproved);
    return () => window.removeEventListener('cibaStepUpApproved', onStepUpApproved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-retry after login (auth challenge path)
  useEffect(() => {
    const onAuthChallengeLogin = () => {
      if (!pendingAuthChallengeActionRef.current) return;
      const { actionId, form } = pendingAuthChallengeActionRef.current;
      pendingAuthChallengeActionRef.current = null;
      addMessage('assistant', '✅ Signed in — retrying your request…', actionId);
      runAction(actionId, form);
    };
    window.addEventListener('userAuthenticated', onAuthChallengeLogin);
    return () => window.removeEventListener('userAuthenticated', onAuthChallengeLogin);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check when panel opens (catches sessions established after mount)
  useEffect(() => {
    if (isOpen) checkSelfAuth();
  }, [isOpen, checkSelfAuth]);

  // Mutual exclusion: close agent when an education panel opens
  useEffect(() => {
    if (edu?.panel) setIsOpen(false);
  }, [edu?.panel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutual exclusion: close any open education panel when agent opens.
  // Deps intentionally omit edu?.panel — if edu.panel is included, this effect fires when
  // the user opens an edu panel (edu.panel null→set), sees isOpen=true (stale render snapshot),
  // and immediately calls edu.close(), killing the panel before it renders.
  useEffect(() => {
    if (isOpen && edu?.panel) edu.close();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check config status from IndexedDB cache whenever panel opens
  useEffect(() => {
    if (isOpen && !isLoggedIn) {
      loadPublicConfig()
        .then(cfg => {
          const env = !!cfg.pingone_environment_id;
          setOauthConfig({
            admin: env && !!cfg.admin_client_id,
            user: env && !!cfg.user_client_id,
          });
        })
        .catch(() => setOauthConfig({ admin: false, user: false }));
    }
  }, [isOpen, isLoggedIn]);

  useEffect(() => {
    if (!isOpen) return;
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isLoggedIn && !marketingGuestChatEnabled) return;
    fetchNlStatus().then(setNlMeta).catch(() => setNlMeta({ geminiConfigured: false }));
  }, [isOpen, isLoggedIn, marketingGuestChatEnabled]);

  // Keep MCP status lightweight here to avoid auth/noise calls while browsing dashboards.
  useEffect(() => {
    if (!isOpen || !isLoggedIn) return;
    setMcpStatus({ toolCount: ACTIONS.length, connected: true });
  }, [isOpen, isLoggedIn]);

  // ── Drag-to-move ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e) => {
    // Don't intercept button/input clicks
    if (e.target.closest('button, input, textarea, select')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Always anchor to current visual position and exit expanded mode so panelStyle
    // uses the drag coordinates (isExpanded causes the centered style to win otherwise)
    setIsExpanded(false);
    setDragPos({ x: rect.left, y: rect.top });
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      // Allow dragging off-page - no constraints
      const x = e.clientX - dragOffsetRef.current.x;
      const y = e.clientY - dragOffsetRef.current.y;
      setDragPos({ x, y });
    };
    const onUp = () => { isDraggingRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []);

  // Resize handler — works whether the panel is at CSS default position or has been dragged.
  // Supports all 8 directions: n, ne, e, se, s, sw, w, nw.
  // N/W/NW/NE/SW directions shift dragPos so the opposite edge stays fixed.
  const handleResize = useCallback((e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    const startHeight = panelSize.height;

    // Exit expanded mode on resize (same as drag)
    setIsExpanded(false);

    // Capture starting position from current dragPos or from getBoundingClientRect.
    // Must be done synchronously so onMove calculations are anchored correctly.
    let startPosX, startPosY;
    const rect = panelRef.current?.getBoundingClientRect();
    if (dragPos) {
      startPosX = dragPos.x;
      startPosY = dragPos.y;
    } else if (rect) {
      startPosX = rect.left;
      startPosY = rect.top;
      setDragPos({ x: rect.left, y: rect.top });
    } else {
      startPosX = 0;
      startPosY = 0;
    }

    function onMove(ev) {
      const deltaX = ev.clientX - startX;
      const deltaY = ev.clientY - startY;
      const MIN_W = 280, MIN_H = 220;
      const MAX_W = Math.floor(window.innerWidth * 0.95);
      const MAX_H = Math.floor(window.innerHeight * 0.95);

      let newWidth  = startWidth;
      let newHeight = startHeight;
      let newX = startPosX;
      let newY = startPosY;

      // Right edge — grows rightward, position unchanged
      if (direction === 'e' || direction === 'se' || direction === 'ne') {
        newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth + deltaX));
      }
      // Left edge — grows leftward, left position shifts
      if (direction === 'w' || direction === 'sw' || direction === 'nw') {
        newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth - deltaX));
        newX = startPosX + (startWidth - newWidth);
      }
      // Bottom edge — grows downward, position unchanged
      if (direction === 's' || direction === 'se' || direction === 'sw') {
        newHeight = Math.min(MAX_H, Math.max(MIN_H, startHeight + deltaY));
      }
      // Top edge — grows upward, top position shifts
      if (direction === 'n' || direction === 'ne' || direction === 'nw') {
        newHeight = Math.min(MAX_H, Math.max(MIN_H, startHeight - deltaY));
        newY = startPosY + (startHeight - newHeight);
      }

      setPanelSize({ width: newWidth, height: newHeight });
      setDragPos({ x: newX, y: newY });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSize, dragPos]);

  // Panel position: override CSS anchoring when user has dragged the window
  // In inline mode the CSS (.ba-mode-inline) handles size — no inline style needed
  const panelStyle = isInline
    ? {}
    : isExpanded
      ? {
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(94vw, 520px)',
          height: 'min(85vh, 720px)',
          maxWidth: 560,
          maxHeight: '85vh',
          right: 'auto',
          bottom: 'auto',
        }
      : dragPos
        ? {
            left: dragPos.x,
            top: dragPos.y,
            bottom: 'auto',
            right: 'auto',
            width: panelSize.width,
            height: panelSize.height,
            transform: 'none',
          }
        : { width: panelSize.width, height: panelSize.height, transform: 'none' };
  /** Results panel width (CSS) — keep gap in sync when dragging / expanded layout */
  const resultsPanelWidthPx = 220;
  const resultsPanelStyle = useMemo(() => {
    const gap = 16;
    const rpW = resultsPanelWidthPx;
    if (isInline) return undefined;
    if (dragPos) {
      return {
        position: 'fixed',
        left: Math.max(8, dragPos.x - rpW - gap),
        top: dragPos.y,
        bottom: 'auto',
        right: 'auto',
        zIndex: 10058,
      };
    }
    /* Expanded (⊞): agent is centered — anchor results to the left of it (matches min(94vw, 520px) expanded width). */
    if (isExpanded) {
      return {
        position: 'fixed',
        left: `max(8px, calc(50vw - min(94vw, 520px) / 2 - ${gap}px - ${rpW}px))`,
        top: '50vh',
        transform: 'translateY(-50%)',
        bottom: 'auto',
        right: 'auto',
        zIndex: 10058,
      };
    }
    return undefined;
  }, [dragPos, isExpanded, isInline, resultsPanelWidthPx]);
  // In inline mode the panel is always visible; in float mode respect the open/closed state
  const effectiveIsOpen = isInline || isOpen;

  function addMessage(role, content, tool, extra = {}) {
    const { id: exId, ...rest } = extra;
    const id = exId || `${Date.now()}`;
    setMessages(prev => [...prev, { id, role, content: content ?? '', tool, ...rest }]);
  }

  function markToolProgressOutcome(success) {
    const tid = toolProgressIdRef.current;
    if (!tid) return;
    toolProgressIdRef.current = null;
    setMessages(prev => prev.map(m =>
      m.id === tid && m.role === 'tool-progress'
        ? { ...m, steps: (m.steps || []).map(s => ({ ...s, status: success ? 'success' : 'error' })) }
        : m
    ));
  }

  /** Show overlay then redirect to PingOne login. */
  async function handleLoginAction(actionId) {
    const label = actionId === 'login_admin' ? 'Admin' : 'Customer';
    spinner.show(`Signing in as ${label}…`, 'Redirecting to PingOne');
    const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
    if (actionId === 'login_admin') {
      setTimeout(() => {
        window.location.href = `${apiUrl}/api/auth/oauth/login`;
      }, 150);
      return;
    }
    let usePiFlow = false;
    try {
      const r = await fetch('/api/admin/config', { credentials: 'include' });
      const j = await r.json();
      const cfg = j?.config || {};
      if (cfg.marketing_customer_login_mode === 'slide_pi_flow') usePiFlow = true;
    } catch (_) {
      /* keep default redirect */
    }
    setTimeout(() => {
      const p = (location.pathname || '').replace(/\/$/, '') || '/';
      const params = new URLSearchParams();
      if (isPublicMarketingAgentPath(p)) params.set('return_to', '/marketing');
      if (usePiFlow) params.set('use_pi_flow', '1');
      const q = params.toString();
      window.location.href = `${apiUrl}/api/auth/oauth/user/login${q ? `?${q}` : ''}`;
    }, 150);
  }

  /**
   * Runs a banking tool. When fromNl is true, skips the extra user bubble (NL already echoed the ask).
   */
  async function runAction(actionId, form, opts = {}) {
    if (isAgentBlockedByConsentDecline()) {
      addMessage('assistant', AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }
    const { skipUserLabel = false } = opts;
    setActiveAction(null);
    const label = ACTIONS.find(a => a.id === actionId)?.label || actionId;
    if (!skipUserLabel) {
      addMessage('user', label);
    }
    setLoading(true);

    // Toast: show in-progress indicator
    const toastId = `agent-${actionId}-${Date.now()}`;
    toast.info(`⚙️ ${label}…`, { toastId, autoClose: false, isLoading: true });

    try {
      const stepDefs = getToolStepsForAction(actionId);
      if (stepDefs.length > 0) {
        const tid = `tp-${Date.now()}`;
        toolProgressIdRef.current = tid;
        addMessage('tool-progress', '', null, {
          id: tid,
          steps: stepDefs.map(s => ({ ...s, status: 'running' })),
        });
      }

      let response;
      switch (actionId) {
        case 'accounts':
          toast.update(toastId, { render: '🔍 Calling get_my_accounts…' });
          response = await getMyAccounts();
          break;
        case 'transactions':
          toast.update(toastId, { render: '🔍 Calling get_my_transactions…' });
          response = await getMyTransactions();
          break;
        case 'balance':
          toast.update(toastId, { render: '🔍 Calling get_account_balance…' });
          response = await getAccountBalance(form.accountId);
          break;
        case 'deposit':
          toast.update(toastId, { render: '⬇️ Calling create_deposit…' });
          response = await createDeposit(form.accountId, parseFloat(form.amount), form.note);
          break;
        case 'withdraw':
          toast.update(toastId, { render: '⬆️ Calling create_withdrawal…' });
          response = await createWithdrawal(form.accountId, parseFloat(form.amount), form.note);
          break;
        case 'transfer':
          toast.update(toastId, { render: '↔️ Calling create_transfer…' });
          response = await createTransfer(form.fromId, form.toId, parseFloat(form.amount), form.note);
          break;
        case 'mcp_tools': {
          toast.update(toastId, { render: '🔧 Fetching MCP tool list…' });
          agentFlowDiagram.startInspectorToolsList();
          let mcpRes;
          try {
            mcpRes = await fetch('/api/mcp/inspector/tools', { credentials: 'include' });
          } catch (netErr) {
            agentFlowDiagram.completeInspectorToolsList({
              ok: false,
              errorMessage: netErr.message || 'Network error',
            });
            throw netErr;
          }
          if (!mcpRes.ok) {
            agentFlowDiagram.completeInspectorToolsList({
              ok: false,
              errorMessage: `HTTP ${mcpRes.status}`,
            });
            throw new Error(`MCP tools fetch failed: ${mcpRes.status}`);
          }
          let data;
          try {
            data = await mcpRes.json();
          } catch (parseErr) {
            agentFlowDiagram.completeInspectorToolsList({
              ok: false,
              errorMessage: parseErr.message || 'Invalid JSON',
            });
            throw parseErr;
          }
          const tools = data.tools || [];
          agentFlowDiagram.completeInspectorToolsList({
            ok: true,
            source: data._source || 'mcp_server',
          });
          const toolText = tools.length === 0
            ? 'No tools found — is the MCP server running?'
            : tools.map((t, i) =>
                `${i + 1}. ${t.name}\n   ${t.description || '(no description)'}\n   Inputs: ${Object.keys(t.inputSchema?.properties || {}).join(', ') || 'none'}`
              ).join('\n\n');
          addMessage('assistant', `🔧 MCP Banking Tools (${tools.length} available):\n\n${toolText}`, 'tools/list');
          setIsExpanded(true);
          toast.update(toastId, { render: `✅ ${tools.length} tools loaded`, type: 'success', isLoading: false, autoClose: agentToastMs.toolsLoaded });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        case 'web_search': {
          toast.update(toastId, { render: '\u{1F50D} Searching the web…' });
          const q = encodeURIComponent(form.query || '');
          let srRes;
          try {
            srRes = await fetch(`/api/banking-agent/search?q=${q}`, { credentials: 'include' });
          } catch (netErr) {
            throw new Error(`Web search network error: ${netErr.message}`);
          }
          const srData = await srRes.json().catch(() => ({}));
          if (!srRes.ok) {
            if (srData.error === 'BRAVE_NOT_CONFIGURED') {
              addMessage('assistant', `\u26A0\uFE0F Web search is not configured.\n\n${srData.message || 'Set BRAVE_SEARCH_API_KEY in the server environment to enable web search.'}`, actionId);
              toast.dismiss(toastId);
              setLoading(false);
              toolProgressIdRef.current = null;
              return;
            }
            throw new Error(srData.message || `Search failed: ${srRes.status}`);
          }
          const srResults = (srData.results || [])
            .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description || ''}`)
            .join('\n\n');
          addMessage(
            'assistant',
            `\u{1F50D} Web search results for **"${srData.query || form.query || ''}"**:\n\n${srResults || 'No results found.'}`,
            actionId,
          );
          setIsExpanded(true);
          toast.update(toastId, { render: '\u2705 Search complete', type: 'success', isLoading: false, autoClose: agentToastMs.toolsLoaded });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        default:
          throw new Error(`Unknown action: ${actionId}`);
      }

      const normalized = normalizeAgentToolResult(response.result);
      if (isAgentToolErrorResult(normalized)) {
        markToolProgressOutcome(false);
        const tokenEventsErr = response.tokenEvents || [];
        if (tokenChain && tokenEventsErr.length > 0) {
          tokenChain.setTokenEvents(actionId, tokenEventsErr);
        }
        const consent =
          normalized.consent_challenge_required === true || normalized.error === 'consent_challenge_required';
        if (consent) {
          const intentPayload = buildConsentIntent(actionId, form);
          if (!intentPayload) {
            // Unexpected: consent required but no intent builder for this action.
            addMessage('assistant', `⚠️ This action requires consent but the transaction details could not be determined. Please use the dashboard to complete it.`, actionId);
            toast.dismiss(toastId);
            setLoading(false);
            return;
          }
          addMessage('assistant',
            `👤 **High-value transaction — your approval is needed.**\n\nTransactions over $${normalized.hitl_threshold_usd ?? 500} require your consent and email verification.\n\nReview the authorization popup, then enter the code sent to your email.`,
            actionId
          );
          toast.dismiss(toastId);
          setHitlPendingIntent({ actionId, form, intentPayload });
        } else if (normalized.step_up_required === true || normalized.error === 'step_up_required') {
          const stepUpMethod = normalized.step_up_method || 'ciba';
          pendingStepUpActionRef.current = { actionId, form };
          addMessage('assistant',
            `🔐 **Additional verification required.**\n\nThis transaction requires step-up authentication (${stepUpMethod === 'ciba' ? 'CIBA push approval' : 'MFA redirect'}).\n\nA verification prompt has been sent to your device. Approve it and your transaction will resume automatically.`,
            actionId
          );
          window.dispatchEvent(new CustomEvent('agentStepUpRequested', { detail: { step_up_method: stepUpMethod } }));
          toast.dismiss(toastId);
          setLoading(false);
          return;
        } else if (normalized.authChallenge && normalized.authChallenge.authorizationUrl) {
          const loginUrl = (process.env.REACT_APP_API_URL || '') + '/api/auth/oauth/user/login';
          pendingAuthChallengeActionRef.current = { actionId, form };
          addMessage('assistant',
            `🔑 **Login required.**\n\nThis operation requires you to be signed in. Click the button below — your request will resume automatically after you authenticate.`,
            actionId
          );
          addMessage('assistant',
            '<a href="' + loginUrl + '" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#4f7df3;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Sign in →</a>',
            actionId
          );
          toast.dismiss(toastId);
          setLoading(false);
          return;
        } else {
          addMessage('assistant', formatResult(response.result), actionId);
          toast.dismiss(toastId);
          notifyError(`❌ ${normalized.message || normalized.error || 'Request failed'}`, { autoClose: agentToastMs.errShort });
        }
        setLoading(false);
        return;
      }

      markToolProgressOutcome(true);

      // Push token events to TokenChainContext (updates TokenChainDisplay on dashboard)
      const tokenEvents = response.tokenEvents || [];
      if (tokenChain && tokenEvents.length > 0) {
        tokenChain.setTokenEvents(actionId, tokenEvents);
      }

      // Show inline token event summary in the chat + dedicated toasts
      if (tokenEvents.length > 0) {
        const exchanged = tokenEvents.find(e => e.id === 'exchanged-token');
        const required  = tokenEvents.find(e => e.id === 'exchange-required');
        const badScopes = tokenEvents.find(e => e.id === 'user-scopes-insufficient');
        const failed    = tokenEvents.find(e => e.id === 'exchange-failed');
        const userTokEv = tokenEvents.find(e => e.id === 'user-token');

        // Build a detailed may_act status string from the user token event
        const mayActLine = !userTokEv
          ? '   ⚠️ user token not decoded'
          : userTokEv.mayActPresent && userTokEv.mayActValid
            ? `   ✅ may_act valid — ${userTokEv.mayActDetails || 'delegation authorised'}`
            : userTokEv.mayActPresent && !userTokEv.mayActValid
              ? `   ❌ may_act mismatch — ${userTokEv.mayActDetails || 'client_id does not match BFF'}`
              : '   ⚠️ may_act absent from user token';

        let tokenMsg = null;
        if (exchanged) {
          const actLine = exchanged.actPresent
            ? `   ✅ act: ${exchanged.actDetails} — BFF confirmed as current actor`
            : '   ⚠️ act absent — subject-only exchange (no delegation proof in MCP token; set AGENT_OAUTH_CLIENT_ID)';
          const audLine = exchanged.audExpected !== undefined
            ? (exchanged.audMatches
                ? `   ✅ aud: "${exchanged.audActual ?? exchanged.audienceNarrowed}" — MCP server audience matched (RFC 8707)`
                : `   ❌ aud mismatch — got "${exchanged.audActual}" expected "${exchanged.audExpected}" — MCP server will reject`)
            : `   aud: ${exchanged.audienceNarrowed || '—'} (RFC 8707 resource indicator)`;
          tokenMsg = [
            '🔐 RFC 8693 Token Exchange complete',
            mayActLine,
            actLine,
            audLine,
            `   Scope narrowed: ${exchanged.scopeNarrowed || '—'}`,
            '',
            'Open Token Chain ↗ to inspect decoded claims.',
            'aud (audience): which resource server accepts the token — narrowed on exchange.',
            'may_act (user token) = prospective permission · act (MCP token) = current delegation fact.',
          ].join('\n');
          notifyInfo(`🔐 Token Exchange complete — MCP token issued (aud: ${exchanged.audienceNarrowed || 'set'}, scope: ${exchanged.scopeNarrowed || 'narrowed'})`, { autoClose: agentToastMs.infoToken });
        } else if (required) {
          tokenMsg = [
            '🔐 Token Exchange (RFC 8693): not configured',
            '   Tools ran via local fallback — the user access token was NOT sent to the MCP server.',
            '',
            'To enable full RFC 8693 exchange:',
            '   1. Create a PingOne Resource Server  audience: "banking_mcp_server"',
            '   2. Set MCP_RESOURCE_URI=banking_mcp_server  (Config UI or Vercel env)',
            '   3. Enable Token Exchange grant on the Admin OAuth app in PingOne',
            '   4. Sign out and sign in again',
          ].join('\n');
          // Info-only: tools still work via local fallback
          // Chat already gets the full RFC 8693 setup explanation via addMessage('token-event').
          // Suppress the toast — the success toast is already shown and a concurrent info/error
          // toast would confuse users who just saw "Deposit complete".
        } else if (badScopes) {
          tokenMsg = [
            '⚠️ User token has insufficient scopes for RFC 8693 exchange',
            `   ${badScopes.explanation || 'Need at least 5 OAuth scopes on the user token'}`,
            '',
            'Fix: Sign out → sign in again with a PingOne app that requests more scopes',
            '(openid, profile, email + banking scopes like banking:read, banking:accounts:read).',
          ].join('\n');
          notifyError('❌ Sign in again with broader scopes (at least 5) for MCP token exchange', { autoClose: 7000 });
        } else if (failed) {
          // When the server fell back to local handler after exchange failure,
          // the operation succeeded — show a soft info message, not an error toast.
          if (response._localFallback && response._exchangeFailed) {
            tokenMsg = [
              '⚠️ Token Exchange (RFC 8693) skipped — ran via local fallback',
              '   The exchange was attempted but PingOne could not grant the required scopes.',
              '   The banking operation completed successfully using the local handler.',
              '',
              '   To enable full RFC 8693 exchange, ensure the user token carries',
              '   banking:read / banking:write scopes (not just banking:agent:invoke).',
            ].join('\n');
            // No error toast — the tool result handled it as a success
          } else {
            tokenMsg = [
              `❌ Token Exchange (RFC 8693) failed: ${failed.error || 'unknown error'}`,
              '',
              userTokEv?.mayActPresent
                ? '   may_act was present — check that:\n   • PingOne has Token Exchange grant enabled on the admin OAuth app\n   • Audience policy allows "banking_mcp_server"\n   • may_act.client_id matches the BFF client'
                : '   may_act was absent — this is likely the cause.\n   Go to /demo-data → Enable may_act → sign out and sign in again.',
            ].join('\n');
            notifyError(`❌ Token Exchange failed: ${failed.error || 'unknown error'}`, { autoClose: 6000 });
          }
        }
        if (tokenMsg) {
          addMessage('token-event', tokenMsg, actionId);
        }
      }

      // Populate results panel + notify hosting dashboard (same CustomEvent in both display modes)
      const isWriteAction = ['transfer', 'deposit', 'withdraw'].includes(actionId);
      let displayNormalized = normalizeAgentToolResult(response.result);
      if (isWriteAction) {
        try {
          const txRes = await getMyTransactions(30);
          const txNorm = normalizeAgentToolResult(txRes.result);
          if (Array.isArray(txNorm?.transactions)) {
            displayNormalized = txNorm;
          }
        } catch {
          // keep write payload for inferAgentResultTypeAndData
        }
        // Refresh live account balances after write operations so form dropdowns are current
        fetch('/api/accounts/my', { credentials: 'include', _silent: true })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data?.accounts?.length) return;
            setLiveAccounts(
              data.accounts.map(a => ({
                id: a.id,
                name: a.name || (a.accountType === 'savings' ? 'Savings Account' : 'Checking Account'),
                type: a.accountType || a.account_type || 'checking',
                balance: a.balance || 0,
                accountNumber: a.accountNumber || a.account_number || a.id,
              }))
            );
          })
          .catch(() => {});
      }

      const displayMode = localStorage.getItem('agentDisplayMode') || 'panel';
      const { resultType, resultData } = inferAgentResultTypeAndData(displayNormalized);

      if (resultType) {
        // For write actions (transfer/deposit/withdraw), always dispatch 'confirm' so the
        // UserDashboard onAgentResult listener triggers fetchUserData to refresh balances.
        // The panel may display 'transactions' (history after the write), but the dashboard
        // must know a write occurred.
        const eventType = isWriteAction ? 'confirm' : resultType;
        window.dispatchEvent(new CustomEvent('banking-agent-result', {
          detail: { type: eventType, data: resultData, label },
        }));
        if (displayMode === 'panel') {
          const titleMap = {
            accounts: '🏦 Accounts',
            transactions: '📋 Recent Transactions',
            balance: '💰 Balance',
            confirm: `✅ ${label} confirmed`,
          };
          setResultPanel({ type: resultType, title: titleMap[resultType], data: resultData });
        }
      }

      addMessage('assistant', formatResult(response.result), actionId);

      // Dismiss loading toast and show success
      toast.update(toastId, {
        render: `✅ ${label} complete`,
        type: 'success',
        isLoading: false,
        autoClose: agentToastMs.successAction,
      });
    } catch (err) {
      markToolProgressOutcome(false);
      toast.dismiss(toastId);

      if (actionId === 'mcp_tools') {
        const st = agentFlowDiagram.getState();
        if (st.phase === 'running' && st.toolName === 'tools/list') {
          agentFlowDiagram.completeInspectorToolsList({
            ok: false,
            errorMessage: err.message || 'Request failed',
          });
        }
      }

      const isConnErr =
        err.message.includes('timed out') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ENETUNREACH') ||
        err.message.includes('mcp_error') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('502');

      const mcpToolsUnauthorized =
        actionId === 'mcp_tools' &&
        /MCP tools fetch failed:\s*401/i.test(String(err?.message || ''));

      const hydrationAuthFailure =
        err?.code === 'session_not_hydrated' ||
        (cookieOnlyBffSession &&
          (err?.statusCode === 401 ||
            err?.code === 'authentication_required' ||
            mcpToolsUnauthorized ||
            /sign in to use the banking agent/i.test(String(err?.message || ''))));

      if (isConnErr) {
        notifyError('🔌 MCP server unreachable — check your server connection', { autoClose: 8000 });
      } else if (hydrationAuthFailure && cookieOnlyBffSession) {
        // Inline session-fix banner already shown on load for cookie-only Backend-for-Frontend (BFF); avoid duplicate toasts.
      } else if (err?.code === 'session_not_hydrated') {
        notifyError(
          'Sign in again: server session has no tokens (Vercel needs Redis/Upstash + redeploy, then sign out & sign in).',
          { autoClose: 12000 },
        );
      } else if (
        err?.statusCode === 401 ||
        err?.code === 'authentication_required' ||
        /sign in to use the banking agent/i.test(String(err?.message || ''))
      ) {
        notifyError(
          'Session missing or expired on the server. Try Refresh access token, or Sign in again.',
          { autoClose: 9000 },
        );
      } else if (err?.code === 'agent_consent_required') {
        // Old server deployment still enforcing startup consent gate.
        // The consent gate has been removed — sign out and sign in to refresh the session,
        // or ask the admin to redeploy the latest server code.
        notifyError('Server configuration: please sign out and sign in again to clear the consent state.', { autoClose: 10000 });
      } else {
        notifyError(`❌ ${err.message}`, { autoClose: 6000 });
      }

      const authHint =
        err?.code === 'session_not_hydrated'
          ? ''
          : err?.statusCode === 401 || err?.code === 'authentication_required'
            ? '\n\nTip: use **Refresh access token** (left column), then retry. Sign in again only if refresh fails.'
            : '';

      const showSessionFixBubble =
        err?.code === 'session_not_hydrated' ||
        (cookieOnlyBffSession &&
          (err?.statusCode === 401 ||
            err?.code === 'authentication_required' ||
            mcpToolsUnauthorized ||
            /sign in to use the banking agent/i.test(String(err?.message || ''))));

      if (showSessionFixBubble) {
        if (!sessionFixBubbleShownRef.current) {
          sessionFixBubbleShownRef.current = true;
          addMessage('error', SESSION_NOT_HYDRATED_CHAT, actionId, { showSessionFixActions: true });
        }
      } else if (err?.code === 'agent_consent_required') {
        // Legacy startup consent gate — no longer enforced in current server code.
        addMessage('assistant',
          'The server is requesting consent to use the agent, but this gate has been removed in the current version.\n\nPlease **sign out and sign in again** to clear the old session state.',
          actionId
        );
      } else {
        addMessage(
          'error',
          isConnErr
            ? 'Banking Agent is unavailable.\n\nThe MCP server is not reachable.\n\nLocal: cd banking_mcp_server && npm run dev\nHosted: set MCP_SERVER_URL to your reachable MCP server URL (if your platform allows outbound WS).'
            : `Error: ${err.message}${authHint}`,
          actionId
        );
      }

      const pathNorm = (location.pathname || '').replace(/\/$/, '') || '/';
      const onMarketingPublic = isPublicMarketingAgentPath(pathNorm);
      const authRelatedMarketingNudge =
        onMarketingPublic &&
        !isConnErr &&
        err?.code !== 'agent_consent_required' &&
        (hydrationAuthFailure ||
          err?.statusCode === 401 ||
          err?.code === 'authentication_required' ||
          err?.code === 'session_not_hydrated' ||
          mcpToolsUnauthorized ||
          /sign in to use the banking agent/i.test(String(err?.message || '')));
      if (authRelatedMarketingNudge) {
        window.dispatchEvent(new CustomEvent('marketing-scroll-login'));
        if (!isLoggedIn) {
          addMessage(
            'assistant',
            'Use **Customer** in this assistant’s sign-in flow — PingOne will return you here so you can keep using banking on this page. **Customer sign in** in the header or the sign-in section opens the full dashboard after PingOne.',
            actionId,
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function handleActionClick(actionId) {
    if (actionId !== 'logout' && isAgentBlockedByConsentDecline()) {
      addMessage('assistant', AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }
    if (actionId === 'logout') {
      onLogout?.();
      return;
    }
    // No form needed for read-only queries
    if (actionId === 'accounts' || actionId === 'transactions' || actionId === 'mcp_tools') {
      runAction(actionId, {});
    } else {
      setActiveAction(actionId);
    }
  }

  function openEducationCommand(cmd) {
    if (isAgentBlockedByConsentDecline()) {
      addMessage('assistant', AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }
    if (cmd.ciba && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('education-open-ciba', { detail: { tab: cmd.tab || 'what' } }));
      setIsOpen(false);
      return;
    }
    if (cmd.panel) {
      edu?.open(cmd.panel, cmd.tab || null);
      setIsOpen(false);
    }
  }

  /**
   * Shared NL dispatch: education panels, banking tools, or fallback hint.
   * Used by the input bar and by left-column suggestion chips (same behavior).
   */
  async function dispatchNlResult(result, source = 'heuristic', nlUserText = '') {
    setShowCommands(false);
    if (result.kind === 'education' && result.ciba) {
      openEducationCommand({ ciba: true, tab: result.tab });
      setIsOpen(false);
      addMessage('assistant',
        `📲 CIBA Guide opened — see the sliding panel on the right.\n\n` +
        `CIBA (Client-Initiated Backchannel Authentication) lets the server request user approval out-of-band:\n` +
        `• Server calls POST /bc-authorize → PingOne sends email or push to user\n` +
        `• User approves from their inbox or device — no browser redirect needed\n` +
        `• Server polls POST /token until approved, then stores tokens server-side\n\n` +
        `Great for chat agents (redirect would break the flow) and high-value step-up transactions.\n` +
        `The guide has 8 tabs: What is CIBA · Sign-in & roles · Full stack · Token exchange · vs Login · Try It (live demo) · App Flows · PingOne Setup`
      );
      return;
    }
    if (result.kind === 'education' && result.education?.panel) {
      const panel = result.education.panel;
      const tab = result.education.tab || null;
      if (panel === EDU.CIMD) {
        window.dispatchEvent(new CustomEvent('education-open-cimd', { detail: { tab: tab || 'what' } }));
        setIsOpen(false);
        addMessage('assistant',
          `📄 CIMD Simulator opened — see the sliding panel on the right.\n\n` +
          `OAuth Client ID Metadata Document (CIMD) redefines what a client_id is:\n` +
          `• Instead of an opaque string, the client_id is a URL you control\n` +
          `• That URL hosts a JSON document describing the client (redirect_uris, grant_types, scopes…)\n` +
          `• A CIMD-capable AS fetches the URL to learn the client's metadata — no pre-registration needed\n` +
          `• The client controls updates: just update the hosted document\n\n` +
          `This demo registers the client in PingOne via the Management API and hosts the document at:\n` +
          `/.well-known/oauth-client/{pingone-app-id}\n\n` +
          `Panel tabs: What is CIMD · CIMD vs DCR · Doc format · How AS uses it · Flow diagram · ▶ Simulate · PingOne`
        );
        return;
      }
      const topicMsg = TOPIC_MESSAGES[panel];
      edu?.open(panel, tab);
      addMessage('assistant', topicMsg
        ? topicMsg
        : `Opened help panel: ${panel}. See the sliding panel on the right for details.`
      );
      return;
    }
    if (result.kind === 'banking' && result.banking?.action) {
      const { action, params } = result.banking;
      if (action === 'logout') {
        addMessage('assistant', 'Signing you out…');
        setTimeout(() => onLogout?.(), 800);
        return;
      }
      if (marketingGuestChatEnabled) {
        try {
          if (nlUserText && nlUserText.trim()) {
            sessionStorage.setItem(BX_AGENT_PENDING_NL_KEY, nlUserText.trim());
          }
        } catch (_) {}
        addMessage(
          'assistant',
          '**Taking you to PingOne** — after you sign in you’ll return here and we’ll continue with that banking request.',
        );
        handleLoginAction('login_user');
        return;
      }
      const p = normalizeBankingParams(params);
      if (action === 'mcp_tools') {
        await runAction('mcp_tools', {}, { skipUserLabel: true });
        return;
      }
      if (action === 'accounts' || action === 'transactions') {
        await runAction(action, {}, { skipUserLabel: true });
      } else if (action === 'balance' && p.accountId) {
        await runAction('balance', { accountId: p.accountId }, { skipUserLabel: true });
      } else if (action === 'transfer' && p.fromId && p.toId && p.amount) {
        // All params extracted by NL — execute directly
        await runAction('transfer', p, { skipUserLabel: true });
      } else if (action === 'deposit' && p.amount) {
        await runAction('deposit', p, { skipUserLabel: true });
      } else if (action === 'withdraw' && p.amount) {
        await runAction('withdraw', p, { skipUserLabel: true });
      } else if (['balance', 'transfer', 'deposit', 'withdraw'].includes(action)) {
        // Missing params — open the form (pre-populate what we have)
        setActiveAction(action);
        addMessage('assistant', `I'll help you ${action}. Fill in the details below.`);
      } else {
        await runAction(action, p, { skipUserLabel: true });
      }
      return;
    }
    addMessage('assistant', result.message || 'Try a banking action or a topic like “token exchange”.');
  }

  /** NL API errors: 401 is session missing on server — not a parse failure. */
  function reportNlFailure(err) {
    if (err?.code === 'session_not_hydrated') {
      if (!cookieOnlyBffSession) {
        notifyError(
          'Sign in again: server session has no tokens (Vercel needs Redis/Upstash + redeploy, then sign out & sign in).',
          { autoClose: 12000 },
        );
      }
      if (!sessionFixBubbleShownRef.current) {
        sessionFixBubbleShownRef.current = true;
        addMessage('error', SESSION_NOT_HYDRATED_CHAT, null, { showSessionFixActions: true });
      }
      const pSess = (location.pathname || '').replace(/\/$/, '') || '/';
      if (isPublicMarketingAgentPath(pSess)) {
        window.dispatchEvent(new CustomEvent('marketing-scroll-login'));
      }
      return;
    }
    if (err?.statusCode === 401 || err?.code === 'authentication_required') {
      if (cookieOnlyBffSession) {
        if (!sessionFixBubbleShownRef.current) {
          sessionFixBubbleShownRef.current = true;
          addMessage('error', SESSION_NOT_HYDRATED_CHAT, null, { showSessionFixActions: true });
        }
        return;
      }
      notifyError(
        'Sign in required — the server has no session for this request. Refresh the page and sign in again.',
        { autoClose: agentToastMs.errShort },
      );
      addMessage(
        'assistant',
        'You need an active server session to use the agent. If you already signed in, refresh the page (session may have expired or cookies may not have reached the API).',
      );
      const p401 = (location.pathname || '').replace(/\/$/, '') || '/';
      if (isPublicMarketingAgentPath(p401)) {
        window.dispatchEvent(new CustomEvent('marketing-scroll-login'));
      }
      return;
    }
    notifyError(`❌ Could not parse request: ${err.message}`, { autoClose: agentToastMs.errShort });
    addMessage('assistant', `Could not parse: ${err.message}`);
  }

  async function handleNaturalLanguage() {
    const text = nlInput.trim();
    if (!text) return;
    if (!isLoggedIn && !marketingGuestChatEnabled) return;
    if (isAgentBlockedByConsentDecline()) {
      addMessage('assistant', AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }
    setNlLoading(true);
    addMessage('user', text);
    setNlInput('');
    try {
      const logQuery = parseLogPrompt(text);
      if (logQuery) {
        if (logQuery.type === 'errors') {
          const params = new URLSearchParams({
            level: 'error',
            limit: String(logQuery.limit),
          });
          const sources = ['console', 'app', 'vercel'];
          const results = await Promise.allSettled(
            sources.map((src) => fetch(`/api/logs/${src}?${params.toString()}`, { credentials: 'include' }))
          );
          const merged = [];
          for (let i = 0; i < results.length; i += 1) {
            const res = results[i];
            if (res.status !== 'fulfilled' || !res.value.ok) continue;
            const body = await res.value.json();
            (body.logs || []).forEach((log) => {
  merged.push({ ...log, _src: sources[i] });
});
          }
          const top = merged
            .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
            .slice(0, logQuery.limit);
          if (top.length === 0) {
            addMessage('assistant', `No error logs found in the last ${logQuery.limit} entries.`);
          } else {
            const lines = top.map((l, idx) => {
              const when = new Date(l.timestamp || Date.now()).toLocaleString();
              return `${idx + 1}. [${(l.level || 'error').toUpperCase()}] (${l._src}) ${when}\n   ${String(l.message || '').slice(0, 180)}`;
            });
            addMessage('assistant', `Last ${top.length} errors:\n\n${lines.join('\n\n')}`);
          }
        } else if (logQuery.type === 'last_login') {
          const p = new URLSearchParams({
            username: logQuery.username,
            action: 'LOGIN',
            limit: '1',
          });
          const res = await fetch(`/api/admin/activity?${p.toString()}`, { credentials: 'include' });
          if (!res.ok) {
            if (res.status === 403) {
              addMessage('assistant', 'Log query requires admin access. Sign in as admin to query activity logs.');
            } else {
              addMessage('assistant', `Could not query login activity (HTTP ${res.status}).`);
            }
          } else {
            const body = await res.json();
            const log = body.logs?.[0];
            if (!log) {
              addMessage('assistant', `No successful login found for "${logQuery.username}".`);
            } else {
              const when = new Date(log.timestamp).toLocaleString();
              addMessage('assistant', `Last successful login for ${logQuery.username}:\n\n- Time: ${when}\n- Endpoint: ${log.endpoint || '/api/auth/login'}\n- IP: ${log.ipAddress || 'n/a'}`);
            }
          }
        }
        return;
      }
      const { source, result } = await parseNaturalLanguage(text);
      await dispatchNlResult(result, source, text);
    } catch (err) {
      reportNlFailure(err);
    } finally {
      setNlLoading(false);
    }
  }

  // After marketing OAuth return: replay NL that triggered the login redirect.
  useEffect(() => {
    if (!nlResumeAfterAuth || !isLoggedIn) return;
    const text = nlResumeAfterAuth;
    setNlResumeAfterAuth(null);
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      addMessage('user', text);
      setNlLoading(true);
      try {
        const { source, result } = await parseNaturalLanguage(text);
        if (!cancelled) await dispatchNlResult(result, source, '');
      } catch (e) {
        if (!cancelled) reportNlFailure(e);
      } finally {
        if (!cancelled) setNlLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot replay when nlResumeAfterAuth is set after OAuth
  }, [nlResumeAfterAuth, isLoggedIn]);

  // Float mode should return nothing when the dedicated /agent page is active
  if (!isInline && isAgentPage) return null;

  const floatShell = (
    <div
      className={`banking-agent-float-root${distinctFloatingChrome && !isInline ? ' banking-agent-float-root--distinct' : ''}`}
      data-agent-ui="floating"
    >
      {/* FAB - only shown when floating agent is collapsed (not in inline mode) */}
      {!isInline && !isOpen && (
        <button
          type="button"
          className="banking-agent-fab"
          onClick={() => setIsOpen(true)}
          aria-label={`Open ${brandShortName} AI Agent`}
          title={`Open ${brandShortName} AI Agent`}
        >
          <span className="banking-agent-fab-icon">🏦</span>
          <span className="banking-agent-fab-label">AI Agent</span>
        </button>
      )}

      {/* Results panel — sits to the left of the agent (float mode only) */}
      {!isInline && effectiveIsOpen && resultPanel && (
        <ResultsPanel
          panel={resultPanel}
          onClose={() => setResultPanel(null)}
          style={resultsPanelStyle}
        />
      )}

      {/* Panel */}
      {effectiveIsOpen && (
        <div
          className={`banking-agent-panel${isDark ? '' : ' ba-mode-light'}${isExpanded && !isInline ? ' ba-expanded' : ''}${isInline ? ' ba-mode-inline' : ''}${isBottomDock ? ' ba-embedded-bottom-dock' : ''}${splitChrome ? ' ba-split-column' : ''}`}
          role="dialog"
          aria-label={isConfigEmbeddedFocus ? 'Application setup assistant' : `${brandShortName} AI Agent`}
          ref={panelRef}
          style={panelStyle}
        >
          {/* P1 — Reconnecting banner: shown while Upstash write is still propagating */}
          {sessionReconnecting && (
            <div className="ba-reconnecting" role="status" aria-live="polite">
              <span className="ba-reconnecting__spinner" aria-hidden="true">⟳</span>
              Reconnecting to your session…
            </div>
          )}

          {/* Header — spans full width */}
          {/* In inline mode: no drag handle. In float mode: drag to reposition */}
          <div
            role="button"
            tabIndex={isInline ? -1 : 0}
            className={`ba-header${isInline ? '' : ' banking-agent-drag-handle'}`}
            onMouseDown={isInline ? undefined : handleDragStart}
          >
            <div className="ba-header-top">
              <div className="ba-header-left">
                <span className="ba-status-dot" />
                <div>
                  <div className="ba-title">
                    {isConfigEmbeddedFocus
                      ? 'Application setup assistant'
                      : splitChrome
                        ? `${brandShortName} Assistant`
                        : `${brandShortName} AI Agent`}
                  </div>
                  <div className="ba-subtitle">
                    {isConfigEmbeddedFocus
                      ? isLoggedIn
                        ? `PingOne · OAuth · branding (${brandShortName}) · environment variables`
                        : 'Sign in to get started'
                      : splitChrome
                        ? isLoggedIn
                          ? `${effectiveUser.role === 'admin' ? 'Admin' : 'Customer'} · ${effectiveUser.firstName || effectiveUser.name?.split(' ')[0] || 'Signed in'}`
                          : marketingGuestChatEnabled
                            ? 'Chat here — PingOne when you use banking'
                            : 'Sign in to get started'
                        : isLoggedIn
                          ? `${effectiveUser.firstName || effectiveUser.name?.split(' ')[0] || 'Signed in'} · ${effectiveUser.role === 'admin' ? '👑 Admin' : '👤 Customer'}`
                          : marketingGuestChatEnabled
                            ? 'Chat here — PingOne when you use banking'
                            : 'Sign in to get started'}
                  </div>
                </div>
              </div>
              {splitChrome && isLoggedIn && (effectiveUser?.id || effectiveUser?.username) && (
                <div className="ba-header-session" title="PingOne user id">
                  {effectiveUser?.id || effectiveUser?.username}
                </div>
              )}
              <div className="ba-header-tools">
                {/* Expand/restore only available in float mode */}
                {!isInline && (
                  <button
                    type="button"
                    className="ba-icon-btn"
                    onClick={() => { setIsExpanded(e => !e); setDragPos(null); }}
                    title={isExpanded ? 'Restore size' : 'Expand to larger window'}
                  >
                    {isExpanded ? '⊟' : '⊞'}
                  </button>
                )}
                <select
                  className="ba-agent-appearance-select"
                  value={agentAppearance}
                  onChange={(e) => setAgentAppearance(e.target.value)}
                  aria-label="Agent panel theme"
                  title="Agent: match page theme, or use its own light/dark"
                >
                  <option value="auto">Agent: Match page</option>
                  <option value="light">Agent: Light</option>
                  <option value="dark">Agent: Dark</option>
                </select>
                <button
                  type="button"
                  className="ba-icon-btn"
                  onClick={() => toggleTheme()}
                  title={
                    appTheme === 'dark'
                      ? 'Page: switch to light mode'
                      : 'Page: switch to dark mode'
                  }
                >
                  {appTheme === 'dark' ? '☀️' : '🌙'}
                </button>
                {splitChrome && isLoggedIn && (
                  <button
                    type="button"
                    className="ba-header-signout"
                    onClick={() => onLogout?.()}
                  >
                    Sign out
                  </button>
                )}
                {/* Collapse to FAB only in float mode */}
                {!isInline && (
                  <button 
                    type="button"
                    className="ba-icon-btn" 
                    onClick={() => setIsOpen(false)} 
                    aria-label="Collapse agent"
                    title="Collapse agent"
                  >
                    ▼
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Two-column body */}
          <div className="ba-body">
            {isLoggedIn && consentBlocked && (
              <div className="ba-consent-denied-banner" role="alert">
                <div className="ba-consent-denied-banner__text">
                  <strong>Access denied.</strong> You declined a high-value transaction. The AI banking assistant
                  is not available for this session. Sign out and sign in again to restore it.
                </div>
                <div className="ba-consent-denied-banner__actions">
                  <button
                    type="button"
                    className="ba-consent-denied-banner__btn ba-consent-denied-banner__btn--secondary"
                    onClick={() => edu?.open(EDU.HUMAN_IN_LOOP, 'decline')}
                  >
                    Learn: Human-in-the-loop
                  </button>
                  <button type="button" className="ba-consent-denied-banner__btn" onClick={() => onLogout?.()}>
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {/* High-value transaction consent — shown before OTP (HITL) */}
            {hitlPendingIntent && (
              <AgentConsentModal
                transaction={hitlPendingIntent.intentPayload}
                onAccept={async () => {
                  const { actionId, intentPayload } = hitlPendingIntent;
                  try {
                    const { data } = await bffAxios.post('/api/transactions/consent-challenge', intentPayload);
                    const cid = data?.challengeId;
                    if (!cid) {
                      notifyError('Could not start consent — no challenge id from server.');
                      setHitlPendingIntent(null);
                      return;
                    }
                    setHitlPendingIntent(null);
                    // Pass snapshot from POST response directly — avoids GET race on Vercel
                    setHitlChallengeId({ challengeId: cid, actionId, snapshot: data.snapshot || null });
                  } catch (ex) {
                    const msg = ex.response?.data?.message || ex.response?.data?.error || ex.message || 'Could not start consent flow.';
                    notifyError(msg);
                    setHitlPendingIntent(null);
                  }
                }}
                onDismiss={() => setHitlPendingIntent(null)}
              />
            )}

            {/* OTP + transaction execution — rendered once challenge is created */}
            {hitlChallengeId && (
              <TransactionConsentModal
                open
                challengeId={hitlChallengeId.challengeId}
                preloadedSnapshot={hitlChallengeId.snapshot}
                user={effectiveUser}
                autoConfirm
                onClose={() => setHitlChallengeId(null)}
                onTransactionSuccess={(msg) => {
                  const { actionId } = hitlChallengeId;
                  setHitlChallengeId(null);
                  addMessage('assistant', `✅ **Transaction approved and completed.**\n\n${msg}`, actionId);
                  notifySuccess(`✅ ${msg}`);
                  // Notify UserDashboard to refresh accounts if it happens to be mounted
                  window.dispatchEvent(new CustomEvent('banking-agent-hitl-confirmed', {
                    detail: { actionId, successMsg: msg },
                  }));
                }}
                onDeclinedConfirmed={() => {
                  setHitlChallengeId(null);
                  notifyInfo('Transaction declined. The AI assistant stays active for read-only actions.');
                }}
              />
            )}

            {/* ── Left column: suggestions + actions/auth ── */}
            <div className="ba-left-col">
              {isLoggedIn && (
                <>
                  <div className="ba-left-label">Session</div>
                  <button
                    type="button"
                    className="ba-action-item"
                    onClick={() => void handleSessionRefresh()}
                    disabled={sessionRefreshing || loading || consentBlocked}
                    title="Refresh your access token using PingOne refresh token (no logout)"
                  >
                    {sessionRefreshing ? 'Refreshing…' : '🔄 Refresh access token'}
                  </button>
                  <button
                    type="button"
                    className="ba-action-item"
                    onClick={() => handleLoginAction(effectiveUser?.role === 'admin' ? 'login_admin' : 'login_user')}
                    disabled={loading || consentBlocked}
                    title="Sign in again if refresh fails"
                  >
                    🔐 Sign in again
                  </button>
                </>
              )}

              <div className="ba-left-label">Try asking:</div>
              {suggestionList.map(s => (
                <button
                  key={s}
                  type="button"
                  className="ba-suggestion"
                  disabled={consentBlocked}
                  onClick={() => {
                    if (isAgentBlockedByConsentDecline()) {
                      addMessage('assistant', AGENT_CONSENT_BLOCK_USER_MESSAGE);
                      return;
                    }
                    setNlInput(s);
                    if (isLoggedIn || marketingGuestChatEnabled) {
                      setNlInput('');
                      addMessage('user', s);
                      setNlLoading(true);
                      parseNaturalLanguage(s)
                        .then(({ source, result }) => dispatchNlResult(result, source, s))
                        .catch(err => reportNlFailure(err))
                        .finally(() => setNlLoading(false));
                    }
                  }}
                >
                  "{s}"
                </button>
              ))}

              <div className="ba-left-divider" />

              {isLoggedIn ? (
                <>
                  <div className="ba-left-label">Actions:</div>
                  {actionsList.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      className="ba-action-item"
                      onClick={() => handleActionClick(a.id)}
                      disabled={loading || (consentBlocked && a.id !== 'logout')}
                      title={a.desc}
                    >
                      {a.label}
                    </button>
                  ))}

                  <div className="ba-left-divider" />

                  <div className="ba-left-label">Learn &amp; Explore:</div>
                  {EDUCATION_COMMANDS.map(cmd => (
                    <button
                      key={cmd.id}
                      type="button"
                      className="ba-action-item"
                      onClick={() => openEducationCommand(cmd)}
                      disabled={consentBlocked}
                      title={cmd.label}
                    >
                      {cmd.label}
                    </button>
                  ))}
                </>
              ) : (
                <div className="ba-left-auth">
                  <div className="ba-left-auth-notice">
                    {marketingGuestChatEnabled
                      ? '🔐 Banking uses PingOne — we’ll redirect you when you ask for accounts, transfers, etc.'
                      : '🔐 Sign in required to access AI banking features'}
                  </div>
                  <button
                    type="button"
                    className="ba-left-auth-btn primary"
                    onClick={() => handleLoginAction('login_user')}
                    disabled={oauthConfig === null || !oauthConfig?.user}
                    title={oauthConfig?.user ? 'Sign in as a bank customer' : 'Configure credentials first'}
                  >
                    👤 Customer Sign In
                  </button>
                  <button
                    type="button"
                    className="ba-left-auth-btn"
                    onClick={() => handleLoginAction('login_admin')}
                    disabled={oauthConfig === null || !oauthConfig?.admin}
                    title={oauthConfig?.admin ? 'Sign in as administrator' : 'Configure credentials first'}
                  >
                    👑 Admin Sign In
                  </button>
                  <button
                    type="button"
                    className={`ba-left-config-btn${isConfigured ? ' configured' : ''}`}
                    onClick={() => { setIsOpen(false); navigate('/config'); }}
                  >
                    {isConfigured ? '✅ PingOne Configured' : '⚙️ Configure PingOne'}
                  </button>
                </div>
              )}
            </div>

            {/* ── Right column: chat messages + input ── */}
            <div className="ba-right-col">
              {/* Messages */}
              <div className="banking-agent-messages" ref={messagesContainerRef}>
                {messages.length === 0 && (
                  <div className="ba-welcome">
                    <p>
                      {isLoggedIn
                        ? 'Type a message or pick an action on the left.'
                        : oauthConfig === null
                          ? 'Checking configuration…'
                          : marketingGuestChatEnabled
                            ? isConfigured
                              ? 'Ask about OAuth or try a suggestion — we’ll open PingOne only when you need banking.'
                              : 'Set up PingOne in Application setup — you can still ask general questions once configured.'
                            : isConfigured
                              ? 'PingOne is configured — sign in to get started.'
                              : 'Set up your PingOne credentials to get started.'}
                    </p>
                  </div>
                )}
                {messages.map(msg => {
                  if (msg.role === 'tool-progress') {
                    return (
                      <div key={msg.id} className="banking-agent-msg tool-progress">
                        <span className="banking-agent-msg-avatar banking-agent-msg-avatar--tool" aria-hidden>⚙</span>
                        <div className="banking-agent-msg-bubble banking-agent-msg-bubble--toolsteps">
                          <ToolProgressChips steps={msg.steps} />
                        </div>
                      </div>
                    );
                  }
                  if (msg.role === 'error' && msg.showSessionFixActions) {
                    return (
                      <div key={msg.id} className="banking-agent-msg error">
                        <div className="banking-agent-msg-bubble banking-agent-msg-bubble--session-fix">
                          <pre className="banking-agent-msg-text">{msg.content}</pre>
                          <div className="ba-session-fix-actions">
                            <button
                              type="button"
                              className="ba-session-fix-btn ba-session-fix-btn--secondary"
                              onClick={() => window.open('/api/auth/debug?deep=1', '_blank', 'noopener,noreferrer')}
                            >
                              Open session debug
                            </button>
                            <button
                              type="button"
                              className="ba-session-fix-btn"
                              onClick={() => onLogout?.()}
                            >
                              Sign out (then sign in again)
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className={`banking-agent-msg ${msg.role}`}>
                      {msg.role === 'assistant' && <span className="banking-agent-msg-avatar">🏦</span>}
                      <div className="banking-agent-msg-bubble">
                        <pre className="banking-agent-msg-text">{msg.content}</pre>
                        {msg.tool && <span className="banking-agent-tool-badge">⚙ {msg.tool}</span>}
                      </div>
                    </div>
                  );
                })}
                {loading && (
                  <div className="banking-agent-msg assistant typing">
                    <span className="banking-agent-msg-avatar">🏦</span>
                    <div className="banking-agent-msg-bubble">
                      <span className="banking-agent-dots"><span /><span /><span /></span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Learn popup (⚡ button) */}
              {showCommands && isLoggedIn && !activeAction && !consentBlocked && (
                <div className="ba-commands-popup">
                  <div className="ba-commands-section">Learn &amp; Explore</div>
                  <div className="ba-chips">
                    {EDUCATION_COMMANDS.map(cmd => (
                      <button
                        key={cmd.id}
                        type="button"
                        className="ba-chip ba-chip--learn"
                        onClick={() => { openEducationCommand(cmd); setShowCommands(false); }}
                      >
                        {cmd.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action form (when user selects a transaction action) */}
              {activeAction && (
                <div ref={actionFormAnchorRef} className="ba-action-form-anchor">
                  <ActionForm
                    action={activeAction}
                    loading={loading}
                    onSubmit={form => runAction(activeAction, form)}
                    onCancel={() => setActiveAction(null)}
                    effectiveUser={effectiveUser}
                    liveAccounts={liveAccounts}
                  />
                </div>
              )}

              {/* Bottom input bar */}
              <div className="ba-bottom">
                {isLoggedIn || marketingGuestChatEnabled ? (
                  <div className="ba-input-row">
                    <button
                      type="button"
                      className={`ba-cmd-btn${showCommands ? ' active' : ''}`}
                      onClick={() => setShowCommands(s => !s)}
                      title="Learn &amp; Explore topics"
                      aria-expanded={showCommands}
                      disabled={consentBlocked || !isLoggedIn}
                    >
                      ⚡
                    </button>
                    <input
                      className="ba-input"
                      value={nlInput}
                      onChange={e => setNlInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleNaturalLanguage();
                          setShowCommands(false);
                        }
                      }}
                      placeholder={
                        marketingGuestChatEnabled && !isLoggedIn
                          ? `Ask about OAuth or type a banking request…`
                          : splitChrome && !nlMeta?.groqConfigured
                            ? 'Ask about your accounts…'
                            : nlMeta?.groqConfigured
                              ? `Message ${brandShortName} AI… (Groq AI)`
                              : `Message ${brandShortName} AI…`
                      }
                      disabled={nlLoading || consentBlocked}
                    />
                    <button
                      type="button"
                      className="ba-send-btn"
                      onClick={() => { handleNaturalLanguage(); setShowCommands(false); }}
                      disabled={nlLoading || !nlInput.trim() || consentBlocked}
                      aria-label="Send"
                    >
                      {nlLoading ? '…' : splitChrome ? 'Send' : '↑'}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--ba-muted)', fontSize: '12px' }}>
                    Sign in using the buttons on the left to start chatting
                  </div>
                )}
              </div>

              {/* Dashboard navigation button — pinned below prompt */}
              {isLoggedIn && (
                <button
                  type="button"
                  className="ba-left-auth-btn primary"
                  style={{ margin: '6px 12px 0', width: 'calc(100% - 24px)', display: 'block' }}
                  onClick={() => {
                    setIsOpen(false);
                    navigate(effectiveUser?.role === 'admin' ? '/admin' : '/dashboard');
                  }}
                >
                  {effectiveUser?.role === 'admin' ? '👑 Admin Dashboard' : '📊 My Dashboard'}
                </button>
              )}

              {/* Connected services chips — below prompt */}
              <div className="ba-chips-footer">
                <span
                  className="ba-server-chip ba-server-chip--active"
                  title={isConfigEmbeddedFocus ? 'MCP tools (same server — use for discovery)' : 'Banking AI tools service — connected'}
                >
                  <span className="ba-chip-dot" />
                  {isConfigEmbeddedFocus ? 'MCP tools' : 'Banking Tools'}
                  {mcpStatus.connected && mcpStatus.toolCount != null && (
                    <span className="ba-chip-count">{mcpStatus.toolCount} actions</span>
                  )}
                </span>
                <span className="ba-server-chip ba-server-chip--active" title="PingOne Identity — connected">
                  <span className="ba-chip-dot" />
                  PingOne Identity
                </span>
              </div>
            </div>
          </div>
          {/* Resize handles — all 8 directions, float mode only */}
          {!isInline && (
            <>
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--se" onMouseDown={(e) => handleResize(e, 'se')} aria-label="Resize southeast" />
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--e"  onMouseDown={(e) => handleResize(e, 'e')}  aria-label="Resize east" />
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--s"  onMouseDown={(e) => handleResize(e, 's')}  aria-label="Resize south" />
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--n"  onMouseDown={(e) => handleResize(e, 'n')}  aria-label="Resize north" />
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--ne" onMouseDown={(e) => handleResize(e, 'ne')} aria-label="Resize northeast" />
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--nw" onMouseDown={(e) => handleResize(e, 'nw')} aria-label="Resize northwest" />
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--w"  onMouseDown={(e) => handleResize(e, 'w')}  aria-label="Resize west" />
              <div role="button" tabIndex="0" className="ba-resize-handle ba-resize-handle--sw" onMouseDown={(e) => handleResize(e, 'sw')} aria-label="Resize southwest" />
            </>
          )}
        </div>
      )}
    </div>
  );

  // Inline/embed stays in React tree; float mounts on body so position:fixed is never trapped
  // by .App / shell overflow or theme transforms, and works the same on /logs and app routes.
  if (isInline) return <>{floatShell}</>;
  return createPortal(floatShell, document.body);
}

