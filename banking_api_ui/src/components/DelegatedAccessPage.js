// banking_api_ui/src/components/DelegatedAccessPage.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { notifySuccess, notifyInfo } from '../utils/appToast';
import '../styles/appShellPages.css';
import './DelegatedAccessPage.css';

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  { id: 'chk-001', name: 'Everyday Checking', type: 'Checking', balance: 4820.55 },
  { id: 'sav-001', name: 'High-Yield Savings', type: 'Savings',  balance: 18340.00 },
  { id: 'sav-002', name: 'Emergency Fund',     type: 'Savings',  balance: 6000.00 },
  { id: 'inv-001', name: 'Investment Account', type: 'Investment', balance: 42100.80 },
];

const RELATIONSHIPS = ['Spouse / Partner', 'Child', 'Parent', 'Sibling', 'Trusted Advisor', 'Other'];

const DEMO_GRANTED_BY_ME = [
  {
    id: 'del-1',
    name: 'Sarah Pieper',
    email: 'sarah.pieper@example.com',
    relationship: 'Spouse / Partner',
    accountIds: ['chk-001', 'sav-001'],
    since: '2025-11-14',
    status: 'active',
  },
  {
    id: 'del-2',
    name: 'Jamie Pieper',
    email: 'jamie.pieper@example.com',
    relationship: 'Child',
    accountIds: ['chk-001'],
    since: '2026-01-03',
    status: 'active',
  },
];

