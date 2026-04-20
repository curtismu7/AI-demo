// banking_api_ui/src/components/QuickLoginModal.js
/**
 * QuickLoginModal — lightweight overlay shown when a protected route
 * (/accounts, /transactions, /users) is hit while the visitor is not logged in.
 *
 * Provides a PingOne Customer Sign In button. No content is fetched until logged in.
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
  color: '#64748b',
  margin: '0 0 28px',
  lineHeight: 1.5,
};

const BTN_PRIMARY_STYLE = {
  display: 'block',
  width: '100%',
  padding: '12px 20px',
  background: '#004687',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
  marginBottom: '12px',
};

const BTN_GHOST_STYLE = {
  display: 'block',
  width: '100%',
  padding: '10px 20px',
  background: 'transparent',
  color: '#64748b',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
};

const CLOSE_STYLE = {
  position: 'absolute',
  top: '12px',
  right: '14px',
  background: 'none',
  border: 'none',
  fontSize: '1.4rem',
  color: '#94a3b8',
  cursor: 'pointer',
  lineHeight: 1,
};

/** Page label used in the modal copy */
const PAGE_LABELS = {
  '/accounts': 'accounts',
  '/transactions': 'recent transactions',
  '/users': 'user management',
};

export default function QuickLoginModal({ pathname }) {
  const navigate = useNavigate();
  const label = PAGE_LABELS[pathname] || 'this page';

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') navigate('/', { replace: true });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const handleCustomerLogin = () => {
    // Save intended destination; restore after OAuth callback
    try {
      sessionStorage.setItem('post_login_redirect', pathname);
    } catch {}
    window.location.href = '/api/auth/oauth/user/login';
  };

  const handleAdminLogin = () => {
    try {
      sessionStorage.setItem('post_login_redirect', pathname);
    } catch {}
    window.location.href = '/api/auth/oauth/login';
  };

  return (
    <div style={OVERLAY_STYLE} role="dialog" aria-modal="true" aria-label="Sign in required">
      <div style={MODAL_STYLE}>
        <button style={CLOSE_STYLE} onClick={() => navigate('/', { replace: true })} aria-label="Close">×</button>
        <div style={ICON_STYLE}>🔐</div>
        <h2 style={TITLE_STYLE}>Sign in to continue</h2>
        <p style={SUBTITLE_STYLE}>
          You need to sign in with PingOne to view your {label}.
        </p>
        <button style={BTN_PRIMARY_STYLE} onClick={handleCustomerLogin}>
          Customer Sign In
        </button>
        <button style={{ ...BTN_PRIMARY_STYLE, background: '#b91c1c', marginBottom: '12px' }} onClick={handleAdminLogin}>
          Admin Sign In
        </button>
        <button style={BTN_GHOST_STYLE} onClick={() => navigate('/', { replace: true })}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
