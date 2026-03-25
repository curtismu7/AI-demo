import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  getMyAccounts,
  getAccountBalance,
  getMyTransactions,
  createTransfer,
  createDeposit,
  createWithdrawal,
} from '../services/bankingAgentService';
import { loadPublicConfig } from '../services/configService';
import { useEducationUIOptional } from '../context/EducationUIContext';
import { useTokenChainOptional } from '../context/TokenChainContext';
import { EDU } from './education/educationIds';
import { EDUCATION_COMMANDS } from './education/educationCommands';
import { fetchNlStatus, parseNaturalLanguage } from '../services/bankingAgentNlService';
import { getToolStepsForAction } from '../utils/agentToolSteps';
import './BankingAgent.css';

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

function generateFakeAccounts(user) {
  const userId = user?.sub || user?.id || 'user123';
  
  // Generate consistent account IDs based on user ID
  const seed = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const accounts = [
    {
      id: `acc_${seed}_checking`,
      name: 'Primary Checking',
      type: 'checking',
      balance: 5234.89 + (seed % 1000),
      accountNumber: `4872${seed % 10000}`,
    },
    {
      id: `acc_${seed}_savings`,
      name: 'Emergency Savings',
      type: 'savings',
      balance: 12567.43 + (seed % 2000),
      accountNumber: `5921${seed % 10000}`,
    },
    {
      id: `acc_${seed}_credit`,
      name: 'Rewards Credit Card',
      type: 'credit',
      balance: -892.15 - (seed % 500),
      accountNumber: `8234${seed % 10000}`,
    },
  ];
  
  return accounts;
}

// ─── Suggested prompts — role-aware ──────────────────────────────────────────

const SUGGESTIONS_CUSTOMER = [
  'Check my account balance',
  'Transfer $100 to savings',
  'What are my recent transactions?',
  'List MCP tools',
  'What is CIBA?',
  'How does token exchange work?',
  'What is MCP?',
];

const SUGGESTIONS_ADMIN = [
  'Show all customer accounts',
  'List recent system transactions',
  'Show me last 5 errors',
  'Show last success login for bankuser',
  'List MCP tools',
  'What is CIBA?',
  'How does token exchange work?',
  'What is step-up auth?',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  return typeof n === 'number'
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : n;
}

function formatResult(result) {
  if (!result) return 'No data returned.';
  // Accounts list
  if (result.accounts) {
    return result.accounts.map(a =>
      `${a.account_type || a.type || 'Account'}: ${a.account_number || a.id}\n  Balance: ${formatCurrency(a.balance)}`
    ).join('\n\n');
  }
  // Transactions list
  if (result.transactions) {
    return result.transactions.slice(0, 10).map(t =>
      `${t.type}: ${formatCurrency(t.amount)} — ${t.description || ''}\n  ${new Date(t.created_at || t.createdAt).toLocaleDateString()}`
    ).join('\n\n');
  }
  // Balance response
  if (result.balance !== undefined) {
    return `Balance: ${formatCurrency(result.balance)}`;
  }
  // Transaction confirmation
  if (result.transaction_id || result.transactionId || result.id) {
    return `✅ Success\nTransaction ID: ${result.transaction_id || result.transactionId || result.id}\nAmount: ${formatCurrency(result.amount)}`;
  }
  return JSON.stringify(result, null, 2);
}

// ─── Input form for actions that need parameters ──────────────────────────────

