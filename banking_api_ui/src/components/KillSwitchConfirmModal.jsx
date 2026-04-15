/**
 * KillSwitchConfirmModal.jsx
 *
 * Confirmation dialog for kill switch (prevents accidents)
 */

import React, { useState } from 'react';
import './KillSwitchConfirmModal.css';

/**
 * KillSwitchConfirmModal Component
 * @param {boolean} isOpen - Is modal visible?
 * @param {string} agentId - ID of agent to kill
 * @param {Function} onConfirm - Called with (agentId, reason) on confirm
 * @param {Function} onCancel - Called on cancel
 */
export default function KillSwitchConfirmModal({ isOpen, agentId, onConfirm, onCancel }) {
  const [selectedReason, setSelectedReason] = useState('misbehaving');
  const [customReason, setCustomReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const reason = selectedReason === 'other' 
        ? customReason || 'Custom reason'
        : selectedReason.split('_').join(' ').replace(/\b\w/g, l => l.toUpperCase());
      
      if (onConfirm) {
        await onConfirm(agentId, reason);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedReason('misbehaving');
    setCustomReason('');
    if (onCancel) onCancel();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') handleCancel();
    if (e.key === 'Enter') handleConfirm();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="modal-backdrop" onClick={handleCancel} />

      {/* Modal Content */}
      <div className="modal-content" role="alertdialog" aria-modal="true">
        <div className="modal-warning">
          <span className="modal-warning-icon">⚠️</span>
        </div>

        <h2 className="modal-heading">STOP AGENT — Are you sure?</h2>

        <p className="modal-description">
          This will immediately revoke the agent's OAuth token and freeze its state for forensics.
          The agent cannot make any further API calls. This action <strong>cannot be undone</strong>.
        </p>

        {/* Reason Dropdown */}
        <div className="modal-field">
          <label htmlFor="kill-reason" className="modal-label">
            Reason for stopping:
          </label>
          <select
            id="kill-reason"
            className="modal-dropdown"
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            disabled={isLoading}
          >
            <option value="misbehaving">Misbehaving (unexpected behavior)</option>
            <option value="rate_limit">Rate limit violations</option>
            <option value="suspicious">Suspicious activity detected</option>
            <option value="manual_safety">Manual safety check</option>
            <option value="other">Other (specify below)</option>
          </select>
        </div>

        {/* Custom Reason Text */}
        {selectedReason === 'other' && (
          <div className="modal-field">
            <input
              type="text"
              className="modal-text-input"
              placeholder="Describe reason..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              disabled={isLoading}
              maxLength="200"
            />
          </div>
        )}

        {/* Button Row */}
        <div className="modal-button-row">
          <button
            className="modal-cancel-button"
            onClick={handleCancel}
            disabled={isLoading}
            onKeyDown={handleKeyDown}
          >
            Cancel
          </button>
          <button
            className="modal-confirm-button"
            onClick={handleConfirm}
            disabled={isLoading}
            onKeyDown={handleKeyDown}
          >
            {isLoading ? 'Stopping...' : 'Confirm STOP Agent'}
          </button>
        </div>

        {/* Warning Note */}
        <div className="modal-warning-note">
          <strong>⚡ This is permanent.</strong> Stopping this agent will immediately revoke all tokens
          and prevent any further operations. Audit trail will be preserved for investigation.
        </div>
      </div>
    </>
  );
}
