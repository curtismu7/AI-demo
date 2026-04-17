/**
 * ErrorModal
 * Full-screen modal dialog for critical security errors
 * Displays what/why/teaching/how-to-fix with optional token details
 */

import React, { useState } from 'react';
import './ErrorModal.css';

export default function ErrorModal({ error, isOpen, onClose }) {
  const [showTokenDetails, setShowTokenDetails] = useState(false);

  if (!isOpen || !error) return null;

  const details = error.details || error;
  const icon = error.severity === 'critical' ? '❌' : '⚠️';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="error-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="error-modal__header">
          <span className="error-modal__icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="error-modal__title">
            {error.error_code || 'Authorization Failed'}
          </h2>
          <button
            className="error-modal__close"
            onClick={onClose}
            aria-label="Close error modal"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="error-modal__body">
          <section className="error-section">
            <h3>What happened</h3>
            <p>{details.what_failed || details.message || 'An error occurred'}</p>
          </section>

          {details.why && (
            <section className="error-section">
              <h3>Why this matters</h3>
              <p>{details.why}</p>
            </section>
          )}

          {details.teaching && (
            <section className="error-section">
              <h3>Teaching moment</h3>
              <p>{details.teaching}</p>
            </section>
          )}

          <section className="error-section">
            <h3>How to fix it</h3>
            <p>{details.fix || 'Contact your system administrator for assistance.'}</p>
          </section>

          {/* Optional: Token Details */}
          {details.tokens_involved && Object.keys(details.tokens_involved).length > 0 && (
            <section className="error-section">
              <button
                className="error-modal__toggle"
                onClick={() => setShowTokenDetails(!showTokenDetails)}
                aria-expanded={showTokenDetails}
                type="button"
              >
                {showTokenDetails ? '▼' : '▶'} Token details
              </button>
              {showTokenDetails && (
                <pre className="error-modal__code">
                  {JSON.stringify(details.tokens_involved, null, 2)}
                </pre>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="error-modal__footer">
          {details.doc_link && (
            <a
              href={details.doc_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Learn more
            </a>
          )}
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Close
          </button>
          <a href="mailto:support@bank.com" className="btn btn-secondary">
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
