// banking_api_ui/src/components/TransactionConsentModal.js
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import bffAxios from '../services/bffAxios';
import { notifyError, notifyWarning, notifySuccess } from '../utils/appToast';
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
  autoConfirm = false,
  preloadedSnapshot = null,
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

  // OTP step
  const [otpStep, setOtpStep] = useState(false);   // true = show OTP input panel
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);   // false = email failed
  const [otpFallbackCode, setOtpFallbackCode] = useState(null); // plaintext code when email unavailable
  const [otpError, setOtpError] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const otpInputRef = useRef(null);

  const autoConfirmFiredRef = useRef(null);

  useEffect(() => {
    if (!open) {
      autoConfirmFiredRef.current = null;
      setAgreed(false);
      setDenialOpen(false);
      setLoadFailed(false);
      setSnapshot(null);
      setAccounts([]);
      setLoading(true);
      setOtpStep(false);
      setOtpCode('');
      setOtpSent(false);
      setOtpError('');
      setOtpVerifying(false);
      setOtpExpiresAt(null);
    }
  }, [open]);

  useEffect(() => {
    if (otpStep && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [otpStep]);

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
    // If the caller already has the snapshot from the POST response, use it directly
    // and skip the GET challenge fetch — avoids Vercel Lambda session race condition.
    if (preloadedSnapshot) {
      setSnapshot(preloadedSnapshot);
      // Still fetch accounts for display names (non-critical — no challenge fetch needed)
      bffAxios.get('/api/accounts/my')
        .then(r => setAccounts(Array.isArray(r.data?.accounts) ? r.data.accounts : []))
        .catch(() => {/* account names are cosmetic — proceed without them */})
        .finally(() => setLoading(false));
      return;
    }
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
  }, [open, user, challengeId, preloadedSnapshot]);

  // Auto-confirm: when opened via AgentConsentModal (autoConfirm=true), skip the consent
  // step and send the OTP immediately after the challenge snapshot loads.
  useEffect(() => {
    if (
      !autoConfirm ||
      loading ||
      loadFailed ||
      !snapshot ||
      otpStep ||
      submitting ||
      !challengeId ||
      !user?.id ||
      autoConfirmFiredRef.current
    ) return;
    autoConfirmFiredRef.current = true;
    (async () => {
      setSubmitting(true);
      try {
        const { data } = await bffAxios.post(
          `/api/transactions/consent-challenge/${encodeURIComponent(challengeId)}/confirm`
        );
        setOtpSent(data.otpSent !== false);
        setOtpExpiresAt(data.otpExpiresAt);
        if (data.otpSent === false && data.otpCodeFallback) {
          setOtpFallbackCode(data.otpCodeFallback);
        }
        setOtpStep(true);
      } catch (e) {
        const d = e.response?.data;
        notifyError(d?.message || d?.error_description || d?.error || e.message || 'Could not send verification code.');
        onClose();
      } finally {
        setSubmitting(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm, loading, loadFailed, snapshot, otpStep, submitting, challengeId, user?.id]);

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
      if (e.target === e.currentTarget && !submitting && !otpVerifying) handleCancelClick();
    },
    [submitting, otpVerifying] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * Step 1 — user agrees and clicks "Agree & send code".
   * Calls /confirm which generates OTP and sends email.
   */
  const handleConfirm = async () => {
    if (!agreed || submitting || !snapshot || !challengeId || !user?.id) return;
    setSubmitting(true);
    try {
      const { data } = await bffAxios.post(
        `/api/transactions/consent-challenge/${encodeURIComponent(challengeId)}/confirm`
      );
      setOtpSent(data.otpSent !== false);
      setOtpExpiresAt(data.otpExpiresAt);
      if (data.otpSent === false && data.otpCodeFallback) {
        setOtpFallbackCode(data.otpCodeFallback);
      }
      setOtpStep(true);
    } catch (e) {
      const d = e.response?.data;
      notifyError(d?.message || d?.error_description || d?.error || e.message || 'Could not send verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Step 2 — user submits the 6-digit OTP.
   * Calls /verify-otp, then POSTs the actual transaction on success.
   */
  const handleVerifyOtp = async () => {
    if (!otpCode || otpVerifying || !challengeId || !user?.id || !snapshot) return;
    setOtpError('');
    setOtpVerifying(true);
    try {
      // Verify OTP
      await bffAxios.post(
        `/api/transactions/consent-challenge/${encodeURIComponent(challengeId)}/verify-otp`,
        { otpCode }
      );
      // Execute transaction
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
      notifySuccess('✅ Transaction verified and completed.');
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
        return;
      }
      if (d?.error === 'otp_locked') {
        notifyError('Too many incorrect attempts. The verification has been locked — please start the transaction again.');
        onClose();
        return;
      }
      if (d?.error === 'otp_expired') {
        notifyError('Verification code expired. Please start the transaction again.');
        onClose();
        return;
      }
      // For otp_incorrect show inline error with remaining attempts
      const inline = d?.error === 'otp_incorrect';
      if (inline) {
        setOtpError(d.message || 'Incorrect code. Try again.');
        setOtpCode('');
        otpInputRef.current?.focus();
      } else {
        notifyError(d?.message || d?.error_description || d?.error || e.message || 'Request failed.');
      }
    } finally {
      setOtpVerifying(false);
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
          {otpStep ? '🔒 Enter verification code' : 'Approve high-value transaction'}
        </h2>

        {/* ── OTP step ──────────────────────────────────────────────────── */}
        {otpStep ? (
          <div className="tx-otp-panel">
            {otpSent ? (
              <p className="tx-otp-panel__lead">
                A 6-digit verification code was sent to your email address via PingOne. Enter it below to authorise this transaction.
              </p>
            ) : otpFallbackCode ? (
              <div className="tx-otp-panel__lead tx-otp-panel__lead--warn">
                <p style={{ margin: '0 0 0.5rem' }}>⚠️ Email delivery unavailable (PingOne Notifications not configured).</p>
                <p style={{ margin: '0 0 0.5rem' }}>Your verification code is:</p>
                <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '0.25em', fontVariantNumeric: 'tabular-nums', color: '#0369a1', background: '#f0f9ff', border: '2px solid #0ea5e9', borderRadius: 8, padding: '0.5rem 1rem', display: 'inline-block', marginBottom: '0.5rem' }}>
                  {otpFallbackCode}
                </div>
              </div>
            ) : (
              <p className="tx-otp-panel__lead tx-otp-panel__lead--warn">
                ⚠️ Email delivery unavailable. Check server logs for the OTP code.
              </p>
            )}

            <div className="tx-otp-panel__summary">
              {summaryLines.map((line, i) => <span key={i} className="tx-otp-panel__summary-line">{line}</span>)}
            </div>

            <div className="tx-otp-panel__input-row">
              <input
                ref={otpInputRef}
                className={`tx-otp-panel__input${otpError ? ' tx-otp-panel__input--error' : ''}`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => {
                  setOtpError('');
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && otpCode.length === 6) handleVerifyOtp();
                }}
                disabled={otpVerifying}
                aria-label="6-digit verification code"
              />
              <button
                type="button"
                className="transaction-consent-btn transaction-consent-btn--primary tx-otp-panel__verify-btn"
                onClick={handleVerifyOtp}
                disabled={otpCode.length !== 6 || otpVerifying}
              >
                {otpVerifying ? 'Verifying…' : 'Confirm'}
              </button>
            </div>

            {otpError && <p className="tx-otp-panel__error" role="alert">{otpError}</p>}

            {otpExpiresAt && (
              <p className="tx-otp-panel__expiry">
                Code expires at {new Date(otpExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            <button
              type="button"
              className="tx-otp-panel__back-btn"
              onClick={() => { setOtpStep(false); setOtpCode(''); setOtpError(''); }}
              disabled={otpVerifying}
            >
              ← Back
            </button>
          </div>
        ) : (
          <>
            {/* ── Consent step ──────────────────────────────────────────── */}
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
                    and accounts shown. A one-time verification code will be sent to your email.
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
                    {submitting ? 'Sending code…' : 'Agree & send code'}
                  </button>
                </div>
              </div>
            )}
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
