import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * Thin navigation bar shown at the top of sub-pages.
 * - "← Back" uses browser history so it returns to wherever the user came from.
 * - "⌂ Home" links directly to the user's dashboard (/admin or /dashboard).
 */
export default function PageNav({ user, onLogout, title }) {
  const navigate = useNavigate();
  const homePath = user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      marginBottom: '1.5rem',
      flexWrap: 'wrap',
    }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.35rem 0.85rem', borderRadius: '6px',
          border: '1px solid #cbd5e1', background: 'white',
          color: '#374151', fontSize: '0.875rem', cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        ← Back
      </button>
      <Link
        to={homePath}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.35rem 0.85rem', borderRadius: '6px',
          border: '1px solid #cbd5e1', background: 'white',
          color: '#374151', fontSize: '0.875rem', textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        ⌂ Home
      </Link>
      {title && (
        <span style={{ marginLeft: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
          / {title}
        </span>
      )}
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.35rem 0.85rem', borderRadius: '6px',
            border: '1px solid #fca5a5', background: '#fff5f5',
            color: '#dc2626', fontSize: '0.875rem', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Log Out
        </button>
      )}
    </nav>
  );
}
