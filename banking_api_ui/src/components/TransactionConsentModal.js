// banking_api_ui/src/components/TransactionConsentModal.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import bffAxios from '../services/bffAxios';
import { notifyError, notifyWarning } from '../utils/appToast';
import { setAgentBlockedByConsentDecline } from '../services/agentAccessConsent';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import './TransactionConsentPage.css';

/**
 * Popup (modal) for high-value transaction HITL: user checks agreement so the agent may complete the request.
 */
function accountSummaryLine(account) {
  const num = account.accountNumber || 'N/A';
  const type = account.accountType || 'Account';
  const nick = typeof account.name === 'string' && account.name.trim() ? account.name.trim() : '';
  if (nick) return `${nick} · ${type} - ${num}`;
  return `${type} - ${num}`;
}

/**
 * @param {{
 *   open: boolean;
 *   challengeId: string | null;
 *   user: { id?: string } | null;
 *   onClose: () => void;
 *   onTransactionSuccess: (message: string) => void;
 *   onDeclinedConfirmed: () => void;
 * }} props
 */
export default function TransactionConsentModal({
  open,
  challengeId,
  user,
  onClose,
  onTransactionSuccess,
  onDeclinedConfirmed,
}) {
  const { preset } = useIndustryBranding();
  const { open: openEducation } = useEducationUI();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [denialOpen, setDenialOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!open) {
      setAgreed(false);
      setDenialOpen(false);
      setLoadFailed(false);
      setSnapshot(null);
      setAccounts([]);
      setLoading(true);
    }
  }, [open]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || !challengeId || !user) return;
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
  }, [open, user, challengeId]);

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

  const handleCancelClick = () => {
    setDenialOpen(true);
  };

  const handleDenialDismiss = () => {
    setDenialOpen(false);
  };

  const handleDenialConfirm = () => {
    setAgentBlockedByConsentDecline(true);
    setDenialOpen(false);
    onDeclinedConfirmed();
  };

  const handleBackdropPointer = useCallback(
    (e) => {
      if (e.target === e.currentTarget && !submitting) handleCancelClick();
    },
    [submitting]
  );

  const handleConfirm = async () => {
    if (!agreed || submitting || !snapshot || !challengeId || !user?.id) return;
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
      onTransactionSuccess(successMsg);
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

  if (!open || !challengeId) return null;

  return (
    <div
      className="transaction-consent-popup-overlay"
      role="presentation"
      onClick={handleBackdropPointer}
    >
      <div
        className="transaction-consent-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-consent-popup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="transaction-consent-popup-title" className="transaction-consent-popup__title">
          Approve high-value transaction
        </h2>
        <p className="transaction-consent-popup__lead">
          Amounts over $500 require your explicit consent. Review the summary, then confirm if you want the banking
          assistant to complete this transaction on your behalf.
        </p>
        <p className="transaction-consent-popup__learn">
          <button
            type="button"
            className="transaction-consent-learn-btn transaction-consent-learn-btn--dark"
            onClick={() => openEducation(EDU.HUMAN_IN_LOOP, 'what')}
          >
            Learn: Human-in-the-loop
          </button>
        </p>

        {loading && <p className="transaction-consent-card__loading">Loading consent details…</p>}

        {!loading && loadFailed && (
          <div>
            <p className="transaction-consent-card__error" role="alert">
              Could not load this consent challenge. It may have expired.
            </p>
            <button type="button" className="transaction-consent-btn transaction-consent-btn--primary" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {!loading && !loadFailed && snapshot && (
          <>
            <div className="transaction-consent-card transaction-consent-card--in-popup">
              <h3 className="transaction-consent-card__h2">Transaction summary</h3>
              <ul className="transaction-consent-card__summary">
                {summaryLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>

              <div className="transaction-consent-card__legal">
                <p>
                  By continuing, you authorize {preset.shortName} to process this one-time transaction for the amount
                  and accounts shown. This demo records your consent for audit and education purposes only.
                </p>
              </div>

              <label className="transaction-consent-card__check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree to allow the AI banking assistant to complete this transaction on my behalf. I have reviewed
                  the details above.
                </span>
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
          </>
        )}
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
              You chose not to agree to this high-value transaction. The request is denied and will not be processed.
            </p>
            <p className="transaction-consent-modal__body transaction-consent-modal__body--emphasis">
              You will not be able to use the AI banking assistant for this session. To use the assistant again, sign
              out and sign in again.
            </p>
            <div className="transaction-consent-modal__actions">
              <button type="button" className="transaction-consent-btn transaction-consent-btn--ghost" onClick={handleDenialDismiss}>
                Keep reviewing
              </button>
              <button type="button" className="transaction-consent-btn transaction-consent-btn--danger" onClick={handleDenialConfirm}>
                Confirm decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
