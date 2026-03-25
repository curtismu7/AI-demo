import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/appShellPages.css';

/**
 * Thin navigation bar for admin sub-pages: Back (history), Home, optional breadcrumb, Log out.
 */
export default function PageNav({ user, onLogout, title }) {
  const navigate = useNavigate();
  const homePath = user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <nav className="page-nav app-page-toolbar" aria-label="Page navigation">
      <button
        type="button"
        className="app-page-toolbar-btn"
        onClick={() => navigate(-1)}
      >
        ← Back
      </button>
      <Link to={homePath} className="app-page-toolbar-btn">
        ⌂ Home
      </Link>
      {title && (
        <span className="page-nav__trail">
          / {title}
        </span>
      )}
      {onLogout && (
        <>
          <span className="page-nav__spacer" aria-hidden="true" />
          <button
            type="button"
            className="app-page-toolbar-btn app-page-toolbar-btn--danger"
            onClick={onLogout}
          >
            Log Out
          </button>
        </>
      )}
    </nav>
  );
}