function ActionForm({ action, onSubmit, onCancel, loading, effectiveUser }) {
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fakeAccounts = generateFakeAccounts(effectiveUser);
  
  const fields = {
    balance:  [{ key: 'accountId', label: 'Account', type: 'select', options: fakeAccounts }],
    deposit:  [
      { key: 'accountId', label: 'Account', type: 'select', options: fakeAccounts },
      { key: 'amount',    label: 'Amount ($)',  placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',        placeholder: 'optional' },
    ],
    withdraw: [
      { key: 'accountId', label: 'Account', type: 'select', options: fakeAccounts },
      { key: 'amount',    label: 'Amount ($)',  placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',        placeholder: 'optional' },
    ],
    transfer: [
      { key: 'fromId',    label: 'From Account', type: 'select', options: fakeAccounts },
      { key: 'toId',      label: 'To Account',   type: 'select', options: fakeAccounts.filter(a => a.id !== fakeAccounts[0]?.id) },
      { key: 'amount',    label: 'Amount ($)',        placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',              placeholder: 'optional' },
    ],
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
              onChange={e => set(f.key, e.target.value)}
              className="banking-agent-select"
            >
              {f.options.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.accountNumber}) - ${option.balance.toFixed(2)}
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
        <button type="button" className="banking-agent-btn-primary" disabled={loading} onClick={() => onSubmit(form)}>
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

function welcomeMessage(u) {
  if (!u) return "👋 You're signed in! What would you like to do?";
  const name = u.firstName || u.name?.split(' ')[0] || 'there';
  if (u.role === 'admin') {
    return `👑 Welcome, ${name}! As an admin you can query accounts system-wide, view all transactions, manage users, and explore PingOne OAuth flows. What would you like to do?`;
  }
  return `👋 Hi ${name}! I can check your balances, move money between accounts, and explain the OAuth flows happening behind the scenes. What would you like to do?`;
}

function handleLoginAction(actionId) {
  const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
  if (actionId === 'login_admin') {
    window.location.href = `${apiUrl}/api/auth/oauth/login`;
  } else {
    window.location.href = `${apiUrl}/api/auth/oauth/user/login`;
  }
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
  'login-flow': `🔐 Authorization Code + PKCE Flow:\n\n1. App generates code_verifier (random 64 bytes) + code_challenge (SHA-256 hash)\n2. Browser redirects to PingOne /as/authorize with challenge\n3. User authenticates → PingOne redirects back with code\n4. BFF exchanges code + verifier for tokens (server-side only)\n5. Browser never sees the token — only a session cookie\n\nPKCE prevents interception: even if code is stolen, attacker can't exchange it without the verifier.`,
  'token-exchange': `🔄 RFC 8693 Token Exchange (T1 → T2):\n\nWhy: The browser token (T1) has broad scope. The MCP server needs a narrowly-scoped token (T2) for least-privilege.\n\nHow:\n• BFF holds T1 (user's session token)\n• BFF calls PingOne /as/token with grant_type=urn:ietf:params:oauth:grant-type:token-exchange\n• T1 is subject_token; agent client credentials are actor_token\n• PingOne validates may_act claim in T1 and issues T2\n• T2 has: sub=user, act={client_id=agent}, narrow scope, MCP audience\n\nmay_act in T1 → act in T2 — proving delegation chain.`,
  'may-act': `📋 may_act / act Claims (RFC 8693 §4.1):\n\nmay_act in T1 (user token): "this client is allowed to act on my behalf"\n  { "sub": "user-uuid", "may_act": { "client_id": "bff-admin-client" } }\n\nact in T2 (exchanged token): "this action was delegated"\n  { "sub": "user-uuid", "act": { "client_id": "bff-admin-client" } }\n\nThe MCP server validates act to confirm the BFF is the authorized actor — not just any client that got a token.`,
  'mcp-protocol': `⚙️ Model Context Protocol (MCP):\n\nMCP is a JSON-RPC 2.0 protocol over WebSocket (or stdio/SSE) for AI tools.\n\nHandshake:\n  initialize → { protocolVersion, capabilities, serverInfo }\n  → initialized (ACK)\n\nDiscovery:\n  tools/list → [{ name, description, inputSchema }]\n\nExecution:\n  tools/call { name, arguments } → { content: [{ type, text }] }\n\nIn this demo:\n  Browser → BFF (/api/mcp/tool) → MCP Server (WebSocket) → Banking API\n\nToken flow: BFF performs RFC 8693 exchange before forwarding tool calls.`,
  'introspection': `🔍 RFC 7662 Token Introspection:\n\nThe MCP server calls PingOne to validate tokens in real-time:\n  POST /as/introspect\n  { token: "...", token_type_hint: "access_token" }\n  → { active: true, sub, scope, exp, aud }\n\nWhy not just verify the JWT locally?\n• Catches revoked tokens (user logged out, compromised session)\n• Zero-trust: every tool call re-validates the token\n• Results cached 60s to avoid hammering PingOne`,
  'step-up': `⬆️ Step-Up Authentication:\n\nTriggered when a high-value action requires stronger auth:\n• Transfer ≥ $250 → require MFA\n• BFF returns HTTP 428 with WWW-Authenticate: Bearer scope="step_up"\n\nTwo methods:\n1. CIBA: PingOne pushes challenge to user's device (out-of-band)\n2. Redirect: Browser redirects to /api/auth/oauth/user/stepup?acr_values=Multi_factor\n\nAfter approval, PingOne issues new token with higher ACR — BFF stores it and retries the original transaction.`,
  'agent-gateway': `🌐 Agent Gateway / Resource Indicators (RFC 8707):\n\nRFC 8707: client specifies the resource URI when requesting a token\n  /as/token?resource=https://mcp.example.com\n  → token aud = "https://mcp.example.com"\n\nRFC 9728: Protected Resource Metadata\n  GET https://mcp.example.com/.well-known/oauth-protected-resource\n  → { resource, authorization_servers, scopes_supported }\n\nThis lets a dynamic AI agent discover what auth is needed before attempting a tool call — no hardcoded configuration.`,
  'pingone-authorize': `🔐 PingOne Authorize (DaVinci):\n\nPingOne Authorize evaluates access policies at runtime using DaVinci flows.\n\nIn this demo it drives:\n• Step-up MFA triggers (ACR values like "Multi_factor")\n• CIBA push notifications to the user's device\n• Dynamic consent for high-value transactions\n\nThe acr_values parameter in /as/authorize tells PingOne which DaVinci policy to run.`,
  'cimd': `📄 Client ID Metadata Document (CIMD / RFC 7591):\n\nTraditional OAuth: client_id is an opaque string, pre-registered in the AS.\nCIMD: client_id is a URL you control — it hosts the client's metadata.\n\nThe AS fetches the URL to discover:\n  { redirect_uris, grant_types, scope, client_name, logo_uri, … }\n\nBenefits:\n• No pre-registration — client registers itself\n• Client controls updates (change the hosted document)\n• Works across AS instances that support DCR/RFC 7591\n\nIn this demo: click "▶ Simulate" in the CIMD panel to see PingOne dynamic client registration.`,
};

export default function BankingAgent({ user, onLogout, mode = 'float' }) {
  const isInline = mode === 'inline';
  const edu = useEducationUIOptional();
  const tokenChain = useTokenChainOptional();
  // Always open by default, unless user explicitly collapsed it (persisted in localStorage)
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('bankingAgentOpen');
    return saved === null ? true : saved === 'true';
  });
  const [isDark, setIsDark] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlMeta, setNlMeta] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  /** null = loading; which OAuth flows have client IDs + environment */
  const [oauthConfig, setOauthConfig] = useState(null);
  /** {x,y} when panel has been dragged; null = CSS-anchored default position */
  const [dragPos, setDragPos] = useState(null);
  /** Panel dimensions for resizing */
  const [panelSize, setPanelSize] = useState({ width: 820, height: 560 });
  /** Side panel showing rich results next to the agent */
  const [resultPanel, setResultPanel] = useState(null);
  /** MCP server connection status for header display */
  const [mcpStatus, setMcpStatus] = useState({ toolCount: null, connected: false });
  /**
   * Self-detected session user — populated by independent auth check so the
   * agent knows the session even if the parent App.js user prop hasn't resolved yet.
   */
  const [sessionUser, setSessionUser] = useState(null);

  const bottomRef = useRef(null);
  const toolProgressIdRef = useRef(null);
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // On the /agent route the inline instance is shown — hide floating widget entirely
  const isAgentPage = location.pathname === '/agent';
  const isLogsPage = location.pathname === '/logs';

  // Persist isOpen state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('bankingAgentOpen', isOpen.toString());
  }, [isOpen]);

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
            fetch('/api/auth/oauth/status',      { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('/api/auth/oauth/user/status', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('/api/auth/session',           { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
          ]);
          const [admin, endUser, session] = result;
          const found = (admin?.authenticated && admin.user)
            ? admin.user
            : (endUser?.authenticated && endUser.user)
              ? endUser.user
              : (session?.authenticated && session.user)
                ? session.user
                : null;
          if (found) {
            setSessionUser(found);
            setMessages(prev =>
              prev.length === 0
                ? [{ id: Date.now().toString(), role: 'assistant', content: welcomeMessage(found) }]
                : prev
            );
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
    if (user) {
      // Respect explicit user preference — only auto-open if user hasn't collapsed it
      if (localStorage.getItem('bankingAgentOpen') !== 'false') {
        setIsOpen(true);
      }
      setMessages(prev =>
        prev.length === 0
          ? [{ id: Date.now().toString(), role: 'assistant', content: welcomeMessage(user) }]
          : prev
      );
    }
  }, [user]);

  // Effective user: prefer prop (App.js state), fall back to self-detected session
  const effectiveUser = user || sessionUser;
  const isLoggedIn = !!effectiveUser;
  const isConfigured = oauthConfig && (oauthConfig.admin || oauthConfig.user);

  /**
   * Independently check auth endpoints.  Called on mount, on panel open, and
   * when the 'userAuthenticated' event fires (App.js dispatches this after login).
   * Checks all three session types: admin OAuth, end-user OAuth, and basic auth.
   * When a session is found, also dispatches 'userAuthenticated' so App.js syncs.
   */
  const checkSelfAuth = useCallback(() => {
    Promise.all([
      fetch('/api/auth/oauth/status',      { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/oauth/user/status', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/session',           { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([admin, endUser, session]) => {
      const found = (admin?.authenticated && admin.user)
        ? admin.user
        : (endUser?.authenticated && endUser.user)
          ? endUser.user
          : (session?.authenticated && session.user)
            ? session.user
            : null;
      if (found) {
        setSessionUser(found);
        // Notify App.js so it sets its own `user` state → shows dashboard routes
        window.dispatchEvent(new CustomEvent('userAuthenticated'));
      }
    });
  }, []);

  // Check on mount — auto-open if already authenticated (e.g. page refresh after login)
  useEffect(() => {
    Promise.all([
      fetch('/api/auth/oauth/status',      { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/oauth/user/status', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/auth/session',           { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([admin, endUser, session]) => {
      const found = (admin?.authenticated && admin.user)
        ? admin.user
        : (endUser?.authenticated && endUser.user)
          ? endUser.user
          : (session?.authenticated && session.user)
            ? session.user
            : null;
      if (found) {
        setSessionUser(found);
        // Respect explicit user preference — only auto-open if user hasn't collapsed it
        if (localStorage.getItem('bankingAgentOpen') !== 'false') {
          setIsOpen(true);
        }
        setMessages([{ id: Date.now().toString(), role: 'assistant', content: welcomeMessage(found) }]);
        window.dispatchEvent(new CustomEvent('userAuthenticated'));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check when App.js confirms a login, and auto-open the agent
  useEffect(() => {
    const onAuth = () => {
      checkSelfAuth();
      // Respect explicit user preference — only auto-open if user hasn't collapsed it
      if (localStorage.getItem('bankingAgentOpen') !== 'false') {
        setIsOpen(true);
      }
      setMessages(prev =>
        prev.length === 0
          ? [{ id: Date.now().toString(), role: 'assistant', content: welcomeMessage(user || sessionUser) }]
          : prev
      );
    };
    window.addEventListener('userAuthenticated', onAuth);
    return () => window.removeEventListener('userAuthenticated', onAuth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkSelfAuth, user, sessionUser]);

  // Re-check when panel opens (catches sessions established after mount)
  useEffect(() => {
    if (isOpen) checkSelfAuth();
  }, [isOpen, checkSelfAuth]);

  // Mutual exclusion: close agent when an education panel opens
  useEffect(() => {
    if (edu?.panel) setIsOpen(false);
  }, [edu?.panel, edu.close]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutual exclusion: close any open education panel when agent opens
  useEffect(() => {
    if (isOpen && edu?.panel) edu.close();
  }, [isOpen, edu?.panel, edu.close]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, bottomRef]);

  useEffect(() => {
    if (!isOpen || !isLoggedIn) return;
    fetchNlStatus().then(setNlMeta).catch(() => setNlMeta({ geminiConfigured: false }));
  }, [isOpen, isLoggedIn]);

  // Fetch MCP server tool count for header display (best-effort; silent on failure)
  useEffect(() => {
    if (!isOpen || !isLoggedIn) return;
    fetch('/api/mcp/inspector/tools', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tools) {
          setMcpStatus({ toolCount: data.tools.length, connected: true });
        } else {
          setMcpStatus({ toolCount: ACTIONS.length, connected: true });
        }
      })
      .catch(() => setMcpStatus({ toolCount: ACTIONS.length, connected: true }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isLoggedIn]);

  // ── Drag-to-move ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e) => {
    // Don't intercept button/input clicks
    if (e.target.closest('button, input, textarea, select')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Anchor to current pixel position so we can move freely
    if (!dragPos) setDragPos({ x: rect.left, y: rect.top });
    e.preventDefault();
  }, [dragPos]);

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

  // Resize handler
  const handleResize = useCallback((e, direction) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    const startHeight = panelSize.height;

    function onMove(e) {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction.includes('e')) {
        newWidth = Math.min(1200, Math.max(600, startWidth + deltaX));
      }
      if (direction.includes('s')) {
        newHeight = Math.min(800, Math.max(400, startHeight + deltaY));
      }

      setPanelSize({ width: newWidth, height: newHeight });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelSize]);

  // Panel position: override CSS anchoring when user has dragged the window
  // In inline mode the CSS (.ba-mode-inline) handles size — no inline style needed
  const panelStyle = isInline
    ? {}
    : isExpanded
      ? { left: '16px', top: '16px', bottom: '16px', right: '16px', width: 'auto', height: 'auto' }
      : dragPos 
        ? { left: dragPos.x, top: dragPos.y, bottom: 'auto', right: 'auto', width: panelSize.width, height: panelSize.height }
        : { width: panelSize.width, height: panelSize.height };
  // Results panel sits to the left of the agent; shifts with it when dragged
  const resultsPanelStyle = dragPos
    ? { left: Math.max(8, dragPos.x - 528), top: dragPos.y, bottom: 'auto', right: 'auto' }
    : {};
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

  /**
   * Runs a banking tool. When fromNl is true, skips the extra user bubble (NL already echoed the ask).
   */
  async function runAction(actionId, form, opts = {}) {
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
          const mcpRes = await fetch('/api/mcp/inspector/tools', { credentials: 'include' });
          if (!mcpRes.ok) throw new Error(`MCP tools fetch failed: ${mcpRes.status}`);
          const data = await mcpRes.json();
          const tools = data.tools || [];
          const toolText = tools.length === 0
            ? 'No tools found — is the MCP server running?'
            : tools.map((t, i) =>
                `${i + 1}. ${t.name}\n   ${t.description || '(no description)'}\n   Inputs: ${Object.keys(t.inputSchema?.properties || {}).join(', ') || 'none'}`
              ).join('\n\n');
          addMessage('assistant', `🔧 MCP Banking Tools (${tools.length} available):\n\n${toolText}`, 'tools/list');
          setIsExpanded(true);
          toast.update(toastId, { render: `✅ ${tools.length} tools loaded`, type: 'success', isLoading: false, autoClose: 2000 });
          setLoading(false);
          toolProgressIdRef.current = null;
          return;
        }
        default:
          throw new Error(`Unknown action: ${actionId}`);
      }

      markToolProgressOutcome(true);

      // Push token events to TokenChainContext (updates TokenChainDisplay on dashboard)
      const tokenEvents = response.tokenEvents || [];
      if (tokenChain && tokenEvents.length > 0) {
        tokenChain.setTokenEvents(actionId, tokenEvents);
      }

      // Navigate to user dashboard and highlight relevant data for user commands
      if (effectiveUser?.role === 'customer') {
        let highlightSection = null;
        switch (actionId) {
          case 'accounts':
            highlightSection = 'accounts';
            break;
          case 'transactions':
            highlightSection = 'transactions';
            break;
          case 'balance':
          case 'deposit':
          case 'withdraw':
          case 'transfer':
            highlightSection = 'accounts';
            break;
          default:
            // No highlighting for other actions
            break;
        }
        
        if (highlightSection) {
          // Dispatch event to UserDashboard to highlight section
          window.dispatchEvent(new CustomEvent('agentDataReady', { 
            detail: { 
              section: highlightSection,
              action: actionId,
              result: response.result
            }
          }));
          
          // Navigate to dashboard after a short delay to show the agent result first
          setTimeout(() => {
            navigate('/dashboard');
            toast.info(`📊 View details in dashboard`, { autoClose: 3000 });
          }, 1500);
        }
      }

      // Show inline token event summary in the chat + dedicated toasts
      if (tokenEvents.length > 0) {
        const exchanged = tokenEvents.find(e => e.id === 'exchanged-token');
        const skipped   = tokenEvents.find(e => e.id === 'exchange-skipped');
        const failed    = tokenEvents.find(e => e.id === 'exchange-failed');
        const t1        = tokenEvents.find(e => e.id === 'user-token');

        let tokenMsg = null;
        if (exchanged) {
          const mayActStatus = t1?.mayActPresent ? '✅ may_act validated' : '⚠️ no may_act';
          const actStatus    = exchanged.actPresent ? `✅ act: ${exchanged.actDetails}` : '⚠️ no act claim';
          tokenMsg = `🔐 RFC 8693 Token Exchange\n${mayActStatus} → T2 issued · ${actStatus}\nScope: ${exchanged.scopeNarrowed || '—'} · Aud: ${exchanged.audienceNarrowed || '—'}`;
          toast.info(`🔐 Token Exchange complete — T2 issued (${exchanged.scopeNarrowed || 'scoped'})`, { autoClose: 4500 });
        } else if (skipped) {
          tokenMsg = '🔐 Token Exchange skipped — MCP_RESOURCE_URI not configured. T1 forwarded directly.';
          toast.warning('⚠️ Token Exchange skipped — T1 forwarded directly', { autoClose: 4000 });
        } else if (failed) {
          tokenMsg = `🔐 Token Exchange failed: ${failed.error || 'unknown error'}`;
          toast.error(`❌ Token Exchange failed: ${failed.error || 'unknown error'}`, { autoClose: 6000 });
        }
        if (tokenMsg) {
          addMessage('token-event', tokenMsg, actionId);
        }
      }

      // Populate results — side panel or full-page depending on user preference
      const result = response.result;
      const displayMode = localStorage.getItem('agentDisplayMode') || 'panel';

      let resultType = null;
      let resultData = null;
      if (result?.accounts) {
        resultType = 'accounts'; resultData = result.accounts;
      } else if (result?.transactions) {
        resultType = 'transactions'; resultData = result.transactions;
      } else if (result?.balance !== undefined) {
        resultType = 'balance'; resultData = result.balance;
      } else if (result?.transaction_id || result?.transactionId || result?.id) {
        resultType = 'confirm'; resultData = result;
      }

      if (resultType) {
        if (displayMode === 'fullpage') {
          // Push result to the main dashboard via custom event
          window.dispatchEvent(new CustomEvent('banking-agent-result', {
            detail: { type: resultType, data: resultData, label },
          }));
        } else {
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
        autoClose: 2500,
      });
    } catch (err) {
      markToolProgressOutcome(false);
      toast.dismiss(toastId);
      const isConnErr =
        err.message.includes('timed out') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ENETUNREACH') ||
        err.message.includes('mcp_error') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('502');

      if (isConnErr) {
        toast.error('🔌 MCP server unreachable — check your server connection', { autoClose: 8000 });
      } else {
        toast.error(`❌ ${err.message}`, { autoClose: 6000 });
      }

      addMessage(
        'error',
        isConnErr
          ? 'Banking Agent is unavailable.\n\nThe MCP server is not reachable.\n\nLocal: cd banking_mcp_server && npm run dev\nHosted: set MCP_SERVER_URL to your reachable MCP server URL (if your platform allows outbound WS).'
          : `Error: ${err.message}`,
        actionId
      );
    } finally {
      setLoading(false);
    }
  }

  function handleActionClick(actionId) {
    if (actionId === 'logout') {
      onLogout?.();
      return;
    }
    // No form needed for read-only queries
    if (actionId === 'accounts' || actionId === 'transactions') {
      runAction(actionId, {});
    } else {
      setActiveAction(actionId);
    }
  }

  function openEducationCommand(cmd) {
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
  async function dispatchNlResult(result, source = 'heuristic') {
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
      const p = normalizeBankingParams(params);
      if (action === 'mcp_tools') {
        await runAction('mcp_tools', {}, { skipUserLabel: true });
        return;
      }
      if (action === 'accounts' || action === 'transactions') {
        await runAction(action, {}, { skipUserLabel: true });
      } else if (action === 'balance' && p.accountId) {
        await runAction('balance', { accountId: p.accountId }, { skipUserLabel: true });
      } else if (['balance', 'transfer', 'deposit', 'withdraw'].includes(action)) {
        setActiveAction(action);
        addMessage('assistant', `Open the form below to complete **${action}** (${source}).`);
      } else {
        await runAction(action, p, { skipUserLabel: true });
      }
      return;
    }
    addMessage('assistant', result.message || 'Try a banking action or a topic like “token exchange”.');
  }

  async function handleNaturalLanguage() {
    const text = nlInput.trim();
    if (!text || !isLoggedIn) return;
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
            (body.logs || []).forEach((log) => merged.push({ ...log, _src: sources[i] }));
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
      await dispatchNlResult(result, source);
    } catch (err) {
      toast.error(`❌ Could not parse request: ${err.message}`, { autoClose: 5000 });
      addMessage('assistant', `Could not parse: ${err.message}`);
    } finally {
      setNlLoading(false);
    }
  }

  // Float mode should return nothing when the dedicated /agent page is active
  if (!isInline && (isAgentPage || isLogsPage)) return null;

  return (
    <>
      {/* FAB - only shown when floating agent is collapsed (not in inline mode) */}
      {!isInline && !isOpen && (
        <button
          className="banking-agent-fab"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Banking Agent"
          title="Open AI Banking Agent"
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
          className={`banking-agent-panel${isDark ? '' : ' ba-mode-light'}${isExpanded && !isInline ? ' ba-expanded' : ''}${isInline ? ' ba-mode-inline' : ''}`}
          role="dialog"
          aria-label="Banking AI Agent"
          ref={panelRef}
          style={panelStyle}
        >
          {/* Header — spans full width */}
          {/* In inline mode: no drag handle. In float mode: drag to reposition */}
          <div
            className={`ba-header${isInline ? '' : ' banking-agent-drag-handle'}`}
            onMouseDown={isInline ? undefined : handleDragStart}
          >
            <div className="ba-header-top">
              <div className="ba-header-left">
                <span className="ba-status-dot" />
                <div>
                  <div className="ba-title">BX Finance AI Agent</div>
                  <div className="ba-subtitle">
                    {isLoggedIn
                      ? `${effectiveUser.firstName || effectiveUser.name?.split(' ')[0] || 'Signed in'} · ${effectiveUser.role === 'admin' ? '👑 Admin' : '👤 Customer'}`
                      : 'Sign in to get started'}
                  </div>
                </div>
              </div>
              <div className="ba-header-tools">
                {/* Expand/restore only available in float mode */}
                {!isInline && (
                  <button
                    className="ba-icon-btn"
                    onClick={() => { setIsExpanded(e => !e); setDragPos(null); }}
                    title={isExpanded ? 'Restore size' : 'Expand to full screen'}
                  >
                    {isExpanded ? '⊟' : '⊞'}
                  </button>
                )}
                <button
                  className="ba-icon-btn"
                  onClick={() => setIsDark(d => !d)}
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark ? '☀️' : '🌙'}
                </button>
                {/* Collapse to FAB only in float mode */}
                {!isInline && (
                  <button 
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
            {/* Connected services row */}
            <div className="ba-server-chips">
              <span className="ba-server-chip ba-server-chip--active" title="Banking AI tools service — connected">
                <span className="ba-chip-dot" />
                Banking Tools
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

          {/* Two-column body */}
          <div className="ba-body">

            {/* ── Left column: suggestions + actions/auth ── */}
            <div className="ba-left-col">
              {/* Dashboard navigation button — shown when logged in */}
              {isLoggedIn && (
                <button
                  className="ba-left-auth-btn primary"
                  style={{ marginBottom: 2 }}
                  onClick={() => {
                    setIsOpen(false);
                    navigate(effectiveUser?.role === 'admin' ? '/admin' : '/dashboard');
                  }}
                >
                  {effectiveUser?.role === 'admin' ? '👑 Admin Dashboard' : '📊 My Dashboard'}
                </button>
              )}

              <div className="ba-left-label">Try asking:</div>
              {(effectiveUser?.role === 'admin' ? SUGGESTIONS_ADMIN : SUGGESTIONS_CUSTOMER).map(s => (
                <button
                  key={s}
                  className="ba-suggestion"
                  onClick={() => {
                    setNlInput(s);
                    if (isLoggedIn) {
                      setNlInput('');
                      addMessage('user', s);
                      setNlLoading(true);
                      parseNaturalLanguage(s)
                        .then(({ source, result }) => dispatchNlResult(result, source))
                        .catch(err => addMessage('assistant', `Could not parse: ${err.message}`))
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
                  {ACTIONS.map(a => (
                    <button
                      key={a.id}
                      className="ba-action-item"
                      onClick={() => handleActionClick(a.id)}
                      disabled={loading}
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
                      className="ba-action-item"
                      onClick={() => openEducationCommand(cmd)}
                      title={cmd.label}
                    >
                      {cmd.label}
                    </button>
                  ))}
                </>
              ) : (
                <div className="ba-left-auth">
                  <div className="ba-left-auth-notice">
                    🔐 Sign in required to access AI banking features
                  </div>
                  <button
                    className="ba-left-auth-btn primary"
                    onClick={() => handleLoginAction('login_user')}
                    disabled={oauthConfig === null || !oauthConfig?.user}
                    title={oauthConfig?.user ? 'Sign in as a bank customer' : 'Configure credentials first'}
                  >
                    👤 Customer Sign In
                  </button>
                  <button
                    className="ba-left-auth-btn"
                    onClick={() => handleLoginAction('login_admin')}
                    disabled={oauthConfig === null || !oauthConfig?.admin}
                    title={oauthConfig?.admin ? 'Sign in as administrator' : 'Configure credentials first'}
                  >
                    👑 Admin Sign In
                  </button>
                  <button
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
              <div className="banking-agent-messages">
                {messages.length === 0 && (
                  <div className="ba-welcome">
                    <p>
                      {isLoggedIn
                        ? 'Type a message or pick an action on the left.'
                        : oauthConfig === null
                          ? 'Checking configuration…'
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
              {showCommands && isLoggedIn && !activeAction && (
                <div className="ba-commands-popup">
                  <div className="ba-commands-section">Learn &amp; Explore</div>
                  <div className="ba-chips">
                    {EDUCATION_COMMANDS.map(cmd => (
                      <button
                        key={cmd.id}
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
                <ActionForm
                  action={activeAction}
                  loading={loading}
                  onSubmit={form => runAction(activeAction, form)}
                  onCancel={() => setActiveAction(null)}
                  effectiveUser={effectiveUser}
                />
              )}

              {/* Bottom input bar */}
              <div className="ba-bottom">
                {isLoggedIn ? (
                  <div className="ba-input-row">
                    <button
                      className={`ba-cmd-btn${showCommands ? ' active' : ''}`}
                      onClick={() => setShowCommands(s => !s)}
                      title="Learn &amp; Explore topics"
                      aria-expanded={showCommands}
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
                      placeholder={nlMeta?.groqConfigured ? 'Message BX Finance AI… (Groq AI)' : 'Message BX Finance AI…'}
                      disabled={nlLoading}
                    />
                    <button
                      className="ba-send-btn"
                      onClick={() => { handleNaturalLanguage(); setShowCommands(false); }}
                      disabled={nlLoading || !nlInput.trim()}
                      aria-label="Send"
                    >
                      {nlLoading ? '…' : '↑'}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--ba-muted)', fontSize: '12px' }}>
                    Sign in using the buttons on the left to start chatting
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Resize handles */}
          <div className="ba-resize-handle ba-resize-handle--se" onMouseDown={(e) => handleResize(e, 'se')} />
          <div className="ba-resize-handle ba-resize-handle--e" onMouseDown={(e) => handleResize(e, 'e')} />
          <div className="ba-resize-handle ba-resize-handle--s" onMouseDown={(e) => handleResize(e, 's')} />
        </div>
      )}
    </>
  );
}