const DEMO_GRANTED_TO_ME = [
  {
    id: 'del-3',
    name: 'Harold Pieper',
    email: 'harold.pieper@example.com',
    relationship: 'Parent',
    accountIds: ['chk-001', 'sav-001', 'sav-002'],
    since: '2025-09-22',
    status: 'active',
    ownerAccounts: [
      { id: 'chk-ext-1', name: 'Family Checking', type: 'Checking' },
      { id: 'sav-ext-1', name: 'Vacation Savings', type: 'Savings' },
      { id: 'sav-ext-2', name: 'Trust Fund',       type: 'Savings' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns initials from a full name. */
const initials = (name) =>
  name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);

/** Hue derived from a string for consistent avatar colours. */
const avatarHue = (str) =>
  str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

/** Format ISO date as "Nov 14, 2025". */
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 42 }) {
  const hue = avatarHue(name);
  return (
    <div
      className="da-avatar"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: `hsl(${hue}, 55%, 42%)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

// ─── Account pill ─────────────────────────────────────────────────────────────

function AccountPill({ account }) {
  const typeClass = {
    Checking:   'da-pill--checking',
    Savings:    'da-pill--savings',
    Investment: 'da-pill--invest',
  }[account.type] || 'da-pill--checking';
  return <span className={`da-pill ${typeClass}`}>{account.name}</span>;
}

// ─── RFC 8693 "Act as" explainer panel ───────────────────────────────────────

function ActAsPanel({ delegate, onClose }) {
  const isGrantor = Boolean(delegate.ownerAccounts); // acting ON BEHALF of someone
  const subjectName = isGrantor ? delegate.name : 'You';
  const actorName   = isGrantor ? 'You (BFF)'       : 'BFF';

  return (
    <div className="da-actpanel-overlay" onClick={onClose}>
      <div className="da-actpanel" onClick={e => e.stopPropagation()} role="dialog" aria-label="Act as — token exchange">
        <div className="da-actpanel__header">
          <div className="da-actpanel__title">
            <span className="da-actpanel__icon">⇄</span>
            Act as {delegate.name}
          </div>
          <button type="button" className="da-actpanel__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="da-actpanel__body">
          <p className="da-actpanel__lead">
            Switching context uses <strong>RFC 8693 Token Exchange</strong> — your BFF presents the
            delegated grant to PingOne and receives a narrowed MCP token carrying an{' '}
            <code>act</code> claim that proves the delegation chain.
          </p>

          <div className="da-actpanel__flow">
            <div className="da-actpanel__step">
              <span className="da-actpanel__step-num">1</span>
              <div>
                <strong>Your User Token</strong> (stored in BFF session, never in browser)
                contains <code>may_act: &#123; client_id: &quot;bff&quot; &#125;</code> — PingOne
                pre-authorised the BFF to exchange on your behalf.
              </div>
            </div>
            <div className="da-actpanel__connector">↓ RFC 8693 exchange</div>
            <div className="da-actpanel__step">
              <span className="da-actpanel__step-num">2</span>
              <div>
                BFF calls PingOne token endpoint with
                <pre className="da-actpanel__code">{`grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<user_token>
actor_token=<bff_client_credentials>
requested_token_type=urn:ietf:params:oauth:token-type:access_token
scope=${isGrantor ? 'banking:read banking:write' : 'banking:read'}`}</pre>
              </div>
            </div>
            <div className="da-actpanel__connector">↓ narrowed delegated token</div>
            <div className="da-actpanel__step">
              <span className="da-actpanel__step-num">3</span>
              <div>
                MCP Token issued with <code>sub: {subjectName}</code> · <code>act: &#123; sub: {actorName} &#125;</code><br />
                Scoped only to accounts: <strong>{(delegate.ownerAccounts || DEMO_ACCOUNTS.filter(a => delegate.accountIds.includes(a.id))).map(a => a.name).join(', ')}</strong>
              </div>
            </div>
          </div>

          <div className="da-actpanel__pills">
            <span className="da-actpanel__pill da-actpanel__pill--may">may_act → proves pre-authorisation</span>
            <span className="da-actpanel__pill da-actpanel__pill--act">act → proves delegation fact</span>
          </div>

          <button
            type="button"
            className="da-actpanel__cta"
            onClick={() => {
              notifyInfo(`Demo: acting as ${delegate.name}. In production a narrowed MCP token with act claim would be issued via RFC 8693.`);
              onClose();
            }}
          >
            Simulate token exchange (demo)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add/Edit delegation modal ────────────────────────────────────────────────

function AddDelegateModal({ onClose, onSave }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [rel, setRel]           = useState(RELATIONSHIPS[0]);
  const [selected, setSelected] = useState({});
  const [error, setError]       = useState('');

  const toggleAccount = (id) =>
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const chosenIds = Object.keys(selected).filter(id => selected[id]);

  const handleSave = () => {
    if (!name.trim())     return setError('Name is required.');
    if (!email.trim())    return setError('Email is required.');
    if (!chosenIds.length) return setError('Select at least one account.');
    setError('');
    onSave({ name: name.trim(), email: email.trim(), relationship: rel, accountIds: chosenIds });
  };

  return (
    <div className="da-modal-overlay" onClick={onClose}>
      <div className="da-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Add delegation">
        <div className="da-modal__header">
          <h2 className="da-modal__title">Grant account access</h2>
          <button type="button" className="da-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="da-modal__body">
          <label className="da-field">
            <span className="da-field__label">Full name</span>
            <input
              className="da-field__input"
              type="text"
              placeholder="e.g. Sarah Pieper"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </label>

          <label className="da-field">
            <span className="da-field__label">Email address</span>
            <input
              className="da-field__input"
              type="email"
              placeholder="e.g. sarah@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </label>

          <label className="da-field">
            <span className="da-field__label">Relationship</span>
            <select className="da-field__input da-field__select" value={rel} onChange={e => setRel(e.target.value)}>
              {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>

          <fieldset className="da-field da-field--accounts">
            <legend className="da-field__label">Accounts to share</legend>
            <p className="da-field__hint">Select one or more accounts this person can view and act on your behalf.</p>
            <div className="da-acct-checkboxes">
              {DEMO_ACCOUNTS.map(acct => (
                <label key={acct.id} className={`da-acct-check${selected[acct.id] ? ' da-acct-check--on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!selected[acct.id]}
                    onChange={() => toggleAccount(acct.id)}
                  />
                  <span className="da-acct-check__name">{acct.name}</span>
                  <span className="da-acct-check__type">{acct.type}</span>
                  <span className="da-acct-check__bal">
                    ${acct.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="da-modal__error">{error}</p>}
        </div>

        <div className="da-modal__footer">
          <button type="button" className="da-btn da-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="da-btn da-btn--primary" onClick={handleSave}>
            Send invitation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delegate card ────────────────────────────────────────────────────────────

function DelegateCard({ delegate, accounts, onRevoke, onActAs }) {
  const sharedAccounts = accounts.filter(a => delegate.accountIds.includes(a.id));
  const isGrantedToMe = Boolean(delegate.ownerAccounts);
  const displayAccounts = isGrantedToMe ? delegate.ownerAccounts : sharedAccounts;

  return (
    <div className="da-card">
      <Avatar name={delegate.name} />

      <div className="da-card__body">
        <div className="da-card__top">
          <div>
            <span className="da-card__name">{delegate.name}</span>
            <span className="da-card__email">{delegate.email}</span>
          </div>
          <span className="da-card__rel">{delegate.relationship}</span>
        </div>

        <div className="da-card__accounts">
          {displayAccounts.map(a => <AccountPill key={a.id} account={a} />)}
        </div>

        <div className="da-card__footer">
          <span className="da-card__since">Since {fmtDate(delegate.since)}</span>
          <div className="da-card__actions">
            <button
              type="button"
              className="da-btn da-btn--act"
              onClick={() => onActAs(delegate)}
            >
              ⇄ Act as
            </button>
            <button
              type="button"
              className="da-btn da-btn--revoke"
              onClick={() => onRevoke(delegate)}
            >
              🗑 {isGrantedToMe ? 'Remove access' : 'Revoke'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/**
 * Delegated access page — manage RFC 8693 delegations (granted by me / granted to me).
 */
export default function DelegatedAccessPage({ user }) {
  const [grantedByMe, setGrantedByMe] = useState(DEMO_GRANTED_BY_ME);
  const [grantedToMe]                 = useState(DEMO_GRANTED_TO_ME);
  const [tab, setTab]                 = useState('granted');  // 'granted' | 'received'
  const [showAdd, setShowAdd]         = useState(false);
  const [actAsDelegate, setActAsDelegate] = useState(null);

  const totalDelegated = grantedByMe.length + grantedToMe.length;

  const handleSave = (data) => {
    const entry = {
      id: `del-${Date.now()}`,
      ...data,
      since: new Date().toISOString().slice(0, 10),
      status: 'active',
    };
    setGrantedByMe(prev => [...prev, entry]);
    setShowAdd(false);
    notifySuccess(`Invitation sent to ${data.name}. They will receive an email to confirm access.`);
  };

  const handleRevoke = (delegate) => {
    if (!window.confirm(`Revoke ${delegate.name}'s access to your accounts?`)) return;
    setGrantedByMe(prev => prev.filter(d => d.id !== delegate.id));
    notifySuccess(`Access revoked for ${delegate.name}.`);
  };

  return (
    <div className="da-page app-page-shell">
      {/* Header */}
      <header className="da-page__hero">
        <div className="da-page__hero-inner">
          <div>
            <Link to="/dashboard" className="da-page__back">← Dashboard</Link>
            <h1 className="da-page__title">Delegated Access</h1>
            <p className="da-page__subtitle">
              Share account access with trusted family members using OAuth 2.0 delegation (RFC 8693).
            </p>
          </div>
          <div className="da-page__stats">
            <div className="da-stat">
              <span className="da-stat__n">{grantedByMe.length}</span>
              <span className="da-stat__l">Granted by me</span>
            </div>
            <div className="da-stat">
              <span className="da-stat__n">{grantedToMe.length}</span>
              <span className="da-stat__l">Granted to me</span>
            </div>
          </div>
        </div>
      </header>

      {/* RFC 8693 explainer strip */}
      <div className="da-edu-strip">
        <span className="da-edu-strip__icon">🔐</span>
        <span>
          Delegated access uses <strong>RFC 8693 Token Exchange</strong>. When you or a delegate acts on an account,
          the BFF requests a narrowed token with an <code>act</code> claim — the token proves{' '}
          <em>who is acting</em> and <em>on whose behalf</em>, without sharing passwords or full access tokens.
        </span>
        <a
          className="da-edu-strip__link"
          href="https://datatracker.ietf.org/doc/html/rfc8693"
          target="_blank"
          rel="noopener noreferrer"
        >
          RFC 8693 ↗
        </a>
      </div>

      {/* Tabs + Add button */}
      <div className="da-toolbar">
        <div className="da-tabs" role="tablist">
          <button
            role="tab"
            type="button"
            className={`da-tab${tab === 'granted' ? ' da-tab--active' : ''}`}
            aria-selected={tab === 'granted'}
            onClick={() => setTab('granted')}
          >
            Access I've granted
            {grantedByMe.length > 0 && <span className="da-tab__badge">{grantedByMe.length}</span>}
          </button>
          <button
            role="tab"
            type="button"
            className={`da-tab${tab === 'received' ? ' da-tab--active' : ''}`}
            aria-selected={tab === 'received'}
            onClick={() => setTab('received')}
          >
            Granted to me
            {grantedToMe.length > 0 && <span className="da-tab__badge">{grantedToMe.length}</span>}
          </button>
        </div>
        {tab === 'granted' && (
          <button
            type="button"
            className="da-btn da-btn--primary da-btn--add"
            onClick={() => setShowAdd(true)}
          >
            + Add person
          </button>
        )}
      </div>

      {/* Card list */}
      <div className="da-list">
        {tab === 'granted' && grantedByMe.length === 0 && (
          <div className="da-empty">
            <div className="da-empty__icon">👥</div>
            <p className="da-empty__text">You haven't granted access to anyone yet.</p>
            <button type="button" className="da-btn da-btn--primary" onClick={() => setShowAdd(true)}>
              + Grant access to a family member
            </button>
          </div>
        )}

        {tab === 'granted' && grantedByMe.map(d => (
          <DelegateCard
            key={d.id}
            delegate={d}
            accounts={DEMO_ACCOUNTS}
            onRevoke={handleRevoke}
            onActAs={setActAsDelegate}
          />
        ))}

        {tab === 'received' && grantedToMe.length === 0 && (
          <div className="da-empty">
            <div className="da-empty__icon">📬</div>
            <p className="da-empty__text">No one has granted you delegated access yet.</p>
          </div>
        )}

        {tab === 'received' && grantedToMe.map(d => (
          <DelegateCard
            key={d.id}
            delegate={d}
            accounts={DEMO_ACCOUNTS}
            onRevoke={() => notifyInfo('Contact the account holder to remove your access.')}
            onActAs={setActAsDelegate}
          />
        ))}
      </div>

      {/* Modals */}
      {showAdd && <AddDelegateModal onClose={() => setShowAdd(false)} onSave={handleSave} />}
      {actAsDelegate && <ActAsPanel delegate={actAsDelegate} onClose={() => setActAsDelegate(null)} />}
    </div>
  );
}
