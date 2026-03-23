import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

// ─── Main component ────────────────────────────────────────────────────────────

// ─── Login actions (shown when not authenticated) ────────────────────────────

const LOGIN_ACTIONS = [
  { id: 'login_admin', label: '👑 Admin Login',    desc: 'Sign in as an administrator' },
  { id: 'login_user',  label: '👤 Customer Login', desc: 'Sign in as a bank customer' },
];

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
  const [isOpen, setIsOpen] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlMeta, setNlMeta] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  /** null = loading; which OAuth flows have client IDs + environment */
  const [oauthConfig, setOauthConfig] = useState(null);
  const bottomRef = useRef(null);
  const navigate = useNavigate();

  const isLoggedIn = !!user;
  const isConfigured = oauthConfig && (oauthConfig.admin || oauthConfig.user);

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

  function addMessage(role, content, tool) {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, content, tool }]);
  }

  /**
   * Runs a banking tool. When fromNl is true, skips the extra user bubble (NL already echoed the ask).
   */
  async function runAction(actionId, form, opts = {}) {
    const { skipUserLabel = false } = opts;
    setActiveAction(null);
    if (!skipUserLabel) {
      const label = ACTIONS.find(a => a.id === actionId)?.label || actionId;
      addMessage('user', label);
    }
    setLoading(true);

    try {
      let result;
      switch (actionId) {
        case 'accounts':
          result = await getMyAccounts();
          break;
        case 'transactions':
          result = await getMyTransactions();
          break;
        case 'balance':
          result = await getAccountBalance(form.accountId);
          break;
        case 'deposit':
          result = await createDeposit(form.accountId, parseFloat(form.amount), form.note);
          break;
        case 'withdraw':
          result = await createWithdrawal(form.accountId, parseFloat(form.amount), form.note);
          break;
        case 'transfer':
          result = await createTransfer(form.fromId, form.toId, parseFloat(form.amount), form.note);
          break;
        default:
          throw new Error(`Unknown action: ${actionId}`);
      }
      addMessage('assistant', formatResult(result), actionId);
    } catch (err) {
      const isConnErr =
        err.message.includes('timed out') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ENETUNREACH') ||
        err.message.includes('mcp_error') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('502');
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
      if (result.kind === 'education' && result.ciba) {
        openEducationCommand({ ciba: true, tab: result.tab });
        addMessage('assistant', `Opened CIBA guide (${source}).`);
        return;
      }
      if (result.kind === 'education' && result.education?.panel) {
        edu?.open(result.education.panel, result.education.tab || null);
        addMessage('assistant', `Opened help: ${result.education.panel} (${source}).`);
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

      {/* Panel */}
      {isOpen && (
        <div className="banking-agent-panel" role="dialog" aria-label="Banking MCP Agent">
          {/* Header */}
          <div className="banking-agent-header">
            <div className="banking-agent-header-info">
              <span className="banking-agent-avatar">🏦</span>
              <div>
                <div className="banking-agent-title">PingOne AI Core</div>
                <div className="banking-agent-subtitle">
                  {isLoggedIn ? `Powered by MCP · ${user.name?.split(' ')[0] || 'Secure'}` : 'How can I help you today?'}
                </div>
              </div>
            </div>
            <button className="banking-agent-close-btn" onClick={() => setIsOpen(false)} aria-label="Close">✕</button>
          </div>

          {/* Messages */}
          <div className="banking-agent-messages">
            {messages.length === 0 && (
              <div className="banking-agent-welcome">
                <p>
                  {isLoggedIn
                    ? 'Use **Learn topics** or **Ask in plain language**, or pick a banking action. Calls go through the Banking API; the MCP server runs tools with scoped tokens.'
                    : oauthConfig === null
                      ? 'Welcome to PingOne AI Core. Checking configuration…'
                      : isConfigured
                        ? 'PingOne AI Core is configured. Sign in to get started.'
                        : 'Set up your PingOne credentials to get started.'}
                </p>
                <div className="banking-agent-learn">
                  <button
                    type="button"
                    className="banking-agent-learn-btn"
                    onClick={() => edu?.open(EDU.MCP_PROTOCOL, 'auth')}
                  >
                    How OAuth + MCP work together
                  </button>
                  <button
                    type="button"
                    className="banking-agent-learn-btn"
                    onClick={() => edu?.open(EDU.TOKEN_EXCHANGE, 'why')}
                  >
                    Token exchange explained
                  </button>
                  <p className="banking-agent-learn-hint">After sign-in, use the top <strong>Learn</strong> bar for more topics. CIBA guide (floating) has Sign-in &amp; roles.</p>
                </div>
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

          {/* Learn topic chips + plain-language (signed-in only) */}
          {isLoggedIn && !activeAction && (
            <div className="banking-agent-ctrl">
              <button
                type="button"
                className="banking-agent-learn-toggle"
                onClick={() => setShowLearn((s) => !s)}
                aria-expanded={showLearn}
              >
                {showLearn ? '▼' : '▶'} Learn topics ({EDUCATION_COMMANDS.length})
              </button>
              {showLearn && (
                <div className="banking-agent-learn-grid" role="group" aria-label="Learn topics">
                  {EDUCATION_COMMANDS.map((cmd) => (
                    <button
                      key={cmd.id}
                      type="button"
                      className="banking-agent-learn-chip"
                      onClick={() => openEducationCommand(cmd)}
                    >
                      {cmd.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="banking-agent-nl">
                <label className="banking-agent-nl-label" htmlFor="banking-agent-nl-input">
                  Ask in plain language
                </label>
                <textarea
                  id="banking-agent-nl-input"
                  className="banking-agent-nl-input"
                  rows={2}
                  value={nlInput}
                  onChange={(e) => setNlInput(e.target.value)}
                  placeholder="Examples: show my accounts · what is token exchange · explain CIBA"
                  disabled={nlLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleNaturalLanguage();
                    }
                  }}
                />
                <div className="banking-agent-nl-row">
                  <button
                    type="button"
                    className="banking-agent-nl-send"
                    onClick={handleNaturalLanguage}
                    disabled={nlLoading || !nlInput.trim()}
                  >
                    {nlLoading ? '…' : 'Send'}
                  </button>
                  <span className="banking-agent-nl-meta" title="Heuristic is always free. Gemini uses GOOGLE_AI_API_KEY or GEMINI_API_KEY on the API server.">
                    {nlMeta?.geminiConfigured ? 'NL: Gemini (server)' : 'NL: heuristic (free, offline)'}
                  </span>
                </div>
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

          {/* Action buttons */}
          {!activeAction && (
            <div className="banking-agent-actions">
              {isLoggedIn
                ? ACTIONS.map(a => (
                    <button
                      key={a.id}
                      className="banking-agent-action-btn"
                      onClick={() => handleActionClick(a.id)}
                      disabled={loading}
                      title={a.desc}
                    >
                      {a.label}
                    </button>
                  ))
                : (
                    <>
                      {/* Configure step */}
                      <button
                        className={`banking-agent-action-btn banking-agent-config-btn${isConfigured ? ' banking-agent-config-done' : ''}`}
                        onClick={() => { setIsOpen(false); navigate('/config'); }}
                        title="Open PingOne configuration settings"
                      >
                        {isConfigured ? '✅ Configured' : '⚙️ Configure PingOne'}
                      </button>

                      {/* Next-step hint + login buttons */}
                      {isConfigured && (
                        <div className="banking-agent-next-step">
                          <span className="banking-agent-next-label">Next → Sign in</span>
                        </div>
                      )}
                      {LOGIN_ACTIONS.map(a => {
                        const canAdmin = oauthConfig?.admin;
                        const canUser = oauthConfig?.user;
                        const canUse =
                          a.id === 'login_admin' ? canAdmin : canUser;
                        return (
                          <button
                            key={a.id}
                            className={`banking-agent-action-btn banking-agent-login-btn${isConfigured ? ' banking-agent-login-ready' : ''}`}
                            onClick={() => handleLoginAction(a.id)}
                            title={
                              oauthConfig === null
                                ? a.desc
                                : canUse
                                  ? a.desc
                                  : a.id === 'login_admin'
                                    ? 'Configure admin client ID in Settings'
                                    : 'Configure end-user client ID in Settings'
                            }
                            disabled={oauthConfig === null || !canUse}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </>
                  )
              }
              {isLoggedIn && (
                <button
                  className="banking-agent-action-btn banking-agent-config-btn"
                  onClick={() => { setIsOpen(false); navigate('/config'); }}
                  title="Open PingOne configuration settings"
                >
                  ⚙️ Configure
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

