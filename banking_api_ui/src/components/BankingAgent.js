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
import './BankingAgent.css';

// ─── Action definitions ────────────────────────────────────────────────────────

const ACTIONS = [
  { id: 'accounts',     label: '🏦 My Accounts',       desc: 'List all your accounts' },
  { id: 'transactions', label: '📋 Recent Transactions', desc: 'View recent activity' },
  { id: 'balance',      label: '💰 Check Balance',      desc: 'Balance for an account' },
  { id: 'deposit',      label: '⬇ Deposit',             desc: 'Deposit into an account' },
  { id: 'withdraw',     label: '⬆ Withdraw',            desc: 'Withdraw from an account' },
  { id: 'transfer',     label: '↔ Transfer',            desc: 'Transfer between accounts' },
];

// ─── Suggested prompts — role-aware ──────────────────────────────────────────

const SUGGESTIONS_CUSTOMER = [
  'Check my account balance',
  'Transfer $100 to savings',
  'What are my recent transactions?',
  'Show my accounts',
  'Deposit $500 into checking',
];

const SUGGESTIONS_ADMIN = [
  'Show all customer accounts',
  'List recent system transactions',
  'Check account balance',
  'Show all accounts',
  'What are recent transactions?',
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

function ActionForm({ action, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fields = {
    balance:  [{ key: 'accountId', label: 'Account ID', placeholder: 'e.g. acc_abc123' }],
    deposit:  [
      { key: 'accountId', label: 'Account ID', placeholder: 'e.g. acc_abc123' },
      { key: 'amount',    label: 'Amount ($)',  placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',        placeholder: 'optional' },
    ],
    withdraw: [
      { key: 'accountId', label: 'Account ID', placeholder: 'e.g. acc_abc123' },
      { key: 'amount',    label: 'Amount ($)',  placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',        placeholder: 'optional' },
    ],
    transfer: [
      { key: 'fromId',    label: 'From Account ID', placeholder: 'e.g. acc_abc123' },
      { key: 'toId',      label: 'To Account ID',   placeholder: 'e.g. acc_def456' },
      { key: 'amount',    label: 'Amount ($)',        placeholder: '0.00', type: 'number' },
      { key: 'note',      label: 'Note',              placeholder: 'optional' },
    ],
  };

  return (
    <div className="banking-agent-form">
      {(fields[action] || []).map(f => (
        <div key={f.key} className="banking-agent-field">
          <label>{f.label}</label>
          <input
            type={f.type || 'text'}
            placeholder={f.placeholder}
            value={form[f.key] || ''}
            onChange={e => set(f.key, e.target.value)}
          />
        </div>
      ))}
      <div className="banking-agent-form-actions">
        <button className="banking-agent-btn-primary" disabled={loading} onClick={() => onSubmit(form)}>
          {loading ? '…' : 'Run'}
        </button>
        <button className="banking-agent-btn-ghost" onClick={onCancel}>Cancel</button>
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

function ResultsPanel({ panel, onClose, style }) {
  if (!panel) return null;
  return (
    <div className="banking-agent-results-panel" style={style} role="complementary" aria-label="Results">
      <div className="bar-rp-header">
        <span className="bar-rp-title">{panel.title}</span>
        <button className="bar-rp-close" onClick={onClose} aria-label="Close results">✕</button>
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
    </div>
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

function normalizeBankingParams(action, params) {
  const p = { ...(params || {}) };
  if (p.account_id && !p.accountId) p.accountId = p.account_id;
  if (p.from_account_id && !p.fromId) p.fromId = p.from_account_id;
  if (p.to_account_id && !p.toId) p.toId = p.to_account_id;
  return p;
}

export default function BankingAgent({ user }) {
  const edu = useEducationUIOptional();
  const tokenChain = useTokenChainOptional();
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
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
  /** Side panel showing rich results next to the agent */
  const [resultPanel, setResultPanel] = useState(null);
  /**
   * Self-detected session user — populated by independent auth check so the
   * agent knows the session even if the parent App.js user prop hasn't resolved yet.
   */
  const [sessionUser, setSessionUser] = useState(null);

  const bottomRef = useRef(null);
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

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
      let timers = [];
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
      setIsOpen(true);
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
        setIsOpen(true);
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
      setIsOpen(true);
      setMessages(prev =>
        prev.length === 0
          ? [{ id: Date.now().toString(), role: 'assistant', content: welcomeMessage(user || sessionUser) }]
          : prev
      );
    };
    window.addEventListener('userAuthenticated', onAuth);
    return () => window.removeEventListener('userAuthenticated', onAuth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkSelfAuth]);

  // Re-check when panel opens (catches sessions established after mount)
  useEffect(() => {
    if (isOpen) checkSelfAuth();
  }, [isOpen, checkSelfAuth]);

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
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen || !isLoggedIn) return;
    fetchNlStatus().then(setNlMeta).catch(() => setNlMeta({ geminiConfigured: false }));
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
      const x = Math.max(0, Math.min(window.innerWidth  - 50, e.clientX - dragOffsetRef.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffsetRef.current.y));
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

  // Panel position: override CSS anchoring when user has dragged the window
  const panelStyle    = dragPos ? { left: dragPos.x, top: dragPos.y, bottom: 'auto', right: 'auto' } : {};
  // Results panel sits to the left of the agent; shifts with it when dragged
  const resultsPanelStyle = dragPos
    ? { left: Math.max(8, dragPos.x - 528), top: dragPos.y, bottom: 'auto', right: 'auto' }
    : {};

  function addMessage(role, content, tool) {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, content, tool }]);
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
        default:
          throw new Error(`Unknown action: ${actionId}`);
      }

      // Push token events to TokenChainContext (updates TokenChainDisplay on dashboard)
      const tokenEvents = response.tokenEvents || [];
      if (tokenChain && tokenEvents.length > 0) {
        tokenChain.setTokenEvents(actionId, tokenEvents);
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

      // Populate side results panel for rich data types
      const result = response.result;
      if (result?.accounts) {
        setResultPanel({ type: 'accounts', title: '🏦 Accounts', data: result.accounts });
      } else if (result?.transactions) {
        setResultPanel({ type: 'transactions', title: '📋 Recent Transactions', data: result.transactions });
      } else if (result?.balance !== undefined) {
        setResultPanel({ type: 'balance', title: '💰 Balance', data: result.balance });
      } else if (result?.transaction_id || result?.transactionId || result?.id) {
        setResultPanel({ type: 'confirm', title: `✅ ${label} confirmed`, data: result });
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
      return;
    }
    if (cmd.panel) edu?.open(cmd.panel, cmd.tab || null);
  }

  async function handleNaturalLanguage() {
    const text = nlInput.trim();
    if (!text || !isLoggedIn) return;
    setNlLoading(true);
    addMessage('user', text);
    setNlInput('');
    try {
      const { source, result } = await parseNaturalLanguage(text);
      setShowCommands(false);
      if (result.kind === 'education' && result.ciba) {
        openEducationCommand({ ciba: true, tab: result.tab });
        // Close agent panel so the CIBA guide (lower z-index) is fully visible
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
        const tab   = result.education.tab || null;
        // For CIMD, use the standalone CimdSimPanel (dispatches custom event)
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
        edu?.open(panel, tab);
        addMessage('assistant', `Opened help: ${panel} (${source}).`);
        return;
      }
      if (result.kind === 'banking' && result.banking?.action) {
        const { action, params } = result.banking;
        const p = normalizeBankingParams(action, params);
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
    } catch (err) {
      toast.error(`❌ Could not parse request: ${err.message}`, { autoClose: 5000 });
      addMessage('assistant', `Could not parse: ${err.message}`);
    } finally {
      setNlLoading(false);
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        className={`banking-agent-fab ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(v => !v)}
        aria-label={isOpen ? 'Close agent panel' : 'Open banking agent'}
        title="Banking MCP Agent"
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Results panel — sits to the left of the agent (wide-screen only) */}
      {isOpen && resultPanel && (
        <ResultsPanel
          panel={resultPanel}
          onClose={() => setResultPanel(null)}
          style={resultsPanelStyle}
        />
      )}

      {/* Panel */}
      {isOpen && (
        <div
          className={`banking-agent-panel${isDark ? '' : ' ba-mode-light'}`}
          role="dialog"
          aria-label="Banking AI Agent"
          ref={panelRef}
          style={panelStyle}
        >
          {/* Header — spans full width */}
          <div className="ba-header banking-agent-drag-handle" onMouseDown={handleDragStart}>
            <div className="ba-header-left">
              <span className="ba-status-dot" />
              <div>
                <div className="ba-title">BX Finance AI Agent</div>
                <div className="ba-subtitle">
                  {isLoggedIn
                    ? `${effectiveUser.firstName || effectiveUser.name?.split(' ')[0] || 'Signed in'} · ${effectiveUser.role === 'admin' ? '👑 Admin' : '👤 Customer'} · Powered by MCP`
                    : 'Sign in to get started'}
                </div>
              </div>
            </div>
            <div className="ba-header-tools">
              <button
                className="ba-icon-btn"
                onClick={() => setIsDark(d => !d)}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? '☀️' : '🌙'}
              </button>
              <button className="ba-icon-btn" onClick={() => setIsOpen(false)} aria-label="Close">✕</button>
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
                    // If logged in, send immediately; otherwise just populate the input
                    if (isLoggedIn) {
                      setNlInput('');
                      addMessage('user', s);
                      setNlLoading(true);
                      parseNaturalLanguage(s)
                        .then(({ result }) => {
                          if (result.kind === 'banking' && result.banking?.action) {
                            const { action, params } = result.banking;
                            const p = normalizeBankingParams(action, params);
                            if (action === 'accounts' || action === 'transactions') {
                              runAction(action, {}, { skipUserLabel: true });
                            } else if (action === 'balance' && p.accountId) {
                              runAction('balance', { accountId: p.accountId }, { skipUserLabel: true });
                            } else {
                              runAction(action, p, { skipUserLabel: true });
                            }
                          } else {
                            addMessage('assistant', result.message || 'Try a banking action or a topic like "token exchange".');
                          }
                        })
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
                  {EDUCATION_COMMANDS.slice(0, 5).map(cmd => (
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
                {messages.map(msg => (
                  <div key={msg.id} className={`banking-agent-msg ${msg.role}`}>
                    {msg.role === 'assistant' && <span className="banking-agent-msg-avatar">🏦</span>}
                    <div className="banking-agent-msg-bubble">
                      <pre className="banking-agent-msg-text">{msg.content}</pre>
                      {msg.tool && <span className="banking-agent-tool-badge">⚙ {msg.tool}</span>}
                    </div>
                  </div>
                ))}
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
        </div>
      )}
    </>
  );
}

