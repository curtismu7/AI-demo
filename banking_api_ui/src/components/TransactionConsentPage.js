// banking_api_ui/src/components/TransactionConsentPage.js
import React, { useState, useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PageNav from './PageNav';
import bffAxios from '../services/bffAxios';
import { notifyError, notifyWarning } from '../utils/appToast';
import { setAgentBlockedByConsentDecline } from '../services/agentAccessConsent';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import '../styles/appShellPages.css';
import './TransactionConsentPage.css';

/**
 * Human-in-the-loop consent for high-value transactions.
 * Requires ?challenge=<server-issued id> and session-bound GET/confirm APIs.
 */
function accountSummaryLine(account) {
  const num = account.accountNumber || 'N/A';
  const type = account.accountType || 'Account';
  const nick = typeof account.name === 'string' && account.name.trim() ? account.name.trim() : '';
  if (nick) return `${nick} · ${type} - ${num}`;
  return `${type} - ${num}`;
}

export default function TransactionConsentPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { open: openEducation } = useEducationUI();
  const challengeId = searchParams.get('challenge');
  const restore = location.state?.restore;

  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [denialOpen, setDenialOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [accounts, setAccounts] = useState([]);

  const homePath = user?.role === 'admin' ? '/admin' : '/dashboard';

  useEffect(() => {
    if (!user || !challengeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const [chRes, accRes] = await Promise.all([
          bffAxios.get(`/api/transactions/consent-challenge/${encodeURIComponent(challengeId)}`),
          bffAxios.get('/api/accounts/my'),
        ]);
        if (cancelled) return;
        setSnapshot(chRes.data.snapshot);
        setAccounts(Array.isArray(accRes.data?.accounts) ? accRes.data.accounts : []);
      } catch (e) {
        if (!cancelled) {
          const msg =
            e.response?.data?.message || e.response?.data?.error || 'Consent challenge expired or invalid.';
          notifyError(msg);
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, challengeId]);

  const summaryLines = useMemo(() => {
    if (!snapshot) return [];
    const amt = Number(snapshot.amount);
    const lines = [];
    const t = snapshot.type;
    if (t === 'transfer') {
      lines.push(`Transfer: $${amt.toFixed(2)}`);
      const fromA = accounts.find((a) => a.id === snapshot.fromAccountId);
      const toA = accounts.find((a) => a.id === snapshot.toAccountId);
      if (fromA) lines.push(`From: ${accountSummaryLine(fromA)}`);
      else if (snapshot.fromAccountId) lines.push(`From account: ${snapshot.fromAccountId}`);
      if (toA) lines.push(`To: ${accountSummaryLine(toA)}`);
      else if (snapshot.toAccountId) lines.push(`To account: ${snapshot.toAccountId}`);
    } else if (t === 'deposit') {
      lines.push(`Deposit: $${amt.toFixed(2)}`);
      const toA = accounts.find((a) => a.id === snapshot.toAccountId);
      if (toA) lines.push(`To: ${accountSummaryLine(toA)}`);
      else if (snapshot.toAccountId) lines.push(`To account: ${snapshot.toAccountId}`);
    } else if (t === 'withdrawal') {
      lines.push(`Withdrawal: $${amt.toFixed(2)}`);
      const fromA = accounts.find((a) => a.id === snapshot.fromAccountId);
      if (fromA) lines.push(`From: ${accountSummaryLine(fromA)}`);
      else if (snapshot.fromAccountId) lines.push(`From account: ${snapshot.fromAccountId}`);
    }
    if (snapshot.description) lines.push(`Note: ${snapshot.description}`);
    return lines;
  }, [snapshot, accounts]);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!challengeId) {
    return <Navigate to={homePath} replace />;
  }

  /** Opens the denial dialog (Cancel). */
  const handleCancelClick = () => {
    setDenialOpen(true);
  };

  /** User chose not to decline — stay on the agreement page. */
  const handleDenialDismiss = () => {
    setDenialOpen(false);
  };

  /** Confirms decline: block agent for this session and return to dashboard. */
  const handleDenialConfirm = () => {
    setAgentBlockedByConsentDecline(true);
    setDenialOpen(false);
    navigate(homePath, { state: { restore, consentDeclined: true } });
  };

  const handleConfirm = async () => {
    if (!agreed || submitting || !snapshot || !challengeId) return;
    setSubmitting(true);
    try {
      await bffAxios.post(`/api/transactions/consent-challenge/${encodeURIComponent(challengeId)}/confirm`);
      await bffAxios.post('/api/transactions', {
        type: snapshot.type,
        amount: snapshot.amount,
        fromAccountId: snapshot.fromAccountId,
        toAccountId: snapshot.toAccountId,
        description: snapshot.description,
        userId: user.id,
        consentChallengeId: challengeId,
      });
      setAgentBlockedByConsentDecline(false);
      const successMsg =
        snapshot.type === 'transfer'
          ? 'Transfer completed successfully.'
          : snapshot.type === 'deposit'
            ? 'Deposit completed successfully.'
            : 'Withdrawal completed successfully.';
      navigate(homePath, { state: { transactionSuccess: successMsg } });
    } catch (e) {
      const status = e.response?.status;
      const d = e.response?.data;
      if (status === 428) {
        notifyWarning(
          'Additional verification (step-up MFA) is required. After you complete it, start the high-value transaction again from the dashboard.',
        );
      } else {
        notifyError(d?.message || d?.error_description || d?.error || e.message || 'Request failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="app-page-shell transaction-consent-page">
        <PageNav user={user} onLogout={onLogout} title="High-value transaction" />
        <div className="app-page-shell__body">
          <p className="transaction-consent-card__loading">Loading consent details…</p>
        </div>
      </div>
    );
  }

  if (loadFailed || !snapshot) {
    return (
      <div className="app-page-shell transaction-consent-page">
        <PageNav user={user} onLogout={onLogout} title="High-value transaction" />
        <div className="app-page-shell__body">
          <div className="transaction-consent-card">
            <p className="transaction-consent-card__error" role="alert">
              Could not load this consent challenge. Try again from the dashboard or use a valid link.
            </p>
            <Link to={homePath} className="transaction-consent-learn-btn transaction-consent-learn-btn--inline">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell transaction-consent-page">
      <PageNav user={user} onLogout={onLogout} title="High-value transaction" />

      <header className="app-page-shell__hero transaction-consent-page__hero">
        <div className="app-page-shell__hero-top">
          <div>
            <h1 className="app-page-shell__title">Confirm this transaction</h1>
            <p className="app-page-shell__lead">
              Amounts over $500 require your explicit agreement before we process the request. Review the
              details below, then confirm. Consent is bound to this browser session and a one-time server
              challenge.
            </p>
            <p className="transaction-consent-page__learn">
              <button
                type="button"
                className="transaction-consent-learn-btn"
                onClick={() => openEducation(EDU.HUMAN_IN_LOOP, 'what')}
              >
                Learn: Human-in-the-loop for agents
              </button>
            </p>
          </div>
        </div>
      </header>

      <div className="app-page-shell__body">
        <div className="transaction-consent-card">
          <h2 className="transaction-consent-card__h2">Transaction summary</h2>
          <ul className="transaction-consent-card__summary">
            {summaryLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          <div className="transaction-consent-card__legal">
            <p>
              By continuing, you authorize BX Finance to process this one-time transaction for the amount
              and accounts shown. This demo records your consent for audit and education purposes only.
            </p>
          </div>

          <label className="transaction-consent-card__check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>I have reviewed the details and authorize this transaction.</span>
          </label>

          <div className="transaction-consent-card__actions">
            <button
              type="button"
              className="transaction-consent-btn transaction-consent-btn--ghost"
              onClick={handleCancelClick}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="transaction-consent-btn transaction-consent-btn--primary"
              onClick={handleConfirm}
              disabled={!agreed || submitting}
            >
              {submitting ? 'Submitting…' : 'Agree & submit'}
            </button>
          </div>
        </div>
      </div>

      {denialOpen && (
        <div className="transaction-consent-modal-overlay" role="presentation" onClick={handleDenialDismiss}>
          <div
            className="transaction-consent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-denial-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="consent-denial-title" className="transaction-consent-modal__title">
              Transaction not authorized
            </h2>
            <p className="transaction-consent-modal__body">
              You chose not to agree to this high-value transaction. The request is denied and will not be
              processed.
            </p>
            <p className="transaction-consent-modal__body transaction-consent-modal__body--emphasis">
              You will not be able to use the AI banking assistant for this session. To use the assistant
              again, sign out and sign in again.
            </p>
            <div className="transaction-consent-modal__actions">
              <button type="button" className="transaction-consent-btn transaction-consent-btn--ghost" onClick={handleDenialDismiss}>
                Keep reviewing
              </button>
              <button type="button" className="transaction-consent-btn transaction-consent-btn--danger" onClick={handleDenialConfirm}>
                Return to dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
