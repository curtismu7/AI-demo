// banking_api_ui/src/components/QuickLoginModal.js
/**
 * QuickLoginModal — lightweight overlay shown when a protected route
 * (/accounts, /transactions, /users) is hit while the visitor is not logged in.
 *
 * Provides a PingOne Customer Sign In button. No content is fetched until logged in.
 * Pass onClose to dismiss without navigating (e.g. when user is cookie-restored).
 */
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthButton from './AuthButton';
import { navigateToCustomerOAuthLogin, navigateToAdminOAuthLogin } from '../utils/authUi';

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 20000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const MODAL_STYLE = {
  background: '#ffffff',
  borderRadius: '12px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
  padding: '40px 36px 32px',
  maxWidth: '420px',
  width: '90vw',
  textAlign: 'center',
  position: 'relative',
};

const ICON_STYLE = {
  fontSize: '2.5rem',
  marginBottom: '12px',
};

const TITLE_STYLE = {
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 8px',
};

const SUBTITLE_STYLE = {
  fontSize: '0.9rem',
  color: '#374151',
  margin: '0 0 28px',
  lineHeight: 1.5,
};


const CLOSE_STYLE = {
  position: 'absolute',
  top: '12px',
  right: '14px',
  background: 'none',
  border: 'none',
  fontSize: '1.4rem',
  color: '#374151',
  cursor: 'pointer',
  lineHeight: 1,
};

/** Page label used in the modal copy */
const PAGE_LABELS = {
  '/accounts': 'accounts',
  '/transactions': 'recent transactions',
  '/users': 'user management',
};

export default function QuickLoginModal({ pathname, onClose }) {
  const navigate = useNavigate();
  const label = PAGE_LABELS[pathname] || 'this page';

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      navigate('/', { replace: true });
    }
  }, [onClose, navigate]);

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const handleCustomerLogin = () => {
    try { sessionStorage.setItem('post_login_redirect', pathname); } catch {}
    navigateToCustomerOAuthLogin();
  };

  const handleAdminLogin = () => {
    try { sessionStorage.setItem('post_login_redirect', pathname); } catch {}
    navigateToAdminOAuthLogin();
  };

  return (
    <div style={OVERLAY_STYLE} role="dialog" aria-modal="true" aria-label="Sign in required">
      <div style={MODAL_STYLE}>
        <button type="button" style={CLOSE_STYLE} onClick={handleClose} aria-label="Close">×</button>
        <div style={ICON_STYLE}>&#128272;</div>
        <h2 style={TITLE_STYLE}>Sign in to continue</h2>
        <p style={SUBTITLE_STYLE}>
          You need to sign in with PingOne to view your {label}.
        </p>
        <AuthButton variant="customer" onClick={handleCustomerLogin}>
          Customer Sign In
        </AuthButton>
        <AuthButton variant="admin" onClick={handleAdminLogin}>
          Admin Sign In
        </AuthButton>
        <AuthButton variant="ghost" onClick={handleClose}>
          Back to Home
        </AuthButton>
      </div>
    </div>
  );
}
