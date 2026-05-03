// ConfirmModal.js — generic yes/no confirmation dialog (replaces window.confirm)
import React from 'react';
import './KillSwitchConfirmModal.css'; // reuse existing modal backdrop + content styles

/**
 * @param {boolean}   isOpen
 * @param {string}    title
 * @param {string}    message
 * @param {string}    [confirmLabel]  default "Confirm"
 * @param {string}    [cancelLabel]   default "Cancel"
 * @param {string}    [danger]        if true, confirm button is red
 * @param {Function}  onConfirm
 * @param {Function}  onCancel
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onCancel?.();
    if (e.key === 'Enter') onConfirm?.();
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div
        className="modal-content"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <h2 id="confirm-modal-title" className="modal-heading" style={danger ? undefined : { color: '#1e293b' }}>
          {title}
        </h2>
        <p className="modal-description">{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <button type="button" className="modal-cancel-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="modal-confirm-button"
            style={danger ? undefined : { background: '#2563eb', borderColor: '#1d4ed8' }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
